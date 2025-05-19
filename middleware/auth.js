const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const logger = require('../utils/logger');

// Middleware para proteger rutas - verifica autenticación
exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Verificar si hay token en el header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      // Extraer token
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      // O si está en las cookies
      token = req.cookies.token;
    }
    
    // Verificar si el token existe
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No está autorizado para acceder a este recurso'
      });
    }
    
    try {
      // Verificar token
      const decoded = jwt.verify(token, config.jwtSecret);
      
      // Verificar si el usuario existe
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'No se encontró el usuario con este token'
        });
      }
      
      // Verificar si la cuenta está activa
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Su cuenta está desactivada. Contacte al administrador'
        });
      }
      
      // Adjuntar el usuario a la request
      req.user = user;
      next();
    } catch (error) {
      logger.debug(`Error al verificar token: ${error.message}`);
      return res.status(401).json({
        success: false,
        error: 'Token inválido o expirado'
      });
    }
  } catch (error) {
    logger.error(`Error en middleware de autenticación: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Error en el proceso de autenticación'
    });
  }
};

// Middleware para autorizar roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(500).json({
        success: false,
        error: 'Error en el middleware de autenticación'
      });
    }
    
    // Verificar si el rol del usuario está autorizado
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `El rol ${req.user.role} no está autorizado para acceder a este recurso`
      });
    }
    
    next();
  };
};

module.exports = exports;