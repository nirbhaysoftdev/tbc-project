// src/lib/sector-bus.ts
//
// The rotating sector ring and the industries showcase live in different
// sections of the page, so picking a sector in one has to reach the other.
// A CustomEvent on window keeps them decoupled - no context provider
// threaded through half the tree for a single interaction.

export const SECTOR_EVENT = 'tbc:sector';

/** Jump to the industries showcase and open a specific sector. */
export function openSector(key: string) {
  window.dispatchEvent(new CustomEvent<string>(SECTOR_EVENT, { detail: key }));
  document.getElementById('community')?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}

export function onSector(handler: (key: string) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(SECTOR_EVENT, listener);
  return () => window.removeEventListener(SECTOR_EVENT, listener);
}
