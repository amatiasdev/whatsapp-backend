
/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único generado por MongoDB
 *         name:
 *           type: string
 *           description: Nombre completo del usuario
 *         email:
 *           type: string
 *           description: Dirección de correo electrónico (única)
 *         role:
 *           type: string
 *           enum: [user, admin]
 *           description: Rol del usuario
 *         isActive:
 *           type: boolean
 *           description: Estado de la cuenta
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 *     
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           format: password
 *     
 *     LoginResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             name:
 *               type: string
 *             email:
 *               type: string
 *             role:
 *               type: string
 *         token:
 *           type: string
 *           description: JWT token para autenticación
 *
 * /users/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Credenciales inválidas
 *       500:
 *         description: Error del servidor
 *
 * /users/me:
 *   get:
 *     summary: Obtener perfil propio
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del perfil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */

const express = require('express');
const router = express.Router();
const { 
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  login,
  getMyProfile,
  updateMyProfile,
  changeMyPassword
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const { body } = require('express-validator');

// Rutas públicas
router.post(
  '/login', 
  [
    body('email').isEmail().withMessage('Por favor ingrese un email válido'),
    body('password').notEmpty().withMessage('La contraseña es requerida')
  ],
  login
);

// Rutas protegidas para el usuario autenticado
router.use(protect);

// Rutas para el perfil del usuario actual
router.get('/me', getMyProfile);
router.put('/me', updateMyProfile);
router.put('/me/password', changeMyPassword);

// Rutas admin (requieren rol de administrador)
router.use(authorize('admin'));

router.route('/')
  .get(getAllUsers)
  .post(
    [
      body('name').notEmpty().withMessage('El nombre es requerido'),
      body('email').isEmail().withMessage('Por favor ingrese un email válido'),
      body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
    ],
    createUser
  );

router.route('/:id')
  .get(getUserById)
  .put(updateUser)
  .delete(deleteUser);

router.put('/:id/password', changePassword);

module.exports = router;
