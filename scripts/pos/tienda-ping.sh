#!/usr/bin/env bash
# ==============================================================================
# tienda-ping.sh — mantiene despierto el backend de Render (plan gratis).
#
# Hace un GET a URL_SALUD. Render gratis duerme el servicio tras 15 min sin
# tráfico y regala 750 horas de instancia al mes; por eso este ping solo corre
# dentro del horario HORA_INICIO–HORA_FIN (hora de El Salvador) y la tienda
# duerme de noche.
#
# Uso:
#   tienda-ping.sh             ping solo si estamos dentro del horario (lo usa el timer)
#   tienda-ping.sh --siempre   ping sin mirar el horario (arranque y despertar de suspensión)
#
# Lee /etc/tienda-pos.conf. Escribe en stdout; systemd lo manda al journal con el
# identificador "tienda-despierta" (journalctl -t tienda-despierta).
# NUNCA falla ruidosamente: si no hay internet, lo anota y termina con código 0.
# ==============================================================================
set -uo pipefail

CONF="${TIENDA_POS_CONF:-/etc/tienda-pos.conf}"

# Valores por defecto (el archivo de configuración los puede cambiar).
URL_SALUD="https://proyecto-tienda-nbi6.onrender.com/salud"
HORA_INICIO="05:30"
HORA_FIN="21:30"
ZONA_HORARIA="America/El_Salvador"

if [ -r "$CONF" ]; then
  # shellcheck disable=SC1090
  . "$CONF"
fi

log() { echo "$*"; }

# "HH:MM" válida (00:00 a 23:59).
hora_valida() { [[ "$1" =~ ^([01]?[0-9]|2[0-3]):[0-5][0-9]$ ]]; }

# "HH:MM" -> minutos desde medianoche (el 10# evita que "08" se lea como octal).
a_minutos() {
  local h="${1%%:*}" m="${1##*:}"
  echo $((10#$h * 60 + 10#$m))
}

if ! hora_valida "$HORA_INICIO"; then
  log "AVISO: HORA_INICIO='$HORA_INICIO' no es válida (use HH:MM); se usa 05:30."
  HORA_INICIO="05:30"
fi
if ! hora_valida "$HORA_FIN"; then
  log "AVISO: HORA_FIN='$HORA_FIN' no es válida (use HH:MM); se usa 21:30."
  HORA_FIN="21:30"
fi

SIEMPRE=0
[ "${1:-}" = "--siempre" ] && SIEMPRE=1

# ¿Estamos dentro del horario? (soporta horarios que cruzan la medianoche)
dentro_de_horario() {
  local ahora ini fin
  ahora=$(a_minutos "$(TZ="$ZONA_HORARIA" date +%H:%M)")
  ini=$(a_minutos "$HORA_INICIO")
  fin=$(a_minutos "$HORA_FIN")
  if [ "$ini" -le "$fin" ]; then
    [ "$ahora" -ge "$ini" ] && [ "$ahora" -le "$fin" ]
  else
    [ "$ahora" -ge "$ini" ] || [ "$ahora" -le "$fin" ]
  fi
}

if [ "$SIEMPRE" -eq 0 ] && ! dentro_de_horario; then
  log "Fuera de horario ($HORA_INICIO-$HORA_FIN, $ZONA_HORARIA): no se hace ping."
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  log "ERROR: curl no está instalado; no se puede hacer el ping."
  exit 0
fi

# En arranque/despertar la red puede tardar en volver: 3 intentos separados 10 s.
INTENTOS=1
[ "$SIEMPRE" -eq 1 ] && INTENTOS=3

for ((i = 1; i <= INTENTOS; i++)); do
  inicio=$SECONDS
  codigo=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 30 --max-time 90 "$URL_SALUD" 2>/dev/null)
  rc=$?
  seg=$((SECONDS - inicio))
  if [ "$rc" -eq 0 ] && [[ "$codigo" =~ ^2[0-9][0-9]$ ]]; then
    log "OK: $URL_SALUD respondió $codigo en ${seg}s."
    exit 0
  fi
  if [ "$rc" -ne 0 ]; then
    log "Sin respuesta (curl código $rc, ${seg}s), intento $i de $INTENTOS. ¿Sin internet?"
  else
    log "Respuesta inesperada $codigo en ${seg}s, intento $i de $INTENTOS."
  fi
  [ "$i" -lt "$INTENTOS" ] && sleep 10
done

log "AVISO: no se pudo despertar el backend en este intento (se reintenta en el próximo ciclo)."
exit 0
