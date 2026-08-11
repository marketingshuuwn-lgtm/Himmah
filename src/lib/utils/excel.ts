import * as XLSX from "xlsx";

export function exportToExcel<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  sheetName = "Sheet1",
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export async function readExcelFile<T = Record<string, unknown>>(file: File): Promise<T[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  return XLSX.utils.sheet_to_json<T>(ws, { defval: "" });
}
