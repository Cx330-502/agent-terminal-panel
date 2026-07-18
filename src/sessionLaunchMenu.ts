import * as vscode from 'vscode';

export type SessionLaunchAction =
  | 'default'
  | 'defaultCwd'
  | 'custom'
  | 'providerHistory'
  | 'workspaceRestore';

interface LaunchPickItem extends vscode.QuickPickItem {
  action: SessionLaunchAction;
}

export async function pickSessionLaunchAction(
  restoreCount: number
): Promise<SessionLaunchAction | undefined> {
  const items: LaunchPickItem[] = [
    {
      label: '$(add) 新建默认会话',
      description: '使用 Agent Terminal Panel 的默认启动命令',
      action: 'default'
    },
    {
      label: '$(folder-opened) 新建默认会话并选择 cwd',
      description: '选择工作目录后使用默认启动命令',
      action: 'defaultCwd'
    },
    {
      label: '$(terminal) 使用自定义命令新建',
      description: '仅用于本次会话，不加入窗口恢复记录',
      action: 'custom'
    },
    {
      label: '$(history) 从 Provider 历史会话启动',
      description: '浏览当前 workspace 的 Codex / Claude 历史',
      action: 'providerHistory'
    }
  ];
  if (restoreCount > 0) {
    items.unshift({
      label: `$(window) 恢复上次窗口的 ${restoreCount} 个会话`,
      description: '仅恢复由默认启动命令创建且未显式关闭的会话',
      action: 'workspaceRestore'
    });
  }
  return (
    await vscode.window.showQuickPick(items, {
      title: 'Agent 会话启动方式',
      placeHolder: '选择启动方式'
    })
  )?.action;
}
