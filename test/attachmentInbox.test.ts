import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUriList } from '../src/attachmentDrop';

test('native attachment inbox parses URI lists and ignores comments', () => {
  assert.deepEqual(
    parseUriList('# dragged resources\r\nfile:///tmp/a.png\r\nvscode-remote://ssh-remote+host/work/b.webp\n'),
    ['file:///tmp/a.png', 'vscode-remote://ssh-remote+host/work/b.webp']
  );
});
