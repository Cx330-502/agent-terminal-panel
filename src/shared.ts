export type SessionStatus = 'running' | 'waiting' | 'approval' | 'completed';

export interface SessionSnapshot {
  id: string;
  name: string;
  cwd: string;
  status: SessionStatus;
  unread: boolean;
  isActive: boolean;
  exitCode?: number;
}

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  fontWeightBold: string | number;
  lineHeight: number;
  letterSpacing: number;
  cursorStyle: 'block' | 'line' | 'underline';
  cursorBlinking: boolean;
  cursorWidth: number;
  scrollback: number;
  macOptionIsMeta: boolean;
  macOptionClickForcesSelection: boolean;
  altClickMovesCursor: boolean;
  fastScrollSensitivity: number;
  mouseWheelScrollSensitivity: number;
  wordSeparators: string;
  minimumContrastRatio: number;
  drawBoldTextInBrightColors: boolean;
  customGlyphs: boolean;
  rightClickBehavior: string;
}

export type HostMessage =
  | {
      type: 'initialize';
      sessions: SessionSnapshot[];
      activeId?: string;
      replays: Record<string, string>;
      terminalSettings: TerminalSettings;
      platform: NodeJS.Platform;
    }
  | { type: 'state'; sessions: SessionSnapshot[]; activeId?: string }
  | { type: 'output'; id: string; data: string }
  | { type: 'clear'; id: string }
  | { type: 'focusSession'; id: string }
  | { type: 'clipboardText'; requestId: string; text: string }
  | { type: 'terminalSettings'; settings: TerminalSettings }
  | { type: 'refreshTheme' }
  | { type: 'playCompletionSound' };

export type WebviewMessage =
  | { type: 'ready'; cols: number; rows: number }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'newSession'; chooseCwd: boolean }
  | { type: 'switchSession'; id: string }
  | { type: 'renameSession'; id: string; name: string }
  | { type: 'closeSession'; id: string }
  | { type: 'restartSession'; id: string }
  | {
      type: 'status';
      id: string;
      status: SessionStatus;
      attention: boolean;
      detail?: string;
    }
  | { type: 'focusChanged'; focused: boolean }
  | { type: 'clipboardRead'; requestId: string }
  | { type: 'clipboardWrite'; text: string };

export interface VSCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}
