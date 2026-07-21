import { FitAddon } from '@xterm/addon-fit';
import { ImageAddon } from '@xterm/addon-image';
import {
  SearchAddon,
  type ISearchOptions,
  type ISearchResultChangeEvent
} from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import type {
  SessionSnapshot,
  TerminalSettings,
  VSCodeApi,
  WebviewMessage
} from '../src/shared';
import { ScrollRegionScrollbackCompat } from './scrollbackCompat';
import { SelectionAutoScroll } from './selectionAutoScroll';
import { searchDecorations } from './searchTheme';
import { StatusDetector } from './statusDetector';
import { applyTerminalSettings } from './theme';

interface TerminalEntry {
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  element: HTMLElement;
  detector: StatusDetector;
  scrollbackCompat: ScrollRegionScrollbackCompat;
  selectionAutoScroll: SelectionAutoScroll;
  webglAddon?: WebglAddon;
  webglCanvas?: HTMLCanvasElement;
  webglContextLossListener?: EventListener;
  imageAddon?: ImageAddon;
  pendingOutput: string[];
  outputTimer?: number;
  settleTimer?: number;
  signalTimer?: number;
  replaying: boolean;
}

// Match VS Code's short PTY batching window so a TUI frame and its Sixel overlay paint together.
const OUTPUT_BATCH_DELAY_MS = 5;

export class TerminalController {
  private readonly entries = new Map<string, TerminalEntry>();
  private readonly pendingPastes = new Map<string, string>();
  private readonly resizeObserver: ResizeObserver;
  private activeId: string | undefined;
  private settings: TerminalSettings | undefined;
  private platform: NodeJS.Platform = 'linux';
  private fitFrame: number | undefined;
  private searchResultListener: ((result: ISearchResultChangeEvent) => void) | undefined;

  constructor(
    private readonly stack: HTMLElement,
    private readonly vscode: VSCodeApi
  ) {
    this.resizeObserver = new ResizeObserver(() => this.fitActive());
    this.resizeObserver.observe(stack);
  }

  initialize(settings: TerminalSettings, platform: NodeJS.Platform): void {
    this.settings = settings;
    this.platform = detectUiPlatform(platform);
  }

  syncSessions(
    sessions: SessionSnapshot[],
    activeId: string | undefined,
    replays?: Record<string, string>
  ): void {
    const expected = new Set(sessions.map((session) => session.id));
    for (const id of this.entries.keys()) {
      if (!expected.has(id)) this.remove(id);
    }
    for (const session of sessions) {
      let entry = this.entries.get(session.id);
      if (!entry) entry = this.create(session.id);
      const replay = replays?.[session.id];
      if (replay && entry.terminal.buffer.active.length <= entry.terminal.rows) {
        entry.replaying = true;
        const finishReplay = () => {
          entry.replaying = false;
          entry.detector.adoptStatus(session.status);
          if (session.id === this.activeId) this.scheduleFit();
        };
        if (!this.writeOutput(entry, replay, finishReplay)) finishReplay();
      } else {
        entry.detector.adoptStatus(session.status);
      }
    }
    this.activate(activeId, false);
  }

  write(id: string, data: string): void {
    const entry = this.entries.get(id);
    if (!entry || !data) return;
    entry.pendingOutput.push(data);
    if (entry.outputTimer !== undefined) return;
    entry.outputTimer = window.setTimeout(() => this.flushOutput(entry), OUTPUT_BATCH_DELAY_MS);
  }

  clear(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.discardPendingOutput(entry);
    entry.scrollbackCompat.reset();
    entry.terminal.reset();
    entry.detector.adoptStatus('running');
  }

  activate(id: string | undefined, focus = true): void {
    const activeChanged =
      this.activeId !== id ||
      (id !== undefined && !this.entries.get(id)?.element.classList.contains('active'));
    this.activeId = id;
    for (const [entryId, entry] of this.entries) {
      entry.element.classList.toggle('active', entryId === id);
      entry.element.setAttribute('aria-hidden', String(entryId !== id));
    }
    if (!id) return;
    if (!activeChanged) {
      if (focus) this.entries.get(id)?.terminal.focus();
      return;
    }
    this.fitActive();
    if (focus) requestAnimationFrame(() => this.entries.get(id)?.terminal.focus());
  }

  updateSettings(settings: TerminalSettings): void {
    this.settings = settings;
    for (const entry of this.entries.values()) {
      applyTerminalSettings(entry.terminal, settings);
      this.updateImageAddon(entry, settings.imagesEnabled);
    }
    this.scheduleFit();
  }

  refreshTheme(): void {
    if (!this.settings) return;
    requestAnimationFrame(() => this.updateSettings(this.settings!));
  }

  receiveClipboardText(requestId: string, text: string): void {
    const id = this.pendingPastes.get(requestId);
    this.pendingPastes.delete(requestId);
    const entry = id ? this.entries.get(id) : undefined;
    if (!entry || !text) return;
    this.pasteText(id!, text);
  }

  pasteText(id: string, text: string): void {
    const entry = this.entries.get(id);
    if (!entry || !text) return;
    entry.terminal.paste(text);
    if (id === this.activeId) entry.terminal.focus();
  }

  requestClipboardPaste(id: string): void {
    this.requestPaste(id);
  }

  setSearchResultListener(listener: (result: ISearchResultChangeEvent) => void): void {
    this.searchResultListener = listener;
  }

  search(term: string, direction: 'next' | 'previous', incremental = false): void {
    const entry = this.activeId ? this.entries.get(this.activeId) : undefined;
    if (!entry || !term) {
      entry?.searchAddon.clearDecorations();
      this.searchResultListener?.({ resultIndex: 0, resultCount: 0 });
      return;
    }
    const options: ISearchOptions = {
      incremental,
      decorations: searchDecorations()
    };
    if (direction === 'previous') entry.searchAddon.findPrevious(term, options);
    else entry.searchAddon.findNext(term, options);
  }

  clearSearch(): void {
    const entry = this.activeId ? this.entries.get(this.activeId) : undefined;
    entry?.searchAddon.clearDecorations();
    this.searchResultListener?.({ resultIndex: 0, resultCount: 0 });
  }

  focusActive(): void {
    if (this.activeId) this.entries.get(this.activeId)?.terminal.focus();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    if (this.fitFrame !== undefined) cancelAnimationFrame(this.fitFrame);
    for (const id of [...this.entries.keys()]) this.remove(id);
  }

  private create(id: string): TerminalEntry {
    if (!this.settings) throw new Error('Terminal settings are not initialized');
    const element = document.createElement('div');
    element.className = 'terminal-surface';
    element.dataset.id = id;
    element.setAttribute('aria-hidden', 'true');
    this.stack.appendChild(element);

    const terminal = new Terminal({
      allowProposedApi: true,
      allowTransparency: false,
      convertEol: false,
      cursorInactiveStyle: 'outline',
      overviewRuler: { width: 10 }
    });
    applyTerminalSettings(terminal, this.settings);
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon({ highlightLimit: 1000 });
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.open(element);

    const detector = new StatusDetector((update) => {
      this.post({ type: 'status', id, ...update });
    });
    const selectionAutoScroll = new SelectionAutoScroll(element, terminal);
    const entry: TerminalEntry = {
      terminal,
      fitAddon,
      searchAddon,
      element,
      detector,
      scrollbackCompat: new ScrollRegionScrollbackCompat(),
      selectionAutoScroll,
      pendingOutput: [],
      replaying: false
    };
    this.entries.set(id, entry);
    searchAddon.onDidChangeResults((result) => {
      if (id === this.activeId) this.searchResultListener?.(result);
    });
    this.loadWebglRenderer(entry);
    this.updateImageAddon(entry, this.settings.imagesEnabled);

    terminal.onData((data) => {
      if (entry.replaying) return;
      detector.onInput(data);
      this.post({ type: 'input', id, data });
    });
    terminal.onBell(() => {
      if (!entry.replaying) this.scheduleSignal(entry, 'BEL');
    });
    element.addEventListener('focusin', () => this.post({ type: 'focusChanged', focused: true }));
    terminal.parser.registerOscHandler(9, (data) => {
      if (!entry.replaying) {
        this.scheduleSignal(entry, data ? `OSC 9: ${data.slice(0, 160)}` : 'OSC 9');
      }
      return true;
    });
    terminal.attachCustomKeyEventHandler((event) => this.handleKeyEvent(terminal, event));
    element.addEventListener('contextmenu', (event) => this.handleContextMenu(id, terminal, event));
    return entry;
  }

  private remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.settleTimer !== undefined) window.clearTimeout(entry.settleTimer);
    if (entry.signalTimer !== undefined) window.clearTimeout(entry.signalTimer);
    this.discardPendingOutput(entry);
    this.detachWebglContextLossListener(entry);
    entry.selectionAutoScroll.dispose();
    entry.terminal.dispose();
    entry.element.remove();
    this.entries.delete(id);
  }

  private createImageAddon(): ImageAddon | undefined {
    if (!this.settings?.imagesEnabled) return undefined;
    return new ImageAddon({
      enableSizeReports: true,
      pixelLimit: 4_194_304,
      sixelSupport: true,
      sixelSizeLimit: 8_000_000,
      storageLimit: 24,
      showPlaceholder: false,
      iipSupport: true,
      iipSizeLimit: 8_000_000
    });
  }

  private loadWebglRenderer(entry: TerminalEntry): void {
    const addon = new WebglAddon();
    try {
      entry.terminal.loadAddon(addon);
      entry.webglAddon = addon;
      const canvas = Array.from(
        entry.element.querySelectorAll<HTMLCanvasElement>('.xterm-screen > canvas')
      ).find((candidate) => !candidate.className);
      if (canvas) {
        // The addon waits three seconds for restoration before onContextLoss; fall back before paint.
        const listener: EventListener = (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.fallbackFromWebgl(entry, addon);
        };
        entry.webglCanvas = canvas;
        entry.webglContextLossListener = listener;
        canvas.addEventListener('webglcontextlost', listener, true);
      }
      addon.onContextLoss(() => {
        this.fallbackFromWebgl(entry, addon);
      });
    } catch {
      addon.dispose();
    }
  }

  private updateImageAddon(entry: TerminalEntry, enabled: boolean): void {
    const shouldEnable = enabled && Boolean(entry.webglAddon);
    if (shouldEnable === Boolean(entry.imageAddon)) return;
    if (!shouldEnable) {
      entry.imageAddon?.dispose();
      entry.imageAddon = undefined;
      return;
    }
    const addon = this.createImageAddon();
    if (!addon) return;
    entry.terminal.loadAddon(addon);
    entry.imageAddon = addon;
  }

  private fallbackFromWebgl(entry: TerminalEntry, addon: WebglAddon): void {
    if (entry.webglAddon !== addon) return;
    this.detachWebglContextLossListener(entry);
    entry.imageAddon?.dispose();
    entry.imageAddon = undefined;
    entry.webglAddon = undefined;
    addon.dispose();
    entry.terminal.refresh(0, entry.terminal.rows - 1);
    if (entry.element.dataset.id === this.activeId) this.scheduleFit();
  }

  private detachWebglContextLossListener(entry: TerminalEntry): void {
    if (entry.webglCanvas && entry.webglContextLossListener) {
      entry.webglCanvas.removeEventListener(
        'webglcontextlost',
        entry.webglContextLossListener,
        true
      );
    }
    entry.webglCanvas = undefined;
    entry.webglContextLossListener = undefined;
  }

  private flushOutput(entry: TerminalEntry): void {
    entry.outputTimer = undefined;
    const data = entry.pendingOutput.join('');
    entry.pendingOutput.length = 0;
    if (!data) return;
    this.writeOutput(entry, data, () => {
      if (!entry.replaying) this.scheduleScreenEvaluation(entry);
    });
  }

  private writeOutput(entry: TerminalEntry, data: string, callback: () => void): boolean {
    const output = entry.scrollbackCompat.transform(data);
    if (!output) return false;
    entry.terminal.write(output, callback);
    return true;
  }

  private discardPendingOutput(entry: TerminalEntry): void {
    if (entry.outputTimer !== undefined) window.clearTimeout(entry.outputTimer);
    entry.outputTimer = undefined;
    entry.pendingOutput.length = 0;
  }

  private handleKeyEvent(terminal: Terminal, event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') return true;
    if (event.isComposing || event.keyCode === 229) return true;
    const key = event.key.toLowerCase();
    const copyShortcut =
      (this.platform === 'darwin' && event.metaKey && key === 'c') ||
      (this.platform !== 'darwin' && event.ctrlKey && key === 'c' && terminal.hasSelection());
    if (copyShortcut && terminal.hasSelection()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.post({ type: 'clipboardWrite', text: terminal.getSelection() });
      return false;
    }
    const pasteShortcut =
      (this.platform === 'darwin' && event.metaKey && key === 'v') ||
      (this.platform === 'win32' && event.ctrlKey && key === 'v') ||
      (this.platform !== 'darwin' && this.platform !== 'win32' && event.ctrlKey && event.shiftKey && key === 'v') ||
      (event.shiftKey && event.key === 'Insert');
    if (pasteShortcut) {
      event.stopImmediatePropagation();
      return false;
    }
    return true;
  }

  private handleContextMenu(id: string, terminal: Terminal, event: MouseEvent): void {
    const behavior = this.settings?.rightClickBehavior;
    if (behavior === 'paste') {
      event.preventDefault();
      this.requestPaste(id);
    } else if (behavior === 'copyPaste') {
      event.preventDefault();
      if (terminal.hasSelection()) {
        this.post({ type: 'clipboardWrite', text: terminal.getSelection() });
      } else {
        this.requestPaste(id);
      }
    } else if (behavior === 'nothing') {
      event.preventDefault();
    }
  }

  private requestPaste(id: string): void {
    const requestId = crypto.randomUUID();
    this.pendingPastes.set(requestId, id);
    this.post({ type: 'clipboardRead', requestId });
  }

  private scheduleScreenEvaluation(entry: TerminalEntry): void {
    const screen = readVisibleScreen(entry.terminal);
    entry.detector.onScreen(screen, false);
    if (entry.settleTimer !== undefined) window.clearTimeout(entry.settleTimer);
    entry.settleTimer = window.setTimeout(() => {
      entry.settleTimer = undefined;
      entry.detector.onScreen(readVisibleScreen(entry.terminal), true);
    }, 480);
  }

  private scheduleSignal(entry: TerminalEntry, detail: string): void {
    if (entry.signalTimer !== undefined) window.clearTimeout(entry.signalTimer);
    entry.signalTimer = window.setTimeout(() => {
      entry.signalTimer = undefined;
      entry.detector.onSignal(readVisibleScreen(entry.terminal), detail);
    }, 60);
  }

  private scheduleFit(): void {
    if (this.fitFrame !== undefined) cancelAnimationFrame(this.fitFrame);
    this.fitFrame = requestAnimationFrame(() => {
      this.fitFrame = undefined;
      this.fitActive();
    });
  }

  private fitActive(): void {
    const id = this.activeId;
    const entry = id ? this.entries.get(id) : undefined;
    if (!id || !entry || entry.element.clientWidth < 10 || entry.element.clientHeight < 10) return;
    const previousCols = entry.terminal.cols;
    const previousRows = entry.terminal.rows;
    entry.fitAddon.fit();
    if (entry.terminal.cols !== previousCols || entry.terminal.rows !== previousRows) {
      this.post({
        type: 'resize',
        id,
        cols: entry.terminal.cols,
        rows: entry.terminal.rows
      });
    }
  }

  private post(message: WebviewMessage): void {
    this.vscode.postMessage(message);
  }
}

function readVisibleScreen(terminal: Terminal): string {
  const buffer = terminal.buffer.active;
  const start = Math.max(0, buffer.viewportY);
  const end = Math.min(buffer.length, start + terminal.rows);
  const lines: string[] = [];
  for (let index = start; index < end; index++) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? '');
  }
  return lines.join('\n');
}

function detectUiPlatform(fallback: NodeJS.Platform): NodeJS.Platform {
  const navigatorWithHints = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = navigatorWithHints.userAgentData?.platform || navigator.platform || '';
  if (/mac/i.test(platform)) return 'darwin';
  if (/win/i.test(platform)) return 'win32';
  if (/linux|x11/i.test(platform)) return 'linux';
  return fallback;
}
