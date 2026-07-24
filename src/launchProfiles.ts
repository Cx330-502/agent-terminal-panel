import type { LaunchProfileSnapshot } from './shared';

export function normalizeLaunchCommands(value: unknown): LaunchProfileSnapshot[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const commands = new Map<string, LaunchProfileSnapshot>();
  for (const [rawName, rawCommand] of Object.entries(value)) {
    const name = rawName.trim();
    const command = typeof rawCommand === 'string' ? rawCommand.trim() : '';
    if (!name || !command) continue;
    commands.set(name, { id: `command:${name}`, name, command });
  }
  return [...commands.values()];
}

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

export function mergeLaunchProfiles(
  commands: LaunchProfileSnapshot[],
  legacyProfiles: LaunchProfileSnapshot[]
): LaunchProfileSnapshot[] {
  const commandNames = new Set(commands.map((profile) => profile.name));
  return [
    ...commands,
    ...legacyProfiles.filter((profile) => !commandNames.has(profile.name))
  ];
}
