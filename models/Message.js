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
    enum: ['chat', 'image', 'video', 'audio', 'ptt', 'document', 'location', 'contact', 'sticker', 'unknown'],
    default: 'chat'
  },
  hasMedia: {
    type: Boolean,
    default: false
  },
  media: {
    url: String,
    mimetype: String,
    filename: String,
    filesize: Number,
    caption: String
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
  // Contenido específico según el tipo de mensaje
  location: {
    latitude: Number,
    longitude: Number,
    description: String
  },
  vcard: {
    type: String
  },
  // Metadatos adicionales
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Índices compuestos para mejorar las consultas
messageSchema.index({ sessionId: 1, timestamp: -1 });
messageSchema.index({ sessionId: 1, chatId: 1, timestamp: -1 });
messageSchema.index({ sessionId: 1, type: 1 });
messageSchema.index({ sessionId: 1, isGroupMessage: 1 });

// Función para eliminar mensajes antiguos (útil para gestionar el tamaño de la BD)
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