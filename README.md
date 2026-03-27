# Extractor Bancario con IA

Extrae movimientos de extractos bancarios en PDF usando Claude (Anthropic).
Soporta: **Banco Provincia** y **Mercado Pago**.

## Requisitos
- Node.js instalado
- API key de Anthropic (https://console.anthropic.com)

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Crear archivo de configuración
cp .env.example .env

# 3. Editar .env y pegar tu API key de Anthropic
#    ANTHROPIC_API_KEY=sk-ant-...

# 4. Iniciar el servidor
npm start
```

## Uso

1. Abrí http://localhost:3000 en el navegador
2. Seleccioná el banco
3. Subí el PDF del extracto
4. Hacé clic en "Analizar con IA"
5. Copiá los resultados a Google Sheets con el botón "Copiar para Sheets"

## Agregar un banco nuevo

Editá `server.js` y agregá una entrada al objeto `BANCOS`:

```js
mi_banco: {
  nombre: "Mi Banco",
  prompt: `Extraé los movimientos de este extracto de Mi Banco.
  Devolvé SOLO un JSON: {"movimientos": [{"fecha": "DD/MM/YYYY", "descripcion": "...", 
  "referencia": null, "debito": null, "credito": 1234.56, "saldo": 9999.99}]}`
}
```

## Notas

- Solo funciona con PDFs **digitales** (texto seleccionable), no escaneados.
- El archivo `.env` con tu API key nunca se sube a internet (está en `.gitignore`).
- Costo estimado: ~$0.01-0.05 por extracto analizado.
