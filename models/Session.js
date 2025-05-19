const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: false,
    trim: true
  },
  description: {
    type: String,
    required: false
  },
  isListening: {
    type: Boolean,
    default: false
  },
  isConnected: {
    type: Boolean,
    default: false
  },
  lastQRTimestamp: {
    type: Date
  },
  lastConnection: {
    type: Date
  },
  lastDisconnection: {
    type: Date
  },
  status: {
    type: String,
    enum: ['initializing', 'qr_ready', 'connected', 'disconnected', 'failed'],
    default: 'initializing'
  },
  failureReason: {
    type: String
  },
  webhookUrl: {
    type: String
  },
  filters: {
    ignoreBroadcast: {
      type: Boolean,
      default: true
    },
    ignoreGroups: {
      type: Boolean,
      default: false
    },
    ignoreNonGroups: {
      type: Boolean,
      default: false
    },
    allowedGroups: {
      type: [String],
      default: []
    },
    allowedContacts: {
      type: [String],
      default: []
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para mejorar el rendimiento de las consultas
sessionSchema.index({ sessionId: 1 });
sessionSchema.index({ userId: 1 });
sessionSchema.index({ status: 1 });
sessionSchema.index({ createdAt: -1 });

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;