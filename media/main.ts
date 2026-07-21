import type { VSCodeApi } from '../src/shared';
import { getWebviewStrings } from '../src/webviewStrings';
import { WebviewApp } from './app';

declare function acquireVsCodeApi(): VSCodeApi;

const app = new WebviewApp(
  acquireVsCodeApi(),
  getWebviewStrings(document.documentElement.lang)
);
app.start();
window.addEventListener('unload', () => app.dispose());
