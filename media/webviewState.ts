import type { VSCodeApi } from '../src/shared';

export const WEBVIEW_STATE_VERSION = 1;

export interface WebviewState {
  version: typeof WEBVIEW_STATE_VERSION;
  sidebarWidth?: number;
}

export function readWebviewState(value: unknown): WebviewState {
  if (!isRecord(value)) return { version: WEBVIEW_STATE_VERSION };
  if (value.version !== undefined && value.version !== WEBVIEW_STATE_VERSION) {
    return { version: WEBVIEW_STATE_VERSION };
  }
  const sidebarWidth = finiteNumber(value.sidebarWidth);
  return {
    version: WEBVIEW_STATE_VERSION,
    ...(sidebarWidth === undefined ? {} : { sidebarWidth })
  };
}

export function updateWebviewState(
  vscode: VSCodeApi,
  patch: Partial<Omit<WebviewState, 'version'>>
): void {
  vscode.setState({
    ...readWebviewState(vscode.getState()),
    ...patch,
    version: WEBVIEW_STATE_VERSION
  });
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
