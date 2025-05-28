const Session = require('../models/Session');
const whatsappClient = require('../services/whatsappClient');
const socketService = require('../services/socketService');
const logger = require('../utils/logger');
const whatsAppSocketBridge = require('../services/whatsAppSocketBridge');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// Cache en memoria para evitar verificaciones excesivas
const sessionStatusCache = new Map();
const CACHE_TTL = 30000; // 30 segundos

// Obtener todas las sesiones del usuario autenticado
exports.getAllSessions = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  const sessions = await Session.find({ userId })
    .select('-__v')
    .sort({ lastConnection: -1, createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: sessions.length,
    data: sessions
  });
});

// Obtener una sesión por ID - SIN verificación automática
exports.getSessionById = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  const session = await Session.findOne({ 
    sessionId, 
    userId: req.user.id 
  }).select('-__v');
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  // Solo devolver el estado guardado, sin verificaciones automáticas
  res.status(200).json({
    success: true,
    data: session
  });
});

// Crear una nueva sesión
exports.createSession = asyncHandler(async (req, res, next) => {
  const { sessionId, name, description } = req.body;
  const userId = req.user.id;
  
  if (!sessionId) {
    return next(new ErrorResponse('El ID de sesión es requerido', 400));
  }
  
  const existingSession = await Session.findOne({ sessionId });
  if (existingSession) {
    return next(new ErrorResponse('Ya existe una sesión con este ID', 400));
  }
  
  const session = await Session.create({
    sessionId,
    name: name || `Sesión ${sessionId}`,
    description,
    userId,
    status: 'initializing'
  });
  
  try {
    const initResult = await whatsappClient.initializeSession(sessionId);
    
    session.status = 'qr_ready';
    session.lastQRTimestamp = new Date();
    await session.save();
    
    whatsAppSocketBridge.subscribeToSession(sessionId);
    socketService.startQRPolling(sessionId);
    
    res.status(201).json({
      success: true,
      data: session,
      serviceResponse: initResult
    });
  } catch (initError) {
    session.status = 'failed';
    session.failureReason = initError.message;
    await session.save();
    
    logger.error(`Error al inicializar sesión ${sessionId}: ${initError.message}`);
    
    return next(new ErrorResponse(`Error al inicializar sesión: ${initError.message}`, 500));
  }
});

// Actualizar una sesión
exports.updateSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const { name, description, webhookUrl, filters } = req.body;
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  // Actualizar campos
  if (name !== undefined) session.name = name;
  if (description !== undefined) session.description = description;
  if (webhookUrl !== undefined) session.webhookUrl = webhookUrl;
  
  // Actualizar filtros si se proporcionan
  if (filters) {
    if (filters.ignoreBroadcast !== undefined) session.filters.ignoreBroadcast = filters.ignoreBroadcast;
    if (filters.ignoreGroups !== undefined) session.filters.ignoreGroups = filters.ignoreGroups;
    if (filters.ignoreNonGroups !== undefined) session.filters.ignoreNonGroups = filters.ignoreNonGroups;
    if (filters.allowedGroups !== undefined) session.filters.allowedGroups = filters.allowedGroups;
    if (filters.allowedContacts !== undefined) session.filters.allowedContacts = filters.allowedContacts;
  }
  
  await session.save();
  
  res.status(200).json({
    success: true,
    data: session
  });
});

// Eliminar una sesión
exports.deleteSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  // Desconectar la sesión del servicio WhatsApp
  try {
    await whatsappClient.disconnectSession(sessionId);
  } catch (disconnectError) {
    logger.warn(`Error al desconectar sesión ${sessionId}: ${disconnectError.message}`);
  }
  
  // Desuscribir del puente de sockets
  whatsAppSocketBridge.unsubscribeFromSession(sessionId);
  
  // Detener polling de QR
  socketService.stopQRPolling(sessionId);
  
  // Eliminar de la base de datos
  await Session.deleteOne({ sessionId });
  
  // Notificar a clientes
  socketService.emitToSession(sessionId, 'session_deleted', { sessionId });
  
  res.status(200).json({
    success: true,
    message: `Sesión ${sessionId} eliminada correctamente`
  });
});

// Obtener o crear una sesión para el usuario actual - MEJORADO
exports.getOrCreateSession = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  // Buscar sesiones del usuario ordenadas por actividad reciente
  const sessions = await Session.find({ userId })
    .sort({ lastConnection: -1, lastQRTimestamp: -1, createdAt: -1 });
  
  // 🔍 Validar sesiones con lógica más tolerante
  for (const session of sessions) {
    // ✅ CAMBIO CRÍTICO: Ser más generoso con sesiones conectadas recientes
    if (session.isConnected && session.lastConnection) {
      const timeSinceConnection = Date.now() - new Date(session.lastConnection).getTime();
      const fifteenMinutes = 15 * 60 * 1000; // Aumentado de 10 a 15 minutos
      
      if (timeSinceConnection < fifteenMinutes) {
        logger.info(`✅ Reutilizando sesión conectada reciente: ${session.sessionId}`);
        
        // NO validar contra el servicio si es muy reciente
        whatsAppSocketBridge.subscribeToSession(session.sessionId);
        
        return res.status(200).json({
          success: true,
          data: session,
          isExisting: true,
          message: 'Sesión activa reutilizada (sin verificación)'
        });
      }
    }
    
    // ✅ CAMBIO CRÍTICO: Ser más generoso con QR recientes
    if (session.status === 'qr_ready' && session.lastQRTimestamp) {
      const timeSinceQR = Date.now() - new Date(session.lastQRTimestamp).getTime();
      const tenMinutes = 10 * 60 * 1000; // Aumentado de 5 a 10 minutos
      
      if (timeSinceQR < tenMinutes) {
        logger.info(`📱 Reutilizando sesión con QR reciente: ${session.sessionId}`);
        
        // NO validar contra el servicio si el QR es reciente
        whatsAppSocketBridge.subscribeToSession(session.sessionId);
        socketService.startQRPolling(session.sessionId);
        
        return res.status(200).json({
          success: true,
          data: session,
          isExisting: true,
          message: 'Sesión con QR válido reutilizada'
        });
      }
    }
    
    // 🔍 SOLO validar sesiones más antiguas con timeout más alto
    if (session.isConnected || session.status === 'qr_ready') {
      logger.info(`🔍 Validando sesión más antigua: ${session.sessionId}`);
      
      try {
        const serviceStatus = await Promise.race([
          whatsappClient.getSessionStatus(session.sessionId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 8000) // Aumentado de 3 a 8 segundos
          )
        ]);
        
        if (serviceStatus && serviceStatus.exists) {
          logger.info(`✅ Sesión ${session.sessionId} confirmada - reutilizando`);
          
          // Actualizar estado si es diferente
          if (session.isConnected !== serviceStatus.isConnected) {
            session.isConnected = serviceStatus.isConnected;
            session.isListening = serviceStatus.isListening || false;
            session.status = serviceStatus.isConnected ? 'connected' : session.status;
            await session.save();
          }
          
          whatsAppSocketBridge.subscribeToSession(session.sessionId);
          
          if (session.status === 'qr_ready') {
            socketService.startQRPolling(session.sessionId);
          }
          
          return res.status(200).json({
            success: true,
            data: session,
            isExisting: true,
            message: 'Sesión validada y reutilizada'
          });
        } else {
          logger.warn(`❌ Sesión ${session.sessionId} NO existe en servicio`);
          
          // Marcar como desconectada PERO continuar buscando
          session.status = 'disconnected';
          session.isConnected = false;
          session.isListening = false;
          session.lastDisconnection = new Date();
          await session.save();
          
          continue; // Continuar con la siguiente sesión
        }
      } catch (statusError) {
        logger.warn(`⚠️ Error/timeout al validar sesión ${session.sessionId}: ${statusError.message}`);
        
        // ✅ CAMBIO CRÍTICO: En caso de timeout, NO marcar como fallida inmediatamente
        // Si es una sesión muy reciente, dar beneficio de la duda
        if (session.lastConnection || session.lastQRTimestamp) {
          const lastActivity = Math.max(
            session.lastConnection ? new Date(session.lastConnection).getTime() : 0,
            session.lastQRTimestamp ? new Date(session.lastQRTimestamp).getTime() : 0
          );
          
          const timeSinceActivity = Date.now() - lastActivity;
          const twoMinutes = 2 * 60 * 1000;
          
          if (timeSinceActivity < twoMinutes) {
            logger.info(`🎯 Timeout en sesión reciente ${session.sessionId} - asumiendo que está ocupada, reutilizando`);
            
            whatsAppSocketBridge.subscribeToSession(session.sessionId);
            
            if (session.status === 'qr_ready') {
              socketService.startQRPolling(session.sessionId);
            }
            
            return res.status(200).json({
              success: true,
              data: session,
              isExisting: true,
              message: 'Sesión reutilizada (servicio ocupado)'
            });
          }
        }
        
        // Para sesiones más antiguas, marcar como problemática y continuar
        session.status = 'disconnected';
        session.isConnected = false;
        await session.save();
        continue;
      }
    }
  }
  
  // 🆕 Solo crear nueva sesión si NO hay sesiones recientes válidas
  logger.info(`🆕 Creando nueva sesión para usuario ${userId}`);
  
  const sessionId = `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  const session = await Session.create({
    sessionId,
    name: `Sesión de ${req.user.name || 'Usuario'}`,
    userId,
    status: 'initializing'
  });
  
  try {
    logger.info(`🚀 Inicializando nueva sesión: ${sessionId}`);
    const initResult = await whatsappClient.initializeSession(sessionId);
    
    session.status = 'qr_ready';
    session.lastQRTimestamp = new Date();
    await session.save();
    
    whatsAppSocketBridge.subscribeToSession(sessionId);
    socketService.startQRPolling(sessionId);
    
    logger.info(`✅ Nueva sesión ${sessionId} creada exitosamente`);
    
    res.status(201).json({
      success: true,
      data: session,
      isExisting: false,
      message: 'Nueva sesión creada exitosamente',
      serviceResponse: initResult
    });
  } catch (initError) {
    logger.error(`❌ Error al inicializar nueva sesión ${sessionId}: ${initError.message}`);
    
    session.status = 'failed';
    session.failureReason = initError.message;
    await session.save();
    
    return next(new ErrorResponse(`Error al inicializar sesión: ${initError.message}`, 500));
  }
});

// 🛠️ ARREGLO del middleware de detección - Más tolerante
exports.detectDisconnectedSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  // Solo aplicar a rutas específicas que requieren sesión activa
  const requiresActiveSession = req.path.includes('/chats') || 
                                req.path.includes('/start-listening') ||
                                req.path.includes('/stop-listening');
  
  if (!requiresActiveSession) {
    return next();
  }
  
  // Verificar cache primero
  const cacheKey = `status_${sessionId}`;
  const cachedStatus = sessionStatusCache.get(cacheKey);
  
  if (cachedStatus && (Date.now() - cachedStatus.timestamp) < CACHE_TTL) {
    logger.debug(`Usando estado cached para sesión ${sessionId}`);
    if (cachedStatus.isValid) {
      return next();
    } else {
      return next(new ErrorResponse('Sesión no válida (cached)', 400));
    }
  }
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next();
  }
  
  // ✅ CAMBIO CRÍTICO: Ser mucho más generoso con sesiones recientes
  if (session.isConnected && session.lastConnection) {
    const timeSinceLastConnection = Date.now() - new Date(session.lastConnection).getTime();
    const twentyMinutes = 20 * 60 * 1000; // Aumentado de 5 a 20 minutos
    
    if (timeSinceLastConnection < twentyMinutes) {
      // Actualizar cache como válida
      sessionStatusCache.set(cacheKey, {
        timestamp: Date.now(),
        isValid: true
      });
      
      return next();
    }
  }
  
  // Si tiene QR muy reciente, también asumir que está bien
  if (session.status === 'qr_ready' && session.lastQRTimestamp) {
    const timeSinceQR = Date.now() - new Date(session.lastQRTimestamp).getTime();
    const fifteenMinutes = 15 * 60 * 1000; // Aumentado de 5 a 15 minutos
    
    if (timeSinceQR < fifteenMinutes) {
      sessionStatusCache.set(cacheKey, {
        timestamp: Date.now(),
        isValid: true
      });
      
      return next();
    }
  }
  
  // ✅ CAMBIO CRÍTICO: Solo verificar si la sesión es realmente antigua
  try {
    const statusCheck = await Promise.race([
      whatsappClient.getSessionStatus(sessionId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000) // Aumentado timeout
      )
    ]);
    
    if (statusCheck && statusCheck.exists) {
      // Actualizar estado si es diferente
      if (!session.isConnected && statusCheck.isConnected) {
        session.isConnected = true;
        session.status = 'connected';
        session.lastConnection = new Date();
        await session.save();
      }
      
      // Actualizar cache como válida
      sessionStatusCache.set(cacheKey, {
        timestamp: Date.now(),
        isValid: true
      });
      
      return next();
    } else {
      // Sesión no válida
      sessionStatusCache.set(cacheKey, {
        timestamp: Date.now(),
        isValid: false
      });
      
      return next(new ErrorResponse('Sesión desconectada, por favor reinicie', 400));
    }
  } catch (statusError) {
    logger.debug(`Error al verificar estado de ${sessionId}: ${statusError.message}`);
    
    // ✅ CAMBIO CRÍTICO: En caso de error, ser muy generoso con sesiones recientes
    if (session.isConnected && session.lastConnection) {
      const timeSinceConnection = Date.now() - new Date(session.lastConnection).getTime();
      const thirtyMinutes = 30 * 60 * 1000; // Muy generoso: 30 minutos
      
      if (timeSinceConnection < thirtyMinutes) {
        // Dar beneficio de la duda a sesiones muy recientes
        sessionStatusCache.set(cacheKey, {
          timestamp: Date.now(),
          isValid: true
        });
        
        return next();
      }
    }
    
    // Si tiene QR reciente, también dar beneficio de la duda
    if (session.status === 'qr_ready' && session.lastQRTimestamp) {
      const timeSinceQR = Date.now() - new Date(session.lastQRTimestamp).getTime();
      const twentyMinutes = 20 * 60 * 1000;
      
      if (timeSinceQR < twentyMinutes) {
        sessionStatusCache.set(cacheKey, {
          timestamp: Date.now(),
          isValid: true
        });
        
        return next();
      }
    }
    
    // En caso contrario, marcar como no válida
    sessionStatusCache.set(cacheKey, {
      timestamp: Date.now(),
      isValid: false
    });
    
    return next(new ErrorResponse('Error de conectividad, verifique la sesión', 400));
  }
});

// 🛠️ NUEVO: Endpoint para limpiar sesiones huérfanas (sesiones en BD pero no en servicio)
exports.cleanupOrphanedSessions = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  try {
    logger.info(`🧹 Iniciando limpieza de sesiones huérfanas para usuario ${userId}`);
    
    const sessions = await Session.find({ userId });
    let cleanedCount = 0;
    
    for (const session of sessions) {
      try {
        // Verificar si existe en el servicio
        const serviceStatus = await Promise.race([
          whatsappClient.getSessionStatus(session.sessionId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 2000)
          )
        ]);
        
        if (!serviceStatus || !serviceStatus.exists) {
          // No existe en el servicio, marcar como desconectada
          session.status = 'disconnected';
          session.isConnected = false;
          session.isListening = false;
          session.lastDisconnection = new Date();
          await session.save();
          
          // Desuscribir del puente
          whatsAppSocketBridge.unsubscribeFromSession(session.sessionId);
          
          cleanedCount++;
          logger.info(`🧹 Sesión huérfana limpiada: ${session.sessionId}`);
        }
      } catch (error) {
        // Si hay error, asumir que no existe y limpiar
        session.status = 'disconnected';
        session.isConnected = false;
        session.isListening = false;
        await session.save();
        
        whatsAppSocketBridge.unsubscribeFromSession(session.sessionId);
        cleanedCount++;
        
        logger.debug(`🧹 Sesión con error limpiada: ${session.sessionId}`);
      }
    }
    
    logger.info(`✅ Limpieza completada: ${cleanedCount} sesiones huérfanas encontradas`);
    
    res.status(200).json({
      success: true,
      message: `Limpieza completada: ${cleanedCount} sesiones sincronizadas`,
      cleanedCount
    });
    
  } catch (error) {
    logger.error(`❌ Error durante limpieza de sesiones huérfanas:`, {
      errorMessage: error.message
    });
    
    return next(new ErrorResponse('Error durante la limpieza de sesiones', 500));
  }
});


// Método helper mejorado para reinicialización segura
exports.safeReinitializeSession = async function(session) {
  try {
    logger.info(`Reinicializando sesión ${session.sessionId} de forma segura`);
    
    // Marcar como reinicializando
    session.status = 'initializing';
    session.isConnected = false;
    session.isListening = false;
    await session.save();
    
    // Limpiar suscripciones anteriores
    try {
      whatsAppSocketBridge.unsubscribeFromSession(session.sessionId);
      socketService.stopQRPolling(session.sessionId);
    } catch (cleanupError) {
      logger.debug(`Error en limpieza (no crítico): ${cleanupError.message}`);
    }
    
    // Intentar limpiar la sesión del servicio (sin fallar si ya no existe)
    try {
      await whatsappClient.disconnectSession(session.sessionId);
    } catch (disconnectError) {
      logger.debug(`Error al desconectar (esperado): ${disconnectError.message}`);
    }
    
    // Esperar brevemente
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reinicializar
    const initResult = await whatsappClient.initializeSession(session.sessionId);
    
    // Actualizar estado
    session.status = 'qr_ready';
    session.lastQRTimestamp = new Date();
    await session.save();
    
    // Reanudar suscripciones
    whatsAppSocketBridge.subscribeToSession(session.sessionId);
    socketService.startQRPolling(session.sessionId);
    
    logger.info(`Sesión ${session.sessionId} reinicializada exitosamente`);
    
    return initResult;
    
  } catch (error) {
    logger.error(`Error al reinicializar sesión ${session.sessionId}:`, {
      errorMessage: error.message
    });
    
    session.status = 'failed';
    session.failureReason = error.message;
    await session.save();
    
    throw error;
  }
};

// Iniciar escucha - Mejorado
exports.startListening = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  // Verificar si está conectada
  if (!session.isConnected) {
    return next(new ErrorResponse('La sesión debe estar conectada para iniciar la escucha', 400));
  }
  
  try {
    // Iniciar escucha en el servicio
    const result = await whatsappClient.startListening(sessionId);
    
    // Actualizar estado
    session.isListening = true;
    await session.save();
    
    // Notificar a clientes
    socketService.emitToSession(sessionId, 'listening_status', {
      sessionId,
      isListening: true
    });
    
    res.status(200).json({
      success: true,
      data: {
        sessionId,
        isListening: true,
        result
      }
    });
  } catch (error) {
    logger.error(`Error al iniciar escucha para ${sessionId}:`, {
      errorMessage: error.message,
      status: error.response?.status
    });
    
    // Si la sesión no existe en el servicio, marcar como desconectada
    if (error.message.includes('no encontrada') || 
        error.message.includes('not found') ||
        error.response?.status === 404) {
      
      logger.warn(`Sesión ${sessionId} no existe en servicio, actualizando estado`);
      
      session.status = 'disconnected';
      session.isConnected = false;
      session.isListening = false;
      await session.save();
      
      socketService.emitSessionStatus(sessionId, 'disconnected', {
        reason: 'session_not_found',
        disconnectedAt: Date.now()
      });
      
      return next(new ErrorResponse('La sesión se ha desconectado. Reinicie la sesión para generar un nuevo código QR.', 400));
    }
    
    return next(new ErrorResponse(`Error al iniciar escucha: ${error.message}`, 500));
  }
});

// Detener escucha
exports.stopListening = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  // Detener escucha en el servicio
  const result = await whatsappClient.stopListening(sessionId);
  
  // Actualizar estado
  session.isListening = false;
  await session.save();
  
  // Notificar a clientes
  socketService.emitToSession(sessionId, 'listening_status', {
    sessionId,
    isListening: false
  });
  
  res.status(200).json({
    success: true,
    data: {
      sessionId,
      isListening: false,
      result
    }
  });
});

// Obtener QR
exports.getQRCode = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  // Si ya está conectada, no hay QR
  if (session.isConnected) {
    return next(new ErrorResponse('La sesión ya está conectada, no hay código QR disponible', 400));
  }
  
  // Obtener QR del servicio
  const qrResult = await whatsappClient.getQRCode(sessionId);
  
  if (!qrResult || !qrResult.qr) {
    return next(new ErrorResponse('Código QR no disponible o expirado', 404));
  }
  
  // Actualizar timestamp en BD
  session.lastQRTimestamp = new Date();
  await session.save();
  
  res.status(200).json({
    success: true,
    data: {
      sessionId,
      qr: qrResult.qr
    }
  });
});

// Desconectar una sesión
exports.disconnectSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  // Desconectar del servicio
  await whatsappClient.disconnectSession(sessionId);
  
  // Detener polling de QR
  socketService.stopQRPolling(sessionId);
  
  // Actualizar estado
  session.status = 'disconnected';
  session.isConnected = false;
  session.isListening = false;
  session.lastDisconnection = new Date();
  await session.save();
  
  // Notificar a clientes
  socketService.emitToSession(sessionId, 'session_disconnected', {
    sessionId,
    timestamp: new Date()
  });
  
  res.status(200).json({
    success: true,
    data: {
      sessionId,
      status: 'disconnected'
    }
  });
});

// Obtener chats de una sesión
exports.getSessionChats = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const { refresh } = req.query;
  const forceRefresh = refresh === 'true';
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  try {
    const response = await whatsappClient.getSessionChats(sessionId, forceRefresh);
    
    res.status(200).json({
      success: true,
      data: {
        chats: response.chats || [],
        count: response.chats ? response.chats.length : 0
      }
    });
  } catch (error) {
    logger.error(`Error al obtener chats para sesión ${sessionId}:`, {
      errorMessage: error.message,
      status: error.response?.status
    });
    
    // Si es error 404 o 400, significa que la sesión no existe en el servicio
    if (error.response?.status === 404 || error.response?.status === 400) {
      logger.warn(`Sesión ${sessionId} no existe en servicio de WhatsApp, marcando como desconectada`);
      
      // Actualizar estado en BD
      session.status = 'disconnected';
      session.isConnected = false;
      session.isListening = false;
      session.lastDisconnection = new Date();
      await session.save();
      
      // Emitir evento de desconexión por socket
      socketService.emitSessionStatus(sessionId, 'disconnected', {
        reason: 'session_not_found_in_service',
        disconnectedAt: Date.now()
      });
      
      return next(new ErrorResponse('La sesión se ha desconectado. Por favor, reinicie la sesión para generar un nuevo código QR.', 400));
    }
    
    return next(new ErrorResponse(`Error al obtener chats: ${error.message}`, 500));
  }
});

// Actualizar estado de escucha de un chat
exports.updateChatListeningStatus = asyncHandler(async (req, res, next) => {
  const { sessionId, chatId } = req.params;
  const { isListening } = req.body;
  
  // Validar parámetros
  if (isListening === undefined || typeof isListening !== 'boolean') {
    return next(new ErrorResponse('Se requiere el parámetro isListening (boolean)', 400));
  }
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  // Verificar si está conectada
  if (!session.isConnected || session.status !== 'connected') {
    return next(new ErrorResponse('La sesión debe estar conectada para actualizar el estado de escucha', 400));
  }
  
  try {
    const response = await whatsappClient.updateChatListeningStatus(sessionId, chatId, isListening);
    
    // Emitir evento de actualización por socket
    socketService.emitToSession(sessionId, 'chat_listening_status', {
      sessionId,
      chatId,
      isListening
    });
    
    res.status(200).json({
      success: true,
      data: {
        chatId,
        isListening,
        sessionId
      }
    });
  } catch (error) {
    logger.error(`Error al actualizar estado de escucha para chat ${chatId} en sesión ${sessionId}:`, error);
    return next(new ErrorResponse(`Error al actualizar estado de escucha: ${error.message}`, 500));
  }
});

// Fuerza la reinicialización de una sesión
exports.forceReinitializeSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  logger.info(`Forzando reinicialización de sesión ${sessionId}`);
  
  try {
    // Limpiar sesión existente en el servicio
    try {
      await whatsappClient.disconnectSession(sessionId);
      logger.info(`Sesión ${sessionId} desconectada del servicio`);
    } catch (disconnectError) {
      logger.debug(`Error al desconectar (esperado si ya estaba desconectada): ${disconnectError.message}`);
    }
    
    // Desuscribir del puente
    whatsAppSocketBridge.unsubscribeFromSession(sessionId);
    
    // Detener polling anterior
    socketService.stopQRPolling(sessionId);
    
    // Esperar un momento para limpieza
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Reinicializar
    const initResult = await whatsappClient.initializeSession(sessionId);
    
    // Actualizar estado en BD
    session.status = 'qr_ready';
    session.isConnected = false;
    session.isListening = false;
    session.lastQRTimestamp = new Date();
    await session.save();
    
    // Reanudar suscripciones
    whatsAppSocketBridge.subscribeToSession(sessionId);
    socketService.startQRPolling(sessionId);
    
    // Notificar a clientes conectados
    socketService.emitToSession(sessionId, 'session_reinitialized', {
      sessionId,
      status: 'qr_ready',
      message: 'Sesión reinicializada, escanee el nuevo código QR'
    });
    
    res.status(200).json({
      success: true,
      data: session,
      message: 'Sesión reinicializada correctamente, escanee el nuevo código QR',
      serviceResponse: initResult
    });
    
  } catch (error) {
    logger.error(`Error al reinicializar sesión ${sessionId}:`, {
      errorMessage: error.message,
      stack: error.stack
    });
    
    // Marcar como fallida
    session.status = 'failed';
    session.failureReason = error.message;
    await session.save();
    
    return next(new ErrorResponse(`Error al reinicializar sesión: ${error.message}`, 500));
  }
});

// Verificar y sincronizar estado de sesión
exports.checkAndSyncSessionStatus = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  try {
    // Obtener estado real del servicio
    const realStatus = await whatsappClient.getSessionStatus(sessionId);
    
    let needsUpdate = false;
    let statusChanged = false;
    
    // Comparar y sincronizar estados
    if (realStatus && realStatus.exists) {
      if (session.isConnected !== realStatus.isConnected) {
        session.isConnected = realStatus.isConnected;
        needsUpdate = true;
        statusChanged = true;
      }
      
      if (session.isListening !== realStatus.isListening) {
        session.isListening = realStatus.isListening;
        needsUpdate = true;
      }
      
      if (realStatus.isConnected && session.status !== 'connected') {
        session.status = 'connected';
        needsUpdate = true;
        statusChanged = true;
      }
    } else {
      // La sesión no existe en el servicio
      if (session.status !== 'disconnected') {
        session.status = 'disconnected';
        session.isConnected = false;
        session.isListening = false;
        needsUpdate = true;
        statusChanged = true;
      }
    }
    
    if (needsUpdate) {
      await session.save();
      logger.info(`Estado de sesión ${sessionId} sincronizado`);
      
      if (statusChanged) {
        socketService.emitToSession(sessionId, 'session_status_updated', {
          sessionId,
          status: session.status,
          isConnected: session.isConnected,
          isListening: session.isListening
        });
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        sessionId,
        currentStatus: {
          status: session.status,
          isConnected: session.isConnected,
          isListening: session.isListening
        },
        serviceStatus: realStatus || null,
        wasSynced: needsUpdate
      }
    });
    
  } catch (error) {
    logger.error(`Error al verificar estado de sesión ${sessionId}:`, {
      errorMessage: error.message
    });
    
    return next(new ErrorResponse(`Error al verificar estado: ${error.message}`, 500));
  }
});

// Auto-reinicializar sesión
exports.autoReinitializeSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  const session = await Session.findOne({ 
    sessionId,
    userId: req.user.id
  });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  logger.info(`Auto-reinicializando sesión ${sessionId} debido a desconexión`);
  
  try {
    // Marcar como reinicializando
    session.status = 'initializing';
    session.isConnected = false;
    session.isListening = false;
    await session.save();
    
    // Limpiar del servicio si existe
    try {
      await whatsappClient.disconnectSession(sessionId);
    } catch (cleanupError) {
      logger.debug(`Error en limpieza (esperado): ${cleanupError.message}`);
    }
    
    // Desuscribir del puente
    whatsAppSocketBridge.unsubscribeFromSession(sessionId);
    socketService.stopQRPolling(sessionId);
    
    // Esperar un momento
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Reinicializar
    const initResult = await whatsappClient.initializeSession(sessionId);
    
    // Actualizar estado
    session.status = 'qr_ready';
    session.lastQRTimestamp = new Date();
    await session.save();
    
    // Reanudar suscripciones
    whatsAppSocketBridge.subscribeToSession(sessionId);
    socketService.startQRPolling(sessionId);
    
    // Notificar reinicialización exitosa
    socketService.emitSessionStatus(sessionId, 'qr_ready', {
      reason: 'auto_reinitialized',
      message: 'Sesión reinicializada automáticamente. Escanee el nuevo código QR.',
      timestamp: Date.now()
    });
    
    res.status(200).json({
      success: true,
      data: session,
      message: 'Sesión reinicializada automáticamente. Escanee el nuevo código QR.',
      serviceResponse: initResult
    });
    
  } catch (error) {
    logger.error(`Error en auto-reinicialización de ${sessionId}:`, {
      errorMessage: error.message
    });
    
    session.status = 'failed';
    session.failureReason = error.message;
    await session.save();
    
    return next(new ErrorResponse(`Error al reinicializar sesión: ${error.message}`, 500));
  }
});

// Endpoint para restaurar sesiones cuando el usuario vuelve a cargar la página
exports.restoreSessions = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  logger.info(`🔄 Restaurando sesiones para usuario ${userId} (con validación)`);
  
  // Buscar sesiones del usuario ordenadas por actividad reciente
  const sessions = await Session.find({ userId })
    .sort({ lastConnection: -1, lastQRTimestamp: -1, createdAt: -1 })
    .limit(5);
  
  if (sessions.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        activeSessions: [],
        recommendedAction: 'create_new',
        message: 'No hay sesiones disponibles, crear nueva sesión'
      }
    });
  }
  
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  const tenMinutes = 10 * 60 * 1000;
  
  const validatedSessions = [];
  
  // 🔍 Validar cada sesión contra el servicio
  for (const session of sessions) {
    let isValid = false;
    let validationResult = 'unknown';
    
    try {
      // Solo validar sesiones que parecen activas
      if ((session.isConnected && session.lastConnection) || 
          (session.status === 'qr_ready' && session.lastQRTimestamp)) {
        
        const serviceStatus = await Promise.race([
          whatsappClient.getSessionStatus(session.sessionId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 2000)
          )
        ]);
        
        if (serviceStatus && serviceStatus.exists) {
          isValid = true;
          validationResult = serviceStatus.isConnected ? 'connected' : 'exists';
          
          // Actualizar estado en BD si es diferente
          if (session.isConnected !== serviceStatus.isConnected) {
            session.isConnected = serviceStatus.isConnected;
            session.status = serviceStatus.isConnected ? 'connected' : session.status;
            await session.save();
          }
        } else {
          validationResult = 'not_found';
        }
      } else {
        validationResult = 'inactive';
      }
    } catch (error) {
      validationResult = 'error';
    }
    
    const analysis = {
      sessionId: session.sessionId,
      name: session.name,
      status: session.status,
      isConnected: session.isConnected,
      isListening: session.isListening,
      lastConnection: session.lastConnection,
      lastQRTimestamp: session.lastQRTimestamp,
      createdAt: session.createdAt,
      recommendation: 'unknown',
      priority: 0,
      isValid,
      validationResult
    };
    
    // Solo asignar prioridad a sesiones válidas
    if (isValid) {
      if (session.isConnected && session.lastConnection) {
        const timeSinceConnection = now - new Date(session.lastConnection).getTime();
        
        if (timeSinceConnection < fiveMinutes) {
          analysis.recommendation = 'use_immediately';
          analysis.priority = 10;
        } else if (timeSinceConnection < tenMinutes) {
          analysis.recommendation = 'verify_and_use';
          analysis.priority = 8;
        }
      }
      
      if (session.status === 'qr_ready' && session.lastQRTimestamp) {
        const timeSinceQR = now - new Date(session.lastQRTimestamp).getTime();
        
        if (timeSinceQR < fiveMinutes) {
          analysis.recommendation = 'qr_still_valid';
          analysis.priority = Math.max(analysis.priority, 9);
        }
      }
    }
    
    validatedSessions.push(analysis);
  }
  
  // Ordenar por prioridad
  validatedSessions.sort((a, b) => b.priority - a.priority);
  
  // Determinar acción recomendada
  const bestSession = validatedSessions.find(s => s.isValid && s.priority > 0);
  let recommendedAction = 'create_new';
  let recommendedSessionId = null;
  let message = 'Crear nueva sesión';
  
  if (bestSession) {
    recommendedAction = bestSession.recommendation === 'use_immediately' ? 'restore_session' : 
                       bestSession.recommendation === 'qr_still_valid' ? 'show_qr' : 'verify_session';
    recommendedSessionId = bestSession.sessionId;
    message = bestSession.recommendation === 'use_immediately' ? 'Sesión activa encontrada' :
              bestSession.recommendation === 'qr_still_valid' ? 'Código QR válido encontrado' :
              'Sesión potencialmente activa encontrada';
              
    // Suscribir si es necesario
    if (bestSession.recommendation === 'use_immediately') {
      whatsAppSocketBridge.subscribeToSession(bestSession.sessionId);
    } else if (bestSession.recommendation === 'qr_still_valid') {
      whatsAppSocketBridge.subscribeToSession(bestSession.sessionId);
      socketService.startQRPolling(bestSession.sessionId);
    }
  }
  
  res.status(200).json({
    success: true,
    data: {
      activeSessions: validatedSessions,
      recommendedAction,
      recommendedSessionId,
      message,
      timestamp: now
    }
  });
});

// Endpoint rápido para verificar si una sesión específica sigue activa
exports.quickSessionStatus = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const userId = req.user.id;
  
  // Verificar que la sesión pertenece al usuario
  const session = await Session.findOne({ sessionId, userId });
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Sesión no encontrada',
      status: 'not_found'
    });
  }
  
  // Si está marcada como conectada y es reciente, confiar en el estado
  if (session.isConnected && session.lastConnection) {
    const timeSinceConnection = Date.now() - new Date(session.lastConnection).getTime();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (timeSinceConnection < fiveMinutes) {
      // Suscribir automáticamente
      whatsAppSocketBridge.subscribeToSession(sessionId);
      
      return res.status(200).json({
        success: true,
        status: 'active',
        isConnected: true,
        isListening: session.isListening,
        lastConnection: session.lastConnection,
        message: 'Sesión activa confirmada'
      });
    }
  }
  
  // Si tiene QR reciente
  if (session.status === 'qr_ready' && session.lastQRTimestamp) {
    const timeSinceQR = Date.now() - new Date(session.lastQRTimestamp).getTime();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (timeSinceQR < fiveMinutes) {
      // Suscribir y activar polling
      whatsAppSocketBridge.subscribeToSession(sessionId);
      socketService.startQRPolling(sessionId);
      
      return res.status(200).json({
        success: true,
        status: 'qr_ready',
        isConnected: false,
        lastQRTimestamp: session.lastQRTimestamp,
        message: 'Código QR disponible'
      });
    }
  }
  
  // En otros casos, marcar como incierto
  res.status(200).json({
    success: true,
    status: 'uncertain',
    isConnected: session.isConnected,
    sessionStatus: session.status,
    message: 'Estado de sesión incierto, se recomienda verificación'
  });
});

// Endpoint para "despertar" una sesión dormida
exports.wakeUpSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const userId = req.user.id;
  
  const session = await Session.findOne({ sessionId, userId });
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  logger.info(`Despertando sesión ${sessionId}`);
  
  // Re-suscribir al puente
  whatsAppSocketBridge.subscribeToSession(sessionId);
  
  // Si está marcada como QR ready, comenzar polling
  if (session.status === 'qr_ready') {
    socketService.startQRPolling(sessionId);
  }
  
  // Intentar verificar estado real solo si es necesario
  let statusVerified = false;
  
  try {
    const realStatus = await Promise.race([
      whatsappClient.getSessionStatus(sessionId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3000)
      )
    ]);
    
    if (realStatus && realStatus.exists) {
      // Actualizar estado si es diferente
      let needsUpdate = false;
      
      if (session.isConnected !== realStatus.isConnected) {
        session.isConnected = realStatus.isConnected;
        needsUpdate = true;
      }
      
      if (session.isListening !== realStatus.isListening) {
        session.isListening = realStatus.isListening;
        needsUpdate = true;
      }
      
      if (realStatus.isConnected && session.status !== 'connected') {
        session.status = 'connected';
        session.lastConnection = new Date();
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await session.save();
      }
      
      statusVerified = true;
    }
  } catch (statusError) {
    logger.debug(`No se pudo verificar estado de ${sessionId}: ${statusError.message}`);
  }
  
  res.status(200).json({
    success: true,
    data: {
      sessionId,
      status: session.status,
      isConnected: session.isConnected,
      isListening: session.isListening,
      statusVerified,
      message: 'Sesión activada'
    }
  });
});

// Limpieza periódica del cache
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessionStatusCache.entries()) {
    if (now - value.timestamp > CACHE_TTL * 2) {
      sessionStatusCache.delete(key);
    }
  }
}, CACHE_TTL);

module.exports = exports;