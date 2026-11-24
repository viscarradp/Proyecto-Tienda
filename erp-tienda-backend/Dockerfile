# Imagen de PRODUCCIÓN del backend (NestJS). Para desarrollo usa Dockerfile.dev.
# Esta imagen NO toca el esquema de la base de datos: ningún `db push` ni
# migración al arrancar (ver docs/decisions/0002 y 0010).
#
#   docker build -t tienda-backend:prod ./erp-tienda-backend
#   docker run --rm -p 3000:3000 --env-file .env tienda-backend:prod

# --- 1. Compilar (con devDependencies: Nest CLI, TypeScript, Prisma CLI) ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
COPY . .
# `npm run build` = prisma generate + nest build (salida: dist/src/main.js).
RUN npm run build

# --- 2. Solo dependencias de producción + cliente Prisma generado ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# --- 3. Imagen final ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
# Cloud Run inyecta PORT; el valor por defecto de la app es 3000.
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
