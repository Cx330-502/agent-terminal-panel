export interface TerminalEnvironmentOptions {
  imagesEnabled: boolean;
  vscodeVersion: string;
}

export function buildTerminalEnvironment(
  base: NodeJS.ProcessEnv,
  extra: Record<string, string>,
  options: TerminalEnvironmentOptions
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) environment[key] = value;
  }
  Object.assign(environment, extra, {
    TERM: options.imagesEnabled ? 'xterm-sixel' : 'xterm-256color',
    COLORTERM: 'truecolor'
  });

  if (options.imagesEnabled) {
    delete environment.TERM_PROGRAM;
    delete environment.TERM_PROGRAM_VERSION;
  } else {
    environment.TERM_PROGRAM = 'vscode';
    environment.TERM_PROGRAM_VERSION = options.vscodeVersion;
  }
  return environment;
}
