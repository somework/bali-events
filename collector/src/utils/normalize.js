export function normalizeName(value) {
  if (!value) {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}
