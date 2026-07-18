import * as vscode from 'vscode';
import { getLaunchCommand } from './config';

export interface CustomSessionOptions {
  name: string;
  launchCommand: string;
}

export async function promptCustomSessionOptions(): Promise<CustomSessionOptions | undefined> {
  const launchCommand = await vscode.window.showInputBox({
    title: '新建自定义命令会话',
    prompt: '此命令只属于新会话，不会修改默认启动命令，也不会进入窗口恢复记录',
    placeHolder: 'agent-cli --flag value',
    value: getLaunchCommand(),
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : '启动命令不能为空')
  });
  if (launchCommand === undefined) return undefined;
  const name = await vscode.window.showInputBox({
    title: '命名新会话',
    prompt: '会话创建后仍可双击名称或使用重命名按钮修改',
    value: 'Custom Agent',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : '会话名称不能为空')
  });
  return name === undefined ? undefined : { name, launchCommand };
}
