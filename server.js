require("dotenv").config();
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const BANCOS = {
  provincia: {
    nombre: "Banco Provincia",
    prompt: `Extraé los movimientos de este extracto bancario. Responde ÚNICAMENTE con un objeto JSON, sin explicaciones, sin markdown, sin bloques de código, sin texto antes ni después. Solo el JSON puro.
Estructura exacta:
{"cuenta":null,"periodo":null,"titular":null,"movimientos":[{"fecha":"DD/MM/YYYY","descripcion":"texto","referencia":null,"debito":1234.56,"credito":null,"saldo":9999.99}]}
- debito o credito: uno va con el monto y el otro en null
- Los montos son números sin símbolos ni puntos de miles
- Si no encontrás un campo usá null`
  },
  mercadopago: {
    nombre: "Mercado Pago",
    prompt: `Extraé los movimientos de este resumen de Mercado Pago. Responde ÚNICAMENTE con un objeto JSON, sin explicaciones, sin markdown, sin bloques de código, sin texto antes ni después. Solo el JSON puro.
Estructura exacta:
{"cuenta":null,"periodo":null,"titular":null,"movimientos":[{"fecha":"DD/MM/YYYY","descripcion":"texto","referencia":null,"debito":null,"credito":1234.56,"saldo":9999.99}]}
- debito = dinero que salió, credito = dinero que entró
- Los montos son números sin símbolos
- Si no encontrás un campo usá null`
  }
};

// Endpoint: info del PDF (cantidad de páginas)
app.post("/api/info-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo PDF" });

    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const totalPaginas = pdfDoc.getPageCount();

    // Generar bloques sugeridos de 8 páginas
    const BLOQUE = 8;
    const bloques = [];
    for (let i = 1; i <= totalPaginas; i += BLOQUE) {
      const fin = Math.min(i + BLOQUE - 1, totalPaginas);
      bloques.push({ desde: i, hasta: fin, label: `Páginas ${i} – ${fin}` });
    }

    res.json({ totalPaginas, bloques });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo leer el PDF: " + e.message });
  }
});

// Endpoint: extraer movimientos de un rango de páginas
app.post("/api/extraer", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo PDF" });

    const bancoId = req.body.banco;
    const desde = parseInt(req.body.desde) || 1;
    const hasta = parseInt(req.body.hasta) || 999;

    if (!BANCOS[bancoId]) return res.status(400).json({ error: "Banco no reconocido: " + bancoId });

    const banco = BANCOS[bancoId];
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.includes("aqui-va-tu-key")) {
      return res.status(500).json({ error: "API key no configurada." });
    }

    // Extraer solo las páginas del rango seleccionado
    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const totalPaginas = pdfDoc.getPageCount();
    const desdeReal = Math.max(1, desde);
    const hastaReal = Math.min(hasta, totalPaginas);

    const pdfNuevo = await PDFDocument.create();
    const indices = [];
    for (let i = desdeReal - 1; i < hastaReal; i++) indices.push(i);
    const paginas = await pdfNuevo.copyPages(pdfDoc, indices);
    paginas.forEach(p => pdfNuevo.addPage(p));
    const pdfBytes = await pdfNuevo.save();

    // Extraer texto del rango
    let textoPDF;
    try {
      const data = await pdfParse(Buffer.from(pdfBytes));
      textoPDF = data.text;
    } catch (e) {
      return res.status(422).json({ error: "No se pudo leer el texto del PDF." });
    }

    if (!textoPDF || textoPDF.trim().length < 20) {
      return res.status(422).json({ error: "No se encontró texto en las páginas seleccionadas. ¿Es un PDF escaneado?" });
    }

    console.log(`Procesando páginas ${desdeReal}-${hastaReal} (${textoPDF.length} caracteres)`);

    // Llamar a Claude
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 9000,
        messages: [{
          role: "user",
          content: `${banco.prompt}\n\n--- TEXTO DEL EXTRACTO (páginas ${desdeReal} a ${hastaReal}) ---\n${textoPDF}`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(502).json({ error: "Error de la API: " + (err.error?.message || response.statusText) });
    }

    const claudeData = await response.json();
    const textoRespuesta = claudeData.content.map(b => b.text || "").join("");
    const jsonLimpio = textoRespuesta.replace(/```json|```/g, "").trim();

    let datos;
    try {
      datos = JSON.parse(jsonLimpio);
    } catch (e) {
      console.error("Respuesta no parseable:", textoRespuesta.slice(0, 1000));
      return res.status(502).json({ error: "La IA devolvió una respuesta inesperada. Intentá de nuevo." });
    }

    res.json({
      banco: banco.nombre,
      bancoId,
      cuenta: datos.cuenta || null,
      periodo: datos.periodo || null,
      titular: datos.titular || null,
      movimientos: datos.movimientos || [],
      _meta: {
        paginasDesde: desdeReal,
        paginasHasta: hastaReal,
        totalPaginas,
        movimientosEncontrados: datos.movimientos?.length || 0
      }
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error interno: " + e.message });
  }
});

// Endpoint: lista de bancos
app.get("/api/bancos", (req, res) => {
  const lista = Object.entries(BANCOS).map(([id, b]) => ({ id, nombre: b.nombre }));
  res.json(lista);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✓ Extractor bancario corriendo en http://localhost:${PORT}`);
  console.log(`  Bancos configurados: ${Object.keys(BANCOS).join(", ")}`);
  console.log(`  API key: ${process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant") ? "OK ✓" : "⚠ No configurada"}\n`);
});