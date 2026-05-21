import { describe, it, expect, vi } from "vitest";

vi.mock("inngest/next", () => ({
  serve: vi.fn(() => ({
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
  })),
}));

vi.mock("../app/lib/inngest", () => ({ inngest: {} }));
vi.mock("../app/lib/inngest-funciones/procesar-extraccion", () => ({
  procesarExtraccionFn: { id: "mock-fn" },
}));

describe("/api/inngest route", () => {
  it("exporta GET/POST/PUT desde serve()", async () => {
    const mod = await import("../app/api/inngest/route");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
    expect(typeof mod.PUT).toBe("function");
  });
});
