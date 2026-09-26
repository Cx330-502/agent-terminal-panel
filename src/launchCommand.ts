export interface LaunchSpec {
  command: string;
  args: string[];
}

export interface ShellLaunchConfig {
  path: string;
  args: string[];
}

export function resolveLaunchCommand(
  launchCommand: string,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  shell: ShellLaunchConfig = { path: '', args: [] }
): LaunchSpec {
  const commandLine = launchCommand.trim();
  if (!commandLine) throw new Error('Agent launch command is not configured');

  const command = shell.path.trim() || (platform === 'win32'
    ? environment.ComSpec?.trim() || environment.COMSPEC?.trim() || 'cmd.exe'
    : environment.SHELL?.trim() || '/bin/sh');
  const args = shell.args.length ? shell.args : defaultShellArgs(command);

  return {
    command,
    args: [...args, commandLine]
  };
}

function defaultShellArgs(command: string): string[] {
  const name = command.split(/[\\/]/u).pop()!.toLowerCase().replace(/\.exe$/u, '');
  if (name === 'cmd') return ['/d', '/s', '/c'];
  if (name === 'powershell' || name === 'pwsh') return ['-NoLogo', '-Command'];
  return ['-ic'];
}
