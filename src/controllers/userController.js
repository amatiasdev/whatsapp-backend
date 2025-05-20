const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

// Obtener todos los usuarios
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -__v')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    logger.error(`Error al obtener usuarios: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuarios'
    });
  }
};

// Obtener un usuario por ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -__v');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error(`Error al obtener usuario: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener el usuario'
    });
  }
};

// Crear un nuevo usuario
exports.createUser = async (req, res) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { name, email, password, role } = req.body;
    
    // Verificar si el email ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'El email ya está registrado'
      });
    }
    
    // Crear usuario
    const user = await User.create({
      name,
      email,
      password,
      role: role || 'user'
    });
    
    // Generar token JWT
    const token = user.generateAuthToken();
    
    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (error) {
    logger.error(`Error al crear usuario: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al crear el usuario'
    });
  }
};

// Actualizar usuario
exports.updateUser = async (req, res) => {
  try {
    const { name, email, role, isActive } = req.body;
    
    // Encontrar el usuario
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    
    // Verificar si se está intentando actualizar el email a uno ya existente
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'El email ya está registrado por otro usuario'
        });
      }
    }
    
    // Actualizar campos
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    
    // Guardar cambios
    await user.save();
    
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    logger.error(`Error al actualizar usuario: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar el usuario'
    });
  }
};

// Cambiar contraseña
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validar campos requeridos
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere la contraseña actual y la nueva'
      });
    }
    
    // Encontrar usuario con contraseña
    const user = await User.findById(req.params.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    
    // Verificar contraseña actual
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Contraseña actual incorrecta'
      });
    }
    
    // Establecer nueva contraseña
    user.password = newPassword;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    });
  } catch (error) {
    logger.error(`Error al cambiar contraseña: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar la contraseña'
    });
  }
};

// Eliminar usuario
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Usuario eliminado correctamente'
    });
  } catch (error) {
    logger.error(`Error al eliminar usuario: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar el usuario'
    });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Por favor proporcione email y contraseña'
      });
    }
    
    // Verificar si existe el usuario
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }
    
    // Verificar si la cuenta está activa
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Su cuenta está desactivada. Contacte al administrador'
      });
    }
    
    // Verificar contraseña
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }
    
    // Actualizar último login
    user.lastLogin = Date.now();
    await user.save();
    
    // Generar token JWT
    const token = user.generateAuthToken();
    
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (error) {
    logger.error(`Error en login: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error en el proceso de autenticación'
    });
  }
};

// Obtener perfil del usuario autenticado
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -__v');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error(`Error al obtener perfil: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener el perfil'
    });
  }
};

// Actualizar perfil del usuario autenticado
exports.updateMyProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    
    // Encontrar el usuario
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    
    // Verificar si se está intentando actualizar el email a uno ya existente
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'El email ya está registrado por otro usuario'
        });
      }
    }
    
    // Actualizar campos
    if (name) user.name = name;
    if (email) user.email = email;
    
    // Guardar cambios
    await user.save();
    
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    logger.error(`Error al actualizar perfil: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar el perfil'
    });
  }
};

// Cambiar mi contraseña (usuario autenticado)
exports.changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validar campos requeridos
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere la contraseña actual y la nueva'
      });
    }
    
    // Encontrar usuario con contraseña
    const user = await User.findById(req.user.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    
    // Verificar contraseña actual
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Contraseña actual incorrecta'
      });
    }
    
    // Establecer nueva contraseña
    user.password = newPassword;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    });
  } catch (error) {
    logger.error(`Error al cambiar contraseña: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar la contraseña'
    });
  }
};

module.exports = exports;