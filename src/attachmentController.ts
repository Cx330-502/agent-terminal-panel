import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { AttachmentStore } from './attachmentStore';
import { formatAttachmentPaths } from './attachmentUtils';
import type { AttachmentUpload, HostMessage } from './shared';

export class AttachmentController {
  private readonly store: AttachmentStore;

  constructor(
    storageUri: vscode.Uri,
    private readonly post: (message: HostMessage) => void
  ) {
    this.store = new AttachmentStore(storageUri);
  }

  async pick(id: string): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      title: '选择要插入 Agent 会话的图片',
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: '插入图片路径',
      filters: {
        图片: ['avif', 'bmp', 'gif', 'heic', 'heif', 'jpg', 'jpeg', 'png', 'svg', 'tif', 'tiff', 'webp']
      }
    });
    if (!picked || picked.length === 0) return;
    const limited = picked.slice(0, 8);
    await this.save(
      randomUUID(),
      id,
      [],
      limited.map((uri) => uri.toString()),
      picked.length > limited.length ? ['一次最多处理 8 张图片'] : []
    );
  }

  async save(
    requestId: string,
    id: string,
    uploads: AttachmentUpload[],
    uris: string[],
    extraErrors: string[] = []
  ): Promise<void> {
    const result = await this.store.save(uploads, uris);
    this.post({
      type: 'attachmentResult',
      requestId,
      id,
      ...(result.paths.length > 0
        ? { insertText: formatAttachmentPaths(result.paths, process.platform) }
        : {}),
      savedCount: result.paths.length,
      errors: [...extraErrors, ...result.errors]
    });
  }
}
