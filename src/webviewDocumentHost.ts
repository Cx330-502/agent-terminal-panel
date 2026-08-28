import * as vscode from 'vscode';
import type { HostMessage, WebviewMessage } from './shared';
import { StartupLogger } from './startupLogger';
import { getWebviewHtml } from './webviewHtml';
import { WebviewReadyBarrier } from './webviewReadyBarrier';
import {
  WebviewRecoveryController,
  type WebviewReloadReason
} from './webviewRecoveryController';
import { recreateWebviewView } from './webviewViewRecreator';

interface WebviewDocumentHostCallbacks {
  receiveMessage(message: WebviewMessage): void;
  visibilityChanged(visible: boolean): void;
}

export class WebviewDocumentHost implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly readyBarrier = new WebviewReadyBarrier();
  private readonly recovery: WebviewRecoveryController;
  private currentView: vscode.WebviewView | undefined;
  private currentReady = false;
  private currentVisible = false;
  private generation = 0;
  private reloadTask: Promise<void> | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly focusCommand: string,
    private readonly logger: StartupLogger,
    private readonly callbacks: WebviewDocumentHostCallbacks
  ) {
    this.recovery = new WebviewRecoveryController((reason) => this.reloadDocument(reason));
  }

  get view(): vscode.WebviewView | undefined {
    return this.currentView;
  }

  get ready(): boolean {
    return this.currentReady;
  }

  get visible(): boolean {
    return this.currentVisible;
  }

  resolve(view: vscode.WebviewView): void {
    this.logger.beginWebviewResolve();
    this.clearDisposables();
    this.currentView = view;
    this.currentReady = false;
    this.currentVisible = view.visible;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    this.recovery.attach(view.visible);
    this.writeDocument(view);

    this.disposables.push(
      view.webview.onDidReceiveMessage((message: WebviewMessage) => {
        this.recovery.signal();
        this.callbacks.receiveMessage(message);
      }),
      view.onDidChangeVisibility(() => {
        if (this.currentView !== view) return;
        this.currentVisible = view.visible;
        if (!view.visible) this.currentReady = false;
        this.recovery.setVisible(view.visible);
        this.callbacks.visibilityChanged(view.visible);
      }),
      view.onDidDispose(() => {
        if (this.currentView !== view) return;
        this.currentView = undefined;
        this.currentReady = false;
        this.currentVisible = false;
        this.recovery.detach();
        this.callbacks.visibilityChanged(false);
      })
    );
  }

  markReady(): void {
    if (!this.currentView) return;
    this.currentReady = true;
    this.recovery.signal();
    this.logger.webviewReady();
    this.readyBarrier.resolve();
  }

  post(message: HostMessage): void {
    const view = this.currentView;
    if (!this.currentReady || !view) return;
    const generation = this.generation;
    try {
      void view.webview.postMessage(message).then(
        (delivered) => {
          if (!delivered) this.handlePostFailure(view, generation, message.type);
        },
        (error: unknown) => this.handlePostFailure(view, generation, message.type, error)
      );
    } catch (error) {
      this.handlePostFailure(view, generation, message.type, error);
    }
  }

  async show(): Promise<void> {
    if (this.currentView) {
      this.currentView.show(false);
      return;
    }
    await vscode.commands.executeCommand(this.focusCommand);
  }

  async reloadManually(): Promise<void> {
    if (!this.currentView) {
      await this.show();
      return;
    }
    this.recovery.reloadManually();
  }

  waitUntilReady(): Promise<void> {
    if (this.currentReady) return Promise.resolve();
    return this.readyBarrier.wait((timeoutMs) => this.logger.webviewReadyTimeout(timeoutMs));
  }

  dispose(): void {
    this.clearDisposables();
    this.recovery.dispose();
    this.currentView = undefined;
    this.currentReady = false;
    this.currentVisible = false;
  }

  private reloadDocument(reason: WebviewReloadReason): void {
    const view = this.currentView;
    if (!view || this.reloadTask) return;
    this.currentReady = false;
    this.logger.beginWebviewReload(reason, this.generation + 1);
    this.writeDocument(view);
    const task = this.recreateDocument(view, reason);
    this.reloadTask = task;
    void task.then(() => {
      if (this.reloadTask === task) this.reloadTask = undefined;
    });
  }

  private async recreateDocument(
    view: vscode.WebviewView,
    reason: WebviewReloadReason
  ): Promise<void> {
    try {
      const recreated = await recreateWebviewView(
        view,
        (command, ...args) => vscode.commands.executeCommand(command, ...args)
      );
      if (recreated) this.logger.webviewContainerRecreated(reason);
      else this.logger.webviewContainerRecreationFailed(reason);
    } catch (error) {
      this.logger.webviewContainerRecreationFailed(reason, error);
    }
  }

  private writeDocument(view: vscode.WebviewView): void {
    this.generation++;
    view.webview.html = getWebviewHtml(
      view.webview,
      this.extensionUri,
      vscode.env.language,
      this.generation
    );
  }

  private handlePostFailure(
    view: vscode.WebviewView,
    generation: number,
    messageType: HostMessage['type'],
    error?: unknown
  ): void {
    if (this.currentView !== view || this.generation !== generation || !this.currentReady) return;
    this.logger.webviewPostFailed(messageType, error);
    this.recovery.postMessageFailed();
  }

  private clearDisposables(): void {
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}
