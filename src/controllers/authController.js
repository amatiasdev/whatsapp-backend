// src/controllers/authController.js
const crypto = require('crypto');
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const sendEmail = require('../utils/sendEmail');
const jwt = require('jsonwebtoken');
const { generateTOTP, verifyTOTP } = require('../utils/twoFactorAuth');
const config = require('../config');
const logger = require('../utils/logger');

// Generar token JWT
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id,
      isEmailVerified: user.isEmailVerified
    }, 
    config.jwtSecret, 
    {
      expiresIn: config.jwtExpiresIn
    }
  );
};

// Configurar respuesta con cookie
const sendTokenResponse = (user, statusCode, res) => {
  // Crear token
  const token = generateToken(user);
  
  // Opciones de cookie
  const options = {
    expires: new Date(
      Date.now() + config.jwtCookieExpire * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: config.env === 'production'
  };
  
  // Agregar opción SameSite en producción
  if (config.env === 'production') {
    options.sameSite = 'strict';
  }
  
  // Enviar respuesta con cookie
  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        isEmailVerified: user.isEmailVerified
      }
    });
};

// @desc    Registrar usuario
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, password } = req.body;
  
  // Validar campos
  if (!name || !email || !password) {
    return next(new ErrorResponse('Por favor, proporciona todos los campos', 400));
  }
  
  // Verificar si el correo ya está en uso
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse('El correo electrónico ya está en uso', 400));
  }
  
  // Crear usuario
  const user = await User.create({
    name,
    email,
    password
  });
  
  // Generar token de verificación
  const verificationToken = user.generateVerificationToken();
  await user.save({ validateBeforeSave: false });
  
  // Crear URL de verificación
  const verificationUrl = `${config.frontendUrl}/verify-email/${verificationToken}`;
  
  // Contenido del email
  const message = `
    <h1>Verificación de Correo Electrónico</h1>
    <p>Gracias por registrarte. Por favor verifica tu correo electrónico haciendo clic en el siguiente enlace:</p>
    <a href="${verificationUrl}" target="_blank">Verificar Correo</a>
    <p>Este enlace expirará en 24 horas.</p>
  `;
  
  try {
    await sendEmail({
      to: user.email,
      subject: 'Verificación de Correo Electrónico',
      html: message
    });
    
    res.status(201).json({
      success: true,
      message: 'Usuario registrado. Por favor verifica tu correo electrónico.'
    });
  } catch (error) {
    logger.error(`Error al enviar email de verificación: ${error.message}`);
    
    // Revertir creación de token si falla el envío
    user.verificationToken = undefined;
    user.verificationTokenExpire = undefined;
    await user.save({ validateBeforeSave: false });
    
    return next(new ErrorResponse('Error al enviar el correo electrónico', 500));
  }
});

// @desc    Verificar correo electrónico
// @route   GET /api/v1/auth/verify-email/:token
// @access  Public
exports.verifyEmail = asyncHandler(async (req, res, next) => {
  // Obtener token de la URL y hashear
  const { token } = req.params;
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  // Buscar usuario con token válido
  const user = await User.findOne({
    verificationToken: hashedToken,
    verificationTokenExpire: { $gt: Date.now() }
  });
  
  if (!user) {
    return next(new ErrorResponse('Token inválido o expirado', 400));
  }
  
  // Actualizar usuario
  user.isEmailVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpire = undefined;
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Correo electrónico verificado exitosamente'
  });
});

// @desc    Iniciar sesión
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password, totpToken } = req.body;
  
  // Validar credenciales
  if (!email || !password) {
    return next(new ErrorResponse('Por favor, proporciona email y contraseña', 400));
  }
  
  // Buscar usuario incluyendo contraseña
  const user = await User.findOne({ email }).select('+password');
  
  // Verificar si el usuario existe
  if (!user) {
    return next(new ErrorResponse('Credenciales inválidas', 401));
  }
  
  // Verificar si la cuenta está bloqueada
  if (user.isLocked()) {
    return next(new ErrorResponse('Cuenta bloqueada temporalmente. Intenta más tarde', 403));
  }
  
  // Verificar contraseña
  const isMatch = await user.matchPassword(password);
  
  if (!isMatch) {
    await user.incrementLoginAttempts();
    return next(new ErrorResponse('Credenciales inválidas', 401));
  }
  
  // Verificar email verificado
  if (!user.isEmailVerified) {
    return next(new ErrorResponse('Por favor, verifica tu correo electrónico', 401));
  }
  
  // Verificar 2FA si está habilitado
  if (user.isTwoFactorEnabled) {
    if (!totpToken) {
      return res.status(200).json({
        success: true,
        requireTwoFactor: true,
        message: 'Se requiere código de autenticación de dos factores'
      });
    }
    
    // Verificar código TOTP
    const isValidTOTP = verifyTOTP(user.twoFactorSecret, totpToken);
    
    if (!isValidTOTP) {
      return next(new ErrorResponse('Código de autenticación inválido', 401));
    }
  }
  
  // Reiniciar intentos de inicio de sesión
  await user.resetLoginAttempts();
  
  // Enviar respuesta con token
  sendTokenResponse(user, 200, res);
});

// @desc    Cerrar sesión
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000), // 10 segundos
    httpOnly: true
  });
  
  res.status(200).json({
    success: true,
    message: 'Sesión cerrada exitosamente'
  });
});

// @desc    Obtener usuario actual
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      isEmailVerified: user.isEmailVerified
    }
  });
});

// @desc    Actualizar datos de perfil
// @route   PUT /api/v1/auth/update-profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res, next) => {
  const { name } = req.body;
  
  // Validar datos
  if (!name) {
    return next(new ErrorResponse('Por favor, proporciona un nombre', 400));
  }
  
  // Actualizar perfil
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { name },
    { new: true, runValidators: true }
  );
  
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

// @desc    Actualizar contraseña
// @route   PUT /api/v1/auth/update-password
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  // Validar datos
  if (!currentPassword || !newPassword) {
    return next(new ErrorResponse('Por favor, proporciona la contraseña actual y la nueva', 400));
  }
  
  if (newPassword.length < 8) {
    return next(new ErrorResponse('La nueva contraseña debe tener al menos 8 caracteres', 400));
  }
  
  // Buscar usuario incluyendo contraseña
  const user = await User.findById(req.user.id).select('+password');
  
  // Verificar contraseña actual
  const isMatch = await user.matchPassword(currentPassword);
  
  if (!isMatch) {
    return next(new ErrorResponse('Contraseña actual incorrecta', 401));
  }
  
  // Actualizar contraseña
  user.password = newPassword;
  await user.save();
  
  // Enviar respuesta con nuevo token
  sendTokenResponse(user, 200, res);
});

// @desc    Solicitar restablecimiento de contraseña
// @route   POST /api/v1/auth/forgot-password
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  
  // Validar email
  if (!email) {
    return next(new ErrorResponse('Por favor, proporciona un email', 400));
  }
  
  // Buscar usuario
  const user = await User.findOne({ email });
  
  if (!user) {
    return next(new ErrorResponse('No existe un usuario con ese email', 404));
  }
  
  // Generar token
  const resetToken = user.generateResetPasswordToken();
  await user.save({ validateBeforeSave: false });
  
  // Crear URL de restablecimiento
  const resetUrl = `${config.frontendUrl}/reset-password/${resetToken}`;
  
  // Contenido del email
  const message = `
    <h1>Restablecimiento de Contraseña</h1>
    <p>Has solicitado el restablecimiento de tu contraseña. Por favor, haz clic en el siguiente enlace para establecer una nueva contraseña:</p>
    <a href="${resetUrl}" target="_blank">Restablecer Contraseña</a>
    <p>Este enlace expirará en 1 hora. Si no solicitaste este restablecimiento, por favor ignora este mensaje.</p>
  `;
  
  try {
    await sendEmail({
      to: user.email,
      subject: 'Restablecimiento de Contraseña',
      html: message
    });
    
    res.status(200).json({
      success: true,
      message: 'Email de restablecimiento enviado'
    });
  } catch (error) {
    logger.error(`Error al enviar email de restablecimiento: ${error.message}`);
    
    // Revertir tokens si falla el envío
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    
    return next(new ErrorResponse('Error al enviar el email de restablecimiento', 500));
  }
});

// @desc    Restablecer contraseña
// @route   PUT /api/v1/auth/reset-password/:token
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  // Obtener token de la URL y hashear
  const { token } = req.params;
  const { password } = req.body;
  
  if (!password) {
    return next(new ErrorResponse('Por favor, proporciona una nueva contraseña', 400));
  }
  
  if (password.length < 8) {
    return next(new ErrorResponse('La contraseña debe tener al menos 8 caracteres', 400));
  }
  
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  // Buscar usuario con token válido
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  });
  
  if (!user) {
    return next(new ErrorResponse('Token inválido o expirado', 400));
  }
  
  // Establecer nueva contraseña
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Contraseña restablecida exitosamente'
  });
});

// @desc    Configurar autenticación de dos factores
// @route   GET /api/v1/auth/setup-2fa
// @access  Private
exports.setupTwoFactor = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  
  // Generar secreto TOTP si no existe
  if (!user.twoFactorSecret) {
    const { secret, qrCode } = generateTOTP(user.email);
    
    // Guardar secreto temporalmente
    user.twoFactorSecret = secret;
    await user.save({ validateBeforeSave: false });
    
    res.status(200).json({
      success: true,
      data: {
        secret,
        qrCode
      }
    });
  } else {
    // Si ya existe un secreto, generar nuevo código QR
    const { qrCode } = generateTOTP(user.email, user.twoFactorSecret);
    
    res.status(200).json({
      success: true,
      data: {
        qrCode
      }
    });
  }
});

// @desc    Verificar y activar autenticación de dos factores
// @route   POST /api/v1/auth/verify-2fa
// @access  Private
exports.verifyAndEnableTwoFactor = asyncHandler(async (req, res, next) => {
  const { token } = req.body;
  
  if (!token) {
    return next(new ErrorResponse('Por favor, proporciona un token', 400));
  }
  
  const user = await User.findById(req.user.id);
  
  // Verificar token TOTP
  const isValid = verifyTOTP(user.twoFactorSecret, token);
  
  if (!isValid) {
    return next(new ErrorResponse('Token inválido', 401));
  }
  
  // Activar 2FA
  user.isTwoFactorEnabled = true;
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Autenticación de dos factores activada correctamente'
  });
});

// @desc    Desactivar autenticación de dos factores
// @route   POST /api/v1/auth/disable-2fa
// @access  Private
exports.disableTwoFactor = asyncHandler(async (req, res, next) => {
  const { token, password } = req.body;
  
  if (!token || !password) {
    return next(new ErrorResponse('Por favor, proporciona token y contraseña', 400));
  }
  
  // Buscar usuario incluyendo contraseña
  const user = await User.findById(req.user.id).select('+password');
  
  // Verificar contraseña
  const isMatch = await user.matchPassword(password);
  
  if (!isMatch) {
    return next(new ErrorResponse('Contraseña incorrecta', 401));
  }
  
  // Verificar token TOTP
  const isValid = verifyTOTP(user.twoFactorSecret, token);
  
  if (!isValid) {
    return next(new ErrorResponse('Token inválido', 401));
  }
  
  // Desactivar 2FA
  user.isTwoFactorEnabled = false;
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Autenticación de dos factores desactivada correctamente'
  });
});