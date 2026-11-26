#!/usr/bin/env bash
# ==============================================================================
# tienda-kiosco-iniciar — vuelve a encender el kiosco después de tienda-kiosco-parar.
# Córrase SIN sudo, desde una terminal dentro de la sesión gráfica de la tienda.
# ==============================================================================
set -uo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Córralo sin sudo, como el usuario de la tienda." >&2
  exit 1
fi

PERFIL="$HOME/.config/tienda-kiosco"
mkdir -p "$PERFIL"
rm -f "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/tienda-kiosco-pausado"

# Por si se corre desde una terminal sin pantalla asociada (p. ej. por SSH).
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

# Si el bucle ya está corriendo (con candado tomado), el nuevo se cierra solo.
setsid nohup /opt/tienda-pos/tienda-kiosco.sh >/dev/null 2>&1 &

echo "Kiosco encendido: la tienda se abre en unos segundos."
