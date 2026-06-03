# PapiGo Backend

Backend API para la aplicación de ridesharing PapiGo.

## Stack Tecnológico

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Base de datos**: SQLite (archivo local)
- **Tiempo real**: Socket.io
- **Auth**: JWT

## Getting Started

### Instalación

```bash
npm install
```

### Configuración

Copia el archivo de ejemplo de variables de entorno:

```bash
cp .env.example .env
```

Edita `.env` según sea necesario:

```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=your-secret-key
```

### Ejecutar

```bash
# Desarrollo
npm run dev

# Producción
npm start
```

### Migrar base de datos

```bash
npm run db:migrate
```

## API Endpoints

### Autenticación
- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/me` - Obtener usuario actual

### Viajes
- `POST /api/trips/request` - Solicitar viaje
- `POST /api/trips/accept/:tripId` - Aceptar viaje (conductor)
- `POST /api/trips/start/:tripId` - Iniciar viaje
- `POST /api/trips/complete/:tripId` - Completar viaje
- `POST /api/trips/cancel/:tripId` - Cancelar viaje
- `GET /api/trips/pending` - Viajes pendientes (conductor)
- `GET /api/trips/history` - Historial de viajes
- `GET /api/trips/:tripId` - Detalles de viaje
- `POST /api/trips/counter-offer/:tripId` - Contra-oferta
- `POST /api/trips/accept-offer/:tripId` - Aceptar oferta
- `POST /api/trips/reject-offer/:tripId` - Rechazar oferta
- `GET /api/trips/calculate-fare` - Calcular tarifa

### Conductores
- `PATCH /api/drivers/status` - Cambiar estado online/offline
- `GET /api/drivers/profile` - Perfil del conductor
- `GET /api/drivers/rating` - Calificación del conductor
- `PATCH /api/drivers/location` - Actualizar ubicación

### Ganancias
- `GET /api/earnings` - Ganancias del conductor
- `GET /api/earnings/daily` - Ganancias diarias

### Ratings
- `POST /api/ratings` - Crear calificación
- `GET /api/ratings/:userId` - Obtener calificaciones de usuario

### Admin
- `GET /api/admin/users` - Listar usuarios
- `POST /api/admin/users/suspend` - Suspender usuario
- `POST /api/admin/users/reactivate` - Reactivar usuario
- `GET /api/admin/debts` - Deudas de conductores
- `POST /api/admin/debt/reset` - Reiniciar deuda
- `POST /api/admin/bonuses` - Crear bono
- `GET /api/admin/stats/dashboard` - Estadísticas del dashboard

## Deploy en Render

### Opción 1: Deploy Manual

1. Crear cuenta en [Render](https://render.com)
2. Crear nuevo Web Service
3. Conectar repositorio GitHub
4. Configurar:
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `Node`

5. Añadir variables de entorno:
   - `NODE_ENV=production`
   - `CORS_ORIGIN=https://tu-frontend.vercel.app` (tu URL de frontend)
   - `JWT_SECRET=` (generar valor seguro)

### Opción 2: Auto-Deploy con Blueprint

```bash
# Push a GitHub y Render detectará el render.yaml automáticamente
```

### Variables de Entorno en Render

```
NODE_ENV=production
CORS_ORIGIN=https://tu-dominio.com
JWT_SECRET=genera-un-token-seguro-con-openssl-rand-hex-64
PORT=10000
```

## Estructura del Proyecto

```
backend/
├── src/
│   ├── server.js          # Entry point
│   ├── socket.js          # Handlers de Socket.io
│   ├── routes/            # Rutas de la API
│   ├── controllers/       # Controladores
│   ├── models/           # Modelos de datos
│   ├── middleware/       # Middleware auth
│   └── database/         # Configuración BD
├── data/                  # Archivos SQLite
├── .env                   # Variables de entorno
├── .env.example           # Plantilla .env
├── render.yaml            # Config para deploy
└── package.json
```

## Base de Datos

La base de datos SQLite se crea automáticamente en `data/uber.db` la primera vez que se ejecuta el servidor.

### Tablas:
- `users` - Usuarios (pasajeros, conductores, admins)
- `driver_profiles` - Perfiles de conductores
- `trips` - Viajes
- `ratings` - Calificaciones
- `driver_locations` - Ubicaciones de conductores
- `daily_earnings` - Ganancias diarias
- `platform_debts` - Deudas con la plataforma
- `bonuses` - Bonos de pasajeros

## WebSocket Events

### Cliente → Servidor
- `join-trip` - Unirse a un viaje
- `leave-trip` - Salir de un viaje
- `join-drivers` - Unirse a sala de conductores
- `driver-location` - Actualizar ubicación del conductor
- `counter-offer` - Enviar contra-oferta
- `offer-response` - Responder a oferta
- `trip-status-update` - Actualizar estado del viaje

### Servidor → Cliente
- `driver-position` - Posición del conductor
- `negotiation-update` - Actualización de negociación
- `status-updated` - Estado del viaje actualizado
- `new-trip-request` - Nuevo viaje disponible
- `driver-cancelled` - Conductor canceló
- `trip-cancelled` - Viaje cancelado

## Licencia

MIT
