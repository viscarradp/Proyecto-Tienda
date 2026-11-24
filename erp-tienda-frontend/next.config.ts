import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida (server.js + solo las dependencias que usa) para la
  // imagen de producción; no afecta a `next dev`. Ver docs/decisions/0010.
  output: 'standalone',
  // '*.trycloudflare.com' habilita los túneles desechables de Cloudflare
  // para probar desde el celular en desarrollo (ver docs/operations si aplica).
  allowedDevOrigins: ['192.168.0.5', '*.trycloudflare.com'],
};

export default nextConfig;
