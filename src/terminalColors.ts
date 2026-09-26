export type TerminalColorSlot = 10 | 11 | 12;
export type TerminalColors = Record<TerminalColorSlot, string>;

export function isTerminalColors(value: unknown): value is TerminalColors {
  if (!value || typeof value !== 'object') return false;
  return ([10, 11, 12] as const).every((slot) =>
    /^#[\da-f]{6}$/iu.test((value as TerminalColors)[slot])
  );
}

/** Answer default-color probes next to the PTY, without a remote Webview round trip.
 * Only consume exact OSC 10/11/12 queries. Setters and all other terminal bytes
 * still reach xterm; after a setter, that slot's queries stay owned by xterm.
 */
export class TerminalColorResponder {
  private colors: TerminalColors | undefined;
  private readonly delegated = new Set<number>();
  private pending = '';
  private mode: 'text' | 'escape' | 'osc' | 'string' | 'longOsc' = 'text';
  private stringEscape = false;

  constructor(colors?: TerminalColors) {
    this.colors = colors;
  }

  setColors(colors: TerminalColors): void {
    if (this.colors && ([10, 11, 12] as const).every((slot) => this.colors![slot] === colors[slot])) return;
    this.colors = colors;
    this.delegated.clear();
  }

  transform(data: string): { output: string; replies: string[] } {
    let output = '';
    const replies: string[] = [];
    for (const char of data) {
      if (this.mode === 'string' || this.mode === 'longOsc') {
        output += char;
        if ((this.stringEscape && char === '\\') || char === '\u009c' ||
          char === '\x18' || char === '\x1a' || (this.mode === 'longOsc' && char === '\x07')) this.mode = 'text';
        this.stringEscape = char === '\x1b';
        continue;
      }
      if (this.mode === 'osc') {
        this.pending += char;
        if (char === '\x18' || char === '\x1a') {
          output += this.pending;
          this.pending = '';
          this.mode = 'text';
          continue;
        }
        const terminator = char === '\x07' || char === '\u009c' ? 1
          : this.pending.endsWith('\x1b\\') ? 2 : 0;
        if (terminator) {
          const sequence = this.pending;
          const body = sequence.slice(sequence.startsWith('\x1b') ? 2 : 1, -terminator);
          const query = /^(10|11|12);\?$/u.exec(body);
          const slot = query ? Number(query[1]) as TerminalColorSlot : undefined;
          if (slot && this.colors && !this.delegated.has(slot)) {
            const rgb = this.colors[slot].slice(1).match(/../gu)!.map((byte) => byte + byte).join('/');
            replies.push(`\x1b]${slot};rgb:${rgb}\x1b\\`);
          } else {
            output += sequence;
            const setter = /^(10|11|12);(.*)$/u.exec(body);
            if (setter) {
              for (const [offset, value] of setter[2]!.split(';').entries()) {
                const index = Number(setter[1]) + offset;
                if (index <= 12 && value !== '?') this.delegated.add(index);
              }
            }
            const reset = /^(110|111|112)(?:;)?$/u.exec(body);
            if (reset) this.delegated.delete(Number(reset[1]) - 100);
          }
          this.pending = '';
          this.mode = 'text';
        } else if (this.pending.length > 4096) {
          // Large titles/clipboard strings are not color probes. Stream through.
          output += this.pending;
          this.pending = '';
          this.mode = 'longOsc';
          this.stringEscape = char === '\x1b';
        }
        continue;
      }
      if (this.mode === 'escape') {
        if (char === ']') {
          this.pending += char;
          this.mode = 'osc';
        } else {
          output += this.pending + char;
          this.pending = '';
          this.mode = /[PX^_]/u.test(char) ? 'string' : 'text';
          this.stringEscape = false;
        }
        continue;
      }
      if (char === '\x1b' || char === '\u009d') {
        this.pending = char;
        this.mode = char === '\x1b' ? 'escape' : 'osc';
      } else {
        output += char;
        if (/[\u0090\u0098\u009e\u009f]/u.test(char)) {
          this.mode = 'string';
          this.stringEscape = false;
        }
      }
    }
    return { output, replies };
  }

  flush(): string {
    const tail = this.pending;
    this.pending = '';
    this.mode = 'text';
    return tail;
  }
}
