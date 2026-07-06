import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // '*.trycloudflare.com' habilita los túneles desechables de Cloudflare
  // para probar desde el celular en desarrollo (ver docs/operations si aplica).
  allowedDevOrigins: ['192.168.0.5', '*.trycloudflare.com'],
};

export default nextConfig;
