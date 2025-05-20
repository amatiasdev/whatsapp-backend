const Session = require('../models/Session');
const whatsappClient = require('../services/whatsappClient');
const socketService = require('../services/socketService');
const logger = require('../utils/logger');
const whatsAppSocketBridge = require('../services/whatsAppSocketBridge');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// Obtener todas las sesiones del usuario autenticado
exports.getAllSessions = asyncHandler(async (req, res, next) => {
  // Usar el ID del usuario autenticado en lugar de un parámetro de consulta
  const userId = req.user.id;
  
  const sessions = await Session.find({ userId })
    .select('-__v')
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: sessions.length,
    data: sessions
  });
});

// Obtener una sesión por ID
exports.getSessionById = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  // Buscar la sesión y verificar que pertenezca al usuario autenticado
  const session = await Session.findOne({ 
    sessionId, 
    userId: req.user.id 
  }).select('-__v');
  
  if (!session) {
    return next(new ErrorResponse('Sesión no encontrada', 404));
  }
  
  // Intentar obtener estado actual del servicio
  try {
    const serviceStatus = await whatsappClient.getSessionStatus(sessionId);
    
    // Si existe en el servicio, actualizar estado en la BD
    if (serviceStatus && serviceStatus.exists) {
      // Solo actualizar si el estado es diferente
      if (session.isConnected !== serviceStatus.isConnected || 
          session.isListening !== serviceStatus.isListening) {
        
        await Session.findOneAndUpdate(
          { sessionId },
          {
            isConnected: serviceStatus.isConnected,
            isListening: serviceStatus.isListening,
            status: serviceStatus.isConnected ? 'connected' : session.status
          }
        );
        
        // Actualizar el objeto de respuesta
        session.isConnected = serviceStatus.isConnected;
        session.isListening = serviceStatus.isListening;
        if (serviceStatus.isConnected) {
          session.status = 'connected';
        }
      }
    }
  } catch (statusError) {
    logger.debug(`No se pudo obtener estado de la sesión ${sessionId}: ${statusError.message}`);
    // No fallar la petición completa si solo falló la verificación de estado
  }
  
  res.status(200).json({
    success: true,
    data: session
  });
});

// Crear una nueva sesión
exports.createSession = asyncHandler(async (req, res, next) => {
  const { sessionId, name, description } = req.body;
  const userId = req.user.id; // Usar el ID del usuario autenticado
  
  // Validar campos requeridos
  if (!sessionId) {
    return next(new ErrorResponse('El ID de sesión es requerido', 400));
  }
  
  // Verificar si ya existe
  const existingSession = await Session.findOne({ sessionId });
  if (existingSession) {
    return next(new ErrorResponse('Ya existe una sesión con este ID', 400));
  }
  
  // Crear en la base de datos
  const session = await Session.create({
    sessionId,
    name: name || `Sesión ${sessionId}`,
    description,
    userId,
    status: 'initializing'
  });
  
  // Inicializar en el servicio WhatsApp
  try {
    const initResult = await whatsappClient.initializeSession(sessionId);
    
    // Actualizar estado según respuesta
    session.status = 'qr_ready';
    await session.save();
    
    // Suscribir al puente para recibir eventos de esta sesión
    whatsAppSocketBridge.subscribeToSession(sessionId);
    
    // Iniciar polling de QR
    socketService.startQRPolling(sessionId);
    
    res.status(201).json({
      success: true,
      data: session,
      serviceResponse: initResult
    });
  } catch (initError) {
    // Si hay error al inicializar en servicio, marcar sesión como fallida
    session.status = 'failed';
    session.failureReason = initError.message;
    await session.save();
    
    logger.error(`Error al inicializar sesión ${sessionId} en servicio: ${initError.message}`);
    
    return next(new ErrorResponse(`Error al inicializar sesión: ${initError.message}`, 500));
  }
});

// Actualizar una sesión
exports.updateSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const { name, description, webhookUrl, filters } = req.body;
  
  // Encontrar la sesión y verificar que pertenezca al usuario autenticado
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
  
  // Guardar cambios
  await session.save();
  
  res.status(200).json({
    success: true,
    data: session
  });
});

// Eliminar una sesión
exports.deleteSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  // Verificar si existe y pertenece al usuario autenticado
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
    // Continuamos con la eliminación aunque falle la desconexión
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

// Iniciar escucha
exports.startListening = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  // Verificar si existe y pertenece al usuario autenticado
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
});

// Detener escucha
exports.stopListening = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  // Verificar si existe y pertenece al usuario autenticado
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
  
  // Verificar si existe la sesión y pertenece al usuario autenticado
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
  
  // Verificar si existe y pertenece al usuario autenticado
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

// Obtener o crear una sesión para el usuario actual
exports.getOrCreateSession = asyncHandler(async (req, res, next) => {
  // Usar el ID del usuario autenticado
  const userId = req.user.id;
  
  // Buscar sesiones activas del usuario
  const activeSession = await Session.findOne({
    userId,
    $or: [
      { status: 'connected' },
      { status: 'qr_ready' }
    ]
  }).sort({ createdAt: -1 });
  
  // Si hay una sesión activa, devolverla
  if (activeSession) {
    logger.info(`Reutilizando sesión activa ${activeSession.sessionId} para usuario ${userId}`);
    
    // Asegurarse de que el puente esté suscrito a esta sesión
    whatsAppSocketBridge.subscribeToSession(activeSession.sessionId);
    
    // Si está en estado 'qr_ready', iniciar polling de QR
    if (activeSession.status === 'qr_ready') {
      socketService.startQRPolling(activeSession.sessionId);
    }
    
    return res.status(200).json({
      success: true,
      data: activeSession,
      isExisting: true
    });
  }
  
  // Si no hay sesión activa, crear una nueva
  logger.info(`Creando nueva sesión para usuario ${userId}`);
  
  // Generar un ID de sesión único
  const sessionId = `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  // Crear en la base de datos
  const session = await Session.create({
    sessionId,
    name: `Sesión de ${req.user.name || 'Usuario'}`,
    userId,
    status: 'initializing'
  });
  
  // Inicializar en el servicio WhatsApp
  try {
    const initResult = await whatsappClient.initializeSession(sessionId);
    
    // Actualizar estado según respuesta
    session.status = 'qr_ready';
    await session.save();
    
    // Suscribir al puente para recibir eventos
    whatsAppSocketBridge.subscribeToSession(sessionId);
    
    // Iniciar polling de QR
    socketService.startQRPolling(sessionId);
    
    res.status(201).json({
      success: true,
      data: session,
      isExisting: false,
      serviceResponse: initResult
    });
  } catch (initError) {
    // Si hay error al inicializar en servicio, marcar sesión como fallida
    session.status = 'failed';
    session.failureReason = initError.message;
    await session.save();
    
    logger.error(`Error al inicializar sesión ${sessionId} en servicio: ${initError.message}`);
    
    return next(new ErrorResponse(`Error al inicializar sesión: ${initError.message}`, 500));
  }
});