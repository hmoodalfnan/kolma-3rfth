const RISKY = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutralise CSV/Excel formula injection. Numbers stay numbers so Excel can
 * still total them; only strings that *begin* with a formula trigger are quoted.
 */
export function sanitizeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value;

  const str = String(value);
  return RISKY.includes(str[0]) ? `'${str}` : str;
}

export function sanitizeRow(row) {
  return row.map(sanitizeCell);
}
