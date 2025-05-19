const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

// Obtenemos el puerto desde el archivo .env o usamos un valor por defecto
require('dotenv').config();
const PORT = process.env.PORT || 3000;

// Opciones básicas de Swagger
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API WhatsApp',
      version: '1.0.0',
      description: 'API para gestionar sesiones de WhatsApp y mensajes',
      contact: {
        name: 'Soporte',
        email: 'soporte@api-whatsapp.com',
      },
    },
    servers: [
      {
        url: `/api/v1`,
        description: 'Servidor de desarrollo',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // Incluir todos los archivos js en las carpetas routes y controllers
  apis: [
    './routes/*.js', 
    './controllers/*.js', 
    './models/*.js',
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../controllers/*.js'),
    path.join(__dirname, '../models/*.js')
  ],
  // Configuración adicional para procesar correctamente las anotaciones
  swaggerOptions: {
    includeExports: true  // Procesar anotaciones incluso después de module.exports
  }
};

const specs = swaggerJsdoc(options);

module.exports = {
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      docExpansion: 'none', // "list", "full" o "none"
    },
  }),
  specs,
};