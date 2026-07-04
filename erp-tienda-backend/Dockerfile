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

# Script de entrada: sincroniza BD, siembra datos opcionales, y arranca en modo watch
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run start:dev"]
