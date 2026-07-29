/**
 * Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Extended Arabic-Indic (۰۱۲۳۴۵۶۷۸۹) digits are
 * what an Arabic keyboard produces, and neither is matched by \d. Every PIN
 * typed that way was silently discarded — the field simply stayed empty.
 *
 * Normalising at the edge means the rest of the app, and the database, only ever
 * see Western digits, so a PIN typed in Arabic and the same PIN typed in
 * Western numerals are the same secret.
 */
const ARABIC_INDIC = 0x0660; // ٠
const EXTENDED_ARABIC_INDIC = 0x06f0; // ۰

export function toWesternDigits(input) {
  if (typeof input !== 'string') return '';

  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0);

    if (code >= ARABIC_INDIC && code <= ARABIC_INDIC + 9) {
      out += String(code - ARABIC_INDIC);
    } else if (code >= EXTENDED_ARABIC_INDIC && code <= EXTENDED_ARABIC_INDIC + 9) {
      out += String(code - EXTENDED_ARABIC_INDIC);
    } else {
      out += char;
    }
  }
  return out;
}
