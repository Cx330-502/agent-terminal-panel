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
      title: vscode.l10n.t('Choose images to insert into the Agent session'),
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: vscode.l10n.t('Insert image paths'),
      filters: {
        [vscode.l10n.t('Images')]: ['avif', 'bmp', 'gif', 'heic', 'heif', 'jpg', 'jpeg', 'png', 'svg', 'tif', 'tiff', 'webp']
      }
    });
    if (!picked || picked.length === 0) return;
    const limited = picked.slice(0, 8);
    await this.save(
      randomUUID(),
      id,
      [],
      limited.map((uri) => uri.toString()),
      picked.length > limited.length ? [vscode.l10n.t('Process up to 8 images at once')] : []
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
