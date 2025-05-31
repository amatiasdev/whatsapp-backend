/**
 * src/services/whatsAppSocketBridge.js
 * Puente mejorado entre el servicio de WhatsApp y el backend
 */

const socketIOClient = require('socket.io-client');
const socketService = require('./socketService');
const Session = require('../models/Session');
const logger = require('../utils/logger');
const config = require('../config');

class WhatsAppSocketBridge {
  constructor() {
    this.whatsappClient = null;
    this.whatsappServiceUrl = config.whatsappServiceUrl || 'http://localhost:3001';
    this.activeSessions = new Set(); // Sesiones activamente suscritas
    this.pendingSessions = new Set(); // Sesiones pendientes de suscribir
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20; // 🔧 Aumentado de 10 a 20
    this.lastConnectionTime = null;
    this.sessionStatusCache = new Map(); // Cache para evitar actualizaciones duplicadas
    
    // 🆕 NUEVAS PROPIEDADES para reconexión más robusta
    this.reconnectTimeout = null;
    this.connectionCheckInterval = null;
    this.forceReconnectAfter = 5 * 60 * 1000; // 5 minutos sin conexión = reconexión forzada
  }

  /**
   * 🔧 MEJORADO: Inicializa la conexión con el servicio de WhatsApp
   */
  initialize() {
    if (this.whatsappClient && this.isConnected) {
      logger.debug('Socket bridge ya está conectado');
      return this.whatsappClient;
    }

    logger.info(`Conectando al servicio de WhatsApp en ${this.whatsappServiceUrl}`);
    
    // 🔧 Limpiar timeouts anteriores
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Limpiar conexión anterior si existe
    if (this.whatsappClient) {
      this.whatsappClient.removeAllListeners(); // 🔧 Limpiar listeners
      this.whatsappClient.disconnect();
    }
    
    this.whatsappClient = socketIOClient(this.whatsappServiceUrl, {
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000, // 🔧 Reducido de 30s a 10s
      timeout: 15000, // 🔧 Aumentado de 10s a 15s
      forceNew: true, // 🔧 Forzar nueva conexión
      transports: ['websocket', 'polling']
    });
    
    this.setupEventHandlers();
    this.startConnectionMonitoring(); // 🆕 Monitoreo activo
    return this.whatsappClient;
  }

  /**
   * 🆕 NUEVO: Monitoreo activo de conexión
   */
  startConnectionMonitoring() {
    // Limpiar monitoreo anterior
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
    
    // Verificar conexión cada 30 segundos
    this.connectionCheckInterval = setInterval(() => {
      if (!this.isConnected && this.lastConnectionTime) {
        const timeSinceLastConnection = Date.now() - this.lastConnectionTime;
        
        if (timeSinceLastConnection > this.forceReconnectAfter) {
          logger.warn(`⚠️ Sin conexión por ${Math.round(timeSinceLastConnection/60000)} minutos - forzando reconexión`);
          this.forceReconnect();
        }
      }
    }, 30000);
  }

  /**
   * 🔧 MEJORADO: Configura todos los manejadores de eventos
   */
  setupEventHandlers() {
    // Evento de conexión exitosa
    this.whatsappClient.on('connect', () => {
      this.isConnected = true;
      this.lastConnectionTime = Date.now();
      this.reconnectAttempts = 0;
      
      logger.info('Conectado al servicio de WhatsApp', {
        socketId: this.whatsappClient.id
      });
      
      // Procesar suscripciones pendientes
      this.processPendingSubscriptions();
      
      // Re-suscribir a sesiones activas
      this.resubscribeToActiveSessions();
    });

    // 🔧 MEJORADO: Evento de desconexión
    this.whatsappClient.on('disconnect', (reason) => {
      this.isConnected = false;
      
      logger.warn('Desconectado del servicio de WhatsApp', {
        reason,
        socketId: this.whatsappClient?.id
      });

      // 🔧 MEJORA: Solo notificar bridge_disconnected, NO marcar sesiones como desconectadas
      this.activeSessions.forEach(sessionId => {
        socketService.emitToSession(sessionId, 'bridge_disconnected', {
          reason,
          timestamp: Date.now(),
          message: 'Conexión con servicio WhatsApp perdida - reintentando...' // 🔧 Mensaje más optimista
        });
      });

      // 🆕 Programar reconexión agresiva para razones específicas
      if (reason === 'transport close' || reason === 'transport error') {
        this.scheduleReconnect(5000); // Reconectar en 5 segundos
      }
    });

    // Evento de reconexión exitosa
    this.whatsappClient.on('reconnect', (attemptNumber) => {
      this.isConnected = true;
      this.lastConnectionTime = Date.now();
      
      logger.info('Reconectado al servicio de WhatsApp', {
        attemptNumber,
        socketId: this.whatsappClient.id
      });

      this.processPendingSubscriptions();
      this.resubscribeToActiveSessions();
      
      // Notificar reconexión exitosa
      this.activeSessions.forEach(sessionId => {
        socketService.emitToSession(sessionId, 'bridge_reconnected', {
          timestamp: Date.now(),
          message: 'Conexión con servicio WhatsApp restaurada'
        });
      });
    });

    // 🔧 MEJORADO: Evento de error de conexión
    this.whatsappClient.on('connect_error', (error) => {
      this.isConnected = false;
      this.reconnectAttempts++;
      
      logger.error('Error al conectar con servicio de WhatsApp', {
        error: error.message,
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });

      // 🔧 Estrategia de reconexión más agresiva
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        logger.error('Máximo de intentos alcanzado - programando reconexión en 30 segundos');
        this.scheduleReconnect(30000); // 🔧 Usar método programado
      }
    });

    // Configurar manejadores de eventos específicos de WhatsApp
    this.setupWhatsAppEventHandlers();
  }

  /**
   * 🆕 NUEVO: Programar reconexión
   */
  scheduleReconnect(delay) {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    logger.info(`🔄 Programando reconexión en ${delay/1000} segundos`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts = 0; // Reset counter
      this.initialize();
    }, delay);
  }

  /**
   * Configura los manejadores de eventos específicos de WhatsApp
   */
  setupWhatsAppEventHandlers() {
    // Evento de QR generado
    this.whatsappClient.on('qr', async (data) => {
      const { sessionId, qr } = data;
      
      logger.info(`QR recibido para sesión ${sessionId}`, {
        hasQR: !!qr,
        qrLength: qr ? qr.length : 0
      });
      
      try {
        // Actualizar timestamp de QR en BD
        await Session.findOneAndUpdate(
          { sessionId },
          { 
            lastQRTimestamp: new Date(),
            status: 'qr_ready'
          }
        );
        
        // Emitir QR a clientes conectados
        socketService.emitQRCode(sessionId, qr);
        
      } catch (error) {
        logger.error(`Error al procesar QR para sesión ${sessionId}:`, {
          errorMessage: error.message
        });
      }
    });

    // Evento de estado de sesión
    this.whatsappClient.on('session-status', async (data) => {
      await this.handleSessionStatusUpdate(data);
    });

    // Evento de conexión de sesión
    this.whatsappClient.on('session_connected', async (data) => {
      await this.handleSessionConnected(data);
    });

    // Evento de desconexión de sesión
    this.whatsappClient.on('session_disconnected', async (data) => {
      await this.handleSessionDisconnected(data);
    });

    // Evento de mensaje recibido
    this.whatsappClient.on('message_received', (data) => {
      logger.debug('Mensaje recibido', { 
        sessionId: data.sessionId,
        from: data.from,
        type: data.type || 'text'
      });
      
      // Reenviar mensaje a clientes conectados
      socketService.emitToSession(data.sessionId, 'new_message', data);
    });

    // Evento de error de sesión
    this.whatsappClient.on('session_error', async (data) => {
      await this.handleSessionError(data);
    });

    // Evento de inicio/parada de escucha
    this.whatsappClient.on('listening_status', async (data) => {
      const { sessionId, isListening } = data;
      
      try {
        await Session.findOneAndUpdate(
          { sessionId },
          { 
            isListening,
            lastActivity: new Date()
          }
        );
        
        logger.debug(`Estado de escucha actualizado para ${sessionId}: ${isListening}`);
        
        // Emitir estado a clientes
        socketService.emitToSession(sessionId, 'listening_status_updated', {
          sessionId,
          isListening,
          timestamp: Date.now()
        });
        
      } catch (error) {
        logger.error(`Error al actualizar estado de escucha para ${sessionId}:`, {
          errorMessage: error.message
        });
      }
    });
  }

  /**
   * Maneja actualizaciones de estado de sesión
   */
  async handleSessionStatusUpdate(data) {
    const { sessionId, status } = data;
    
    logger.info(`Estado de sesión recibido: ${status} para sesión: ${sessionId}`);
    
    // Verificar cache para evitar actualizaciones duplicadas
    const cacheKey = `${sessionId}_${status}`;
    const lastUpdate = this.sessionStatusCache.get(cacheKey);
    const now = Date.now();
    
    if (lastUpdate && (now - lastUpdate) < 5000) { // 5 segundos
      logger.debug(`Actualizacion de estado duplicada ignorada para ${sessionId}`);
      return;
    }
    
    this.sessionStatusCache.set(cacheKey, now);
    
    try {
      const validStatuses = ['initializing', 'qr_ready', 'connected', 'disconnected', 'failed'];
      
      if (!validStatuses.includes(status)) {
        logger.debug(`Estado ${status} no requiere actualización en BD para ${sessionId}`);
        // Solo reenviar a clientes
        socketService.emitSessionStatus(sessionId, status, data);
        return;
      }
      
      // Preparar datos de actualización
      const updateData = { status };
      
      // Configurar campos adicionales según el estado
      switch (status) {
        case 'connected':
          updateData.isConnected = true;
          updateData.lastConnection = new Date();
          // No resetear isListening automáticamente
          break;
          
        case 'disconnected':
          updateData.isConnected = false;
          updateData.isListening = false;
          updateData.lastDisconnection = new Date();
          
          // 🔧 MEJORA: NO desuscribir inmediatamente, dar tiempo para reconexión
          // this.unsubscribeFromSession(sessionId);
          logger.info(`Sesión ${sessionId} desconectada, manteniendo suscripción para posible reconexión`);
          break;
          
        case 'qr_ready':
          updateData.isConnected = false;
          updateData.lastQRTimestamp = new Date();
          break;
          
        case 'failed':
          updateData.isConnected = false;
          updateData.isListening = false;
          if (data.error) {
            updateData.failureReason = data.error;
          }
          break;
      }
      
      // Actualizar en base de datos
      const updatedSession = await Session.findOneAndUpdate(
        { sessionId }, 
        updateData,
        { new: true }
      );
      
      if (updatedSession) {
        logger.debug(`Estado ${status} actualizado en BD para sesión ${sessionId}`);
      } else {
        logger.warn(`Sesión ${sessionId} no encontrada en BD para actualizar estado ${status}`);
      }
      
    } catch (error) {
      logger.error(`Error al actualizar estado en base de datos:`, {
        errorMessage: error.message,
        sessionId,
        status,
        stack: error.stack
      });
    }
    
    // Siempre reenviar el estado a los clientes
    socketService.emitSessionStatus(sessionId, status, data);
  }

  /**
   * Maneja conexión exitosa de sesión
   */
  async handleSessionConnected(data) {
    const { sessionId } = data;
    
    logger.info(`Sesión ${sessionId} conectada en WhatsApp`);
    
    try {
      await Session.findOneAndUpdate(
        { sessionId },
        {
          status: 'connected',
          isConnected: true,
          lastConnection: new Date()
        }
      );
      
      // Detener polling de QR si estaba activo
      socketService.stopQRPolling(sessionId);
      
      // Emitir evento de conexión
      socketService.emitToSession(sessionId, 'session_connected', {
        sessionId,
        connectedAt: Date.now(),
        message: 'WhatsApp conectado exitosamente'
      });
      
    } catch (error) {
      logger.error(`Error al procesar conexión de sesión ${sessionId}:`, {
        errorMessage: error.message
      });
    }
  }

  /**
   * Maneja desconexión de sesión
   */
  async handleSessionDisconnected(data) {
    const { sessionId, reason } = data;
    
    logger.info(`Sesión ${sessionId} desconectada:`, { reason });
    
    try {
      const updateData = {
        status: 'disconnected',
        isConnected: false,
        isListening: false,
        lastDisconnection: new Date()
      };
      
      if (reason) {
        updateData.failureReason = reason;
      }
      
      await Session.findOneAndUpdate({ sessionId }, updateData);
      
      // Detener polling de QR
      socketService.stopQRPolling(sessionId);
      
      // Emitir evento de desconexión
      socketService.emitToSession(sessionId, 'session_disconnected', {
        sessionId,
        reason,
        disconnectedAt: Date.now()
      });
      
    } catch (error) {
      logger.error(`Error al procesar desconexión de sesión ${sessionId}:`, {
        errorMessage: error.message
      });
    }
  }

  /**
   * Maneja errores de sesión
   */
  async handleSessionError(data) {
    const { sessionId, error: errorMessage } = data;
    
    logger.error(`Error en sesión ${sessionId}:`, { errorMessage });
    
    try {
      await Session.findOneAndUpdate(
        { sessionId },
        {
          status: 'failed',
          failureReason: errorMessage,
          isConnected: false,
          isListening: false
        }
      );
      
      // Emitir evento de error
      socketService.emitToSession(sessionId, 'session_error', {
        sessionId,
        error: errorMessage,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error(`Error al procesar error de sesión ${sessionId}:`, {
        errorMessage: error.message
      });
    }
  }

  /**
   * Suscribe a todas las sesiones existentes activas
   */
  async subscribeToExistingSessions() {
    try {
      // Solo suscribirse a sesiones que deberían estar activas
      const sessions = await Session.find({
        $or: [
          { status: 'connected' },
          { status: 'qr_ready' },
          { isConnected: true }
        ]
      }).select('sessionId status isConnected');
      
      logger.info(`Suscribiendo a ${sessions.length} sesiones activas existentes`);
      
      sessions.forEach(session => {
        this.subscribeToSession(session.sessionId);
      });
      
    } catch (error) {
      logger.error(`Error al suscribirse a sesiones existentes:`, {
        errorMessage: error.message
      });
    }
  }

  /**
   * Procesa suscripciones pendientes
   */
  processPendingSubscriptions() {
    if (this.pendingSessions.size === 0) {
      return;
    }
    
    logger.info(`Procesando ${this.pendingSessions.size} suscripciones pendientes`);
    
    const sessionsToProcess = Array.from(this.pendingSessions);
    this.pendingSessions.clear();
    
    sessionsToProcess.forEach(sessionId => {
      this.subscribeToSession(sessionId);
    });
  }

  /**
   * Re-suscribe a todas las sesiones activas después de reconexión
   */
  resubscribeToActiveSessions() {
    if (this.activeSessions.size === 0) {
      return;
    }
    
    logger.info(`Re-suscribiendo a ${this.activeSessions.size} sesiones activas`);
    
    const sessionsToResubscribe = Array.from(this.activeSessions);
    
    sessionsToResubscribe.forEach(sessionId => {
      if (this.whatsappClient && this.isConnected) {
        this.whatsappClient.emit('subscribe', sessionId);
        logger.debug(`Re-suscrito a sesión ${sessionId}`);
      }
    });
  }

  /**
   * Suscribe a eventos de una sesión específica
   * @param {string} sessionId - ID de la sesión
   */
  subscribeToSession(sessionId) {
    if (!sessionId) {
      logger.warn('Intento de suscripción con sessionId vacío');
      return;
    }
    
    // Si ya está suscrita, no hacer nada
    if (this.activeSessions.has(sessionId)) {
      logger.debug(`Sesión ${sessionId} ya está suscrita`);
      return;
    }
    
    // Si no hay conexión, agregar a pendientes
    if (!this.isConnected || !this.whatsappClient) {
      logger.debug(`Agregando sesión ${sessionId} a suscripciones pendientes`);
      this.pendingSessions.add(sessionId);
      
      // Intentar inicializar si no hay cliente
      if (!this.whatsappClient) {
        this.initialize();
      }
      return;
    }
    
    try {
      this.whatsappClient.emit('subscribe', sessionId);
      this.activeSessions.add(sessionId);
      
      // Remover de pendientes si estaba allí
      this.pendingSessions.delete(sessionId);
      
      logger.info(`Suscrito a la sesión ${sessionId} en el servicio de WhatsApp`);
      
    } catch (error) {
      logger.error(`Error al suscribirse a sesión ${sessionId}:`, {
        errorMessage: error.message
      });
      
      // Agregar a pendientes para reintento
      this.pendingSessions.add(sessionId);
    }
  }

  /**
   * Desuscribe de eventos de una sesión específica
   * @param {string} sessionId - ID de la sesión
   */
  unsubscribeFromSession(sessionId) {
    if (!sessionId) {
      return;
    }
    
    logger.info(`Desuscribiendo de la sesión ${sessionId}`);
    
    // Remover de conjuntos
    this.activeSessions.delete(sessionId);
    this.pendingSessions.delete(sessionId);
    
    // Emitir desuscripción si hay conexión
    if (this.whatsappClient && this.isConnected) {
      try {
        this.whatsappClient.emit('unsubscribe', sessionId);
      } catch (error) {
        logger.error(`Error al desuscribirse de sesión ${sessionId}:`, {
          errorMessage: error.message
        });
      }
    }
  }

  /**
   * Obtiene estadísticas de la conexión
   */
  getConnectionStats() {
    return {
      isConnected: this.isConnected,
      lastConnectionTime: this.lastConnectionTime,
      activeSessions: this.activeSessions.size,
      pendingSessions: this.pendingSessions.size,
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.whatsappClient?.id || null
    };
  }

  /**
   * Verifica el estado de la conexión
   */
  healthCheck() {
    if (!this.isConnected) {
      logger.warn('Socket bridge no está conectado, intentando reconectar...');
      this.initialize();
      return false;
    }
    
    return true;
  }

  /**
   * 🔧 MEJORADO: Fuerza reconexión
   */
  forceReconnect() {
    logger.info('🔧 Forzando reconexión al servicio de WhatsApp');
    
    // 🔧 Limpiar todo
    if (this.whatsappClient) {
      this.whatsappClient.removeAllListeners(); // 🔧 Limpiar listeners
      this.whatsappClient.disconnect();
      this.whatsappClient = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.isConnected = false;
    this.reconnectAttempts = 0;
    
    // Reinicializar después de un breve delay
    setTimeout(() => {
      this.initialize();
    }, 2000);
  }

  /**
   * 🔧 MEJORADO: Limpia recursos
   */
  cleanup() {
    logger.info('Limpiando recursos del socket bridge');
    
    // 🔧 Limpiar timeouts e intervalos
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
    
    if (this.whatsappClient) {
      this.whatsappClient.removeAllListeners(); // 🔧 Limpiar listeners
      this.whatsappClient.disconnect();
      this.whatsappClient = null;
    }
    
    this.isConnected = false;
    this.activeSessions.clear();
    this.pendingSessions.clear();
    this.sessionStatusCache.clear();
  }
}

// Crear instancia única
const whatsAppSocketBridge = new WhatsAppSocketBridge();

// Inicializar automáticamente
whatsAppSocketBridge.initialize();

// 🔧 MEJORADO: Health check más agresivo cada minuto
setInterval(() => {
  if (!whatsAppSocketBridge.healthCheck()) {
    const stats = whatsAppSocketBridge.getConnectionStats();
    
    // Si llevamos mucho tiempo desconectados, forzar reconexión
    if (!stats.isConnected && stats.lastConnectionTime) {
      const timeSinceConnection = Date.now() - stats.lastConnectionTime;
      const fiveMinutes = 5 * 60 * 1000;
      
      if (timeSinceConnection > fiveMinutes) {
        logger.warn(`🚨 Forzando reconexión por desconexión prolongada (${Math.round(timeSinceConnection/60000)} min)`);
        whatsAppSocketBridge.forceReconnect();
      }
    }
  }
}, 60000); // 🔧 Cada minuto en lugar de cada 2 minutos

// Limpiar cache de estados cada 5 minutos
setInterval(() => {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  for (const [key, timestamp] of whatsAppSocketBridge.sessionStatusCache.entries()) {
    if (now - timestamp > fiveMinutes) {
      whatsAppSocketBridge.sessionStatusCache.delete(key);
    }
  }
}, 300000);

// 🔧 MEJORADO: Limpiar suscripciones obsoletas cada 10 minutos - más tolerante
setInterval(async () => {
  try {
    const activeSessions = await Session.find({
      status: { $in: ['connected', 'qr_ready'] },
      deletedAt: { $exists: false } // 🔧 Solo sesiones no eliminadas
    }).select('sessionId');
    
    const activeSessionIds = new Set(activeSessions.map(s => s.sessionId));
    
    // Remover suscripciones obsoletas
    for (const sessionId of whatsAppSocketBridge.activeSessions) {
      if (!activeSessionIds.has(sessionId)) {
        logger.debug(`Removiendo suscripción obsoleta para sesión ${sessionId}`);
        whatsAppSocketBridge.unsubscribeFromSession(sessionId);
      }
    }
    
  } catch (error) {
    logger.error('Error al limpiar suscripciones obsoletas:', {
      errorMessage: error.message
    });
  }
}, 600000);

module.exports = whatsAppSocketBridge;