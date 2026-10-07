// The Scene view's camera as numbers (PF-6 Revisions 01, etapa 3), without a screen: Unity's orbit (Alt + left
// drag) around the pivot or the selection's middle, the pan that drags the scene with the cursor, the wheel's
// dolly toward the cursor (perspective and orthographic), F framing a box, and the orientation gizmo's views.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { aroundPivot, axisView, blend, dolly, fly, forwardOf, frame, look, lookAt, orbit, orthoHalfHeight, pan, pivotOf, PITCH_LIMIT, rightOf, unitsPerPixel, upOf, type CameraState } from '../editor/cameraMath';

const FOV = 60;
const ASPECT = 1.5;
const H = 600;

const near = (a: THREE.Vector3, b: THREE.Vector3, eps = 1e-6) => expect(a.distanceTo(b)).toBeLessThan(eps);

/** A three camera placed as the state says (what client/editor/sceneCamera.ts does). */
function cameraOf(s: CameraState, ortho = false): THREE.Camera {
  let c: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  if (ortho) {
    const h = orthoHalfHeight(s.distance, FOV);
    c = new THREE.OrthographicCamera(-h * ASPECT, h * ASPECT, h, -h, -500, 1000);
  } else c = new THREE.PerspectiveCamera(FOV, ASPECT, 0.05, 400);
  c.rotation.order = 'YXZ';
  c.position.copy(s.position);
  c.rotation.set(s.pitch, s.yaw, 0);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

const ndcOf = (p: THREE.Vector3, s: CameraState, ortho = false) => p.clone().project(cameraOf(s, ortho));

describe('câmera da cena: direções', () => {
  it('frente, direita e cima formam a base da câmera do three (ordem YXZ)', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [0.7, -0.4],
      [-2.1, 1.1],
    ]) {
      const cam = cameraOf({ position: new THREE.Vector3(), yaw, pitch, distance: 10 });
      const q = cam.quaternion;
      near(forwardOf(yaw, pitch), new THREE.Vector3(0, 0, -1).applyQuaternion(q));
      near(rightOf(yaw), new THREE.Vector3(1, 0, 0).applyQuaternion(q));
      near(upOf(yaw, pitch), new THREE.Vector3(0, 1, 0).applyQuaternion(q));
    }
  });

  it('olhar para um ponto deixa o pivô nele, à distância certa', () => {
    const s = lookAt(new THREE.Vector3(3, 10, 12), new THREE.Vector3(1, 0, -2));
    near(pivotOf(s), new THREE.Vector3(1, 0, -2), 1e-9);
    expect(s.distance).toBeCloseTo(Math.hypot(2, 10, 14), 9);
  });

  it('o mouse com o botão direito gira sem sair do lugar e para olhando reto para baixo', () => {
    const s = lookAt(new THREE.Vector3(0, 5, 10), new THREE.Vector3());
    const t = look(s, 0.3, -10);
    near(t.position, s.position);
    expect(t.yaw).toBeCloseTo(s.yaw + 0.3, 9);
    expect(t.pitch).toBe(-PITCH_LIMIT);
  });

  it('voar anda na direção da vista (W para a frente, D para a direita, E para cima)', () => {
    const s = lookAt(new THREE.Vector3(0, 5, 10), new THREE.Vector3(0, 5, 0));
    near(fly(s, 1, 0, 0, 2).position, new THREE.Vector3(0, 5, 8));
    near(fly(s, 0, 1, 0, 2).position, new THREE.Vector3(2, 5, 10));
    near(fly(s, 0, 0, 1, 2).position, new THREE.Vector3(0, 7, 10));
    expect(fly(s, 1, 0, 0, 2).distance).toBe(s.distance);
  });
});

describe('câmera da cena: órbita (Alt + botão esquerdo)', () => {
  it('em volta do pivô: a distância fica, e a câmera continua olhando para ele', () => {
    const s = lookAt(new THREE.Vector3(0, 6, 12), new THREE.Vector3(2, 0, 0));
    const c = pivotOf(s);
    const t = orbit(s, c, 0.8, -0.3);
    expect(t.position.distanceTo(c)).toBeCloseTo(s.position.distanceTo(c), 9);
    near(pivotOf(t), c, 1e-9);
    expect(t.yaw).toBeCloseTo(s.yaw + 0.8, 9);
    expect(t.pitch).toBeCloseTo(s.pitch - 0.3, 9);
  });

  it('em volta do meio da seleção (fora do centro da tela): ele fica no mesmo lugar da tela', () => {
    const s = lookAt(new THREE.Vector3(0, 6, 12), new THREE.Vector3());
    const sel = new THREE.Vector3(3, 1, -2);
    const before = ndcOf(sel, s);
    const t = orbit(s, sel, -0.6, 0.2);
    expect(t.position.distanceTo(sel)).toBeCloseTo(s.position.distanceTo(sel), 9);
    const after = ndcOf(sel, t);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('não passa de olhar reto para baixo (a órbita para no topo)', () => {
    const s = aroundPivot(new THREE.Vector3(), 0, -1.4, 10);
    const t = orbit(s, new THREE.Vector3(), 0, -1);
    expect(t.pitch).toBe(-PITCH_LIMIT);
    expect(t.position.y).toBeCloseTo(10, 6);
  });
});

describe('câmera da cena: arrastar (botão do meio e a mão)', () => {
  it('o ponto do pivô anda com o cursor, pixel por pixel', () => {
    const s = lookAt(new THREE.Vector3(4, 8, 14), new THREE.Vector3(1, 0, 0));
    const u = unitsPerPixel(s.distance, FOV, H);
    expect(u).toBeCloseTo((2 * s.distance * Math.tan(Math.PI / 6)) / H, 12);
    const p = pivotOf(s);
    const t = pan(s, 30, -20, u);
    const ndc = ndcOf(p, t);
    // 30 px to the right and 20 px up, on a view 600 px tall (and 900 wide).
    expect(ndc.x * (H * ASPECT) / 2).toBeCloseTo(30, 6);
    expect(ndc.y * (H / 2)).toBeCloseTo(20, 6);
    expect(t.yaw).toBe(s.yaw);
    expect(t.distance).toBe(s.distance);
  });
});

describe('câmera da cena: roda (dolly para o cursor)', () => {
  it('no meio da tela aproxima do pivô, que fica onde está', () => {
    const s = lookAt(new THREE.Vector3(0, 10, 10), new THREE.Vector3());
    const t = dolly(s, { x: 0, y: 0 }, -100, { fov: FOV, aspect: ASPECT, ortho: false });
    expect(t.distance).toBeLessThan(s.distance);
    near(pivotOf(t), pivotOf(s), 1e-9);
    const back = dolly(t, { x: 0, y: 0 }, 100, { fov: FOV, aspect: ASPECT, ortho: false });
    expect(back.distance).toBeCloseTo(s.distance, 9);
  });

  it('fora do meio vai na direção do cursor: o que está sob ele continua sob ele', () => {
    const s = lookAt(new THREE.Vector3(0, 10, 10), new THREE.Vector3());
    const cursor = { x: 0.5, y: -0.3 };
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(cursor.x, cursor.y), cameraOf(s));
    const under = ray.ray.at(9, new THREE.Vector3());
    const t = dolly(s, cursor, -300, { fov: FOV, aspect: ASPECT, ortho: false });
    expect(t.position.distanceTo(under)).toBeLessThan(s.position.distanceTo(under));
    const ndc = ndcOf(under, t);
    expect(ndc.x).toBeCloseTo(cursor.x, 6);
    expect(ndc.y).toBeCloseTo(cursor.y, 6);
  });

  it('na ortográfica muda o tamanho da vista e o ponto sob o cursor fica parado', () => {
    const s = lookAt(new THREE.Vector3(0, 20, 0.001), new THREE.Vector3());
    const cursor = { x: -0.4, y: 0.6 };
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(cursor.x, cursor.y), cameraOf(s, true));
    const under = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())!;
    const t = dolly(s, cursor, -200, { fov: FOV, aspect: ASPECT, ortho: true });
    expect(orthoHalfHeight(t.distance, FOV)).toBeLessThan(orthoHalfHeight(s.distance, FOV));
    const ndc = ndcOf(under, t, true);
    expect(ndc.x).toBeCloseTo(cursor.x, 6);
    expect(ndc.y).toBeCloseTo(cursor.y, 6);
    // The pivot stays at the same depth along the view (the camera keeps its distance to it).
    expect(pivotOf(t).sub(pivotOf(s)).dot(forwardOf(s.yaw, s.pitch))).toBeCloseTo(0, 9);
  });
});

describe('câmera da cena: F (enquadrar) e o gizmo de orientação', () => {
  it('F põe a caixa no centro, inteira na tela, sem mudar a direção', () => {
    const s = lookAt(new THREE.Vector3(30, 25, 40), new THREE.Vector3());
    const box = new THREE.Box3(new THREE.Vector3(8, 0, -3), new THREE.Vector3(12, 6, 1));
    const t = frame(s, box, FOV, ASPECT);
    near(pivotOf(t), box.getCenter(new THREE.Vector3()), 1e-9);
    expect(t.yaw).toBe(s.yaw);
    expect(t.pitch).toBe(s.pitch);
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const ndc = ndcOf(p, t);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
    }
    // A caixa vazia não move nada.
    near(frame(s, new THREE.Box3(), FOV, ASPECT).position, s.position);
  });

  it('cada eixo olha daquele lado em volta do mesmo pivô (Y: de cima)', () => {
    const s = lookAt(new THREE.Vector3(5, 5, 5), new THREE.Vector3(1, 2, 3));
    const views: [Parameters<typeof axisView>[1], THREE.Vector3][] = [
      ['y', new THREE.Vector3(0, -1, 0)],
      ['-y', new THREE.Vector3(0, 1, 0)],
      ['x', new THREE.Vector3(-1, 0, 0)],
      ['-x', new THREE.Vector3(1, 0, 0)],
      ['z', new THREE.Vector3(0, 0, -1)],
      ['-z', new THREE.Vector3(0, 0, 1)],
    ];
    for (const [axis, fwd] of views) {
      const t = axisView(s, axis);
      near(forwardOf(t.yaw, t.pitch), fwd, 1e-9);
      near(pivotOf(t), pivotOf(s), 1e-9);
      expect(t.distance).toBeCloseTo(s.distance, 9);
    }
  });

  it('a transição começa e termina nas vistas e gira pelo lado mais curto', () => {
    const a = aroundPivot(new THREE.Vector3(), 3.0, 0, 10);
    const b = aroundPivot(new THREE.Vector3(4, 0, 0), -3.0, -0.5, 20);
    near(blend(a, b, 0).position, a.position, 1e-9);
    near(blend(a, b, 1).position, b.position, 1e-9);
    // From 3.0 to -3.0 the short way goes past π (about 0.28 rad), not back through 0.
    const mid = blend(a, b, 0.5);
    expect(Math.abs(mid.yaw - 3.0)).toBeLessThan(0.3);
  });
});
