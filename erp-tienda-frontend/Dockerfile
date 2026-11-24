# Imagen de PRODUCCIÓN del frontend (Next.js). Para desarrollo usa Dockerfile.dev.
#
# NEXT_PUBLIC_API_URL se INCRUSTA en el bundle durante `next build`: hay que
# pasarla como build arg y reconstruir la imagen si cambia la URL del API.
# Cambiarla con `docker run -e` NO tiene efecto. No pongas secretos aquí.
#
#   docker build -t tienda-frontend:prod \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.mi-tienda.example.com \
#     ./erp-tienda-frontend
#   docker run --rm -p 3001:3001 tienda-frontend:prod

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static
COPY --chown=node:node --from=build /app/public ./public
USER node
EXPOSE 3001
CMD ["node", "server.js"]
