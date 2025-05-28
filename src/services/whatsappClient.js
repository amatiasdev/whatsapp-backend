/**
 * src/services/whatsappClient.js
 * Cliente para comunicarse con el servicio de WhatsApp (puerto 3001)
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class WhatsAppClient {
  constructor() {
    this.baseURL = config.whatsappServiceUrl; // http://localhost:3001
    this.timeout = 120000; // 30 segundos
  }

  /**
   * Inicializa una sesión en el servicio de WhatsApp
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<Object>} - Resultado de la inicialización
   */
  async initializeSession(sessionId) {
    try {
      logger.info(`Inicializando sesión ${sessionId} en servicio de WhatsApp`);
      
      const response = await axios.post(`${this.baseURL}/api/session/initialize`, {
        sessionId
      }, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      logger.info(`Sesión ${sessionId} inicializada en servicio de WhatsApp`);
      return response.data;
    } catch (error) {
      logger.error(`Error al inicializar sesión ${sessionId}:`, {
        errorMessage: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Servicio de WhatsApp no disponible');
      }
      
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Inicia la escucha de mensajes para una sesión
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<Object>} - Resultado del inicio de escucha
   */
  async startListening(sessionId) {
    try {
      logger.info(`Iniciando escucha para sesión ${sessionId}`);
      
      const response = await axios.post(`${this.baseURL}/api/session/start-listening`, {
        sessionId
      }, {
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error(`Error al iniciar escucha para ${sessionId}:`, {
        errorMessage: error.message,
        status: error.response?.status
      });
      
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Detiene la escucha de mensajes para una sesión
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<Object>} - Resultado de la detención de escucha
   */
  async stopListening(sessionId) {
    try {
      logger.info(`Deteniendo escucha para sesión ${sessionId}`);
      
      const response = await axios.post(`${this.baseURL}/api/session/stop-listening`, {
        sessionId
      }, {
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error(`Error al detener escucha para ${sessionId}:`, {
        errorMessage: error.message,
        status: error.response?.status
      });
      
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Obtiene el estado de una sesión
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<Object>} - Estado de la sesión
   */
  async getSessionStatus(sessionId) {
    try {
      const response = await axios.get(`${this.baseURL}/api/session/${sessionId}/status`, {
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.debug(`Error al obtener estado de sesión ${sessionId}:`, {
        errorMessage: error.message,
        status: error.response?.status
      });
      
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Obtiene el código QR de una sesión
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<Object>} - Datos del código QR
   */
  async getQRCode(sessionId) {
    try {
      const response = await axios.get(`${this.baseURL}/api/session/${sessionId}/qr`, {
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.debug(`Error al obtener QR para sesión ${sessionId}:`, {
        errorMessage: error.message,
        status: error.response?.status
      });
      
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Desconecta una sesión
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<Object>} - Resultado de la desconexión
   */
  async disconnectSession(sessionId) {
    try {
      logger.info(`Desconectando sesión ${sessionId}`);
      
      const response = await axios.delete(`${this.baseURL}/api/session/${sessionId}`, {
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error(`Error al desconectar sesión ${sessionId}:`, {
        errorMessage: error.message,
        status: error.response?.status
      });
      
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Obtiene los chats de una sesión
   * @param {string} sessionId - ID de la sesión
   * @param {boolean} forceRefresh - Si debe forzar la actualización
   * @returns {Promise<Object>} - Lista de chats
   */
  async getSessionChats(sessionId, forceRefresh = false) {
    try {
      const response = await axios.get(`${this.baseURL}/api/sessions/${sessionId}/chats`, {
        params: { refresh: forceRefresh },
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error(`Error al obtener chats para sesión ${sessionId}:`, {
        errorMessage: error.message,
        status: error.response?.status
      });
      
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Actualiza el estado de escucha de un chat
   * @param {string} sessionId - ID de la sesión
   * @param {string} chatId - ID del chat
   * @param {boolean} isListening - Si debe escuchar el chat
   * @returns {Promise<Object>} - Resultado de la actualización
   */
  async updateChatListeningStatus(sessionId, chatId, isListening) {
    try {
      const response = await axios.put(`${this.baseURL}/api/sessions/${sessionId}/chats/${chatId}/listening`, {
        isListening
      }, {
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error(`Error al actualizar estado de escucha para chat ${chatId}:`, {
        errorMessage: error.message,
        status: error.response?.status
      });
      
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Verifica si el servicio de WhatsApp está disponible
   * @returns {Promise<boolean>} - true si está disponible
   */
  async isServiceAvailable() {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 5000
      });
      
      return response.status === 200;
    } catch (error) {
      logger.warn('Servicio de WhatsApp no disponible:', {
        errorMessage: error.message
      });
      return false;
    }
  }
}

module.exports = new WhatsAppClient();