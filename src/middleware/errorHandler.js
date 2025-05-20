// src/middleware/errorHandler.js
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  
  // Log para desarrollo
  logger.error(err);
  
  // Error de Mongoose: ID inválido
  if (err.name === 'CastError') {
    const message = 'Recurso no encontrado';
    error = new ErrorResponse(message, 404);
  }
  
  // Error de Mongoose: Valor duplicado
  if (err.code === 11000) {
    const message = 'Valor duplicado ingresado';
    error = new ErrorResponse(message, 400);
  }
  
  // Error de Mongoose: Validación fallida
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = new ErrorResponse(message, 400);
  }
  
  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    const message = 'No estás autorizado para acceder a esta ruta';
    error = new ErrorResponse(message, 401);
  }
  
  // Error de expiración de JWT
  if (err.name === 'TokenExpiredError') {
    const message = 'Tu sesión ha expirado, por favor inicia sesión nuevamente';
    error = new ErrorResponse(message, 401);
  }
  
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Error del servidor'
  });
};

module.exports = errorHandler;