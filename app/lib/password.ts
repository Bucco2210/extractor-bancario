import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashearPassword(plain: string): Promise<string> {
  if (plain.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
  return bcrypt.hash(plain, ROUNDS);
}

export async function verificarPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}
