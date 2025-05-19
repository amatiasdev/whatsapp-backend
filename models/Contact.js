const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true
  },
  contactId: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String
  },
  countryCode: {
    type: String
  },
  name: {
    type: String
  },
  pushname: {
    type: String
  },
  shortName: {
    type: String
  },
  businessName: {
    type: String
  },
  description: {
    type: String
  },
  isGroup: {
    type: Boolean,
    default: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isBusiness: {
    type: Boolean,
    default: false
  },
  isEnterprise: {
    type: Boolean,
    default: false
  },
  isMyContact: {
    type: Boolean,
    default: false
  },
  lastInteraction: {
    type: Date
  },
  avatarUrl: {
    type: String
  },
  // Información adicional para grupos
  groupMetadata: {
    participants: [{
      id: String,
      isAdmin: Boolean,
      isSuperAdmin: Boolean
    }],
    description: String,
    owner: String,
    createdAt: Date
  },
  // Metadatos personalizados
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índice compuesto para identificación única de contactos por sesión
contactSchema.index({ sessionId: 1, contactId: 1 }, { unique: true });
contactSchema.index({ sessionId: 1, isGroup: 1 });

// Establecer TTL (Time To Live) para la caché de contactos (14 días)
contactSchema.index({ lastInteraction: 1 }, { expireAfterSeconds: 1209600 });

// Virtuals
contactSchema.virtual('fullNumber').get(function() {
  if (this.countryCode && this.phoneNumber) {
    return `+${this.countryCode}${this.phoneNumber}`;
  }
  return this.phoneNumber;
});

contactSchema.virtual('displayName').get(function() {
  return this.name || this.pushname || this.businessName || this.fullNumber || this.contactId;
});

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;