const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  messageId: {
    type: String,
    required: true,
    unique: true
  },
  chatId: {
    type: String,
    required: true,
    index: true
  },
  from: {
    type: String,
    required: true
  },
  fromMe: {
    type: Boolean,
    default: false
  },
  to: {
    type: String
  },
  body: {
    type: String
  },
  timestamp: {
    type: Number,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['chat', 'text', 'image', 'video', 'audio', 'ptt', 'document', 'location', 'contact', 'sticker', 'unknown'],
    default: 'chat'
  },
  hasMedia: {
    type: Boolean,
    default: false
  },
  media: {
    type: String, // Para compatibilidad con el campo anterior
    url: String,
    mimetype: String,
    filename: String,
    filesize: Number,
    caption: String,
    // 🆕 NUEVOS CAMPOS para metadata extendida
    duration: Number,
    width: Number,
    height: Number,
    isViewOnce: Boolean
  },
  isGroupMessage: {
    type: Boolean,
    default: false
  },
  author: {
    type: String
  },
  authorName: {
    type: String
  },
  groupName: {
    type: String
  },
  contactName: {
    type: String
  },
  isForwarded: {
    type: Boolean,
    default: false
  },
  forwardingScore: {
    type: Number,
    default: 0
  },
  isStatus: {
    type: Boolean,
    default: false
  },
  // 🆕 NUEVO CAMPO para tipo de dispositivo
  deviceType: {
    type: String
  },
  // Contenido específico según el tipo de mensaje (SIN CAMBIOS)
  location: {
    latitude: Number,
    longitude: Number,
    description: String
  },
  vcard: {
    type: String
  },
  // 🔧 METADATOS EXTENDIDOS para incluir info del microservicio
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    // Estructura sugerida para nuevos metadatos:
    // serviceVersion: String,
    // capturedAt: Number,
    // processedAt: Number,
    // receivedAt: Number,
    // deviceType: String,
    // chatInfo: Object
  }
}, {
  timestamps: true
});

// Índices existentes
messageSchema.index({ sessionId: 1, timestamp: -1 });
messageSchema.index({ sessionId: 1, chatId: 1, timestamp: -1 });
messageSchema.index({ sessionId: 1, type: 1 });
messageSchema.index({ sessionId: 1, isGroupMessage: 1 });
messageSchema.index({ sessionId: 1, deviceType: 1 });

// Función para eliminar mensajes antiguos
messageSchema.statics.deleteOldMessages = async function(sessionId, daysToKeep = 30) {
  const date = new Date();
  date.setDate(date.getDate() - daysToKeep);
  
  return this.deleteMany({
    sessionId,
    timestamp: { $lt: date.getTime() }
  });
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;