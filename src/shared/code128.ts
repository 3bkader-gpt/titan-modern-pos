/**
 * Pure TypeScript ISO/IEC 15417 Code-128 (Subset B) SVG generator.
 * Zero external runtime dependencies — safe for both Node verification & Electron renderer.
 */

export const CODE128_WIDTHS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

export interface Code128Encoded {
  text: string;
  codes: number[];
  checksum: number;
  widths: string;
  bars: Array<{ x: number; width: number }>;
  totalModules: number;
}

function widthsToPatternBits(widths: string): string {
  let out = '';
  for (let i = 0; i < widths.length; i++) {
    const count = Number(widths[i]);
    const bit = i % 2 === 0 ? '1' : '0';
    out += bit.repeat(count);
  }
  return out;
}

/**
 * Validate internal ISO/IEC 15417 width table integrity.
 */
export function validateCode128Table(): boolean {
  if (CODE128_WIDTHS.length !== 107) return false;
  const seen = new Set<string>();
  for (let idx = 0; idx < CODE128_WIDTHS.length; idx++) {
    const w = CODE128_WIDTHS[idx];
    if (seen.has(w)) return false;
    seen.add(w);
    const digits = w.split('').map(Number);
    const total = digits.reduce((a, b) => a + b, 0);
    const expectedTotal = idx === 106 ? 13 : 11;
    if (total !== expectedTotal) return false;
    const barParity = digits.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
    if (barParity % 2 !== 0) return false;
  }
  return true;
}

/**
 * Encode ASCII printable string (`charCode 32..126`) into Code-128 Subset B.
 */
export function encodeCode128B(rawText: string): Code128Encoded {
  const sanitized = String(rawText || '')
    .split('')
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c <= 126;
    })
    .join('');

  if (!sanitized) {
    throw new Error('Code-128 input must contain at least one printable ASCII character.');
  }

  const START_B = 104;
  const STOP = 106;
  const codes: number[] = [START_B];
  let weightedSum = START_B;

  for (let i = 0; i < sanitized.length; i++) {
    const val = sanitized.charCodeAt(i) - 32;
    codes.push(val);
    weightedSum += val * (i + 1);
  }

  const checksum = weightedSum % 103;
  codes.push(checksum);
  codes.push(STOP);

  const widths = codes.map((c) => CODE128_WIDTHS[c]).join('');
  const bars: Array<{ x: number; width: number }> = [];
  let cursor = 0;
  for (let i = 0; i < widths.length; i++) {
    const w = Number(widths[i]);
    if (i % 2 === 0) {
      bars.push({ x: cursor, width: w });
    }
    cursor += w;
  }

  return {
    text: sanitized,
    codes,
    checksum,
    widths: widthsToPatternBits(widths),
    bars,
    totalModules: cursor
  };
}

/**
 * Render crisp SVG markup for 203-DPI thermal barcode label printers.
 */
export function renderCode128SvgMarkup(
  text: string,
  opts?: { height?: number; quietZoneModules?: number; className?: string }
): string {
  const encoded = encodeCode128B(text);
  const quiet = opts?.quietZoneModules ?? 6;
  const height = opts?.height ?? 32;
  const viewWidth = encoded.totalModules + quiet * 2;
  const rects = encoded.bars
    .map((b) => `<rect x="${b.x + quiet}" y="0" width="${b.width}" height="${height}" fill="#000"/>`)
    .join('');
  const cls = opts?.className ? ` class="${opts.className}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${height}" shape-rendering="crispEdges" preserveAspectRatio="none"${cls}>${rects}</svg>`;
}
