// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const config = require('../config');

// Proteger rutas
exports.protect = asyncHandler(async (req, res, next) => {
  let token;
  
  // Verificar token en headers o cookies
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Obtener token del encabezado
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    // Obtener token de cookies
    token = req.cookies.token;
  }
  
  // Verificar existencia del token
  if (!token) {
    return next(new ErrorResponse('No estás autorizado para acceder a esta ruta', 401));
  }
  
  try {
    // Verificar token
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Obtener usuario del token
    req.user = await User.findById(decoded.id);
    
    if (!req.user) {
      return next(new ErrorResponse('No se encontró un usuario con este ID', 401));
    }
    
    // Agregar esta línea para asegurar que isEmailVerified se tome del token
    req.user.isEmailVerified = decoded.isEmailVerified || req.user.isEmailVerified;
    
    next();
  } catch (error) {
    return next(new ErrorResponse('No estás autorizado para acceder a esta ruta', 401));
  }
});

// Otorgar acceso a roles específicos
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `El rol ${req.user.role} no está autorizado para acceder a esta ruta`,
          403
        )
      );
    }
    next();
  };
};

// Verificar que el correo esté verificado
exports.requireEmailVerification = asyncHandler(async (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return next(
      new ErrorResponse('Por favor, verifica tu correo electrónico primero', 403)
    );
  }
  
  next();
});