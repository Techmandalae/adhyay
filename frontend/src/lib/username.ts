export function sanitizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function generateUsername(fullName: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map((part) => sanitizeUsername(part))
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 12);
  }

  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  return sanitizeUsername(`${first}${last}`).slice(0, 16);
}

export function buildUsernameSuggestions(baseUsername: string, count = 3) {
  const base = sanitizeUsername(baseUsername);
  if (!base) {
    return [];
  }

  return Array.from({ length: count }, (_value, index) => `${base}${index + 1}`);
}
