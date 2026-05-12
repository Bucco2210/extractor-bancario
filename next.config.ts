import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Paquetes Node-only que NO deben empaquetarse en el bundle del server.
  // Sobre todo pdfjs-dist: si Turbopack lo bundlea, el "fake worker" intenta
  // un import dinámico relativo (./pdf.worker.mjs) que ya no resuelve.
  serverExternalPackages: [
    "pdfjs-dist",
    "mongoose",
    "mongodb",
    "@auth/mongodb-adapter",
    "exceljs",
    "pino",
    "pino-pretty",
    "bcryptjs",
  ],
};

export default nextConfig;
