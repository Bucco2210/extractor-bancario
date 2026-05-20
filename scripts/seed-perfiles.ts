import { config as cargarEnv } from "dotenv";
cargarEnv({ path: ".env.local" });
cargarEnv({ path: ".env" });

import mongoose from "mongoose";
import { getEnv } from "../app/lib/env";
import { PerfilExtraccion } from "../app/models/PerfilExtraccion";
import { PERFILES_SEED } from "../app/lib/seeds/perfiles";
import { perfilCreateSchema } from "../app/lib/perfiles-schema";

type Conteo = {
  total: number;
  creados: number;
  actualizados: number;
  invalidos: Array<{ slug: string; errores: string[] }>;
};

/**
 * Upsertea los perfiles seed por slug. Idempotente: correrlo dos veces
 * no duplica nada, y los campos que ya estén en la base se sobrescriben
 * con el contenido del catálogo en código.
 */
export async function seedPerfiles(): Promise<Conteo> {
  const conteo: Conteo = {
    total: PERFILES_SEED.length,
    creados: 0,
    actualizados: 0,
    invalidos: [],
  };

  for (const candidato of PERFILES_SEED) {
    const parsed = perfilCreateSchema.safeParse(candidato);
    if (!parsed.success) {
      conteo.invalidos.push({
        slug: candidato.slug,
        errores: parsed.error.issues.map(
          (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
        ),
      });
      continue;
    }

    const previo = await PerfilExtraccion.findOne({ slug: parsed.data.slug })
      .select({ _id: 1 })
      .lean();

    await PerfilExtraccion.updateOne(
      { slug: parsed.data.slug },
      { $set: parsed.data },
      { upsert: true },
    );

    if (previo) conteo.actualizados += 1;
    else conteo.creados += 1;
  }

  return conteo;
}

async function main(): Promise<void> {
  const env = getEnv();
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });

  const conteo = await seedPerfiles();

  console.log("✓ Seed de perfiles terminado");
  console.log(`  total catálogo : ${conteo.total}`);
  console.log(`  creados        : ${conteo.creados}`);
  console.log(`  actualizados   : ${conteo.actualizados}`);
  if (conteo.invalidos.length > 0) {
    console.error(`  ✗ inválidos    : ${conteo.invalidos.length}`);
    for (const inv of conteo.invalidos) {
      console.error(`    - ${inv.slug}:`);
      for (const e of inv.errores) console.error(`        ${e}`);
    }
  }

  await mongoose.disconnect();
  if (conteo.invalidos.length > 0) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("✗ Seed de perfiles falló:", err);
    process.exit(1);
  });
}
