// The solo zumbi game: the same match engine as the server (shared/zombieMatch.ts), run here on the game's
// clock over the navmesh the browser builds for the map (the very one baked for the server), for one player.
// It answers the zombie side (client.ts) with the same messages the server sends, so everything on screen is
// the same online and alone: the coffin's rolls (damaged ones included), the barricades with their prices,
// boards and the zombies going around them. There's no account XP without the server (like every offline mode),
// and with nobody to revive you, going down alone ends the run.
import type { NavMesh } from 'recast-navigation';
import { gunStats, grenadeStats, type Loadout } from '@shared/arsenal';
import { isGun, progOf } from '@shared/progression';
import { explosionDamage, type HitRegion } from '@shared/weapons';
import type { ClientMsg, ServerMsg, Vec3, ZHazard } from '@shared/protocol';
import { grenadeDamageToZombie, gunDamageToZombie, isBoss, knifeDamageToZombie, weaponMul, ZOMBIE, zombieLoadout, type ZombieMapData } from '@shared/zombies';
import { ZombieMatch } from '@shared/zombieMatch';
import type { ZombieLink } from './link';

export interface LocalZombieOptions {
  me: number;
  name: string;
  /** A zombie (or the thorns) hurt us. */
  hurt(amount: number, from: Vec3, kind?: ZHazard): void;
  /** Other weapons in our hands (the coffin's, the starting ones). */
  setLoadout(lo: Loadout): void;
  /** A new run starts: back at a spawn point. */
  newMatch(): void;
}

export class LocalZombies implements ZombieLink {
  readonly online = false;
  readonly match: ZombieMatch;
  private handlers = new Map<string, ((m: ServerMsg) => void)[]>();
  /** The match clock (ms): the game's time, so it pauses with the menu. */
  private time = 0;

  constructor(
    navMesh: NavMesh,
    map: ZombieMapData,
    private o: LocalZombieOptions,
  ) {
    this.match = new ZombieMatch(
      {
        now: () => this.time,
        rng: Math.random,
        emit: (m) => this.dispatch(m),
        hurt: (_id, amount, from, kind) => o.hurt(amount, from, kind),
        giveXp: () => {},
        setLoadout: (_id, lo) => {
          o.setLoadout(lo);
          this.dispatch({ t: 'playerLoadout', id: o.me, lo });
        },
        bleedOut: () => {},
        revive: () => {},
        allowRespawn: () => {},
        newMatch: () => o.newMatch(),
      },
      navMesh,
      map,
    );
    this.match.join(o.me, o.name);
  }

  get loadout(): Loadout {
    return zombieLoadout(this.match.itemsOf(this.o.me));
  }

  private dispatch(m: ServerMsg) {
    for (const fn of this.handlers.get(m.t) ?? []) fn(m);
  }

  on<T extends ServerMsg['t']>(type: T, fn: (msg: Extract<ServerMsg, { t: T }>) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(fn as (m: ServerMsg) => void);
    this.handlers.set(type, list);
  }

  now() {
    return this.time;
  }

  renderTime() {
    return this.time - 34;
  }

  /** Our reports, applied at once: there's nobody to check them against. */
  send(msg: ClientMsg) {
    const me = this.o.me;
    const m = this.match;
    const items = m.itemsOf(me);
    switch (msg.t) {
      case 'zhit': {
        const z = m.hittable(msg.z);
        if (!z || !isGun(msg.w)) return;
        const gun = gunStats(msg.w, this.loadout.ativas[progOf(msg.w)]);
        const r: HitRegion = msg.region;
        const dmg = gunDamageToZombie(gun, Math.min(msg.dist, gun.alcanceMaximo), r, msg.keep ?? 1, weaponMul(items, msg.w), isBoss(z.kind));
        m.damage(z.id, me, dmg, r === 'cabeca' ? 'head' : r === 'virilha' ? 'groin' : 'gun');
        return;
      }
      case 'zstab':
        m.damage(msg.z, me, knifeDamageToZombie(weaponMul(items, 'faca')), 'knife');
        return;
      case 'boom': {
        const blast = grenadeStats([]).explosao;
        for (const h of msg.zs ?? []) m.damage(h.z, me, grenadeDamageToZombie(explosionDamage(blast, h.dist), m.wave), 'grenade');
        // The haunted graves' ghosts never die: a blast scares them away.
        m.scareGhosts(msg.p, ZOMBIE.fantasmas.sustoGranada);
        return;
      }
      case 'box':
        m.useBox(me);
        return;
      case 'boxDonate':
        m.donateBox(me);
        return;
      case 'boxRefuse':
        m.refuseBox(me);
        return;
      case 'totem':
        m.useTotem(me);
        return;
      case 'zscare':
        m.knifeScare(me);
        return;
      case 'barricade':
        m.barricadeWork(me, msg.i, msg.on);
        return;
    }
  }

  /** One step of the match, with where we are; the zombies' snapshot goes out every step. */
  step(dt: number, feet: Vec3, grounded: boolean, alive: boolean) {
    this.time += dt * 1000;
    this.match.tick(dt, [{ id: this.o.me, feet, grounded, alive }]);
    this.dispatch(this.match.snapshot());
  }

  /** We died: alone, that's the end of the run. */
  died() {
    this.match.died(this.o.me);
  }

  dispose() {
    this.match.dispose();
  }
}
