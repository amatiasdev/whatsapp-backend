// src/middleware/sessionValidation.js
const { body, query, param } = require('express-validator');
const { validationResult } = require('express-validator');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

/**
 * Middleware para manejar errores de validación
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));
    
    logger.warn('Errores de validación en sesiones:', {
      path: req.path,
      method: req.method,
      errors: errorMessages,
      userId: req.user?.id
    });
    
    return res.status(400).json({
      success: false,
      error: 'Errores de validación',
      details: errorMessages
    });
  }
  
  next();
};

/**
 * Validaciones para crear sesión
 */
const validateCreateSession = [
  body('sessionId')
    .notEmpty()
    .withMessage('El ID de sesión es requerido')
    .isLength({ min: 3, max: 50 })
    .withMessage('El ID de sesión debe tener entre 3 y 50 caracteres')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('El ID de sesión solo puede contener letras, números, guiones y guiones bajos'),
  
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('El nombre debe tener entre 1 y 100 caracteres')
    .trim(),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('La descripción no puede exceder 500 caracteres')
    .trim(),
  
  handleValidationErrors
];

/**
 * Validaciones para actualizar sesión
 */
const validateUpdateSession = [
  param('sessionId')
    .notEmpty()
    .withMessage('El ID de sesión es requerido'),
  
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('El nombre debe tener entre 1 y 100 caracteres')
    .trim(),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('La descripción no puede exceder 500 caracteres')
    .trim(),
  
  body('webhookUrl')
    .optional()
    .isURL()
    .withMessage('La URL del webhook debe ser válida'),
  
  body('filters.ignoreBroadcast')
    .optional()
    .isBoolean()
    .withMessage('ignoreBroadcast debe ser un valor booleano'),
  
  body('filters.ignoreGroups')
    .optional()
    .isBoolean()
    .withMessage('ignoreGroups debe ser un valor booleano'),
  
  body('filters.ignoreNonGroups')
    .optional()
    .isBoolean()
    .withMessage('ignoreNonGroups debe ser un valor booleano'),
  
  body('filters.allowedGroups')
    .optional()
    .isArray()
    .withMessage('allowedGroups debe ser un array'),
  
  body('filters.allowedContacts')
    .optional()
    .isArray()
    .withMessage('allowedContacts debe ser un array'),
  
  handleValidationErrors
];

/**
 * Validaciones para obtener sesiones con filtros
 */
const validateGetSessions = [
  query('status')
    .optional()
    .custom((value) => {
      const validStatuses = ['initializing', 'qr_ready', 'connected', 'disconnected', 'failed', 'deleted'];
      const statuses = value.split(',');
      const invalidStatuses = statuses.filter(status => !validStatuses.includes(status.trim()));
      
      if (invalidStatuses.length > 0) {
        throw new Error(`Estados inválidos: ${invalidStatuses.join(', ')}. Estados válidos: ${validStatuses.join(', ')}`);
      }
      
      return true;
    }),
  
  query('reconnectable')
    .optional()
    .isBoolean()
    .withMessage('reconnectable debe ser true o false'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La página debe ser un número entero mayor a 0'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('El límite debe ser un número entero entre 1 y 50'),
  
  query('sortBy')
    .optional()
    .isIn(['lastActivity', 'lastConnection', 'createdAt', 'name'])
    .withMessage('sortBy debe ser uno de: lastActivity, lastConnection, createdAt, name'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sortOrder debe ser asc o desc'),
  
  query('includeDeleted')
    .optional()
    .isBoolean()
    .withMessage('includeDeleted debe ser true o false'),
  
  handleValidationErrors
];

/**
 * Validaciones para limpieza de sesiones
 */
const validateCleanupSessions = [
  query('force')
    .optional()
    .isBoolean()
    .withMessage('force debe ser true o false'),
  
  query('daysOld')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('daysOld debe ser un número entero entre 1 y 365'),
  
  handleValidationErrors
];

/**
 * Validaciones para parámetros de sesión
 */
const validateSessionParam = [
  param('sessionId')
    .notEmpty()
    .withMessage('El ID de sesión es requerido')
    .isLength({ min: 3, max: 50 })
    .withMessage('El ID de sesión debe tener entre 3 y 50 caracteres'),
  
  handleValidationErrors
];

/**
 * Validaciones para actualizar estado de escucha de chat
 */
const validateChatListening = [
  param('sessionId')
    .notEmpty()
    .withMessage('El ID de sesión es requerido'),
  
  param('chatId')
    .notEmpty()
    .withMessage('El ID de chat es requerido'),
  
  body('isListening')
    .notEmpty()
    .withMessage('isListening es requerido')
    .isBoolean()
    .withMessage('isListening debe ser un valor booleano'),
  
  handleValidationErrors
];

/**
 * Validaciones para enviar mensaje de texto
 */
const validateSendTextMessage = [
  param('sessionId')
    .notEmpty()
    .withMessage('El ID de sesión es requerido'),
  
  body('to')
    .notEmpty()
    .withMessage('El destinatario (to) es requerido')
    .isLength({ min: 5 })
    .withMessage('El destinatario debe tener al menos 5 caracteres'),
  
  body('text')
    .notEmpty()
    .withMessage('El texto del mensaje es requerido')
    .isLength({ min: 1, max: 4096 })
    .withMessage('El texto debe tener entre 1 y 4096 caracteres'),
  
  handleValidationErrors
];

/**
 * Validaciones para enviar mensaje multimedia
 */
const validateSendMediaMessage = [
  param('sessionId')
    .notEmpty()
    .withMessage('El ID de sesión es requerido'),
  
  param('mediaType')
    .notEmpty()
    .withMessage('El tipo de media es requerido')
    .isIn(['image', 'video', 'audio', 'document', 'sticker'])
    .withMessage('El tipo de media debe ser: image, video, audio, document o sticker'),
  
  body('to')
    .notEmpty()
    .withMessage('El destinatario (to) es requerido')
    .isLength({ min: 5 })
    .withMessage('El destinatario debe tener al menos 5 caracteres'),
  
  body('media')
    .notEmpty()
    .withMessage('El archivo multimedia (media) es requerido'),
  
  body('caption')
    .optional()
    .isLength({ max: 1024 })
    .withMessage('El caption no puede exceder 1024 caracteres'),
  
  handleValidationErrors
];

/**
 * Middleware de sanitización para prevenir inyecciones
 */
const sanitizeInputs = (req, res, next) => {
  // Sanitizar strings para prevenir inyecciones
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remover scripts
      .replace(/javascript:/gi, '') // Remover javascript:
      .replace(/on\w+\s*=/gi, '') // Remover eventos onclick, onload, etc.
      .trim();
  };
  
  // Sanitizar el body recursivamente
  const sanitizeObject = (obj) => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };
  
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  next();
};

/**
 * Middleware de rate limiting específico para sesiones
 */
const sessionRateLimit = (maxRequests = 10, windowMs = 60000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return next();
    
    const now = Date.now();
    const userRequests = requests.get(userId) || [];
    
    // Filtrar requests dentro de la ventana de tiempo
    const recentRequests = userRequests.filter(timestamp => now - timestamp < windowMs);
    
    if (recentRequests.length >= maxRequests) {
      logger.warn(`Rate limit excedido para usuario ${userId}`, {
        path: req.path,
        method: req.method,
        requestCount: recentRequests.length,
        maxRequests,
        windowMs
      });
      
      return res.status(429).json({
        success: false,
        error: `Demasiadas solicitudes. Máximo ${maxRequests} por minuto.`,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Agregar request actual
    recentRequests.push(now);
    requests.set(userId, recentRequests);
    
    // Limpiar requests antiguos periódicamente
    if (Math.random() < 0.1) { // 10% de probabilidad
      for (const [uid, timestamps] of requests.entries()) {
        const filtered = timestamps.filter(t => now - t < windowMs);
        if (filtered.length === 0) {
          requests.delete(uid);
        } else {
          requests.set(uid, filtered);
        }
      }
    }
    
    next();
  };
};

module.exports = {
  validateCreateSession,
  validateUpdateSession,
  validateGetSessions,
  validateCleanupSessions,
  validateSessionParam,
  validateChatListening,
  validateSendTextMessage,
  validateSendMediaMessage,
  sanitizeInputs,
  sessionRateLimit,
  handleValidationErrors
};