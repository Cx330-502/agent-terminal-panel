import * as vscode from 'vscode';
import { getLaunchCommand } from './config';

export async function configureDefaultLaunchCommand(
  showConfirmation = true
): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('agentTerminalPanel');
  const launchCommand = await vscode.window.showInputBox({
    title: vscode.l10n.t('Configure Agent Launch Command'),
    prompt: vscode.l10n.t('Enter the complete command line to run on the workspace extension host.'),
    placeHolder: 'agent-cli --flag value',
    value: getLaunchCommand(),
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() ? undefined : vscode.l10n.t('The launch command cannot be empty')
  });
  if (launchCommand === undefined) return undefined;

  const inspected = config.inspect<string>('launchCommand');
  const target =
    inspected?.workspaceValue !== undefined
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  const trimmed = launchCommand.trim();
  await config.update('launchCommand', trimmed, target);
  if (showConfirmation) {
    void vscode.window.showInformationMessage(
      vscode.l10n.t('The Agent launch command was updated and will apply to new or restarted sessions.')
    );
  }
  return trimmed;
}
