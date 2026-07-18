import * as vscode from 'vscode';
import { getLaunchCommand } from './config';

export async function configureDefaultLaunchCommand(
  showConfirmation = true
): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('agentTerminalPanel');
  const launchCommand = await vscode.window.showInputBox({
    title: '配置 Agent 启动命令',
    prompt: '输入在 workspace extension host 中执行的完整命令行',
    placeHolder: 'agent-cli --flag value',
    value: getLaunchCommand(),
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : '启动命令不能为空')
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
    void vscode.window.showInformationMessage('Agent 启动命令已更新，新建或重启会话时生效。');
  }
  return trimmed;
}
