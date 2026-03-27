export function renderTemplate(
  template: string,
  variables: Record<string, string | number | boolean | null | undefined>
): string {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key) => {
    const value = variables[key];
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  });
}
