#!/usr/bin/env bash
# ==============================================================================
# instalar.sh — deja la laptop del punto de venta lista (Linux Mint 22 Xfce).
#
# Se corre UNA vez con sudo, desde la carpeta del repo, en la laptop recién
# instalada (se puede repetir sin problema: es idempotente):
#
#   sudo bash scripts/pos/instalar.sh [usuario] [--forzar]
#
#   usuario   usuario de escritorio de la tienda (por defecto, quien invocó sudo,
#             o el usuario con UID 1000). Se sugiere "tienda".
#   --forzar  seguir aunque la distribución no sea Linux Mint / Ubuntu.
#
# Qué hace:
#   1. Instala chromium y curl.
#   2. Copia los scripts a /opt/tienda-pos/ y crea /etc/tienda-pos.conf (sin pisarlo).
#   3. Instala y activa el ping al backend (timer + arranque + despertar).
#   4. Tapa: enchufada no suspende; con batería sí (logind).
#   5. Inicio de sesión automático (LightDM).
#   6. Zona horaria America/El_Salvador.
#   7. Kiosco de Chromium al iniciar sesión; sin pantalla de bienvenida de Mint.
#   8. Ajustes de Xfce (tapa, sin bloqueo, sin salvapantallas).
# ==============================================================================
set -euo pipefail

DIR_ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="/opt/tienda-pos"
CONF="/etc/tienda-pos.conf"
ZONA="America/El_Salvador"

HECHO=()
PENDIENTE=()
paso() { echo "==> $*"; }
aviso() { echo "AVISO: $*" >&2; }
hecho() { HECHO+=("$*"); }
pendiente() { PENDIENTE+=("$*"); }

# ---------------------------------------------------------------- argumentos
USUARIO=""
FORZAR=0
for arg in "$@"; do
  case "$arg" in
    --forzar) FORZAR=1 ;;
    -h | --help)
      sed -n '2,24p' "${BASH_SOURCE[0]}"
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
  echo "Este instalador necesita permisos de administrador. Córralo así:" >&2
  echo "  sudo bash scripts/pos/instalar.sh" >&2
  exit 1
fi

# ------------------------------------------------------------- distribución
ID_DISTRO=""
ID_LIKE_DISTRO=""
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  ID_DISTRO="$(. /etc/os-release && echo "${ID:-}")"
  # shellcheck disable=SC1091
  ID_LIKE_DISTRO="$(. /etc/os-release && echo "${ID_LIKE:-}")"
fi
case "$ID_DISTRO" in
  linuxmint | ubuntu) ;;
  *)
    aviso "Esta guía está pensada para Linux Mint / Ubuntu y esto es '$ID_DISTRO' (parecido a: '$ID_LIKE_DISTRO')."
    if [ "$FORZAR" -ne 1 ]; then
      echo "Si de verdad quiere seguir, vuelva a correrlo con --forzar." >&2
      exit 1
    fi
    ;;
esac
command -v apt-get >/dev/null 2>&1 || {
  echo "No hay apt-get: este instalador solo sirve para Mint/Ubuntu/Debian." >&2
  exit 1
}
command -v systemctl >/dev/null 2>&1 || {
  echo "No hay systemd (systemctl)." >&2
  exit 1
}
if [ "$ID_DISTRO" = "ubuntu" ]; then
  aviso "En Ubuntu 'chromium' es un paquete snap; el kiosco no está probado así. En Mint es un .deb normal."
fi

# ------------------------------------------------------- usuario de escritorio
if [ -z "$USUARIO" ]; then
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    USUARIO="$SUDO_USER"
  else
    USUARIO="$(getent passwd 1000 | cut -d: -f1 || true)"
  fi
fi
if [ -z "$USUARIO" ] || ! id "$USUARIO" >/dev/null 2>&1; then
  echo "No pude determinar el usuario de escritorio. Páselo como parámetro:" >&2
  echo "  sudo bash scripts/pos/instalar.sh tienda" >&2
  exit 1
fi
if [ "$USUARIO" = "root" ]; then
  echo "El kiosco no debe correr como root. Use el usuario normal de la tienda." >&2
  exit 1
fi
UID_USUARIO="$(id -u "$USUARIO")"
GRUPO_USUARIO="$(id -gn "$USUARIO")"
HOME_USUARIO="$(getent passwd "$USUARIO" | cut -d: -f6)"
if [ ! -d "$HOME_USUARIO" ]; then
  echo "La carpeta personal de $USUARIO ($HOME_USUARIO) no existe." >&2
  exit 1
fi
paso "Usuario de escritorio: $USUARIO (carpeta $HOME_USUARIO)"

# Ejecuta un comando como el usuario de escritorio.
como_usuario() { runuser -u "$USUARIO" -- "$@"; }

# Crea un archivo de texto del usuario con su dueño correcto. Uso: escribir_usuario ruta  (contenido por stdin)
escribir_usuario() {
  local ruta="$1"
  install -d -o "$USUARIO" -g "$GRUPO_USUARIO" -m 0755 "$(dirname "$ruta")"
  cat >"$ruta"
  chown "$USUARIO:$GRUPO_USUARIO" "$ruta"
  chmod 0644 "$ruta"
}

# ----------------------------------------------------------------- 1. paquetes
paso "Instalando paquetes (chromium, curl)…"
export DEBIAN_FRONTEND=noninteractive
if ! apt-get update -qq; then
  aviso "apt-get update falló (¿sin internet?). Se intenta seguir con lo que haya."
fi
apt-get install -y curl
if command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1; then
  hecho "Chromium ya estaba instalado."
elif apt-get install -y chromium; then
  hecho "Chromium instalado."
elif apt-get install -y chromium-browser; then
  hecho "Chromium instalado (paquete chromium-browser)."
else
  aviso "No se pudo instalar chromium."
  pendiente "Instalar Chromium a mano: sudo apt install chromium (sin él el kiosco no abre)."
fi
hecho "curl instalado."

# ------------------------------------------------------- 2. scripts y config
paso "Copiando scripts a $DESTINO…"
install -d -m 0755 "$DESTINO"
for f in tienda-ping.sh tienda-kiosco.sh tienda-kiosco-parar.sh tienda-kiosco-iniciar.sh tienda-ajustes-xfce.sh; do
  install -m 0755 "$DIR_ORIGEN/$f" "$DESTINO/$f"
done
ln -sf "$DESTINO/tienda-kiosco-parar.sh" /usr/local/bin/tienda-kiosco-parar
ln -sf "$DESTINO/tienda-kiosco-iniciar.sh" /usr/local/bin/tienda-kiosco-iniciar
hecho "Scripts copiados a $DESTINO (comandos tienda-kiosco-parar y tienda-kiosco-iniciar)."

if [ -e "$CONF" ]; then
  hecho "$CONF ya existía: no se tocó."
else
  cat >"$CONF" <<EOF
# Configuración del punto de venta. La leen los scripts de /opt/tienda-pos.
# Es un archivo de shell: VARIABLE="valor". Después de editarlo no hay que
# reiniciar nada (el kiosco lee URL_TIENDA al abrir el navegador; el ping lo
# lee en cada ejecución).

# Dirección de la tienda (frontend) que abre el kiosco.
URL_TIENDA="https://proyecto-tienda-sand.vercel.app/"

# Dirección de salud del backend que se "despierta" con el ping.
URL_SALUD="https://proyecto-tienda-nbi6.onrender.com/salud"

# Horario del ping cada 10 min (hora de El Salvador, formato HH:MM).
# Fuera de este horario el backend se duerme y no gasta las 750 horas gratis de Render.
HORA_INICIO="05:30"
HORA_FIN="21:30"

# Usuario de Linux con el que corre el kiosco.
USUARIO_KIOSCO="$USUARIO"
EOF
  chmod 0644 "$CONF"
  hecho "Creado $CONF (editable para cambiar horario o direcciones)."
fi

# ------------------------------------------------------ 3. unidades systemd
paso "Instalando el ping al backend (systemd)…"
for u in tienda-despierta.service tienda-despierta.timer tienda-despierta-arranque.service tienda-despierta-sueno.service; do
  install -m 0644 "$DIR_ORIGEN/$u" "/etc/systemd/system/$u"
done
systemctl daemon-reload
systemctl enable tienda-despierta.timer tienda-despierta-arranque.service tienda-despierta-sueno.service >/dev/null
systemctl start tienda-despierta.timer
# Un ping de prueba ahora mismo, sin esperar (no bloquea el instalador).
systemctl start --no-block tienda-despierta-arranque.service || true
hecho "Ping a /salud: cada 10 min en horario, al arrancar y al despertar de suspensión."

# ------------------------------------------------------------- 4. tapa (logind)
paso "Configurando la tapa (logind)…"
install -d -m 0755 /etc/systemd/logind.conf.d
cat >/etc/systemd/logind.conf.d/50-tienda-tapa.conf <<'EOF'
# Tienda POS: con batería, cerrar la tapa suspende; enchufada (o en base), no.
[Login]
HandleLidSwitch=suspend
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
EOF
# Recarga la configuración de logind sin matar la sesión; si no se puede, se aplica al reiniciar.
systemctl kill -s HUP systemd-logind 2>/dev/null || true
hecho "Tapa: enchufada no suspende; con batería sí (/etc/systemd/logind.conf.d/50-tienda-tapa.conf)."
pendiente "Reiniciar la laptop una vez para que la tapa y el inicio automático queden aplicados."

# --------------------------------------------------- 5. inicio de sesión automático
paso "Configurando el inicio de sesión automático (LightDM)…"
if [ -d /etc/lightdm ] || command -v lightdm >/dev/null 2>&1; then
  install -d -m 0755 /etc/lightdm/lightdm.conf.d
  # Prefijo 90- para ganarle a 70-linuxmint.conf y otros.
  cat >/etc/lightdm/lightdm.conf.d/90-tienda-autologin.conf <<EOF
# Tienda POS: entrar directo al escritorio sin pedir contraseña.
[Seat:*]
autologin-user=$USUARIO
autologin-user-timeout=0
EOF
  # Algunas configuraciones de PAM de LightDM exigen este grupo para el autologin.
  getent group nopasswdlogin >/dev/null || groupadd -r nopasswdlogin
  usermod -aG nopasswdlogin "$USUARIO"
  hecho "Inicio de sesión automático de $USUARIO (/etc/lightdm/lightdm.conf.d/90-tienda-autologin.conf)."
else
  aviso "No encontré LightDM; el inicio automático no se configuró."
  pendiente "Activar a mano el inicio de sesión automático para $USUARIO (esta laptop no usa LightDM)."
fi

# --------------------------------------------------------------- 6. zona horaria
paso "Zona horaria $ZONA…"
if timedatectl set-timezone "$ZONA"; then
  timedatectl set-ntp true 2>/dev/null || true
  hecho "Zona horaria $ZONA."
else
  aviso "No se pudo poner la zona horaria."
  pendiente "Poner la zona horaria a mano: sudo timedatectl set-timezone $ZONA"
fi

# ------------------------------------------------- 7. kiosco y escritorio del usuario
paso "Configurando el escritorio de $USUARIO…"
AUTOSTART="$HOME_USUARIO/.config/autostart"

escribir_usuario "$AUTOSTART/tienda-kiosco.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Tienda (kiosco)
Comment=Abre la tienda a pantalla completa
Exec=/opt/tienda-pos/tienda-kiosco.sh
Terminal=false
X-GNOME-Autostart-enabled=true
Hidden=false
EOF
hecho "Kiosco de Chromium al iniciar sesión (~/.config/autostart/tienda-kiosco.desktop)."

# Si estaba en pausa de una prueba anterior, se quita.
rm -f "/run/user/$UID_USUARIO/tienda-kiosco-pausado"

# Pantalla de bienvenida de Mint: bandera de "no mostrar" + autostart oculto.
install -d -o "$USUARIO" -g "$GRUPO_USUARIO" -m 0755 "$HOME_USUARIO/.linuxmint" "$HOME_USUARIO/.linuxmint/mintwelcome"
touch "$HOME_USUARIO/.linuxmint/mintwelcome/norun.flag"
chown "$USUARIO:$GRUPO_USUARIO" "$HOME_USUARIO/.linuxmint/mintwelcome/norun.flag"

# Oculta autostarts del sistema que estorban (solo si existen). Llevan la marca
# "# tienda-pos" para que desinstalar.sh sepa cuáles borrar.
ocultar_autostart() {
  local nombre="$1"
  if [ -e "/etc/xdg/autostart/$nombre.desktop" ]; then
    escribir_usuario "$AUTOSTART/$nombre.desktop" <<EOF
# tienda-pos: oculta el autostart del sistema ($nombre)
[Desktop Entry]
Type=Application
Name=$nombre
Hidden=true
EOF
  fi
}
ocultar_autostart mintwelcome
ocultar_autostart light-locker
ocultar_autostart xfce4-screensaver
hecho "Sin pantalla de bienvenida de Mint, sin salvapantallas ni bloqueo de pantalla (autostart)."

# ------------------------------------------------------------- 8. ajustes de Xfce
paso "Aplicando ajustes de Xfce de $USUARIO…"
AJUSTES_OK=0
BUS="/run/user/$UID_USUARIO/bus"
if [ -S "$BUS" ]; then
  if runuser -u "$USUARIO" -- env \
    XDG_RUNTIME_DIR="/run/user/$UID_USUARIO" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=$BUS" \
    "$DESTINO/tienda-ajustes-xfce.sh"; then
    AJUSTES_OK=1
  fi
fi
if [ "$AJUSTES_OK" -eq 1 ]; then
  hecho "Ajustes de Xfce aplicados (tapa, sin bloqueo, pantalla siempre encendida enchufada)."
else
  escribir_usuario "$AUTOSTART/tienda-ajustes-primer-inicio.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Tienda (ajustes de primer inicio)
Comment=Aplica los ajustes de Xfce una sola vez y se borra
Exec=/opt/tienda-pos/tienda-ajustes-xfce.sh --primer-inicio
Terminal=false
X-GNOME-Autostart-enabled=true
EOF
  hecho "Ajustes de Xfce: se aplicarán solos en el primer inicio de sesión (no había sesión activa ahora)."
  pendiente "Tras el primer reinicio, comprobar los ajustes de energía (ver la guía: lista de verificación)."
fi

# --------------------------------------------------------------------- resumen
echo
echo "=============================================================="
echo " Instalación terminada"
echo "=============================================================="
echo "Hecho:"
for h in "${HECHO[@]}"; do echo "  - $h"; done
echo
echo "Falta verificar (ver docs/operations/laptop-pos.md, lista de verificación):"
if [ "${#PENDIENTE[@]}" -gt 0 ]; then
  for p in "${PENDIENTE[@]}"; do echo "  - $p"; done
fi
echo "  - Reiniciar y comprobar que entra sola y abre la tienda."
echo "  - systemctl list-timers tienda-despierta.timer"
echo "  - journalctl -t tienda-despierta -n 20 --no-pager"
echo "  - Probar la tapa enchufada y con batería."
echo
echo "Para dar mantenimiento: Ctrl+Alt+T, luego: tienda-kiosco-parar   (y tienda-kiosco-iniciar para volver)."
