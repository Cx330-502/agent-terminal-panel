import * as fs from 'node:fs';
import * as os from 'node:os';
import * as vscode from 'vscode';

interface CwdPickItem extends vscode.QuickPickItem {
  path?: string;
  browse?: boolean;
}

export function defaultWorkingDirectory(): string {
  const candidate = defaultWorkingDirectoryUri().fsPath;
  return candidate && fs.existsSync(candidate) ? candidate : os.homedir();
}

export async function pickWorkingDirectory(): Promise<string | undefined> {
  const items: CwdPickItem[] = (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
    label: `$(root-folder) ${folder.name}`,
    description: folder.uri.fsPath,
    path: folder.uri.fsPath
  }));
  if (items.length > 0) items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push(
    { label: '$(home) Home', description: os.homedir(), path: os.homedir() },
    { label: `$(folder-opened) ${vscode.l10n.t('Browse…')}`, browse: true }
  );
  const selected = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Choose Agent Working Directory'),
    placeHolder: vscode.l10n.t('The session will start in this directory on the workspace extension host.')
  });
  if (!selected) return undefined;
  if (selected.path) return selected.path;
  if (!selected.browse) return undefined;
  const picked = await vscode.window.showOpenDialog({
    title: vscode.l10n.t('Choose Agent Working Directory'),
    defaultUri: defaultWorkingDirectoryUri(),
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: vscode.l10n.t('Create Here')
  });
  return picked?.[0]?.fsPath;
}

function defaultWorkingDirectoryUri(): vscode.Uri {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const activeFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined;
  return activeFolder?.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(os.homedir());
}
