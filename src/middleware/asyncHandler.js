// src/middleware/asyncHandler.js

// Middleware para manejar excepciones asíncronas
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;