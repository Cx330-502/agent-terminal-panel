import type {
  ClosedSessionSummary,
  LaunchProfileSnapshot,
  WebviewMessage
} from '../src/shared';
import { formatWebviewString, type WebviewStrings } from '../src/webviewStrings';
import { createIcon, type IconName } from './icons';

interface MenuAction {
  label: string;
  description: string;
  icon: IconName;
  message: WebviewMessage;
}

export class LaunchMenu {
  private profiles: LaunchProfileSnapshot[] = [];
  private restoreCount = 0;
  private closedSessions: ClosedSessionSummary = { count: 0 };
  private activeAnchor: HTMLButtonElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly anchors: HTMLButtonElement[],
    private readonly panel: HTMLElement,
    private readonly strings: WebviewStrings,
    private readonly post: (message: WebviewMessage) => void
  ) {
    const anchor = anchors[0];
    if (!anchor) throw new Error('Launch menu requires an anchor');
    this.activeAnchor = anchor;
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
    window.addEventListener('resize', this.handleWindowResize);
    root.addEventListener('keydown', this.handleMenuKeydown);
    for (const item of anchors) item.addEventListener('keydown', this.handleAnchorKeydown);
  }

  setProfiles(profiles: LaunchProfileSnapshot[]): void {
    this.profiles = profiles;
    this.refreshOpenMenu();
  }

  setRestoreCount(count: number): void {
    this.restoreCount = count;
    this.refreshOpenMenu();
  }

  setClosedSessions(summary: ClosedSessionSummary): void {
    this.closedSessions = summary;
    this.refreshOpenMenu();
  }

  toggle(anchor = this.activeAnchor): void {
    if (this.root.hidden || anchor !== this.activeAnchor) this.open(anchor);
    else this.close(true);
  }

  open(anchor = this.anchors[0]): void {
    if (!anchor) return;
    this.activeAnchor = anchor;
    this.render();
    this.root.hidden = false;
    for (const item of this.anchors) {
      item.setAttribute('aria-expanded', String(item === anchor));
    }
    this.position();
    this.items()[0]?.focus();
  }

  close(returnFocus = false): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.root.style.maxHeight = '';
    for (const item of this.anchors) item.setAttribute('aria-expanded', 'false');
    if (returnFocus) this.activeAnchor.focus();
  }

  dispose(): void {
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
    window.removeEventListener('resize', this.handleWindowResize);
    this.root.removeEventListener('keydown', this.handleMenuKeydown);
    for (const item of this.anchors) item.removeEventListener('keydown', this.handleAnchorKeydown);
  }

  private render(): void {
    const content = document.createDocumentFragment();
    content.append(this.groupLabel(this.strings.launchProfiles));
    if (this.profiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'launch-menu-empty';
      empty.textContent = this.strings.noLaunchProfiles;
      content.append(empty);
    } else {
      for (const profile of this.profiles) {
        content.append(
          this.menuItem({
            label: profile.name,
            description: profile.command,
            icon: 'terminal',
            message: { type: 'newProfileSession', id: profile.id }
          })
        );
      }
    }
    content.append(this.separator());
    const actions: MenuAction[] = [
      {
        label: this.strings.chooseWorkingDirectory,
        description: this.strings.useDefaultLaunchCommand,
        icon: 'folder',
        message: { type: 'newSession', chooseCwd: true }
      },
      {
        label: this.strings.oneTimeCustomCommand,
        description: this.strings.customCommandDescription,
        icon: 'terminal',
        message: { type: 'newCustomSession', chooseCwd: false }
      },
      {
        label: this.strings.providerHistory,
        description: this.strings.providerHistoryDescription,
        icon: 'history',
        message: { type: 'openSessionHistory' }
      }
    ];
    if (this.closedSessions.count > 0) {
      actions.push({
        label: this.closedSessions.name
          ? formatWebviewString(this.strings.reopenNamedSession, this.closedSessions.name)
          : this.strings.reopenClosedSession,
        description: this.closedSessions.count > 1
          ? formatWebviewString(this.strings.shortClosedRecords, this.closedSessions.count)
          : this.strings.recreateClosedSession,
        icon: 'restart',
        message: { type: 'reopenClosedSession' }
      });
    }
    if (this.restoreCount > 0) {
      actions.push({
        label: formatWebviewString(this.strings.restoreWindowSessions, this.restoreCount),
        description: this.strings.restoreWindowSessionsDescription,
        icon: 'restart',
        message: { type: 'restoreWorkspaceSessions' }
      });
    }
    for (const action of actions) content.append(this.menuItem(action));
    content.append(this.separator());
    content.append(
      this.menuItem({
        label: this.strings.manageLaunchProfiles,
        description: this.strings.openPanelSettings,
        icon: 'pencil',
        message: { type: 'openSettings' }
      })
    );
    this.root.replaceChildren(content);
  }

  private menuItem(action: MenuAction): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'launch-menu-item';
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
    const copy = document.createElement('span');
    copy.className = 'launch-menu-copy';
    const label = document.createElement('span');
    label.className = 'launch-menu-label';
    label.textContent = action.label;
    const description = document.createElement('span');
    description.className = 'launch-menu-description';
    description.textContent = action.description;
    copy.append(label, description);
    button.append(createIcon(action.icon), copy);
    button.addEventListener('click', () => {
      this.close();
      this.post(action.message);
    });
    return button;
  }

  private groupLabel(text: string): HTMLElement {
    const label = document.createElement('div');
    label.className = 'launch-menu-group';
    label.textContent = text;
    return label;
  }

  private separator(): HTMLElement {
    const separator = document.createElement('div');
    separator.className = 'launch-menu-separator';
    separator.setAttribute('role', 'separator');
    return separator;
  }

  private position(): void {
    this.root.style.maxHeight = '';
    const anchor = this.activeAnchor.getBoundingClientRect();
    const width = this.root.offsetWidth;
    const opensFromRight = this.panel.classList.contains('session-list-right');
    const preferredLeft = opensFromRight ? anchor.right - width : anchor.left;
    const left = Math.min(Math.max(4, preferredLeft), Math.max(4, innerWidth - width - 4));
    const availableBelow = Math.max(0, innerHeight - anchor.bottom - 7);
    const availableAbove = Math.max(0, anchor.top - 7);
    const openBelow = this.root.offsetHeight <= availableBelow || availableBelow >= availableAbove;
    const availableHeight = openBelow ? availableBelow : availableAbove;
    this.root.style.maxHeight = `${Math.max(0, Math.floor(availableHeight))}px`;
    const top = openBelow
      ? anchor.bottom + 3
      : Math.max(4, anchor.top - this.root.offsetHeight - 3);
    this.root.style.left = `${Math.round(left)}px`;
    this.root.style.top = `${Math.round(top)}px`;
  }

  private items(): HTMLButtonElement[] {
    return Array.from(this.root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  }

  private refreshOpenMenu(): void {
    if (this.root.hidden) return;
    this.render();
    this.position();
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    if (this.root.hidden || !(event.target instanceof Node)) return;
    if (
      !this.root.contains(event.target) &&
      !this.anchors.some((anchor) => anchor.contains(event.target as Node))
    ) {
      this.close();
    }
  };

  private readonly handleWindowResize = (): void => {
    if (!this.root.hidden) this.position();
  };

  private readonly handleAnchorKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    this.open(event.currentTarget as HTMLButtonElement);
  };

  private readonly handleMenuKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
      return;
    }
    if (event.key === 'Tab') {
      this.close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = this.items();
    if (items.length === 0) return;
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
}
