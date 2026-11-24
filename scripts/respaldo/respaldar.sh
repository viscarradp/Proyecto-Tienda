#!/usr/bin/env bash
# Respaldo cifrado de la base de datos (pg_dump -> openssl AES-256).
#
# Variables de entorno (nunca se imprimen):
#   BACKUP_DATABASE_URL  Cadena de conexion de la BD a respaldar.
#   BACKUP_PASSPHRASE    Clave de cifrado. SIN ELLA EL RESPALDO NO SE PUEDE ABRIR.
# Opcionales:
#   BACKUP_OUT_DIR       Directorio de salida (default: ./respaldos).
#   BACKUP_SCHEMA        Esquema a respaldar (default: public). Se limita a el
#                        porque Supabase trae esquemas propios (auth, storage...)
#                        que no pertenecen a la app y estorban al restaurar.
#
# Notas importantes:
#   * Con Supabase usa la CONEXION DIRECTA (puerto 5432), NO el pooler
#     (puerto 6543 / pooler.supabase.com): el pooler en modo transaccion no es
#     compatible con pg_dump.
#   * La version MAYOR de pg_dump debe ser >= la del servidor (si no, pg_dump
#     se niega). Supabase hoy usa Postgres 17: usa pg_dump 17 o superior.
#   * El dump nunca se escribe sin cifrar en disco: va por una tuberia
#     (pg_dump | openssl) hacia un archivo .parcial que se renombra al final.
#
# Salida: <BACKUP_OUT_DIR>/respaldo-AAAAMMDD-HHMM.dump.enc
set -euo pipefail

: "${BACKUP_DATABASE_URL:?Falta BACKUP_DATABASE_URL (cadena de conexion directa de la BD)}"
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE (clave de cifrado)}"

for cmd in pg_dump pg_restore openssl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: falta el comando '$cmd' en el PATH." >&2; exit 1; }
done

OUT_DIR="${BACKUP_OUT_DIR:-./respaldos}"
SCHEMA="${BACKUP_SCHEMA:-public}"
mkdir -p "$OUT_DIR"
FINAL="$OUT_DIR/respaldo-$(date -u +%Y%m%d-%H%M).dump.enc"
PARCIAL="$FINAL.parcial"
trap 'rm -f "$PARCIAL"' EXIT

# Parametros de cifrado: deben coincidir con restaurar.sh.
OPENSSL_ENC=(-aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE)

echo "Respaldando esquema '$SCHEMA' (pg_dump $(pg_dump --version | awk '{print $NF}'))..."
pg_dump -Fc --no-owner --no-privileges --schema="$SCHEMA" "$BACKUP_DATABASE_URL" \
  | openssl enc "${OPENSSL_ENC[@]}" -out "$PARCIAL"

# Verificacion: se descifra en una tuberia y pg_restore debe poder leer el indice.
if ! openssl enc -d "${OPENSSL_ENC[@]}" -in "$PARCIAL" | pg_restore -l >/dev/null; then
  echo "ERROR: el respaldo generado no se pudo verificar; se descarta." >&2
  exit 1
fi

mv "$PARCIAL" "$FINAL"
trap - EXIT
echo "Respaldo listo y verificado: $FINAL ($(wc -c < "$FINAL" | tr -d ' ') bytes)"
