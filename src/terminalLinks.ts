export interface TerminalLinkContext {
  remoteName: string | undefined;
  useWindowsBrowser: boolean;
  openClient(url: string): PromiseLike<boolean>;
  openWorkspace(url: string): PromiseLike<void>;
}

/** Only user-clicked web URLs cross this Webview/host boundary. */
export async function openTerminalLink(value: string, context: TerminalLinkContext): Promise<void> {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/u.test(value)) {
    throw new Error('Invalid web link');
  }
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS links are supported');
  }
  if (context.remoteName === 'wsl' && !context.useWindowsBrowser) {
    await context.openWorkspace(url.href);
  } else if (!(await context.openClient(url.href))) {
    throw new Error('VS Code could not open the web link');
  }
}
