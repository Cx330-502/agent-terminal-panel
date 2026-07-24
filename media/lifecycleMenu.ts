import type {
  SessionRestartMode,
  SessionSnapshot,
  WebviewMessage
} from '../src/shared';
import { formatWebviewString, type WebviewStrings } from '../src/webviewStrings';
import { createIcon, type IconName } from './icons';

interface LifecycleAction {
  description: string;
  icon: IconName;
  label: string;
  mode: SessionRestartMode;
}

export class LifecycleMenu {
  private session: SessionSnapshot | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly anchor: HTMLButtonElement,
    private readonly strings: WebviewStrings,
    private readonly post: (message: WebviewMessage) => void
  ) {
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
    window.addEventListener('resize', this.handleWindowResize);
    root.addEventListener('keydown', this.handleMenuKeydown);
    anchor.addEventListener('keydown', this.handleAnchorKeydown);
  }

  setSession(session: SessionSnapshot | undefined): void {
    const changed = this.session?.id !== session?.id;
    this.session = session;
    if (changed) this.close();
    else if (!this.root.hidden) {
      this.render();
      this.position();
    }
  }

  toggle(): void {
    if (this.root.hidden) this.open();
    else this.close(true);
  }

  open(): void {
    if (!this.session || lifecycleActions(this.session, this.strings).length < 2) return;
    this.render();
    this.root.hidden = false;
    this.anchor.setAttribute('aria-expanded', 'true');
    this.position();
    this.items()[0]?.focus();
  }

  close(returnFocus = false): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.root.style.maxHeight = '';
    this.anchor.setAttribute('aria-expanded', 'false');
    if (returnFocus) this.anchor.focus();
  }

  dispose(): void {
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
    window.removeEventListener('resize', this.handleWindowResize);
    this.root.removeEventListener('keydown', this.handleMenuKeydown);
    this.anchor.removeEventListener('keydown', this.handleAnchorKeydown);
  }

  private render(): void {
    const content = document.createDocumentFragment();
    const group = document.createElement('div');
    group.className = 'launch-menu-group';
    group.textContent = this.strings.restartOptions;
    content.append(group);
    for (const action of lifecycleActions(this.session, this.strings)) {
      content.append(this.menuItem(action));
    }
    this.root.replaceChildren(content);
  }

  private menuItem(action: LifecycleAction): HTMLButtonElement {
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
      const session = this.session;
      this.close();
      if (session) this.post({ type: 'restartSession', id: session.id, mode: action.mode });
    });
    return button;
  }

  private position(): void {
    this.root.style.maxHeight = '';
    const anchor = this.anchor.getBoundingClientRect();
    const width = this.root.offsetWidth;
    const left = Math.min(
      Math.max(4, anchor.right - width),
      Math.max(4, innerWidth - width - 4)
    );
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

  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    if (this.root.hidden || !(event.target instanceof Node)) return;
    if (!this.root.contains(event.target) && !this.anchor.contains(event.target)) this.close();
  };

  private readonly handleWindowResize = (): void => {
    if (!this.root.hidden) this.position();
  };

  private readonly handleAnchorKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    this.open();
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

export function primaryRestartMode(session: SessionSnapshot): SessionRestartMode | undefined {
  if (canContinue(session)) return 'continue';
  if (canRerun(session)) return 'rerun';
  return undefined;
}

export function primaryRestartLabel(
  session: SessionSnapshot,
  strings: WebviewStrings
): string {
  return canContinue(session)
    ? formatWebviewString(
        strings.continueProviderSession,
        session.providerName ?? 'Provider'
      )
    : rerunSessionLabel(session, strings);
}

export function lifecycleActionCount(session: SessionSnapshot): number {
  return Number(canContinue(session)) + Number(canRerun(session));
}

function lifecycleActions(
  session: SessionSnapshot | undefined,
  strings: WebviewStrings
): LifecycleAction[] {
  if (!session) return [];
  const result: LifecycleAction[] = [];
  if (canContinue(session)) {
    result.push({
      label: formatWebviewString(
        strings.continueProviderSession,
        session.providerName ?? 'Provider'
      ),
      description: strings.continueSessionDescription,
      icon: 'continue',
      mode: 'continue'
    });
  }
  if (canRerun(session)) {
    result.push({
      label: rerunSessionLabel(session, strings),
      description: rerunSessionDescription(session, strings),
      icon: 'restart',
      mode: 'rerun'
    });
  }
  return result;
}

function rerunSessionLabel(session: SessionSnapshot, strings: WebviewStrings): string {
  if (session.launchSource === 'default') return strings.rerunDefaultSession;
  if (session.launchSource === 'profile') return strings.rerunProfileSession;
  if (session.launchSource === 'custom') return strings.rerunCustomSession;
  if (session.launchSource === 'historyResume') return strings.rerunResumeSession;
  return strings.rerunCurrentSession;
}

function rerunSessionDescription(session: SessionSnapshot, strings: WebviewStrings): string {
  if (session.launchSource === 'default') return strings.rerunDefaultDescription;
  if (session.launchSource === 'profile') return strings.rerunSavedDescription;
  if (session.launchSource === 'custom') return strings.rerunCustomDescription;
  return strings.rerunResumeDescription;
}

function canContinue(session: SessionSnapshot): boolean {
  return session.canContinue === true;
}

function canRerun(session: SessionSnapshot): boolean {
  return session.canRerun ?? session.canRestart;
}
