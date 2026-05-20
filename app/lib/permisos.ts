import { auth } from "./auth";
import { AppError } from "./errors";
import type { RolUsuario } from "@/models/Usuario";

export type SesionRequerida = {
  user: {
    id: string;
    rol: RolUsuario;
    email?: string | null;
    name?: string | null;
  };
};

export async function requerirSesion(): Promise<SesionRequerida> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AppError("SIN_AUTH", "Debés iniciar sesión.");
  }
  return session as SesionRequerida;
}

export async function requerirRol(
  rolMin: RolUsuario,
): Promise<SesionRequerida> {
  const session = await requerirSesion();
  if (rolMin === "admin" && session.user.rol !== "admin") {
    throw new AppError(
      "SIN_PERMISO",
      "Esta acción requiere rol admin.",
    );
  }
  return session;
}
