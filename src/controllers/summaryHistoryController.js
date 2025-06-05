// src/controllers/simpleSummaryController.js
const SummaryHistory = require('../models/SummaryHistory');
const Session = require('../models/Session');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

/**
 * @desc    Agregar resumen al historial (endpoint simple)
 * @route   POST /api/v1/summaries/history
 * @access  Private
 */
exports.addSummaryToHistory = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const {
    type,
    chatId,
    summary,
    sessionId,
    timestamp,
    summaryType,
    processedMessageCount
  } = req.body;
  
  logger.info(`Agregando resumen al historial para usuario ${userId}`, {
    chatId,
    sessionId,
    summaryType: summaryType || 'automatic'
  });
  
  // ✅ VALIDACIONES REQUERIDAS
  
  // 1. Validar que chatId no esté vacío
  if (!chatId || chatId.trim().length === 0) {
    return next(new ErrorResponse('chatId no puede estar vacío', 400));
  }
  
  // 2. Validar que sessionId esté presente
  if (!sessionId || sessionId.trim().length === 0) {
    return next(new ErrorResponse('sessionId es requerido', 400));
  }
  
  // 3. Validar que summary existe y tiene la estructura correcta
  if (!summary || typeof summary !== 'object') {
    return next(new ErrorResponse('El campo summary es requerido y debe ser un objeto', 400));
  }
  
  // 4. Validar que summary.title contenga texto (NUEVO)
  if (!summary.title || typeof summary.title !== 'string' || summary.title.trim().length === 0) {
    return next(new ErrorResponse('summary.title debe contener texto válido', 400));
  }
  
  // 5. Validar que summary.resumen contenga texto
  if (!summary.resumen || typeof summary.resumen !== 'string' || summary.resumen.trim().length === 0) {
    return next(new ErrorResponse('summary.resumen debe contener texto válido', 400));
  }
  
  // 6. Validar que summary.puntos_clave sea un array
  if (!Array.isArray(summary.puntos_clave) || summary.puntos_clave.length === 0) {
    return next(new ErrorResponse('summary.puntos_clave debe ser un array con al menos un elemento', 400));
  }
  
  // 6. Validar que timestamp sea un número válido
  if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) {
    return next(new ErrorResponse('timestamp debe ser un número válido', 400));
  }
  
  // Validaciones adicionales de seguridad
  if (summary.title.trim().length < 3) {
    return next(new ErrorResponse('El título debe tener al menos 3 caracteres', 400));
  }
  
  if (summary.resumen.trim().length < 10) {
    return next(new ErrorResponse('El resumen debe tener al menos 10 caracteres', 400));
  }
  
  // Validar que todos los puntos clave sean strings válidos
  for (let i = 0; i < summary.puntos_clave.length; i++) {
    const punto = summary.puntos_clave[i];
    if (typeof punto !== 'string' || punto.trim().length === 0) {
      return next(new ErrorResponse(`El punto clave ${i + 1} debe ser un texto válido`, 400));
    }
  }
  
  // Verificar que la sesión pertenece al usuario
  try {
    const session = await Session.findOne({
      sessionId: sessionId.trim(),
      userId,
      deletedAt: { $exists: false }
    });
    
    if (!session) {
      return next(new ErrorResponse('Sesión no encontrada o no tienes permisos para acceder', 404));
    }
    
    // Validar timestamp (no puede ser futuro ni muy antiguo)
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    
    if (timestamp > now + oneHour) {
      return next(new ErrorResponse('El timestamp no puede ser una fecha futura', 400));
    }
    
    if (timestamp < now - thirtyDays) {
      return next(new ErrorResponse('El timestamp no puede ser mayor a 30 días', 400));
    }
    
    // Crear registro en el historial
    const summaryHistory = await SummaryHistory.create({
      chatId: chatId.trim(),
      sessionId: sessionId.trim(),
      title: summary.title.trim(), // 🆕 NUEVO CAMPO
      resumen: summary.resumen.trim(),
      puntos_clave: summary.puntos_clave.map(punto => punto.trim()),
      summaryType: summaryType || 'automatic',
      processedMessageCount: processedMessageCount || 0,
      timestamp: new Date(timestamp),
      userId,
      metadata: {
        type: type || 'summary',
        language: 'es'
      }
    });
    
    logger.info(`Resumen agregado al historial exitosamente`, {
      summaryId: summaryHistory._id,
      chatId: summaryHistory.chatId,
      sessionId: summaryHistory.sessionId,
      userId,
      processedMessageCount: processedMessageCount || 0
    });
    
    // ✅ RESPUESTA ESPERADA EN CASO DE ÉXITO
    res.status(200).json({
      status: "success",
      message: "Resumen agregado al historial exitosamente",
      id: summaryHistory._id.toString(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Error al agregar resumen al historial:`, {
      errorMessage: error.message,
      chatId,
      sessionId,
      userId
    });
    
    // ✅ RESPUESTA ESPERADA EN CASO DE ERROR
    if (error.code === 11000) {
      // Error de duplicado
      return res.status(400).json({
        status: "error",
        message: "Ya existe un resumen similar para este chat y timestamp",
        timestamp: new Date().toISOString()
      });
    }
    
    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor al guardar el resumen",
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @desc    Obtener historial de resúmenes (endpoint simple)
 * @route   GET /api/v1/summaries/history
 * @access  Private
 */
exports.getSummaryHistory = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const {
    chatId,
    sessionId,
    limit = 50,
    page = 1
  } = req.query;
  
  // Construir filtros
  const filters = { userId };
  
  if (chatId) {
    filters.chatId = chatId.trim();
  }
  
  if (sessionId) {
    // Verificar que la sesión pertenece al usuario
    const session = await Session.findOne({
      sessionId: sessionId.trim(),
      userId,
      deletedAt: { $exists: false }
    });
    
    if (!session) {
      return next(new ErrorResponse('Sesión no encontrada o no tienes permisos', 404));
    }
    
    filters.sessionId = sessionId.trim();
  }
  
  // Paginación
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;
  
  try {
    const [summaries, totalCount] = await Promise.all([
      SummaryHistory.find(filters)
        .select('-userId -__v')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SummaryHistory.countDocuments(filters)
    ]);
    
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.status(200).json({
      status: 'success',
      data: summaries,
      pagination: {
        current: pageNum,
        total: totalPages,
        limit: limitNum,
        totalCount,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
    
  } catch (error) {
    logger.error(`Error al obtener historial de resúmenes:`, {
      errorMessage: error.message,
      userId,
      filters
    });
    
    return res.status(500).json({
      status: "error",
      message: "Error al obtener el historial de resúmenes",
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = {
  addSummaryToHistory: exports.addSummaryToHistory,
  getSummaryHistory: exports.getSummaryHistory
};