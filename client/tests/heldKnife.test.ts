// The knives other players see in a hand, and the coffin's (PF-17): the Lightsaber shows its glowing blade, not
// only the hilt; the other knives stay one mesh (client/entities/heldWeapons.ts heldKnife).
import * as THREE from 'three';
import { describe, expect, it } from 'bun:test';
import { heldKnife } from '../entities/heldWeapons';

/** How long the knife is along the blade (its -Z), metres. */
const length = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o);
  return box.max.z - box.min.z;
};

describe('faca na mão de outro jogador (terceira pessoa)', () => {
  it('o Sabre de Luz tem a lâmina, não só o cabo', () => {
    const sabre = heldKnife('sabre');
    expect(sabre.children.length).toBeGreaterThan(0);
    // Hilt (13 cm) and blade (55 cm).
    expect(length(sabre)).toBeGreaterThan(0.6);
    // The blade glows: unlit materials, as in first person.
    for (const c of sabre.children) expect(((c as THREE.Mesh).material as THREE.Material).type).toBe('MeshBasicMaterial');
  });

  it('a lâmina some e aparece com a faca', () => {
    const sabre = heldKnife('sabre');
    sabre.visible = false;
    let shown = 0;
    sabre.traverseVisible(() => shown++);
    expect(shown).toBe(0);
  });

  it('as outras facas continuam uma malha só', () => {
    for (const form of ['faca', 'colher', 'baguete', 'peixe', 'macarrao', 'frango'] as const) expect(heldKnife(form).children).toHaveLength(0);
  });
});
