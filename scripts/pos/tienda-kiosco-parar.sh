#!/usr/bin/env bash
# ==============================================================================
# tienda-kiosco-parar — detiene el kiosco para dar mantenimiento.
# Córrase SIN sudo, desde la terminal del usuario de la tienda (Ctrl+Alt+T).
# Deja una marca de "pausa" y cierra el Chromium del kiosco; el bucle ya no lo
# reabre. La pausa se borra sola al reiniciar la laptop o cerrar sesión (el kiosco vuelve);
# también se puede encender antes con tienda-kiosco-iniciar.
# ==============================================================================
set -uo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Córralo sin sudo, como el usuario de la tienda." >&2
  exit 1
fi

PERFIL="$HOME/.config/tienda-kiosco"
PAUSA="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/tienda-kiosco-pausado"
mkdir -p "$PERFIL"
touch "$PAUSA"

# Cierra solo el Chromium del kiosco (el que usa este perfil).
pkill -u "$(id -u)" -f -- "--user-data-dir=$PERFIL" 2>/dev/null || true

echo "Kiosco detenido. Para encenderlo de nuevo: tienda-kiosco-iniciar (o reiniciar la laptop)."
