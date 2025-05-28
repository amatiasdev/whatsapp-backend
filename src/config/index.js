// src/config/index.js - CONFIGURACIÓN EXTENDIDA
require('dotenv').config();

module.exports = {
  // Servidor
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  
  // Base de datos
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_api',
  
  // Servicio de WhatsApp
  whatsappServiceUrl: process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'default_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtCookieExpire: parseInt(process.env.JWT_COOKIE_EXPIRE || '7', 10), // días
  
  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Polling
  qrPollInterval: parseInt(process.env.QR_POLL_INTERVAL || '2000', 10), // Intervalo para sondear códigos QR en ms
  
  // WebSockets
  socketOptions: {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:8080',
      methods: ["GET", "POST"],
      credentials: true
    }
  },
  
  // Email (para verificación de email y reseteo de contraseña)
  emailHost: process.env.EMAIL_HOST || 'smtp.gmail.com',
  emailPort: parseInt(process.env.EMAIL_PORT || '587', 10),
  emailUsername: process.env.EMAIL_USERNAME,
  emailPassword: process.env.EMAIL_PASSWORD,
  fromEmail: process.env.FROM_EMAIL || 'noreply@whatsappapi.com',
  fromName: process.env.FROM_NAME || 'WhatsApp API',

  // Nombre de la aplicación
  appName: process.env.APP_NAME || 'WhatsApp API',
  
  // Seguridad
  passwordResetExpire: parseInt(process.env.PASSWORD_RESET_EXPIRE || '60', 10) * 60 * 1000, // 60 minutos en ms
  emailVerificationExpire: parseInt(process.env.EMAIL_VERIFICATION_EXPIRE || '24', 10) * 60 * 60 * 1000, // 24 horas en ms
  
  // Límites de peticiones (para prevenir ataques de fuerza bruta)
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15', 10) * 60 * 1000, // 15 minutos en ms
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10) // límite de 100 peticiones por ventana
  },
  
  // Limpieza de sesiones
  sessionCleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL || '12', 10) * 60, // 12 horas en minutos
  sessionInactiveTime: parseInt(process.env.SESSION_INACTIVE_TIME || '48', 10) * 60 * 60 * 1000, // 48 horas en ms
  
  // ========================================
  // NUEVAS CONFIGURACIONES PARA GESTIÓN AVANZADA
  // ========================================
  
  // Gestión de sesiones
  sessions: {
    // Máximo número de sesiones activas por usuario
    maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER || '3', 10),
    
    // Horas que una sesión se considera válida para reconexión
    validityHours: parseInt(process.env.SESSION_VALIDITY_HOURS || '24', 10),
    
    // Días de retención para sesiones eliminadas (soft delete)
    softDeleteRetentionDays: parseInt(process.env.SOFT_DELETE_RETENTION_DAYS || '30', 10),
    
    // Intervalo de limpieza automática de sesiones (en horas)
    autoCleanupInterval: parseInt(process.env.AUTO_CLEANUP_INTERVAL || '6', 10),
    
    // Tiempo máximo para que una sesión permanezca en estado 'initializing' (en minutos)
    initializingTimeout: parseInt(process.env.INITIALIZING_TIMEOUT || '10', 10),
    
    // Tiempo máximo para que un QR se considere válido (en minutos)
    qrValidityTimeout: parseInt(process.env.QR_VALIDITY_TIMEOUT || '5', 10),
    
    // Número máximo de intentos de reconexión automática
    maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '3', 10),
    
    // Intervalo entre intentos de reconexión (en segundos)
    reconnectInterval: parseInt(process.env.RECONNECT_INTERVAL || '30', 10),
    
    // Habilitar limpieza automática de sesiones huérfanas
    enableAutoCleanup: process.env.ENABLE_AUTO_CLEANUP === 'true',
    
    // Habilitar validación estricta de pertenencia de sesiones
    strictOwnershipValidation: process.env.STRICT_OWNERSHIP_VALIDATION !== 'false'
  },
  
  // Rate limiting específico para sesiones
  sessionRateLimit: {
    // Máximo de requests por minuto para operaciones de sesión
    maxRequestsPerMinute: parseInt(process.env.SESSION_MAX_REQUESTS_PER_MINUTE || '20', 10),
    
    // Ventana de tiempo para rate limiting (en ms)
    windowMs: parseInt(process.env.SESSION_RATE_LIMIT_WINDOW || '60000', 10),
    
    // Máximo de sesiones que se pueden crear por hora
    maxSessionCreationsPerHour: parseInt(process.env.MAX_SESSION_CREATIONS_PER_HOUR || '5', 10),
    
    // Máximo de operaciones de limpieza por día
    maxCleanupOperationsPerDay: parseInt(process.env.MAX_CLEANUP_OPERATIONS_PER_DAY || '10', 10)
  },
  
  // Configuración de paginación
  pagination: {
    // Límite por defecto para consultas paginadas
    defaultLimit: parseInt(process.env.DEFAULT_PAGE_LIMIT || '10', 10),
    
    // Límite máximo permitido por página
    maxLimit: parseInt(process.env.MAX_PAGE_LIMIT || '50', 10),
    
    // Habilitar paginación por defecto en todas las consultas
    enableByDefault: process.env.ENABLE_PAGINATION_BY_DEFAULT !== 'false'
  },
  
  // Configuración de monitoreo y logs
  monitoring: {
    // Habilitar logs detallados de sesiones
    enableDetailedSessionLogs: process.env.ENABLE_DETAILED_SESSION_LOGS === 'true',
    
    // Nivel de log para operaciones de sesión
    sessionLogLevel: process.env.SESSION_LOG_LEVEL || 'info',
    
    // Retener logs de sesión por X días
    sessionLogRetentionDays: parseInt(process.env.SESSION_LOG_RETENTION_DAYS || '7', 10),
    
    // Habilitar métricas de rendimiento
    enablePerformanceMetrics: process.env.ENABLE_PERFORMANCE_METRICS === 'true',
    
    // Intervalo para reporte de estadísticas (en minutos)
    statsReportInterval: parseInt(process.env.STATS_REPORT_INTERVAL || '60', 10)
  },
  
  // Configuración de caché
  cache: {
    // TTL por defecto para caché de estado de sesiones (en segundos)
    sessionStatusTTL: parseInt(process.env.SESSION_STATUS_CACHE_TTL || '300', 10),
    
    // TTL para caché de validación de pertenencia (en segundos)
    ownershipValidationTTL: parseInt(process.env.OWNERSHIP_VALIDATION_TTL || '600', 10),
    
    // Tamaño máximo del caché en memoria
    maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE || '1000', 10),
    
    // Habilitar caché de consultas frecuentes
    enableQueryCache: process.env.ENABLE_QUERY_CACHE !== 'false'
  },
  
  // Configuración de seguridad avanzada
  security: {
    // Habilitar encriptación de datos sensibles en logs
    encryptSensitiveData: process.env.ENCRYPT_SENSITIVE_DATA === 'true',
    
    // Clave de encriptación para datos sensibles
    encryptionKey: process.env.DATA_ENCRYPTION_KEY || 'default_encryption_key_change_in_production',
    
    // Habilitar auditoría de acciones críticas
    enableAuditLog: process.env.ENABLE_AUDIT_LOG === 'true',
    
    // Tiempo de expiración para tokens de acceso a sesión (en minutos)
    sessionTokenExpiry: parseInt(process.env.SESSION_TOKEN_EXPIRY || '60', 10),
    
    // Habilitar validación de IP para operaciones críticas
    enableIPValidation: process.env.ENABLE_IP_VALIDATION === 'true',
    
    // Lista de IPs permitidas (separadas por coma)
    allowedIPs: process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : []
  },
  
  // Configuración de notificaciones
  notifications: {
    // Habilitar notificaciones por email para eventos críticos
    enableEmailNotifications: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true',
    
    // Email del administrador para notificaciones críticas
    adminEmail: process.env.ADMIN_EMAIL,
    
    // Habilitar notificaciones push para cambios de estado de sesión
    enablePushNotifications: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
    
    // URL del servicio de notificaciones push
    pushNotificationService: process.env.PUSH_NOTIFICATION_SERVICE_URL,
    
    // Habilitar webhooks para eventos importantes
    enableWebhooks: process.env.ENABLE_WEBHOOKS === 'true',
    
    // URLs de webhooks (separadas por coma)
    webhookUrls: process.env.WEBHOOK_URLS ? process.env.WEBHOOK_URLS.split(',').map(url => url.trim()) : []
  },
  
  // Configuración de respaldo y recuperación
  backup: {
    // Habilitar respaldo automático de sesiones críticas
    enableAutoBackup: process.env.ENABLE_AUTO_BACKUP === 'true',
    
    // Intervalo de respaldo automático (en horas)
    backupInterval: parseInt(process.env.BACKUP_INTERVAL || '24', 10),
    
    // Directorio para almacenar respaldos
    backupDirectory: process.env.BACKUP_DIRECTORY || './backups',
    
    // Número máximo de respaldos a mantener
    maxBackupFiles: parseInt(process.env.MAX_BACKUP_FILES || '7', 10),
    
    // Habilitar compresión de respaldos
    enableCompression: process.env.ENABLE_BACKUP_COMPRESSION !== 'false'
  }
};