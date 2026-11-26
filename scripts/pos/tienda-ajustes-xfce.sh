#!/usr/bin/env bash
# ==============================================================================
# tienda-ajustes-xfce.sh — ajustes de Xfce del usuario de la tienda (xfconf).
# Corre COMO ESE USUARIO, con su sesión D-Bus (lo lanza instalar.sh o, si no
# había sesión, el autostart de "primer inicio").
#
#   (sin argumentos)   aplica los ajustes
#   --primer-inicio    espera a que el escritorio esté listo, aplica y se
#                      autoelimina del autostart si funcionó
#   --revertir         borra los ajustes (vuelven los valores por defecto)
#
# Qué deja:
#  - Tapa: enchufada = no hacer nada (la pantalla se apaga sola por hardware);
#          con batería = suspender.
#  - Sin bloqueo de pantalla al suspender, sin salvapantallas, la pantalla no se
#    apaga sola cuando está enchufada.
# Todo es "mejor esfuerzo": un ajuste que falle no detiene a los demás.
# ==============================================================================
set -uo pipefail

MODO="aplicar"
case "${1:-}" in
  --primer-inicio) MODO="primer-inicio" ;;
  --revertir) MODO="revertir" ;;
  "") ;;
  *) echo "Uso: $0 [--primer-inicio|--revertir]" >&2; exit 2 ;;
esac

if ! command -v xfconf-query >/dev/null 2>&1; then
  echo "xfconf-query no está disponible (¿no es Xfce?)." >&2
  exit 1
fi

# fijar canal propiedad tipo valor
# (si la propiedad ya existe con otro tipo, reintenta solo con el valor)
fijar() {
  xfconf-query -c "$1" -p "$2" -n -t "$3" -s "$4" >/dev/null 2>&1     || xfconf-query -c "$1" -p "$2" -s "$4" >/dev/null 2>&1
}
# borrar canal propiedad
borrar() { xfconf-query -c "$1" -p "$2" -r >/dev/null 2>&1; }

PM="xfce4-power-manager"
SS="xfce4-screensaver"

# Lista: canal|propiedad|tipo|valor
AJUSTES=(
  # Tapa: 0 = no hacer nada, 1 = suspender.
  "$PM|/xfce4-power-manager/lid-action-on-ac|int|0"
  "$PM|/xfce4-power-manager/lid-action-on-battery|int|1"
  # Sin bloqueo de pantalla al suspender / hibernar.
  "$PM|/xfce4-power-manager/lock-screen-suspend-hibernate|bool|false"
  # Enchufada: la pantalla no se duerme ni se apaga sola (0 = nunca).
  "$PM|/xfce4-power-manager/dpms-on-ac-sleep|uint|0"
  "$PM|/xfce4-power-manager/dpms-on-ac-off|uint|0"
  "$PM|/xfce4-power-manager/blank-on-ac|int|0"
  # Salvapantallas y bloqueo de xfce4-screensaver apagados.
  "$SS|/saver/enabled|bool|false"
  "$SS|/saver/idle-activation/enabled|bool|false"
  "$SS|/lock/enabled|bool|false"
  "$SS|/lock/saver-activation/enabled|bool|false"
  "$SS|/lock/user-switching/enabled|bool|false"
)

aplicar() {
  local ok=0 total=0 linea canal prop tipo valor
  for linea in "${AJUSTES[@]}"; do
    IFS='|' read -r canal prop tipo valor <<<"$linea"
    total=$((total + 1))
    if fijar "$canal" "$prop" "$tipo" "$valor"; then
      ok=$((ok + 1))
    fi
  done
  echo "Ajustes de Xfce aplicados: $ok de $total."
  # Éxito si al menos un ajuste entró: significa que xfconf responde.
  [ "$ok" -gt 0 ]
}

revertir() {
  local linea canal prop
  for linea in "${AJUSTES[@]}"; do
    IFS='|' read -r canal prop _ _ <<<"$linea"
    borrar "$canal" "$prop" || true
  done
  echo "Ajustes de Xfce revertidos."
}

case "$MODO" in
  aplicar)
    aplicar
    ;;
  revertir)
    revertir
    ;;
  primer-inicio)
    # El escritorio recién arrancó: damos tiempo a que xfconfd y el gestor de energía estén.
    sleep 10
    listo=1
    for _ in 1 2 3 4 5 6; do
      if aplicar; then
        listo=0
        break
      fi
      sleep 10
    done
    if [ "$listo" -eq 0 ]; then
      rm -f "$HOME/.config/autostart/tienda-ajustes-primer-inicio.desktop"
    fi
    exit "$listo"
    ;;
esac
