import "server-only";

export type PaginaTexto = {
  numero: number;
  texto: string;
};

export type ExtraccionPdf = {
  totalPaginas: number;
  paginas: PaginaTexto[];
  textoCompleto: string;
};

/**
 * Extrae texto de un PDF digital usando pdfjs-dist (legacy build, sin DOM).
 * No persiste el archivo: opera sobre el Buffer en memoria y lo descarta.
 */
export async function extraerTextoPdf(buffer: Buffer): Promise<ExtraccionPdf> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const paginas: PaginaTexto[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const texto = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    paginas.push({ numero: i, texto });
    page.cleanup();
  }
  await doc.destroy();
  return {
    totalPaginas: doc.numPages,
    paginas,
    textoCompleto: paginas.map((p) => p.texto).join("\n\n"),
  };
}

export function tieneTextoSuficiente(extraccion: ExtraccionPdf, min = 40): boolean {
  return extraccion.textoCompleto.length >= min;
}
