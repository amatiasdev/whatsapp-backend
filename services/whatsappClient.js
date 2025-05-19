const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class WhatsAppClient {
  constructor() {
    this.client = axios.create({
      baseURL: config.whatsappServiceUrl,
      timeout: 120000  // 120 segundos
    });

    // Interceptor para logging de requests
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`Solicitud a servicio WhatsApp: ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error(`Error al preparar solicitud a servicio WhatsApp: ${error.message}`);
        return Promise.reject(error);
      }
    );

    // Interceptor para logging de respuestas
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`Respuesta de servicio WhatsApp: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        if (error.response) {
          logger.error(`Error de servicio WhatsApp: ${error.response.status} - ${error.response.data?.error || error.message}`);
        } else if (error.request) {
          logger.error(`Error de conexión con servicio WhatsApp: ${error.message}`);
        } else {
          logger.error(`Error en cliente WhatsApp: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  // Métodos para gestionar sesiones - ACTUALIZADOS PARA COINCIDIR CON LAS RUTAS DEL SERVICIO
  async initializeSession(sessionId) {
    try {
      // MODIFICADO: Ruta adaptada al formato del servicio de WhatsApp
      const response = await this.client.post('/api/session/initialize', { sessionId });
      return response.data;
    } catch (error) {
      logger.error(`Error al inicializar sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async getSessionStatus(sessionId) {
    try {
      // MODIFICADO: Ruta adaptada al formato del servicio de WhatsApp
      const response = await this.client.post('/api/session/status', { sessionId });
      return response.data;
    } catch (error) {
      logger.error(`Error al obtener estado de sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async startListening(sessionId) {
    try {
      // MODIFICADO: Ruta adaptada al formato del servicio de WhatsApp
      const response = await this.client.post('/api/session/start-listening', { sessionId });
      return response.data;
    } catch (error) {
      logger.error(`Error al iniciar escucha para sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async stopListening(sessionId) {
    try {
      // MODIFICADO: Ruta adaptada al formato del servicio de WhatsApp
      const response = await this.client.post('/api/session/stop-listening', { sessionId });
      return response.data;
    } catch (error) {
      logger.error(`Error al detener escucha para sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async disconnectSession(sessionId) {
    try {
      // MODIFICADO: Ruta adaptada al formato del servicio de WhatsApp
      const response = await this.client.post('/api/session/disconnect', { sessionId });
      return response.data;
    } catch (error) {
      logger.error(`Error al desconectar sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async getQRCode(sessionId) {
    try {
      // MODIFICADO: Ruta adaptada al formato del servicio de WhatsApp
      const response = await this.client.post('/api/session/qr', { sessionId });
      return response.data;
    } catch (error) {
      // Si el QR no está disponible, puede ser normal (ej: ya conectado)
      if (error.response?.status === 404) {
        return { available: false, reason: 'not_found' };
      }
      logger.error(`Error al obtener QR para sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  // Métodos para envío de mensajes - ACTUALIZADOS PARA COINCIDIR CON LAS RUTAS DEL SERVICIO
  async sendTextMessage(sessionId, to, text) {
    try {
      // MODIFICADO: Ruta adaptada al formato del servicio de WhatsApp
      const response = await this.client.post('/api/message/send', {
        sessionId,
        to,
        text
      });
      return response.data;
    } catch (error) {
      logger.error(`Error al enviar mensaje a ${to} desde sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async sendMedia(sessionId, to, mediaType, media, caption = '') {
    try {
      // MODIFICADO: Ruta adaptada al formato del servicio de WhatsApp
      const response = await this.client.post(`/api/message/send-${mediaType}`, {
        sessionId,
        to,
        media,
        caption
      });
      return response.data;
    } catch (error) {
      logger.error(`Error al enviar ${mediaType} a ${to} desde sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  // Obtener contactos y chats - ACTUALIZADOS PARA COINCIDIR CON LAS RUTAS DEL SERVICIO
  async getContacts(sessionId) {
    try {
      // MODIFICADO: Ruta adaptada al formato del servicio de WhatsApp
      const response = await this.client.post('/api/contacts/all', { sessionId });
      return response.data;
    } catch (error) {
      logger.error(`Error al obtener contactos para sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async getChats(sessionId) {
    try {
      // MODIFICADO: Ruta adaptada al formato del servicio de WhatsApp
      const response = await this.client.post('/api/chats/all', { sessionId });
      return response.data;
    } catch (error) {
      logger.error(`Error al obtener chats para sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new WhatsAppClient();