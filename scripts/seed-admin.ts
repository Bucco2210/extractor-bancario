import { config as cargarEnv } from "dotenv";
cargarEnv({ path: ".env.local" });
cargarEnv({ path: ".env" });

import mongoose from "mongoose";
import { getEnv } from "../app/lib/env";
import { hashearPassword } from "../app/lib/password";
import { Usuario } from "../app/models/Usuario";

async function main(): Promise<void> {
  const env = getEnv();
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });

  const passwordHash = await hashearPassword(env.ADMIN_SEED_PASSWORD);
  const res = await Usuario.findOneAndUpdate(
    { email: env.ADMIN_SEED_EMAIL.toLowerCase() },
    {
      $set: {
        email: env.ADMIN_SEED_EMAIL.toLowerCase(),
        nombre: env.ADMIN_SEED_NOMBRE,
        rol: "admin",
        passwordHash,
        activo: true,
      },
    },
    { upsert: true, new: true },
  );

  console.log("✓ Usuario admin listo:", {
    email: res.email,
    nombre: res.nombre,
    rol: res.rol,
    id: String(res._id),
  });
  console.log("Contraseña (de .env):", env.ADMIN_SEED_PASSWORD);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("✗ Seed falló:", err);
  process.exit(1);
});
