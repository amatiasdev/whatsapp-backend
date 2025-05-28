const Message = require('../models/Message');
const Session = require('../models/Session');
const Contact = require('../models/Contact');
const messageService = require('../services/messageService');
const whatsappClient = require('../services/whatsappClient');
const logger = require('../utils/logger');
const axios = require('axios'); // AGREGAR ESTA LÍNEA

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

// Obtener chats para una sesión (DESDE BASE DE DATOS)
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

// NUEVO MÉTODO: Obtener chats directamente desde WhatsApp Web
exports.getWhatsAppChats = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { 
      refresh = 'false', 
      limit = '50', 
      offset = '0',
      basic = 'false'
    } = req.query;

    // Verificar que la sesión existe en la BD
    const session = await Session.findOne({ sessionId, userId: req.user.id });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }

    // Verificar que la sesión esté conectada
    if (session.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'La sesión no está conectada',
        currentStatus: session.status
      });
    }

    const forceRefresh = refresh === 'true';
    const isBasic = basic === 'true';
    const chatLimit = Math.min(parseInt(limit) || 50, 100);
    const chatOffset = parseInt(offset) || 0;

    logger.info(`Obteniendo chats de WhatsApp para sesión ${sessionId}`, {
      refresh: forceRefresh,
      basic: isBasic,
      limit: chatLimit,
      offset: chatOffset
    });

    // Construir URL del servicio de WhatsApp
    const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';
    let url = `${whatsappServiceUrl}/api/sessions/${sessionId}/chats`;
    
    // Agregar parámetros de consulta
    const params = new URLSearchParams({
      refresh: refresh,
      limit: limit,
      offset: offset
    });
    
    if (isBasic) {
      params.append('basic', 'true');
    }
    
    url += '?' + params.toString();

    // Llamar al servicio de WhatsApp con timeout optimizado
    const response = await axios.get(url, {
      timeout: 45000, // 45 segundos
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const chatData = response.data;
    
    // Si refresh es true, actualizar timestamp de la sesión
    if (forceRefresh) {
      await Session.findOneAndUpdate(
        { sessionId, userId: req.user.id },
        { lastActivity: new Date() }
      );
    }

    // Log para debugging
    logger.info(`Obtenidos ${chatData.chats?.length || 0} chats de WhatsApp para sesión ${sessionId}`);

    res.status(200).json({
      success: true,
      sessionId,
      chats: chatData.chats || [],
      pagination: chatData.pagination || {
        total: chatData.total || 0,
        limit: chatLimit,
        offset: chatOffset,
        hasMore: false
      },
      timestamp: Date.now(),
      source: 'whatsapp_web' // Indicar que viene de WhatsApp Web
    });

  } catch (error) {
    logger.error(`Error al obtener chats de WhatsApp para sesión ${req.params.sessionId}:`, {
      errorMessage: error.message,
      errorCode: error.code,
      status: error.response?.status,
      responseData: error.response?.data
    });

    // Manejo específico de errores
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        error: 'Timeout al obtener chats',
        message: 'El servicio de WhatsApp está tardando demasiado en responder. Intenta con menos chats o modo básico.',
        suggestion: 'Prueba con ?basic=true&limit=20'
      });
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada en el servicio de WhatsApp',
        message: 'La sesión puede haber expirado'
      });
    }

    if (error.response?.status === 400) {
      return res.status(400).json({
        success: false,
        error: error.response.data?.message || 'Error en la petición',
        details: error.response.data
      });
    }

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Servicio de WhatsApp no disponible',
        message: 'No se puede conectar al servicio de WhatsApp'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message,
      code: error.code
    });
  }
};

// NUEVO MÉTODO: Obtener chats básicos de WhatsApp (más rápido)
exports.getWhatsAppChatsBasic = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = '20', offset = '0' } = req.query;

    const session = await Session.findOne({ sessionId, userId: req.user.id });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }

    if (session.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'La sesión no está conectada',
        currentStatus: session.status
      });
    }

    logger.info(`Obteniendo chats básicos de WhatsApp para sesión ${sessionId}`);

    const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';
    const response = await axios.get(`${whatsappServiceUrl}/api/sessions/${sessionId}/chats/basic`, {
      params: { limit, offset },
      timeout: 20000 // 20 segundos para chats básicos
    });

    logger.info(`Obtenidos ${response.data.chats?.length || 0} chats básicos de WhatsApp para sesión ${sessionId}`);

    res.status(200).json({
      success: true,
      ...response.data,
      source: 'whatsapp_web'
    });

  } catch (error) {
    logger.error(`Error al obtener chats básicos de WhatsApp:`, {
      errorMessage: error.message,
      sessionId: req.params.sessionId
    });
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        error: 'Timeout al obtener chats básicos'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Error al obtener chats básicos',
      message: error.message 
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

// ACTUALIZAR EL MODULE.EXPORTS (IMPORTANTE)
module.exports = {
  processIncomingMessages: exports.processIncomingMessages,
  getMessages: exports.getMessages,
  getChats: exports.getChats, // Método existente (chats desde BD)
  getWhatsAppChats: exports.getWhatsAppChats, // NUEVO: chats desde WhatsApp Web
  getWhatsAppChatsBasic: exports.getWhatsAppChatsBasic, // NUEVO: chats básicos
  sendTextMessage: exports.sendTextMessage,
  sendMediaMessage: exports.sendMediaMessage,
  deleteOldMessages: exports.deleteOldMessages
};