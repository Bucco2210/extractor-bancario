# CLAUDE.md - Extractor Bancario

## Descripcion del proyecto

Aplicacion web local para extraer movimientos de extractos bancarios en PDF usando la API de Claude (Anthropic). El usuario sube un PDF, selecciona un banco y un rango de paginas, y la IA devuelve los movimientos estructurados en formato tabla con opcion de exportar a CSV o copiar para Google Sheets.

## Stack tecnologico

- **Runtime:** Node.js
- **Backend:** Express.js (server.js)
- **Frontend:** HTML/CSS/JS vanilla (public/index.html) - SPA sin framework
- **PDF:** pdf-lib (manipulacion de paginas), pdf-parse (extraccion de texto)
- **IA:** API de Anthropic (Claude claude-sonnet-4-20250514, 9000 max tokens)
- **Config:** dotenv para variables de entorno

## Estructura del proyecto

```
extractor-bancario/
├── server.js              # Backend Express - API REST y logica de extraccion
├── public/
│   └── index.html         # Frontend completo (HTML + CSS inline + JS inline)
├── package.json           # Dependencias y scripts
├── .env                   # ANTHROPIC_API_KEY y PORT (no versionado)
├── gitignore              # Excluye node_modules, .env, *.pdf
└── README.md              # Documentacion de uso basica
```

## Arquitectura

### Backend (server.js - ~172 lineas)

Servidor Express con 3 endpoints:

| Endpoint | Metodo | Funcion |
|----------|--------|---------|
| `/api/bancos` | GET | Lista bancos configurados (`{id, nombre}[]`) |
| `/api/info-pdf` | POST | Recibe PDF, devuelve `{totalPaginas, bloques[]}` (bloques de 8 paginas) |
| `/api/extraer` | POST | Recibe PDF + banco + rango de paginas, extrae texto, llama a Claude, devuelve movimientos |

**Middleware:** CORS, express.json, express.static (sirve /public), multer (upload en memoria, 50MB max).

**Flujo de extraccion (`/api/extraer`):**
1. Recibe FormData (pdf, banco, desde, hasta)
2. Carga PDF con pdf-lib y extrae el rango de paginas solicitado
3. Parsea texto del rango con pdf-parse
4. Valida que haya texto suficiente (>20 chars, rechaza PDFs escaneados)
5. Envia texto + prompt del banco a la API de Anthropic
6. Parsea la respuesta JSON de Claude
7. Retorna `{banco, cuenta, periodo, titular, movimientos[], _meta}`

### Frontend (public/index.html - ~453 lineas)

SPA con CSS y JS embebido (sin archivos separados). Flujo en 3 pasos:

1. **Seleccion de banco** - Grid con bancos disponibles (fetch a /api/bancos)
2. **Subida de PDF** - Drag-and-drop o file input, luego selector de rango de paginas
3. **Extraccion** - Llama a /api/extraer, acumula movimientos de multiples bloques

**Exportacion:** Copiar como TSV (clipboard) o descargar CSV.

**Estado global (variables JS):** `selectedBank`, `uploadedFile`, `totalPaginas`, `selectedDesde`, `selectedHasta`, `movimientosAcumulados`, `bloquesExtraidos`, `metaInfo`.

## Configuracion de bancos

Los bancos se definen en el objeto `BANCOS` de server.js. Cada banco tiene:
- `nombre`: Nombre para mostrar
- `prompt`: Prompt especifico para Claude con instrucciones de extraccion

**Bancos actuales:**
- `provincia` - Banco Provincia (cuenta corriente / caja de ahorro)
- `mercadopago` - Mercado Pago (cuenta, tarjeta, transferencias)

**Para agregar un banco:** Agregar entrada al objeto `BANCOS` en server.js con nombre y prompt. El frontend lo detecta automaticamente via /api/bancos.

## Modelo de datos

```json
{
  "cuenta": "string | null",
  "periodo": "string | null",
  "titular": "string | null",
  "movimientos": [
    {
      "fecha": "DD/MM/YYYY",
      "descripcion": "string",
      "referencia": "string | null",
      "debito": "number | null",
      "credito": "number | null",
      "saldo": "number"
    }
  ]
}
```

Regla: en cada movimiento, `debito` o `credito` tiene valor y el otro es `null`.

## Comandos

```bash
npm install     # Instalar dependencias
npm start       # Iniciar servidor (node server.js)
npm run dev     # Iniciar con --watch (hot reload)
```

El servidor corre en `http://localhost:3000` (configurable via PORT en .env).

## Codigos de error HTTP

| Codigo | Significado |
|--------|-------------|
| 400 | Falta archivo PDF o banco no reconocido |
| 422 | PDF sin texto extraible (escaneado) o texto insuficiente |
| 500 | Error interno o API key no configurada |
| 502 | Error de la API de Anthropic o respuesta no parseable |

## Convenciones de codigo

- Lenguaje del codigo: variables y comentarios en espanol
- Locale: es-AR para formateo de numeros
- Sin framework frontend - todo vanilla JS
- Sin base de datos - sin persistencia, todo en memoria
- Archivos PDF nunca se guardan en disco (multer memoryStorage)
- La API key se valida en cada request de extraccion

## Limitaciones conocidas

- Solo PDFs digitales (texto seleccionable), no escaneados/OCR
- Bloques de 8 paginas recomendados para mejor precision de la IA
- Depende de que Claude devuelva JSON valido (puede fallar esporadicamente)
- Sin autenticacion de usuarios - pensado para uso local
- Sin tests automatizados
- Sin linting configurado

## Dependencias (6 paquetes)

| Paquete | Version | Uso |
|---------|---------|-----|
| express | 4.22.1 | Servidor web |
| cors | 2.8.6 | CORS |
| multer | 1.4.5-lts.2 | Upload de archivos |
| pdf-lib | 1.17.1 | Manipulacion de PDFs |
| pdf-parse | 1.1.4 | Extraccion de texto |
| dotenv | 16.6.1 | Variables de entorno |
