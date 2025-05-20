/**
 * src/services/sessionCleanupService.js
 * Servicio para limpiar sesiones antiguas o inactivas
 */

const Session = require('../models/Session');
const whatsappClient = require('./whatsappClient');
const whatsAppSocketBridge = require('./whatsAppSocketBridge');
const logger = require('../utils/logger');

class SessionCleanupService {
  constructor() {
    this.cleanupInterval = null;
  }

  /**
   * Inicia el servicio de limpieza de sesiones
   * @param {number} intervalMinutes - Intervalo en minutos para ejecutar la limpieza
   */
  start(intervalMinutes = 60) {
    logger.info(`Iniciando servicio de limpieza de sesiones con intervalo de ${intervalMinutes} minutos`);
    
    // Ejecutar inmediatamente una vez
    this.cleanupSessions();
    
    // Configurar intervalo
    this.cleanupInterval = setInterval(() => {
      this.cleanupSessions();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Detiene el servicio de limpieza
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Servicio de limpieza de sesiones detenido');
    }
  }

  /**
   * Limpia sesiones antiguas o inactivas
   */
  async cleanupSessions() {
    try {
      logger.info('Iniciando limpieza de sesiones...');
      
      // Encontrar sesiones inactivas por más de 48 horas
      const twoDaysAgo = new Date();
      twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);
      
      const inactiveSessions = await Session.find({
        $or: [
          // Sesiones con estado 'failed'
          { status: 'failed' },
          // Sesiones en estado 'initializing' o 'qr_ready' sin actualización reciente
          { 
            status: { $in: ['initializing', 'qr_ready'] },
            lastQRTimestamp: { $lt: twoDaysAgo }
          },
          // Sesiones desconectadas por más de 48 horas
          {
            status: 'disconnected',
            lastDisconnection: { $lt: twoDaysAgo }
          }
        ]
      });
      
      logger.info(`Encontradas ${inactiveSessions.length} sesiones inactivas para limpiar`);
      
      // Eliminar cada sesión inactiva
      for (const session of inactiveSessions) {
        try {
          // Intentar desconectar del servicio de WhatsApp
          try {
            await whatsappClient.disconnectSession(session.sessionId);
          } catch (disconnectError) {
            logger.warn(`Error al desconectar sesión ${session.sessionId}: ${disconnectError.message}`);
          }
          
          // Desuscribir del puente de sockets
          whatsAppSocketBridge.unsubscribeFromSession(session.sessionId);
          
          // Eliminar de la base de datos
          await Session.deleteOne({ sessionId: session.sessionId });
          
          logger.info(`Sesión inactiva ${session.sessionId} eliminada correctamente`);
        } catch (error) {
          logger.error(`Error al eliminar sesión inactiva ${session.sessionId}: ${error.message}`);
        }
      }
      
      logger.info('Limpieza de sesiones completada');
    } catch (error) {
      logger.error(`Error en la limpieza de sesiones: ${error.message}`);
    }
  }
}

module.exports = new SessionCleanupService();