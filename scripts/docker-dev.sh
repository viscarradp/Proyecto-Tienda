#!/bin/bash

# Script helper para desarrollo con Docker
# Uso: ./scripts/docker-dev.sh [comando]

set -e

COMMAND=${1:-help}

case $COMMAND in
  start)
    echo "🚀 Iniciando sistema completo (PostgreSQL + Backend + Frontend)..."
    docker-compose up -d
    echo "✅ Sistema iniciado!"
    echo ""
    echo "📍 Accesos:"
    echo "   Frontend:  http://localhost:3001"
    echo "   Backend:   http://localhost:3000"
    echo "   Swagger:   http://localhost:3000/api"
    echo "   PostgreSQL: localhost:5432"
    echo ""
    echo "📝 Ver logs: docker-compose logs -f [backend|frontend|postgres]"
    ;;

  stop)
    echo "🛑 Deteniendo sistema..."
    docker-compose down
    echo "✅ Sistema detenido"
    ;;

  restart)
    echo "🔄 Reiniciando sistema..."
    docker-compose restart
    echo "✅ Sistema reiniciado"
    ;;

  logs)
    echo "📋 Mostrando logs..."
    docker-compose logs -f
    ;;

  logs-backend)
    echo "📋 Logs del backend..."
    docker-compose logs -f backend
    ;;

  logs-frontend)
    echo "📋 Logs del frontend..."
    docker-compose logs -f frontend
    ;;

  logs-db)
    echo "📋 Logs de la base de datos..."
    docker-compose logs -f postgres
    ;;

  build)
    echo "🔨 Construyendo imágenes (sin caché)..."
    docker-compose build --no-cache
    echo "✅ Imágenes construidas"
    ;;

  clean)
    echo "🧹 Eliminando contenedores, volúmenes y datos..."
    docker-compose down -v
    echo "✅ Sistema limpiado. Los datos de la BD han sido eliminados."
    ;;

  ps)
    echo "📊 Estado de los contenedores:"
    docker-compose ps
    ;;

  shell-backend)
    echo "🐚 Abriendo shell en el backend..."
    docker-compose exec backend sh
    ;;

  shell-frontend)
    echo "🐚 Abriendo shell en el frontend..."
    docker-compose exec frontend sh
    ;;

  shell-db)
    echo "🐚 Conectando a PostgreSQL..."
    docker-compose exec postgres psql -U postgres -d erp_tienda_dev
    ;;

  test-backend)
    echo "🧪 Ejecutando tests del backend..."
    docker-compose exec backend npm test
    ;;

  *)
    echo "🐳 Docker Development Helper"
    echo ""
    echo "Comandos disponibles:"
    echo "  start              - Inicia el sistema (PostgreSQL + Backend + Frontend)"
    echo "  stop               - Detiene el sistema"
    echo "  restart            - Reinicia todos los servicios"
    echo "  build              - Reconstruye las imágenes (sin caché)"
    echo "  clean              - Elimina contenedores, volúmenes y datos"
    echo "  ps                 - Muestra estado de los contenedores"
    echo ""
    echo "  logs               - Ver logs de todos los servicios"
    echo "  logs-backend       - Ver logs del backend"
    echo "  logs-frontend      - Ver logs del frontend"
    echo "  logs-db            - Ver logs de PostgreSQL"
    echo ""
    echo "  shell-backend      - Abrir shell en el contenedor del backend"
    echo "  shell-frontend     - Abrir shell en el contenedor del frontend"
    echo "  shell-db           - Conectar a PostgreSQL"
    echo ""
    echo "  test-backend       - Ejecutar tests del backend"
    echo ""
    echo "Ejemplos:"
    echo "  ./scripts/docker-dev.sh start"
    echo "  ./scripts/docker-dev.sh logs-backend"
    echo "  ./scripts/docker-dev.sh shell-backend"
    ;;
esac
