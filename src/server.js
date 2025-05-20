const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser'); // Añadir esta línea
const helmet = require('helmet'); // Añadir esta línea
const xss = require('xss-clean'); // Añadir esta línea
const rateLimit = require('express-rate-limit'); // Añadir esta línea
const hpp = require('hpp'); // Añadir esta línea
const mongoSanitize = require('express-mongo-sanitize'); // Añadir esta línea

const config = require('./config');
const { connectDB } = require('./config/database');
const routes = require('./routes');
const authRoutes = require('./routes/authRoutes'); // Añadir esta línea
const errorHandler = require('./middleware/errorHandler');
const socketService = require('./services/socketService');
const whatsAppSocketBridge = require('./services/whatsAppSocketBridge');
const sessionCleanupService = require('./services/sessionCleanupService'); // Añadir esta línea
const logger = require('./utils/logger');
const swagger = require('./config/swagger');

// Crear la aplicación Express
const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Cookie parser - necesario para autenticación basada en cookies
app.use(cookieParser());

// Medidas de seguridad
app.use(helmet()); // Configurar encabezados HTTP seguros
app.use(xss()); // Prevenir ataques XSS (Cross-Site Scripting)
app.use(mongoSanitize()); // Prevenir inyección NoSQL

// Limitar peticiones por IP (para prevenir ataques de fuerza bruta)
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // Ventana de tiempo para límite
  max: config.rateLimit.max, // Límite de peticiones por ventana
  message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo después'
});
app.use('/api/v1/auth', limiter); // Aplicar limitador a rutas de autenticación

// Prevenir polución de parámetros HTTP
app.use(hpp());

// CORS
app.use(cors({
  origin: config.frontendUrl,
  credentials: true // Importante para cookies de autenticación
}));

// Logging HTTP
if (config.env === 'development') {
  app.use(morgan('dev', { stream: logger.stream }));
}

// Documentación API
app.use('/api-docs', swagger.serve, swagger.setup);

// Montar rutas de autenticación
app.use('/api/v1/auth', authRoutes);

// Montar resto de rutas de la API
app.use('/api/v1', routes);

// Ruta de salud
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Servidor funcionando correctamente',
    timestamp: new Date()
  });
});

// Manejar rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada - ${req.originalUrl}`
  });
});

// Middleware de manejo de errores
app.use(errorHandler);

// Función para inicializar el servidor
const startServer = async () => {
  try {
    // Conectar a la base de datos
    await connectDB();
    
    // Crear servidor HTTP
    const server = http.createServer(app);
    
    // Inicializar servicio de WebSockets
    socketService.initialize(server);
    
    // Inicializar el puente con el servicio de WhatsApp
    whatsAppSocketBridge.initialize();
    
    // Iniciar servicio de limpieza de sesiones (ejecutar cada X horas)
    sessionCleanupService.start(config.sessionCleanupInterval);
    
    // Iniciar el servidor
    const PORT = config.port || 3000;
    server.listen(PORT, () => {
      logger.info(`Servidor ejecutándose en modo ${config.env} en puerto ${PORT}`);
    });
    
    // Manejo de errores no capturados
    process.on('unhandledRejection', (err) => {
      logger.error(`Error no manejado: ${err.message}`, { stack: err.stack });
      // No cerrar el servidor en producción, pero loguear el error
      if (config.env !== 'production') {
        console.error(err);
      }
    });
  } catch (error) {
    logger.error(`Error al iniciar el servidor: ${error.message}`);
    process.exit(1);
  }
};

// Iniciar el servidor
startServer();

// Exportar para pruebas
module.exports = { app };