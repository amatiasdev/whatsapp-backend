const logger = require('../utils/logger');

// Middleware para manejar errores de forma centralizada
const errorHandler = (err, req, res, next) => {
  // Loguear el error
  logger.error(`${err.name}: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  // Errores de Mongoose - CastError
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Recurso no encontrado o ID inválido'
    });
  }
  
  // Errores de Mongoose - Validation Error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({
      success: false,
      error: messages
    });
  }
  
  // Errores de Mongoose - Duplicate Key
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      error: 'Ya existe un registro con ese valor único'
    });
  }
  
  // Errores de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Token inválido'
    });
  }
  
  // Errores de JWT - Token expirado
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expirado, por favor inicie sesión nuevamente'
    });
  }
  
  // Errores HTTP específicos con status code
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message || 'Error en el servidor'
    });
  }
  
  // Error por defecto
  res.status(500).json({
    success: false,
    error: 'Error en el servidor'
  });
};

module.exports = errorHandler;