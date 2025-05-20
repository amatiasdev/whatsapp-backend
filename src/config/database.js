const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

// Opciones para mejorar las conexiones a MongoDB
const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

// Función para conectar a la base de datos
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, options);
    logger.info(`MongoDB conectado: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    logger.error(`Error al conectar a MongoDB: ${err.message}`);
    process.exit(1);
  }
};

// Eventos de conexión para monitoreo
mongoose.connection.on('disconnected', () => {
  logger.warn('Desconectado de MongoDB');
});

mongoose.connection.on('error', (err) => {
  logger.error(`Error de MongoDB: ${err.message}`);
});

// Para cerrar la conexión correctamente al terminar la aplicación
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('Conexión a MongoDB cerrada por terminación del servidor');
  process.exit(0);
});

module.exports = { connectDB };