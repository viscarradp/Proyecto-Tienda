# Configuración — Variables de Entorno

Copia el `.env.example` de cada app y completa los valores reales. Nunca
subas un `.env` real al repositorio (ya está en `.gitignore`).

## Backend (`erp-tienda-backend/.env`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión a PostgreSQL (Supabase u otro proveedor). |
| `JWT_SECRET` | Sí | Secreto para firmar/verificar JWT. El servidor **no arranca** sin esta variable. Usa un valor largo y aleatorio (`openssl rand -hex 32`). |
| `PORT` | No (default `3000`) | Puerto donde escucha el backend. |
| `INITIAL_ADMIN_PASSWORD` | No, pero recomendada | Contraseña del usuario `admin` que se crea automáticamente la primera vez que arranca con la tabla `usuarios` vacía. Si falta, **no se crea ningún admin** (ver [`../decisions/0003-admin-seed-por-env.md`](../decisions/0003-admin-seed-por-env.md)). |
| `CORS_ORIGINS` | No (default `http://localhost:3001`) | Orígenes permitidos por CORS, separados por coma. En producción debe apuntar al dominio real del frontend. |
| `NODE_ENV` | No | En `production`, desactiva Swagger (salvo que `ENABLE_SWAGGER=true`) y endurece la CSP de Helmet. |
| `ENABLE_SWAGGER` | No | Si es `"true"`, fuerza Swagger encendido aunque `NODE_ENV=production`. |

## Frontend (`erp-tienda-frontend/.env.local`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | No (default `http://localhost:3000`) | URL base del backend. Al llevar el prefijo `NEXT_PUBLIC_`, **se expone al navegador** — nunca poner un secreto en una variable con este prefijo. |

## Notas de despliegue

- El proyecto es agnóstico de proveedor: la base de datos puede vivir en
  Supabase (recomendado hoy) y el backend en cualquier servicio que corra
  Node.js (Render, un VM de GCP/AWS, etc.). Ninguna configuración está atada
  a un proveedor específico — todo pasa por estas variables de entorno.
- Si el backend y el frontend corren en dominios distintos, `CORS_ORIGINS`
  debe incluir el dominio exacto del frontend (con esquema, ej.
  `https://mi-tienda.vercel.app`), separado por coma si hay más de uno.
