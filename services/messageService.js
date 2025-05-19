const Message = require('../models/Message');
const Contact = require('../models/Contact');
const Session = require('../models/Session');
const socketService = require('./socketService');
const logger = require('../utils/logger');

class MessageService {
  // Procesar y almacenar mensajes recibidos del webhook
  async processIncomingMessages(payload) {
    try {
      if (!payload || !payload.sessionId || !payload.messages || !Array.isArray(payload.messages)) {
        throw new Error('Payload de mensajes inválido');
      }
      
      const { sessionId, chatId, messages } = payload;
      
      // Verificar si la sesión existe
      const session = await Session.findOne({ sessionId });
      if (!session) {
        logger.warn(`Recibidos mensajes para sesión inexistente: ${sessionId}`);
      }
      
      // Preprocesar mensajes para guardar en la BD
      const processedMessages = messages.map(msg => ({
        sessionId: msg.sessionId,
        messageId: msg.id,
        chatId: msg.from,
        from: msg.from,
        fromMe: msg.fromMe || false,
        to: msg.to,
        body: msg.body,
        timestamp: msg.timestamp,
        type: msg.type || 'chat',
        hasMedia: msg.hasMedia || false,
        media: msg.media ? {
          url: msg.media.url,
          mimetype: msg.media.mimeType,
          filename: msg.media.filename,
          filesize: msg.media.filesize,
          caption: msg.media.caption
        } : undefined,
        isGroupMessage: msg.isGroupMessage || false,
        author: msg.author,
        authorName: msg.authorName,
        groupName: msg.groupName,
        contactName: msg.contactName,
        isForwarded: msg.isForwarded || false,
        forwardingScore: msg.forwardingScore || 0,
        isStatus: msg.isStatus || false,
        // Contenido específico según tipo de mensaje
        location: msg.location,
        vcard: msg.vcard,
        // Metadatos adicionales
        metadata: {
          deviceType: msg.deviceType,
          contact: msg.contact,
          group: msg.group
        }
      }));
      
      // Guardar mensajes en la base de datos
      const savedMessages = await Message.insertMany(processedMessages, { 
        ordered: false // Continuar incluso si hay duplicados
      }).catch(err => {
        if (err.code === 11000) {
          logger.warn(`Algunos mensajes ya existían en la base de datos. Sesión: ${sessionId}`);
          return { insertedCount: err.result?.nInserted || 0 };
        }
        throw err;
      });
      
      // Actualizar o crear contactos
      await this.updateContactsFromMessages(messages, sessionId);
      
      // Notificar a clientes conectados mediante WebSockets
      socketService.emitToSession(sessionId, 'new_messages', {
        sessionId,
        chatId,
        count: messages.length,
        messages: processedMessages.map(this.sanitizeMessageForClient)
      });
      
      return {
        success: true,
        stored: savedMessages.length || savedMessages.insertedCount || 0,
        total: messages.length
      };
    } catch (error) {
      logger.error(`Error al procesar mensajes entrantes: ${error.message}`);
      throw error;
    }
  }
  
  // Recuperar mensajes por chat y sesión
  async getMessages(sessionId, chatId, options = {}) {
    try {
      const { 
        limit = 50, 
        before = Date.now(), 
        messageId, 
        includeMedia = false
      } = options;
      
      let query = { sessionId };
      
      // Si se proporciona chatId, filtrar por chat
      if (chatId) {
        query.chatId = chatId;
      }
      
      // Si se proporciona messageId, buscar mensajes anteriores a ese ID
      if (messageId) {
        const refMessage = await Message.findOne({ messageId });
        if (refMessage) {
          query.timestamp = { $lt: refMessage.timestamp };
        } else {
          query.timestamp = { $lt: before };
        }
      } else {
        // Si no hay messageId, usar timestamp 'before'
        query.timestamp = { $lt: before };
      }
      
      // Si no se quieren incluir mensajes con media, filtrarlos
      if (!includeMedia) {
        query.hasMedia = { $ne: true };
      }
      
      // Obtener mensajes
      const messages = await Message.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
      
      // Sanear mensajes para cliente
      return messages.map(this.sanitizeMessageForClient);
    } catch (error) {
      logger.error(`Error al recuperar mensajes: ${error.message}`);
      throw error;
    }
  }
  
  // Recuperar chats (conversaciones) para una sesión
  async getChats(sessionId) {
    try {
      // Agregar todos los chatIds únicos
      const chats = await Message.aggregate([
        { $match: { sessionId } },
        { $group: {
          _id: "$chatId",
          lastMessageTime: { $max: "$timestamp" },
          messageCount: { $sum: 1 }
        }},
        { $sort: { lastMessageTime: -1 } }
      ]);
      
      // Obtener el último mensaje e información de contacto para cada chat
      const chatDetails = await Promise.all(chats.map(async (chat) => {
        // Obtener último mensaje
        const lastMessage = await Message.findOne({
          sessionId,
          chatId: chat._id
        }).sort({ timestamp: -1 }).lean();
        
        // Obtener info de contacto
        const contact = await Contact.findOne({
          sessionId,
          contactId: chat._id
        }).lean();
        
        return {
          id: chat._id,
          lastMessage: this.sanitizeMessageForClient(lastMessage),
          messageCount: chat.messageCount,
          contact: contact ? {
            id: contact.contactId,
            name: contact.name,
            pushname: contact.pushname,
            isGroup: contact.isGroup,
            avatarUrl: contact.avatarUrl,
            displayName: contact.displayName // Virtual
          } : {
            id: chat._id,
            name: lastMessage?.contactName || lastMessage?.groupName || chat._id
          },
          unreadCount: 0 // Esto se podría implementar si se tiene un sistema de "leído"
        };
      }));
      
      return chatDetails;
    } catch (error) {
      logger.error(`Error al recuperar chats para sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }
  
  // Actualizar contactos a partir de los mensajes recibidos
  async updateContactsFromMessages(messages, sessionId) {
    try {
      // Mapa para evitar actualizaciones duplicadas en el mismo lote
      const contactUpdates = new Map();
      
      for (const msg of messages) {
        // Si es un chat privado, actualizar el contacto del remitente
        if (!msg.isGroupMessage && msg.from && !contactUpdates.has(msg.from)) {
          const contactData = {
            sessionId,
            contactId: msg.from,
            phoneNumber: msg.contact?.number,
            name: msg.contact?.savedName,
            pushname: msg.contact?.pushname,
            isGroup: false,
            lastInteraction: new Date()
          };
          contactUpdates.set(msg.from, contactData);
        }
        
        // Si es un mensaje de grupo, actualizar el grupo
        if (msg.isGroupMessage && msg.from && !contactUpdates.has(msg.from)) {
          const groupData = {
            sessionId,
            contactId: msg.from,
            name: msg.groupName || msg.group?.name,
            isGroup: true,
            lastInteraction: new Date()
          };
          
          // Agregar metadata del grupo si está disponible
          if (msg.group && msg.group.participants) {
            groupData.groupMetadata = {
              participants: msg.group.participants.map(p => ({
                id: p.id,
                isAdmin: p.isAdmin || false,
                isSuperAdmin: p.isSuperAdmin || false
              })),
              description: msg.group.description,
              owner: msg.group.owner
            };
          }
          
          contactUpdates.set(msg.from, groupData);
        }
        
        // Si es mensaje de grupo y tiene autor, actualizar el autor
        if (msg.isGroupMessage && msg.author && !contactUpdates.has(msg.author)) {
          const authorData = {
            sessionId,
            contactId: msg.author,
            phoneNumber: msg.authorContact?.number,
            name: msg.authorContact?.savedName,
            pushname: msg.authorContact?.pushname || msg.authorName,
            isGroup: false,
            lastInteraction: new Date()
          };
          contactUpdates.set(msg.author, authorData);
        }
      }
      
      // Actualizar contactos en la base de datos (upsert)
      const operations = Array.from(contactUpdates.values()).map(contactData => ({
        updateOne: {
          filter: { sessionId, contactId: contactData.contactId },
          update: { $set: contactData },
          upsert: true
        }
      }));
      
      if (operations.length > 0) {
        await Contact.bulkWrite(operations);
        logger.debug(`Actualizados ${operations.length} contactos para sesión ${sessionId}`);
      }
      
      return { updated: operations.length };
    } catch (error) {
      logger.error(`Error al actualizar contactos: ${error.message}`);
      // No propagamos el error para no interrumpir el procesamiento de mensajes
      return { updated: 0, error: error.message };
    }
  }
  
  // Sanitizar mensaje para el cliente (eliminar campos sensibles/innecesarios)
  sanitizeMessageForClient(message) {
    if (!message) return null;
    
    // Crear copia para no modificar el original
    const sanitized = { ...message };
    
    // Eliminar campos sensibles o innecesarios
    delete sanitized._id;
    delete sanitized.__v;
    
    // Simplificar metadata
    if (sanitized.metadata) {
      // Mantener solo datos relevantes para el cliente
      const simplifiedMetadata = {};
      if (sanitized.metadata.deviceType) simplifiedMetadata.deviceType = sanitized.metadata.deviceType;
      if (sanitized.metadata.isForwarded) simplifiedMetadata.isForwarded = sanitized.metadata.isForwarded;
      
      sanitized.metadata = simplifiedMetadata;
    }
    
    return sanitized;
  }
}

module.exports = new MessageService();