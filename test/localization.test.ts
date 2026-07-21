import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import {
  CHINESE_WEBVIEW_STRINGS,
  ENGLISH_WEBVIEW_STRINGS,
  formatWebviewString,
  getWebviewStrings
} from '../src/webviewStrings';

test('package contribution localization keys are complete in English and Chinese', () => {
  const manifest = readJson('package.json');
  const english = readJson('package.nls.json');
  const chinese = readJson('package.nls.zh-cn.json');
  const referenced = new Set<string>();
  collectPackageKeys(manifest, referenced);
  assert.deepEqual(Object.keys(english).sort(), [...referenced].sort());
  assert.deepEqual(Object.keys(chinese).sort(), Object.keys(english).sort());
});

test('every vscode.l10n message has a Simplified Chinese translation', () => {
  const translated = readJson('l10n/bundle.l10n.zh-cn.json');
  const messages = new Set<string>();
  for (const file of sourceFiles('src')) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    visit(source);
  }
  const missing = [...messages].filter((message) => !(message in translated));
  assert.deepEqual(missing, []);

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      isVscodeL10nCall(node.expression) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      messages.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
});

test('webview English and Chinese dictionaries stay in sync', () => {
  assert.deepEqual(
    Object.keys(CHINESE_WEBVIEW_STRINGS).sort(),
    Object.keys(ENGLISH_WEBVIEW_STRINGS).sort()
  );
  assert.equal(getWebviewStrings('en-US').sessionHeading, 'Sessions');
  assert.equal(getWebviewStrings('zh-CN').sessionHeading, '会话');
  assert.equal(getWebviewStrings('zh_CN').searchNextAria, '下一个匹配项');
  assert.equal(formatWebviewString('Restored {0} of {1}', 2, 3), 'Restored 2 of 3');
});

test('runtime source keeps translations in the localization dictionaries', () => {
  const chineseText = /[\p{Script=Han}]/u;
  for (const root of ['src', 'media']) {
    for (const file of sourceFiles(root)) {
      if (file.endsWith('src/webviewStrings.ts')) continue;
      assert.doesNotMatch(readFileSync(file, 'utf8'), chineseText, file);
    }
  }
});

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function collectPackageKeys(value: unknown, keys: Set<string>): void {
  if (typeof value === 'string') {
    const match = /^%([^%]+)%$/u.exec(value);
    if (match?.[1]) keys.add(match[1]);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPackageKeys(item, keys);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectPackageKeys(item, keys);
  }
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

function isVscodeL10nCall(expression: ts.LeftHandSideExpression): boolean {
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 't' &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'l10n' &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'vscode'
  );
}
