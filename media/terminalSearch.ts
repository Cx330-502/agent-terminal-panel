import type { ISearchResultChangeEvent } from '@xterm/addon-search';
import { formatWebviewString, type WebviewStrings } from '../src/webviewStrings';

export interface TerminalSearchActions {
  search(term: string, direction: 'next' | 'previous', incremental?: boolean): void;
  clear(): void;
  focusTerminal(): void;
}

export class TerminalSearch {
  private available = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly input: HTMLInputElement,
    private readonly result: HTMLElement,
    private readonly previous: HTMLButtonElement,
    private readonly next: HTMLButtonElement,
    private readonly closeButton: HTMLButtonElement,
    private readonly strings: WebviewStrings,
    private readonly actions: TerminalSearchActions
  ) {
    this.input.addEventListener('input', () => this.run('next', true));
    this.input.addEventListener('keydown', (event) => this.handleInputKeydown(event));
    this.previous.addEventListener('click', () => this.run('previous'));
    this.next.addEventListener('click', () => this.run('next'));
    this.closeButton.addEventListener('click', () => this.close());
    document.addEventListener('keydown', this.handleDocumentKeydown, true);
    this.updateAvailability();
  }

  open(): void {
    this.root.hidden = false;
    this.input.focus();
    this.input.select();
    if (this.input.value) this.run('next', true);
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.actions.clear();
    this.result.textContent = '';
    this.actions.focusTerminal();
  }

  setAvailable(available: boolean): void {
    this.available = available;
    this.updateAvailability();
    if (!this.root.hidden && this.input.value && available) this.run('next', true);
  }

  setResult(searchResult: ISearchResultChangeEvent): void {
    if (!this.input.value || !this.available) {
      this.result.textContent = '';
      return;
    }
    if (searchResult.resultCount <= 0) {
      this.result.textContent = this.strings.noSearchResults;
      return;
    }
    this.result.textContent = searchResult.resultIndex >= 0
      ? `${searchResult.resultIndex + 1}/${searchResult.resultCount}`
      : formatWebviewString(this.strings.searchResultCount, searchResult.resultCount);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.handleDocumentKeydown, true);
  }

  private run(direction: 'next' | 'previous', incremental = false): void {
    if (!this.available) return;
    this.actions.search(this.input.value, direction, incremental);
  }

  private updateAvailability(): void {
    this.input.disabled = !this.available;
    this.previous.disabled = !this.available;
    this.next.disabled = !this.available;
    this.input.placeholder = this.available
      ? this.strings.findTerminal
      : this.strings.noActiveTerminal;
  }

  private handleInputKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.run(event.shiftKey ? 'previous' : 'next');
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent): void => {
    const modifier = navigator.platform.toLowerCase().includes('mac')
      ? event.metaKey
      : event.ctrlKey;
    if (!modifier || event.altKey || event.key.toLowerCase() !== 'f') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.open();
  };
}
