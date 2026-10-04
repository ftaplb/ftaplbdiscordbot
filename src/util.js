export class UserError extends Error {}

export function requireThat(condition, message) {
  if (!condition) throw new UserError(message);
}

export function number(value, min, max, label = 'Number') {
  requireThat(typeof value === 'string' && /^\d+$/.test(value), `${label} must be a whole number from ${min} to ${max}.`);
  const n = Number(value);
  requireThat(Number.isSafeInteger(n) && n >= min && n <= max, `${label} must be from ${min} to ${max}.`);
  return n;
}

export function snowflake(value) {
  const id = String(value ?? '').replace(/^<[@#](?:[!&])?(\d+)>$/, '$1');
  requireThat(/^\d{17,20}$/.test(id), 'Use a mention or a Discord ID.');
  return id;
}

export function text(value, max, label = 'Text') {
  const result = String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  requireThat(result.length > 0 && result.length <= max, `${label} must be 1–${max} characters.`);
  return result;
}

export function tokenize(input) {
  const tokens = [];
  const pattern = /"([^"\r\n]*)"|'([^'\r\n]*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(input))) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}

export function plain(value) {
  return String(value).replace(/[`*_~|\\<>]/g, '').replace(/@/g, '@\u200b');
}

export function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

export function errorLabel(error) {
  return `${error.name ?? 'Error'}${error.code ? ` (${error.code})` : ''}`;
}
