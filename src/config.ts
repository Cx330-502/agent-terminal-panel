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
