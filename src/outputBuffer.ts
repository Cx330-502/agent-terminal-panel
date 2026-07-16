const DEFAULT_LIMIT = 4 * 1024 * 1024;

export class OutputBuffer {
  private readonly chunks: string[] = [];
  private byteLength = 0;

  constructor(private readonly limit = DEFAULT_LIMIT) {}

  append(data: string): void {
    if (!data) return;
    this.chunks.push(data);
    this.byteLength += Buffer.byteLength(data);

    while (this.byteLength > this.limit && this.chunks.length > 1) {
      const removed = this.chunks.shift();
      if (removed) this.byteLength -= Buffer.byteLength(removed);
    }
  }

  clear(): void {
    this.chunks.length = 0;
    this.byteLength = 0;
  }

  toString(): string {
    return this.chunks.join('');
  }
}
