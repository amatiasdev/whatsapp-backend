/**
 * helpers.js
 * Funciones auxiliares para el backend
 */

const crypto = require('crypto');

/**
 * Genera un ID aleatorio con un prefijo específico
 * @param {string} prefix - Prefijo para el ID (ej: 'session', 'msg')
 * @param {number} length - Longitud del ID (sin contar el prefijo)
 * @returns {string} ID generado
 */
exports.generateId = (prefix = '', length = 10) => {
  const randomPart = crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
  
  return prefix ? `${prefix}_${randomPart}` : randomPart;
};

/**
 * Formatea un número de teléfono para WhatsApp
 * @param {string} phone - Número de teléfono a formatear
 * @returns {string} Número formateado para WhatsApp
 */
exports.formatPhoneNumber = (phone) => {
  // Eliminar caracteres no numéricos
  let cleaned = phone.replace(/\D/g, '');
  
  // Asegurarse de que tiene el formato correcto para WhatsApp (CCNNNNNNNNN)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Si no tiene código de país, añadir el predeterminado (configurable)
  if (cleaned.length <= 10) {
    const defaultCountryCode = '52'; // México por defecto, ajustar según necesidades
    cleaned = defaultCountryCode + cleaned;
  }
  
  // Añadir sufijo de WhatsApp si no lo tiene
  if (!cleaned.includes('@')) {
    cleaned = `${cleaned}@c.us`;
  }
  
  return cleaned;
};

/**
 * Elimina el sufijo de WhatsApp de un ID de chat/contacto
 * @param {string} id - ID de WhatsApp
 * @returns {string} ID sin sufijo
 */
exports.removeWhatsAppSuffix = (id) => {
  if (!id) return '';
  return id.replace(/@c\.us$|@g\.us$|@broadcast$/, '');
};

/**
 * Determina si un ID es de un grupo o un contacto individual
 * @param {string} id - ID a verificar
 * @returns {boolean} true si es un grupo, false si es contacto individual
 */
exports.isGroupId = (id) => {
  if (!id) return false;
  return id.endsWith('@g.us');
};

/**
 * Formatea una fecha en formato legible
 * @param {Date|number|string} date - Fecha a formatear
 * @returns {string} Fecha formateada
 */
exports.formatDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  
  if (isNaN(d.getTime())) {
    return 'Fecha inválida';
  }
  
  const now = new Date();
  const diff = now - d;
  const oneDay = 24 * 60 * 60 * 1000;
  
  // Si es hoy, mostrar hora
  if (diff < oneDay && now.getDate() === d.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Si es ayer, mostrar "Ayer"
  if (diff < oneDay * 2 && now.getDate() - d.getDate() === 1) {
    return 'Ayer';
  }
  
  // Si es esta semana, mostrar día de la semana
  if (diff < oneDay * 7) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[d.getDay()];
  }
  
  // Mostrar fecha completa
  return d.toLocaleDateString();
};

/**
 * Trunca un texto a una longitud máxima
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Longitud máxima
 * @returns {string} Texto truncado
 */
exports.truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Sanitiza un texto para uso seguro en HTML/DB
 * @param {string} text - Texto a sanitizar
 * @returns {string} Texto sanitizado
 */
exports.sanitizeText = (text) => {
  if (!text) return '';
  
  // Eliminar etiquetas HTML y caracteres potencialmente peligrosos
  return text
    .replace(/<[^>]*>?/gm, '')
    .replace(/[&<>"']/g, (match) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entities[match];
    });
};

/**
 * Extrae URLs de un texto
 * @param {string} text - Texto a analizar
 * @returns {Array<string>} Array de URLs encontradas
 */
exports.extractUrls = (text) => {
  if (!text) return [];
  
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
};

/**
 * Genera un hash para una cadena
 * @param {string} text - Texto para generar hash
 * @returns {string} Hash generado
 */
exports.generateHash = (text) => {
  if (!text) return '';
  return crypto.createHash('sha256').update(text).digest('hex');
};

/**
 * Extrae metadatos de un mensaje
 * @param {Object} message - Objeto de mensaje
 * @returns {Object} Metadatos del mensaje
 */
exports.extractMessageMetadata = (message) => {
  if (!message) return {};
  
  return {
    hasMedia: message.hasMedia || false,
    isForwarded: message.isForwarded || false,
    isStarred: message.isStarred || false,
    fromMe: message.fromMe || false,
    messageType: message.type || 'unknown',
    timestamp: message.timestamp || Date.now()
  };
};

/**
 * Agrupa mensajes por fecha
 * @param {Array} messages - Lista de mensajes
 * @returns {Object} Mensajes agrupados por fecha
 */
exports.groupMessagesByDate = (messages) => {
  if (!messages || !Array.isArray(messages)) return {};
  
  const grouped = {};
  
  messages.forEach(msg => {
    const date = new Date(msg.timestamp);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (!grouped[dateStr]) {
      grouped[dateStr] = [];
    }
    
    grouped[dateStr].push(msg);
  });
  
  return grouped;
};

/**
 * Detecta el tipo de contenido en un texto
 * @param {string} text - Texto a analizar
 * @returns {Object} Tipos de contenido detectados
 */
exports.detectContentTypes = (text) => {
  if (!text) return { hasLinks: false, hasEmail: false, hasPhone: false };
  
  const result = {
    hasLinks: /(https?:\/\/[^\s]+)/i.test(text),
    hasEmail: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(text),
    hasPhone: /(\+\d{1,3})?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/i.test(text)
  };
  
  return result;
};

/**
 * Calcula el tiempo transcurrido desde una fecha
 * @param {Date|number|string} date - Fecha a calcular
 * @returns {string} Tiempo transcurrido en formato legible
 */
exports.timeAgo = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  
  if (isNaN(d.getTime())) {
    return 'Fecha inválida';
  }
  
  const now = new Date();
  const seconds = Math.floor((now - d) / 1000);
  
  // Menos de un minuto
  if (seconds < 60) {
    return 'ahora';
  }
  
  // Menos de una hora
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }
  
  // Menos de un día
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} h`;
  }
  
  // Menos de una semana
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `hace ${days} d`;
  }
  
  // Menos de un mes
  const weeks = Math.floor(days / 7);
  if (weeks < 4) {
    return `hace ${weeks} sem`;
  }
  
  // Menos de un año
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `hace ${months} mes${months > 1 ? 'es' : ''}`;
  }
  
  // Más de un año
  const years = Math.floor(days / 365);
  return `hace ${years} año${years > 1 ? 's' : ''}`;
};

/**
 * Valida una dirección de correo electrónico
 * @param {string} email - Dirección a validar
 * @returns {boolean} True si es válida, false en caso contrario
 */
exports.isValidEmail = (email) => {
  if (!email) return false;
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return regex.test(email);
};

/**
 * Genera una contraseña aleatoria
 * @param {number} length - Longitud de la contraseña
 * @param {boolean} includeSpecialChars - Incluir caracteres especiales
 * @returns {string} Contraseña generada
 */
exports.generateRandomPassword = (length = 10, includeSpecialChars = true) => {
  const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
  const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  let chars = lowerChars + upperChars + numbers;
  if (includeSpecialChars) {
    chars += specialChars;
  }
  
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    password += chars[randomIndex];
  }
  
  return password;
};

module.exports = exports;