import { NextResponse } from "next/server";

export type CodigoError =
  | "INPUT_INVALIDO"
  | "SIN_AUTH"
  | "SIN_PERMISO"
  | "NO_ENCONTRADO"
  | "NO_PROCESABLE"
  | "LIMITE_EXCEDIDO"
  | "INTERNO";

const STATUS: Record<CodigoError, number> = {
  INPUT_INVALIDO: 400,
  SIN_AUTH: 401,
  SIN_PERMISO: 403,
  NO_ENCONTRADO: 404,
  NO_PROCESABLE: 422,
  LIMITE_EXCEDIDO: 429,
  INTERNO: 500,
};

export class AppError extends Error {
  constructor(
    public codigo: CodigoError,
    message: string,
    public detalles?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function respuestaError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: err.codigo, mensaje: err.message, detalles: err.detalles ?? null },
      { status: STATUS[err.codigo] },
    );
  }
  const mensaje = err instanceof Error ? err.message : "Error desconocido";
  return NextResponse.json(
    { error: "INTERNO", mensaje, detalles: null },
    { status: 500 },
  );
}
