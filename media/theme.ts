import type { ITheme, Terminal } from '@xterm/xterm';
import type { TerminalSettings } from '../src/shared';
import type { TerminalColors } from '../src/terminalColors';

const appliedThemes = new WeakMap<Terminal, string>();

/** Resolve CSS colors in Chromium before sending the palette to the remote host. */
export function readTerminalColors(): TerminalColors {
  const theme = buildTheme();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d')!;
  const resolve = (color: string): string => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return '#' + [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
      .map((value) => value.toString(16).padStart(2, '0')).join('');
  };
  return { 10: resolve(theme.foreground!), 11: resolve(theme.background!), 12: resolve(theme.cursor!) };
}

export function buildTheme(): ITheme {
  return {
    background: cssColor('--vscode-terminal-background', '--vscode-editor-background', '#1e1e1e'),
    foreground: cssColor('--vscode-terminal-foreground', '--vscode-editor-foreground', '#cccccc'),
    cursor: cssColor('--vscode-terminalCursor-foreground', undefined, '#ffffff'),
    cursorAccent: cssColor('--vscode-terminalCursor-background', undefined, '#000000'),
    selectionBackground: cssColor('--vscode-terminal-selectionBackground', undefined, '#264f78'),
    selectionInactiveBackground: cssColor(
      '--vscode-terminal-inactiveSelectionBackground',
      undefined,
      '#3a3d41'
    ),
    scrollbarSliderBackground: cssColor(
      '--vscode-scrollbarSlider-background',
      undefined,
      'rgba(121, 121, 121, 0.4)'
    ),
    scrollbarSliderHoverBackground: cssColor(
      '--vscode-scrollbarSlider-hoverBackground',
      undefined,
      'rgba(100, 100, 100, 0.7)'
    ),
    scrollbarSliderActiveBackground: cssColor(
      '--vscode-scrollbarSlider-activeBackground',
      undefined,
      'rgba(191, 191, 191, 0.4)'
    ),
    overviewRulerBorder: cssColor(
      '--vscode-terminalOverviewRuler-border',
      '--vscode-terminal-background',
      'transparent'
    ),
    black: cssColor('--vscode-terminal-ansiBlack', undefined, '#000000'),
    red: cssColor('--vscode-terminal-ansiRed', undefined, '#cd3131'),
    green: cssColor('--vscode-terminal-ansiGreen', undefined, '#0dbc79'),
    yellow: cssColor('--vscode-terminal-ansiYellow', undefined, '#e5e510'),
    blue: cssColor('--vscode-terminal-ansiBlue', undefined, '#2472c8'),
    magenta: cssColor('--vscode-terminal-ansiMagenta', undefined, '#bc3fbc'),
    cyan: cssColor('--vscode-terminal-ansiCyan', undefined, '#11a8cd'),
    white: cssColor('--vscode-terminal-ansiWhite', undefined, '#e5e5e5'),
    brightBlack: cssColor('--vscode-terminal-ansiBrightBlack', undefined, '#666666'),
    brightRed: cssColor('--vscode-terminal-ansiBrightRed', undefined, '#f14c4c'),
    brightGreen: cssColor('--vscode-terminal-ansiBrightGreen', undefined, '#23d18b'),
    brightYellow: cssColor('--vscode-terminal-ansiBrightYellow', undefined, '#f5f543'),
    brightBlue: cssColor('--vscode-terminal-ansiBrightBlue', undefined, '#3b8eea'),
    brightMagenta: cssColor('--vscode-terminal-ansiBrightMagenta', undefined, '#d670d6'),
    brightCyan: cssColor('--vscode-terminal-ansiBrightCyan', undefined, '#29b8db'),
    brightWhite: cssColor('--vscode-terminal-ansiBrightWhite', undefined, '#ffffff')
  };
}

export function applyTerminalSettings(terminal: Terminal, settings: TerminalSettings): void {
  terminal.options.fontFamily =
    settings.fontFamily || cssValue('--vscode-editor-font-family') || 'monospace';
  terminal.options.fontSize = settings.fontSize;
  terminal.options.fontWeight = settings.fontWeight as typeof terminal.options.fontWeight;
  terminal.options.fontWeightBold = settings.fontWeightBold as typeof terminal.options.fontWeightBold;
  terminal.options.lineHeight = settings.lineHeight;
  terminal.options.letterSpacing = settings.letterSpacing;
  terminal.options.cursorStyle = settings.cursorStyle === 'line' ? 'bar' : settings.cursorStyle;
  terminal.options.cursorBlink = settings.cursorBlinking;
  terminal.options.cursorWidth = settings.cursorWidth;
  terminal.options.scrollback = settings.scrollback;
  terminal.options.macOptionIsMeta = settings.macOptionIsMeta;
  terminal.options.macOptionClickForcesSelection = settings.macOptionClickForcesSelection;
  terminal.options.altClickMovesCursor = settings.altClickMovesCursor;
  terminal.options.fastScrollSensitivity = settings.fastScrollSensitivity;
  terminal.options.scrollSensitivity = settings.mouseWheelScrollSensitivity;
  terminal.options.wordSeparator = settings.wordSeparators;
  terminal.options.minimumContrastRatio = settings.minimumContrastRatio;
  terminal.options.drawBoldTextInBrightColors = settings.drawBoldTextInBrightColors;
  terminal.options.customGlyphs = settings.customGlyphs;
  const theme = buildTheme();
  const key = JSON.stringify(theme);
  // Reassigning an unchanged theme resets OSC-defined colors inside xterm.
  if (appliedThemes.get(terminal) !== key) {
    terminal.options.theme = theme;
    appliedThemes.set(terminal, key);
  }
}

function cssColor(primary: string, secondary: string | undefined, fallback: string): string {
  return cssValue(primary) || (secondary ? cssValue(secondary) : '') || fallback;
}

function cssValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
