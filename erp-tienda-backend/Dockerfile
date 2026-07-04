FROM node:22-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY prisma ./prisma

# Instalar dependencias
RUN npm ci

# Copiar el resto del código
COPY . .

# Generar cliente de Prisma
RUN npm run build

# Exposer puerto
EXPOSE 3000

# Script de entrada: sincroniza el esquema con la BD y arranca en modo watch.
# --accept-data-loss evita que el comando quede esperando confirmación
# interactiva (el contenedor no tiene TTY) ante cambios de esquema.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run start:dev"]
