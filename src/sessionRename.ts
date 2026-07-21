import * as vscode from 'vscode';

export async function promptSessionRename(currentName: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: vscode.l10n.t('Rename Agent Session'),
    value: currentName,
    validateInput: (value) =>
      value.trim() ? undefined : vscode.l10n.t('The name cannot be empty')
  });
}
