const Session = require('../models/Session');
const whatsappClient = require('../services/whatsappClient');
const socketService = require('../services/socketService');
const logger = require('../utils/logger');
const messegeController = require('../controllers/messageController');
const whatsAppSocketBridge = require('../services/whatsAppSocketBridge');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const config = require('../config');
const mongoose = require('mongoose');

// Constantes de configuración
const MAX_SESSIONS_PER_USER = parseInt(process.env.MAX_SESSIONS_PER_USER || '3', 10);
const SESSION_VALIDITY_HOURS = parseInt(process.env.SESSION_VALIDITY_HOURS || '24', 10);
const SOFT_DELETE_RETENTION_DAYS = parseInt(process.env.SOFT_DELETE_RETENTION_DAYS || '30', 10);


// Cache en memoria para evitar verificaciones excesivas
const sessionStatusCache = new Map();
const CACHE_TTL = 30000; // 30 segundos



/**
 * @desc    Obtener solo sesiones válidas para reconexión
 * @route   GET /api/v1/sessions/valid
 * @access  Private
 */
exports.getValidSessions = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  logger.info(`Obteniendo sesiones válidas para usuario ${userId}`);
  
  // Calcular fecha límite para sesiones válidas
  const validityLimit = new Date();
  validityLimit.setHours(validityLimit.getHours() - SESSION_VALIDITY_HOURS);
  
  try {
    // Buscar sesiones válidas
    const validSessions = await Session.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(req.user.id), deletedAt: { $exists: false } } },
      {
        $addFields: {
          priority: {
            $switch: {
              branches: [
                { case: { $eq: ['$status', 'connected'] }, then: 3 },
                { case: { $eq: ['$status', 'qr_ready'] }, then: 2 },
                {
                  case: {
                    $and: [
                      { $eq: ['$status', 'disconnected'] },
                      {
                        $gte: [
                          { $subtract: [new Date(), '$lastDisconnection'] },
                          -5 * 60 * 1000 // los últimos 5 minutos
                        ]
                      }
                    ]
                  },
                  then: 1
                }
              ],
              default: 0
            }
          }
        }
      },
      { $sort: { priority: -1, lastConnection: -1 } }
    ]);
    
    // Validar cada sesión contra el servicio de WhatsApp
    const validatedSessions = [];
    
    for (const session of validSessions) {
      let validationStatus = 'unknown';
      let isServiceValid = false;
      
      try {
        // Verificar estado en el servicio con timeout corto
        const serviceStatus = await Promise.race([
          whatsappClient.getSessionStatus(session.sessionId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 3000)
          )
        ]);
        
        if (serviceStatus && serviceStatus.exists) {
          isServiceValid = true;
          validationStatus = serviceStatus.isConnected ? 'connected' : 'exists';
          
          // Actualizar estado en BD si es diferente
          if (session.isConnected !== serviceStatus.isConnected) {
            await Session.findByIdAndUpdate(session._id, {
              isConnected: serviceStatus.isConnected,
              status: serviceStatus.isConnected ? 'connected' : session.status
            });
          }
        } else {
          validationStatus = 'not_found_in_service';
        }
      } catch (error) {
        validationStatus = 'service_error';
        logger.debug(`Error al validar sesión ${session.sessionId}: ${error.message}`);
      }
      
      // Calcular puntuación de validez
      let validityScore = 0;
      
      if (isServiceValid) validityScore += 10;
      if (session.isConnected) validityScore += 8;
      if (session.status === 'connected') validityScore += 6;
      if (session.status === 'qr_ready') validityScore += 4;
      
      // Puntuación basada en actividad reciente
      if (session.lastConnection) {
        const hoursSinceConnection = (Date.now() - new Date(session.lastConnection).getTime()) / (1000 * 60 * 60);
        if (hoursSinceConnection < 1) validityScore += 5;
        else if (hoursSinceConnection < 6) validityScore += 3;
        else if (hoursSinceConnection < 24) validityScore += 1;
      }
      
      if (session.lastQRTimestamp) {
        const hoursSinceQR = (Date.now() - new Date(session.lastQRTimestamp).getTime()) / (1000 * 60 * 60);
        if (hoursSinceQR < 0.5) validityScore += 4;
        else if (hoursSinceQR < 2) validityScore += 2;
      }
      
      // Solo incluir sesiones con puntuación mínima
      if (validityScore >= 3) {
        validatedSessions.push({
          ...session.toObject(),
          validationStatus,
          isServiceValid,
          validityScore,
          recommendation: validityScore >= 8 ? 'immediate_use' : 
                         validityScore >= 6 ? 'verify_and_use' : 'needs_validation'
        });
      }
    }
    
    // Ordenar por puntuación de validez
    validatedSessions.sort((a, b) => b.validityScore - a.validityScore);
    
    logger.info(`Encontradas ${validatedSessions.length} sesiones válidas de ${validSessions.length} totales para usuario ${userId}`);
    
    res.status(200).json({
      success: true,
      count: validatedSessions.length,
      totalFound: validSessions.length,
      data: validatedSessions,
      meta: {
        validityHours: SESSION_VALIDITY_HOURS,
        maxScorePossible: 29,
        recommendations: {
          immediate_use: 'Usar inmediatamente',
          verify_and_use: 'Verificar estado y usar',
          needs_validation: 'Requiere validación'
        }
      }
    });
    
  } catch (error) {
    logger.error(`Error al obtener sesiones válidas:`, {
      errorMessage: error.message,
      userId
    });
    
    return next(new ErrorResponse('Error al obtener sesiones válidas', 500));
  }
});

/**
 * @desc    Limpiar sesiones expiradas/inválidas (soft delete)
 * @route   DELETE /api/v1/sessions/cleanup
 * @access  Private
 */
exports.cleanupSessions = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { force = false, daysOld = 7 } = req.query;
  
  logger.info(`Iniciando limpieza de sesiones para usuario ${userId}`, {
    force: force === 'true',
    daysOld: parseInt(daysOld)
  });
  
  try {
    const daysToCheck = parseInt(daysOld);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToCheck);
    
    // Criterios para sesiones a limpiar
    const cleanupCriteria = {
      userId,
      deletedAt: { $exists: false }, // No ya eliminadas
      $or: []
    };
    
    // Sesiones con estado fallido
    cleanupCriteria.$or.push({ status: 'failed' });
    
    // Sesiones inicializando por más tiempo del permitido
    cleanupCriteria.$or.push({
      status: 'initializing',
      createdAt: { $lt: cutoffDate }
    });
    
    // Sesiones desconectadas hace mucho tiempo
    cleanupCriteria.$or.push({
      status: 'disconnected',
      lastDisconnection: { $lt: cutoffDate }
    });
    
    if (force === 'true') {
      // En modo forzado, también limpiar sesiones inactivas
      cleanupCriteria.$or.push({
        status: { $in: ['qr_ready', 'connected'] },
        $and: [
          {
            $or: [
              { lastConnection: { $lt: cutoffDate } },
              { lastConnection: { $exists: false } }
            ]
          },
          {
            $or: [
              { lastQRTimestamp: { $lt: cutoffDate } },
              { lastQRTimestamp: { $exists: false } }
            ]
          }
        ]
      });
    }
    
    // Encontrar sesiones a limpiar
    const sessionsToCleanup = await Session.find(cleanupCriteria);
    
    if (sessionsToCleanup.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No hay sesiones que limpiar',
        cleaned: 0,
        details: []
      });
    }
    
    const cleanupResults = [];
    let cleanedCount = 0;
    
    for (const session of sessionsToCleanup) {
      try {
        // Intentar desconectar del servicio de WhatsApp
        try {
          await whatsappClient.disconnectSession(session.sessionId);
          logger.debug(`Sesión ${session.sessionId} desconectada del servicio`);
        } catch (disconnectError) {
          logger.debug(`Error al desconectar ${session.sessionId} (esperado): ${disconnectError.message}`);
        }
        
        // Desuscribir del puente de sockets
        whatsAppSocketBridge.unsubscribeFromSession(session.sessionId);
        socketService.stopQRPolling(session.sessionId);
        
        // Soft delete: marcar como eliminada
        await Session.findByIdAndUpdate(session._id, {
          deletedAt: new Date(),
          status: 'deleted',
          isConnected: false,
          isListening: false,
          cleanupReason: force === 'true' ? 'force_cleanup' : 'auto_cleanup'
        });
        
        cleanedCount++;
        cleanupResults.push({
          sessionId: session.sessionId,
          name: session.name,
          status: session.status,
          reason: 'cleaned_successfully',
          lastActivity: session.lastConnection || session.lastQRTimestamp || session.createdAt
        });
        
        // Notificar a clientes conectados
        socketService.emitToSession(session.sessionId, 'session_cleaned', {
          sessionId: session.sessionId,
          timestamp: Date.now(),
          reason: 'cleanup'
        });
        
      } catch (error) {
        logger.error(`Error al limpiar sesión ${session.sessionId}:`, {
          errorMessage: error.message
        });
        
        cleanupResults.push({
          sessionId: session.sessionId,
          name: session.name,
          status: session.status,
          reason: 'cleanup_error',
          error: error.message
        });
      }
    }
    
    logger.info(`Limpieza completada: ${cleanedCount}/${sessionsToCleanup.length} sesiones limpiadas para usuario ${userId}`);
    
    res.status(200).json({
      success: true,
      message: `Limpieza completada: ${cleanedCount} sesiones procesadas`,
      cleaned: cleanedCount,
      total: sessionsToCleanup.length,
      details: cleanupResults,
      criteria: {
        daysOld: daysToCheck,
        force: force === 'true',
        cutoffDate
      }
    });
    
  } catch (error) {
    logger.error(`Error durante limpieza de sesiones:`, {
      errorMessage: error.message,
      userId
    });
    
    return next(new ErrorResponse('Error durante la limpieza de sesiones', 500));
  }
});

/**
 * @desc    Obtener sesiones con filtros avanzados y paginación
 * @route   GET /api/v1/sessions
 * @access  Private
 */
exports.getAllSessionsEnhanced = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const {
    status,
    reconnectable,
    page = 1,
    limit = 10,
    sortBy = 'lastActivity',
    sortOrder = 'desc',
    includeDeleted = false
  } = req.query;
  
  // Construir filtros
  const filters = { userId };

  if (includeDeleted !== 'true') {
    filters.deletedAt = { $exists: false };
  }
  if (status) {
    const statusArray = status.split(',');
    filters.status = { $in: statusArray };
  }
  if (reconnectable === 'true') {
    const recentLimit = new Date();
    recentLimit.setHours(recentLimit.getHours() - SESSION_VALIDITY_HOURS);
    filters.$or = [
      {
        status: 'connected',
        isConnected: true,
        lastConnection: { $gte: recentLimit }
      },
      {
        status: 'qr_ready',
        lastQRTimestamp: { $gte: recentLimit }
      }
    ];
  }

  // Paginación
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  let sessions, totalCount;

  try {
    // Trae sesiones SIN sort si es por "lastActivity", con paginación
    if (sortBy === 'lastActivity') {
      [sessions, totalCount] = await Promise.all([
        Session.find(filters)
          .select('-__v')
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Session.countDocuments(filters)
      ]);

      // Ordenar en JS por "lastActivity"
      sessions.sort((a, b) => {
        const aActivity = Math.max(
          a.lastConnection ? new Date(a.lastConnection).getTime() : 0,
          a.lastQRTimestamp ? new Date(a.lastQRTimestamp).getTime() : 0,
          new Date(a.createdAt).getTime()
        );
        const bActivity = Math.max(
          b.lastConnection ? new Date(b.lastConnection).getTime() : 0,
          b.lastQRTimestamp ? new Date(b.lastQRTimestamp).getTime() : 0,
          new Date(b.createdAt).getTime()
        );
        return sortOrder === 'asc' ? aActivity - bActivity : bActivity - aActivity;
      });

    } else {
      // Para otros casos, dejar sort normal
      const sortOptions = {};
      switch (sortBy) {
        case 'lastConnection':
          sortOptions.lastConnection = sortOrder === 'asc' ? 1 : -1;
          break;
        case 'createdAt':
          sortOptions.createdAt = sortOrder === 'asc' ? 1 : -1;
          break;
        case 'name':
          sortOptions.name = sortOrder === 'asc' ? 1 : -1;
          break;
        default:
          sortOptions.createdAt = -1;
      }

      [sessions, totalCount] = await Promise.all([
        Session.find(filters)
          .select('-__v')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Session.countDocuments(filters)
      ]);
    }

    // Paginación info
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    // Enriquecer datos
    const now = Date.now();
    const enrichedSessions = sessions.map(session => {
      const lastActivity = Math.max(
        session.lastConnection ? new Date(session.lastConnection).getTime() : 0,
        session.lastQRTimestamp ? new Date(session.lastQRTimestamp).getTime() : 0,
        new Date(session.createdAt).getTime()
      );
      const hoursSinceActivity = (now - lastActivity) / (1000 * 60 * 60);
      return {
        ...session,
        lastActivity: new Date(lastActivity),
        hoursSinceActivity: Math.round(hoursSinceActivity * 10) / 10,
        isRecentlyActive: hoursSinceActivity < SESSION_VALIDITY_HOURS,
        canReconnect: (session.status === 'connected' || session.status === 'qr_ready') && 
                     hoursSinceActivity < SESSION_VALIDITY_HOURS
      };
    });

    logger.info(`Sesiones obtenidas con filtros para usuario ${userId}`, {
      totalCount,
      returnedCount: sessions.length,
      filters: { status, reconnectable, includeDeleted }
    });

    res.status(200).json({
      success: true,
      data: enrichedSessions,
      pagination: {
        current: pageNum,
        total: totalPages,
        limit: limitNum,
        totalCount,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        prevPage: hasPrevPage ? pageNum - 1 : null
      },
      filters: {
        status,
        reconnectable,
        includeDeleted,
        sortBy,
        sortOrder
      }
    });

  } catch (error) {
    logger.error(`Error al obtener sesiones con filtros:`, {
      errorMessage: error.message,
      userId,
      filters
    });
    return next(new ErrorResponse('Error al obtener sesiones', 500));
  }
});


/**
 * @desc    Middleware para validar límite de sesiones activas
 * @access  Private
 */
exports.validateSessionLimit = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  // Solo aplicar el límite en creación de nuevas sesiones
  if (req.method !== 'POST' || !req.path.includes('sessions')) {
    return next();
  }
  
  try {
    const activeSessionsCount = await Session.countDocuments({
      userId,
      deletedAt: { $exists: false },
      status: { $in: ['connected', 'qr_ready', 'initializing'] }
    });
    
    if (activeSessionsCount >= MAX_SESSIONS_PER_USER) {
      logger.warn(`Usuario ${userId} intentó crear sesión excediendo límite`, {
        currentCount: activeSessionsCount,
        maxAllowed: MAX_SESSIONS_PER_USER
      });
      
      return next(new ErrorResponse(
        `No puedes tener más de ${MAX_SESSIONS_PER_USER} sesiones activas simultáneamente. ` +
        `Actualmente tienes ${activeSessionsCount}. Elimina sesiones inactivas primero.`,
        400
      ));
    }
    
    // Agregar información al request para uso posterior
    req.sessionInfo = {
      currentActiveCount: activeSessionsCount,
      maxAllowed: MAX_SESSIONS_PER_USER,
      remaining: MAX_SESSIONS_PER_USER - activeSessionsCount
    };
    
    next();
    
  } catch (error) {
    logger.error(`Error al validar límite de sesiones:`, {
      errorMessage: error.message,
      userId
    });
    
    return next(new ErrorResponse('Error al validar límite de sesiones', 500));
  }
});

/**
 * @desc    Middleware para verificar pertenencia de sesión al usuario
 * @access  Private
 */
exports.validateSessionOwnership = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const userId = req.user.id;
  
  if (!sessionId) {
    return next(new ErrorResponse('ID de sesión requerido', 400));
  }
  
  try {
    const session = await Session.findOne({
      sessionId,
      userId,
      deletedAt: { $exists: false }
    }).select('sessionId userId status');
    
    if (!session) {
      return next(new ErrorResponse('Sesión no encontrada o no tienes permisos para acceder', 404));
    }
    
    // Agregar sesión al request para evitar consultas duplicadas
    req.session = session;
    
    next();
    
  } catch (error) {
    logger.error(`Error al verificar pertenencia de sesión:`, {
      errorMessage: error.message,
      sessionId,
      userId
    });
    
    return next(new ErrorResponse('Error al verificar permisos de sesión', 500));
  }
});

/**
 * @desc    Obtener estadísticas de sesiones del usuario
 * @route   GET /api/v1/sessions/stats
 * @access  Private
 */
exports.getSessionStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  try {
    const [totalStats, statusStats, recentActivity] = await Promise.all([
      // Estadísticas totales
      Session.aggregate([
        { 
          $match: { 
            userId: new mongoose.Types.ObjectId(userId),
            deletedAt: { $exists: false }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            connected: {
              $sum: { $cond: [{ $eq: ["$status", "connected"] }, 1, 0] }
            },
            listening: {
              $sum: { $cond: ["$isListening", 1, 0] }
            }
          }
        }
      ]),
      
      // Estadísticas por estado
      Session.aggregate([
        { 
          $match: { 
            userId: new mongoose.Types.ObjectId(userId),
            deletedAt: { $exists: false }
          }
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Actividad reciente (últimas 24 horas)
      Session.find({
        userId,
        deletedAt: { $exists: false },
        $or: [
          { lastConnection: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          { lastQRTimestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
        ]
      }).countDocuments()
    ]);
    
    const stats = totalStats[0] || { total: 0, connected: 0, listening: 0 };
    const statusBreakdown = statusStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});
    
    res.status(200).json({
      success: true,
      data: {
        total: stats.total,
        connected: stats.connected,
        listening: stats.listening,
        recentlyActive: recentActivity,
        maxAllowed: MAX_SESSIONS_PER_USER,
        remaining: Math.max(0, MAX_SESSIONS_PER_USER - stats.total),
        statusBreakdown,
        validityHours: SESSION_VALIDITY_HOURS
      }
    });
    
  } catch (error) {
    logger.error(`Error al obtener estadísticas de sesiones:`, {
      errorMessage: error.message,
      userId
    });
    
    return next(new ErrorResponse('Error al obtener estadísticas', 500));
  }
});

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
  
  logger.info(`🔍 Buscando sesiones para usuario ${userId}`);
  
  // Buscar sesiones del usuario ordenadas por actividad reciente
  const sessions = await Session.find({ 
    userId,
    deletedAt: { $exists: false } // Excluir sesiones eliminadas
  }).sort({ lastConnection: -1, lastQRTimestamp: -1, createdAt: -1 });
  
  // 🚀 LÓGICA MEJORADA: Ser MUY generoso con sesiones recientes
  for (const session of sessions) {
    const now = Date.now();
    
    // ✅ PRIORIDAD 1: Sesiones conectadas muy recientes (SIN validación)
    if (session.isConnected) {
      const timeSinceConnection = now - new Date(session.lastConnection).getTime();
      const thirtyMinutes = 30 * 60 * 1000; // Aumentado a 30 minutos
      
      if (timeSinceConnection < thirtyMinutes) {
        logger.info(`🎯 REUTILIZANDO sesión conectada reciente: ${session.sessionId} (${Math.round(timeSinceConnection/60000)} min)`);
        
        // NO validar contra servicio, confiar en el estado de BD
        whatsAppSocketBridge.subscribeToSession(session.sessionId);
        
        return res.status(200).json({
          success: true,
          data: session,
          isExisting: true,
          message: `Sesión conectada reutilizada (${Math.round(timeSinceConnection/60000)} min atrás)`
        });
      }
    }
    
    // ✅ PRIORIDAD 2: Sesiones con QR reciente (SIN validación)
    if (session.status === 'qr_ready' && session.lastQRTimestamp) {
      const timeSinceQR = now - new Date(session.lastQRTimestamp).getTime();
      const twentyMinutes = 20 * 60 * 1000; // Aumentado a 20 minutos
      
      if (timeSinceQR < twentyMinutes) {
        logger.info(`📱 REUTILIZANDO sesión con QR reciente: ${session.sessionId} (${Math.round(timeSinceQR/60000)} min)`);
        
        whatsAppSocketBridge.subscribeToSession(session.sessionId);
        socketService.startQRPolling(session.sessionId);
        
        return res.status(200).json({
          success: true,
          data: session,
          isExisting: true,
          message: `QR válido reutilizado (${Math.round(timeSinceQR/60000)} min atrás)`
        });
      }
    }
    
    // ✅ PRIORIDAD 3: SOLO para sesiones más antiguas, validar CON timeout alto
    if ((session.isConnected || session.status === 'qr_ready') && 
        (!session.lastConnection || (now - new Date(session.lastConnection).getTime()) > 30 * 60 * 1000)) {
      
      logger.info(`🔍 Validando sesión antigua: ${session.sessionId}`);
      
      try {
        const serviceStatus = await Promise.race([
          whatsappClient.getSessionStatus(session.sessionId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Validation timeout')), 10000) // 10 segundos
          )
        ]);
        
        if (serviceStatus && serviceStatus.exists) {
          logger.info(`✅ Sesión ${session.sessionId} confirmada en servicio - reutilizando`);
          
          // Actualizar estado si es diferente
          let needsUpdate = false;
          if (session.isConnected !== serviceStatus.isConnected) {
            session.isConnected = serviceStatus.isConnected;
            needsUpdate = true;
          }
          if (serviceStatus.isConnected && session.status !== 'connected') {
            session.status = 'connected';
            session.lastConnection = new Date();
            needsUpdate = true;
          }
          
          if (needsUpdate) {
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
            message: 'Sesión antigua validada y reutilizada'
          });
        } else {
          logger.warn(`❌ Sesión ${session.sessionId} NO existe en servicio`);
          // Marcar como desconectada y continuar
          session.status = 'disconnected';
          session.isConnected = false;
          session.isListening = false;
          session.lastDisconnection = new Date();
          await session.save();
          continue;
        }
      } catch (statusError) {
        logger.warn(`⚠️ Error/timeout validando ${session.sessionId}: ${statusError.message}`);
        
        // 🎯 CAMBIO CRÍTICO: Si es timeout pero la sesión es relativamente reciente, dar beneficio de la duda
        const lastActivity = Math.max(
          session.lastConnection ? new Date(session.lastConnection).getTime() : 0,
          session.lastQRTimestamp ? new Date(session.lastQRTimestamp).getTime() : 0,
          new Date(session.createdAt).getTime()
        );
        
        const timeSinceActivity = now - lastActivity;
        const oneHour = 60 * 60 * 1000;
        
        if (timeSinceActivity < oneHour) {
          logger.info(`🎲 Timeout en sesión ${session.sessionId} pero es relativamente reciente - dando beneficio de la duda`);
          
          whatsAppSocketBridge.subscribeToSession(session.sessionId);
          
          if (session.status === 'qr_ready') {
            socketService.startQRPolling(session.sessionId);
          }
          
          return res.status(200).json({
            success: true,
            data: session,
            isExisting: true,
            message: 'Sesión reutilizada (servicio ocupado o desconectado temporalmente)'
          });
        }
        
        // Para sesiones muy antiguas, marcar como problemáticas
        session.status = 'disconnected';
        session.isConnected = false;
        await session.save();
        continue;
      }
    }
  }
  
  // 🆕 SOLO crear nueva sesión si NO hay ninguna sesión reciente reutilizable
  logger.info(`🆕 Creando nueva sesión para usuario ${userId} - no hay sesiones recientes válidas`);
  
  const sessionId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
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
        setTimeout(() => reject(new Error('Timeout')), 15000) // Aumentado timeout
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
  
  try {
    await messegeController.sendMessagesToN8n(sessionId);
  } catch (error) {
    // Log del error pero no fallar el proceso principal
    logger.warn(`No se pudieron enviar mensajes a n8n para sesión ${sessionId}: ${error.message}`);
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

  logger.info(`🔄 Restaurando sesiones para usuario ${userId} (solo estado de conexión)`);

  // Solo las 5 más recientes para evitar ciclos largos
  const sessions = await Session.find({ userId })
    .sort({ lastConnection: -1, createdAt: -1 })
    .limit(5);

  if (sessions.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        activeSessions: [],
        recommendedAction: 'create_new',
        recommendedSessionId: null,
        message: 'No hay sesiones disponibles, crear nueva sesión 1836',
        timestamp: Date.now()
      }
    });
  }

  // Buscar la PRIMERA sesión realmente conectada (capaz de monitorear)
  let connectedSession = null;

  for (const session of sessions) {
    try {
      // Consulta real al servicio de WhatsApp (timeout 2s)
      const serviceStatus = await Promise.race([
        whatsappClient.getSessionStatus(session.sessionId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 600000))
      ]);
      if (serviceStatus && serviceStatus.isConnected) {
        // Actualiza el estado en BD si hace falta
        if (!session.isConnected || session.status !== 'connected') {
          session.isConnected = true;
          session.status = 'connected';
          await session.save();
        }
        connectedSession = session;
        break;
      }
    } catch (e) {
      // Ignora sesiones caídas/timeouts
      continue;
    }
  }

  if (connectedSession) {
    // Puedes suscribirte aquí si tu flujo lo necesita
    whatsAppSocketBridge.subscribeToSession(connectedSession.sessionId);

    return res.status(200).json({
      success: true,
      data: {
        activeSessions: [
          {
            sessionId: connectedSession.sessionId,
            name: connectedSession.name,
            status: 'connected',
            isConnected: true,
            isListening: connectedSession.isListening,
            lastConnection: connectedSession.lastConnection,
            lastQRTimestamp: connectedSession.lastQRTimestamp,
            createdAt: connectedSession.createdAt,
            recommendation: 'use_immediately',
            priority: 10,
            isValid: true,
            validationResult: 'connected'
          }
        ],
        recommendedAction: 'restore_session',
        recommendedSessionId: connectedSession.sessionId,
        message: 'Sesión conectada encontrada, puede monitorear',
        timestamp: Date.now()
      }
    });
  }

  // Si no hay ninguna conectada, recomienda crear nueva
  return res.status(200).json({
    success: true,
    data: {
      activeSessions: [],
      recommendedAction: 'create_new',
      recommendedSessionId: null,
      message: 'No hay sesiones conectadas, crear nueva 1906',
      timestamp: Date.now()
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