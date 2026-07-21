import * as vscode from 'vscode';
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
    case 'clipboardRead': {
      const text = await vscode.env.clipboard.readText();
      context.post({ type: 'clipboardText', requestId: message.requestId, text });
      return true;
    }
    case 'clipboardWrite':
      await vscode.env.clipboard.writeText(message.text);
      vscode.window.setStatusBarMessage('$(check) 已复制到剪贴板', 1500);
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
