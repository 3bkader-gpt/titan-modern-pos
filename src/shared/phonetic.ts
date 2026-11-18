/**
 * Pure phonetic normalization and wildcard search utilities for M6 (Advanced Drug Finder).
 * Zero Electron dependencies so this module stays headless-pure.
 */

const ARABIC_DIGIT_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
};

export function normalizeDigitsForSearch(input: string): string {
  return String(input || '').replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGIT_MAP[d] ?? d);
}

/**
 * Generates a forgiving phonetic key for pharmaceutical brand names:
 * - PH -> F, CK -> K, OO/OU -> U, EE/EA -> I, C/K/Q -> K, G/J -> J
 * - Unifies leading vowel clusters (e.g. AU/O/A -> A so OJMANTYN & AGMENTIN match AUGMENTIN)
 * - Removes middle/trailing vowels [AEIOUY] after index 0
 * - Collapses consecutive duplicate characters
 * - Preserves digits and normalizes Arabic characters
 */
export function computePhoneticKey(text: string): string {
  const normalized = normalizeDigitsForSearch(text).trim();
  if (!normalized) return '';

  const tokens = normalized.match(/[a-zA-Z0-9\u0600-\u06FF]+/g);
  if (!tokens || tokens.length === 0) return '';

  const mapped: string[] = [];

  for (const rawToken of tokens) {
    if (/[a-zA-Z]/.test(rawToken)) {
      let t = rawToken.toUpperCase();
      t = t
        .replace(/PH/g, 'F')
        .replace(/CK/g, 'K')
        .replace(/OO|OU/g, 'U')
        .replace(/EE|EA/g, 'I')
        .replace(/[CKQ]/g, 'K')
        .replace(/[GJ]/g, 'J');

      // Collapse repeated chars before vowel trimming
      t = t.replace(/(.)\1+/g, '$1');

      // Unify leading vowel cluster to 'A' and strip non-leading vowels
      const hasLeadingVowel = /^[AEIOUY]/.test(t);
      const bodyWithoutLeadingVowels = t.replace(/^[AEIOUY]+/, '');
      const strippedRest = bodyWithoutLeadingVowels.replace(/[AEIOUY]/g, '');
      t = (hasLeadingVowel ? 'A' : '') + strippedRest;

      // Collapse consecutive duplicates created after vowel removal
      t = t.replace(/(.)\1+/g, '$1');
      if (t) mapped.push(t);
    } else if (/[\u0600-\u06FF]/.test(rawToken)) {
      const ar = rawToken
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي');
      if (ar) mapped.push(ar);
    } else {
      mapped.push(rawToken);
    }
  }

  return mapped.join(' ');
}

/**
 * Converts user wildcard expressions (e.g. AU*625 or *PAN*EXT*) into a SQL LIKE pattern using '\' as ESCAPE char.
 */
export function toWildcardSqlPattern(query: string): string {
  const clean = normalizeDigitsForSearch(query).trim();
  if (!clean) return '%';

  const collapsedStars = clean.replace(/\*+/g, '*');
  const escaped = collapsedStars.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '%');
  return escaped.endsWith('%') ? escaped : `${escaped}%`;
}
