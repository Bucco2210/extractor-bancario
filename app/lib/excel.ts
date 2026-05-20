import ExcelJS from "exceljs";
import type { MovimientoExtraido } from "./openai";

export type DatosExportacion = {
  banco?: string | null;
  cuenta?: string | null;
  periodo?: string | null;
  titular?: string | null;
  movimientos: MovimientoExtraido[];
};

const FORMATO_IMPORTE = '#,##0.00;[Red]-#,##0.00';

export async function exportarMovimientosExcel(
  datos: DatosExportacion,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "B&B Tech";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Movimientos", {
    properties: { defaultRowHeight: 18 },
  });

  let fila = 1;
  if (datos.banco) sheet.getCell(`A${fila++}`).value = `Banco/entidad: ${datos.banco}`;
  if (datos.cuenta) sheet.getCell(`A${fila++}`).value = `Cuenta: ${datos.cuenta}`;
  if (datos.periodo) sheet.getCell(`A${fila++}`).value = `Período: ${datos.periodo}`;
  if (datos.titular) sheet.getCell(`A${fila++}`).value = `Titular: ${datos.titular}`;
  if (fila > 1) fila++;

  const filaHeader = fila;
  sheet.getRow(filaHeader).values = [
    "Fecha",
    "Descripción",
    "Referencia",
    "Débito",
    "Crédito",
    "Saldo",
  ];
  sheet.getRow(filaHeader).font = { bold: true };
  sheet.getRow(filaHeader).alignment = { vertical: "middle" };

  datos.movimientos.forEach((m, idx) => {
    const r = sheet.getRow(filaHeader + 1 + idx);
    r.values = [
      m.fecha,
      m.descripcion,
      m.referencia ?? "",
      m.debito,
      m.credito,
      m.saldo,
    ];
    r.getCell(4).numFmt = FORMATO_IMPORTE;
    r.getCell(5).numFmt = FORMATO_IMPORTE;
    r.getCell(6).numFmt = FORMATO_IMPORTE;
  });

  sheet.columns = [
    { width: 12 },
    { width: 50 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
