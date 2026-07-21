import type { ISearchOptions } from '@xterm/addon-search';

export function searchDecorations(): NonNullable<ISearchOptions['decorations']> {
  const styles = getComputedStyle(document.documentElement);
  const match = cssColorToHex(
    styles.getPropertyValue('--vscode-terminal-findMatchHighlightBackground'),
    '#515c6a'
  );
  const active = cssColorToHex(
    styles.getPropertyValue('--vscode-terminal-findMatchBackground'),
    '#ea5c00'
  );
  return {
    matchBackground: match,
    matchOverviewRuler: match,
    activeMatchBackground: active,
    activeMatchColorOverviewRuler: active
  };
}

function cssColorToHex(value: string, fallback: string): string {
  const color = value.trim();
  const longHex = color.match(/^#([0-9a-f]{6})/iu)?.[1];
  if (longHex) return `#${longHex}`;
  const shortHex = color.match(/^#([0-9a-f]{3})$/iu)?.[1];
  if (shortHex) return `#${[...shortHex].map((item) => item.repeat(2)).join('')}`;
  const rgb = color.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/iu);
  if (!rgb) return fallback;
  return `#${rgb.slice(1, 4).map((item) => Number(item).toString(16).padStart(2, '0')).join('')}`;
}
