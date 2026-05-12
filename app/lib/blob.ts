import { randomUUID } from "node:crypto";
import { getEnv } from "./env";

export type BlobReferencia = {
  key: string;
  url: string;
  size: number;
  contentType: string;
};

export interface BlobStorage {
  subir(params: {
    nombre: string;
    contentType: string;
    data: Buffer;
  }): Promise<BlobReferencia>;
  descargar(key: string): Promise<Buffer>;
  eliminar(key: string): Promise<void>;
}

class MemoryBlobStorage implements BlobStorage {
  private store = new Map<string, { data: Buffer; contentType: string; nombre: string }>();

  async subir(params: {
    nombre: string;
    contentType: string;
    data: Buffer;
  }): Promise<BlobReferencia> {
    const key = `${randomUUID()}-${params.nombre}`;
    this.store.set(key, {
      data: params.data,
      contentType: params.contentType,
      nombre: params.nombre,
    });
    return {
      key,
      url: `memory://${key}`,
      size: params.data.byteLength,
      contentType: params.contentType,
    };
  }

  async descargar(key: string): Promise<Buffer> {
    const item = this.store.get(key);
    if (!item) throw new Error(`Blob no encontrado: ${key}`);
    return item.data;
  }

  async eliminar(key: string): Promise<void> {
    this.store.delete(key);
  }
}

const globalForBlob = globalThis as unknown as { __blobStorage?: BlobStorage };
const memoryStorage = globalForBlob.__blobStorage ?? new MemoryBlobStorage();
if (!globalForBlob.__blobStorage) globalForBlob.__blobStorage = memoryStorage;

export function getBlobStorage(): BlobStorage {
  const env = getEnv();
  if (env.BLOB_READ_WRITE_TOKEN) {
    // TODO(fase posterior): devolver implementación de Vercel Blob cuando esté el token.
    return memoryStorage;
  }
  return memoryStorage;
}
