/**
 * @swagger
 * components:
 *   schemas:
 *     Session:
 *       type: object
 *       required:
 *         - sessionId
 *       properties:
 *         sessionId:
 *           type: string
 *           description: Identificador único de la sesión
 *         name:
 *           type: string
 *           description: Nombre descriptivo de la sesión
 *         description:
 *           type: string
 *           description: Descripción detallada de la sesión
 *         isListening:
 *           type: boolean
 *           description: Indica si la sesión está escuchando mensajes
 *         isConnected:
 *           type: boolean
 *           description: Indica si la sesión está conectada a WhatsApp
 *         status:
 *           type: string
 *           enum: [initializing, qr_ready, connected, disconnected, failed]
 *           description: Estado actual de la sesión
 *         userId:
 *           type: string
 *           description: ID del usuario propietario de la sesión
 *         lastConnection:
 *           type: string
 *           format: date-time
 *           description: Última vez que la sesión se conectó
 *         lastQRTimestamp:
 *           type: string
 *           format: date-time
 *           description: Última vez que se generó un código QR
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación de la sesión
 *     
 *     SessionAnalysis:
 *       type: object
 *       properties:
 *         sessionId:
 *           type: string
 *         name:
 *           type: string
 *         status:
 *           type: string
 *         isConnected:
 *           type: boolean
 *         isListening:
 *           type: boolean
 *         recommendation:
 *           type: string
 *           enum: [use_immediately, qr_still_valid, verify_and_use, likely_active, check_status, unknown]
 *         priority:
 *           type: integer
 *           minimum: 0
 *           maximum: 10
 *     
 *     RestoreResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             activeSessions:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SessionAnalysis'
 *             recommendedAction:
 *               type: string
 *               enum: [create_new, restore_session, show_qr, verify_session]
 *             recommendedSessionId:
 *               type: string
 *               nullable: true
 *             message:
 *               type: string
 *             timestamp:
 *               type: integer
 *     
 *     Error:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           description: Mensaje de error
 *
 * /sessions/restore:
 *   get:
 *     summary: Restaura sesiones disponibles al recargar la página
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Análisis de sesiones disponibles para restaurar
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RestoreResponse'
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 *
 * /sessions/user-session:
 *   post:
 *     summary: Obtiene o crea una sesión para el usuario actual
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sesión existente reutilizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Session'
 *                 isExisting:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *       201:
 *         description: Nueva sesión creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Session'
 *                 isExisting:
 *                   type: boolean
 *                   example: false
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado
 *       500:
 *         description: Error del servidor
 *
 * /sessions:
 *   get:
 *     summary: Obtiene todas las sesiones del usuario actual
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de sesiones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Session'
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado
 *       500:
 *         description: Error del servidor
 *
 *   post:
 *     summary: Crea una nueva sesión
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: Identificador único para la sesión
 *               name:
 *                 type: string
 *                 description: Nombre descriptivo
 *               description:
 *                 type: string
 *                 description: Descripción detallada
 *     responses:
 *       201:
 *         description: Sesión creada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Session'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}:
 *   get:
 *     summary: Obtiene una sesión por ID
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Datos de la sesión
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Session'
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado o acceso denegado
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 *   put:
 *     summary: Actualiza una sesión
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               webhookUrl:
 *                 type: string
 *               filters:
 *                 type: object
 *                 properties:
 *                   ignoreBroadcast:
 *                     type: boolean
 *                   ignoreGroups:
 *                     type: boolean
 *                   ignoreNonGroups:
 *                     type: boolean
 *                   allowedGroups:
 *                     type: array
 *                     items:
 *                       type: string
 *                   allowedContacts:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: Sesión actualizada correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado o acceso denegado
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 *   delete:
 *     summary: Elimina una sesión
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Sesión eliminada correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado o acceso denegado
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/quick-status:
 *   get:
 *     summary: Verificación rápida del estado de una sesión específica
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Estado de la sesión verificado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                   enum: [active, qr_ready, uncertain, not_found]
 *                 isConnected:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/wake-up:
 *   post:
 *     summary: Despierta una sesión dormida y reestablece suscripciones
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Sesión despertada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     isConnected:
 *                       type: boolean
 *                     isListening:
 *                       type: boolean
 *                     statusVerified:
 *                       type: boolean
 *                     message:
 *                       type: string
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/start-listening:
 *   post:
 *     summary: Inicia la escucha de mensajes
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Escucha iniciada correctamente
 *       400:
 *         description: Sesión no está conectada o no válida
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado o acceso denegado
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/stop-listening:
 *   post:
 *     summary: Detiene la escucha de mensajes
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Escucha detenida correctamente
 *       400:
 *         description: Sesión no válida
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado o acceso denegado
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/qr:
 *   get:
 *     summary: Obtiene el código QR para iniciar sesión
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Código QR obtenido correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                     qr:
 *                       type: string
 *                       description: Código QR en formato base64
 *       400:
 *         description: Sesión ya conectada o QR no disponible
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado o acceso denegado
 *       404:
 *         description: Sesión no encontrada o QR no disponible
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/disconnect:
 *   post:
 *     summary: Desconecta una sesión
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Sesión desconectada correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado o acceso denegado
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/chats:
 *   get:
 *     summary: Obtiene todos los chats de una sesión
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *       - in: query
 *         name: refresh
 *         schema:
 *           type: boolean
 *         description: Si es true, fuerza la actualización de la caché
 *     responses:
 *       200:
 *         description: Lista de chats obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     chats:
 *                       type: array
 *                       items:
 *                         type: object
 *                     count:
 *                       type: integer
 *       400:
 *         description: Sesión no válida o desconectada
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado o acceso denegado
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/chats/{chatId}/listening:
 *   put:
 *     summary: Actualiza el estado de escucha de un chat
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isListening
 *             properties:
 *               isListening:
 *                 type: boolean
 *                 description: Si debe escuchar el chat
 *     responses:
 *       200:
 *         description: Estado de escucha actualizado correctamente
 *       400:
 *         description: Datos inválidos o sesión no válida
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Email no verificado o acceso denegado
 *       404:
 *         description: Sesión o chat no encontrado
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/force-reinit:
 *   post:
 *     summary: Fuerza la reinicialización de una sesión
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Sesión reinicializada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Session'
 *                 message:
 *                   type: string
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/sync-status:
 *   get:
 *     summary: Sincroniza el estado de la sesión con el servicio de WhatsApp
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Estado sincronizado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                     currentStatus:
 *                       type: object
 *                     serviceStatus:
 *                       type: object
 *                     wasSynced:
 *                       type: boolean
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /sessions/{sessionId}/auto-reinit:
 *   post:
 *     summary: Reinicializa automáticamente una sesión desconectada
 *     tags: [Sesiones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la sesión
 *     responses:
 *       200:
 *         description: Sesión reinicializada automáticamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Session'
 *                 message:
 *                   type: string
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 */

const express = require('express');
const router = express.Router();
const { 
  getAllSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
  startListening,
  stopListening,
  getQRCode,
  disconnectSession,
  getOrCreateSession,
  getSessionChats,
  updateChatListeningStatus,
  forceReinitializeSession,
  checkAndSyncSessionStatus,
  autoReinitializeSession,
  detectDisconnectedSession,
  restoreSessions,
  quickSessionStatus,
  wakeUpSession,
  cleanupOrphanedSessions,
  getValidSessions,
  cleanupSessions,
  getAllSessionsEnhanced,
  validateSessionLimit,
  validateSessionOwnership,
  getSessionStats  
} = require('../controllers/sessionController');
const { protect, requireEmailVerification } = require('../middleware/auth');

// Proteger todas las rutas con autenticación
router.use(protect);

// ========================================
// ENDPOINTS SIN PARÁMETROS (van primero)
// ========================================

// Endpoint para obtener solo sesiones válidas para reconexión
router.get('/valid', getValidSessions);

// Endpoint para obtener estadísticas de sesiones
router.get('/stats', getSessionStats);

// Endpoint para limpiar sesiones expiradas/inválidas
router.delete('/cleanup', cleanupSessions);

// Endpoint específico para restaurar estado de sesión al recargar página
router.get('/restore', restoreSessions);

// Ruta para obtener o crear una sesión para el usuario actual
router.post('/user-session', validateSessionLimit, getOrCreateSession);

// Rutas para administrar sesiones - MEJORADAS CON FILTROS
router.route('/')
  .get(getAllSessionsEnhanced) // Reemplazada con versión mejorada
  .post(validateSessionLimit, createSession); // Agregado middleware de validación

// ========================================
// ENDPOINTS CON PARÁMETROS (van después)
// ========================================

// Endpoint rápido para verificar si una sesión específica sigue activa
// DEBE IR ANTES del middleware de validación de ownership
router.get('/:sessionId/quick-status', validateSessionOwnership, quickSessionStatus);

// Endpoint para "despertar" una sesión dormida
router.post('/:sessionId/wake-up', validateSessionOwnership, wakeUpSession);

// Rutas de mantenimiento y control de sesiones
router.post('/:sessionId/force-reinit', validateSessionOwnership, forceReinitializeSession);
router.get('/:sessionId/sync-status', validateSessionOwnership, checkAndSyncSessionStatus);
router.post('/:sessionId/auto-reinit', validateSessionOwnership, autoReinitializeSession);

// RUTAS QUE REQUIEREN DETECCIÓN DE SESIÓN DESCONECTADA
router.get('/:sessionId/chats', validateSessionOwnership, detectDisconnectedSession, getSessionChats);
router.put('/:sessionId/chats/:chatId/listening', validateSessionOwnership, detectDisconnectedSession, updateChatListeningStatus);
router.post('/:sessionId/start-listening', validateSessionOwnership, detectDisconnectedSession, startListening);
router.post('/:sessionId/stop-listening', validateSessionOwnership, detectDisconnectedSession, stopListening);

// Rutas que NO necesitan middleware de detección pero SÍ validación de ownership
router.get('/:sessionId/qr', validateSessionOwnership, getQRCode);
router.post('/:sessionId/disconnect', validateSessionOwnership, disconnectSession);

// Rutas básicas de CRUD (van al final)
router.route('/:sessionId')
  .get(validateSessionOwnership, getSessionById)
  .put(validateSessionOwnership, updateSession)
  .delete(validateSessionOwnership, deleteSession);

module.exports = router;