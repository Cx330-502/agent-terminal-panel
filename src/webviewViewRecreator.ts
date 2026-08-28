export interface RecreatableWebviewView {
  readonly viewType: string;
  readonly visible: boolean;
  readonly onDidChangeVisibility: (
    listener: () => void
  ) => { dispose(): void };
}

export type WebviewCommandRunner = (
  command: string,
  ...args: unknown[]
) => PromiseLike<unknown>;

interface WebviewViewRecreatorOptions {
  visibilityTimeoutMs?: number;
}

const DEFAULT_VISIBILITY_TIMEOUT_MS = 500;
const PRIMARY_SIDEBAR_TOGGLE_COMMAND = 'workbench.action.toggleSidebarVisibility';

/**
 * Forces VS Code to release and recreate the WebviewView's underlying iframe.
 * The generated `.open` command hides focused Panel and Auxiliary Bar views.
 * Primary Sidebar views only return focus to the editor, so they need the
 * sidebar visibility command before the view is opened again.
 */
export async function recreateWebviewView(
  view: RecreatableWebviewView,
  runCommand: WebviewCommandRunner,
  options: WebviewViewRecreatorOptions = {}
): Promise<boolean> {
  const timeoutMs = options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS;
  const focusCommand = `${view.viewType}.focus`;
  const openCommand = `${view.viewType}.open`;

  await runCommand(focusCommand);
  let hidden = await runAndObserveHidden(view, () => runCommand(openCommand), timeoutMs);
  if (!hidden) {
    hidden = await runAndObserveHidden(
      view,
      () => runCommand(PRIMARY_SIDEBAR_TOGGLE_COMMAND),
      timeoutMs
    );
  }
  if (!hidden) return false;

  await runCommand(openCommand, { preserveFocus: true });
  return true;
}

async function runAndObserveHidden(
  view: RecreatableWebviewView,
  action: () => PromiseLike<unknown>,
  timeoutMs: number
): Promise<boolean> {
  const visibility = observeHidden(view, timeoutMs);
  try {
    await action();
    return !view.visible || await visibility.result;
  } finally {
    visibility.dispose();
  }
}

function observeHidden(
  view: RecreatableWebviewView,
  timeoutMs: number
): { result: Promise<boolean>; dispose(): void } {
  let finish: (hidden: boolean) => void = () => undefined;
  let settled = false;
  const result = new Promise<boolean>((resolve) => {
    finish = (hidden) => {
      if (settled) return;
      settled = true;
      resolve(hidden);
    };
  });
  const listener = view.onDidChangeVisibility(() => {
    if (!view.visible) finish(true);
  });
  const timer = setTimeout(() => finish(false), timeoutMs);

  return {
    result,
    dispose() {
      listener.dispose();
      clearTimeout(timer);
      finish(false);
    }
  };
}
