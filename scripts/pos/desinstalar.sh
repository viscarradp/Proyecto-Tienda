#!/usr/bin/env bash
# ==============================================================================
# desinstalar.sh — revierte lo que hizo instalar.sh (NO desinstala paquetes).
#
#   sudo bash scripts/pos/desinstalar.sh [usuario] [--borrar-config]
#
#   --borrar-config   borra también /etc/tienda-pos.conf (por defecto se conserva)
#
# No se revierten a propósito: la zona horaria, el grupo nopasswdlogin, la
# bandera de "no mostrar bienvenida" de Mint y el perfil de Chromium
# (~/.config/tienda-kiosco, con la sesión de la tienda).
# Reiniciar después para que tapa y LightDM vuelvan a su comportamiento normal.
# ==============================================================================
set -euo pipefail

BORRAR_CONF=0
USUARIO=""
for arg in "$@"; do
  case "$arg" in
    --borrar-config) BORRAR_CONF=1 ;;
    -h | --help)
      sed -n '2,13p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    -*)
      echo "Opción desconocida: $arg" >&2
      exit 2
      ;;
    *) USUARIO="$arg" ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Córralo con: sudo bash scripts/pos/desinstalar.sh" >&2
  exit 1
fi

# Usuario: parámetro, o el de /etc/tienda-pos.conf, o quien invocó sudo, o UID 1000.
if [ -z "$USUARIO" ] && [ -r /etc/tienda-pos.conf ]; then
  # shellcheck disable=SC1091
  USUARIO="$(. /etc/tienda-pos.conf && echo "${USUARIO_KIOSCO:-}")"
fi
if [ -z "$USUARIO" ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  USUARIO="$SUDO_USER"
fi
if [ -z "$USUARIO" ]; then
  USUARIO="$(getent passwd 1000 | cut -d: -f1 || true)"
fi

echo "==> Deteniendo y quitando el ping al backend…"
systemctl disable --now tienda-despierta.timer 2>/dev/null || true
systemctl disable tienda-despierta-arranque.service tienda-despierta-sueno.service 2>/dev/null || true
rm -f /etc/systemd/system/tienda-despierta.service \
  /etc/systemd/system/tienda-despierta.timer \
  /etc/systemd/system/tienda-despierta-arranque.service \
  /etc/systemd/system/tienda-despierta-sueno.service
systemctl daemon-reload

echo "==> Quitando tapa e inicio automático…"
rm -f /etc/systemd/logind.conf.d/50-tienda-tapa.conf
rmdir /etc/systemd/logind.conf.d 2>/dev/null || true
rm -f /etc/lightdm/lightdm.conf.d/90-tienda-autologin.conf
systemctl kill -s HUP systemd-logind 2>/dev/null || true

if [ -n "$USUARIO" ] && id "$USUARIO" >/dev/null 2>&1; then
  UID_USUARIO="$(id -u "$USUARIO")"
  HOME_USUARIO="$(getent passwd "$USUARIO" | cut -d: -f6)"
  AUTOSTART="$HOME_USUARIO/.config/autostart"
  echo "==> Quitando el kiosco y los ajustes de $USUARIO…"

  # Detiene el kiosco ahora (cierra el bucle y su Chromium).
  if [ -d "$HOME_USUARIO/.config/tienda-kiosco" ]; then
    pkill -u "$UID_USUARIO" -f -- "tienda-kiosco.sh" 2>/dev/null || true
    pkill -u "$UID_USUARIO" -f -- "--user-data-dir=$HOME_USUARIO/.config/tienda-kiosco" 2>/dev/null || true
    rm -f "/run/user/$UID_USUARIO/tienda-kiosco-pausado"
  fi

  # Revertir ajustes de Xfce (antes de borrar /opt/tienda-pos), si hay sesión.
  BUS="/run/user/$UID_USUARIO/bus"
  if [ -S "$BUS" ] && [ -x /opt/tienda-pos/tienda-ajustes-xfce.sh ]; then
    runuser -u "$USUARIO" -- env \
      XDG_RUNTIME_DIR="/run/user/$UID_USUARIO" \
      DBUS_SESSION_BUS_ADDRESS="unix:path=$BUS" \
      /opt/tienda-pos/tienda-ajustes-xfce.sh --revertir || true
  else
    echo "AVISO: no hay sesión activa; los ajustes de energía de Xfce quedan como están" >&2
    echo "       (Menú > Gestor de energía, o: xfconf-query -c xfce4-power-manager -lv)." >&2
  fi

  rm -f "$AUTOSTART/tienda-kiosco.desktop" "$AUTOSTART/tienda-ajustes-primer-inicio.desktop"
  # Solo los autostart ocultos que puso este instalador (llevan la marca).
  for f in mintwelcome light-locker xfce4-screensaver; do
    if [ -f "$AUTOSTART/$f.desktop" ] && grep -q '^# tienda-pos' "$AUTOSTART/$f.desktop"; then
      rm -f "$AUTOSTART/$f.desktop"
    fi
  done
else
  echo "AVISO: no se encontró el usuario de escritorio; se omite la limpieza de su carpeta personal." >&2
fi

echo "==> Quitando scripts…"
rm -f /usr/local/bin/tienda-kiosco-parar /usr/local/bin/tienda-kiosco-iniciar
rm -rf /opt/tienda-pos

if [ "$BORRAR_CONF" -eq 1 ]; then
  rm -f /etc/tienda-pos.conf
  echo "==> /etc/tienda-pos.conf borrado."
else
  echo "==> /etc/tienda-pos.conf se conservó (use --borrar-config para quitarlo)."
fi

echo
echo "Listo. Reinicie la laptop para que la tapa y el inicio de sesión vuelvan a lo normal."
