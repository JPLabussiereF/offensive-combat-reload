// The sun's shadow map (kept free of the DOM: the server's typecheck reaches it through the client's tests).

/**
 * The shadow map is refreshed on demand (QualityManager turns its autoUpdate off), so a frame may come before
 * the sun's map was ever rendered (the first frame, a resize, or a loop that doesn't schedule it: the map
 * editor's, PF-6 Revisions 01). Every lit material samples it, and an unallocated one is a GL error on real
 * GPUs (ANGLE: "Mismatch between texture format and sampler type"): the draw is dropped and only the unlit
 * things show. Software rendering (SwiftShader) tolerates it. This asks for it whenever it's missing.
 */
export function ensureShadowMap(renderer: { shadowMap: { enabled: boolean; needsUpdate: boolean } }, sun: { castShadow: boolean; shadow: { map: unknown } }) {
  if (renderer.shadowMap.enabled && sun.castShadow && !sun.shadow.map) renderer.shadowMap.needsUpdate = true;
}
