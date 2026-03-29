# Contexto del Proyecto: ERP Tienda (Frontend)

## 1. El Proyecto
Estamos construyendo el frontend de un sistema POS y ERP (mobile-first) para un negocio minorista/puesto de mercado en El Salvador. La prioridad absoluta es la **velocidad de uso en pantallas táctiles**, claridad visual y cero distracciones.

## 2. Stack Tecnológico Estricto
- **Framework:** Next.js (App Router obligatorio).
- **Estilos:** Tailwind CSS.
- **Componentes UI:** Shadcn (Radix) + Lucide React (íconos).
- **Manejo de Estado:** Zustand (para el carrito de compras y estados globales).
- **Llamadas a la API:** Fetch API nativo de Next.js o SWR (evitar Axios a menos que sea estrictamente necesario).

## 3. Reglas de Arquitectura
- **Mobile-First:** Todas las vistas deben estar pensadas primero para pantallas móviles/tablets. Usar barras inferiores (Bottom Navigation) y Bottom Sheets para acciones principales. En escritorio, se adaptarán a Sidebars.
- **Componentes Limpios:** Separar la lógica de estado (Zustand) de la capa visual.
- **Rutas:** Usar la estructura de carpetas de App Router (`app/dashboard/...`, `app/auth/...`).