// Weapon progression × game modes, as a matrix: every game mode (GAME_MODE_IDS, so a mode is covered as soon as
// it is declared) × accounts with every gun of PRIMARIES/SECONDARIES at each weapon level, with and without its
// optional upgrades turned on (plus the knife, the grenade, a brand-new account, a maxed-out one and a client
// asking for things it doesn't have). For each pair, a real Session with the mode's real hooks (server/modes.ts)
// runs over stub sockets on a fake clock: the loadout the player ends up with must be valid (known ids, finite
// and positive stats for every slot, the knife and the grenade) and follow MODE_RULES:
// - weapons: 'arsenal' gives the account's choice at its levels; 'mode' ignores the account entirely;
// - lockedLoadout: an Arsenal change inside the match is refused;
// - grenades: a throw reaches the others only when the mode has grenades;
// - weaponXp: a kill feeds the weapon that made it only when the mode says so (the account gets XP anyway);
//   co-op modes have no damage between players at all.
// Plus every loadout a mode can hand out mid-match (ladder steps, coffin items) and every upgrade combination
// of every gun. No network, no database: everything here runs synchronously.
import { afterAll, describe, expect, it } from 'bun:test';
import type { ServerWebSocket } from 'bun';
import { ACCOUNT_XP } from '@shared/accountLevel';
import { defaultAppearance } from '@shared/appearance';
import { grenadeStats, gunStats, meleeStats, resolveLoadout, sanitizeLoadout, slotStats, type GunStats, type Loadout } from '@shared/arsenal';
import { SCORE } from '@shared/constants';
import { LADDER, ladderLoadout } from '@shared/gunGame';
import { GAME_MODE_IDS, MODE_RULES, modeMaps, type GameModeId } from '@shared/modes';
import {
  DEFAULT_CHOICE,
  DEFAULT_SECONDARY,
  GUN_IDS,
  isGun,
  levelCount,
  levelForXp,
  MAX_LEVELS,
  PRIMARIES,
  PROG_WEAPONS,
  PROGRESSION,
  SECONDARIES,
  upgradeOf,
  weaponOfKill,
  xpForLevel,
  type GunId,
  type Levels,
  type ProgWeapon,
} from '@shared/progression';
import { FLAG, NET, type ClientMsg, type ServerMsg } from '@shared/protocol';
import { computeDamage, explosionDamage, HIT_REGIONS, idealTtk } from '@shared/weapons';
import { BOX_ITEMS, flawAmmo, itemOf, itemSlot, startItems, Z_FLAWS, ZOMBIE, zombieGunData, zombieLoadout, type ZFlaw, type ZItems, type ZSlot } from '@shared/zombies';
import { equip, levelsOf, liveAccount, loadoutOf, type LiveAccount } from '../progress';
import { Session, type Conn } from '../session';

// --- Accounts: every gun at every level, with its optional upgrades off, each one on, all on ---------------------

interface Acct {
  label: string;
  levels: Partial<Levels>;
  /** What the client sends in the lobby ('loadout'), never trusted. */
  choice: unknown;
}

const optionals = (w: ProgWeapon) => PROGRESSION[w].melhorias.filter((u) => u.opcional).map((u) => u.id);
const toggleSets = (w: ProgWeapon) => {
  const opt = optionals(w);
  return [[], ...opt.map((id) => [id]), ...(opt.length > 1 ? [opt] : [])];
};

function accounts(): Acct[] {
  const all: Acct[] = [
    { label: 'conta nova', levels: {}, choice: DEFAULT_CHOICE },
    { label: 'tudo liberado e todas as opcionais ligadas', levels: MAX_LEVELS, choice: { secundaria: SECONDARIES.at(-1), ligadas: Object.fromEntries(PROG_WEAPONS.map((w) => [w, optionals(w)])) } },
    // A client asking for what it doesn't have: a primary as the secondary, every optional upgrade at level 1,
    // a whole Loadout (with the lightsaber in hand) where a choice goes.
    { label: 'cliente pedindo o que não tem', levels: {}, choice: { secundaria: PRIMARIES[0], ligadas: Object.fromEntries(PROG_WEAPONS.map((w) => [w, optionals(w)])), primaria: 'smg', soFaca: true, ativas: { rifle: ['silenciador'] } } },
  ];
  for (const gun of [...PRIMARIES, ...SECONDARIES]) {
    const secundaria = SECONDARIES.includes(gun) ? gun : DEFAULT_SECONDARY;
    for (let lvl = 1; lvl <= levelCount(gun); lvl++)
      for (const on of toggleSets(gun)) all.push({ label: `${gun} nível ${lvl} ${on.join('+') || 'sem opcionais'}`, levels: { [gun]: lvl }, choice: { secundaria, ligadas: { [gun]: on } } });
  }
  for (const w of ['faca', 'granada'] as const)
    for (let lvl = 1; lvl <= levelCount(w); lvl++)
      for (const on of toggleSets(w)) all.push({ label: `${w} nível ${lvl} ${on.join('+') || 'sem opcionais'}`, levels: { [w]: lvl }, choice: { secundaria: DEFAULT_SECONDARY, ligadas: { [w]: on } } });
  return all;
}

let accountSeq = 1;
/** A signed-in account as the server keeps it, with weapon points for `levels`, after the lobby's 'loadout'. */
function liveAt(levels: Partial<Levels>, choice: unknown): LiveAccount {
  const n = accountSeq++;
  const weapons = Object.fromEntries(PROG_WEAPONS.map((w) => [w, { xp: xpForLevel(w, levels[w] ?? 1) }])) as Record<ProgWeapon, { xp: number }>;
  const a = liveAccount({ accountId: `conta-${n}`, profileId: `perfil-${n}`, tag: `Matriz${n}#0001`, sex: 'm', appearance: defaultAppearance('m'), xp: 0, weapons, arsenal: DEFAULT_CHOICE });
  // What app.ts does with the lobby's 'loadout' message.
  equip(a, choice);
  return a;
}

// --- A real Session over stub sockets, on a fake clock ------------------------------------------------------------

interface Stub {
  conn: Conn;
  inbox: ServerMsg[];
}

class Room {
  /** Fake server clock (ms). */
  t = 1_000_000;
  readonly stubs: Stub[] = [];
  readonly session: Session;

  constructor(readonly mode: GameModeId) {
    this.session = new Session(`matriz-${mode}`, 'Matriz', modeMaps(mode)[0], mode, false, () => this.t, () => {}, (_topic, data) => this.deliver(data));
  }

  /** What Bun's pub/sub does: to every socket of the session (but the sender's own, for ws.publish). */
  private deliver(data: string, except?: Stub) {
    const msg = JSON.parse(data) as ServerMsg;
    for (const s of this.stubs) if (s !== except) s.inbox.push(msg);
  }

  join(account: LiveAccount): Stub {
    const stub = { inbox: [] } as unknown as Stub;
    const ws = { readyState: WebSocket.OPEN, subscribe() {}, unsubscribe() {}, publish: (_topic: string, data: string) => this.deliver(data, stub) };
    stub.conn = { ws: ws as unknown as ServerWebSocket<unknown>, id: this.stubs.length + 1, name: account.profile.tag, sex: 'm', session: null, account, send: (m) => stub.inbox.push(m) };
    this.stubs.push(stub);
    this.session.join(stub.conn);
    return stub;
  }

  send(s: Stub, msg: object) {
    this.session.handle(s.conn, msg as ClientMsg);
  }

  player(s: Stub) {
    return this.session.players.get(s.conn.id)!;
  }

  /** Messages of type `t` a stub got since the last call (they're consumed). */
  take<T extends ServerMsg['t']>(s: Stub, t: T): Extract<ServerMsg, { t: T }>[] {
    const out = s.inbox.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
    s.inbox = s.inbox.filter((m) => m.t !== t);
    return out;
  }

  dispose() {
    this.session.dispose();
  }
}

// --- What a valid loadout is ----------------------------------------------------------------------------------------

const finitePositive = (n: number) => Number.isFinite(n) && n > 0;

/** Every stat the game reads from a gun is a finite, positive number (spread/recoil may be 0, never negative). */
function gunProblems(g: GunStats): string[] {
  const out: string[] = [];
  const pos = { danoMax: g.dano.max, danoMin: g.dano.min, distMax: g.dano.distMax, distMin: g.dano.distMin, cadencia: g.cadencia, pente: g.pente, recargaTatica: g.recarga.tatica, recargaVazia: g.recarga.vazia, adsTempo: g.ads.tempo, zoom: g.ads.zoom, movimento: g.movimento, troca: g.troca, alcanceMaximo: g.alcanceMaximo };
  for (const [k, v] of Object.entries(pos)) if (!finitePositive(v)) out.push(`${g.arma}: ${k} = ${v}`);
  const nonNeg = { reserva: g.reserva, ...g.dispersao, recuoVertical: g.recuo.vertical };
  for (const [k, v] of Object.entries(nonNeg)) if (!Number.isFinite(v) || v < 0) out.push(`${g.arma}: ${k} = ${v}`);
  if (g.dano.min > g.dano.max || g.dano.distMax > g.dano.distMin) out.push(`${g.arma}: queda de dano invertida`);
  for (const r of HIT_REGIONS) {
    for (const d of [1, 10, 30, 60, 150, g.alcanceMaximo]) {
      const dmg = computeDamage(g, d, r);
      if (!finitePositive(dmg)) out.push(`${g.arma}: dano ${dmg} em ${r} a ${d} m`);
    }
  }
  if (!finitePositive(idealTtk(g))) out.push(`${g.arma}: TTK ${idealTtk(g)}`);
  // The server's fire-rate check allows ceil(cadence / 60) + 2 hits a second.
  if (!finitePositive(Math.ceil(g.cadencia / 60) + 2)) out.push(`${g.arma}: limite de acertos`);
  return out;
}

/** A loadout is valid: known ids only (what sanitizeLoadout keeps), finite positive stats everywhere. */
function loadoutProblems(lo: Loadout): string[] {
  const out: string[] = [];
  const clean = sanitizeLoadout(JSON.parse(JSON.stringify(lo)));
  if (JSON.stringify(clean) !== JSON.stringify(lo)) out.push(`ids desconhecidos: ${JSON.stringify(lo)}`);
  for (const w of PROG_WEAPONS) for (const id of lo.ativas[w]) if (!upgradeOf(w, id)) out.push(`${w}: melhoria ${id}`);
  const prim = slotStats(lo, 'primaria');
  if (!prim) out.push('sem primária');
  else out.push(...gunProblems(prim));
  const sec = slotStats(lo, 'secundaria');
  if (lo.secundaria !== null && !sec) out.push('secundária sem atributos');
  if (sec) out.push(...gunProblems(sec));
  const knife = meleeStats(lo.ativas.faca);
  for (const [k, v] of Object.entries({ alcance: knife.alcance, alcanceInvestida: knife.alcanceInvestida, intervalo: knife.intervalo, velocidadeInvestida: knife.velocidadeInvestida }))
    if (!finitePositive(v)) out.push(`faca: ${k} = ${v}`);
  const nade = grenadeStats(lo.ativas.granada);
  for (const [k, v] of Object.entries({ quantidade: nade.quantidade, recarga: nade.recargaSegundos, lancamento: nade.velocidadeLancamento, raio: nade.explosao.raioDano, raioMaximo: nade.explosao.raioDanoMaximo, dano: explosionDamage(nade.explosao, 0) }))
    if (!finitePositive(v)) out.push(`granada: ${k} = ${v}`);
  return out;
}

// --- Every loadout a mode with its own weapons can hand out mid-match -----------------------------------------------

/**
 * Modes whose weapons come from the mode (`weapons: 'mode'`) must list here every loadout they can put in a
 * player's hands, so the matrix checks them; a new mode of that kind fails the test below until it's added.
 */
const MODE_LOADOUTS: Partial<Record<GameModeId, () => Loadout[]>> = {
  'corrida-armada': () => LADDER.map((_, step) => ladderLoadout(step)),
  zumbi: () => {
    // Every combination of the coffin's items in the three slots (the starting rifle included), each coffin item
    // intact or damaged in every way it can come (a blade only with less damage; the starting rifle never).
    const slot = (s: ZSlot) => ZOMBIE.itens.filter((i) => itemSlot(i) === s);
    const variants = (s: ZSlot, empty: boolean) => {
      const out: { id: string | null; flaw: ZFlaw | null }[] = empty ? [{ id: null, flaw: null }] : [];
      for (const it of slot(s)) {
        out.push({ id: it.id, flaw: null });
        if (it.raridade === 'inicial') continue;
        for (const flaw of it.arma === 'faca' ? (['dano'] as const) : Z_FLAWS) out.push({ id: it.id, flaw });
      }
      return out;
    };
    const out: Loadout[] = [];
    for (const p of variants('primaria', false)) {
      for (const s of variants('secundaria', true)) {
        for (const k of variants('faca', true)) {
          const danificadas: Partial<Record<ZSlot, ZFlaw>> = {};
          if (p.flaw) danificadas.primaria = p.flaw;
          if (s.flaw) danificadas.secundaria = s.flaw;
          if (k.flaw) danificadas.faca = k.flaw;
          out.push(zombieLoadout({ primaria: p.id!, secundaria: s.id, faca: k.id, ...(Object.keys(danificadas).length ? { danificadas } : {}) }));
        }
      }
    }
    return out;
  },
};

// --- The matrix --------------------------------------------------------------------------------------------------

const ACCOUNTS = accounts();
const rooms: Room[] = [];
afterAll(() => {
  for (const r of rooms) r.dispose();
});

describe('matriz progressão × modos', () => {
  it('as regras de todo modo são coerentes com a progressão', () => {
    for (const m of GAME_MODE_IDS) {
      const r = MODE_RULES[m];
      // Weapon points only where players fight with their own Arsenal (server/session.ts): a mode's weapons
      // (a ladder, a coffin) never level up the account's.
      if (r.weapons === 'mode') expect({ m, weaponXp: r.weaponXp }).toEqual({ m, weaponXp: false });
      if (r.weapons === 'mode') expect({ m, registered: !!MODE_LOADOUTS[m] }).toEqual({ m, registered: true });
      expect(modeMaps(m).length).toBeGreaterThan(0);
    }
  });

  it('toda combinação de melhorias de toda arma de fogo dá atributos válidos', () => {
    const problems: string[] = [];
    for (const gun of GUN_IDS) {
      const ids = PROGRESSION[gun].melhorias.map((u) => u.id);
      for (let mask = 0; mask < 1 << ids.length; mask++) {
        const ups = ids.filter((_, i) => mask & (1 << i));
        problems.push(...gunProblems(gunStats(gun, ups)).map((p) => `${ups.join('+')}: ${p}`));
        // In whichever slot it can go.
        const lo = sanitizeLoadout({ primaria: PRIMARIES.includes(gun) ? gun : PRIMARIES[0], secundaria: SECONDARIES.includes(gun) ? gun : null, ativas: { [gun]: ups } });
        expect(lo.ativas[gun]).toEqual(ups);
        problems.push(...loadoutProblems(lo));
      }
    }
    for (const w of ['faca', 'granada'] as const) {
      const ids = PROGRESSION[w].melhorias.map((u) => u.id);
      for (let mask = 0; mask < 1 << ids.length; mask++) problems.push(...loadoutProblems(sanitizeLoadout({ ativas: { [w]: ids.filter((_, i) => mask & (1 << i)) } })));
    }
    expect(problems).toEqual([]);
  });

  it('todo equipamento que um modo entrega no meio da partida é válido', () => {
    for (const m of GAME_MODE_IDS) {
      const list = MODE_LOADOUTS[m]?.() ?? [];
      for (const lo of list) expect({ m, lo, problems: loadoutProblems(lo) }).toEqual({ m, lo, problems: [] });
      if (m !== 'zumbi') continue;
      // Zumbi: basic grenades only, whatever the coffin gave; every item's gun with its own fixed upgrades.
      for (const lo of list) expect(lo.ativas.granada).toEqual([]);
      // Damaged ones: the flaw crosses the network untouched, and the gun the client builds with fewer rounds (the
      // mode's bigger reserve, minus the flaw's) is still a valid gun.
      const damaged = list.filter((lo) => lo.danificadas);
      expect(damaged.length).toBeGreaterThan(list.length / 2);
      for (const lo of list) {
        expect(sanitizeLoadout(JSON.parse(JSON.stringify(lo)))).toEqual(lo);
        for (const s of ['primaria', 'secundaria'] as const) {
          const g = slotStats(lo, s);
          if (!g) continue;
          const flaw = lo.danificadas?.[g.arma];
          const held = zombieGunData(g, flaw);
          expect({ lo, s, problems: gunProblems(held) }).toEqual({ lo, s, problems: [] });
          expect(held.pente).toBe(Math.max(1, Math.round(g.pente * flawAmmo(flaw).pente)));
          if (flaw === 'municao' || flaw === 'ambos') expect(held.reserva).toBeLessThan(zombieGunData(g, null).reserva);
        }
      }
      for (const it of BOX_ITEMS) {
        const items: ZItems = { ...startItems(), [itemSlot(it)]: it.id };
        const lo = zombieLoadout(items);
        expect(lo.ativas[it.arma]).toEqual(it.melhorias);
        if (isGun(it.arma)) expect(slotStats(lo, itemSlot(it) as 'primaria' | 'secundaria')).toBe(gunStats(it.arma, it.melhorias));
      }
      expect(itemOf(ZOMBIE.inicial)?.melhorias).toEqual([]);
    }
  });

  for (const mode of GAME_MODE_IDS) {
    const rules = MODE_RULES[mode];

    it(`${mode}: o equipamento de entrada de cada conta é válido e segue a origem das armas (${rules.weapons})`, () => {
      const seen = new Map<string, string[]>();
      for (const acct of ACCOUNTS) {
        const room = new Room(mode);
        rooms.push(room);
        const a = liveAt(acct.levels, acct.choice);
        const s = room.join(a);
        const lo = room.player(s).loadout;
        // What everyone hears is what the server validates with.
        const joined = room.take(s, 'joined')[0];
        expect(joined.players.find((p) => p.id === s.conn.id)?.lo).toEqual(lo);
        expect({ acct: acct.label, problems: loadoutProblems(lo) }).toEqual({ acct: acct.label, problems: [] });
        expect(lo.soFaca).toBeUndefined();
        if (rules.weapons === 'arsenal') {
          const levels = levelsOf(a);
          // The account's choice at its levels: the primary slot's gun, the secondary it chose (if it can go there).
          expect(lo).toEqual(resolveLoadout(a.profile.arsenal, levels));
          expect(lo).toEqual(loadoutOf(a));
          expect(PRIMARIES).toContain(lo.primaria);
          const asked = (acct.choice as { secundaria?: unknown }).secundaria;
          expect(lo.secundaria).toBe(SECONDARIES.includes(asked as GunId) ? (asked as GunId) : DEFAULT_SECONDARY);
          for (const w of PROG_WEAPONS) {
            const level = levels[w];
            const asks = ((acct.choice as { ligadas?: Record<string, string[]> }).ligadas?.[w] ?? []) as string[];
            const groups = new Set<string>();
            for (const id of lo.ativas[w]) {
              const u = upgradeOf(w, id)!;
              // Only what the account unlocked; optional ones only when asked for, one per group.
              expect({ acct: acct.label, w, id, unlocked: u.nivel <= level }).toEqual({ acct: acct.label, w, id, unlocked: true });
              if (u.opcional) {
                expect(asks).toContain(id);
                if (u.grupo) {
                  expect(groups.has(u.grupo)).toBe(false);
                  groups.add(u.grupo);
                }
              }
            }
            // Every common upgrade unlocked is in effect, unless an optional one of its group replaced it.
            for (const u of PROGRESSION[w].melhorias) {
              if (u.opcional || u.nivel > level) continue;
              if (!u.grupo || !groups.has(u.grupo)) expect({ acct: acct.label, w, id: u.id, on: lo.ativas[w].includes(u.id) }).toEqual({ acct: acct.label, w, id: u.id, on: true });
            }
          }
        } else {
          // The mode's weapons: the account's levels and choice change nothing.
          seen.set(JSON.stringify(lo), [...(seen.get(JSON.stringify(lo)) ?? []), acct.label]);
        }
        room.dispose();
      }
      if (rules.weapons === 'mode') expect([...seen.keys()]).toHaveLength(1);
    });

    it(`${mode}: troca de Arsenal, granadas e XP de arma seguem as regras do modo`, () => {
      // The new, the maxed-out and the greedy accounts, and each gun at its first and its last level (every
      // optional upgrade on).
      const picks: Acct[] = [
        ...ACCOUNTS.slice(0, 3),
        ...[...PRIMARIES, ...SECONDARIES].flatMap((gun) => {
          const secundaria = SECONDARIES.includes(gun) ? gun : DEFAULT_SECONDARY;
          return [
            { label: `${gun} nível 1`, levels: { [gun]: 1 }, choice: { secundaria, ligadas: {} } },
            { label: `${gun} no último nível, opcionais ligadas`, levels: { [gun]: levelCount(gun) }, choice: { secundaria, ligadas: { [gun]: optionals(gun) } } },
          ];
        }),
      ];
      for (const acct of picks) {
        const room = new Room(mode);
        rooms.push(room);
        const shooterAcct = liveAt(acct.levels, acct.choice);
        const shooter = room.join(shooterAcct);
        const victim = room.join(liveAt({}, DEFAULT_CHOICE));
        const me = room.player(shooter);
        const target = room.player(victim);
        const before = me.loadout;
        const label = `${mode} / ${acct.label}`;

        // lockedLoadout: another Arsenal choice inside the match.
        const other = { secundaria: SECONDARIES.find((g) => g !== before.secundaria) ?? DEFAULT_SECONDARY, ligadas: {} };
        room.send(shooter, { t: 'loadout', lo: other });
        const changed = room.take(victim, 'playerLoadout').filter((m) => m.id === shooter.conn.id);
        if (rules.lockedLoadout || rules.weapons === 'mode') {
          expect({ label, changed: changed.length, same: me.loadout === before }).toEqual({ label, changed: 0, same: true });
        } else {
          expect(changed.at(-1)?.lo).toEqual(loadoutOf(shooterAcct));
        }
        expect(room.take(shooter, 'progresso').length).toBeGreaterThan(0);

        // Both in the world: the shooter at the origin, the victim 10 m ahead.
        room.send(shooter, { t: 'respawn', p: [0, 0, 0], yaw: 0 });
        room.send(victim, { t: 'respawn', p: [0, 0, 10], yaw: 0 });
        room.send(shooter, { t: 'state', s: { p: [0, 0, 0], yaw: 0, pitch: 0, f: FLAG.grounded } });
        expect(me.alive && target.alive).toBe(true);

        // grenades: a throw reaches the others only in a mode with grenades; a mine only with the upgrade.
        room.send(shooter, { t: 'grenade', id: 1, p: [0, 1, 0], v: [0, 5, -5], fuse: 2, mine: true });
        const thrown = room.take(victim, 'grenade');
        expect({ label, thrown: thrown.length }).toEqual({ label, thrown: rules.grenades ? 1 : 0 });
        if (thrown[0]) expect(!!thrown[0].mine).toBe(grenadeStats(me.loadout.ativas.granada).tipo === 'mina');

        // weaponXp: a lethal shot with each gun the player carries, then a stab.
        const slots = (['primaria', 'secundaria'] as const).filter((sl) => slotStats(me.loadout, sl));
        const kills: { kind: 'groin' | 'knife'; w: ProgWeapon; flag: number; at: [number, number, number] }[] = [
          ...slots.map((sl) => ({ kind: 'groin' as const, w: slotStats(me.loadout, sl)!.arma as ProgWeapon, flag: sl === 'secundaria' ? FLAG.secondary : 0, at: [0, 0, 10] as [number, number, number] })),
          { kind: 'knife', w: 'faca', flag: 0, at: [0, 0, 1.5] },
        ];
        for (const k of kills) {
          room.t += NET.respawnDelay * 1000 + 100;
          if (!target.alive) room.send(victim, { t: 'respawn', p: k.at, yaw: 0 });
          else room.send(victim, { t: 'state', s: { p: k.at, yaw: 0, pitch: 0, f: FLAG.grounded } });
          room.send(shooter, { t: 'state', s: { p: [0, 0, 0], yaw: 0, pitch: 0, f: FLAG.grounded | k.flag } });
          room.take(shooter, 'progresso');
          room.take(victim, 'damage');
          const xpBefore = shooterAcct.profile.weapons[k.w].xp;
          const accountBefore = shooterAcct.profile.xp;
          if (k.kind === 'knife') room.send(shooter, { t: 'stab', target: victim.conn.id, behind: false });
          else room.send(shooter, { t: 'hit', target: victim.conn.id, region: 'virilha', dist: 10, w: k.w });
          const kill = room.take(victim, 'kill').find((m) => m.victim === victim.conn.id);
          if (rules.coop) {
            // Co-op: no damage between players at all, so no kill, no points.
            expect({ label, k: k.w, damage: room.take(victim, 'damage').length, kill: !!kill }).toEqual({ label, k: k.w, damage: 0, kill: false });
            expect(shooterAcct.profile.weapons[k.w].xp).toBe(xpBefore);
            continue;
          }
          expect({ label, k: k.w, kill: kill?.arma }).toEqual({ label, k: k.w, kill: k.w });
          const points = kill!.awards.reduce((s, x) => s + x.value, 0);
          expect(points).toBe(SCORE.kill + (k.kind === 'knife' ? SCORE.knife : SCORE.groin));
          expect(weaponOfKill(kill!.kind, isGun(kill!.arma) ? kill!.arma : null)).toBe(k.w);
          expect({ label, k: k.w, weaponXp: shooterAcct.profile.weapons[k.w].xp - xpBefore }).toEqual({ label, k: k.w, weaponXp: rules.weaponXp ? points : 0 });
          expect(shooterAcct.profile.xp - accountBefore).toBe(ACCOUNT_XP.perKill);
          // The player hears it from the server, and the levels in it match the points.
          const prog = room.take(shooter, 'progresso').at(-1)!;
          expect(prog.armas[k.w]).toEqual({ xp: shooterAcct.profile.weapons[k.w].xp, nivel: levelForXp(k.w, shooterAcct.profile.weapons[k.w].xp) });
          // A level-up never changes the weapons in hand of a match with a locked loadout.
          if (rules.lockedLoadout) expect(me.loadout).toBe(before);
        }
        room.dispose();
      }
    });
  }
});
