const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const { connectDB } = require('./config/database');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const socketService = require('./services/socketService');
const whatsAppSocketBridge = require('./services/whatsAppSocketBridge'); // Añadir esta línea
const logger = require('./utils/logger');
const swagger = require('./config/swagger');

// Crear la aplicación Express
const app = express();

// Configurar middleware
app.use(cors({
  origin: config.frontendUrl,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging HTTP
if (config.env === 'development') {
  app.use(morgan('dev', { stream: logger.stream }));
}

app.use('/api-docs', swagger.serve, swagger.setup);
// Montar rutas de la API
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
    whatsAppSocketBridge.initialize(); // Añadir esta línea
    
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