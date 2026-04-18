#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Tienda Karlita — Limpiar tabla de Supabase
#
# Uso:
#   ./limpiar_tabla.sh <nombre_tabla>
#   ./limpiar_tabla.sh ventas
#   ./limpiar_tabla.sh --todas     (limpia TODAS las tablas transaccionales)
#
# Esto hace TRUNCATE CASCADE + reinicia el autoincrement a 1.
# Los productos, categorías, presentaciones y el usuario admin se mantienen.
# ═══════════════════════════════════════════════════════════════

# Cargar las variables de entorno del backend
ENV_FILE="$(dirname "$0")/erp-tienda-backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ No se encontró $ENV_FILE"
  echo "   Ejecuta este script desde la raíz del proyecto."
  exit 1
fi

# Extraer DIRECT_URL o DATABASE_URL del .env
DB_URL=$(grep -E "^DIRECT_URL=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')
if [ -z "$DB_URL" ]; then
  DB_URL=$(grep -E "^DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')
fi

if [ -z "$DB_URL" ]; then
  echo "❌ No se encontró DATABASE_URL ni DIRECT_URL en el .env"
  exit 1
fi

# Tablas transaccionales (orden correcto por dependencias FK)
TABLAS_TRANSACCIONALES=(
  "detalle_venta_lotes"
  "detalle_ventas"
  "ventas"
  "ajustes_inventario"
  "cuentas_por_pagar"
  "lotes_inventario"
  "compras_inventario"
  "movimientos_financieros"
  "cajas_turnos"
  "caja_general"
  "categorias_gastos"
)

limpiar_tabla() {
  local tabla="$1"
  echo "🗑️  Limpiando: $tabla"
  psql "$DB_URL" -c "TRUNCATE TABLE $tabla RESTART IDENTITY CASCADE;" 2>&1
  if [ $? -eq 0 ]; then
    echo "   ✅ $tabla limpia (IDs reiniciados a 1)"
  else
    echo "   ❌ Error al limpiar $tabla"
  fi
}

# ── Modo de uso ──
if [ -z "$1" ]; then
  echo "Uso:"
  echo "  ./limpiar_tabla.sh <nombre_tabla>      Limpia una tabla específica"
  echo "  ./limpiar_tabla.sh --todas             Limpia todas las tablas transaccionales"
  echo ""
  echo "Tablas disponibles:"
  for t in "${TABLAS_TRANSACCIONALES[@]}"; do
    echo "  - $t"
  done
  echo ""
  echo "Tablas que NO se borran (datos maestros):"
  echo "  - usuarios, productos, categorias, presentaciones"
  exit 0
fi

if [ "$1" = "--todas" ]; then
  echo "╔═══════════════════════════════════════════════╗"
  echo "║  ⚠️  LIMPIANDO TODAS LAS TABLAS TRANSACCIONALES  ║"
  echo "╚═══════════════════════════════════════════════╝"
  echo ""
  read -p "¿Estás seguro? (s/N): " confirm
  if [ "$confirm" != "s" ] && [ "$confirm" != "S" ]; then
    echo "Cancelado."
    exit 0
  fi
  echo ""
  for tabla in "${TABLAS_TRANSACCIONALES[@]}"; do
    limpiar_tabla "$tabla"
  done
  echo ""
  echo "✅ Todas las tablas transaccionales están limpias."
  echo "   Los productos, categorías, presentaciones y usuarios se mantienen."
else
  limpiar_tabla "$1"
fi
