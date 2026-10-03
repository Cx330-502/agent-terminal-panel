import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openTerminalLink } from './terminalLinks';
import type { AttachmentController } from './attachmentController';
import type { HostMessage, WebviewMessage } from './shared';

export interface WebviewUtilityMessageContext {
  hasSession(id: string): boolean;
  attachments: AttachmentController;
  post(message: HostMessage): void;
}

export async function handleWebviewUtilityMessage(
  message: WebviewMessage,
  context: WebviewUtilityMessageContext
): Promise<boolean> {
  switch (message.type) {
    case 'openLink':
      if (!context.hasSession(message.id)) return true;
      try {
        await openTerminalLink(message.url, {
          remoteName: vscode.env.remoteName,
          useWindowsBrowser: vscode.workspace.getConfiguration('agentTerminalPanel')
            .get<boolean>('links.wslUseWindowsBrowser', true),
          openClient: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
          openWorkspace: async (url) => { await promisify(execFile)('xdg-open', [url], { timeout: 10_000 }); }
        });
      } catch (error) {
        void vscode.window.showErrorMessage(vscode.l10n.t(
          'Could not open terminal link: {0}',
          error instanceof Error ? error.message : String(error)
        ));
      }
      return true;
    case 'clipboardRead': {
      const text = await vscode.env.clipboard.readText();
      context.post({ type: 'clipboardText', requestId: message.requestId, text });
      return true;
    }
    case 'clipboardWrite':
      await vscode.env.clipboard.writeText(message.text);
      vscode.window.setStatusBarMessage(
        `$(check) ${vscode.l10n.t('Copied to clipboard')}`,
        1500
      );
      return true;
    case 'pickAttachments':
      if (context.hasSession(message.id)) await context.attachments.pick(message.id);
      return true;
    case 'saveAttachments':
      await context.attachments.save(
        message.requestId,
        message.id,
        message.uploads,
        message.uris
      );
      return true;
    default:
      return false;
  }
}
