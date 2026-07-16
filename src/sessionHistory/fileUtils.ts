import { createReadStream } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { createInterface } from 'node:readline';

export interface DatedFile {
  path: string;
  modifiedAt: number;
}

export async function listJsonlFiles(root: string): Promise<DatedFile[]> {
  const paths = await walk(root).catch(() => []);
  const files = await Promise.all(
    paths
      .filter((file) => file.endsWith('.jsonl'))
      .map(async (file) => ({ path: file, modifiedAt: (await stat(file)).mtimeMs }))
  );
  return files.sort((left, right) => right.modifiedAt - left.modifiedAt);
}

export async function readFirstJsonLine(file: string): Promise<unknown | undefined> {
  const stream = createReadStream(file, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      return parseJson(line);
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return undefined;
}

export async function readHeadJsonLines(file: string, maxLines = 64): Promise<unknown[]> {
  const result: unknown[] = [];
  const stream = createReadStream(file, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const value = parseJson(line);
      if (value !== undefined) result.push(value);
      if (result.length >= maxLines) break;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return result;
}

export async function readTailJsonLines(file: string, maxBytes = 512 * 1024): Promise<unknown[]> {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    const length = Math.min(info.size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, info.size - length);
    let text = buffer.toString('utf8');
    if (length < info.size) text = text.slice(Math.max(0, text.indexOf('\n') + 1));
    return text
      .split(/\r?\n/u)
      .filter(Boolean)
      .map(parseJson)
      .filter((value): value is unknown => value !== undefined);
  } finally {
    await handle.close();
  }
}

export function isInsideWorkspace(candidate: string, workspaceRoots: string[]): boolean {
  const resolvedCandidate = path.resolve(candidate);
  return workspaceRoots.some((root) => {
    const relative = path.relative(path.resolve(root), resolvedCandidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  });
}

export function compactTitle(value: string | undefined, fallback: string): string {
  const compact = value?.replace(/\s+/gu, ' ').trim();
  if (!compact) return fallback;
  return compact.length > 96 ? `${compact.slice(0, 93)}…` : compact;
}

function parseJson(line: string): unknown | undefined {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

async function walk(root: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}
