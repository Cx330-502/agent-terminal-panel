import type { WebviewStrings } from '../src/webviewStrings';

export function localizeDocument(strings: WebviewStrings): void {
  document.title = strings.documentTitle;
  setText('session-heading', strings.sessionHeading);
  setText('restore-workspace-sessions', strings.restoreAll);
  setText('dismiss-workspace-restore', strings.dismiss);
  setText('attachment-overlay-title', strings.dropImages);
  setText('attachment-overlay-detail', strings.dropImagesHint);
  setText('empty-state-copy', strings.emptyState);
  setText('empty-new-session', strings.emptyNewDefault);
  setText('empty-new-session-menu', strings.emptyOtherLaunch);

  setAria('session-sidebar', strings.sessionSidebarAria);
  setAria('session-list', strings.sessionListAria);
  setAria('session-splitter', strings.sessionSplitterAria);
  setAria('launch-menu', strings.launchMenuAria);
  setControl('new-session', strings.newDefaultSession);
  setControl('new-session-menu', strings.otherLaunchMethods);
  setControl('find-terminal', strings.findTerminal);
  setControl('pick-attachments', strings.pickAttachmentsAria, strings.pickAttachmentsTitle);
  setControl('rename-active-session', strings.renameCurrentSession);
  setControl('restart-session', strings.rerunCurrentSession);
  setControl('terminal-search-input', strings.searchInputAria);
  setControl('terminal-search-previous', strings.searchPreviousAria, strings.searchPreviousTitle);
  setControl('terminal-search-next', strings.searchNextAria, strings.searchNextTitle);
  setControl('terminal-search-close', strings.searchCloseAria, strings.searchCloseTitle);
}

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setAria(id: string, value: string): void {
  document.getElementById(id)?.setAttribute('aria-label', value);
}

function setControl(id: string, ariaLabel: string, title = ariaLabel): void {
  const element = document.getElementById(id);
  if (!element) return;
  element.setAttribute('aria-label', ariaLabel);
  element.setAttribute('title', title);
}
