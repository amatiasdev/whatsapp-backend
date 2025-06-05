// src/controllers/whatsappMessageController.js
const Message = require('../models/Message');
const Contact = require('../models/Contact');
const Session = require('../models/Session');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

/**
 * @desc    Recibir y almacenar mensaje individual desde microservicio WhatsApp
 * @route   POST /api/v1/whatsapp/messages
 * @access  Public (llamado por microservicio)
 */
exports.receiveWhatsAppMessage = async (req, res) => {
  const startTime = Date.now();
  let messageId = null;
  
  try {
    const payload = req.body;
    
    // 🔍 Validación básica de estructura
    if (!payload.sessionId || !payload.message || !payload.chat) {
      logger.warn('Payload inválido recibido desde microservicio WhatsApp', {
        hasSessionId: !!payload.sessionId,
        hasMessage: !!payload.message,
        hasChat: !!payload.chat,
        payload: payload
      });
      
      return res.status(400).json({
        success: false,
        error: 'Payload inválido: faltan campos requeridos (sessionId, message, chat)',
        messageId: payload.message?.id || null
      });
    }
    
    const { sessionId, serviceVersion, timestamp, capturedAt, message, chat, contact, group, author, media } = payload;
    messageId = message.id;
    
    // 🔍 Validación de campos críticos
    if (!message.id || !message.from || !message.to) {
      logger.warn('Mensaje con campos críticos faltantes', {
        sessionId,
        messageId,
        hasFrom: !!message.from,
        hasTo: !!message.to
      });
      
      return res.status(400).json({
        success: false,
        error: 'Mensaje inválido: faltan campos críticos (id, from, to)',
        messageId
      });
    }
    
    // 🔍 Verificar que la sesión existe (opcional - para logs)
    const sessionExists = await Session.exists({ sessionId });
    if (!sessionExists) {
      logger.debug(`Mensaje recibido para sesión no registrada: ${sessionId}`, {
        messageId,
        from: message.from
      });
    }
    
    // 🔍 Verificar duplicados
    const existingMessage = await Message.findOne({ messageId: message.id });
    if (existingMessage) {
      logger.debug(`Mensaje duplicado ignorado: ${messageId}`, {
        sessionId,
        from: message.from
      });
      
      return res.status(200).json({
        success: true,
        messageId,
        processed: false,
        duplicate: true,
        timestamp: Date.now()
      });
    }
    
    // 📝 Preparar datos del mensaje para almacenar
    const messageData = {
      sessionId,
      messageId: message.id,
      chatId: message.from,
      from: message.from,
      fromMe: message.fromMe || false,
      to: message.to,
      body: message.body || '',
      timestamp: message.timestamp || capturedAt || timestamp,
      type: message.type || 'text',
      hasMedia: message.hasMedia || false,
      isForwarded: message.isForwarded || false,
      isStatus: message.isStatus || false,
      isGroupMessage: chat.isGroup || false,
      deviceType: message.deviceType || null,
      
      // 📊 Campos específicos para grupos
      groupName: chat.isGroup ? chat.name : null,
      author: chat.isGroup ? author?.id : null,
      authorName: chat.isGroup ? author?.name : null,
      
      // 📱 Nombre del contacto
      contactName: !chat.isGroup ? (contact?.savedName || contact?.name || contact?.pushname) : null,
      
      // 🎵 Datos de media SIMPLIFICADOS (solo metadata)
      media: message.hasMedia && media ? {
        type: media.type,
        mimetype: media.mimeType,
        filename: media.filename,
        filesize: media.filesize,
        duration: media.duration || null,
        width: media.width || null,
        height: media.height || null,
        isViewOnce: media.isViewOnce || false
      } : undefined,
      
      // 🗃️ Metadatos del microservicio
      metadata: {
        serviceVersion,
        capturedAt,
        processedAt: timestamp,
        receivedAt: Date.now(),
        deviceType: message.deviceType,
        chatInfo: {
          isGroup: chat.isGroup,
          chatName: chat.name
        }
      }
    };
    
    // 💾 Almacenar mensaje en base de datos
    const savedMessage = await Message.create(messageData);
    
    // 👥 Procesar y actualizar información de contacto/grupo en background
    setImmediate(async () => {
      try {
        await processContactInfo(sessionId, chat, contact, group, author);
      } catch (contactError) {
        logger.error('Error al procesar información de contacto (no crítico):', {
          errorMessage: contactError.message,
          sessionId,
          messageId,
          chatId: message.from
        });
      }
    });
    
    // ⏱️ Log de performance
    const processingTime = Date.now() - startTime;
    
    logger.info('Mensaje WhatsApp procesado exitosamente', {
      sessionId,
      messageId,
      chatId: message.from,
      type: message.type,
      hasMedia: message.hasMedia,
      isGroup: chat.isGroup,
      processingTime: `${processingTime}ms`,
      bodyLength: message.body?.length || 0
    });
    
    // ✅ Respuesta de éxito
    res.status(200).json({
      success: true,
      messageId,
      processed: true,
      timestamp: Date.now()
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Error al procesar mensaje de WhatsApp:', {
      errorMessage: error.message,
      stack: error.stack,
      sessionId: req.body?.sessionId,
      messageId,
      processingTime: `${processingTime}ms`
    });
    
    // 🚨 Respuesta de error
    res.status(500).json({
      success: false,
      error: 'Error interno al procesar mensaje',
      messageId
    });
  }
};

/**
 * 👥 Función auxiliar para procesar información de contactos/grupos
 * Se ejecuta en background para no bloquear la respuesta HTTP
 */
async function processContactInfo(sessionId, chat, contact, group, author) {
  const contactUpdates = [];
  
  try {
    // 👤 Procesar contacto individual (mensajes privados)
    if (!chat.isGroup && contact) {
      contactUpdates.push({
        updateOne: {
          filter: { 
            sessionId, 
            contactId: contact.id 
          },
          update: {
            $set: {
              sessionId,
              contactId: contact.id,
              phoneNumber: contact.number,
              name: contact.name,
              pushname: contact.pushname,
              savedName: contact.savedName,
              isGroup: false,
              isMyContact: contact.isMyContact || false,
              avatarUrl: contact.profilePictureUrl,
              lastInteraction: new Date(),
              // Mantener metadata adicional
              metadata: {
                deviceType: contact.deviceType,
                lastUpdated: new Date()
              }
            }
          },
          upsert: true
        }
      });
    }
    
    // 👥 Procesar información de grupo
    if (chat.isGroup && group) {
      contactUpdates.push({
        updateOne: {
          filter: { 
            sessionId, 
            contactId: group.id 
          },
          update: {
            $set: {
              sessionId,
              contactId: group.id,
              name: group.name,
              isGroup: true,
              avatarUrl: group.profilePictureUrl,
              lastInteraction: new Date(),
              // Metadata específica de grupos
              groupMetadata: {
                participantsCount: group.participantsCount,
                lastUpdated: new Date()
              }
            }
          },
          upsert: true
        }
      });
      
      // 👤 También procesar autor del mensaje en grupo
      if (author) {
        contactUpdates.push({
          updateOne: {
            filter: { 
              sessionId, 
              contactId: author.id 
            },
            update: {
              $set: {
                sessionId,
                contactId: author.id,
                phoneNumber: author.number,
                name: author.name,
                pushname: author.pushname,
                savedName: author.savedName,
                isGroup: false,
                lastInteraction: new Date()
              }
            },
            upsert: true
          }
        });
      }
    }
    
    // 💾 Ejecutar actualizaciones en lote si hay contactos que procesar
    if (contactUpdates.length > 0) {
      await Contact.bulkWrite(contactUpdates, { ordered: false });
      
      logger.debug('Información de contactos actualizada', {
        sessionId,
        updatedContacts: contactUpdates.length,
        isGroup: chat.isGroup
      });
    }
    
  } catch (error) {
    logger.error('Error en procesamiento de contactos:', {
      errorMessage: error.message,
      sessionId,
      chatIsGroup: chat.isGroup
    });
    // No re-lanzar el error para no afectar el procesamiento principal
  }
}

module.exports = exports;