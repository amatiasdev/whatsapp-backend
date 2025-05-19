# Backend de API de WhatsApp - Resumen y Guía de Implementación

## Componentes Implementados

### Estructura del Proyecto
- Arquitectura MVC (Modelo-Vista-Controlador)
- Separación de responsabilidades clara
- Configuración centralizada

### Funcionalidades Principales
- Gestión de sesiones de WhatsApp
- Procesamiento y almacenamiento de mensajes
- Sistema de usuarios con autenticación JWT
- Comunicación en tiempo real mediante WebSockets
- Integración con servicio externo de WhatsApp

### Características Técnicas
- API RESTful
- Autenticación y autorización
- Manejo de errores centralizado
- Logging estructurado
- Base de datos MongoDB
- Comunicación en tiempo real con Socket.io

## Configuración y Puesta en Marcha

### Requisitos Previos
- Node.js 16.x o superior
- MongoDB instalado y en ejecución
- Servicio de WhatsApp ejecutándose (en otro puerto)

### Instalación

1. Clonar el repositorio:
   ```bash
   git clone <tu-repositorio> whatsapp-api-backend
   cd whatsapp-api-backend
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno:
   - Copia el archivo `.env.example` a `.env`
   - Edita las variables según tu entorno:
     ```
     PORT=3000
     NODE_ENV=development
     MONGODB_URI=mongodb://localhost:27017/whatsapp_api
     WHATSAPP_SERVICE_URL=http://localhost:3001
     JWT_SECRET=tu_clave_secreta
     FRONTEND_URL=http://localhost:8080
     ```

4. Crear un usuario administrador inicial:
   ```bash
   node scripts/create-admin.js
   ```

5. Iniciar el servidor:
   ```bash
   # Modo desarrollo
   npm run dev
   
   # Modo producción
   npm start
   ```

## Integración con el Servicio de WhatsApp

Este backend está diseñado para comunicarse con un servicio de WhatsApp separado que maneja las conexiones con la API de WhatsApp Web. Asegúrate de que el servicio de WhatsApp esté configurado correctamente:

1. El servicio de WhatsApp debe estar accesible en la URL configurada en `WHATSAPP_SERVICE_URL`
2. El servicio debe exponer los endpoints requeridos (inicialización, envío de mensajes, etc.)
3. Debe soportar el formato de webhook para notificar sobre nuevos mensajes

## Estructura de la API

### Rutas Principales

#### Autenticación
- `POST /api/v1/users/login` - Iniciar sesión

#### Usuarios (admin)
- `GET /api/v1/users` - Listar usuarios
- `POST /api/v1/users` - Crear usuario
- `GET /api/v1/users/:id` - Obtener usuario por ID
- `PUT /api/v1/users/:id` - Actualizar usuario
- `DELETE /api/v1/users/:id` - Eliminar usuario
- `PUT /api/v1/users/:id/password` - Cambiar contraseña (admin)

#### Perfil de Usuario
- `GET /api/v1/users/me` - Obtener perfil propio
- `PUT /api/v1/users/me` - Actualizar perfil propio
- `PUT /api/v1/users/me/password` - Cambiar contraseña propia

#### Sesiones de WhatsApp
- `GET /api/v1/sessions` - Listar sesiones
- `POST /api/v1/sessions` - Crear sesión
- `GET /api/v1/sessions/:sessionId` - Obtener sesión por ID
- `PUT /api/v1/sessions/:sessionId` - Actualizar sesión
- `DELETE /api/v1/sessions/:sessionId` - Eliminar sesión
- `POST /api/v1/sessions/:sessionId/listen` - Iniciar escucha
- `POST /api/v1/sessions/:sessionId/stop` - Detener escucha
- `GET /api/v1/sessions/:sessionId/qr` - Obtener código QR
- `POST /api/v1/sessions/:sessionId/disconnect` - Desconectar sesión

#### Mensajes
- `POST /api/v1/messages/webhook` - Recibir mensajes (webhook)
- `GET /api/v1/messages/sessions/:sessionId/chats` - Listar chats
- `GET /api/v1/messages/sessions/:sessionId/chats/:chatId/messages` - Obtener mensajes
- `POST /api/v1/messages/sessions/:sessionId/send/message` - Enviar mensaje de texto
- `POST /api/v1/messages/sessions/:sessionId/send/:mediaType` - Enviar mensaje con media
- `POST /api/v1/messages/sessions/:sessionId/cleanup` - Eliminar mensajes antiguos

### Eventos WebSocket

#### Sesiones
- `session_info` - Información de sesión
- `session_status_update` - Actualización de estado de sesión
- `session_initialized` - Sesión inicializada
- `session_connected` - Sesión conectada
- `session_disconnected` - Sesión desconectada
- `qr_code` - Código QR generado
- `session_error` - Error en sesión

#### Mensajes
- `new_messages` - Nuevos mensajes recibidos
- `message_sent` - Mensaje enviado correctamente
- `message_error` - Error al enviar mensaje

## Desarrollo Adicional y Mejoras Futuras

### Seguridad
- Implementar rate limiting para prevenir abusos
- Añadir CSRF protection
- Configurar CORS más restrictivo
- Implementar validación de IP para el webhook

### Escalabilidad
- Añadir sistema de caché con Redis
- Implementar colas de mensajes con Bull/RabbitMQ
- Configurar balanceo de carga
- Implementar sharding de base de datos

### Funcionalidad
- Sistema de plantillas para mensajes
- Programación de envíos automáticos
- Análisis y estadísticas de mensajes
- Sistema de etiquetas para contactos
- Chatbots automatizados con IA

### Operación
- Configurar monitoreo y alertas
- Implementar backup automatizado
- Añadir más tests unitarios e integración
- Configurar CI/CD pipeline

## Integración con el Frontend

Para integrar este backend con tu frontend:

1. Configurar las llamadas API al backend desde el frontend
2. Implementar autenticación JWT en el frontend
3. Utilizar Socket.io-client para la comunicación en tiempo real
4. Desarrollar interfaces para:
   - Login y gestión de usuario
   - Gestión de sesiones de WhatsApp
   - Visualización de chats y mensajes
   - Envío de mensajes

## Recursos y Documentación

- [Documentación de API](https://github.com/tu-usuario/whatsapp-api-docs)
- [Repositorio del Servicio WhatsApp](https://github.com/tu-usuario/whatsapp-service)
- [Guía de Desarrollo](https://github.com/tu-usuario/whatsapp-api/wiki)

## Soporte y Contacto

Para soporte técnico o preguntas:
- Crear un issue en el repositorio
- Contactar al equipo de desarrollo en dev@tudominio.com