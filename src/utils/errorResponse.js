// src/utils/errorResponse.js

// Clase personalizada para errores con código de estado HTTP
class ErrorResponse extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = ErrorResponse;