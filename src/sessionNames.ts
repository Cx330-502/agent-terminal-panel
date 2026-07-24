const AUTOMATIC_NAME = /^Agent ([1-9]\d*)$/u;

export function allocateAutomaticSessionName(
  existingNames: Iterable<string>,
  preferredName?: string
): string {
  const occupied = new Set<number>();
  for (const name of existingNames) {
    const index = automaticSessionIndex(name);
    if (index !== undefined) occupied.add(index);
  }

  const preferred = preferredName ? automaticSessionIndex(preferredName) : undefined;
  if (preferred !== undefined && !occupied.has(preferred)) return `Agent ${preferred}`;

  let index = 1;
  while (occupied.has(index)) index++;
  return `Agent ${index}`;
}

function automaticSessionIndex(name: string): number | undefined {
  const match = AUTOMATIC_NAME.exec(name.trim());
  if (!match?.[1]) return undefined;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? index : undefined;
}
