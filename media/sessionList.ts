import type { SessionSnapshot } from '../src/shared';

export interface SessionListCallbacks {
  switchSession(id: string): void;
  renameSession(id: string, name: string): void;
  closeSession(id: string): void;
}

export class SessionList {
  constructor(
    private readonly element: HTMLElement,
    private readonly callbacks: SessionListCallbacks
  ) {}

  render(sessions: SessionSnapshot[]): void {
    this.element.replaceChildren(...sessions.map((session) => this.createRow(session)));
  }

  private createRow(session: SessionSnapshot): HTMLElement {
    const row = document.createElement('div');
    row.className = `session-row${session.isActive ? ' active' : ''}`;
    row.dataset.id = session.id;
    row.setAttribute('role', 'tab');
    row.setAttribute('aria-selected', String(session.isActive));
    row.tabIndex = session.isActive ? 0 : -1;
    row.title = `${session.name}\n${session.cwd}\n${statusLabel(session)}\n双击重命名`;

    const status = document.createElement('span');
    status.className = `status-dot status-${session.status}`;
    status.setAttribute('aria-label', statusLabel(session));

    const details = document.createElement('span');
    details.className = 'session-details';
    const name = document.createElement('span');
    name.className = 'session-name';
    name.textContent = session.name;
    const cwd = document.createElement('span');
    cwd.className = 'session-cwd';
    cwd.textContent = basename(session.cwd);
    details.append(name, cwd);

    const unread = document.createElement('span');
    unread.className = `unread-dot${session.unread ? ' visible' : ''}`;
    unread.setAttribute('aria-label', session.unread ? '有未读状态' : '');

    const close = document.createElement('button');
    close.className = 'session-close';
    close.type = 'button';
    close.textContent = '×';
    close.title = '关闭会话';
    close.setAttribute('aria-label', `关闭 ${session.name}`);
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.callbacks.closeSession(session.id);
    });

    row.append(status, details, unread, close);
    row.addEventListener('click', () => {
      if (!session.isActive) this.callbacks.switchSession(session.id);
    });
    row.addEventListener('dblclick', (event) => {
      event.preventDefault();
      if (session.isActive) this.beginRename(row, details, session);
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.callbacks.switchSession(session.id);
      } else if (event.key === 'F2') {
        event.preventDefault();
        this.beginRename(row, details, session);
      } else if (event.key === 'Delete') {
        event.preventDefault();
        this.callbacks.closeSession(session.id);
      }
    });
    return row;
  }

  private beginRename(
    row: HTMLElement,
    details: HTMLElement,
    session: SessionSnapshot
  ): void {
    if (row.querySelector('input')) return;
    const input = document.createElement('input');
    input.className = 'session-rename';
    input.value = session.name;
    input.setAttribute('aria-label', '会话名称');
    details.replaceChildren(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (commit: boolean): void => {
      if (finished) return;
      finished = true;
      if (commit && input.value.trim()) {
        this.callbacks.renameSession(session.id, input.value);
      } else {
        this.renderFromCurrentDomFallback(session);
      }
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') finish(true);
      if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  private renderFromCurrentDomFallback(session: SessionSnapshot): void {
    const row = this.element.querySelector<HTMLElement>(`.session-row[data-id="${session.id}"]`);
    const details = row?.querySelector<HTMLElement>('.session-details');
    if (!details) return;
    const name = document.createElement('span');
    name.className = 'session-name';
    name.textContent = session.name;
    const cwd = document.createElement('span');
    cwd.className = 'session-cwd';
    cwd.textContent = basename(session.cwd);
    details.replaceChildren(name, cwd);
  }
}

export function statusLabel(session: SessionSnapshot): string {
  if (session.status === 'running') return '运行中';
  if (session.status === 'waiting') return '等待输入';
  if (session.status === 'approval') return '等待审批';
  return session.exitCode === undefined ? '已完成' : `已结束（${session.exitCode}）`;
}

function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/u, '').split(/[\\/]/u);
  return parts.at(-1) || path;
}
