// The stance layers of the first-person pose (viewmodel.ts), pure so they're tested without WebGL or a DOM.

/**
 * Crouching lowers the gun, landing sinks it (`land`, the spring's value), sliding rolls it inward and lowers
 * it; in camera space. All fade out as the player aims (`ads` 0..1): the shot leaves the center of the screen,
 * so at full aim the sight must stay there.
 */
export function stanceOffset(ads: number, crouch: number, slide: number, land: number): { x: number; y: number; rz: number } {
  const free = 1 - ads;
  return {
    x: -slide * 0.02 * free,
    y: (land - crouch * 0.01 - slide * 0.02) * free,
    rz: slide * 0.22 * free,
  };
}
