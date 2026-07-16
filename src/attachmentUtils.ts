import * as path from 'node:path';

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.tif',
  '.tiff',
  '.webp'
]);

const MIME_EXTENSIONS: Record<string, string> = {
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/webp': '.webp'
};

export function isImagePath(value: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(value).toLowerCase());
}

export function sanitizeAttachmentName(name: string, mimeType: string): string {
  const basename = path.basename(name || 'image');
  const parsed = path.parse(basename);
  const extension = IMAGE_EXTENSIONS.has(parsed.ext.toLowerCase())
    ? parsed.ext.toLowerCase()
    : MIME_EXTENSIONS[mimeType.toLowerCase()] ?? '.png';
  const stem = (parsed.name || 'image')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 72);
  return `${stem || 'image'}${extension}`;
}

export function formatAttachmentPaths(paths: string[], platform: NodeJS.Platform): string {
  return `${paths.map((value) => quoteAttachmentPath(value, platform)).join(' ')} `;
}

export function quoteAttachmentPath(value: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') return `"${value.replace(/"/gu, '""')}"`;
  return `'${value.replace(/'/gu, `'"'"'`)}'`;
}
