export class WebviewReadyBarrier {
  private readonly waiters = new Set<() => void>();

  resolve(): void {
    for (const waiter of [...this.waiters]) waiter();
  }

  wait(onTimeout: (timeoutMs: number) => void, timeoutMs = 2000): Promise<void> {
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout;
      const finish = (): void => {
        clearTimeout(timer);
        this.waiters.delete(finish);
        resolve();
      };
      timer = setTimeout(() => {
        onTimeout(timeoutMs);
        finish();
      }, timeoutMs);
      this.waiters.add(finish);
    });
  }
}
