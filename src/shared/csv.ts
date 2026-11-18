/**
 * Pure delimited CSV/TSV parser and UTF-8-with-BOM CSV serializer for Module 7.
 * Zero Electron or browser DOM dependencies so this runs in both Node tests and renderer.
 */

export const UTF8_BOM = '\uFEFF';

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n\t;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes tabular headers & rows into RFC-4180 CSV prefixed with UTF-8 BOM (\uFEFF)
 * so Microsoft Excel on Windows renders Arabic headers & strings without mojibake.
 */
export function serializeToUtf8BomCsv(
  headers: string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>
): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCsvCell).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}

function detectDelimiter(sample: string): string {
  let commas = 0;
  let tabs = 0;
  let semis = 0;
  let inQuotes = false;

  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === '\r' || ch === '\n') break;
    if (ch === '\t') tabs++;
    else if (ch === ';') semis++;
    else if (ch === ',') commas++;
  }

  if (tabs > 0 && tabs >= commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

/**
 * Parses CSV/TSV/semicolon-separated sheet text (including BOM & quoted fields).
 */
export function parseDelimitedSheet(rawText: string): { headers: string[]; rows: string[][] } {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  if (!text.trim()) {
    return { headers: [], rows: [] };
  }

  const delimiter = detectDelimiter(text);
  const parsedRows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && next === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell !== '')) {
        parsedRows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some(cell => cell !== '')) {
    parsedRows.push(currentRow);
  }

  if (parsedRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parsedRows[0].map((h, idx) => h || `Column_${idx + 1}`);
  const rows = parsedRows.slice(1).map((row) =>
    headers.map((_, idx) => row[idx] ?? '')
  );

  return { headers, rows };
}
