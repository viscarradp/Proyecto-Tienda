FROM node:22-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar el resto del código
COPY . .

# Exposer puerto
EXPOSE 3001

# Arrancar Next.js en modo desarrollo
CMD ["npm", "run", "dev"]
