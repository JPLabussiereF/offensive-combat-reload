// The object detail in effect (PF-35, "Detalhe dos objetos"): the player's choice when there is one, else the
// device's default, Leve on phones and tablets and with software rendering, Normal elsewhere. Free of the DOM
// (client/core/settings.ts feeds it the device; client/tests/objectDetail.test.ts checks the rule).

/**
 * How much detail a map is built with: 'leve' builds foliage, dead trees, sky lanterns, roofs, sculpted props and
 * shelves simpler. Only what is drawn changes: the colliders are always the full ones. The server and the map
 * editor always build 'normal'.
 */
export type ObjectDetail = 'normal' | 'leve';

/** `chosen`: what the settings hold (anything but 'normal' or 'leve' counts as no choice). */
export function pickDetail(chosen: unknown, mobile: boolean, software: boolean): ObjectDetail {
  if (chosen === 'normal' || chosen === 'leve') return chosen;
  return mobile || software ? 'leve' : 'normal';
}
