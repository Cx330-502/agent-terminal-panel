import * as vscode from 'vscode';

export async function promptSessionRename(currentName: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: vscode.l10n.t('Rename Agent Session'),
    value: currentName,
    validateInput: (value) => {
      if (!value.trim()) return vscode.l10n.t('The name cannot be empty');
      return value.trim().length > 200
        ? vscode.l10n.t('The name cannot be longer than 200 characters')
        : undefined;
    }
  });
}
