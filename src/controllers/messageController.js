const Message = require('../models/Message');
const Session = require('../models/Session');
const Contact = require('../models/Contact');
const messageService = require('../services/messageService');
const whatsappClient = require('../services/whatsappClient');
const logger = require('../utils/logger');

// Procesar mensajes entrantes (webhook)
exports.processIncomingMessages = async (req, res) => {
  try {
    const payload = req.body;
    
    // Validar estructura del payload
    if (!payload || !payload.sessionId || !payload.messages || !Array.isArray(payload.messages)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de payload inválido'
      });
    }
    
    // Procesar mensajes
    const result = await messageService.processIncomingMessages(payload);
    
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error(`Error al procesar mensajes entrantes: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al procesar mensajes entrantes'
    });
  }
};

// Obtener mensajes por chat y sesión
exports.getMessages = async (req, res) => {
  try {
    const { sessionId, chatId } = req.params;
    const { limit = 50, before, messageId, includeMedia } = req.query;
    
    // Verificar si existe la sesión
    const sessionExists = await Session.exists({ sessionId });
    if (!sessionExists) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Obtener mensajes
    const messages = await messageService.getMessages(sessionId, chatId, {
      limit: parseInt(limit),
      before: before ? parseInt(before) : Date.now(),
      messageId,
      includeMedia: includeMedia === 'true'
    });
    
    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages
    });
  } catch (error) {
    logger.error(`Error al obtener mensajes: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mensajes'
    });
  }
};

// Obtener chats para una sesión
exports.getChats = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verificar si existe la sesión
    const sessionExists = await Session.exists({ sessionId });
    if (!sessionExists) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Obtener chats
    const chats = await messageService.getChats(sessionId);
    
    res.status(200).json({
      success: true,
      count: chats.length,
      data: chats
    });
  } catch (error) {
    logger.error(`Error al obtener chats: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener chats'
    });
  }
};

// Enviar mensaje de texto
exports.sendTextMessage = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { to, text } = req.body;
    
    // Validar campos requeridos
    if (!to || !text) {
      return res.status(400).json({
        success: false,
        error: 'Destinatario (to) y texto (text) son requeridos'
      });
    }
    
    // Verificar si existe la sesión
    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Verificar si está conectada
    if (!session.isConnected) {
      return res.status(400).json({
        success: false,
        error: 'La sesión debe estar conectada para enviar mensajes'
      });
    }
    
    // Enviar mensaje
    const result = await whatsappClient.sendTextMessage(sessionId, to, text);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`Error al enviar mensaje de texto: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al enviar mensaje de texto'
    });
  }
};

// Enviar mensaje con media
exports.sendMediaMessage = async (req, res) => {
  try {
    const { sessionId, mediaType } = req.params;
    const { to, media, caption } = req.body;
    
    // Validar campos requeridos
    if (!to || !media) {
      return res.status(400).json({
        success: false,
        error: 'Destinatario (to) y media son requeridos'
      });
    }
    
    // Validar tipo de media
    const validMediaTypes = ['image', 'video', 'audio', 'document', 'sticker'];
    if (!validMediaTypes.includes(mediaType)) {
      return res.status(400).json({
        success: false,
        error: `Tipo de media inválido. Debe ser uno de: ${validMediaTypes.join(', ')}`
      });
    }
    
    // Verificar si existe la sesión
    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Verificar si está conectada
    if (!session.isConnected) {
      return res.status(400).json({
        success: false,
        error: 'La sesión debe estar conectada para enviar mensajes'
      });
    }
    
    // Enviar mensaje con media
    const result = await whatsappClient.sendMedia(sessionId, to, mediaType, media, caption);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`Error al enviar mensaje con media: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al enviar mensaje con media'
    });
  }
};

// Eliminar mensajes antiguos (útil para mantenimiento)
exports.deleteOldMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { days = 30 } = req.body;
    
    // Validar días
    const daysToKeep = parseInt(days);
    if (isNaN(daysToKeep) || daysToKeep < 1) {
      return res.status(400).json({
        success: false,
        error: 'El número de días debe ser un entero positivo'
      });
    }
    
    // Verificar si existe la sesión
    const sessionExists = await Session.exists({ sessionId });
    if (!sessionExists) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Eliminar mensajes antiguos
    const result = await Message.deleteOldMessages(sessionId, daysToKeep);
    
    res.status(200).json({
      success: true,
      deleted: result.deletedCount || 0,
      daysKept: daysToKeep
    });
  } catch (error) {
    logger.error(`Error al eliminar mensajes antiguos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar mensajes antiguos'
    });
  }
};

module.exports = exports;