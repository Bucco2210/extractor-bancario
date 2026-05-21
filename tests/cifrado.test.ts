import { describe, it, expect, beforeEach } from "vitest";
import {
  cifrar,
  descifrar,
  esCifrado,
  cifrarMovimiento,
  descifrarMovimiento,
  cifrarMovimientos,
  descifrarMovimientos,
  cifrarRegistroSegundaFuente,
  descifrarRegistroSegundaFuente,
  descifrarExtraccionLean,
  descifrarConciliacionLean,
  __resetCifradoCache,
} from "../app/lib/cifrado";
import { __resetEnvCache } from "../app/lib/env";

const CLAVE_TEST_A =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CLAVE_TEST_B =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

function configurarClave(hex: string): void {
  process.env.APP_ENCRYPTION_KEY = hex;
  __resetEnvCache();
  __resetCifradoCache();
}

describe("cifrado AES-256-GCM", () => {
  beforeEach(() => {
    configurarClave(CLAVE_TEST_A);
  });

  describe("cifrar / descifrar", () => {
    it("hace roundtrip de un string ASCII corto", () => {
      const original = "1234-5678-9012";
      const cifrado = cifrar(original);
      expect(cifrado).not.toBe(original);
      expect(esCifrado(cifrado!)).toBe(true);
      expect(descifrar(cifrado)).toBe(original);
    });

    it("hace roundtrip de un string con acentos y emojis", () => {
      const original = "Transferencia recibida — Pérez 💸";
      expect(descifrar(cifrar(original))).toBe(original);
    });

    it("hace roundtrip de strings largos (texto extenso)", () => {
      const original = "lorem ipsum ".repeat(500).trim();
      expect(descifrar(cifrar(original))).toBe(original);
    });

    it("dos cifrados del mismo plaintext dan ciphertexts distintos (IV aleatorio)", () => {
      const a = cifrar("hola");
      const b = cifrar("hola");
      expect(a).not.toBe(b);
      expect(descifrar(a)).toBe("hola");
      expect(descifrar(b)).toBe("hola");
    });

    it("es idempotente: cifrar un valor ya cifrado lo devuelve igual", () => {
      const cifradoUna = cifrar("dato");
      const cifradoDos = cifrar(cifradoUna);
      expect(cifradoDos).toBe(cifradoUna);
      expect(descifrar(cifradoDos)).toBe("dato");
    });

    it("descifrar pasa-through un plaintext sin prefijo (legacy)", () => {
      expect(descifrar("legacy-sin-cifrar")).toBe("legacy-sin-cifrar");
    });

    it("preserva null, undefined y string vacío en ambas direcciones", () => {
      expect(cifrar(null)).toBe(null);
      expect(cifrar(undefined)).toBe(undefined);
      expect(cifrar("")).toBe("");
      expect(descifrar(null)).toBe(null);
      expect(descifrar(undefined)).toBe(undefined);
      expect(descifrar("")).toBe("");
    });

    it("esCifrado discrimina correctamente", () => {
      expect(esCifrado(cifrar("x"))).toBe(true);
      expect(esCifrado("plaintext")).toBe(false);
      expect(esCifrado("")).toBe(false);
      expect(esCifrado(null)).toBe(false);
      expect(esCifrado(undefined)).toBe(false);
      expect(esCifrado(42 as unknown as string)).toBe(false);
    });

    it("detecta tampering: si alteran el tag, throw", () => {
      const c = cifrar("secreto bancario") as string;
      // enc:v1:<iv>:<tag>:<data> — alteramos el tag (parte [1] del split por ":")
      const sinPrefijo = c.slice("enc:v1:".length);
      const partes = sinPrefijo.split(":");
      const tagBuf = Buffer.from(partes[1]!, "base64");
      tagBuf[0] = tagBuf[0]! ^ 0xff; // flip primer byte del tag
      partes[1] = tagBuf.toString("base64");
      const corrupto = "enc:v1:" + partes.join(":");
      expect(() => descifrar(corrupto)).toThrow();
    });

    it("detecta tampering: si alteran los datos, throw", () => {
      const c = cifrar("otro dato sensible") as string;
      const sinPrefijo = c.slice("enc:v1:".length);
      const partes = sinPrefijo.split(":");
      const dataBuf = Buffer.from(partes[2]!, "base64");
      dataBuf[0] = dataBuf[0]! ^ 0xff;
      partes[2] = dataBuf.toString("base64");
      const corrupto = "enc:v1:" + partes.join(":");
      expect(() => descifrar(corrupto)).toThrow();
    });

    it("descifrar con clave distinta a la que cifró falla", () => {
      const c = cifrar("dato sensible");
      configurarClave(CLAVE_TEST_B);
      expect(() => descifrar(c)).toThrow();
    });

    it("ciphertext con formato malformado (partes != 3) tira error claro", () => {
      expect(() => descifrar("enc:v1:solo-dos:partes")).toThrow(
        /Formato de cifrado inválido/,
      );
    });
  });

  describe("helpers de movimientos", () => {
    it("cifra y descifra un movimiento conservando los campos numéricos", () => {
      const m = {
        fecha: "01/03/2026",
        descripcion: "Pago tarjeta",
        referencia: "REF-123",
        debito: 1500,
        credito: null,
        saldo: 25000,
      };
      const cifrado = cifrarMovimiento(m);
      expect(esCifrado(cifrado.descripcion!)).toBe(true);
      expect(esCifrado(cifrado.referencia!)).toBe(true);
      expect(cifrado.fecha).toBe(m.fecha);
      expect(cifrado.debito).toBe(m.debito);
      expect(cifrado.saldo).toBe(m.saldo);

      const desc = descifrarMovimiento(cifrado);
      expect(desc).toEqual(m);
    });

    it("preserva referencia null", () => {
      const m = {
        fecha: "x",
        descripcion: "abc",
        referencia: null,
        debito: null,
        credito: null,
        saldo: null,
      };
      const r = descifrarMovimiento(cifrarMovimiento(m));
      expect(r.referencia).toBe(null);
      expect(r.descripcion).toBe("abc");
    });

    it("cifrarMovimientos / descifrarMovimientos hacen roundtrip de un array", () => {
      const arr = [
        { fecha: "a", descripcion: "uno", referencia: "r1", debito: 1, credito: null, saldo: 10 },
        { fecha: "b", descripcion: "dos", referencia: null, debito: null, credito: 2, saldo: 12 },
      ];
      expect(descifrarMovimientos(cifrarMovimientos(arr))).toEqual(arr);
    });
  });

  describe("helpers de registros de segunda fuente", () => {
    it("hace roundtrip de un registro", () => {
      const r = {
        idx: 0,
        fecha: "01/01/2026",
        descripcion: "Cobro factura 42",
        monto: 9999.5,
        referencia: "FACT-42",
      };
      const c = cifrarRegistroSegundaFuente(r);
      expect(esCifrado(c.descripcion!)).toBe(true);
      expect(esCifrado(c.referencia!)).toBe(true);
      expect(c.monto).toBe(r.monto);
      expect(descifrarRegistroSegundaFuente(c)).toEqual(r);
    });

    it("descripcion vacía permanece vacía (no se cifra)", () => {
      const r = {
        idx: 0,
        fecha: null,
        descripcion: "",
        monto: null,
        referencia: null,
      };
      const c = cifrarRegistroSegundaFuente(r);
      expect(c.descripcion).toBe("");
      expect(descifrarRegistroSegundaFuente(c).descripcion).toBe("");
    });
  });

  describe("descifrarExtraccionLean", () => {
    it("descifra cuenta, titular y movimientos in-place", () => {
      const doc = {
        cuenta: cifrar("0001-2345"),
        titular: cifrar("Juan Pérez"),
        movimientos: cifrarMovimientos([
          { fecha: "x", descripcion: "abc", referencia: "r", debito: null, credito: null, saldo: null },
        ]),
        banco: "galicia",
      };
      const r = descifrarExtraccionLean(doc);
      expect(r.cuenta).toBe("0001-2345");
      expect(r.titular).toBe("Juan Pérez");
      expect(r.movimientos![0]!.descripcion).toBe("abc");
      expect(r.banco).toBe("galicia");
    });

    it("acepta null y campos faltantes", () => {
      expect(descifrarExtraccionLean(null)).toBe(null);
      const parcial = { banco: "x" };
      expect(descifrarExtraccionLean(parcial)).toEqual({ banco: "x" });
    });

    it("es seguro si ya está descifrado (idempotente)", () => {
      const doc = {
        cuenta: "1234",
        titular: "Ana",
        movimientos: [
          { fecha: "x", descripcion: "abc", referencia: "r", debito: null, credito: null, saldo: null },
        ],
      };
      expect(descifrarExtraccionLean({ ...doc, movimientos: [...doc.movimientos] }))
        .toEqual(doc);
    });
  });

  describe("descifrarConciliacionLean", () => {
    it("descifra registros de segundaFuente", () => {
      const doc = {
        nombre: "test",
        segundaFuente: {
          archivoNombre: "f.csv",
          registros: [
            cifrarRegistroSegundaFuente({
              idx: 0,
              fecha: "x",
              descripcion: "cobro",
              monto: 100,
              referencia: "r1",
            }),
          ],
        },
      };
      const r = descifrarConciliacionLean(doc);
      expect(r.segundaFuente!.registros![0]!.descripcion).toBe("cobro");
      expect(r.segundaFuente!.registros![0]!.referencia).toBe("r1");
    });

    it("acepta null y conciliacion sin segundaFuente", () => {
      expect(descifrarConciliacionLean(null)).toBe(null);
      expect(descifrarConciliacionLean({ nombre: "x" })).toEqual({ nombre: "x" });
    });
  });
});
