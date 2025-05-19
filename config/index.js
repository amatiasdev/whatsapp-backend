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
  jwtSecret: process.env.JWT_SECRET || 'default_secret_do_not_use_in_production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Polling
  qrPollInterval: 2000, // Intervalo para sondear códigos QR en ms
  
  // WebSockets
  socketOptions: {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:8080',
      methods: ["GET", "POST"],
      credentials: true
    }
  }
};