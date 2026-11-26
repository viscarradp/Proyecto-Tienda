#!/usr/bin/env bash
# ==============================================================================
# tienda-kiosco.sh — abre la tienda en Chromium a pantalla completa (modo kiosco)
# y lo vuelve a abrir si se cierra. Lo arranca ~/.config/autostart/tienda-kiosco.desktop
# al iniciar la sesión; corre con el usuario de escritorio (no con root).
#
# Para detenerlo (mantenimiento):   tienda-kiosco-parar
# Para volver a encenderlo:         tienda-kiosco-iniciar
# ==============================================================================
set -uo pipefail

CONF="${TIENDA_POS_CONF:-/etc/tienda-pos.conf}"
URL_TIENDA="https://proyecto-tienda-sand.vercel.app/"
USUARIO_KIOSCO=""
if [ -r "$CONF" ]; then
  # shellcheck disable=SC1090
  . "$CONF"
fi

# Si el kiosco está pensado para un usuario concreto, no se abre con otro
# (así una sesión de administración distinta no arranca el kiosco).
if [ -n "$USUARIO_KIOSCO" ] && [ "$(id -un)" != "$USUARIO_KIOSCO" ]; then
  exit 0
fi

PERFIL="$HOME/.config/tienda-kiosco"
# La pausa vive en /run/user/UID: se borra sola al reiniciar o cerrar sesión,
# así que reiniciar siempre devuelve el kiosco.
PAUSA="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/tienda-kiosco-pausado"
mkdir -p "$PERFIL"

# Una sola copia del bucle a la vez.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$PERFIL/kiosco.lock"
  flock -n 9 || exit 0
fi

# Chromium se llama "chromium" en Mint; "chromium-browser" en otras.
NAVEGADOR=""
for candidato in chromium chromium-browser; do
  if command -v "$candidato" >/dev/null 2>&1; then
    NAVEGADOR="$candidato"
    break
  fi
done
if [ -z "$NAVEGADOR" ]; then
  echo "tienda-kiosco: no se encontró chromium; instálelo con: sudo apt install chromium" >&2
  exit 1
fi

# Sin salvapantallas ni apagado de pantalla por inactividad (mejor esfuerzo; solo X11).
if command -v xset >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
  xset s off s noblank >/dev/null 2>&1 || true
fi

# Marca la salida anterior como normal para que Chromium no ofrezca "restaurar páginas".
marcar_salida_normal() {
  local f
  for f in "$PERFIL/Default/Preferences" "$PERFIL/Local State"; do
    if [ -f "$f" ]; then
      sed -i \
        -e 's/"exited_cleanly":false/"exited_cleanly":true/' \
        -e 's/"exit_type":"[^"]*"/"exit_type":"Normal"/' \
        "$f" 2>/dev/null || true
    fi
  done
}

# Espera (máx. ~60 s) a que haya internet; si no llega, abre igual (F5 recarga).
esperar_internet() {
  command -v curl >/dev/null 2>&1 || return 0
  local i
  for i in $(seq 1 30); do
    curl -s -o /dev/null --max-time 4 "$URL_TIENDA" && return 0
    sleep 2
  done
  return 0
}

while true; do
  # Pausa pedida por el administrador (tienda-kiosco-parar).
  if [ -e "$PAUSA" ]; then
    exit 0
  fi

  # Si ya hay un Chromium con este perfil, lanzar otro solo abriría una pestaña
  # nueva en el existente y saldría al instante (una pestaña cada 5 s): se espera
  # a que ese termine, respetando la pausa.
  if pgrep -u "$(id -u)" -f -- "--user-data-dir=$PERFIL" >/dev/null 2>&1; then
    sleep 5
    continue
  fi

  marcar_salida_normal
  esperar_internet

  # --password-store=basic: con inicio automático el llavero está cerrado y
  #   Chromium pediría su contraseña; así no lo usa.
  # 9>&-: el navegador no hereda el candado del bucle.
  "$NAVEGADOR" \
    --kiosk \
    --user-data-dir="$PERFIL" \
    --password-store=basic \
    --no-first-run \
    --no-default-browser-check \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --hide-crash-restore-bubble \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --disable-features=Translate,TranslateUI,OverscrollHistoryNavigation \
    --lang=es \
    "$URL_TIENDA" 9>&- >/dev/null 2>&1

  # Se cerró (a propósito o por error): reabrir en unos segundos, salvo pausa.
  sleep 5
done
