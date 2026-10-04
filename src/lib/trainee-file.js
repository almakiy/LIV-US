// Reads a trainee list from a CSV or (temporarily enabled) Excel .xlsx file. The type is detected from the
// content (an .xlsx is a ZIP archive starting with "PK"), not from the file name.
const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const MAX_ROWS = 5000;
const MAX_UNZIPPED = 60 * 1024 * 1024; // guard against zip bombs
class FileError extends Error {}

const isXlsx = (buf) => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10); // dates are read as UTC calendar days
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim();
    if (v.text != null) return String(v.text).trim();            // hyperlink cell
    if (v.result != null) return cellText(v.result);             // formula cell: use the computed value
    return '';
  }
  return String(v).trim();
}

async function readXlsx(buffer) {
  let total = 0;
  try {
    const zip = await JSZip.loadAsync(buffer);
    zip.forEach((_, f) => { total += (f._data && f._data.uncompressedSize) || 0; });
  } catch { throw new FileError('That file is not a valid Excel (.xlsx) workbook.'); }
  if (total > MAX_UNZIPPED) throw new FileError('The Excel file is too large once opened. Export it as CSV instead.');
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw new FileError('That file is not a valid Excel (.xlsx) workbook.'); }
  const ws = wb.worksheets[0];
  if (!ws) throw new FileError('The workbook has no sheets.');
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length > MAX_ROWS + 1) return;
    const vals = row.values; // 1-based
    rows.push(Array.from({ length: Math.max(0, vals.length - 1) }, (_, i) => cellText(vals[i + 1])));
  });
  if (rows.length < 2) throw new FileError('The first sheet has no data rows.');
  const seen = new Map();
  const headers = rows[0].map((h, i) => {
    let name = h || `column_${i + 1}`;
    const n = (seen.get(name) || 0) + 1; seen.set(name, n);
    return n > 1 ? `${name}_${n}` : name;
  });
  return rows.slice(1).filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
}

/** Returns { records, type }. Throws FileError with a user-facing message. */
async function parseTraineeFile(buffer, { allowXlsx = true } = {}) {
  if (isXlsx(buffer)) {
    if (!allowXlsx) throw new FileError('Excel files are not enabled. Save the sheet as CSV UTF-8 and upload that.');
    return { records: await readXlsx(buffer), type: 'xlsx' };
  }
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    throw new FileError('Old Excel 97-2003 (.xls) files are not supported. Save the file as .xlsx or CSV and try again.');
  }
  try {
    return { records: parse(buffer, { bom: true, columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, delimiter: [',', ';', '\t'] }), type: 'csv' };
  } catch (e) { throw new FileError(`Could not read the CSV: ${e.message}`); }
}

/** Excel template: ID and serial columns are text so Excel keeps leading zeros. */
async function sampleXlsx(header, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Trainees');
  ws.columns = header.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 4), style: { numFmt: '@' } }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE6D2' } };
  rows.forEach((r) => ws.addRow(r));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { parseTraineeFile, sampleXlsx, FileError, MAX_ROWS, isXlsx };
