const express = require('express');
const router = express.Router();

// Importar rutas específicas
const sessionRoutes = require('./sessionRoutes');
const messageRoutes = require('./messageRoutes');
const userRoutes = require('./userRoutes');
const whatsappRoutes = require('./whatsappRoutes');
const simpleSummaryRoutes = require('./summaryHistoryRoutes');

// Middleware de versión de API
router.use((req, res, next) => {
  req.apiVersion = 'v1';
  next();
});

// Montar rutas
router.use('/sessions', sessionRoutes);
router.use('/messages', messageRoutes);
router.use('/users', userRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/summaries', simpleSummaryRoutes);

// Ruta de salud/estado
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API funcionando correctamente',
    version: req.apiVersion,
    timestamp: new Date()
  });
});

module.exports = router;