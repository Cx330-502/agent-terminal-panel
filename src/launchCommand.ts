export interface LaunchSpec {
  command: string;
  args: string[];
}

export function resolveLaunchCommand(
  launchCommand: string,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env
): LaunchSpec {
  const commandLine = launchCommand.trim();
  if (!commandLine) throw new Error('Agent launch command is not configured');

  if (platform === 'win32') {
    return {
      command: environment.ComSpec?.trim() || environment.COMSPEC?.trim() || 'cmd.exe',
      args: ['/d', '/s', '/c', commandLine]
    };
  }

  return {
    command: environment.SHELL?.trim() || '/bin/sh',
    args: ['-lc', commandLine]
  };
}
