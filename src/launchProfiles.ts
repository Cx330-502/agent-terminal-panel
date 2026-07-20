import type { LaunchProfileSnapshot } from './shared';

export function normalizeLaunchProfiles(value: unknown): LaunchProfileSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Record<string, unknown>;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const command = typeof candidate.command === 'string' ? candidate.command.trim() : '';
    return name && command ? [{ id: `profile-${index}`, name, command }] : [];
  });
}
