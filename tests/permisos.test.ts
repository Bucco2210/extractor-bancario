import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock("../app/lib/auth", () => ({
  auth: mockAuth,
}));

import { requerirSesion, requerirRol } from "../app/lib/permisos";
import { AppError } from "../app/lib/errors";

describe("requerirSesion", () => {
  beforeEach(() => mockAuth.mockReset());

  it("devuelve la sesión cuando hay user.id", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", rol: "operador", email: "a@b.com" },
    });
    const s = await requerirSesion();
    expect(s.user.id).toBe("u1");
    expect(s.user.rol).toBe("operador");
  });

  it("tira SIN_AUTH cuando no hay sesión", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requerirSesion()).rejects.toMatchObject({
      codigo: "SIN_AUTH",
    });
  });

  it("tira SIN_AUTH cuando hay sesión pero sin user.id", async () => {
    mockAuth.mockResolvedValue({ user: { email: "x@y.com" } });
    await expect(requerirSesion()).rejects.toBeInstanceOf(AppError);
  });
});

describe("requerirRol", () => {
  beforeEach(() => mockAuth.mockReset());

  it("admin pasa cuando rol=admin", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", rol: "admin", email: "a@b.com" },
    });
    const s = await requerirRol("admin");
    expect(s.user.rol).toBe("admin");
  });

  it("admin falla con SIN_PERMISO cuando rol=operador", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", rol: "operador", email: "a@b.com" },
    });
    await expect(requerirRol("admin")).rejects.toMatchObject({
      codigo: "SIN_PERMISO",
    });
  });

  it("operador siempre pasa (rol mínimo)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", rol: "operador", email: "a@b.com" },
    });
    const s = await requerirRol("operador");
    expect(s.user.id).toBe("u1");
  });

  it("operador pasa también si user.rol=admin", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", rol: "admin", email: "a@b.com" },
    });
    const s = await requerirRol("operador");
    expect(s.user.id).toBe("u1");
  });

  it("propaga SIN_AUTH cuando no hay sesión", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requerirRol("admin")).rejects.toMatchObject({
      codigo: "SIN_AUTH",
    });
  });
});
