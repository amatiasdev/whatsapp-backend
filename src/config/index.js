// src/config/index.js
require('dotenv').config();

module.exports = {
  // Servidor
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  
  // Base de datos
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_api',
  
  // Servicio de WhatsApp
  whatsappServiceUrl: process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'default_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtCookieExpire: parseInt(process.env.JWT_COOKIE_EXPIRE || '7', 10), // días
  
  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Polling
  qrPollInterval: parseInt(process.env.QR_POLL_INTERVAL || '2000', 10), // Intervalo para sondear códigos QR en ms
  
  // WebSockets
  socketOptions: {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:8080',
      methods: ["GET", "POST"],
      credentials: true
    }
  },
  
  // Email (para verificación de email y reseteo de contraseña)
  emailHost: process.env.EMAIL_HOST || 'smtp.gmail.com',
  emailPort: parseInt(process.env.EMAIL_PORT || '587', 10),
  emailUsername: process.env.EMAIL_USERNAME,
  emailPassword: process.env.EMAIL_PASSWORD,
  fromEmail: process.env.FROM_EMAIL || 'noreply@whatsappapi.com',
  fromName: process.env.FROM_NAME || 'WhatsApp API',

  // Nombre de la aplicación
  appName: process.env.APP_NAME || 'WhatsApp API',
  
  // Seguridad
  passwordResetExpire: parseInt(process.env.PASSWORD_RESET_EXPIRE || '60', 10) * 60 * 1000, // 60 minutos en ms
  emailVerificationExpire: parseInt(process.env.EMAIL_VERIFICATION_EXPIRE || '24', 10) * 60 * 60 * 1000, // 24 horas en ms
  
  // Límites de peticiones (para prevenir ataques de fuerza bruta)
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15', 10) * 60 * 1000, // 15 minutos en ms
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10) // límite de 100 peticiones por ventana
  },
  
  // Limpieza de sesiones
  sessionCleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL || '12', 10) * 60, // 12 horas en minutos
  sessionInactiveTime: parseInt(process.env.SESSION_INACTIVE_TIME || '48', 10) * 60 * 60 * 1000 // 48 horas en ms
};