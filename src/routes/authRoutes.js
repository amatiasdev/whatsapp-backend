// src/routes/authRoutes.js
const express = require('express');
const {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  updatePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  setupTwoFactor,
  verifyAndEnableTwoFactor,
  disableTwoFactor
} = require('../controllers/authController');
const { protect, requireEmailVerification } = require('../middleware/auth');

const router = express.Router();

// Rutas públicas
router.post('/register', register);
router.post('/login', login);
router.get('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);
router.get('/verify-email/:token', verifyEmail);

// Rutas protegidas (requieren autenticación)
router.get('/me', protect, getMe);
router.put('/update-profile', protect, requireEmailVerification, updateProfile);
router.put('/update-password', protect, requireEmailVerification, updatePassword);

// Rutas para autenticación de dos factores
router.get('/setup-2fa', protect, requireEmailVerification, setupTwoFactor);
router.post('/verify-2fa', protect, requireEmailVerification, verifyAndEnableTwoFactor);
router.post('/disable-2fa', protect, requireEmailVerification, disableTwoFactor);

module.exports = router;