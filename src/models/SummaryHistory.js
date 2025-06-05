// src/models/SummaryHistory.js - MODELO SIMPLE PARA HISTORIAL DE RESÚMENES
const mongoose = require('mongoose');

const summaryHistorySchema = new mongoose.Schema({
  // 🎯 CAMPOS REQUERIDOS SEGÚN ESPECIFICACIONES
  chatId: {
    type: String,
    required: [true, 'El ID del chat es requerido'],
    trim: true,
    index: true,
    maxlength: [100, 'chatId no puede exceder 100 caracteres']
  },
  sessionId: {
    type: String,
    required: [true, 'El ID de la sesión es requerido'],
    trim: true,
    index: true,
    maxlength: [100, 'sessionId no puede exceder 100 caracteres']
  },
  title: {
    type: String,
    required: [true, 'El título es requerido'],
    trim: true,
    minlength: [3, 'El título debe tener al menos 3 caracteres'],
    maxlength: [200, 'El título no puede exceder 200 caracteres'],
    index: true
  },
  resumen: {
    type: String,
    required: [true, 'El resumen es requerido'],
    trim: true,
    minlength: [10, 'El resumen debe tener al menos 10 caracteres'],
    maxlength: [5000, 'El resumen no puede exceder 5000 caracteres']
  },
  puntos_clave: {
    type: [String],
    required: [true, 'Los puntos clave son requeridos'],
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0 && v.length <= 20;
      },
      message: 'Debe incluir entre 1 y 20 puntos clave'
    }
  },
  summaryType: {
    type: String,
    default: 'automatic',
    enum: {
      values: ['automatic', 'manual', 'scheduled'],
      message: 'summaryType debe ser: automatic, manual o scheduled'
    },
    index: true
  },
  processedMessageCount: {
    type: Number,
    default: 0,
    min: [0, 'El conteo de mensajes no puede ser negativo'],
    max: [10000, 'El conteo de mensajes no puede exceder 10000']
  },
  timestamp: {
    type: Date,
    required: [true, 'El timestamp es requerido'],
    index: true,
    validate: {
      validator: function(v) {
        const now = new Date();
        const oneHour = 60 * 60 * 1000;
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        
        // No puede ser futuro (más de 1 hora adelante)
        if (v.getTime() > now.getTime() + oneHour) {
          return false;
        }
        
        // No puede ser muy antiguo (más de 30 días)
        if (v.getTime() < now.getTime() - thirtyDays) {
          return false;
        }
        
        return true;
      },
      message: 'timestamp debe estar entre los últimos 30 días y no ser futuro'
    }
  },
  
  // 🔒 CAMPOS DE SEGURIDAD Y TRAZABILIDAD
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario es requerido'],
    index: true
  },
  
  // 📊 METADATOS OPCIONALES
  metadata: {
    type: {
      type: String,
      default: 'summary'
    },
    language: {
      type: String,
      default: 'es'
    },
    source: {
      type: String,
      default: 'api'
    }
  }
}, {
  timestamps: true, // Crea automáticamente createdAt y updatedAt
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Remover campos sensibles en las respuestas JSON
      delete ret.__v;
      delete ret.userId;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// 📈 ÍNDICES PARA OPTIMIZAR CONSULTAS
summaryHistorySchema.index({ chatId: 1, timestamp: -1 });
summaryHistorySchema.index({ sessionId: 1, timestamp: -1 });
summaryHistorySchema.index({ chatId: 1, summaryType: 1, timestamp: -1 });
summaryHistorySchema.index({ userId: 1, timestamp: -1 });
summaryHistorySchema.index({ title: 'text', resumen: 'text' }); // 🆕 ÍNDICE DE TEXTO PARA BÚSQUEDAS

// Índice compuesto único para evitar duplicados exactos
summaryHistorySchema.index({ 
  chatId: 1, 
  sessionId: 1, 
  timestamp: 1 
}, { 
  unique: true,
  name: 'unique_summary_per_chat_session_timestamp'
});

// 🛠️ VIRTUAL PARA FECHA FORMATEADA
summaryHistorySchema.virtual('formattedDate').get(function() {
  return this.timestamp.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// 🛠️ VIRTUAL PARA RESUMEN CORTO
summaryHistorySchema.virtual('resumenCorto').get(function() {
  if (this.resumen && this.resumen.length > 100) {
    return this.resumen.substring(0, 100) + '...';
  }
  return this.resumen;
});

// 📊 MÉTODO ESTÁTICO PARA OBTENER ESTADÍSTICAS POR CHAT
summaryHistorySchema.statics.getStatsByChat = async function(chatId, userId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        chatId,
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: since }
      }
    },
    {
      $group: {
        _id: null,
        totalSummaries: { $sum: 1 },
        totalMessages: { $sum: '$processedMessageCount' },
        avgPointsPerSummary: { $avg: { $size: '$puntos_clave' } },
        lastSummary: { $max: '$timestamp' },
        firstSummary: { $min: '$timestamp' }
      }
    }
  ]);
};

// 🧹 MÉTODO ESTÁTICO PARA LIMPIAR RESÚMENES ANTIGUOS
summaryHistorySchema.statics.cleanupOldSummaries = async function(daysToKeep = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  return this.deleteMany({
    timestamp: { $lt: cutoffDate }
  });
};

// 🔍 MÉTODO ESTÁTICO PARA BUSCAR RESÚMENES POR TEXTO
summaryHistorySchema.statics.searchByText = async function(userId, searchText, limit = 10) {
  return this.find({
    userId: new mongoose.Types.ObjectId(userId),
    $or: [
      { title: { $regex: searchText, $options: 'i' } },
      { resumen: { $regex: searchText, $options: 'i' } },
      { puntos_clave: { $elemMatch: { $regex: searchText, $options: 'i' } } }
    ]
  })
  .sort({ timestamp: -1 })
  .limit(limit)
  .select('-userId -__v');
};

// 🛡️ MIDDLEWARE PRE-SAVE PARA VALIDACIONES ADICIONALES
summaryHistorySchema.pre('save', function(next) {
  // Limpiar y validar puntos clave
  if (this.puntos_clave && Array.isArray(this.puntos_clave)) {
    // Filtrar puntos vacíos y limpiar espacios
    this.puntos_clave = this.puntos_clave
      .filter(punto => punto && typeof punto === 'string' && punto.trim().length > 0)
      .map(punto => punto.trim())
      .slice(0, 20); // Máximo 20 puntos
    
    // Validar que quede al menos un punto
    if (this.puntos_clave.length === 0) {
      return next(new Error('Debe incluir al menos un punto clave válido'));
    }
  }
  
  // Limpiar resumen
  if (this.resumen) {
    this.resumen = this.resumen.trim();
  }
  
  // Limpiar título
  if (this.title) {
    this.title = this.title.trim();
  }
  
  // Validar timestamp si es nuevo documento
  if (this.isNew && this.timestamp) {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const timestampMs = this.timestamp.getTime();
    
    if (timestampMs > now + oneHour) {
      return next(new Error('timestamp no puede ser una fecha futura'));
    }
    
    if (timestampMs < now - thirtyDays) {
      return next(new Error('timestamp no puede ser mayor a 30 días'));
    }
  }
  
  next();
});

// 📝 MIDDLEWARE POST-SAVE PARA LOGGING
summaryHistorySchema.post('save', function(doc) {
  const logger = require('../utils/logger');
  logger.info('Resumen guardado en historial', {
    summaryId: doc._id,
    chatId: doc.chatId,
    sessionId: doc.sessionId,
    summaryType: doc.summaryType,
    pointsCount: doc.puntos_clave ? doc.puntos_clave.length : 0,
    messageCount: doc.processedMessageCount
  });
});

// 🚫 MIDDLEWARE POST-DELETE PARA LOGGING
summaryHistorySchema.post('deleteOne', { document: true, query: false }, function(doc) {
  const logger = require('../utils/logger');
  logger.info('Resumen eliminado del historial', {
    summaryId: doc._id,
    chatId: doc.chatId,
    sessionId: doc.sessionId
  });
});

const SummaryHistory = mongoose.model('SummaryHistory', summaryHistorySchema);

module.exports = SummaryHistory;