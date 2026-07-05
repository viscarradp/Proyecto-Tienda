# 🐳 Docker Development - Guía Rápida

**Quieres tener tu sistema funcionando en 2 minutos? Aquí va:**

## Opción 1: Usando el script helper (Recomendado)

```bash
# En la raíz del proyecto, ejecuta:
./scripts/docker-dev.sh start
```

¡Eso es! Ahora accede a:
- 🌐 **Frontend**: http://localhost:3001
- 🔌 **Backend API**: http://localhost:3000
- 📚 **Swagger Docs**: http://localhost:3000/api

## Opción 2: Comandos manuales

```bash
# Construir imágenes (primera vez)
docker-compose build

# Iniciar servicios
docker-compose up

# En otra terminal, ver logs
docker-compose logs -f
```

## ✅ Verificar que todo funciona

Una vez que levantaste los servicios:

1. Abre http://localhost:3001 - deberías ver el frontend
2. Abre http://localhost:3000/api - deberías ver Swagger UI
3. Los logs mostrarán si todo se levantó correctamente

## 📝 Editar código y ver cambios en vivo

- **Backend** (`erp-tienda-backend/src/**`): Hot-reload automático
- **Frontend** (`erp-tienda-frontend/app/**`, `components/**`): Hot-reload automático

Simplemente edita en tu editor y los cambios aparecen en el navegador/servidor automáticamente.

## 🛑 Detener

```bash
# Opción 1: Script helper
./scripts/docker-dev.sh stop

# Opción 2: Manual
docker-compose down
```

## 📊 Ver estado / Logs

```bash
# Estado de contenedores
./scripts/docker-dev.sh ps

# Ver logs del backend
./scripts/docker-dev.sh logs-backend

# Ver logs del frontend
./scripts/docker-dev.sh logs-frontend

# Ver logs de todos
./scripts/docker-dev.sh logs
```

## 🐚 Necesitas ejecutar comandos en los contenedores?

```bash
# Shell en el backend
./scripts/docker-dev.sh shell-backend

# Shell en el frontend
./scripts/docker-dev.sh shell-frontend

# Conectar a PostgreSQL
./scripts/docker-dev.sh shell-db
```

## 🧹 Limpiar todo (¡borra datos!)

```bash
# Elimina contenedores y volúmenes (CUIDADO: borra datos de la BD)
./scripts/docker-dev.sh clean

# Manual
docker-compose down -v
```

## 🐛 Problemas comunes

### El backend no arranca
- Espera a que PostgreSQL esté "healthy" (puede tardar 5-10s)
- Ver logs: `./scripts/docker-dev.sh logs-backend`

### Puerto ya en uso
```bash
# Ver qué está usando el puerto 3000
lsof -i :3000
# Matar el proceso: kill -9 <PID>
```

### Los cambios en código no se ven
- Asegúrate de estar editando los archivos correctos en tu máquina
- Los volumes están montados en `docker-compose.yml`
- Recarga la página del navegador (no es automático)

### Reconstruir todo de cero
```bash
./scripts/docker-dev.sh clean
docker-compose build --no-cache
./scripts/docker-dev.sh start
```

## 📚 Documentación completa

Ver [docs/operations/docker-development.md](docs/operations/docker-development.md) para:
- Setup detallado
- Todas las variables de entorno
- Cómo hacer backup de la BD
- Troubleshooting avanzado

## 🚀 Listo para empezar?

```bash
./scripts/docker-dev.sh start
```

Luego abre http://localhost:3001 y ¡a desarrollar!
