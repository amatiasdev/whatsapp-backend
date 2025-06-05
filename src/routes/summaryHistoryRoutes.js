// src/routes/simpleSummaryRoutes.js

/**
 * @swagger
 * components:
 *   schemas:
 *     SimpleSummaryInput:
 *       type: object
 *       required:
 *         - type
 *         - chatId
 *         - summary
 *         - sessionId
 *         - timestamp
 *       properties:
 *         type:
 *           type: string
 *           example: "summary"
 *           description: Tipo de contenido
 *         chatId:
 *           type: string
 *           example: "353830412103@c.us"
 *           description: ID del chat de WhatsApp
 *         summary:
 *           type: object
 *           required:
 *             - resumen
 *             - puntos_clave
 *           properties:
 *             resumen:
 *               type: string
 *               description: Texto del resumen
 *               example: "La conversación se centra en la revisión del informe de facturación de abril..."
 *             puntos_clave:
 *               type: array
 *               items:
 *                 type: string
 *               description: Array de puntos clave
 *               example: ["Revisión del informe de facturación de abril", "Aumento en los ingresos superior al 12%"]
 *         sessionId:
 *           type: string
 *           example: "1748523078629-55"
 *           description: ID de la sesión
 *         timestamp:
 *           type: number
 *           example: 1748971594950
 *           description: Timestamp del resumen en milisegundos
 *         summaryType:
 *           type: string
 *           example: "automatic"
 *           description: Tipo de resumen (opcional)
 *         processedMessageCount:
 *           type: number
 *           example: 7
 *           description: Cantidad de mensajes procesados (opcional)
 *     
 *     SimpleSummaryResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: "success"
 *         message:
 *           type: string
 *           example: "Resumen agregado al historial exitosamente"
 *         id:
 *           type: string
 *           example: "64f7b1c2e4b0c8f2a1b3d4e5"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: "2025-01-30T10:41:20.769Z"
 *     
 *     SimpleSummaryError:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: "error"
 *         message:
 *           type: string
 *           example: "Descripción del error"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: "2025-01-30T10:41:20.769Z"
 *
 * /summaries/history:
 *   post:
 *     summary: Agregar resumen al historial (endpoint simple)
 *     tags: [Historial Simple]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SimpleSummaryInput'
 *           example:
 *             type: "summary"
 *             chatId: "353830412103@c.us"
 *             summary:
 *               resumen: "La conversación se centra en la revisión del informe de facturación de abril, donde se destaca un aumento inesperado en los ingresos que superó el 12% de crecimiento."
 *               puntos_clave:
 *                 - "Revisión del informe de facturación de abril."
 *                 - "Aumento en los ingresos superior al 12%."
 *                 - "Identificación de puntos interesantes para analizar junto con el equipo de soporte."
 *             sessionId: "1748523078629-55"
 *             timestamp: 1748971594950
 *             summaryType: "automatic"
 *             processedMessageCount: 7
 *     responses:
 *       200:
 *         description: Resumen agregado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SimpleSummaryResponse'
 *       400:
 *         description: Error en los datos de entrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SimpleSummaryError'
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SimpleSummaryError'
 *   
 *   get:
 *     summary: Obtener historial de resúmenes
 *     tags: [Historial Simple]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: chatId
 *         schema:
 *           type: string
 *         description: Filtrar por ID de chat específico
 *         example: "353830412103@c.us"
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *         description: Filtrar por ID de sesión específica
 *         example: "1748523078629-55"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Número de registros por página
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número de página
 *     responses:
 *       200:
 *         description: Lista de resúmenes obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       chatId:
 *                         type: string
 *                       sessionId:
 *                         type: string
 *                       resumen:
 *                         type: string
 *                       puntos_clave:
 *                         type: array
 *                         items:
 *                           type: string
 *                       summaryType:
 *                         type: string
 *                       processedMessageCount:
 *                         type: number
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     current:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalCount:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const { 
  addSummaryToHistory, 
  getSummaryHistory 
} = require('../controllers/summaryHistoryController');
const { protect, requireEmailVerification } = require('../middleware/auth');
const { validationResult } = require('express-validator');

// Middleware de validación de errores simple
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    return res.status(400).json({
      status: 'error',
      message: firstError.msg,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

// Middleware de rate limiting simple
const summaryRateLimit = (req, res, next) => {
  // Rate limiting básico usando memoria (en producción usar Redis)
  const userId = req.user?.id;
  if (!userId) return next();
  
  const now = Date.now();
  const windowMs = 60000; // 1 minuto
  const maxRequests = 10;
  
  // Simular rate limiting (en producción usar una solución más robusta)
  if (!global.summaryRateCache) {
    global.summaryRateCache = new Map();
  }
  
  const userRequests = global.summaryRateCache.get(userId) || [];
  const recentRequests = userRequests.filter(timestamp => now - timestamp < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    return res.status(429).json({
      status: 'error',
      message: 'Demasiadas solicitudes. Máximo 10 resúmenes por minuto.',
      timestamp: new Date().toISOString()
    });
  }
  
  recentRequests.push(now);
  global.summaryRateCache.set(userId, recentRequests);
  
  next();
};

// Proteger todas las rutas
router.use(protect);
router.use(requireEmailVerification);

// Validaciones específicas para POST /summaries/history
const validateAddSummary = [
  body('type')
    .optional()
    .isString()
    .trim(),
  
  body('chatId')
    .notEmpty()
    .withMessage('chatId es requerido')
    .isString()
    .withMessage('chatId debe ser un string')
    .isLength({ min: 1, max: 100 })
    .withMessage('chatId debe tener entre 1 y 100 caracteres')
    .trim(),
  
  body('summary')
    .exists()
    .withMessage('El campo summary es requerido')
    .isObject()
    .withMessage('summary debe ser un objeto'),
  
  body('summary.title')
    .notEmpty()
    .withMessage('summary.title es requerido')
    .isString()
    .withMessage('summary.title debe ser un string')
    .isLength({ min: 3, max: 200 })
    .withMessage('summary.title debe tener entre 3 y 200 caracteres')
    .trim(),
  
  body('summary.resumen')
    .notEmpty()
    .withMessage('summary.resumen es requerido')
    .isString()
    .withMessage('summary.resumen debe ser un string')
    .isLength({ min: 10, max: 5000 })
    .withMessage('summary.resumen debe tener entre 10 y 5000 caracteres')
    .trim(),
  
  body('summary.puntos_clave')
    .isArray({ min: 1 })
    .withMessage('summary.puntos_clave debe ser un array con al menos un elemento'),
  
  body('summary.puntos_clave.*')
    .isString()
    .withMessage('Cada punto clave debe ser un string')
    .isLength({ min: 1, max: 500 })
    .withMessage('Cada punto clave debe tener entre 1 y 500 caracteres')
    .trim(),
  
  body('sessionId')
    .notEmpty()
    .withMessage('sessionId es requerido')
    .isString()
    .withMessage('sessionId debe ser un string')
    .isLength({ min: 1, max: 100 })
    .withMessage('sessionId debe tener entre 1 y 100 caracteres')
    .trim(),
  
  body('timestamp')
    .isNumeric()
    .withMessage('timestamp debe ser un número')
    .custom((value) => {
      const timestamp = parseInt(value);
      if (timestamp <= 0) {
        throw new Error('timestamp debe ser un número positivo');
      }
      
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      
      if (timestamp > now + oneHour) {
        throw new Error('timestamp no puede ser una fecha futura');
      }
      
      if (timestamp < now - thirtyDays) {
        throw new Error('timestamp no puede ser mayor a 30 días');
      }
      
      return true;
    }),
  
  body('summaryType')
    .optional()
    .isString()
    .isIn(['automatic', 'manual', 'scheduled'])
    .withMessage('summaryType debe ser: automatic, manual o scheduled'),
  
  body('processedMessageCount')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('processedMessageCount debe ser un entero entre 0 y 10000'),
  
  handleValidationErrors
];

// Validaciones para GET /summaries/history
const validateGetHistory = [
  query('chatId')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('chatId debe tener entre 1 y 100 caracteres')
    .trim(),
  
  query('sessionId')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('sessionId debe tener entre 1 y 100 caracteres')
    .trim(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit debe ser un entero entre 1 y 100'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page debe ser un entero mayor a 0'),
  
  handleValidationErrors
];

// ============================
// 🎯 ENDPOINT PRINCIPAL REQUERIDO
// ============================

// POST /api/v1/summaries/history - Agregar resumen al historial
router.post('/history', 
  summaryRateLimit,
  validateAddSummary,
  addSummaryToHistory
);

// GET /api/v1/summaries/history - Obtener historial (funcionalidad extra)
router.get('/history',
  validateGetHistory,
  getSummaryHistory
);

// ============================
// 📄 ENDPOINT DE INFORMACIÓN
// ============================

// GET /api/v1/summaries/info - Información sobre el endpoint
router.get('/info', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Información sobre el endpoint de historial de resúmenes',
    endpoint: {
      method: 'POST',
      path: '/api/v1/summaries/history',
      description: 'Agregar resúmenes estructurados al historial',
      requiredFields: [
        'chatId',
        'summary.title',
        'summary.resumen',
        'summary.puntos_clave',
        'sessionId',
        'timestamp'
      ],
      optionalFields: [
        'type',
        'summaryType',
        'processedMessageCount'
      ],
      authentication: 'Bearer token requerido',
      rateLimit: '10 requests/minute'
    },
    dataStructure: {
      type: 'summary',
      chatId: '353830412103@c.us',
      summary: {
        title: 'Análisis del Informe de Facturación de Abril',
        resumen: 'Texto del resumen...',
        puntos_clave: ['Punto 1', 'Punto 2', 'Punto 3']
      },
      sessionId: '1748523078629-55',
      timestamp: 1748971594950,
      summaryType: 'automatic',
      processedMessageCount: 7
    },
    responses: {
      success: {
        status: 'success',
        message: 'Resumen agregado al historial exitosamente',
        id: 'generated-uuid-or-id',
        timestamp: '2025-01-30T10:41:20.769Z'
      },
      error: {
        status: 'error',
        message: 'Descripción del error',
        timestamp: '2025-01-30T10:41:20.769Z'
      }
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;