// Pets (PF-29): the catalog and its rules (shared/pets.ts: sanitizePet, who sees what, which mode takes them), every
// ability in the zumbi match engine with a fake clock (shared/zombieMatch.ts: the Amora's hold, never through the
// wall, the Bruxinha's duck,
// the cat lifting its owner and yielding to a teammate without ever entering the revives, the weasel's boards, the
// otter's stone and the iguana's tail), and the server (PATCH /api/perfil {pet}, an unknown pet a 400, PlayerInfo.pet by mode and switch,
// never the name, and the pet reaching the zombie match).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { importNavMesh, init, type NavMesh } from 'recast-navigation';
import nav from '@shared/data/navmesh/cemiterio.json';
import { MODE_RULES } from '@shared/modes';
import { COLLARS, emptyPetChoice, PET_ABILITIES, PET_IDS, PETS, petAlong, petLook, petName, petProblems, playerPet, sanitizePet, sanitizePetName, type PetId } from '@shared/pets';
import type { ServerMsg, Vec3 } from '@shared/protocol';
import { ZF, ZOMBIE } from '@shared/zombies';
import { ZombieMatch, type ZombieHost } from '@shared/zombieMatch';
import type { GameServer } from '../app';
import { Browser, enterMap, Player, sleep, startTestServer } from './helpers';

const ORIGINAL = structuredClone(ZOMBIE);
const ORIGINAL_PETS = structuredClone(PET_ABILITIES);
afterEach(() => {
  Object.assign(ZOMBIE, structuredClone(ORIGINAL));
  for (const [k, v] of Object.entries(structuredClone(ORIGINAL_PETS))) Object.assign(PET_ABILITIES[k as PetId], v);
});

describe('catálogo dos pets', () => {
  it('seis pets, todos grátis por enquanto, com 2 ou 3 pelagens (a Amora fixa) e os números das habilidades', () => {
    expect(petProblems()).toEqual([]);
    expect(PET_IDS).toEqual(['amora', 'bruxinha', 'gato', 'fuinha', 'lontra', 'iguana']);
    expect(PET_IDS.every((id) => PETS[id].libera === 'livre')).toBe(true);
    expect(PETS.amora).toMatchObject({ fixo: true, pelagens: [], porte: 'cachorro' });
    expect(PETS.bruxinha.voa).toBe(true);
    expect(COLLARS).toHaveLength(8);
    expect(MODE_RULES['mata-mata'].pets).toBe('cosmetic');
    expect(MODE_RULES['corrida-armada'].pets).toBe('cosmetic');
    expect(MODE_RULES.zumbi.pets).toBe('ability');
  });

  it('sanitizePet: conta nova sem pet; pet, interruptores e aparência de cada pet só quando válidos', () => {
    expect(sanitizePet(null)).toEqual(emptyPetChoice());
    expect(sanitizePet({ id: 'dragao', pvp: 'sim' })).toEqual({ id: null, pvp: true, pve: true, cfg: {} });
    const c = sanitizePet({
      id: 'gato',
      pvp: false,
      cfg: {
        gato: { nome: '  Mingau\u0000 <b>  da Silva Sauro ', cor: 'laranja', coleira: 'roxa', extra: 1 },
        lontra: { cor: 'neon', coleira: 'dourada' },
        // The Amora is a character: her name and coat are hers.
        amora: { nome: 'Totó', cor: 'branca', coleira: 'azul' },
        dragao: { nome: 'x' },
      },
    });
    expect(c).toEqual({ id: 'gato', pvp: false, pve: true, cfg: { gato: { nome: 'Mingau b da', cor: 'laranja', coleira: 'roxa' }, amora: { coleira: 'azul' } } });
    expect(sanitizePetName('Ab'.repeat(10))).toHaveLength(12);
    expect(sanitizePetName('   ')).toBe('');
    expect(petLook(c, 'lontra')).toEqual({ nome: null, cor: 'marrom', coleira: 'vermelha' });
    expect(petName('gato', 'pt-BR', c)).toBe('Mingau b da');
    expect(petName('amora', 'en', c)).toBe('Amora');
    expect(petName('fuinha', 'pt-BR', c)).toBe('Fuinha');
    // A pet only for the support pack can't be taken without it (none is, for now).
    PETS.lontra.libera = 'apoio';
    try {
      expect(sanitizePet({ id: 'lontra' }).id).toBeNull();
      expect(sanitizePet({ id: 'lontra' }, true).id).toBe('lontra');
    } finally {
      PETS.lontra.libera = 'livre';
    }
  });

  it('o que os outros veem: o pet, a pelagem e a coleira, nunca o nome; e só no modo em que o interruptor deixa', () => {
    const c = sanitizePet({ id: 'gato', pvp: false, pve: true, cfg: { gato: { nome: 'Segredo', cor: 'preta' } } });
    const p = playerPet(c)!;
    expect(p).toEqual({ id: 'gato', cor: 'preta', coleira: 'vermelha', pvp: false, pve: true });
    expect(JSON.stringify(p)).not.toContain('Segredo');
    expect(playerPet(emptyPetChoice())).toBeNull();
    expect(petAlong(p, MODE_RULES['mata-mata'])).toBe(false);
    expect(petAlong(p, MODE_RULES.zumbi)).toBe(true);
    // The shooting range (no mode) is PvP.
    expect(petAlong(p, null)).toBe(false);
    expect(petAlong({ ...p, pvp: true }, null)).toBe(true);
  });
});

// --- The match engine, with a fake clock --------------------------------------------------------------------

let navMesh: NavMesh;
beforeAll(async () => {
  await init();
  navMesh = importNavMesh(new Uint8Array(Buffer.from(nav.dados, 'base64'))).navMesh;
});

function quick() {
  Object.assign(ZOMBIE, { inicioSegundos: 0.2, intervaloSegundos: 0.2, intervaloChefeSegundos: 0.2, fimSegundos: 0.3 });
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Fake {
  match: ZombieMatch;
  t: number;
  events: ServerMsg[];
  hp: Map<number, number>;
  feet: Map<number, Vec3>;
  step(seconds: number, each?: () => void): void;
  until(done: () => boolean, each?: () => void, max?: number): void;
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[];
  pet(id: number, act?: string): Extract<ServerMsg, { t: 'zpet' }>[];
}

/** Players at `spots` with their pets (index i is player i + 1), health on the host's side as Session keeps it. */
function fakeMatch(spots: [Vec3, PetId | null][], seed = 1): Fake {
  const f = { t: 0, events: [] as ServerMsg[], hp: new Map<number, number>(), feet: new Map<number, Vec3>() } as Fake;
  const dead = new Set<number>();
  const host: ZombieHost = {
    now: () => f.t,
    rng: seeded(seed),
    emit: (m) => f.events.push(m),
    hurt: (id, amount) => {
      const left = (f.hp.get(id) ?? 100) - amount;
      f.hp.set(id, Math.max(0, left));
      if (left <= 0 && !f.match.lethal(id)) {
        dead.add(id);
        f.match.died(id);
      }
    },
    giveXp: () => {},
    setLoadout: () => {},
    bleedOut: (id) => {
      dead.add(id);
      f.match.died(id);
    },
    revive: (id, h) => f.hp.set(id, 100 * h),
    allowRespawn: (id) => {
      dead.delete(id);
      f.hp.set(id, 100);
    },
    newMatch: (ids) => ids.forEach((id) => (dead.delete(id), f.hp.set(id, 100))),
    health: (id) => (f.hp.get(id) ?? 100) / 100,
  };
  f.match = new ZombieMatch(host, navMesh, ZOMBIE.mapas.cemiterio!);
  spots.forEach(([p, pet], i) => {
    f.feet.set(i + 1, p);
    f.hp.set(i + 1, 100);
    f.match.join(i + 1, `P${i + 1}`, pet);
  });
  f.step = (seconds, each) => {
    for (let i = 0; i < seconds * 20; i++) {
      f.t += 50;
      f.match.tick(0.05, [...f.feet].map(([id, feet]) => ({ id, feet, grounded: true, alive: !dead.has(id) })));
      each?.();
    }
  };
  f.until = (done, each, max = 600) => {
    for (let i = 0; i < max * 20 && !done(); i++) f.step(0.05, each);
    if (!done()) throw new Error('nunca aconteceu');
  };
  f.of = (t) => f.events.filter((e) => e.t === t) as never;
  f.pet = (id, act) => f.of('zpet').filter((e) => e.id === id && (!act || e.act === act));
  return f;
}

const YARD: Vec3 = [0, 0.1, 0];
type Z = { id: number; pos: Vec3; kind: string; act: string | null; riseUntil: number; heldUntil: number; duckUntil: number; dazeUntil: number; lureUntil: number; lureAt: Vec3 | null; cd: Record<string, number> };
const zs = (f: Fake) => [...f.match.zombies.values()] as unknown as Z[];
type Engine = { spawn(kind: string, at: Vec3): Z | null; startAct(z: Z, act: string, until: number): void; ghosts: Map<number, object> };
const engine = (f: Fake) => f.match as unknown as Engine;
/** A zombie of `kind` out of the ground at `at` (the others killed first when `alone`). */
function put(f: Fake, kind: string, at: Vec3, alone = false): Z {
  if (alone) for (const z of zs(f)) f.match.damage(z.id, null, 1e9, 'gun');
  const z = engine(f).spawn(kind, at)!;
  z.riseUntil = 0;
  return z;
}

describe('habilidades dos pets no motor do zumbi', () => {
  it('Segura, Amora!: o zumbi mais perto do dono fica segurado pela canela, parado; depois só de novo após a recarga', () => {
    quick();
    Object.assign(PET_ABILITIES.amora, { alcance: 40, segura: 3, recarga: 18 });
    const f = fakeMatch([[YARD, 'amora']]);
    f.until(() => f.pet(1, 'hold').length > 0);
    const ev = f.pet(1, 'hold')[0];
    const z = zs(f).find((o) => o.id === ev.z)!;
    expect(ev.until - f.t).toBeGreaterThan(2900);
    expect(ev.ready - f.t).toBeGreaterThan(17_000);
    expect(f.match.snapshot().z.find((n) => n[0] === z.id)![6] & ZF.held).toBe(ZF.held);
    const at: Vec3 = [...z.pos];
    f.step(2.5);
    expect(Math.hypot(z.pos[0] - at[0], z.pos[2] - at[2])).toBeLessThan(0.15);
    // The next hold waits for the cooldown.
    f.step(10);
    expect(f.pet(1, 'hold')).toHaveLength(1);
  });

  it('a Amora não atravessa o muro: só segura um zumbi sem o muro no meio (ou por um vão aberto)', () => {
    quick();
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    Object.assign(PET_ABILITIES.amora, { alcance: 40, recarga: 0.5 });
    const f = fakeMatch([[YARD, 'amora']]);
    const walled = (pos: Vec3) => (f.match as unknown as { walled(a: Vec3, b: Vec3): boolean }).walled(YARD, pos);
    let seen = 0;
    let outside = 0;
    f.until(
      () => f.pet(1, 'hold').length >= 3,
      () => {
        for (const z of zs(f)) if (f.t >= z.riseUntil && walled(z.pos)) outside++;
        // A held zombie stands still: where it is now is where it was held.
        for (const ev of f.pet(1, 'hold').slice(seen)) expect(walled(zs(f).find((o) => o.id === ev.z)!.pos)).toBe(false);
        seen = f.pet(1, 'hold').length;
      },
    );
    // There were zombies out of the ground beyond the wall, in her range, and she left them alone.
    expect(outside).toBeGreaterThan(0);
  });

  it('Segura, Amora!: segurar cancela o golpe que o zumbi já tinha começado; o tranco no Segurança não (P34)', () => {
    quick();
    const f = fakeMatch([[YARD, 'amora']]);
    const pet = (f.match.parts.get(1) as unknown as { pet: { ready: number } }).pet;
    pet.ready = Infinity;
    f.step(0.5);
    const z = put(f, 'comum', [0.8, 0.1, 0], true);
    engine(f).startAct(z, 'swipe', f.t + 400);
    pet.ready = 0;
    f.step(0.05);
    expect(f.pet(1, 'hold')[0].z).toBe(z.id);
    expect(z.act).toBeNull();
    // The swipe never lands, and none starts while held.
    f.step(1);
    expect(f.hp.get(1)).toBe(100);
    expect(z.act).toBeNull();
    // A bruiser only takes a jolt: the blow it started goes on.
    pet.ready = Infinity;
    const brute = put(f, 'brutamontes', [0.8, 0.1, 0], true);
    engine(f).startAct(brute, 'swipe', f.t + 400);
    pet.ready = 0;
    f.step(0.05);
    expect(f.pet(1, 'nudge').at(-1)!.z).toBe(brute.id);
    expect(brute.act).toBe('swipe');
  });

  it('pet desligado no PvE (ou nenhum) não age', () => {
    quick();
    const f = fakeMatch([[YARD, null]]);
    f.until(() => f.of('zend').length > 0);
    expect(f.of('zpet')).toHaveLength(0);
  });

  it('a Amora só dá um tranco no Segurança e nos chefes', () => {
    quick();
    for (const w of ZOMBIE.ondas) Object.assign(w, { tipos: { brutamontes: 1 } });
    Object.assign(PET_ABILITIES.amora, { alcance: 40 });
    const f = fakeMatch([[YARD, 'amora']]);
    f.until(() => f.of('zpet').length > 0);
    const ev = f.pet(1)[0];
    expect(ev.act).toBe('nudge');
    expect(ev.until - f.t).toBeLessThanOrEqual(PET_ABILITIES.amora.tranco * 1000);
  });

  it('Feitiço do Pato: o peso do tipo pela distância escolhe o alvo, que fica na boia, parado e levando tiro (P35)', () => {
    quick();
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    const f = fakeMatch([[YARD, 'bruxinha']], 3);
    const pet = (f.match.parts.get(1) as unknown as { pet: { ready: number } }).pet;
    pet.ready = Infinity;
    f.step(0.5);
    // A Fiscal (corredor, 1.6) at 2 m beats a plain one at 1.5 m (1.6 / 2 > 1 / 1.5)...
    const plain = put(f, 'comum', [1.5, 0.1, 0], true);
    const runner = put(f, 'corredor', [0, 0.1, 2]);
    const score = (z: Z) => (PET_ABILITIES.bruxinha.peso[z.kind] ?? 1) / Math.max(1, Math.hypot(z.pos[0] - YARD[0], z.pos[2] - YARD[2]));
    expect(score(runner)).toBeGreaterThan(score(plain));
    pet.ready = 0;
    f.step(0.05);
    const ev = f.pet(1, 'duck')[0];
    expect(ev.z).toBe(runner.id);
    expect(runner.act).toBeNull();
    expect(f.match.snapshot().z.find((n) => n[0] === runner.id)![6] & ZF.duck).toBe(ZF.duck);
    // It still takes shots (no hitbox lost).
    expect(f.match.damage(runner.id, 1, 1, 'head')).toBe(true);
    // ...but one far off loses to the plain one at the owner's feet (no longer "any variant first").
    const g = fakeMatch([[YARD, 'bruxinha']], 3);
    const gpet = (g.match.parts.get(1) as unknown as { pet: { ready: number } }).pet;
    gpet.ready = Infinity;
    g.step(0.5);
    const near = put(g, 'comum', [1.2, 0.1, 0], true);
    put(g, 'corredor', [0, 0.1, 6]);
    gpet.ready = 0;
    g.step(0.05);
    expect(g.pet(1, 'duck')[0].z).toBe(near.id);
  });

  it('Feitiço do Pato: numa onda só de comuns ela age; chefes são imunes', () => {
    quick();
    for (const w of ZOMBIE.ondas) Object.assign(w, { tipos: {} });
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    Object.assign(PET_ABILITIES.bruxinha, { alcance: 60 });
    const f = fakeMatch([[YARD, 'bruxinha']]);
    f.until(() => f.pet(1, 'duck').length > 0);
    expect(zs(f).find((o) => o.id === f.pet(1, 'duck')[0].z)!.kind).toBe('comum');
    // Bosses are immune: a boss wave with only the boss gets no duck.
    for (const w of ZOMBIE.ondas) w.zumbis = 0;
    const g = fakeMatch([[YARD, 'bruxinha']]);
    g.until(() => g.match.wave === 4 && zs(g).length > 0, () => {
      for (const o of zs(g)) if (!['coveiro', 'noiva', 'prefeito'].includes(o.kind) && g.t >= o.riseUntil) g.match.damage(o.id, 1, 1e9, 'head');
    });
    const boss = zs(g).find((o) => o.kind === 'coveiro')!;
    g.step(4);
    expect(g.pet(1, 'duck').filter((e) => e.z === boss.id)).toHaveLength(0);
  });

  it('Pedrada: o Tio inchando perto do dono murcha (o golpe é cancelado) e fica tonto', () => {
    quick();
    for (const w of ZOMBIE.ondas) Object.assign(w, { tipos: { inchado: 1 } });
    const f = fakeMatch([[YARD, 'lontra']]);
    f.until(() => f.pet(1, 'stone').length > 0);
    const ev = f.pet(1, 'stone')[0];
    const z = zs(f).find((o) => o.id === ev.z)!;
    expect(z.kind).toBe('inchado');
    expect(z.act).toBeNull();
    expect(z.dazeUntil).toBe(ev.until);
    expect(ev.until - f.t).toBeLessThanOrEqual(PET_ABILITIES.lontra.tonto * 1000);
    // Nobody blew up on the stone (the burst it was swelling for never came).
    expect(f.of('zfx').filter((e) => e.fx === 'boom' && e.id === z.id)).toHaveLength(0);
  });

  it('Pedrada: o Tio murcho só volta a inchar depois de lontra.murcha, mais que o tonto (P32)', () => {
    quick();
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    const f = fakeMatch([[YARD, 'lontra']]);
    f.step(0.5);
    const bloat = put(f, 'inchado', [1, 0.1, 0], true);
    engine(f).startAct(bloat, 'fuse', f.t + 5000);
    f.step(0.05);
    const ev = f.pet(1, 'stone')[0];
    expect(ev.z).toBe(bloat.id);
    expect(bloat.cd.fuse).toBe(f.t + PET_ABILITIES.lontra.murcha * 1000);
    expect(PET_ABILITIES.lontra.murcha).toBeGreaterThan(PET_ABILITIES.lontra.tonto);
    // Dizzy, then awake by the owner, but no swelling until murcha is over.
    f.until(() => f.t >= bloat.cd.fuse - 100, () => expect(bloat.act).not.toBe('fuse'));
    // Then it swells again (the otter is still on her cooldown).
    f.until(() => bloat.act === 'fuse', undefined, 5);
    expect(f.t).toBeGreaterThanOrEqual(bloat.cd.fuse);
  });

  it('Rabo de Isca: um golpe deixa o dono com pouca vida e os zumbis em volta vão atrás do rabo', () => {
    quick();
    const f = fakeMatch([[YARD, 'iguana']]);
    f.hp.set(1, 40);
    f.until(() => f.pet(1, 'tail').length > 0);
    const ev = f.pet(1, 'tail')[0];
    expect(ev).toBeDefined();
    expect(ev.at).toEqual(YARD);
    const lured = zs(f).filter((z) => z.lureUntil === ev.until);
    expect(lured.length).toBeGreaterThan(0);
    for (const z of lured) expect(z.lureAt).toEqual(YARD);
    expect(f.hp.get(1)! / 100).toBeLessThanOrEqual(PET_ABILITIES.iguana.vida);
  });

  it('Rabo de Isca: o golpe de um fantasma também solta o rabo (P33)', () => {
    quick();
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    const f = fakeMatch([[YARD, 'iguana']]);
    f.step(0.5);
    const z = put(f, 'comum', [3, 0.1, 0], true);
    f.hp.set(1, 30);
    // A ghost of the haunted graves right at the owner's chest, ready to strike.
    engine(f).ghosts.set(999, { id: 999, target: 1, pos: [YARD[0], YARD[1] + 1.1, YARD[2]], until: f.t + 10_000, nextHit: 0, phase: 0 });
    f.step(0.05);
    expect(f.hp.get(1)).toBe(30 - ZOMBIE.fantasmas.dano);
    const ev = f.pet(1, 'tail')[0];
    expect(ev).toBeDefined();
    expect(z.lureUntil).toBe(ev.until);
  });

  it('Sétima Vida sozinho: caído com carga não é derrota; a gata levanta o dono, e sem cargas cair é perder', () => {
    quick();
    Object.assign(PET_ABILITIES.gato, { cargas: 1, espera: 0.5, segundos: 2 });
    const f = fakeMatch([[YARD, 'gato']]);
    f.step(0.5);
    expect(f.match.petCanLift(1)).toBe(true);
    f.hp.set(1, 0);
    expect(f.match.lethal(1)).toBe(true);
    // Alone and down, but the cat is coming: the match goes on.
    expect(f.match.phase).toBe('wave');
    expect(f.pet(1, 'lift')[0]).toMatchObject({ n: 1 });
    f.step(2.6);
    expect(f.match.info(1)!.state).toBe('up');
    expect(f.hp.get(1)).toBe(100 * PET_ABILITIES.gato.vida);
    expect(f.pet(1, 'up')[0]).toMatchObject({ n: 0 });
    // The cat's lift is no revive: nobody got the money or the stat, and 'zup' says nobody did it.
    expect(f.of('zrevive')).toHaveLength(0);
    expect(f.of('zup').at(-1)).toMatchObject({ id: 1, by: null });
    // No charges left: down alone is the end.
    expect(f.match.petCanLift(1)).toBe(false);
    f.match.lethal(1);
    expect(f.of('zend')).toHaveLength(1);
  });

  it('Sétima Vida em dupla: a gata cede a vez quando um colega começa a reanimar e nunca entra nas reanimações', () => {
    quick();
    Object.assign(PET_ABILITIES.gato, { espera: 0.5, segundos: 6 });
    Object.assign(ZOMBIE.jogador, { reanimarSegundos: 3 });
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    const f = fakeMatch([[YARD, 'gato'], [[1.2, 0.1, 0], null]]);
    f.step(0.5);
    f.hp.set(1, 0);
    f.match.lethal(1);
    f.step(1.5);
    // A teammate starts reviving: the cat yields (and the revive is the teammate's).
    f.match.revive(2, 1, true);
    f.step(0.1);
    expect(f.pet(1, 'yield')).toHaveLength(1);
    expect(f.of('zrevive').every((r) => r.by === 2)).toBe(true);
    // They let go: the cat goes on where it was.
    f.match.revive(2, 1, false);
    f.step(0.1);
    expect(f.pet(1, 'lift')).toHaveLength(2);
    expect(f.pet(1, 'lift')[1].until - f.t).toBeLessThan(6000);
    // They come back and finish the revive: their revive, their money; the cat's charge is still there.
    f.match.revive(2, 1, true);
    f.step(3.2);
    expect(f.match.info(1)!.state).toBe('up');
    expect(f.of('zup').at(-1)).toMatchObject({ id: 1, by: 2 });
    expect(f.match.info(2)!.revives).toBe(1);
    expect(f.pet(1, 'up')).toHaveLength(0);
    expect(f.match.petCanLift(1)).toBe(true);
    // Every revive on the network is a player's, never the cat's.
    expect(f.of('zrevive').every((r) => r.by === 2)).toBe(true);
  });

  it('Mão na Massa: a fuinha prega tábuas devagar na barricada danificada perto do dono, sem dinheiro', () => {
    quick();
    Object.assign(ZOMBIE, { inicioSegundos: 60 });
    Object.assign(PET_ABILITIES.fuinha, { tabuaSegundos: 0.5, tabuas: 2, recarga: 5 });
    const map = ZOMBIE.mapas.cemiterio!;
    const gap = map.barricadas[0];
    // Inside the wall, 1.2 m from the gap's middle.
    const [x0, z0, x1, z1] = map.dentro;
    const [cx, cy, cz] = gap.centro;
    const at: Vec3 = gap.eixo === 'x' ? [cx, cy + 0.1, cz + Math.sign((z0 + z1) / 2 - cz) * 1.2] : [cx + Math.sign((x0 + x1) / 2 - cx) * 1.2, cy + 0.1, cz];
    const f = fakeMatch([[at, 'fuinha']]);
    (f.match.parts.get(1) as { money: number }).money = 1000;
    f.step(0.2);
    // The player builds it (paid), then the horde takes three boards off.
    f.until(() => f.match.barricade(0)!.built, () => f.match.barricadeWork(1, 0, true));
    f.match.barricadeWork(1, 0, false);
    const bars = (f.match as unknown as { bars: { boards: number; hp: number }[] }).bars;
    Object.assign(bars[0], { boards: 2 });
    const money = f.match.info(1)!.money;
    f.until(() => f.match.barricade(0)!.boards === 4);
    const nails = f.of('zbar').filter((b) => b.fx === 'nail');
    expect(nails).toHaveLength(2);
    expect(nails.every((b) => b.by === undefined && b.award === undefined)).toBe(true);
    expect(f.match.info(1)!.money).toBe(money);
    expect(f.pet(1, 'nail').some((e) => e.i === 0)).toBe(true);
    // Two boards this time, then the cooldown.
    f.step(1);
    expect(f.match.barricade(0)!.boards).toBe(4);
    f.step(5);
    expect(f.match.barricade(0)!.boards).toBe(5);
  });

  it('uma partida nova devolve as cargas da gata', () => {
    quick();
    Object.assign(PET_ABILITIES.gato, { cargas: 1, espera: 0.1, segundos: 0.5 });
    const f = fakeMatch([[YARD, 'gato']]);
    f.step(0.5);
    f.hp.set(1, 0);
    f.match.lethal(1);
    f.step(1);
    expect(f.match.petCanLift(1)).toBe(false);
    // Down again with no cat: the end, the summary, then a new match.
    f.match.lethal(1);
    f.until(() => f.match.phase === 'wave' && f.of('zend').length === 1 && f.t > 0, undefined, 30);
    expect(f.match.petCanLift(1)).toBe(true);
  });
});

// --- On the real server ------------------------------------------------------------------------------------

let game: GameServer;
beforeAll(async () => {
  game = await startTestServer();
});
afterAll(async () => {
  await game?.close();
});

async function connect(b: Browser) {
  const p = await Player.connect(game, await b.ticket());
  p.send({ t: 'hello' });
  await p.next('welcome');
  return p;
}

describe('pets no servidor', () => {
  it('PATCH /api/perfil {pet}: conferido como a aparência e devolvido no perfil', async () => {
    const b = new Browser(game);
    await b.register('Dona da Gata');
    expect((await b.req('GET', '/api/perfil')).body.pet).toEqual(emptyPetChoice());
    const r = await b.req('PATCH', '/api/perfil', { pet: { id: 'gato', pvp: false, cfg: { gato: { nome: 'Mingau', cor: 'laranja', coleira: 'rosa' }, amora: { nome: 'Rex' } } } });
    expect(r.status).toBe(200);
    expect(r.body.pet).toEqual({ id: 'gato', pvp: false, pve: true, cfg: { gato: { nome: 'Mingau', cor: 'laranja', coleira: 'rosa' } } });
    // Left in the yard: no pet, the looks kept.
    const yard = await b.req('PATCH', '/api/perfil', { pet: { id: null, cfg: r.body.pet.cfg } });
    expect(yard.body.pet).toMatchObject({ id: null, cfg: { gato: { nome: 'Mingau' } } });
  });

  it('migração 009_pets: registrada com esse nome e roda de novo sem erro num banco que já tinha a coluna (P30)', async () => {
    const { rows } = await game.deps.db.query<{ name: string }>("SELECT name FROM schema_migrations WHERE name LIKE '%_pets.sql'");
    expect(rows.map((r) => r.name)).toContain('009_pets.sql');
    // A database that ran it as 007_pets.sql already has the column: running it again changes nothing.
    const sql = await Bun.file(new URL('../migrations/009_pets.sql', import.meta.url)).text();
    await game.deps.db.query(sql);
    const col = await game.deps.db.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'player_profile' AND column_name = 'pet'");
    expect(col.rows).toHaveLength(1);
  });

  it('PATCH /api/perfil {pet}: espécie desconhecida é 400 pet_invalido; cor e nome fora do formato são limpos (P36)', async () => {
    const b = new Browser(game);
    await b.register('Dono do Dragao');
    await b.req('PATCH', '/api/perfil', { pet: { id: 'lontra' } });
    const bad = await b.req('PATCH', '/api/perfil', { pet: { id: 'dragao' } });
    expect(bad.status).toBe(400);
    expect(bad.body.erro).toBe('pet_invalido');
    // Nothing changed: the otter still goes along.
    expect((await b.req('GET', '/api/perfil')).body.pet.id).toBe('lontra');
    // An unknown coat or collar and a long name: saved silently as valid, like the appearance.
    const r = await b.req('PATCH', '/api/perfil', { pet: { id: 'lontra', cfg: { lontra: { nome: 'Nome comprido demais para pet', cor: 'neon', coleira: 'xadrez' } } } });
    expect(r.status).toBe(200);
    expect(r.body.pet).toMatchObject({ id: 'lontra', cfg: { lontra: { nome: 'Nome comprid' } } });
    expect(r.body.pet.cfg.lontra.cor).toBeUndefined();
    expect(r.body.pet.cfg.lontra.coleira).toBeUndefined();
    // A look for an unknown pet in cfg: dropped silently, 200 (P38).
    const extra = await b.req('PATCH', '/api/perfil', { pet: { id: 'lontra', cfg: { dragao: { nome: 'Smaug' }, lontra: { cor: 'chocolate' } } } });
    expect(extra.status).toBe(200);
    expect(Object.keys(extra.body.pet.cfg)).toEqual(['lontra']);
    expect(JSON.stringify(extra.body.pet)).not.toContain('Smaug');
  });

  it('PATCH /api/perfil {pet}: um pet que não é objeto nem null é 400 pet_invalido e nada muda (P39)', async () => {
    const b = new Browser(game);
    await b.register('Dono Teimoso');
    await b.req('PATCH', '/api/perfil', { pet: { id: 'iguana', cfg: { iguana: { cor: 'laranja' } } } });
    for (const pet of ['gato', 7, true, ['gato'], []]) {
      const r = await b.req('PATCH', '/api/perfil', { pet });
      expect({ pet, status: r.status, erro: r.body.erro }).toEqual({ pet, status: 400, erro: 'pet_invalido' });
    }
    expect((await b.req('GET', '/api/perfil')).body.pet).toMatchObject({ id: 'iguana', cfg: { iguana: { cor: 'laranja' } } });
    // null is still "no pet".
    const none = await b.req('PATCH', '/api/perfil', { pet: null });
    expect(none.status).toBe(200);
    expect(none.body.pet.id).toBeNull();
  });

  it('PlayerInfo.pet: no PvP só com o interruptor de PvP, no zumbi com o de PvE; nunca o nome', async () => {
    const a = new Browser(game);
    await a.register('Dono Amora');
    await a.req('PATCH', '/api/perfil', { pet: { id: 'amora', pvp: true, pve: false, cfg: { amora: { coleira: 'azul' } } } });
    const b = new Browser(game);
    await b.register('Dono Gato');
    await b.req('PATCH', '/api/perfil', { pet: { id: 'gato', pvp: false, pve: true, cfg: { gato: { nome: 'Segredo', cor: 'preta' } } } });
    const pa = await connect(a);
    const pb = await connect(b);
    const ja = await enterMap(pa, 'rua', 'mata-mata');
    const jb = await enterMap(pb, 'rua', 'mata-mata');
    const amora = jb.players.find((p) => p.id === ja.you)!;
    expect(amora.pet).toEqual({ id: 'amora', cor: '', coleira: 'azul', pvp: true, pve: false });
    // The cat's PvP switch is off: no pet in a deathmatch.
    const joined = await pa.next('playerJoined', (m) => m.player.id === jb.you);
    expect(joined.player.pet).toBeUndefined();
    expect(JSON.stringify(jb)).not.toContain('Segredo');
    pa.close();
    pb.close();
    await sleep(100);
    // In the zumbi mode it's the other way around.
    const pa2 = await connect(a);
    const pb2 = await connect(b);
    const za = await enterMap(pa2, 'cemiterio', 'zumbi');
    const zb = await enterMap(pb2, 'cemiterio', 'zumbi');
    expect(zb.players.find((p) => p.id === za.you)!.pet).toBeUndefined();
    expect(zb.players.find((p) => p.id === zb.you)!.pet).toEqual({ id: 'gato', cor: 'preta', coleira: 'vermelha', pvp: false, pve: true });
    expect(JSON.stringify(zb)).not.toContain('Segredo');
    pa2.close();
    pb2.close();
    await sleep(100);
  });

  it('o pet chega à partida zumbi do servidor e age: a Amora segura um zumbi e todos recebem o zpet', async () => {
    quick();
    Object.assign(ZOMBIE, { inicioSegundos: 0.3 });
    Object.assign(PET_ABILITIES.amora, { alcance: 60, recarga: 60 });
    const b = new Browser(game);
    await b.register('Amiga da Amora');
    await b.req('PATCH', '/api/perfil', { pet: { id: 'amora' } });
    const p = await connect(b);
    p.send({ t: 'create', name: 'Pets', map: 'cemiterio', mode: 'zumbi' });
    const j = await p.next('joined');
    // Out in the grave field, by where they rise: the Amora never picks one with the wall in between.
    const rise = ZOMBIE.mapas.cemiterio!.surgir[0];
    const at: Vec3 = [rise[0], rise[1] + 0.1, rise[2]];
    p.send({ t: 'respawn', p: at, yaw: 0 });
    await p.next('spawned', (m) => m.id === j.you);
    const keep = setInterval(() => p.send({ t: 'state', s: { p: at, yaw: 0, pitch: 0, f: 64 } }), 50);
    try {
      const ev = await p.next('zpet', (m) => m.id === j.you, 15_000);
      expect(ev.act === 'hold' || ev.act === 'nudge').toBe(true);
      expect(typeof ev.z).toBe('number');
      const snap = await p.next('zsnap', (m) => m.z.some((z) => z[0] === ev.z && (z[6] & (ZF.held | ZF.rising)) === ZF.held), 3000);
      expect(snap).toBeDefined();
    } finally {
      clearInterval(keep);
      p.close();
      await sleep(100);
    }
  }, 20_000);
});
