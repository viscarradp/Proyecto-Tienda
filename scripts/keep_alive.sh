#!/bin/bash
# ==============================================================================
# Render Keep-Alive Daemon
# Este script hace llamadas HTTP periódicas al endpoint de salud del ERP para
# evitar que el contenedor del plan gratuito de Render entre en estado de "hibernación".
#
# Uso: ./keep_alive.sh [URL_DEL_BACKEND] [INTERVALO_EN_SEGUNDOS]
# Ejemplo: ./keep_alive.sh https://mi-erp-backend.onrender.com/health 840
# ==============================================================================

# Variables por defecto
# Usamos un intervalo de 840 segundos (14 minutos) ya que Render apaga instancias
# después de 15 minutos de inactividad.
URL=${1:-"https://tu-backend.onrender.com/health"}
INTERVALO=${2:-840}

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Iniciando Render Keep-Alive Daemon..."
echo "Objetivo: $URL"
echo "Intervalo: $INTERVALO segundos (${INTERVALO}s)"
echo "--------------------------------------------------------"

while true; do
  TIMESTAMP=$(date +'%Y-%m-%d %H:%M:%S')
  
  # Requerir explícitamente wget o curl si queremos. Usamos curl, asegurando que devuelva un código.
  HTTP_STATUS=$(curl -o /dev/null -s -w "%{http_code}\n" "$URL")
  
  # Si el comando falló o curl no existe, la variable quedará vacía o nula. 
  # Le asignamos "000" para evitar el error de "expresión entera".
  HTTP_STATUS=${HTTP_STATUS:-000}
  
  # Se considera exitoso 200 (OK), 301 (Redirect) o 404 (Not Found).
  # Si da 404, significa que Render procesó la solicitud (ej. pusiste la URL de tu frontend 
  # en lugar de la del backend), pero lo importante es que el contenedor sigue despierto.
  if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 301 ] || [ "$HTTP_STATUS" -eq 404 ] 2>/dev/null; then
    echo "[$TIMESTAMP] OK - Petición exitosa al backend (Código: $HTTP_STATUS)"
  else
    echo "[$TIMESTAMP] WARN - Respuesta inesperada del backend o fallo de red (Código: $HTTP_STATUS)"
  fi
  
  # Espera antes del siguiente ping
  sleep "$INTERVALO"
done
