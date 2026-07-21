import * as vscode from 'vscode';
import { AgentTerminalViewProvider, VIEW_ID } from './AgentTerminalViewProvider';
import {
  ATTACHMENT_INBOX_VIEW_ID,
  AttachmentInboxProvider
} from './attachmentInbox';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new AgentTerminalViewProvider(
    context.extensionUri,
    context.extension.id,
    context.storageUri,
    context.globalStorageUri,
    context.workspaceState
  );
  const attachmentInbox = new AttachmentInboxProvider(
    context.storageUri ?? context.globalStorageUri,
    {
      getActiveSession: () => provider.activeSessionForInbox(),
      insert: (id, text) => provider.insertIntoSession(id, text)
    }
  );
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.window.createTreeView(ATTACHMENT_INBOX_VIEW_ID, {
      treeDataProvider: attachmentInbox,
      dragAndDropController: attachmentInbox,
      showCollapseAll: false
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
    vscode.commands.registerCommand('agentTerminalPanel.showNewSessionMenu', () =>
      provider.showNewSessionMenu()
    ),
    vscode.commands.registerCommand('agentTerminalPanel.find', () => provider.showSearch()),
    vscode.commands.registerCommand('agentTerminalPanel.openSessionHistory', () =>
      provider.openSessionHistory()
    ),
    vscode.commands.registerCommand('agentTerminalPanel.restoreWorkspaceSessions', () =>
      provider.restoreWorkspaceSessions()
    ),
    vscode.commands.registerCommand('agentTerminalPanel.reopenClosedSession', () =>
      provider.reopenClosedSession()
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
