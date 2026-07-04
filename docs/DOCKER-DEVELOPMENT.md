# Desarrollo con Docker

Este documento describe cómo usar Docker y Docker Compose para el desarrollo de la aplicación.

## Requisitos

- Docker Desktop instalado y corriendo
- Docker Compose (viene incluido con Docker Desktop)
- Git

## Estructura

```
Proyecto-Tienda/
├── docker-compose.yml          # Configuración principal
├── docker-compose.local.yml    # Overrides para desarrollo local
├── .env.docker                 # Variables de entorno de ejemplo
├── .dockerignore               # Archivos ignorados en las builds
├── erp-tienda-backend/
│   └── Dockerfile              # Imagen del backend (NestJS)
├── erp-tienda-frontend/
│   └── Dockerfile              # Imagen del frontend (Next.js)
└── scripts/
    └── docker-dev.sh           # Script helper para desarrollo
```

## Inicio Rápido

### 1. Primera vez - Construir e iniciar

```bash
# Construir las imágenes
docker-compose build

# Iniciar los servicios
docker-compose up
```

O simplemente:

```bash
./scripts/docker-dev.sh start
```

### 2. Acceder a la aplicación

- **Frontend**: http://localhost:3001
- **Backend**: http://localhost:3000
- **Swagger (API)**: http://localhost:3000/api
- **PostgreSQL**: localhost:5432 (usuario: postgres, password: postgres)

### 3. Detener

```bash
docker-compose down
```

O:

```bash
./scripts/docker-dev.sh stop
```

## Workflow de Desarrollo

### Trabajar con el código

El setup está configurado con **hot-reload**:

- **Backend**: Los cambios en `src/` se reflejan automáticamente (gracias a `npm run start:dev`)
- **Frontend**: Los cambios en `app/`, `components/`, etc. se reflejan automáticamente

Simplemente edita los archivos en tu editor habitual, y los cambios aparecerán en el contenedor automáticamente.

### Ver logs

```bash
# Ver todos los logs
./scripts/docker-dev.sh logs

# Ver logs del backend
./scripts/docker-dev.sh logs-backend

# Ver logs del frontend
./scripts/docker-dev.sh logs-frontend

# Ver logs de PostgreSQL
./scripts/docker-dev.sh logs-db
```

### Ejecutar comandos en los contenedores

```bash
# Shell en el backend
./scripts/docker-dev.sh shell-backend

# Shell en el frontend
./scripts/docker-dev.sh shell-frontend

# Conectar a PostgreSQL
./scripts/docker-dev.sh shell-db
```

Ejemplo dentro del contenedor:

```bash
# Ver estado del servidor
curl http://localhost:3000/api

# Instalar un paquete nuevo (si es necesario)
npm install nuevo-paquete
```

## Servicios

### PostgreSQL

- **Puerto**: 5432
- **Usuario**: postgres
- **Contraseña**: postgres
- **Base de datos**: erp_tienda_dev
- **Volumen**: `erp_tienda_pg_data` (persiste los datos entre reinicios)

Los datos de la BD se guardan en un volumen de Docker, así que la información persiste incluso si paras los contenedores.

### Backend (NestJS)

- **Puerto**: 3000
- **Modo**: Desarrollo (con watch)
- **Variables de entorno**: Configuradas automáticamente en `docker-compose.yml`

Al iniciar, el backend automáticamente:
1. Ejecuta las migraciones de Prisma
2. Inicia el servidor en modo watch
3. Expone Swagger en http://localhost:3000/api

### Frontend (Next.js)

- **Puerto**: 3001
- **Modo**: Desarrollo (con hot-reload)

Se conecta al backend a través de `NEXT_PUBLIC_API_URL=http://localhost:3000`

## Gestión de volúmenes y datos

### Ver volúmenes

```bash
docker volume ls | grep tienda
```

### Limpiar todo (¡cuidado!)

```bash
# Detiene contenedores y elimina volúmenes (BORRA LOS DATOS DE LA BD)
docker-compose down -v

# O usa el script helper
./scripts/docker-dev.sh clean
```

### Backup de la BD

```bash
docker-compose exec postgres pg_dump -U postgres -d erp_tienda_dev > backup.sql
```

### Restaurar una BD desde backup

```bash
docker-compose exec -T postgres psql -U postgres -d erp_tienda_dev < backup.sql
```

## Troubleshooting

### El backend no se conecta a la BD

Asegúrate de que PostgreSQL está healthy:

```bash
docker-compose ps
```

Si `postgres` no muestra `healthy`, espera un momento y verifica de nuevo. El healthcheck puede tardar.

### Puerto ya en uso

Si ves error "port is already allocated":

```bash
# Ver qué está usando el puerto
lsof -i :3000  # Backend
lsof -i :3001  # Frontend
lsof -i :5432  # PostgreSQL

# Matar el proceso
kill -9 <PID>
```

### Reconstruir imágenes

```bash
# Forzar reconstrucción sin caché
docker-compose build --no-cache

# Luego iniciar
docker-compose up
```

### Logs vacíos o no se ven los cambios

Intenta:

```bash
# Detener todo
docker-compose down

# Limpiar volúmenes (¡borrará datos!)
docker volume prune

# Reconstruir
docker-compose build --no-cache

# Iniciar de nuevo
docker-compose up
```

### Ver estado completo

```bash
./scripts/docker-dev.sh ps
```

## Variables de Entorno

El archivo `docker-compose.yml` configura automáticamente las variables necesarias:

**Backend**:
- `DATABASE_URL`: Conexión a PostgreSQL
- `JWT_SECRET`: Secreto JWT (cambiar en producción)
- `CORS_ORIGINS`: http://localhost:3001
- `NODE_ENV`: development
- `ENABLE_SWAGGER`: true

**Frontend**:
- `NEXT_PUBLIC_API_URL`: http://localhost:3000

Puedes sobrescribir estos valores en `.env`:

```bash
# En la raíz del proyecto, crear o editar .env
JWT_SECRET=tu-secreto-aqui
INITIAL_ADMIN_PASSWORD=TuContraseña123!
```

## Testing

```bash
# Ejecutar tests del backend
./scripts/docker-dev.sh test-backend

# Desde dentro del contenedor
docker-compose exec backend npm test
docker-compose exec backend npm run test:e2e
```

## Comparación: Local vs Docker

| Aspecto | Local | Docker |
|---------|-------|--------|
| Dependencias | Instaladas en tu máquina | En contenedores, aisladas |
| Node.js | Versión global | node:22-alpine fija |
| PostgreSQL | Instalada localmente | Contenedor PostgreSQL |
| Hot-reload | Funciona según tu setup | Garantizado con volumes |
| Portabilidad | Puede variar | Consistente en cualquier máquina |
| Performance | Más rápido (sin virtualización) | Ligero overhead |

## Próximos Pasos

- Leer [DATABASE-MIGRATIONS.md](./DATABASE-MIGRATIONS.md) para entender migraciones
- Configurar en `docker-compose.yml` si necesitas agregar más servicios
- Para producción, consultar [DEPLOYMENT.md](./DEPLOYMENT.md)

## Comandos Útiles Rápidos

```bash
# Iniciar
./scripts/docker-dev.sh start

# Ver logs en tiempo real
./scripts/docker-dev.sh logs-backend

# Reiniciar
./scripts/docker-dev.sh restart

# Detener
./scripts/docker-dev.sh stop

# Limpiar todo
./scripts/docker-dev.sh clean

# Shell del backend para debugging
./scripts/docker-dev.sh shell-backend
```
