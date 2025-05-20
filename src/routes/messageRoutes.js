
/**
 * @swagger
 * components:
 *   schemas:
 *     Message:
 *       type: object
 *       properties:
 *         messageId:
 *           type: string
 *           description: ID único del mensaje
 *         sessionId:
 *           type: string
 *           description: ID de la sesión a la que pertenece
 *         chatId:
 *           type: string
 *           description: ID del chat (contacto o grupo)
 *         from:
 *           type: string
 *           description: Remitente del mensaje
 *         fromMe:
 *           type: boolean
 *           description: Indica si el mensaje fue enviado por nosotros
 *         to:
 *           type: string
 *           description: Destinatario del mensaje
 *         body:
 *           type: string
 *           description: Contenido del mensaje
 *         timestamp:
 *           type: integer
 *           description: Timestamp del mensaje
 *         type:
 *           type: string
 *           enum: [chat, image, video, audio, ptt, document, location, contact, sticker]
 *           description: Tipo de mensaje
 *         hasMedia:
 *           type: boolean
 *           description: Indica si el mensaje tiene contenido multimedia
 *         isGroupMessage:
 *           type: boolean
 *           description: Indica si el mensaje es de un grupo
 *         contactName:
 *           type: string
 *           description: Nombre del contacto
 *
 * /messages/webhook:
 *   post:
 *     summary: Webhook para recibir mensajes (usado por el servicio de WhatsApp)
 *     tags: [Mensajes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionId:
 *                 type: string
 *               chatId:
 *                 type: string
 *               messages:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Message'
 *     responses:
 *       200:
 *         description: Mensajes procesados correctamente
 *       400:
 *         description: Payload inválido
 *       500:
 *         description: Error del servidor
 *
 * /messages/sessions/{sessionId}/chats:
 *   get:
 *     summary: Obtener todos los chats de una sesión
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sesión
 *     responses:
 *       200:
 *         description: Lista de chats
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /messages/sessions/{sessionId}/chats/{chatId}/messages:
 *   get:
 *     summary: Obtener mensajes de un chat específico
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sesión
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del chat
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Número máximo de mensajes a retornar
 *       - in: query
 *         name: before
 *         schema:
 *           type: integer
 *         description: Timestamp para paginar mensajes
 *       - in: query
 *         name: includeMedia
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Incluir mensajes con media
 *     responses:
 *       200:
 *         description: Lista de mensajes
 *       404:
 *         description: Sesión o chat no encontrado
 *       500:
 *         description: Error del servidor
 *
 * /messages/sessions/{sessionId}/send/message:
 *   post:
 *     summary: Enviar mensaje de texto
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sesión
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - text
 *             properties:
 *               to:
 *                 type: string
 *                 description: Número de teléfono o ID de chat
 *                 example: "5512345678@c.us"
 *               text:
 *                 type: string
 *                 description: Contenido del mensaje
 *     responses:
 *       200:
 *         description: Mensaje enviado correctamente
 *       400:
 *         description: Parámetros inválidos
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 *
 * /messages/sessions/{sessionId}/send/{mediaType}:
 *   post:
 *     summary: Enviar mensaje multimedia
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sesión
 *       - in: path
 *         name: mediaType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [image, video, audio, document, sticker]
 *         description: Tipo de medio
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - media
 *             properties:
 *               to:
 *                 type: string
 *                 description: Número de teléfono o ID de chat
 *               media:
 *                 type: string
 *                 description: URL o Base64 del archivo multimedia
 *               caption:
 *                 type: string
 *                 description: Texto opcional que acompaña al medio
 *     responses:
 *       200:
 *         description: Mensaje enviado correctamente
 *       400:
 *         description: Parámetros inválidos
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error del servidor
 */

const express = require('express');
const router = express.Router();
const { 
  processIncomingMessages,
  getMessages,
  getChats,
  sendTextMessage,
  sendMediaMessage,
  deleteOldMessages
} = require('../controllers/messageController');
const { protect, authorize } = require('../middleware/auth');

// Webhook para recibir mensajes (no requiere autenticación)
router.post('/webhook', processIncomingMessages);

// Proteger el resto de rutas
router.use(protect);

// Rutas para obtener mensajes
router.get('/sessions/:sessionId/chats', getChats);
router.get('/sessions/:sessionId/chats/:chatId/messages', getMessages);

// Rutas para enviar mensajes
router.post('/sessions/:sessionId/send/message', sendTextMessage);
router.post('/sessions/:sessionId/send/:mediaType', sendMediaMessage);

// Rutas para mantenimiento
router.post('/sessions/:sessionId/cleanup', deleteOldMessages);

module.exports = router;