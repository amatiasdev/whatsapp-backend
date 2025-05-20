// src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Por favor, proporciona un nombre']
  },
  email: {
    type: String,
    required: [true, 'Por favor, proporciona un email'],
    unique: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Por favor, proporciona un email válido'
    ]
  },
  password: {
    type: String,
    required: [true, 'Por favor, proporciona una contraseña'],
    minlength: 8,
    select: false // No incluir en consultas por defecto
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationTokenExpire: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  twoFactorSecret: String,
  isTwoFactorEnabled: {
    type: Boolean,
    default: false
  },
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware para encriptar contraseñas antes de guardar
UserSchema.pre('save', async function(next) {
  // Solo hash la contraseña si ha sido modificada o es nueva
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    // Generar salt
    const salt = await bcrypt.genSalt(12);
    
    // Hash contraseña con salt
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para verificar contraseña
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Método para generar token de verificación de email
UserSchema.methods.generateVerificationToken = function() {
  // Crear token aleatorio
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  // Hash del token para almacenar en la base de datos
  this.verificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  // Establecer fecha de expiración (24 horas)
  this.verificationTokenExpire = Date.now() + 24 * 60 * 60 * 1000;
  
  return verificationToken;
};

// Método para generar token de reseteo de contraseña
UserSchema.methods.generateResetPasswordToken = function() {
  // Crear token aleatorio
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Hash del token para almacenar en la base de datos
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  // Establecer fecha de expiración (1 hora)
  this.resetPasswordExpire = Date.now() + 60 * 60 * 1000;
  
  return resetToken;
};

// Incrementar intentos de inicio de sesión fallidos
UserSchema.methods.incrementLoginAttempts = async function() {
  // Incrementar contador de intentos
  this.loginAttempts += 1;
  
  // Si excede 5 intentos, bloquear cuenta por 15 minutos
  if (this.loginAttempts >= 5) {
    this.lockUntil = Date.now() + 15 * 60 * 1000; // 15 minutos
  }
  
  await this.save();
};

// Verificar si la cuenta está bloqueada
UserSchema.methods.isLocked = function() {
  // Verificar si existe tiempo de bloqueo y si aún no ha expirado
  return this.lockUntil && this.lockUntil > Date.now();
};

// Reiniciar intentos de inicio de sesión
UserSchema.methods.resetLoginAttempts = async function() {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  this.lastLogin = Date.now();
  await this.save();
};

module.exports = mongoose.model('User', UserSchema);