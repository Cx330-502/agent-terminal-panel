import type { VSCodeApi } from '../src/shared';
import { WebviewApp } from './app';

declare function acquireVsCodeApi(): VSCodeApi;

const app = new WebviewApp(acquireVsCodeApi());
app.start();
window.addEventListener('unload', () => app.dispose());
