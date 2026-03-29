# Documento Maestro de Arquitectura y Estado: ERP/POS Tienda de Colonia

## 1. Resumen Ejecutivo
* **Descripción General:** Desarrollo de un sistema ERP (Enterprise Resource Planning) y POS (Point of Sale) a la medida, diseñado para digitalizar y optimizar las operaciones comerciales de una tienda de colonia (negocio de abarrotes, productos de consumo diario como latas de atún, bebidas, etc.) en El Salvador.
* **Objetivo Principal:** Proveer a la madre del desarrollador (dueña de la tienda) y a sus ayudantes una herramienta robusta para eliminar descuadres de caja, automatizar el control de inventario mediante valoración FIFO, gestionar mermas y agilizar el cobro mediante lectores de código de barras.
* **Estado Actual:** El **Backend (v1.0) está 100% completado**, con seguridad implementada y listo para integración. El **Frontend se encuentra en fase inicial (maquetación)**, actualmente en un proceso de refactorización visual para lograr un layout de "ERP Profesional Responsivo" basado en referencias visuales exactas (estilo "Treinta").

## 2. Contexto del Proyecto
* **Problema que resuelve:** La gestión manual que propicia pérdida de trazabilidad en el inventario (mermas no registradas), descuadres en el flujo de efectivo (gaveta física) y falta de control sobre los márgenes de ganancia reales debido a la fluctuación de costos de adquisición.
* **Motivación:** Proyecto desarrollado por un estudiante de Ingeniería en Desarrollo de Software y Negocios Digitales con el fin de aportar valor tecnológico real y escalable a su negocio familiar.
* **Alcance Definido:**
  * Catálogo de productos (Categorías, Productos, Presentaciones).
  * Control de Caja (Apertura, Cierre, Ingresos, Egresos operativos, Retiros a bóveda).
  * Abastecimiento (Compras, ingreso de lotes de inventario).
  * Ventas (POS con descarga automatizada de lotes FIFO).
  * Control de Mermas (Ajustes de inventario con justificación).
  * Seguridad y Autenticación (JWT, RBAC para roles `ADMIN` y `CAJERO`).
* **Alcance NO Definido:** Módulos de Recursos Humanos, CRM complejo de clientes, cuentas por cobrar complejas a largo plazo o integración con pasarelas de pago electrónico (el enfoque actual es transaccional físico/efectivo).

## 3. Arquitectura y Diseño
* **Componentes Principales:**
  * **Backend (API REST):** Node.js con el framework **NestJS**.
  * **Base de Datos:** PostgreSQL alojada en Supabase, interactuando a través del ORM **Prisma**.
  * **Frontend (SPA/SSR):** **Next.js** (App Router) estilizado con **Tailwind CSS**.
  * **Capa UI Frontend:** **Shadcn** (basado en Radix UI, preset Nova/Geist) e iconos de **Lucide React**.
  * **Gestor de Estado (Cliente):** **Zustand** (actualmente para el manejo del carrito de compras).
* **Flujo de Funcionamiento (Backend):**
  Petición HTTP -> Global JWT Guard (Autenticación) -> Roles Guard (Autorización) -> Controlador -> Servicio (Lógica de negocio y `this.prisma.$transaction`) -> Adaptador `pg` -> PostgreSQL.
* **Decisiones de Diseño Clave:**
  * **Algoritmo FIFO Transaccional:** El sistema no descuenta productos de un "stock global", sino que consume lotes específicos ordenados por fecha de ingreso para garantizar que el "costo asumido" de cada venta sea contablemente exacto.
  * **Inmutabilidad Financiera:** Los registros de caja, ventas y ajustes no tienen endpoints de actualización (`UPDATE`) o borrado (`DELETE`). Los errores deben corregirse mediante movimientos compensatorios (auditoría estricta).
  * **Pivot a "Responsive ERP Layout":** Se abandonó la idea de una interfaz estrictamente móvil en favor de un diseño de escritorio de dos columnas (Sidebar de navegación + POS con panel derecho para el carrito), adaptable a pantallas pequeñas mediante "Bottom Sheets" y cajones deslables.

## 4. Historial y Evolución
1. **Modelado de Datos:** Diseño del esquema relacional y conexión exitosa a Supabase.
2. **Catálogo Base:** Implementación de CRUDs transaccionales para Categorías, Productos y Presentaciones.
3. **Bloqueo de Infraestructura Resuelto:** Solución a problemas de compatibilidad entre Node v25 y Prisma v7.5 mediante la inyección del driver nativo `pg` (`@prisma/adapter-pg`).
4. **Desarrollo Core Financiero:** Implementación de flujos de Compras (creación de lotes), Ventas (motor FIFO y matemáticas con `Prisma.Decimal`), Ajustes de Inventario (mermas) y Movimientos de Caja.
5. **Capa de Seguridad (Backend):** Implementación de `bcrypt`, JWT, guardias globales (Deny-by-Default), habilitación de CORS y auto-seeding de un superusuario (`admin`).
6. **Arranque de Frontend:** Inicialización de Next.js. Creación del contexto aislado (`GEMINI_FRONT.md`).
7. **Iteración de UI/UX:** Primera maquetación móvil rechazada por no cumplir expectativas premium. Se dictó un rediseño completo del Layout (`app/dashboard/layout.tsx`) y la página POS (`app/dashboard/pos/page.tsx`) basado en una captura de pantalla proporcionada por el usuario ("image_1.png").

## 5. Estado Actual
* **Qué funciona:** * Backend: API REST completa, segura, documentada funcionalmente (linter en 0 warnings) y testeada a nivel lógica de negocio.
  * Frontend: Setup inicial, ruteo básico con redirección de `/` a `/dashboard/pos`, integración de dependencias (Zustand, Shadcn).
* **Qué está incompleto:** La integración del frontend con los endpoints del backend. La autenticación en el cliente no existe aún. 
* **Bloqueos / Esperas Actuales:** Se está a la espera de que el usuario ejecute un prompt complejo en su CLI (Gemini CLI) destinado a refactorizar visualmente el panel derecho del carrito y la cuadrícula de productos en Next.js para igualar el estándar visual requerido.

## 6. Suposiciones y Limitaciones
* **Suposiciones:**
  * El lector de código de barras de la tienda operará emulando teclado (escribiendo el código y enviando la tecla `Enter`).
  * El hardware objetivo final en el mostrador será una Laptop/PC o una Tablet grande, dado el cambio a "Responsive ERP Layout".
  * El usuario (desarrollador) utiliza una herramienta CLI de IA para inyectar código; por ende, las instrucciones deben darse en formato de "Prompts encapsulados" listos para copiar y pegar.
* **Limitaciones:**
  * El backend actual no soporta devoluciones parciales de ventas de forma nativa automatizada (requeriría lógica inversa compleja sobre lotes consumidos).
  * No se han desarrollado endpoints analíticos agregados (estadísticas de ventas por mes, gráficos).

## 7. Decisiones Técnicas Relevantes
* **Aislamiento de Contexto de IA:** Creación de dos archivos (`GEMINI.md` para backend y `GEMINI_FRONT.md` para frontend). *Por qué:* Evita que la IA asistente mezcle dependencias o intente usar Prisma en componentes de React.
* **Auto-Seeding (`OnModuleInit`):** Se inyecta un usuario administrador si la tabla está vacía al arrancar el backend. *Por qué:* Previene el problema del "huevo y la gallina" al tener rutas bloqueadas globalmente por JWT.
* **`Prisma.Decimal` para moneda:** Obligatorio en todo el backend. *Por qué:* Evita pérdidas de precisión de punto flotante en cálculos de dinero (ej. `0.1 + 0.2`).
* **Desestructuración para Ocultar Passwords:** Uso de `const { password_hash, ...rest } = usuario` en el backend. *Por qué:* Asegura que los hashes jamás viajen al frontend, incluso por accidente.

## 8. Conocimiento Implícito
* **El Rol del Usuario:** El usuario es el "Director de Producto/Ingeniero Líder", quien toma decisiones de negocio y arquitectura.
* **El Rol de esta IA:** "Arquitecto Senior". Debe mantener el rigor técnico, exigir calidad (cero warnings, linting perfecto), auditar seguridad y proporcionar instrucciones exactas a la herramienta de codificación del usuario.
* **Naturaleza del Negocio:** Una "tienda de colonia" implica transacciones rápidas y volumen. La interfaz del POS debe minimizar los clics. Un botón grande de "Cobrar", uso de teclado para buscar, y confirmaciones rápidas son vitales.

## 9. Riesgos y Áreas de Incertidumbre
* **CORS en la Práctica:** Aunque el backend tiene CORS habilitado, las políticas exactas de envío de tokens (cookies vs headers) pueden generar rechazos en las primeras pruebas de integración.
* **Estado del Cliente (Zustand) vs. Server Components:** En Next.js App Router, mezclar estado global del cliente con componentes del servidor suele generar errores de hidratación. Existe incertidumbre sobre cómo el CLI de IA resolvió el montaje del carrito en el último prompt.
* **Manejo de Errores de Red:** Falta definir cómo el frontend mostrará visualmente (toasts/alertas) si una venta falla por falta de stock (el backend devolverá un HTTP 400 `BadRequestException`).

## 10. Próximos Pasos Recomendados
1. **Auditoría Visual del POS:** Revisar el reporte y la apariencia visual resultante del último prompt enviado a la CLI. Si la interfaz ya coincide con la referencia del usuario, congelar el diseño.
2. **Módulo de Autenticación Frontend:** Construir la página de Login (`/auth/login`), configurar el fetch al backend y establecer el mecanismo de persistencia del JWT.
3. **Consumo de Catálogo en el POS:** Reemplazar la data de prueba (hardcodeada) de las tarjetas de Shadcn por una llamada `fetch` (o `SWR`/`React Query`) a `GET /categorias` y `GET /productos`.
4. **Ejecución de la Venta (Checkout):** Programar el botón "Cobrar" para transformar el array de Zustand al formato DTO requerido por el backend (`POST /ventas`) y manejar la respuesta transaccional.

## 11. Instrucciones para Continuar el Proyecto
* **Asumir el Rol:** Eres el Arquitecto Senior.
* **Cómo retomar:** Lee detenidamente la respuesta o el error que proporcione el usuario tras ejecutar el último prompt de diseño (Refactorización del Panel Derecho y Layout).
* **Flujo de Acción:** 1. Analiza el reporte de la CLI del usuario.
  2. Identifica si cumple con la meta de diseño "ERP Profesional".
  3. Si falta, emite un parche (prompt corregido).
  4. Si es exitoso, redacta el siguiente prompt técnico para la fase de Autenticación/Integración (Paso 2 de la lista superior), referenciando explícitamente `GEMINI_FRONT.md`.
* **Regla estricta:** No escribas el código final directamente en el chat. Escribe el *prompt de instrucciones técnicas* que el usuario le pasará a su herramienta CLI, estructurado como a lo largo del proyecto histórico.