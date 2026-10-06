// Game modes on the real server: mata-mata keeps the loadout chosen before the match (the Arsenal is changed
// in the lobby, level-ups wait for the next session), and corrida armada's ladder (three kills with the step's
// weapon move you up, a stab moves you down, a lightsaber kill wins the round and a new one starts). With the
// weapon progression around them: a veteran's unlocked upgrades are what the server validates in mata-mata
// (damage, fire rate, the mine, the secondary's points), a client can't claim what it hasn't unlocked, and the
// ladder ignores the account entirely (its own stats, no weapon points).
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { FLAG, type PlayerInfo, type ServerMsg, type Vec3 } from '@shared/protocol';
import { DEFAULT_LOADOUT, gunStats, resolveLoadout } from '@shared/arsenal';
import { afterDeath, afterKill, FINAL_STEP, GUN_GAME, LADDER, ladderLoadout, ladderProblems, killsForStep, stepWeapon } from '@shared/gunGame';
import { GAME_MODE_IDS, MODE_RULES } from '@shared/modes';
import { isGun, MAX_LEVELS, progOf, PROG_WEAPONS, START_LEVELS, xpForLevel, type GunId, type KnifeId, type ProgWeapon } from '@shared/progression';
import { ACCOUNT_XP } from '@shared/accountLevel';
import { computeDamage } from '@shared/weapons';
import type { GameServer } from '../app';
import { Browser, Player, setWeaponXp, sleep, startTestServer } from './helpers';

let game: GameServer;
beforeAll(async () => {
  game = await startTestServer();
});
afterAll(async () => {
  await game?.close();
});

async function signedIn(name: string) {
  const b = new Browser(game);
  await b.register(name);
  return b;
}

/**
 * Connects, says hello, sends `lobby` messages (they're processed in order) and joins `session`, or creates a
 * session of a mode on a map (fresh: no other test's round or ladder in it).
 */
async function enter(b: Browser, session: string | { mode: string; map: string }, lobby: object[] = []) {
  const p = await Player.connect(game, await b.ticket());
  p.send({ t: 'hello' });
  const welcome = await p.next('welcome');
  for (const m of lobby) p.send(m);
  p.send(typeof session === 'string' ? { t: 'join', session } : { t: 'create', name: 'Sala de teste', ...session });
  const joined = await p.next('joined');
  return { p, welcome, joined, id: joined.you, me: joined.players.find((x) => x.id === joined.you)! };
}
type In = Awaited<ReturnType<typeof enter>>;

async function spawn(who: In, at: Vec3, watcher: In = who) {
  who.p.send({ t: 'respawn', p: at, yaw: 0 });
  await watcher.p.next('spawned', (m) => m.id === who.id);
}

/** A one-shot kill (a groin hit is always lethal) with `w`, from the origin to someone 10 m away. */
async function groinKill(a: In, v: In, w: string, dist = 10) {
  const kill = a.p.next('kill', (m) => m.victim === v.id);
  a.p.send({ t: 'hit', target: v.id, region: 'virilha', dist, w });
  const k = await kill;
  // Spaced well within any gun's fire rate.
  await sleep(60);
  return k;
}

const ladderOf = (players: PlayerInfo[], id: number) => players.find((p) => p.id === id)?.ladder;

describe('escada da corrida armada (regras puras)', () => {
  it('a escada usa armas e melhorias que existem e termina no sabre', () => {
    expect(ladderProblems()).toEqual([]);
    expect(LADDER.length).toBeGreaterThan(4);
    expect(stepWeapon(FINAL_STEP)).toBe('sabre');
    expect(ladderLoadout(FINAL_STEP)).toMatchObject({ soFaca: true, faca: 'sabre', ativas: { faca: [] } });
    // Every gun step: that gun alone, a plain knife, no grenade upgrades.
    for (let i = 0; i < FINAL_STEP; i++) {
      const lo = ladderLoadout(i);
      expect(isGun(lo.primaria) && lo.secundaria === null && !lo.soFaca).toBe(true);
      expect(lo.ativas.faca).toEqual([]);
    }
  });

  it('três abates com a arma do degrau sobem um degrau; outras armas não contam', () => {
    let pos = { step: 0, kills: 0 };
    const gun = stepWeapon(0);
    expect(afterKill(pos, 'gun', 'pistola').event).toBeNull();
    expect(afterKill(pos, 'knife', 'faca').event).toBeNull();
    for (let i = 1; i < GUN_GAME.killsPerStep; i++) {
      const r = afterKill(pos, 'head', gun);
      expect(r.event).toBe('kill');
      pos = r.pos;
    }
    const up = afterKill(pos, 'groin', gun);
    expect(up).toEqual({ pos: { step: 1, kills: 0 }, event: 'advanced' });
  });

  it('a facada desce um degrau e zera os abates; o primeiro degrau não desce', () => {
    expect(afterDeath({ step: 3, kills: 2 }, 'knife')).toEqual({ step: 2, kills: 0 });
    expect(afterDeath({ step: 0, kills: 2 }, 'knife')).toEqual({ step: 0, kills: 0 });
    expect(afterDeath({ step: 3, kills: 2 }, 'head')).toEqual({ step: 3, kills: 2 });
    expect(afterDeath({ step: FINAL_STEP, kills: 0 }, 'knife').step).toBe(FINAL_STEP - 1);
  });

  it('no último degrau só o sabre vence', () => {
    const top = { step: FINAL_STEP, kills: 0 };
    expect(killsForStep(FINAL_STEP)).toBe(GUN_GAME.finalKills);
    expect(afterKill(top, 'gun', 'rifle').event).toBeNull();
    expect(afterKill(top, 'grenade', 'granada').event).toBeNull();
    expect(afterKill(top, 'knife', 'faca').event).toBe(GUN_GAME.finalKills === 1 ? 'won' : 'kill');
  });

  it('todo modo tem regras', () => {
    for (const m of GAME_MODE_IDS) expect(MODE_RULES[m]).toBeDefined();
    expect(MODE_RULES['mata-mata'].lockedLoadout).toBe(true);
    expect(MODE_RULES['corrida-armada']).toMatchObject({ weapons: 'mode', weaponXp: false, rounds: true });
  });
});

describe('mata-mata: equipamento travado durante a partida', () => {
  it('o Arsenal escolhido no saguão vale na partida, e a troca no meio dela é recusada', async () => {
    // Already scored with the SMG: unlocked for this account (it no longer waits for the pistol's level).
    const travado = await signedIn('Travado');
    await setWeaponXp(travado, { smg: 1 });
    const a = await enter(travado, 'principal', [{ t: 'loadout', lo: { secundaria: 'smg', ligadas: {} } }]);
    expect(a.joined.session.mode).toBe('mata-mata');
    expect(a.me.lo).toEqual({ ...DEFAULT_LOADOUT, secundaria: 'smg' });
    const v = await enter(await signedIn('Testemunha'), 'principal');
    expect(v.joined.players.find((x) => x.id === a.id)?.lo?.secundaria).toBe('smg');

    // Mid-match: refused. The player hears the choice the server kept; nobody hears of a new loadout.
    a.p.msgs.length = 0;
    a.p.send({ t: 'loadout', lo: { secundaria: 'pistola', ligadas: {} } });
    expect((await a.p.next('progresso')).escolha.secundaria).toBe('smg');
    await expect(v.p.next('playerLoadout', (m) => m.id === a.id, 300)).rejects.toThrow();

    // And the server validates with the locked loadout: the SMG counts, the pistol doesn't.
    await spawn(a, [0, 0, 0], v);
    await spawn(v, [0, 0, 10]);
    a.p.send({ t: 'state', s: { p: [0, 0, 0], yaw: 0, pitch: 0, f: FLAG.secondary } });
    a.p.send({ t: 'hit', target: v.id, region: 'peito', dist: 10, w: 'pistola' });
    await expect(a.p.next('damage', (m) => m.target === v.id, 300)).rejects.toThrow();
    a.p.send({ t: 'hit', target: v.id, region: 'peito', dist: 10, w: 'smg' });
    expect((await a.p.next('damage', (m) => m.target === v.id)).amount).toBe(computeDamage(gunStats('smg'), 10, 'peito'));
    a.p.close();
    v.p.close();
  });

  it('subir de nível no meio da partida não muda a arma na mão; a melhoria vale na próxima sessão', async () => {
    const b = await signedIn('Veterano');
    // 10 points short of the rifle's level 2 (the red dot, a common upgrade).
    const p0 = await Player.connect(game, await b.ticket());
    p0.send({ t: 'hello' });
    const [name, disc] = (await p0.next('welcome')).name.split('#');
    p0.close();
    await game.deps.db.query(
      `UPDATE weapon_progress SET xp = 990 WHERE weapon = 'rifle' AND profile_id = (SELECT id FROM player_profile WHERE display_name = $1 AND discriminator = $2)`,
      [name, Number(disc)],
    );
    await sleep(100);
    const a = await enter(b, 'jardim');
    const v = await enter(await signedIn('Alvo Fixo'), 'jardim');
    expect(a.me.lo?.ativas.rifle).toEqual([]);
    await spawn(a, [0, 0, 0], v);
    await spawn(v, [0, 0, 10]);
    const up = a.p.next('progresso', (m) => m.subiu?.tipo === 'rifle');
    await groinKill(a, v, 'rifle');
    expect((await up).subiu).toEqual({ tipo: 'rifle', nivel: 2 });
    // Nobody (the player included) hears of new weapons: the match goes on with what it started with.
    await expect(v.p.next('playerLoadout', (m) => m.id === a.id, 300)).rejects.toThrow();
    expect(a.p.msgs.some((m) => m.t === 'playerLoadout')).toBe(false);
    a.p.close();
    v.p.close();
    await sleep(300);
    // The next session joined picks it up.
    const again = await enter(b, 'principal');
    expect(again.me.lo?.ativas.rifle).toEqual(['pontoVermelho']);
    again.p.close();
  });
});

describe('corrida armada (online)', () => {
  it('cada mapa tem uma sala de corrida armada; ela entrega o primeiro degrau a todos', async () => {
    const list = (await (await fetch(`http://127.0.0.1:${game.port}/api/sessoes`)).json()) as { id: string; mode: string; map: string; permanent: boolean }[];
    const fixed = list.filter((s) => s.permanent && s.mode === 'corrida-armada').map((s) => [s.id, s.map]);
    expect(fixed.sort()).toEqual([['corrida-armada-halloween', 'halloween'], ['corrida-armada-jardim', 'jardim'], ['corrida-armada-rua', 'rua']]);

    const a = await enter(await signedIn('Corredor'), 'corrida-armada-rua', [{ t: 'loadout', lo: { secundaria: 'smg', ligadas: {} } }]);
    expect(a.joined.session.mode).toBe('corrida-armada');
    // The ladder's weapons, not the account's Arsenal.
    expect(a.me.lo).toEqual(ladderLoadout(0));
    expect(a.me.ladder).toEqual({ step: 0, kills: 0 });
    // No grenades in this mode: a throw never reaches the others.
    const o = await enter(await signedIn('Observador'), 'corrida-armada-rua');
    await spawn(a, [0, 0, 0], o);
    a.p.send({ t: 'grenade', id: 1, p: [0, 1, 0], v: [0, 5, -5], fuse: 2 });
    await expect(o.p.next('grenade', () => true, 300)).rejects.toThrow();
    a.p.close();
    o.p.close();
  });

  it('três abates com a arma do degrau sobem; a facada desce; armas de fora não valem', async () => {
    const a = await enter(await signedIn('Escalador'), 'corrida-armada-jardim');
    const vs: In[] = [];
    for (const n of ['Degrau 1', 'Degrau 2', 'Degrau 3']) vs.push(await enter(await signedIn(n), 'corrida-armada-jardim'));
    const knifer = await enter(await signedIn('Faqueiro'), 'corrida-armada-jardim');
    await spawn(a, [0, 0, 0]);
    for (const [i, v] of vs.entries()) await spawn(v, [i * 2 - 2, 0, 10], a);
    await spawn(knifer, [0, 0, 2], a);
    const gun0 = stepWeapon(0);
    const other = gun0 === 'smg' ? 'pistola' : 'smg';

    // A gun that isn't the step's: ignored by the server.
    a.p.send({ t: 'hit', target: vs[0].id, region: 'virilha', dist: 10, w: other });
    await expect(a.p.next('damage', (m) => m.target === vs[0].id, 300)).rejects.toThrow();

    expect(ladderOf((await groinKill(a, vs[0], gun0)).players, a.id)).toEqual({ step: 0, kills: 1 });
    expect(ladderOf((await groinKill(a, vs[1], gun0)).players, a.id)).toEqual({ step: 0, kills: 2 });
    const next = a.p.next('playerLoadout', (m) => m.id === a.id);
    const third = await groinKill(a, vs[2], gun0);
    expect(ladderOf(third.players, a.id)).toEqual({ step: 1, kills: 0 });
    expect((await next).lo).toEqual(ladderLoadout(1));
    // The others draw the new weapon too.
    expect((await knifer.p.next('playerLoadout', (m) => m.id === a.id)).lo).toEqual(ladderLoadout(1));

    // A stab: down one step, the step's kills lost; the knife kill doesn't count for the one who stabbed.
    const back = a.p.next('playerLoadout', (m) => m.id === a.id);
    const kill = a.p.next('kill', (m) => m.victim === a.id);
    knifer.p.send({ t: 'stab', target: a.id, behind: false });
    const k = await kill;
    expect(k.kind).toBe('knife');
    expect(ladderOf(k.players, a.id)).toEqual({ step: 0, kills: 0 });
    expect(ladderOf(k.players, knifer.id)).toEqual({ step: 0, kills: 0 });
    expect((await back).lo).toEqual(ladderLoadout(0));

    // No weapon points in this mode (the account still gets its XP).
    const prog = [...a.p.msgs].reverse().find((m) => m.t === 'progresso');
    expect(prog && prog.t === 'progresso' && prog.armas[progOf(gun0)].xp).toBe(0);
    expect(prog && prog.t === 'progresso' && prog.conta.xp).toBeGreaterThan(0);
    for (const x of [a, knifer, ...vs]) x.p.close();
  });

  it('o abate com o sabre no último degrau vence a rodada, e uma nova começa do primeiro degrau', async () => {
    const a = await enter(await signedIn('Campeao'), 'corrida-armada-halloween');
    const vs: In[] = [];
    for (let i = 0; i < 9; i++) vs.push(await enter(await signedIn(`Vitima ${i}`), 'corrida-armada-halloween'));
    await spawn(a, [0, 0, 0]);
    // A ring 10 m away (the hits report 10 m), and the last one close enough for the lightsaber.
    const ring = vs.slice(0, -1);
    const last = vs[vs.length - 1];
    const placeRing = async () => {
      for (const [i, v] of ring.entries()) {
        const ang = (i / ring.length) * Math.PI * 2;
        await spawn(v, [Math.sin(ang) * 10, 0, Math.cos(ang) * 10], a);
      }
    };
    await placeRing();
    await spawn(last, [0, 0, 2], a);
    // Climb every gun step: each victim dies once, then everyone waits the respawn delay.
    let step = 0;
    while (step < FINAL_STEP) {
      for (const v of ring) {
        if (step >= FINAL_STEP) break;
        step = ladderOf((await groinKill(a, v, stepWeapon(step))).players, a.id)!.step;
      }
      if (step >= FINAL_STEP) break;
      await sleep(5000);
      await placeRing();
    }
    // The lightsaber: always in hand, guns refused.
    expect((await a.p.next('playerLoadout', (m) => m.id === a.id && !!m.lo.soFaca)).lo).toEqual(ladderLoadout(FINAL_STEP));
    // (once the shots of the last gun still in flight stop counting)
    await sleep(1100);
    a.p.send({ t: 'hit', target: last.id, region: 'virilha', dist: 2.06, w: 'pistola' });
    await expect(a.p.next('damage', (m) => m.target === last.id, 300)).rejects.toThrow();
    const end = a.p.next('roundEnd');
    const xpBefore = [...a.p.msgs].reverse().find((m) => m.t === 'progresso');
    a.p.send({ t: 'stab', target: last.id, behind: true });
    const won = await end;
    expect(won).toMatchObject({ mode: 'corrida-armada', winner: a.id, name: a.me.name });
    expect(won.restartAt).toBeGreaterThan(0);
    const xp = await a.p.next('progresso', (m) => xpBefore?.t !== 'progresso' || m.conta.xp >= xpBefore.conta.xp + GUN_GAME.winXp);
    expect(xp.armas.rifle.xp + xp.armas.smg.xp + xp.armas.pistola.xp + xp.armas.faca.xp).toBe(0);

    // Between rounds nobody gets hurt: a valid shot (the ring's last victim is alive, on the first step's gun).
    const shooter = ring[ring.length - 1];
    shooter.p.msgs.length = 0;
    a.p.msgs.length = 0;
    shooter.p.send({ t: 'hit', target: a.id, region: 'peito', dist: 10, w: stepWeapon(0) });
    await expect(shooter.p.next('damage', () => true, 300)).rejects.toThrow();

    // The new round: everyone dead at the bottom of the ladder, scores at zero, respawning at once.
    const start = await a.p.next('roundStart', () => true, GUN_GAME.restartSeconds * 1000 + 2000);
    for (const p of start.players) {
      expect(p.ladder).toEqual({ step: 0, kills: 0 });
      expect(p).toMatchObject({ kills: 0, deaths: 0, score: 0, alive: false });
    }
    expect((await a.p.next('playerLoadout', (m) => m.id === a.id && !m.lo.soFaca)).lo).toEqual(ladderLoadout(0));
    await spawn(a, [0, 0, 0]);
    for (const x of [a, ...vs]) x.p.close();
  }, 60_000);
});

// --- Weapon progression in the online modes ---------------------------------------------------------------------

/** A signed-in veteran: the weapon levels in `levels` already earned (the others at level 1). */
async function veteran(name: string, levels: Partial<Record<ProgWeapon, number>>) {
  const b = await signedIn(name);
  await setWeaponXp(b, Object.fromEntries(Object.entries(levels).map(([w, lvl]) => [w, xpForLevel(w as ProgWeapon, lvl)])));
  return b;
}

/** Puts a player at `p`, standing on the ground (`f`: extra state flags, e.g. the secondary in hand). */
const at = (who: In, p: Vec3, f = 0) => who.p.send({ t: 'state', s: { p, yaw: 0, pitch: 0, f: FLAG.grounded | f } });

const lastProgress = (who: In) => who.p.msgs.filter((m): m is Extract<ServerMsg, { t: 'progresso' }> => m.t === 'progresso').at(-1);

describe('progressão de armas no mata-mata (online)', () => {
  it('as melhorias liberadas valem nas armas travadas: dano do silenciador, cadência do gatilho, a mina e os pontos da secundária', async () => {
    const levels = { rifle: 6, pistola: 2, granada: 2 };
    const choice = { secundaria: 'pistola' as const, ligadas: { rifle: ['silenciador'], granada: ['mina'] } };
    const lo = resolveLoadout(choice, { ...START_LEVELS, ...levels });
    const a = await enter(await veteran('Veterana', levels), 'principal', [{ t: 'loadout', lo: choice }]);
    expect(a.me.lo).toEqual(lo);
    expect(lo.ativas).toMatchObject({ rifle: ['pontoVermelho', 'empunhadura', 'pente', 'silenciador'], pistola: ['gatilho'], granada: ['mina'] });
    const v1 = await enter(await signedIn('Alvo Longe'), 'principal');
    const v2 = await enter(await signedIn('Alvo Lado'), 'principal');
    await spawn(a, [0, 0, 0], v1);
    await spawn(v1, [0, 0, 30], a);
    await spawn(v2, [30, 0, 0], a);
    at(a, [0, 0, 0]);

    // Damage and reach: the rifle with the silencer the account turned on (softer at 30 m than the plain one).
    const rifle = gunStats('rifle', lo.ativas.rifle);
    expect(computeDamage(rifle, 30, 'peito')).toBeLessThan(computeDamage(gunStats('rifle'), 30, 'peito'));
    a.p.send({ t: 'hit', target: v1.id, region: 'peito', dist: 30, w: 'rifle' });
    expect((await a.p.next('damage', (m) => m.target === v1.id)).amount).toBe(computeDamage(rifle, 30, 'peito'));

    // Fire rate: the pistol's trigger lets more hits a second through than the plain pistol would.
    const pistol = gunStats('pistola', lo.ativas.pistola);
    const allowed = Math.ceil(pistol.cadencia / 60) + 2;
    expect(allowed).toBeGreaterThan(Math.ceil(gunStats('pistola').cadencia / 60) + 2);
    // (hand hits from 30 m, split between the two: nobody dies)
    expect(computeDamage(rifle, 30, 'peito') + Math.ceil(allowed / 2) * computeDamage(pistol, 30, 'maos')).toBeLessThan(100);
    await sleep(1100); // the rifle's hit out of the one-second window
    at(a, [0, 0, 0], FLAG.secondary);
    for (let i = 0; i <= allowed; i++) a.p.send({ t: 'hit', target: i % 2 ? v2.id : v1.id, region: 'maos', dist: 30, w: 'pistola' });
    for (let i = 0; i < allowed; i++) expect((await a.p.next('damage', (m) => m.attacker === a.id)).amount).toBe(computeDamage(pistol, 30, 'maos'));
    await expect(a.p.next('damage', (m) => m.attacker === a.id, 300)).rejects.toThrow();

    // The grenade's upgrade turned on: G plants a land mine, and the others see a mine.
    a.p.send({ t: 'grenade', id: 1, p: [0, 0.1, 0], v: [0, 0, 0], fuse: 0, mine: true });
    expect(await v1.p.next('grenade', (m) => m.owner === a.id)).toMatchObject({ mine: true });

    // A kill with the secondary: its points go to the pistol, the account gets its XP, the rifle nothing.
    await sleep(1100);
    const k = await groinKill(a, v2, 'pistola', 30);
    expect(k.arma).toBe('pistola');
    const points = k.awards.reduce((s, x) => s + x.value, 0);
    const prog = lastProgress(a)!;
    expect(prog.armas.pistola.xp).toBe(xpForLevel('pistola', 2) + points);
    expect(prog.armas.rifle.xp).toBe(xpForLevel('rifle', 6));
    expect(prog.conta.xp).toBe(ACCOUNT_XP.perKill);
    // Locked: nobody heard of other weapons.
    expect(a.p.msgs.some((m) => m.t === 'playerLoadout')).toBe(false);
    for (const x of [a, v1, v2]) x.p.close();
  });

  it('um cliente não finge armas nem melhorias que a conta não liberou', async () => {
    // Rifle level 3 (red dot, grip), grenade level 2 (the mine unlocked, the double not yet).
    const b = await veteran('Esperto', { rifle: 3, granada: 2 });
    const greedy = {
      secundaria: 'bazuca',
      ligadas: { rifle: ['luneta', 'silenciador'], granada: ['dupla'], faca: ['sabre'], smg: ['tambor'] },
      // A whole loadout where a choice goes: never read.
      primaria: 'smg',
      soFaca: true,
      ativas: { rifle: ['silenciador'], faca: ['sabre'] },
    };
    const a = await enter(b, 'jardim', [{ t: 'loadout', lo: greedy }]);
    expect(lastProgress(a)?.escolha).toEqual({ primaria: 'rifle', secundaria: 'pistola', faca: 'faca', ligadas: {}, desligadas: {} });
    expect(a.me.lo).toEqual({ primaria: 'rifle', secundaria: 'pistola', faca: 'faca', ativas: { rifle: ['pontoVermelho', 'empunhadura'], pistola: [], smg: [], faca: [], granada: [] } });
    const v = await enter(await signedIn('Conferente'), 'jardim');
    await spawn(a, [0, 0, 0], v);
    await spawn(v, [0, 0, 30], a);
    at(a, [0, 0, 0]);
    // Weapons outside the loadout (or no gun at all): ignored.
    for (const w of ['smg', 'faca', 'granada', 'bazuca']) a.p.send({ t: 'hit', target: v.id, region: 'peito', dist: 30, w });
    await expect(a.p.next('damage', (m) => m.attacker === a.id, 300)).rejects.toThrow();
    // The rifle hits with what the account has: no silencer.
    a.p.send({ t: 'hit', target: v.id, region: 'peito', dist: 30, w: 'rifle' });
    expect((await a.p.next('damage', (m) => m.attacker === a.id)).amount).toBe(computeDamage(gunStats('rifle', ['pontoVermelho', 'empunhadura']), 30, 'peito'));
    // A mine without the upgrade turned on: a plain grenade for everyone.
    a.p.send({ t: 'grenade', id: 7, p: [0, 1, 0], v: [0, 5, -5], fuse: 2, mine: true });
    expect((await v.p.next('grenade', (m) => m.owner === a.id)).mine).toBeUndefined();
    a.p.close();
    v.p.close();
  });
});

describe('rifles e facas antigos no mata-mata (online)', () => {
  it('o servidor valida com os atributos do rifle escolhido, os outros o veem, e os pontos vão para o rifle', async () => {
    const b = await signedIn('Colecionadora');
    await setWeaponXp(b, { rifle: 2500, faca: 2800 });
    const a = await enter(b, 'principal', [{ t: 'loadout', lo: { primaria: 'rifleTia', secundaria: 'pistola', faca: 'baguete', ligadas: {} } }]);
    expect(a.me.lo).toMatchObject({ primaria: 'rifleTia', faca: 'baguete', ativas: { rifle: ['pontoVermelho', 'empunhadura'] } });
    const v = await enter(await signedIn('Alvo da Tia'), 'principal');
    expect(v.joined.players.find((x) => x.id === a.id)?.lo).toMatchObject({ primaria: 'rifleTia', faca: 'baguete' });
    await spawn(a, [0, 0, 0], v);
    await spawn(v, [0, 0, 10], a);
    at(a, [0, 0, 0]);
    // The Standard Rifle isn't in hand: its hits are ignored.
    a.p.send({ t: 'hit', target: v.id, region: 'peito', dist: 10, w: 'rifle' });
    await expect(a.p.next('damage', (m) => m.attacker === a.id, 300)).rejects.toThrow();
    // Auntie's rifle: its own damage (28 in the chest at 10 m, the Standard does 30).
    a.p.send({ t: 'hit', target: v.id, region: 'peito', dist: 10, w: 'rifleTia' });
    expect((await a.p.next('damage', (m) => m.attacker === a.id)).amount).toBe(28);
    // A kill with it: the feed names it, and its points go to the rifle.
    await sleep(100);
    const k = await groinKill(a, v, 'rifleTia');
    expect(k.arma).toBe('rifleTia');
    const points = k.awards.reduce((s, x) => s + x.value, 0);
    expect((await a.p.next('progresso', (m) => m.armas.rifle.xp > 2500)).armas.rifle.xp).toBe(2500 + points);
    for (const x of [a, v]) x.p.close();
  });

  it('a faca de cada um: o golpe vale até o alcance da investida dela', async () => {
    // At 5 m, with the sneakers on (+0.6 m lunge, unlocked at 2,800 knife points): the baguette reaches
    // (3.2 + 0.6 m lunge + the server's slack), the pool noodle doesn't (2.7 + 0.6 m + slack).
    const run = async (name: string, faca: KnifeId) => {
      const b = await signedIn(name);
      await setWeaponXp(b, { faca: 6500 });
      const a = await enter(b, 'principal', [{ t: 'loadout', lo: { secundaria: 'pistola', faca, ligadas: {} } }]);
      expect(a.me.lo?.faca).toBe(faca);
      const v = await enter(await signedIn(`Alvo ${name}`), 'principal');
      await spawn(a, [0, 0, 0], v);
      await spawn(v, [0, 0, 5], a);
      at(a, [0, 0, 0]);
      at(v, [0, 0, 5]);
      await sleep(50);
      a.p.send({ t: 'stab', target: v.id, behind: false });
      const hit = await a.p.next('kill', (m) => m.victim === v.id, 400).then(() => true, () => false);
      for (const x of [a, v]) x.p.close();
      return hit;
    };
    expect(await run('Padeira', 'baguete')).toBe(true);
    expect(await run('Nadadora', 'macarrao')).toBe(false);
  });
});

describe('progressão de armas na corrida armada (online)', () => {
  it('a escada ignora as melhorias e a escolha da conta: valida com as armas do degrau (e da anterior por um instante), sem pontos para arma nenhuma', async () => {
    const b = await veteran('Mestre', MAX_LEVELS);
    const choice = { secundaria: 'smg' as const, ligadas: { rifle: ['silenciador'], faca: ['sabre'], granada: ['mina'] } };
    // What the account plays with in mata-mata...
    const own = resolveLoadout(choice, MAX_LEVELS);
    // ...and what it gets here: the ladder's first step, like everyone.
    const a = await enter(b, { mode: 'corrida-armada', map: 'rua' }, [{ t: 'loadout', lo: choice }]);
    expect(a.joined.session.mode).toBe('corrida-armada');
    expect(a.me.lo).toEqual(ladderLoadout(0));
    const [s0, s1] = [LADDER[0], LADDER[1]];
    // (the test needs two different guns on the first two steps)
    expect(isGun(s0.arma) && isGun(s1.arma) && s0.arma !== s1.arma).toBe(true);
    const g0 = gunStats(s0.arma as GunId, s0.melhorias);
    const g1 = gunStats(s1.arma as GunId, s1.melhorias);
    expect(g0).not.toBe(gunStats(s0.arma as GunId, own.ativas[progOf(s0.arma as GunId)]));

    const vs: In[] = [];
    for (const n of ['Degrau A', 'Degrau B', 'Degrau C', 'Saco de Pancada']) vs.push(await enter(await signedIn(n), a.joined.session.id));
    const [v1, v2, v3, dummy] = vs;
    await spawn(a, [0, 0, 0]);
    for (const [i, v] of [v1, v2, v3].entries()) await spawn(v, [i * 2 - 2, 0, 10], a);
    await spawn(dummy, [0, 0, 30], a);
    at(a, [0, 0, 0]);

    // The step's gun, with the step's upgrades.
    a.p.send({ t: 'hit', target: dummy.id, region: 'peito', dist: 30, w: s0.arma });
    expect((await a.p.next('damage', (m) => m.target === dummy.id)).amount).toBe(computeDamage(g0, 30, 'peito'));
    // Three kills: the next step's weapons.
    await groinKill(a, v1, s0.arma);
    await groinKill(a, v2, s0.arma);
    const next = a.p.next('playerLoadout', (m) => m.id === a.id);
    await groinKill(a, v3, s0.arma);
    expect((await next).lo).toEqual(ladderLoadout(1));
    // Shots of the last step's gun still in flight count for a moment, with that step's stats...
    a.p.send({ t: 'hit', target: dummy.id, region: 'peito', dist: 30, w: s0.arma });
    expect((await a.p.next('damage', (m) => m.target === dummy.id)).amount).toBe(computeDamage(g0, 30, 'peito'));
    a.p.send({ t: 'hit', target: dummy.id, region: 'peito', dist: 30, w: s1.arma });
    expect((await a.p.next('damage', (m) => m.target === dummy.id)).amount).toBe(computeDamage(g1, 30, 'peito'));
    // ...and not after it.
    await sleep(1100);
    a.p.send({ t: 'hit', target: dummy.id, region: 'peito', dist: 30, w: s0.arma });
    await expect(a.p.next('damage', (m) => m.target === dummy.id, 300)).rejects.toThrow();

    // No weapon points for the kills (the account still earns its XP), and the database agrees after leaving.
    const prog = lastProgress(a)!;
    for (const w of PROG_WEAPONS) expect(prog.armas[w].xp).toBe(xpForLevel(w, MAX_LEVELS[w]));
    expect(prog.conta.xp).toBe(3 * ACCOUNT_XP.perKill);
    a.p.send({ t: 'leave' });
    await sleep(300);
    const profile = (await b.req('GET', '/api/perfil')).body;
    for (const w of PROG_WEAPONS) expect(profile.armas[w].xp).toBe(xpForLevel(w, MAX_LEVELS[w]));
    expect(profile.xp).toBe(3 * ACCOUNT_XP.perKill);
    for (const x of [a, ...vs]) x.p.close();
  });
});
