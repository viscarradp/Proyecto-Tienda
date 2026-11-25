import type { NextConfig } from "next";
import os from "node:os";

// Orígenes que pueden abrir el servidor de desarrollo (`next dev`): las IPv4 de
// esta máquina (para entrar desde el celular por la IP de la laptop), los
// túneles desechables de Cloudflare y los extras de DEV_ORIGINS (separados por
// coma; útil dentro de Docker, donde la IP del contenedor no es la de la laptop).
const ipsLocales = Object.values(os.networkInterfaces())
  .flatMap((interfaces) => interfaces ?? [])
  .filter((i) => i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

const origenesExtra = (process.env.DEV_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Salida autocontenida (server.js + solo las dependencias que usa) para la
  // imagen de producción; no afecta a `next dev`. Ver docs/decisions/0010.
  output: 'standalone',
  // '*.trycloudflare.com' habilita los túneles desechables de Cloudflare
  // para probar desde el celular en desarrollo (ver docs/operations si aplica).
  allowedDevOrigins: [...ipsLocales, '*.trycloudflare.com', ...origenesExtra],
};

export default nextConfig;
