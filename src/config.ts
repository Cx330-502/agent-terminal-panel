import * as vscode from 'vscode';
import type { TerminalSettings } from './shared';

export interface AgentProcessConfig {
  launchCommand: string;
  environment: Record<string, string>;
}

export type CompletionSoundMode = 'never' | 'whenHidden' | 'always';

export interface NotificationConfig {
  showToast: boolean;
  completionSound: CompletionSoundMode;
}

export type SessionListPosition = 'left' | 'right';

export interface LayoutSettings {
  sessionListPosition: SessionListPosition;
}

export interface SessionHistoryConfig {
  maxResults: number;
  codexCommand: string;
  claudeCommand: string;
}

const SECTION = 'agentTerminalPanel';

export function getLaunchCommand(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>('launchCommand', '').trim();
}

export function getAgentProcessConfig(): AgentProcessConfig {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    launchCommand: config.get<string>('launchCommand', '').trim(),
    environment: config.get<Record<string, string>>('environment', {})
  };
}

export function shouldStartSessionOnOpen(): boolean {
  return vscode.workspace.getConfiguration(SECTION).get<boolean>('startSessionOnOpen', true);
}

export function getNotificationConfig(): NotificationConfig {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    showToast: config.get<boolean>('notifications.showToast', true),
    completionSound: config.get<CompletionSoundMode>(
      'notifications.completionSound',
      'whenHidden'
    )
  };
}

export function getLayoutSettings(): LayoutSettings {
  return {
    sessionListPosition: vscode.workspace
      .getConfiguration(SECTION)
      .get<SessionListPosition>('sessionListPosition', 'left')
  };
}

export function getSessionHistoryConfig(): SessionHistoryConfig {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    maxResults: clamp(config.get<number>('sessionHistory.maxResults', 100), 1, 500),
    codexCommand: config.get<string>('sessionHistory.codexCommand', 'codex').trim() || 'codex',
    claudeCommand: config.get<string>('sessionHistory.claudeCommand', 'claude').trim() || 'claude'
  };
}

export function getTerminalSettings(): TerminalSettings {
  const config = vscode.workspace.getConfiguration('terminal.integrated');
  return {
    fontFamily: config.get<string>('fontFamily', ''),
    fontSize: config.get<number>('fontSize', 14),
    fontWeight: config.get<string | number>('fontWeight', 'normal'),
    fontWeightBold: config.get<string | number>('fontWeightBold', 'bold'),
    lineHeight: config.get<number>('lineHeight', 1),
    letterSpacing: config.get<number>('letterSpacing', 0),
    cursorStyle: config.get<'block' | 'line' | 'underline'>('cursorStyle', 'block'),
    cursorBlinking: config.get<boolean>('cursorBlinking', false),
    cursorWidth: config.get<number>('cursorWidth', 1),
    scrollback: config.get<number>('scrollback', 1000),
    macOptionIsMeta: config.get<boolean>('macOptionIsMeta', false),
    macOptionClickForcesSelection: config.get<boolean>('macOptionClickForcesSelection', false),
    altClickMovesCursor: config.get<boolean>('altClickMovesCursor', true),
    fastScrollSensitivity: config.get<number>('fastScrollSensitivity', 5),
    mouseWheelScrollSensitivity: config.get<number>('mouseWheelScrollSensitivity', 1),
    wordSeparators: config.get<string>('wordSeparators', ' ()[]{}\'"`─‘’“”|,;'),
    minimumContrastRatio: config.get<number>('minimumContrastRatio', 4.5),
    drawBoldTextInBrightColors: config.get<boolean>('drawBoldTextInBrightColors', true),
    customGlyphs: config.get<boolean>('customGlyphs', true),
    rightClickBehavior: config.get<string>('rightClickBehavior', 'copyPaste')
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}
