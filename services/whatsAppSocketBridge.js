/**
 * src/services/whatsAppSocketBridge.js
 * Puente entre el servicio de WhatsApp y el backend
 */

const socketIOClient = require('socket.io-client');
const socketService = require('./socketService');
const Session = require('../models/Session');
const logger = require('../utils/logger');
const config = require('../config');

class WhatsAppSocketBridge {
  constructor() {
    this.whatsappClient = null;
    this.whatsappServiceUrl = config.whatsappServiceUrl || 'http://localhost:8000'; // URL del servicio de WhatsApp
    this.activeSessions = new Set(); // Para almacenar sesiones activas
  }

  /**
   * Inicializa la conexión con el servicio de WhatsApp
   */
  initialize() {
    logger.info(`Conectando al servicio de WhatsApp en ${this.whatsappServiceUrl}`);
    
    this.whatsappClient = socketIOClient(this.whatsappServiceUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
    
    // Manejar la conexión exitosa
    this.whatsappClient.on('connect', () => {
      logger.info('Conectado al servicio de WhatsApp');
      
      // Volver a suscribir a todas las sesiones activas
      this.activeSessions.forEach(sessionId => {
        this.subscribeToSession(sessionId);
      });
    });
    
    // Manejar la desconexión
    this.whatsappClient.on('disconnect', () => {
      logger.warn('Desconectado del servicio de WhatsApp');
    });
    
    // Reenviar eventos de QR
    this.whatsappClient.on('qr', async (data) => {
      logger.info(`QR recibido del servicio de WhatsApp para sesión: ${data.sessionId}`);
      
      // Actualizar el QR en la base de datos si es necesario
      try {
        await Session.findOneAndUpdate(
          { sessionId: data.sessionId },
          { 
            lastQRTimestamp: new Date(),
            status: 'qr_ready'
          }
        );
      } catch (error) {
        logger.error(`Error al actualizar QR en base de datos: ${error.message}`);
      }
      
      // Reenviar el QR a los clientes usando el socketService existente
      socketService.emitQRCode(data.sessionId, data.qr);
    });
    
    // Reenviar eventos de estado de sesión
    this.whatsappClient.on('session-status', async (data) => {
      logger.info(`Estado de sesión recibido: ${data.status} para sesión: ${data.sessionId}`);
      
      try {
        // Actualizar estado en la base de datos
        const updateData = {
          status: data.status
        };
        
        // Actualizar campos adicionales según el estado
        if (data.status === 'connected') {
          updateData.isConnected = true;
          updateData.lastConnection = new Date();
        } else if (data.status === 'disconnected') {
          updateData.isConnected = false;
          updateData.isListening = false;
          updateData.lastDisconnection = new Date();
        }
        
        await Session.findOneAndUpdate(
          { sessionId: data.sessionId }, 
          updateData
        );
      } catch (error) {
        logger.error(`Error al actualizar estado en base de datos: ${error.message}`);
      }
      
      // Reenviar el estado a los clientes usando el socketService existente
      socketService.emitSessionStatus(data.sessionId, data.status, data);
    });
    
    // Manejar errores de conexión
    this.whatsappClient.on('connect_error', (error) => {
      logger.error(`Error conectando al servicio de WhatsApp: ${error.message}`);
    });
    
    // Iniciar la suscripción a todas las sesiones existentes
    this.subscribeToExistingSessions();
    
    return this.whatsappClient;
  }

  /**
   * Suscribe a todas las sesiones existentes en la base de datos
   */
  async subscribeToExistingSessions() {
    try {
      const sessions = await Session.find({});
      sessions.forEach(session => {
        this.subscribeToSession(session.sessionId);
      });
      logger.info(`Suscrito a ${sessions.length} sesiones existentes`);
    } catch (error) {
      logger.error(`Error al suscribirse a sesiones existentes: ${error.message}`);
    }
  }

  /**
   * Suscribe a eventos de una sesión específica
   * @param {string} sessionId - ID de la sesión
   */
  subscribeToSession(sessionId) {
    if (!this.whatsappClient) {
      logger.warn('Intento de suscripción sin conexión establecida. Inicializando...');
      this.initialize();
      return;
    }
    
    this.activeSessions.add(sessionId);
    this.whatsappClient.emit('subscribe', sessionId);
    logger.info(`Suscrito a la sesión ${sessionId} en el servicio de WhatsApp`);
  }

  /**
   * Desuscribe de eventos de una sesión específica
   * @param {string} sessionId - ID de la sesión
   */
  unsubscribeFromSession(sessionId) {
    if (!this.whatsappClient) {
      return;
    }
    
    this.activeSessions.delete(sessionId);
    this.whatsappClient.emit('unsubscribe', sessionId);
    logger.info(`Desuscrito de la sesión ${sessionId} en el servicio de WhatsApp`);
  }
}

module.exports = new WhatsAppSocketBridge();