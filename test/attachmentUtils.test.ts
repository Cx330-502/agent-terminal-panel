import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAttachmentPaths,
  isImagePath,
  quoteAttachmentPath,
  sanitizeAttachmentName
} from '../src/attachmentUtils';

test('attachment names retain safe Unicode names and supported image extensions', () => {
  assert.equal(sanitizeAttachmentName('截图 2026-07-17.PNG', 'image/png'), '截图-2026-07-17.png');
  assert.equal(sanitizeAttachmentName('../../unsafe name', 'image/jpeg'), 'unsafe-name.jpg');
  assert.equal(sanitizeAttachmentName('', 'image/webp'), 'image.webp');
});

test('image path detection is case-insensitive and rejects unrelated files', () => {
  assert.equal(isImagePath('/tmp/photo.JPEG'), true);
  assert.equal(isImagePath('/tmp/vector.svg'), true);
  assert.equal(isImagePath('/tmp/notes.txt'), false);
});

test('attachment paths are quoted for the workspace host and separated for paste', () => {
  assert.equal(quoteAttachmentPath("/tmp/a b/c'd.png", 'linux'), "'/tmp/a b/c'\"'\"'d.png'");
  assert.equal(quoteAttachmentPath('C:\\Images\\a b.png', 'win32'), '"C:\\Images\\a b.png"');
  assert.equal(
    formatAttachmentPaths(['/tmp/一.png', '/tmp/two.png'], 'darwin'),
    "'/tmp/一.png' '/tmp/two.png' "
  );
});
