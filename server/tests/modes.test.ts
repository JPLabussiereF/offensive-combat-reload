// Game modes on the real server: mata-mata keeps the loadout chosen before the match (the Arsenal is changed
// in the lobby, level-ups wait for the next session), and corrida armada's ladder (three kills with the step's
// weapon move you up, a stab moves you down, a lightsaber kill wins the round and a new one starts).
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { FLAG, type PlayerInfo, type Vec3 } from '@shared/protocol';
import { DEFAULT_LOADOUT, gunStats } from '@shared/arsenal';
import { afterDeath, afterKill, FINAL_STEP, GUN_GAME, LADDER, ladderLoadout, ladderProblems, killsForStep, stepWeapon } from '@shared/gunGame';
import { GAME_MODE_IDS, MODE_RULES } from '@shared/modes';
import { isGun } from '@shared/progression';
import { computeDamage } from '@shared/weapons';
import type { GameServer } from '../app';
import { Browser, Player, sleep, startTestServer } from './helpers';

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

/** Connects, says hello, sends `lobby` messages (they're processed in order) and joins `session`. */
async function enter(b: Browser, session: string, lobby: object[] = []) {
  const p = await Player.connect(game, await b.ticket());
  p.send({ t: 'hello' });
  const welcome = await p.next('welcome');
  for (const m of lobby) p.send(m);
  p.send({ t: 'join', session });
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
    expect(stepWeapon(FINAL_STEP)).toBe('faca');
    expect(ladderLoadout(FINAL_STEP)).toMatchObject({ soFaca: true, ativas: { faca: ['sabre'] } });
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
    const a = await enter(await signedIn('Travado'), 'principal', [{ t: 'loadout', lo: { secundaria: 'smg', ligadas: {} } }]);
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
    expect(prog && prog.t === 'progresso' && prog.armas[gun0].xp).toBe(0);
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
