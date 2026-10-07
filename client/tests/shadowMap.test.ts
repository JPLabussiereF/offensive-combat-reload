// The sun's shadow map is refreshed on demand (QualityManager turns three.js's autoUpdate off). The map
// editor's loop never asked for it, so with hardware acceleration on every lit material sampled a shadow map
// that was never allocated and its draw failed (ANGLE: "Mismatch between texture format and sampler type"):
// only the unlit lanterns and candles showed (PF-6 Revisions 01). Every frame now asks for a missing map
// before it renders (client/render/shadows.ts ensureShadowMap, called by RenderContext.render).
import { describe, expect, it } from 'bun:test';
import { ensureShadowMap } from '../render/shadows';

const setup = (o: { enabled?: boolean; castShadow?: boolean; map?: unknown } = {}) => ({
  renderer: { shadowMap: { enabled: o.enabled ?? true, autoUpdate: false, needsUpdate: false } },
  sun: { castShadow: o.castShadow ?? true, shadow: { map: o.map ?? null } },
});

describe('mapa de sombra do sol', () => {
  it('é pedido quando ainda não existe (o primeiro quadro, ou um laço que não o agenda, como o do editor)', () => {
    const { renderer, sun } = setup();
    ensureShadowMap(renderer, sun);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
  });

  it('um laço só de render (sem QualityManager.beforeRender) fica com o mapa depois do primeiro quadro', () => {
    const { renderer, sun } = setup();
    // What three.js does in render() when needsUpdate is set: allocates and draws the map, then clears the flag.
    const render = () => {
      ensureShadowMap(renderer, sun);
      if (renderer.shadowMap.needsUpdate) {
        sun.shadow.map ??= { depthTexture: {} };
        renderer.shadowMap.needsUpdate = false;
      }
    };
    render();
    expect(sun.shadow.map).not.toBeNull();
    render();
    expect(renderer.shadowMap.needsUpdate).toBe(false);
  });

  it('não força a atualização quando o mapa já existe (a cadência é do QualityManager)', () => {
    const { renderer, sun } = setup({ map: {} });
    ensureShadowMap(renderer, sun);
    expect(renderer.shadowMap.needsUpdate).toBe(false);
  });

  it('nada a pedir com as sombras desligadas (qualidade baixa, renderização por software) ou sem sol que projete sombra', () => {
    for (const o of [{ enabled: false }, { castShadow: false }]) {
      const { renderer, sun } = setup(o);
      ensureShadowMap(renderer, sun);
      expect(renderer.shadowMap.needsUpdate).toBe(false);
    }
  });
});
