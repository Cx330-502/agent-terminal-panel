import * as vscode from 'vscode';

export async function promptSessionRename(currentName: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: '重命名 Agent 会话',
    value: currentName,
    validateInput: (value) => (value.trim() ? undefined : '名称不能为空')
  });
}
