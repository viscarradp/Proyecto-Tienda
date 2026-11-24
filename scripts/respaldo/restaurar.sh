#!/usr/bin/env bash
# Restaura un respaldo cifrado (respaldo-*.dump.enc) en una base de datos.
#
# Uso:
#   RESTORE_DATABASE_URL=... BACKUP_PASSPHRASE=... \
#     scripts/respaldo/restaurar.sh [--confirmo-destino-remoto] <archivo.dump.enc>
#
# Variables de entorno (nunca se imprimen):
#   RESTORE_DATABASE_URL  BD destino. Debe existir y estar VACIA (el respaldo se
#                         crea con --no-owner/--no-privileges, sirve en otra base).
#   BACKUP_PASSPHRASE     La misma clave con la que se cifro el respaldo.
#
# Seguridad: si el host de destino no es local (localhost, 127.0.0.1, ::1) el
# script se niega salvo que pases --confirmo-destino-remoto. Siempre muestra el
# destino (sin contrasena) antes de empezar.
# La version mayor de pg_restore debe ser >= la de pg_dump que hizo el respaldo.
set -euo pipefail

REMOTO=0
ARCHIVO=""
for arg in "$@"; do
  case "$arg" in
    --confirmo-destino-remoto) REMOTO=1 ;;
    -*) echo "ERROR: opcion desconocida: $arg" >&2; exit 2 ;;
    *) ARCHIVO="$arg" ;;
  esac
done

[ -n "$ARCHIVO" ] || { echo "Uso: restaurar.sh [--confirmo-destino-remoto] <archivo.dump.enc>" >&2; exit 2; }
[ -f "$ARCHIVO" ] || { echo "ERROR: no existe el archivo: $ARCHIVO" >&2; exit 1; }
: "${RESTORE_DATABASE_URL:?Falta RESTORE_DATABASE_URL (BD destino, vacia)}"
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE (clave de cifrado del respaldo)}"

for cmd in pg_restore openssl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: falta el comando '$cmd' en el PATH." >&2; exit 1; }
done

# Extrae host y base de la URL (sin mostrar usuario ni contrasena).
SIN_ESQUEMA="${RESTORE_DATABASE_URL#*://}"
AUTORIDAD="${SIN_ESQUEMA%%[/?]*}"
HOSTPORT="${AUTORIDAD##*@}"
if [[ "$HOSTPORT" == \[* ]]; then HOST="${HOSTPORT%%]*}"; HOST="${HOST#[}"; else HOST="${HOSTPORT%%:*}"; fi
RESTO="${SIN_ESQUEMA#"$AUTORIDAD"}"; RESTO="${RESTO#/}"
BASE="${RESTO%%\?*}"
# Un parametro ?host=... podria redirigir la conexion: se trata como remoto.
EXTRA_HOST=0
if [[ "$RESTO" == *host=* || "$RESTO" == *hostaddr=* ]]; then EXTRA_HOST=1; fi

case "$HOST" in
  localhost|127.0.0.1|::1) LOCAL=1 ;;
  *) LOCAL=0 ;;
esac
if [ "$EXTRA_HOST" -eq 1 ]; then LOCAL=0; fi

if [ "$LOCAL" -eq 1 ]; then TIPO="local"; else TIPO="REMOTO"; fi
echo "Destino de la restauracion:"
echo "  host: ${HOST:-<vacio>}   base: ${BASE:-<vacia>}   ($TIPO)"
echo "  archivo: $ARCHIVO"

if [ "$LOCAL" -ne 1 ] && [ "$REMOTO" -ne 1 ]; then
  echo "ERROR: el destino no es local. Si de verdad quieres restaurar ahi, repite con --confirmo-destino-remoto." >&2
  exit 1
fi

# Parametros de cifrado: deben coincidir con respaldar.sh.
OPENSSL_ENC=(-aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE)

# El esquema 'public' ya existe en cualquier base nueva (Supabase incluida): se
# omite su CREATE/COMMENT del respaldo para no provocar un error falso.
LISTA="$(mktemp)"
trap 'rm -f "$LISTA"' EXIT
if ! openssl enc -d "${OPENSSL_ENC[@]}" -in "$ARCHIVO" | pg_restore -l > "$LISTA"; then
  echo "ERROR: no se pudo descifrar (clave incorrecta o archivo danado)." >&2
  exit 1
fi
grep -v -E '(SCHEMA - public|COMMENT - SCHEMA public) ' "$LISTA" > "$LISTA.filtrada" || true
mv "$LISTA.filtrada" "$LISTA"

echo "Restaurando..."
set +e
openssl enc -d "${OPENSSL_ENC[@]}" -in "$ARCHIVO" \
  | pg_restore --no-owner --no-privileges --use-list="$LISTA" --dbname="$RESTORE_DATABASE_URL"
ESTADO=("${PIPESTATUS[@]}")
set -e

if [ "${ESTADO[0]}" -ne 0 ]; then
  echo "ERROR: no se pudo descifrar (clave incorrecta o archivo danado)." >&2
  exit 1
fi
if [ "${ESTADO[1]}" -ne 0 ]; then
  echo "AVISO: pg_restore termino con errores (revisa los mensajes de arriba; un destino no vacio los provoca)." >&2
  exit 1
fi
echo "Restauracion completada en '${BASE}'."
