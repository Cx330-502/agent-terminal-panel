export function parseUriList(value: string): string[] {
  return value
    .split(/\r?\n/gu)
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith('#'));
}
