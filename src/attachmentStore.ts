import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { isImagePath, sanitizeAttachmentName } from './attachmentUtils';
import type { AttachmentUpload } from './shared';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export interface AttachmentSaveResult {
  paths: string[];
  errors: string[];
}

export class AttachmentStore {
  constructor(private readonly storageRoot: vscode.Uri) {}

  async save(uploads: AttachmentUpload[], uriValues: string[]): Promise<AttachmentSaveResult> {
    const paths: string[] = [];
    const errors: string[] = [];
    let totalBytes = 0;

    for (const upload of uploads) {
      try {
        if (!upload.mimeType.toLowerCase().startsWith('image/')) {
          throw new Error('不是图片');
        }
        if (upload.base64.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8) {
          throw new Error('超过 25 MB');
        }
        const data = Buffer.from(upload.base64, 'base64');
        if (data.byteLength === 0) throw new Error('图片为空');
        if (data.byteLength > MAX_FILE_BYTES) throw new Error('超过 25 MB');
        const nextTotal = totalBytes + data.byteLength;
        if (nextTotal > MAX_TOTAL_BYTES) throw new Error('本次图片总量超过 50 MB');
        totalBytes = nextTotal;
        paths.push(await this.writeImage(upload.name, upload.mimeType, data));
      } catch (error) {
        errors.push(`${upload.name || '剪贴板图片'}：${errorMessage(error)}`);
      }
    }

    for (const value of [...new Set(uriValues)]) {
      try {
        const uri = vscode.Uri.parse(value, true);
        if (!isImagePath(uri.path)) throw new Error('不是受支持的图片文件');
        const info = await vscode.workspace.fs.stat(uri);
        if ((info.type & vscode.FileType.File) === 0) throw new Error('不是文件');
        if (uri.scheme === 'file' || uri.scheme === 'vscode-remote') {
          paths.push(uri.fsPath);
        } else {
          if (info.size > MAX_FILE_BYTES) throw new Error('超过 25 MB');
          const nextTotal = totalBytes + info.size;
          if (nextTotal > MAX_TOTAL_BYTES) throw new Error('本次图片总量超过 50 MB');
          totalBytes = nextTotal;
          const data = await vscode.workspace.fs.readFile(uri);
          paths.push(await this.writeImage(uri.path, '', data));
        }
      } catch (error) {
        errors.push(`${value}：${errorMessage(error)}`);
      }
    }

    return { paths, errors };
  }

  private async writeImage(name: string, mimeType: string, data: Uint8Array): Promise<string> {
    const directory = vscode.Uri.joinPath(this.storageRoot, 'attachments');
    await vscode.workspace.fs.createDirectory(directory);
    const safeName = sanitizeAttachmentName(name, mimeType);
    const destination = vscode.Uri.joinPath(
      directory,
      `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`
    );
    await vscode.workspace.fs.writeFile(destination, data);
    return destination.fsPath;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
