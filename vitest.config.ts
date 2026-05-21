import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      // Solo medimos código de negocio: lib + handlers + modelos.
      // UI components y rutas de Next.js (page.tsx, layout.tsx) están
      // fuera del scope de tests por decisión del proyecto.
      include: [
        "app/lib/**/*.ts",
        "app/api/**/route.ts",
        "app/models/**/*.ts",
      ],
      exclude: [
        "app/lib/inngest-funciones/**", // wrapper trivial sobre runner
        // Adaptadores delgados a libs externas (testearlos = testear
        // pino/mongoose/openai-sdk/pdfjs/exceljs/vercel-blob, no nuestra
        // lógica). Su correctness se valida indirectamente vía los
        // handlers que los usan.
        "app/lib/logger.ts",
        "app/lib/mongo.ts",
        "app/lib/blob.ts",
        "app/lib/pdf.ts",
        "app/lib/excel.ts",
        "app/lib/auth.ts", // configuración de Auth.js
        "app/lib/openai.ts", // wrapper sobre openai-sdk + chunking ya cubierto
        "app/lib/utils.ts", // cn() de shadcn
        "**/*.d.ts",
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 65,
        branches: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
      // `server-only` no resuelve en Node puro (es un marker de Next.js).
      // En tests lo aliaseamos a un stub vacío.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
