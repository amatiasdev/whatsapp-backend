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
  getOrCreateSession
} = require('../controllers/sessionController');
const { protect, requireEmailVerification } = require('../middleware/auth');

// Proteger todas las rutas con autenticación y verificación de email
router.use(protect);
//router.use(requireEmailVerification);

// Ruta para obtener o crear una sesión para el usuario actual
router.post('/user-session', getOrCreateSession);

// Rutas para administrar sesiones
router.route('/')
  .get(getAllSessions)
  .post(createSession);

router.route('/:sessionId')
  .get(getSessionById)
  .put(updateSession)
  .delete(deleteSession);

// Rutas específicas
router.post('/:sessionId/start-listening', startListening);
router.post('/:sessionId/stop-listening', stopListening);
router.get('/:sessionId/qr', getQRCode);
router.post('/:sessionId/disconnect', disconnectSession);

module.exports = router;