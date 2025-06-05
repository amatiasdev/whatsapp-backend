// src/routes/whatsappRoutes.js
const express = require('express');
const router = express.Router();
const { receiveWhatsAppMessage } = require('../controllers/whatsappMessageController');

/**
 * @swagger
 * components:
 *   schemas:
 *     WhatsAppMessage:
 *       type: object
 *       required:
 *         - sessionId
 *         - message
 *         - chat
 *       properties:
 *         sessionId:
 *           type: string
 *           description: ID de la sesión de WhatsApp
 *         serviceVersion:
 *           type: string
 *           description: Versión del microservicio WhatsApp
 *         timestamp:
 *           type: number
 *           description: Timestamp de cuando se procesó en el microservicio
 *         capturedAt:
 *           type: number
 *           description: Timestamp original del mensaje de WhatsApp
 *         message:
 *           type: object
 *           required:
 *             - id
 *             - from
 *             - to
 *           properties:
 *             id:
 *               type: string
 *               description: ID único del mensaje
 *             from:
 *               type: string
 *               description: ID del chat (número o grupo)
 *             to:
 *               type: string
 *               description: ID destino
 *             body:
 *               type: string
 *               description: Texto del mensaje
 *             timestamp:
 *               type: number
 *               description: Timestamp original del mensaje
 *             type:
 *               type: string
 *               enum: [text, image, video, audio, document, sticker, ptt]
 *               description: Tipo de mensaje
 *             hasMedia:
 *               type: boolean
 *               description: Si el mensaje tiene contenido multimedia
 *             isForwarded:
 *               type: boolean
 *               description: Si el mensaje fue reenviado
 *             isStatus:
 *               type: boolean
 *               description: Si es un mensaje de estado
 *             deviceType:
 *               type: string
 *               nullable: true
 *               description: Tipo de dispositivo que envió el mensaje
 *         chat:
 *           type: object
 *           required:
 *             - id
 *             - isGroup
 *           properties:
 *             id:
 *               type: string
 *               description: ID del chat
 *             isGroup:
 *               type: boolean
 *               description: Si es un grupo
 *             name:
 *               type: string
 *               nullable: true
 *               description: Nombre del chat o grupo
 *         contact:
 *           type: object
 *           nullable: true
 *           description: Información del contacto (solo mensajes privados)
 *           properties:
 *             id:
 *               type: string
 *             number:
 *               type: string
 *             name:
 *               type: string
 *               nullable: true
 *             savedName:
 *               type: string
 *               nullable: true
 *             pushname:
 *               type: string
 *               nullable: true
 *             isMyContact:
 *               type: boolean
 *             profilePictureUrl:
 *               type: string
 *               nullable: true
 *         group:
 *           type: object
 *           nullable: true
 *           description: Información del grupo (solo mensajes de grupo)
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             participantsCount:
 *               type: number
 *             profilePictureUrl:
 *               type: string
 *               nullable: true
 *         author:
 *           type: object
 *           nullable: true
 *           description: Autor del mensaje (solo mensajes de grupo)
 *           properties:
 *             id:
 *               type: string
 *             number:
 *               type: string
 *             name:
 *               type: string
 *             savedName:
 *               type: string
 *               nullable: true
 *             pushname:
 *               type: string
 *               nullable: true
 *         media:
 *           type: object
 *           nullable: true
 *           description: Metadata de archivo multimedia (solo si hasMedia es true)
 *           properties:
 *             type:
 *               type: string
 *               enum: [image, video, audio, ptt, document, sticker]
 *             mimeType:
 *               type: string
 *               example: image/jpeg
 *             filename:
 *               type: string
 *             filesize:
 *               type: number
 *             duration:
 *               type: number
 *               nullable: true
 *             width:
 *               type: number
 *               nullable: true
 *             height:
 *               type: number
 *               nullable: true
 *             isViewOnce:
 *               type: boolean
 *     
 *     WhatsAppMessageResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         messageId:
 *           type: string
 *           description: ID del mensaje procesado
 *         processed:
 *           type: boolean
 *           description: Si el mensaje fue procesado exitosamente
 *         timestamp:
 *           type: number
 *           description: Timestamp de cuando se procesó
 *         duplicate:
 *           type: boolean
 *           description: Si el mensaje era duplicado (opcional)
 *     
 *     WhatsAppMessageError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           description: Descripción del error
 *         messageId:
 *           type: string
 *           nullable: true
 *           description: ID del mensaje si está disponible
 *
 * /whatsapp/messages:
 *   post:
 *     summary: Recibir mensaje individual desde microservicio WhatsApp
 *     tags: [WhatsApp]
 *     description: |
 *       Endpoint para recibir y almacenar mensajes individuales enviados desde el microservicio de WhatsApp.
 *       Este endpoint es llamado automáticamente por el microservicio cuando se recibe un nuevo mensaje.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WhatsAppMessage'
 *           examples:
 *             mensajeTextoPrivado:
 *               summary: Mensaje de texto privado
 *               value:
 *                 sessionId: "session_123"
 *                 serviceVersion: "1.0.0"
 *                 timestamp: 1699123456789
 *                 capturedAt: 1699123456000
 *                 message:
 *                   id: "msg_abc123"
 *                   from: "5211234567890@c.us"
 *                   to: "5219876543210@c.us"
 *                   body: "Hola, ¿cómo estás?"
 *                   timestamp: 1699123456000
 *                   type: "text"
 *                   hasMedia: false
 *                   isForwarded: false
 *                   isStatus: false
 *                   deviceType: "android"
 *                 chat:
 *                   id: "5211234567890@c.us"
 *                   isGroup: false
 *                   name: "Juan Pérez"
 *                 contact:
 *                   id: "5211234567890@c.us"
 *                   number: "5211234567890"
 *                   name: "Juan Pérez"
 *                   savedName: "Juan"
 *                   pushname: "Juan"
 *                   isMyContact: true
 *                   profilePictureUrl: "https://example.com/avatar.jpg"
 *             mensajeGrupo:
 *               summary: Mensaje de grupo
 *               value:
 *                 sessionId: "session_456"
 *                 serviceVersion: "1.0.0"
 *                 timestamp: 1699123456789
 *                 capturedAt: 1699123456000
 *                 message:
 *                   id: "msg_def456"
 *                   from: "120363012345678901@g.us"
 *                   to: "5219876543210@c.us"
 *                   body: "¡Hola grupo!"
 *                   timestamp: 1699123456000
 *                   type: "text"
 *                   hasMedia: false
 *                   isForwarded: false
 *                   isStatus: false
 *                   deviceType: "web"
 *                 chat:
 *                   id: "120363012345678901@g.us"
 *                   isGroup: true
 *                   name: "Grupo de Trabajo"
 *                 group:
 *                   id: "120363012345678901@g.us"
 *                   name: "Grupo de Trabajo"
 *                   participantsCount: 15
 *                   profilePictureUrl: "https://example.com/group.jpg"
 *                 author:
 *                   id: "5211234567890@c.us"
 *                   number: "5211234567890"
 *                   name: "María López"
 *                   savedName: "María"
 *                   pushname: "María"
 *             mensajeConMedia:
 *               summary: Mensaje con archivo multimedia
 *               value:
 *                 sessionId: "session_789"
 *                 serviceVersion: "1.0.0"
 *                 timestamp: 1699123456789
 *                 capturedAt: 1699123456000
 *                 message:
 *                   id: "msg_ghi789"
 *                   from: "5211234567890@c.us"
 *                   to: "5219876543210@c.us"
 *                   body: "Mira esta foto"
 *                   timestamp: 1699123456000
 *                   type: "image"
 *                   hasMedia: true
 *                   isForwarded: false
 *                   isStatus: false
 *                   deviceType: "ios"
 *                 chat:
 *                   id: "5211234567890@c.us"
 *                   isGroup: false
 *                   name: "Ana García"
 *                 contact:
 *                   id: "5211234567890@c.us"
 *                   number: "5211234567890"
 *                   name: "Ana García"
 *                   savedName: "Ana"
 *                   pushname: "Ana"
 *                   isMyContact: true
 *                   profilePictureUrl: null
 *                 media:
 *                   type: "image"
 *                   mimeType: "image/jpeg"
 *                   filename: "IMG_20231104_142536.jpg"
 *                   filesize: 2048576
 *                   width: 1920
 *                   height: 1080
 *                   isViewOnce: false
 *     responses:
 *       200:
 *         description: Mensaje procesado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WhatsAppMessageResponse'
 *             examples:
 *               exitoso:
 *                 summary: Procesamiento exitoso
 *                 value:
 *                   success: true
 *                   messageId: "msg_abc123"
 *                   processed: true
 *                   timestamp: 1699123456789
 *               duplicado:
 *                 summary: Mensaje duplicado
 *                 value:
 *                   success: true
 *                   messageId: "msg_abc123"
 *                   processed: false
 *                   duplicate: true
 *                   timestamp: 1699123456789
 *       400:
 *         description: Payload inválido o campos faltantes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WhatsAppMessageError'
 *             examples:
 *               camposFaltantes:
 *                 summary: Campos requeridos faltantes
 *                 value:
 *                   success: false
 *                   error: "Payload inválido: faltan campos requeridos (sessionId, message, chat)"
 *                   messageId: null
 *               mensajeInvalido:
 *                 summary: Mensaje con campos críticos faltantes
 *                 value:
 *                   success: false
 *                   error: "Mensaje inválido: faltan campos críticos (id, from, to)"
 *                   messageId: "msg_abc123"
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WhatsAppMessageError'
 *             example:
 *               success: false
 *               error: "Error interno al procesar mensaje"
 *               messageId: "msg_abc123"
 */

// 📥 Endpoint principal para recibir mensajes del microservicio WhatsApp
router.post('/messages', receiveWhatsAppMessage);

module.exports = router;