import * as vscode from 'vscode';
import { AgentTerminalViewProvider, VIEW_ID } from './AgentTerminalViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new AgentTerminalViewProvider(context.extensionUri, context.extension.id);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand('agentTerminalPanel.newSession', () =>
      provider.createSession(false)
    ),
    vscode.commands.registerCommand('agentTerminalPanel.newSessionInFolder', () =>
      provider.createSession(true)
    ),
    vscode.commands.registerCommand('agentTerminalPanel.newCustomSession', () =>
      provider.createCustomSession(false)
    ),
    vscode.commands.registerCommand('agentTerminalPanel.renameSession', () =>
      provider.renameActiveSession()
    ),
    vscode.commands.registerCommand('agentTerminalPanel.closeSession', () =>
      provider.closeActiveSession()
    ),
    vscode.commands.registerCommand('agentTerminalPanel.restartSession', () =>
      provider.restartActiveSession()
    ),
    vscode.commands.registerCommand('agentTerminalPanel.configureLaunchCommand', () =>
      provider.configureLaunchCommand()
    ),
    vscode.commands.registerCommand('agentTerminalPanel.openSettings', () =>
      provider.openSettings()
    ),
    vscode.commands.registerCommand('agentTerminalPanel.nextSession', () =>
      provider.switchSession(1)
    ),
    vscode.commands.registerCommand('agentTerminalPanel.previousSession', () =>
      provider.switchSession(-1)
    )
  );
}

export function deactivate(): void {}
