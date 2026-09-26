export class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();
  readonly event = (listener: (value: T) => void) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(value: T): void { for (const listener of [...this.listeners]) listener(value); }
}

export class Uri {
  constructor(readonly value: string) {}
  static joinPath(base: Uri, ...parts: string[]): Uri {
    return new Uri([base.value, ...parts].join('/'));
  }
  with({ query }: { query: string }): Uri { return new Uri(`${this.value}?${query}`); }
  toString(): string { return this.value; }
}

export class FakeWebview {
  html = '';
  options = {};
  readonly cspSource = 'https://test.invalid';
  readonly incoming = new Emitter<unknown>();
  readonly onDidReceiveMessage = this.incoming.event;
  readonly messages: unknown[] = [];
  asWebviewUri(uri: Uri): Uri { return uri; }
  async postMessage(message: unknown): Promise<boolean> {
    this.messages.push(message);
    return true;
  }
}

export class FakeView {
  readonly viewType = 'agentTerminalPanel.terminalView';
  readonly webview = new FakeWebview();
  visible = true;
  readonly changed = new Emitter<void>();
  readonly disposed = new Emitter<void>();
  readonly onDidChangeVisibility = this.changed.event;
  readonly onDidDispose = this.disposed.event;
  show(): void { this.visible = true; this.changed.fire(); }
  dispose(): void { this.disposed.fire(); }
}

export class FakePanel {
  readonly webview = new FakeWebview();
  visible = true;
  active = true;
  viewColumn = 2;
  isDisposed = false;
  readonly changed = new Emitter<void>();
  readonly disposed = new Emitter<void>();
  readonly onDidChangeViewState = this.changed.event;
  readonly onDidDispose = this.disposed.event;
  reveal(column?: number): void {
    if (column !== undefined) this.viewColumn = column;
    this.visible = true;
    this.changed.fire();
  }
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.disposed.fire();
  }
}

export const panels: FakePanel[] = [];
export const commandCalls: string[] = [];
export const commands = {
  async executeCommand(command: string) { commandCalls.push(command); }
};
export const window = {
  createWebviewPanel() {
    const panel = new FakePanel();
    panels.push(panel);
    return panel;
  },
  createOutputChannel() {
    return { info() {}, warn() {}, error() {}, debug() {}, dispose() {} };
  }
};
export const env = { language: 'en' };
export const ViewColumn = { Active: -1 };
export const l10n = { t: (message: string) => message };
