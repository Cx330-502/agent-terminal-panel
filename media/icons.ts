const ICON_PATHS = {
  add: '<path d="M8 3v10M3 8h10"/>',
  history:
    '<path d="M2.5 5.5V2.75M2.5 5.5h2.75"/><path d="M3.1 5.1A5.5 5.5 0 1 1 2.5 9"/><path d="M8 5v3.25l2.25 1.25"/>',
  terminal:
    '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="m4.5 6 2 2-2 2M8.5 10h3"/>',
  folder:
    '<path d="M1.5 4.5h4.25l1.5 1.75h7.25v6.25h-13z"/><path d="M1.5 6.25h5.75"/>',
  pencil:
    '<path d="m3 11.75-.5 2 2-.5 7.75-7.75-1.5-1.5z"/><path d="m9.75 5 1.5 1.5"/>',
  restart:
    '<path d="M13.25 5.5V2.75M13.25 5.5H10.5"/><path d="M12.75 5A5.5 5.5 0 1 0 13.5 9"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>'
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function hydrateIcons(root: ParentNode): void {
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('[data-icon]'))) {
    const name = element.dataset.icon;
    if (!isIconName(name) || element.querySelector('.ui-icon')) continue;
    element.replaceChildren(createIcon(name));
  }
}

export function createIcon(name: IconName): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('class', 'ui-icon');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.4');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.innerHTML = ICON_PATHS[name];
  return icon;
}

function isIconName(value: string | undefined): value is IconName {
  return Boolean(value && value in ICON_PATHS);
}
