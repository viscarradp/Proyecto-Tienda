# erp-tienda-frontend

Interfaz del ERP de la tienda: Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui y Zustand. La guía general
está en el [README de la raíz](../README.md) y en [`../docs/`](../docs/README.md).

> **Next 16 no es el Next que conoces** (por ejemplo, `middleware.ts` ahora es `proxy.ts`). Antes de tocar código, lee
> [`AGENTS.md`](AGENTS.md) y la guía correspondiente en `node_modules/next/dist/docs/`.

## Comandos

```bash
npm install
npm run dev      # http://localhost:3001 (el backend corre en el 3000)
npm run lint
npm run build
```

Configuración: copia `.env.example` a `.env.local` y ajusta `NEXT_PUBLIC_API_URL` (se incrusta al construir). Para
probar desde el celular en la misma red, ver "Probar desde el celular" en el [README de la raíz](../README.md).

## Estructura

```text
app/auth/login/              Login
app/dashboard/
├── stats/                   Mi negocio (pantalla de entrada de la dueña)
├── pos/                     Vender (pantalla de entrada de la cajera)
├── inventario/              Inventario
├── gastos/                  Gastos y deudas
├── movimientos/             Ventas y turnos
└── usuarios/                Usuarios
components/                  Componentes por pantalla y ui/ (shadcn)
lib/glosario.ts              Nombres que ve la tienda ("Gaveta", "Bóveda", menú): úsalos en todo texto de pantalla
lib/navigation.ts            Menú y pantalla de entrada por rol
lib/api.ts                   Cliente del backend
src/store/                   Estado con Zustand (carrito, inventario)
proxy.ts                     Protege /dashboard (sesión presente y vigente)
```

No hay tests automáticos del frontend; se verifica con lint, build y en el navegador.
