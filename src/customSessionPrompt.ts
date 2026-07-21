import * as vscode from 'vscode';
import { getLaunchCommand } from './config';

export interface CustomSessionOptions {
  name: string;
  launchCommand: string;
}

export async function promptCustomSessionOptions(): Promise<CustomSessionOptions | undefined> {
  const launchCommand = await vscode.window.showInputBox({
    title: vscode.l10n.t('Create Custom Command Session'),
    prompt: vscode.l10n.t('This command applies only to the new session. It does not change the default launch command or enter window recovery history.'),
    placeHolder: 'agent-cli --flag value',
    value: getLaunchCommand(),
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() ? undefined : vscode.l10n.t('The launch command cannot be empty')
  });
  if (launchCommand === undefined) return undefined;
  const name = await vscode.window.showInputBox({
    title: vscode.l10n.t('Name New Session'),
    prompt: vscode.l10n.t('You can still double-click the name or use the rename button after creating the session.'),
    value: vscode.l10n.t('Custom Agent'),
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() ? undefined : vscode.l10n.t('The session name cannot be empty')
  });
  return name === undefined ? undefined : { name, launchCommand };
}
