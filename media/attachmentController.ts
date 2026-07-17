import type { AttachmentUpload, VSCodeApi } from '../src/shared';

const MAX_FILES = 8;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/iu;
const FILE_TRANSFER_TYPE = 'files';
const URI_TRANSFER_TYPES = [
  'text/uri-list',
  'application/vnd.code.uri-list',
  'resourceurls',
  'codefiles',
  'codeeditors'
] as const;

export class AttachmentController {
  private activeId: string | undefined;
  private readonly dragTarget: HTMLElement;
  private statusTimer: number | undefined;
  private readonly pending = new Map<string, string[]>();

  constructor(
    private readonly target: HTMLElement,
    private readonly overlay: HTMLElement,
    private readonly status: HTMLElement,
    private readonly vscode: VSCodeApi,
    private readonly insertText: (id: string, text: string) => void,
    private readonly requestTextPaste: (id: string) => void
  ) {
    this.dragTarget = target.closest<HTMLElement>('.terminal-pane') ?? target;
    target.addEventListener('paste', this.handlePaste, true);
    this.dragTarget.addEventListener('dragenter', this.handleDragEnter, true);
    this.dragTarget.addEventListener('dragover', this.handleDragOver, true);
    this.dragTarget.addEventListener('dragleave', this.handleDragLeave, true);
    this.dragTarget.addEventListener('drop', this.handleDrop, true);
  }

  setActiveId(id: string | undefined): void {
    this.activeId = id;
  }

  receiveResult(
    requestId: string,
    id: string,
    insertText: string | undefined,
    savedCount: number,
    hostErrors: string[]
  ): void {
    const clientErrors = this.pending.get(requestId) ?? [];
    this.pending.delete(requestId);
    if (insertText) this.insertText(id, insertText);
    const errors = [...clientErrors, ...hostErrors];
    if (savedCount > 0 && errors.length === 0) {
      this.showStatus(`已插入 ${savedCount} 张图片的路径`, 'success');
    } else if (savedCount > 0) {
      this.showStatus(`已插入 ${savedCount} 张，${errors.length} 张失败`, 'warning');
    } else {
      this.showStatus(errors[0] ?? '没有可插入的图片', 'error');
    }
  }

  dispose(): void {
    this.target.removeEventListener('paste', this.handlePaste, true);
    this.dragTarget.removeEventListener('dragenter', this.handleDragEnter, true);
    this.dragTarget.removeEventListener('dragover', this.handleDragOver, true);
    this.dragTarget.removeEventListener('dragleave', this.handleDragLeave, true);
    this.dragTarget.removeEventListener('drop', this.handleDrop, true);
    if (this.statusTimer !== undefined) window.clearTimeout(this.statusTimer);
  }

  private readonly handlePaste = (event: ClipboardEvent): void => {
    const id = this.sessionIdFromEvent(event) ?? this.activeId;
    if (!id) return;
    const transfer = event.clipboardData;
    if (!transfer) {
      event.preventDefault();
      this.requestTextPaste(id);
      return;
    }
    const files = imageFiles(transfer);
    const uris = files.length === 0 ? imageUris(transfer) : [];
    event.preventDefault();
    event.stopImmediatePropagation();
    if (files.length > 0 || uris.length > 0) {
      void this.submit(id, files, uris);
      return;
    }
    const text = transfer.getData('text/plain');
    if (text) this.insertText(id, text);
    else this.requestTextPaste(id);
  };

  private readonly handleDragEnter = (event: DragEvent): void => {
    if (!event.dataTransfer) return;
    event.preventDefault();
    if (hasPotentialAttachmentTransfer(event.dataTransfer)) this.overlay.hidden = false;
  };

  private readonly handleDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (hasPotentialAttachmentTransfer(event.dataTransfer)) this.overlay.hidden = false;
  };

  private readonly handleDragLeave = (event: DragEvent): void => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !this.dragTarget.contains(next)) this.overlay.hidden = true;
  };

  private readonly handleDrop = (event: DragEvent): void => {
    if (!event.dataTransfer) return;
    event.preventDefault();
    event.stopPropagation();
    this.overlay.hidden = true;
    const id = this.activeId;
    if (!id || !event.dataTransfer) {
      this.showStatus('请先创建或选择一个终端会话', 'error');
      return;
    }
    const files = imageFiles(event.dataTransfer);
    const uris = files.length === 0 ? imageUris(event.dataTransfer) : [];
    if (files.length === 0 && uris.length === 0) {
      this.showStatus('未收到可读取的图片；从 VS Code 资源管理器拖入时可改用复制粘贴', 'error');
      return;
    }
    void this.submit(id, files, uris);
  };

  private async submit(id: string, files: File[], uris: string[]): Promise<void> {
    const selected = files.slice(0, MAX_FILES);
    const clientErrors: string[] = [];
    if (files.length > MAX_FILES) clientErrors.push(`一次最多处理 ${MAX_FILES} 张图片`);
    let totalBytes = 0;
    const accepted = selected.filter((file) => {
      if (file.size > MAX_FILE_BYTES) {
        clientErrors.push(`${file.name || '图片'}：超过 25 MB`);
        return false;
      }
      const nextTotal = totalBytes + file.size;
      if (nextTotal > MAX_TOTAL_BYTES) {
        clientErrors.push(`${file.name || '图片'}：本次图片总量超过 50 MB`);
        return false;
      }
      totalBytes = nextTotal;
      return true;
    });
    if (accepted.length === 0 && uris.length === 0) {
      this.showStatus(clientErrors[0] ?? '没有可插入的图片', 'error');
      return;
    }

    this.showStatus('正在保存图片到 workspace host…', 'progress', 0);
    const encoded = await Promise.allSettled(
      accepted.map((file, index) => toUpload(file, index))
    );
    const uploads: AttachmentUpload[] = [];
    encoded.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') uploads.push(outcome.value);
      else clientErrors.push(`${accepted[index]?.name || '图片'}：读取失败`);
    });
    if (uploads.length === 0 && uris.length === 0) {
      this.showStatus(clientErrors[0] ?? '没有可插入的图片', 'error');
      return;
    }
    const requestId = crypto.randomUUID();
    this.pending.set(requestId, clientErrors);
    this.vscode.postMessage({
      type: 'saveAttachments',
      requestId,
      id,
      uploads,
      uris: uris.slice(0, MAX_FILES)
    });
  }

  private sessionIdFromEvent(event: Event): string | undefined {
    const target = event.target;
    return target instanceof Element
      ? target.closest<HTMLElement>('.terminal-surface')?.dataset.id
      : undefined;
  }

  private showStatus(
    message: string,
    kind: 'progress' | 'success' | 'warning' | 'error',
    duration = 3200
  ): void {
    if (this.statusTimer !== undefined) window.clearTimeout(this.statusTimer);
    this.status.textContent = message;
    this.status.className = `attachment-status attachment-${kind}`;
    this.status.hidden = false;
    if (duration > 0) {
      this.statusTimer = window.setTimeout(() => {
        this.status.hidden = true;
        this.statusTimer = undefined;
      }, duration);
    }
  }
}

function imageFiles(transfer: DataTransfer): File[] {
  const files = Array.from(transfer.files);
  return files.filter(
    (file) => file.type.toLowerCase().startsWith('image/') || IMAGE_EXTENSION.test(file.name)
  );
}

function imageUris(transfer: DataTransfer): string[] {
  const values = [
    ...parseUriList(readTransferData(transfer, 'text/uri-list')),
    ...parseUriList(readTransferData(transfer, 'application/vnd.code.uri-list')),
    ...parseJsonStringArray(readTransferData(transfer, 'resourceurls')),
    ...parseJsonStringArray(readTransferData(transfer, 'codefiles')),
    ...parseCodeEditors(readTransferData(transfer, 'codeeditors'))
  ];
  if (values.length === 0) {
    values.push(...parsePlainReferences(readTransferData(transfer, 'text/plain')));
  }
  return [...new Set(values.map(unquote).filter(isImageReference))];
}

function hasPotentialAttachmentTransfer(transfer: DataTransfer): boolean {
  const types = Array.from(transfer.types, (value) => value.toLowerCase());
  return (
    transfer.files.length > 0 ||
    types.length === 0 ||
    types.includes(FILE_TRANSFER_TYPE) ||
    URI_TRANSFER_TYPES.some((type) => types.includes(type))
  );
}

function readTransferData(transfer: DataTransfer, expectedType: string): string {
  const actualType = Array.from(transfer.types).find(
    (value) => value.toLowerCase() === expectedType.toLowerCase()
  );
  return transfer.getData(actualType ?? expectedType);
}

function parseUriList(raw: string): string[] {
  return raw
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter((value) => value && !value.startsWith('#'));
}

function parseJsonStringArray(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function parseCodeEditors(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => serializedResource(entry));
  } catch {
    return [];
  }
}

function serializedResource(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const resource = (value as { resource?: unknown }).resource;
  if (typeof resource === 'string') return [resource];
  if (!resource || typeof resource !== 'object') return [];
  const candidate = resource as { scheme?: unknown; authority?: unknown; path?: unknown };
  if (typeof candidate.path !== 'string') return [];
  if (typeof candidate.scheme !== 'string' || !candidate.scheme) return [candidate.path];
  const authority = typeof candidate.authority === 'string' ? candidate.authority : '';
  return [`${candidate.scheme}://${authority}${candidate.path}`];
}

function parsePlainReferences(raw: string): string[] {
  return raw
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter((value) => /^(?:[a-z][a-z\d+.-]*:|\/|[a-z]:[\\/]|\\\\)/iu.test(unquote(value)));
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return /^(['"]).*\1$/u.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

function isImageReference(value: string): boolean {
  try {
    return IMAGE_EXTENSION.test(decodeURIComponent(value).split(/[?#]/u)[0] ?? '');
  } catch {
    return IMAGE_EXTENSION.test(value.split(/[?#]/u)[0] ?? '');
  }
}

async function toUpload(file: File, index: number): Promise<AttachmentUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return {
    name: file.name || `pasted-image-${index + 1}.${extensionForMime(file.type)}`,
    mimeType: file.type || mimeForName(file.name),
    base64: btoa(binary)
  };
}

function mimeForName(name: string): string {
  if (/\.svg$/iu.test(name)) return 'image/svg+xml';
  if (/\.webp$/iu.test(name)) return 'image/webp';
  if (/\.gif$/iu.test(name)) return 'image/gif';
  if (/\.jpe?g$/iu.test(name)) return 'image/jpeg';
  return 'image/png';
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/svg+xml') return 'svg';
  return mimeType.split('/')[1]?.replace('+xml', '') || 'png';
}
