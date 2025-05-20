// src/utils/sendEmail.js
const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('./logger');

const sendEmail = async (options) => {
  // Crear transporter
  const transporter = nodemailer.createTransport({
    host: config.emailHost,
    port: config.emailPort,
    secure: config.emailPort === 465, // true para 465, false para otros puertos
    auth: {
      user: config.emailUsername,
      pass: config.emailPassword
    }
  });

  // Opciones del mensaje
  const message = {
    from: `${config.fromName} <${config.fromEmail}>`,
    to: options.to,
    subject: options.subject,
    html: options.html
  };

  // Enviar email
  const info = await transporter.sendMail(message);
  
  logger.info(`Email enviado: ${info.messageId}`);
};

module.exports = sendEmail;