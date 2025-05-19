const Session = require('../models/Session');
const whatsappClient = require('../services/whatsappClient');
const socketService = require('../services/socketService');
const logger = require('../utils/logger');
const whatsAppSocketBridge = require('../services/whatsAppSocketBridge');



// Obtener todas las sesiones
exports.getAllSessions = async (req, res) => {
  try {
    const { userId } = req.query;
    
    // Construir query basado en filtros
    const query = {};
    if (userId) {
      query.userId = userId;
    }
    
    const sessions = await Session.find(query)
      .select('-__v')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: sessions.length,
      data: sessions
    });
  } catch (error) {
    logger.error(`Error al obtener sesiones: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sesiones'
    });
  }
};

// Obtener una sesión por ID
exports.getSessionById = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await Session.findOne({ sessionId })
      .select('-__v');
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Intentar obtener estado actual del servicio
    try {
      const serviceStatus = await whatsappClient.getSessionStatus(sessionId);
      
      // Si existe en el servicio, actualizar estado en la BD
      if (serviceStatus && serviceStatus.exists) {
        // Solo actualizar si el estado es diferente
        if (session.isConnected !== serviceStatus.isConnected || 
            session.isListening !== serviceStatus.isListening) {
          
          await Session.findOneAndUpdate(
            { sessionId },
            {
              isConnected: serviceStatus.isConnected,
              isListening: serviceStatus.isListening,
              status: serviceStatus.isConnected ? 'connected' : session.status
            }
          );
          
          // Actualizar el objeto de respuesta
          session.isConnected = serviceStatus.isConnected;
          session.isListening = serviceStatus.isListening;
          if (serviceStatus.isConnected) {
            session.status = 'connected';
          }
        }
      }
    } catch (statusError) {
      logger.debug(`No se pudo obtener estado de la sesión ${sessionId}: ${statusError.message}`);
      // No fallar la petición completa si solo falló la verificación de estado
    }
    
    res.status(200).json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error(`Error al obtener sesión ${req.params.sessionId}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener la sesión'
    });
  }
};

// Crear una nueva sesión
exports.createSession = async (req, res) => {
  try {
    const { sessionId, name, description, userId } = req.body;
    
    // Validar campos requeridos
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'El ID de sesión es requerido'
      });
    }
    
    // Verificar si ya existe
    const existingSession = await Session.findOne({ sessionId });
    if (existingSession) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe una sesión con este ID'
      });
    }
    
    // Crear en la base de datos
    const session = await Session.create({
      sessionId,
      name: name || `Sesión ${sessionId}`,
      description,
      userId,
      status: 'initializing'
    });
    
    // Inicializar en el servicio WhatsApp
    try {
      const initResult = await whatsappClient.initializeSession(sessionId);
      
      // Actualizar estado según respuesta
      session.status = 'qr_ready';
      await session.save();
      
      // Suscribir al puente para recibir eventos de esta sesión
      whatsAppSocketBridge.subscribeToSession(sessionId); // Añadir esta línea
      
      // Iniciar polling de QR
      socketService.startQRPolling(sessionId);
      
      res.status(201).json({
        success: true,
        data: session,
        serviceResponse: initResult
      });
    } catch (initError) {
      // Si hay error al inicializar en servicio, marcar sesión como fallida
      session.status = 'failed';
      session.failureReason = initError.message;
      await session.save();
      
      logger.error(`Error al inicializar sesión ${sessionId} en servicio: ${initError.message}`);
      
      return res.status(500).json({
        success: false,
        error: `Error al inicializar sesión: ${initError.message}`,
        data: session
      });
    }
  } catch (error) {
    logger.error(`Error al crear sesión: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al crear la sesión'
    });
  }
};

// Actualizar una sesión
exports.updateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { name, description, webhookUrl, filters } = req.body;
    
    // Encontrar la sesión
    const session = await Session.findOne({ sessionId });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Actualizar campos
    if (name !== undefined) session.name = name;
    if (description !== undefined) session.description = description;
    if (webhookUrl !== undefined) session.webhookUrl = webhookUrl;
    
    // Actualizar filtros si se proporcionan
    if (filters) {
      if (filters.ignoreBroadcast !== undefined) session.filters.ignoreBroadcast = filters.ignoreBroadcast;
      if (filters.ignoreGroups !== undefined) session.filters.ignoreGroups = filters.ignoreGroups;
      if (filters.ignoreNonGroups !== undefined) session.filters.ignoreNonGroups = filters.ignoreNonGroups;
      if (filters.allowedGroups !== undefined) session.filters.allowedGroups = filters.allowedGroups;
      if (filters.allowedContacts !== undefined) session.filters.allowedContacts = filters.allowedContacts;
    }
    
    // Guardar cambios
    await session.save();
    
    res.status(200).json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error(`Error al actualizar sesión ${req.params.sessionId}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar la sesión'
    });
  }
};

// Eliminar una sesión
exports.deleteSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verificar si existe
    const session = await Session.findOne({ sessionId });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Desconectar la sesión del servicio WhatsApp
    try {
      await whatsappClient.disconnectSession(sessionId);
    } catch (disconnectError) {
      logger.warn(`Error al desconectar sesión ${sessionId}: ${disconnectError.message}`);
      // Continuamos con la eliminación aunque falle la desconexión
    }
    
    // Desuscribir del puente de sockets
    whatsAppSocketBridge.unsubscribeFromSession(sessionId); // Añadir esta línea
    
    // Detener polling de QR
    socketService.stopQRPolling(sessionId);
    
    // Eliminar de la base de datos
    await Session.deleteOne({ sessionId });
    
    // Notificar a clientes
    socketService.emitToSession(sessionId, 'session_deleted', { sessionId });
    
    res.status(200).json({
      success: true,
      message: `Sesión ${sessionId} eliminada correctamente`
    });
  } catch (error) {
    logger.error(`Error al eliminar sesión ${req.params.sessionId}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar la sesión'
    });
  }
};

// Iniciar escucha
exports.startListening = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verificar si existe
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
        error: 'La sesión debe estar conectada para iniciar la escucha'
      });
    }
    
    // Iniciar escucha en el servicio
    const result = await whatsappClient.startListening(sessionId);
    
    // Actualizar estado
    session.isListening = true;
    await session.save();
    
    // Notificar a clientes
    socketService.emitToSession(sessionId, 'listening_status', {
      sessionId,
      isListening: true
    });
    
    res.status(200).json({
      success: true,
      data: {
        sessionId,
        isListening: true,
        result
      }
    });
  } catch (error) {
    logger.error(`Error al iniciar escucha para sesión ${req.params.sessionId}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar la escucha'
    });
  }
};

// Detener escucha
exports.stopListening = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verificar si existe
    const session = await Session.findOne({ sessionId });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Detener escucha en el servicio
    const result = await whatsappClient.stopListening(sessionId);
    
    // Actualizar estado
    session.isListening = false;
    await session.save();
    
    // Notificar a clientes
    socketService.emitToSession(sessionId, 'listening_status', {
      sessionId,
      isListening: false
    });
    
    res.status(200).json({
      success: true,
      data: {
        sessionId,
        isListening: false,
        result
      }
    });
  } catch (error) {
    logger.error(`Error al detener escucha para sesión ${req.params.sessionId}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al detener la escucha'
    });
  }
};

// Obtener QR
exports.getQRCode = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verificar si existe la sesión
    const session = await Session.findOne({ sessionId });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Si ya está conectada, no hay QR
    if (session.isConnected) {
      return res.status(400).json({
        success: false,
        error: 'La sesión ya está conectada, no hay código QR disponible'
      });
    }
    
    // Obtener QR del servicio
    const qrResult = await whatsappClient.getQRCode(sessionId);
    
    if (!qrResult || !qrResult.qr) {
      return res.status(404).json({
        success: false,
        error: 'Código QR no disponible o expirado'
      });
    }
    
    // Actualizar timestamp en BD
    session.lastQRTimestamp = new Date();
    await session.save();
    
    res.status(200).json({
      success: true,
      data: {
        sessionId,
        qr: qrResult.qr
      }
    });
  } catch (error) {
    logger.error(`Error al obtener QR para sesión ${req.params.sessionId}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener el código QR'
    });
  }
};

// Desconectar una sesión
exports.disconnectSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verificar si existe
    const session = await Session.findOne({ sessionId });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }
    
    // Desconectar del servicio
    await whatsappClient.disconnectSession(sessionId);
    
    // Detener polling de QR
    socketService.stopQRPolling(sessionId);
    
    // Actualizar estado
    session.status = 'disconnected';
    session.isConnected = false;
    session.isListening = false;
    session.lastDisconnection = new Date();
    await session.save();
    
    // Notificar a clientes
    socketService.emitToSession(sessionId, 'session_disconnected', {
      sessionId,
      timestamp: new Date()
    });
    
    res.status(200).json({
      success: true,
      data: {
        sessionId,
        status: 'disconnected'
      }
    });
  } catch (error) {
    logger.error(`Error al desconectar sesión ${req.params.sessionId}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al desconectar la sesión'
    });
  }
};

module.exports = exports;