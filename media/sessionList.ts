import type { SessionSnapshot } from '../src/shared';
import { formatWebviewString, type WebviewStrings } from '../src/webviewStrings';
import { communicationStatusLabel } from './communicationIndicator';
import { createIcon } from './icons';

export interface SessionListCallbacks {
  switchSession(id: string): void;
  renameSession(id: string, name: string): void;
  closeSession(id: string): void;
}

export class SessionList {
  private sessions: SessionSnapshot[] = [];

  constructor(
    private readonly element: HTMLElement,
    private readonly strings: WebviewStrings,
    private readonly callbacks: SessionListCallbacks
  ) {}

  render(sessions: SessionSnapshot[]): void {
    this.sessions = sessions;
    const editor = this.element.querySelector<HTMLInputElement>('.session-rename');
    const editingId = editor?.closest<HTMLElement>('.session-row')?.dataset.id;
    if (editor && editingId && sessions.some((session) => session.id === editingId)) return;
    this.renderRows(sessions);
  }

  private renderRows(sessions: SessionSnapshot[]): void {
    this.element.replaceChildren(...sessions.map((session) => this.createRow(session)));
  }

  private createRow(session: SessionSnapshot): HTMLElement {
    const row = document.createElement('div');
    row.className = `session-row${session.isActive ? ' active' : ''}${
      session.communication ? ` communication-${session.communication.health}` : ''
    }`;
    row.dataset.id = session.id;
    row.setAttribute('role', 'tab');
    row.setAttribute('aria-selected', String(session.isActive));
    row.tabIndex = session.isActive ? 0 : -1;
    row.title = [
      session.name,
      session.cwd,
      statusLabel(session, this.strings),
      communicationStatusLabel(session, this.strings),
      this.strings.doubleClickRename
    ]
      .filter(Boolean)
      .join('\n');

    const status = document.createElement('span');
    status.className = `status-dot status-${session.status}`;
    status.setAttribute('aria-label', statusLabel(session, this.strings));

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
    unread.setAttribute('aria-label', session.unread ? this.strings.unreadStatus : '');

    const close = document.createElement('button');
    close.className = 'session-close';
    close.type = 'button';
    close.append(createIcon('close'));
    close.title = this.strings.closeSession;
    close.setAttribute(
      'aria-label',
      formatWebviewString(this.strings.closeNamedSession, session.name)
    );
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
    input.setAttribute('aria-label', this.strings.sessionName);
    details.replaceChildren(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (commit: boolean): void => {
      if (finished) return;
      finished = true;
      if (commit && input.value.trim()) {
        this.callbacks.renameSession(session.id, input.value);
      }
      this.renderRows(this.sessions);
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') finish(true);
      if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

}

export function statusLabel(session: SessionSnapshot, strings: WebviewStrings): string {
  if (session.status === 'running') return strings.statusRunning;
  if (session.status === 'waiting') return strings.statusWaiting;
  if (session.status === 'approval') return strings.statusApproval;
  return session.exitCode === undefined
    ? strings.statusCompleted
    : formatWebviewString(strings.statusExited, session.exitCode);
}

function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/u, '').split(/[\\/]/u);
  return parts.at(-1) || path;
}
