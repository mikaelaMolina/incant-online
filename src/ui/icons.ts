import { createElement, type IconNode } from 'lucide';

/**
 * Lucide icon (ISC licence) as an SVG string for HUD markup. Decorative: hidden from screen
 * readers; the button or text next to it carries the label.
 */
export function icon(node: IconNode, size = 16, className = ''): string {
  const svg = createElement(node, {
    width: size,
    height: size,
    'stroke-width': 2,
    'aria-hidden': 'true',
    focusable: 'false',
    ...(className ? { class: className } : {}),
  });
  return svg.outerHTML;
}
