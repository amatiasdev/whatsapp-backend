#!/usr/bin/env node

/**
 * Script para crear un usuario administrador inicial
 * 
 * Uso:
 * node scripts/create-admin.js
 * 
 * O con parámetros:
 * node scripts/create-admin.js --name "Admin User" --email "admin@example.com" --password "securepassword123"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const { program } = require('commander');

// Definir opciones de línea de comandos
program
  .option('-n, --name <name>', 'Nombre del administrador')
  .option('-e, --email <email>', 'Correo electrónico')
  .option('-p, --password <password>', 'Contraseña')
  .parse(process.argv);

const options = program.opts();

// Interfaz para entrada de usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Función para preguntar al usuario
const prompt = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

// Importar configuración y modelo de usuario
// Asegurar que las rutas sean correctas según tu estructura de proyecto
const config = require('../config');
const User = require('../models/User');

// Función principal
async function createAdmin() {
  try {
    // Conectar a MongoDB
    console.log('Conectando a MongoDB...');
    await mongoose.connect(config.mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Conectado a MongoDB');
    
    // Obtener o solicitar datos del administrador
    const name = options.name || await prompt('Nombre del administrador: ');
    const email = options.email || await prompt('Correo electrónico: ');
    let password = options.password;
    
    if (!password) {
      password = await prompt('Contraseña: ');
    }
    
    // Validar datos
    if (!name || !email || !password) {
      console.error('Error: Todos los campos son requeridos.');
      process.exit(1);
    }
    
    // Verificar si ya existe un usuario con ese email
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      console.log(`\nYa existe un usuario con el email ${email}`);
      
      const updateExisting = await prompt('¿Desea actualizar este usuario a administrador? (s/n): ');
      
      if (updateExisting.toLowerCase() === 's') {
        existingUser.role = 'admin';
        await existingUser.save();
        console.log(`\nUsuario ${email} actualizado a administrador`);
      } else {
        console.log('\nOperación cancelada');
      }
    } else {
      // Crear nuevo usuario administrador
      await User.create({
        name,
        email,
        password,
        role: 'admin'
      });
      
      console.log(`\nUsuario administrador creado con éxito:`);
      console.log(`- Nombre: ${name}`);
      console.log(`- Email: ${email}`);
      console.log('- Rol: admin');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Cerrar conexión a MongoDB y readline
    mongoose.connection.close();
    rl.close();
  }
}

// Ejecutar función principal
createAdmin();