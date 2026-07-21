import * as vscode from 'vscode';
import { parseUriList } from './attachmentDrop';
import { AttachmentStore } from './attachmentStore';
import { formatAttachmentPaths } from './attachmentUtils';
import type { AttachmentUpload } from './shared';

export const ATTACHMENT_INBOX_VIEW_ID = 'agentTerminalPanel.attachmentInbox';
const MAX_ATTACHMENTS = 8;

interface InboxSession {
  id: string;
  name: string;
}

export interface AttachmentInboxCallbacks {
  getActiveSession(): InboxSession | undefined;
  insert(id: string, text: string): boolean;
}

interface InboxItem {
  readonly kind: 'drop-target';
}

const DROP_TARGET: InboxItem = { kind: 'drop-target' };

export class AttachmentInboxProvider
implements vscode.TreeDataProvider<InboxItem>, vscode.TreeDragAndDropController<InboxItem> {
  readonly dragMimeTypes: readonly string[] = [];
  readonly dropMimeTypes = ['files', 'text/uri-list'];
  private readonly store: AttachmentStore;

  constructor(storageUri: vscode.Uri, private readonly callbacks: AttachmentInboxCallbacks) {
    this.store = new AttachmentStore(storageUri);
  }

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('拖放图片到这里', vscode.TreeItemCollapsibleState.None);
    item.description = '无需按住 Shift';
    item.iconPath = new vscode.ThemeIcon('cloud-upload');
    item.tooltip = new vscode.MarkdownString(
      '把系统文件管理器或 VS Code Explorer 中的图片拖到这里，路径会插入当前 Agent 会话。'
    );
    return item;
  }

  getChildren(): InboxItem[] {
    return [DROP_TARGET];
  }

  async handleDrop(
    _target: InboxItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const session = this.callbacks.getActiveSession();
    if (!session) {
      void vscode.window.showWarningMessage('请先新建或选择一个 Agent 会话。');
      return;
    }

    const files = [...dataTransfer]
      .map(([, item]) => item.asFile())
      .filter((file): file is vscode.DataTransferFile => Boolean(file));
    const uriItem = dataTransfer.get('text/uri-list');
    const uriValues = uriItem ? parseUriList(await uriItem.asString()) : [];
    const allInputs = deduplicateInputs(files, uriValues);
    const inputs = allInputs.slice(0, MAX_ATTACHMENTS);
    if (inputs.length === 0 || token.isCancellationRequested) {
      void vscode.window.showWarningMessage('没有检测到可读取的图片文件。');
      return;
    }

    const uploads: AttachmentUpload[] = [];
    const uris: string[] = [];
    for (const input of inputs) {
      if (token.isCancellationRequested) return;
      if (typeof input === 'string') {
        uris.push(input);
      } else if (input.uri) {
        uris.push(input.uri.toString());
      } else {
        const data = await input.data();
        uploads.push({
          name: input.name,
          mimeType: 'image/unknown',
          base64: Buffer.from(data).toString('base64')
        });
      }
    }

    const result = await this.store.save(uploads, uris);
    const omitted = allInputs.length > inputs.length
      ? [`一次最多处理 ${MAX_ATTACHMENTS} 张图片`]
      : [];
    const errors = [...omitted, ...result.errors];
    if (result.paths.length > 0) {
      const inserted = this.callbacks.insert(
        session.id,
        formatAttachmentPaths(result.paths, process.platform)
      );
      if (inserted) {
        void vscode.window.showInformationMessage(
          `已向“${session.name}”插入 ${result.paths.length} 个图片路径。`
        );
      } else {
        errors.unshift(`会话“${session.name}”已经关闭`);
      }
    }
    if (errors.length > 0) {
      void vscode.window.showWarningMessage(`部分图片未处理：${errors.join('；')}`);
    } else if (result.paths.length === 0) {
      void vscode.window.showWarningMessage('没有可插入的受支持图片。');
    }
  }
}

function deduplicateInputs(
  files: vscode.DataTransferFile[],
  uris: string[]
): Array<vscode.DataTransferFile | string> {
  const result: Array<vscode.DataTransferFile | string> = [];
  const seen = new Set<string>();
  for (const file of files) {
    const key = file.uri?.toString() ?? `file:${file.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(file);
  }
  for (const uri of uris) {
    if (seen.has(uri)) continue;
    seen.add(uri);
    result.push(uri);
  }
  return result;
}
