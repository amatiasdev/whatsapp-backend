// src/utils/twoFactorAuth.js
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const config = require('../config');

// Generar secreto y código QR para TOTP
exports.generateTOTP = async (email, secret = null) => {
  // Si no se proporciona un secreto, generar uno nuevo
  if (!secret) {
    secret = speakeasy.generateSecret({
      length: 20,
      name: `${config.appName}:${email}`
    }).base32;
  }
  
  // Generar URL para código QR
  const otpauth_url = speakeasy.otpauthURL({
    secret: secret,
    label: `${config.appName}:${email}`,
    issuer: config.appName,
    encoding: 'base32'
  });
  
  // Generar código QR como dataURL
  const qrCode = await qrcode.toDataURL(otpauth_url);
  
  return {
    secret,
    qrCode
  };
};

// Verificar token TOTP
exports.verifyTOTP = (secret, token) => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: token.toString().replace(/\s/g, ''),
    window: 1 // Permitir un paso antes/después para compensar desincronización
  });
};