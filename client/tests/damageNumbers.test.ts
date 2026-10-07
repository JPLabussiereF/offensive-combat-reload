// The floating damage numbers (client/ui/damageNumbers.ts): the color of each kind of hit, one number per target
// however many pellets hit it (capped at the health it had), and the layer's life cycle, on a stand-in for the DOM.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { computeDamage, critRegion, LETHAL_DAMAGE } from '@shared/weapons';
import { gunStats } from '@shared/arsenal';
import { DAMAGE_NUMBER_LIFE, DamageNumbers, damageTier, numberPose, ShotDamage } from '../ui/damageNumbers';

describe('números de dano: a cor de cada acerto', () => {
  it('corpo amarelo, cabeça laranja, pássaro vermelho', () => {
    for (const r of ['peito', 'abdomen', 'quadril', 'bracos', 'maos', 'coxas', 'canelas', 'pescoco'] as const) expect(damageTier(r, false)).toBe('normal');
    expect(damageTier('cabeca', false)).toBe('crit');
    expect(damageTier('virilha', false)).toBe('bird');
  });

  it('com a poção do crítico todo tiro é crítico (laranja), menos o pássaro, que continua vermelho', () => {
    for (const r of ['peito', 'canelas', 'maos', 'cabeca'] as const) expect(damageTier(r, true)).toBe('crit');
    expect(damageTier('virilha', true)).toBe('bird');
  });

  it('o laranja é o mesmo dano de cabeça que a fórmula aplica', () => {
    const rifle = gunStats('rifle');
    expect(computeDamage(rifle, 10, critRegion('peito', true), 1)).toBe(computeDamage(rifle, 10, 'cabeca', 1));
  });
});

describe('números de dano: um por alvo em cada tiro', () => {
  const at = new THREE.Vector3(1, 2, 3);

  it('os bagos da garrucha somam num número só por alvo, cada alvo com o seu', () => {
    const shot = new ShotDamage<string>();
    for (let i = 0; i < 5; i++) shot.add('a', at, 4, 'normal');
    shot.add('b', at, 4, 'normal');
    const rows = [...shot.values()];
    expect(rows.map((r) => r.amount)).toEqual([20, 4]);
  });

  it('a cor é a do acerto mais forte e o lugar é o do primeiro bago', () => {
    const shot = new ShotDamage<string>();
    shot.add('a', at, 4, 'normal');
    shot.add('a', new THREE.Vector3(9, 9, 9), 10, 'crit');
    shot.add('a', new THREE.Vector3(7, 7, 7), 4, 'normal');
    const [r] = [...shot.values()];
    expect(r.tier).toBe('crit');
    expect(r.at.toArray()).toEqual([1, 2, 3]);
    shot.add('a', at, LETHAL_DAMAGE, 'bird', 60);
    expect([...shot.values()][0].tier).toBe('bird');
  });

  it('o pássaro mostra a vida que o alvo tinha, não 9999', () => {
    const shot = new ShotDamage<string>();
    shot.add('a', at, LETHAL_DAMAGE, 'bird', 72);
    shot.add('a', at, LETHAL_DAMAGE, 'bird', 72);
    expect([...shot.values()][0].amount).toBe(72);
  });

  it('não guarda o ponto do acerto por referência', () => {
    const shot = new ShotDamage<string>();
    const p = new THREE.Vector3(1, 1, 1);
    shot.add('a', p, 10, 'normal');
    p.set(5, 5, 5);
    expect([...shot.values()][0].at.toArray()).toEqual([1, 1, 1]);
  });
});

describe('números de dano: animação', () => {
  it('nasce maior, encolhe para o tamanho normal e só some no fim', () => {
    expect(numberPose(0)).toEqual({ rise: 0, scale: 1.45, opacity: 1 });
    expect(numberPose(0.12).scale).toBe(1);
    expect(numberPose(0.5).opacity).toBe(1);
    expect(numberPose(0.8).opacity).toBeCloseTo(0.5);
    expect(numberPose(1).opacity).toBeCloseTo(0);
    expect(numberPose(1).rise).toBe(44);
  });
});

// A stand-in for the few DOM bits the layer touches: elements with a class, text and style, a parent to leave.
class FakeEl {
  className = '';
  textContent = '';
  style = { opacity: '', transform: '' };
  parent: FakeLayer | null = null;
  remove() {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
}
class FakeLayer {
  children: FakeEl[] = [];
  appendChild(el: FakeEl) {
    el.parent = this;
    this.children.push(el);
  }
}

describe('números de dano: a camada', () => {
  const layerOf = (root: FakeLayer) => ({ root, create: () => new FakeEl(), size: () => ({ w: 1280, h: 720 }) });

  const camera = () => {
    const c = new THREE.PerspectiveCamera(70, 1280 / 720, 0.1, 500);
    c.updateMatrixWorld();
    return c;
  };

  it('mostra o número arredondado com a classe da cor, e nada para dano zero', () => {
    const layer = new FakeLayer();
    const nums = new DamageNumbers(layerOf(layer));
    nums.show(new THREE.Vector3(0, 0, -10), 22.6, 'crit');
    nums.show(new THREE.Vector3(0, 0, -10), 0, 'normal');
    expect(layer.children.map((e) => [e.className, e.textContent])).toEqual([['dmg-num crit', '23']]);
  });

  it('fica no ponto do acerto projetado na tela e some depois de pouco tempo', () => {
    const layer = new FakeLayer();
    const nums = new DamageNumbers(layerOf(layer));
    const cam = camera();
    nums.show(new THREE.Vector3(0, 0, -10), 30, 'normal');
    nums.update(0.2, cam);
    const el = layer.children[0];
    // Straight ahead: the middle of the screen (risen a bit, drifted a few px at most).
    const [x, y] = el.style.transform.match(/-?[\d.]+/g)!.map(Number);
    expect(Math.abs(x - 640)).toBeLessThan(16);
    expect(y).toBeLessThan(360);
    expect(y).toBeGreaterThan(360 - 44);
    expect(el.style.opacity).toBe('1');
    nums.update(DAMAGE_NUMBER_LIFE, cam);
    expect(layer.children).toHaveLength(0);
  });

  it('atrás da câmera não aparece', () => {
    const layer = new FakeLayer();
    const nums = new DamageNumbers(layerOf(layer));
    nums.show(new THREE.Vector3(0, 0, 10), 30, 'bird');
    nums.update(0.1, camera());
    expect(layer.children[0].style.opacity).toBe('0');
  });

  it('no máximo 24 de uma vez: o mais antigo sai primeiro', () => {
    const layer = new FakeLayer();
    const nums = new DamageNumbers(layerOf(layer));
    for (let i = 1; i <= 30; i++) nums.show(new THREE.Vector3(0, 0, -10), i, 'normal');
    expect(layer.children).toHaveLength(24);
    expect(layer.children[0].textContent).toBe('7');
  });
});
