// Procedural placeholder sounds (section 13) on Web Audio mixing buses. No asset files needed for the prototype;
// each function maps to a future sample bank entry (rifle_fire, dry_fire, rifle_reload, ...).
//
// Spatial sound: the player's own sounds play "in the head"; everything else plays from where it happens via
// `at(position, kind, play)`, through a panner (HRTF on headphones, plain stereo on speakers and phones), a
// low-pass for air and walls in between (occlusion, a ray cast against the map), and echo sends: a short room
// reverb in enclosed spots, a long open-air tail for gunshots and explosions outside.
import type { SurfaceMaterial } from '../world/physics';
import type { GunId, KnifeId } from '@shared/progression';
import { distanceGain, Enclosure, SPATIAL_KINDS, voiceParams, type CastFn, type SpatialKindName, type Vec } from './spatial';

type Bus = 'sfx' | 'ui';
/** 'hrtf' = 3D for headphones; 'stereo' = left/right only (speakers, lighter on phones). */
export type SpatialMode = 'hrtf' | 'stereo';
/** How a shot sounds: each gun's own bang, or muffled by a silencer. */
export type GunVoice = GunId | 'silenciado';
/** Occlusion between two points: 0 = clear, 1 per solid wall (thin materials count less). */
export type OcclusionFn = (from: Vec, to: Vec) => number;

/** Too many voices at once: lower-priority sounds (footsteps first) are dropped. */
const MAX_VOICES = 36;
const VOICE_LIFE = 1.2;

/** A synthetic impulse response: decaying noise, darker as it fades; `slap` adds an early echo off far walls. */
function impulse(ctx: AudioContext, seconds: number, decay: number, slap: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.5 + 0.45 * t; // one-pole low-pass that closes over time
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = lp * Math.pow(1 - t, decay) * 2.2;
    }
    if (slap > 0) {
      const at = Math.floor(ctx.sampleRate * (0.09 + c * 0.013));
      for (let i = 0; i < 1800 && at + i < len; i++) d[at + i] += (Math.random() * 2 - 1) * slap * (1 - i / 1800);
    }
  }
  return buf;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private noise!: AudioBuffer;
  private lowpass!: BiquadFilterNode;
  private volume = 0.7;
  // Spatial.
  private mode: SpatialMode = 'hrtf';
  private spatialBus!: GainNode;
  private roomIn!: GainNode;
  private openIn!: GainNode;
  /** The player's own sounds get the echo of where they stand. */
  private selfRoom!: GainNode;
  private selfOpen!: GainNode;
  /** While a spatial sound is being built, its nodes connect here instead of to a bus. */
  private route: AudioNode | null = null;
  private ear = { x: 0, y: 0, z: 0 };
  private voices: { end: number; priority: number }[] = [];
  private loops = new Set<SpatialLoop>();
  private occlusion: OcclusionFn | null = null;
  private enclosure: Enclosure | null = null;
  private earT = 0;

  /** Browsers only allow audio after a user gesture: call from the first click. */
  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      // Muffled-hearing filter for low health (section 6).
      this.lowpass = ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.value = 20000;
      this.master.connect(this.lowpass).connect(ctx.destination);
      this.buses = { sfx: ctx.createGain(), ui: ctx.createGain() };
      this.buses.sfx.connect(this.master);
      this.buses.ui.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // Echo: a short room and a long, dark open-air tail, fed by sends from each sound.
      this.spatialBus = ctx.createGain();
      this.spatialBus.connect(this.master);
      const room = ctx.createConvolver();
      room.buffer = impulse(ctx, 0.9, 3.2, 0);
      const open = ctx.createConvolver();
      open.buffer = impulse(ctx, 1.9, 2.4, 0.5);
      this.roomIn = ctx.createGain();
      this.openIn = ctx.createGain();
      this.roomIn.connect(room).connect(this.master);
      this.openIn.connect(open).connect(this.master);
      this.selfRoom = ctx.createGain();
      this.selfOpen = ctx.createGain();
      this.selfRoom.gain.value = this.selfOpen.gain.value = 0;
      this.buses.sfx.connect(this.selfRoom).connect(this.roomIn);
      this.buses.sfx.connect(this.selfOpen).connect(this.openIn);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.value = v;
  }

  setSpatialMode(mode: SpatialMode) {
    this.mode = mode;
    for (const l of this.loops) l.panner.panningModel = mode === 'hrtf' ? 'HRTF' : 'equalpower';
  }

  /** The map's walls: `cast` for room echo, `occlusion` for sounds behind walls. Call again on a new map. */
  setWorld(cast: CastFn | null, occlusion: OcclusionFn | null) {
    this.enclosure = cast ? new Enclosure(cast) : null;
    this.occlusion = occlusion;
  }

  /** Every frame: where the ears are (the camera) and where they face. */
  setListener(pos: Vec, forward: Vec, up: Vec, dt: number) {
    this.ear.x = pos.x;
    this.ear.y = pos.y;
    this.ear.z = pos.z;
    if (!this.ready) return;
    const ctx = this.ctx!;
    const l = ctx.listener;
    const t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.01);
      l.positionY.setTargetAtTime(pos.y, t, 0.01);
      l.positionZ.setTargetAtTime(pos.z, t, 0.01);
      l.forwardX.setTargetAtTime(forward.x, t, 0.01);
      l.forwardY.setTargetAtTime(forward.y, t, 0.01);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.01);
      l.upX.setTargetAtTime(up.x, t, 0.01);
      l.upY.setTargetAtTime(up.y, t, 0.01);
      l.upZ.setTargetAtTime(up.z, t, 0.01);
    } else {
      // Firefox: the older setters.
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
    // A few times a second: the echo of where the player stands, and walls between them and looping sounds.
    this.earT -= dt;
    if (this.earT > 0) return;
    this.earT = 0.2;
    const enc = this.enclosure?.at(pos) ?? 0;
    this.selfRoom.gain.setTargetAtTime(0.22 * enc, t, 0.15);
    this.selfOpen.gain.setTargetAtTime(0.1 * (1 - enc), t, 0.15);
    for (const l of this.loops) l.refresh();
  }

  /**
   * Plays a sound from a point in the world: `play` calls one of the sound functions (`s => s.gunshot()`),
   * whose nodes are routed through this point's panner, occlusion filter and echo sends.
   */
  at(pos: Vec, kind: SpatialKindName, play: (s: this) => void) {
    if (!this.ready) return;
    const k = SPATIAL_KINDS[kind];
    const d = Math.hypot(pos.x - this.ear.x, pos.y - this.ear.y, pos.z - this.ear.z);
    if (d > k.max || !this.admit(k.priority)) return;
    const chain = this.chain(pos, kind, d);
    const prev = this.route;
    this.route = chain.input;
    try {
      play(this);
    } finally {
      this.route = prev;
    }
  }

  /** A looping sound that stays at a point (hydrant hiss): returns its controls. */
  loopAt(pos: Vec, kind: SpatialKindName, build: (out: AudioNode, ctx: AudioContext) => () => void): SpatialLoop | null {
    if (!this.ready) return null;
    const d = Math.hypot(pos.x - this.ear.x, pos.y - this.ear.y, pos.z - this.ear.z);
    const chain = this.chain(pos, kind, d);
    const loop = new SpatialLoop(this, pos, kind, chain);
    const stop = build(chain.input, this.ctx!);
    loop.onStop = () => {
      stop();
      this.loops.delete(loop);
    };
    this.loops.add(loop);
    return loop;
  }

  /** @internal Direct sound and echo of a point; also refreshed by loops. */
  chain(pos: Vec, kind: SpatialKindName, d: number): SpatialChain {
    const ctx = this.ctx!;
    const k = SPATIAL_KINDS[kind];
    const input = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    const panner = ctx.createPanner();
    panner.panningModel = this.mode === 'hrtf' ? 'HRTF' : 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = k.ref;
    panner.rolloffFactor = k.rolloff;
    panner.maxDistance = 10000;
    if (panner.positionX) {
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
    } else panner.setPosition(pos.x, pos.y, pos.z);
    input.connect(filter).connect(panner).connect(this.spatialBus);
    const room = ctx.createGain();
    const open = ctx.createGain();
    filter.connect(room).connect(this.roomIn);
    filter.connect(open).connect(this.openIn);
    const chain = { input, filter, panner, room, open };
    this.tune(chain, pos, kind, d, true);
    return chain;
  }

  /** @internal Occlusion, air and echo for the current listener position. */
  tune(c: SpatialChain, pos: Vec, kind: SpatialKindName, d: number, now: boolean) {
    const ctx = this.ctx!;
    const k = SPATIAL_KINDS[kind];
    const occ = this.occlusion && d > 0.5 ? this.occlusion(this.ear, pos) : 0;
    const v = voiceParams(d, occ);
    const enc = this.enclosure?.at(pos) ?? 0;
    const far = Math.sqrt(distanceGain(d, k));
    const set = (p: AudioParam, value: number) => (now ? (p.value = value) : p.setTargetAtTime(value, ctx.currentTime, 0.12));
    set(c.input.gain, v.gain);
    set(c.filter.frequency, v.cutoff);
    set(c.room.gain, k.room * enc * far * 0.7);
    set(c.open.gain, k.open * (1 - enc) * far);
  }

  /** @internal */
  get earPos(): Vec {
    return this.ear;
  }

  private admit(priority: number): boolean {
    const now = this.ctx!.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= MAX_VOICES) {
      // Full: replace a lower-priority voice, or drop this one.
      const i = this.voices.findIndex((v) => v.priority < priority);
      if (i < 0) return false;
      this.voices.splice(i, 1);
    }
    this.voices.push({ end: now + VOICE_LIFE, priority });
    return true;
  }

  /** Where this sound's nodes connect: the spatial chain being built, or the bus. */
  private out(bus: Bus): AudioNode {
    return this.route ?? this.buses[bus];
  }

  setMuffled(amount: number) {
    if (!this.ctx) return;
    const f = 20000 * Math.pow(900 / 20000, amount);
    this.lowpass.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.1);
  }

  private get ready() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseBurst(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, bus: Bus = 'sfx', rate = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, peak, 0.002, dur);
    src.connect(f).connect(g).connect(this.out(bus));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, bus: Bus = 'sfx', attack = 0.004) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, attack, dur);
    o.connect(g).connect(this.out(bus));
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  /**
   * Three layers: crack, body, room tail; +-5% pitch variation so it never sounds identical. Each gun has its
   * voice: the rifle's full bang, the pistol's sharper and shorter pop, the SMG's light, quick crack; a
   * silenced one is a muffled "pff" (other players hear it only up close). Other players' shots play through
   * `at(muzzle, ...)`, which handles their distance and direction.
   */
  gunshot(volume = 1, voice: GunVoice = 'rifle') {
    if (!this.ready || volume < 0.02) return;
    const t = this.ctx!.currentTime;
    const p = 0.95 + Math.random() * 0.1;
    const v = volume;
    if (voice === 'silenciado') {
      this.noiseBurst(t, 0.06, 'lowpass', 900 * p, 0.8, 0.45 * v, 'sfx', p);
      this.noiseBurst(t, 0.03, 'bandpass', 2600 * p, 1.5, 0.12 * v, 'sfx', p);
      return this.tone(t, 'sine', 120 * p, 60, 0.05, 0.25 * v);
    }
    // Pitch, body length and low end of each voice.
    const [pitch, body, low] = voice === 'pistola' ? [1.35, 0.09, 0.55] : voice === 'smg' ? [1.2, 0.08, 0.5] : [1, 0.14, 0.8];
    this.noiseBurst(t, 0.05, 'highpass', 2500 * p * pitch, 0.7, 0.55 * v * v, 'sfx', p);
    this.noiseBurst(t, body, 'lowpass', 1400 * p * pitch, 0.9, 0.9 * v, 'sfx', p);
    this.tone(t, 'sine', 150 * p * pitch, 45, body * 0.85, low * v);
    this.noiseBurst(t + 0.02, body * 2.5, 'bandpass', 700 * p * pitch, 0.6, 0.12 * Math.sqrt(v), 'sfx', p);
  }

  /** Switching guns: cloth and a metallic click as the other one comes up. */
  weaponSwitch() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.08, 'bandpass', 700, 1.2, 0.12);
    this.noiseBurst(t + 0.1, 0.03, 'bandpass', 2600, 3, 0.3);
    this.tone(t + 0.1, 'triangle', 900, 600, 0.03, 0.12);
  }

  dryFire() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.03, 'highpass', 4000, 1, 0.35);
    this.tone(t, 'square', 1800, 900, 0.02, 0.05);
  }

  /** Reload timeline: mag out, mag in, and (empty reload) bolt release. */
  reload(duration: number, empty: boolean) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const click = (at: number, f: number, peak: number) => {
      this.noiseBurst(t + at, 0.05, 'bandpass', f, 3, peak);
      this.tone(t + at, 'triangle', f / 3, f / 6, 0.05, peak * 0.4);
    };
    click(duration * 0.2, 1800, 0.35);
    click(duration * 0.55, 1200, 0.5);
    if (empty) {
      click(duration * 0.8, 2600, 0.4);
      click(duration * 0.86, 1500, 0.45);
    }
  }

  hitmarker(headshot: boolean) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'triangle', headshot ? 2600 : 1700, headshot ? 2200 : 1500, 0.045, 0.35, 'ui', 0.001);
    if (headshot) this.tone(t + 0.02, 'sine', 3400, 3000, 0.12, 0.18, 'ui');
  }

  killDing() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sine', 523, 520, 0.5, 0.35, 'ui', 0.002);
    this.tone(t, 'sine', 1046, 1040, 0.35, 0.15, 'ui', 0.002);
    this.tone(t + 0.08, 'sine', 784, 780, 0.5, 0.25, 'ui', 0.002);
  }

  /** Cartoon "boing" when a dummy falls over. */
  boing() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 40;
    lfo.connect(lfoGain).connect(o.frequency);
    const g = ctx.createGain();
    this.env(g, t, 0.3, 0.01, 0.5);
    o.connect(g).connect(this.out('sfx'));
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.6);
    lfo.stop(t + 0.6);
  }

  impact(material: SurfaceMaterial) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const freq: Record<SurfaceMaterial, number> = { grass: 500, concrete: 1800, wood: 900, metal: 3200, glass: 4500, tile: 2400, paper: 700 };
    this.noiseBurst(t, material === 'metal' ? 0.12 : 0.05, 'bandpass', freq[material], material === 'metal' ? 6 : 1.5, 0.12);
    if (material === 'metal') this.tone(t, 'triangle', 2400 + Math.random() * 800, 2000, 0.15, 0.05);
  }

  footstep(material: SurfaceMaterial, loud: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const freq: Record<SurfaceMaterial, number> = { grass: 350, concrete: 700, wood: 450, metal: 1400, glass: 1200, tile: 900, paper: 500 };
    this.noiseBurst(t, 0.07, 'lowpass', freq[material] * (0.9 + Math.random() * 0.2), 1, 0.12 * loud);
    this.tone(t, 'sine', 90, 50, 0.06, 0.12 * loud);
  }

  land(hard: boolean) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.12, 'lowpass', 500, 1, hard ? 0.6 : 0.25);
    this.tone(t, 'sine', 110, 40, 0.15, hard ? 0.6 : 0.2);
  }

  hurt() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sawtooth', 220, 110, 0.25, 0.15);
    this.noiseBurst(t, 0.15, 'lowpass', 600, 1, 0.3);
  }

  /** Sad trombone for the player's own death. */
  sadTrombone() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    [311, 294, 277, 262].forEach((f, i) => {
      const dur = i === 3 ? 0.9 : 0.3;
      this.tone(t + i * 0.35, 'sawtooth', f, i === 3 ? f * 0.94 : f, dur, 0.12, 'sfx', 0.03);
    });
  }

  squeak() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'square', 900, 1800, 0.08, 0.06);
    this.tone(t + 0.08, 'square', 1800, 1100, 0.1, 0.05);
  }

  /** Ice cream truck gag: a short music-box tune. */
  iceCream() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const notes = [659, 587, 523, 587, 659, 659, 659, 0, 587, 587, 587, 0, 659, 784, 784];
    notes.forEach((f, i) => {
      if (f) this.tone(t + i * 0.16, 'triangle', f, f, 0.18, 0.12, 'sfx', 0.005);
    });
  }

  knifeSwing() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(3500, t + 0.14);
    const g = ctx.createGain();
    this.env(g, t, 0.35, 0.05, 0.12);
    src.connect(f).connect(g).connect(this.out('sfx'));
    src.start(t);
    src.stop(t + 0.25);
  }

  knifeHit() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.08, 'lowpass', 900, 1, 0.7);
    this.tone(t, 'sine', 180, 60, 0.12, 0.6);
    this.tone(t + 0.01, 'square', 1200, 600, 0.05, 0.05);
  }

  /** "No pássaro!": two cartoon chirps and a slide whistle down. */
  bird() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 2; i++) {
      this.tone(t + i * 0.13, 'sine', 2600, 4200, 0.06, 0.25, 'ui', 0.002);
      this.tone(t + i * 0.13 + 0.05, 'sine', 4200, 3000, 0.05, 0.2, 'ui', 0.002);
    }
    this.tone(t + 0.3, 'sine', 1800, 300, 0.6, 0.2, 'ui', 0.01);
  }

  airHorn() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (const [f, at] of [[466, 0], [466, 0.18], [466, 0.36]] as const) {
      this.tone(t + at, 'sawtooth', f, f * 0.98, at === 0.36 ? 0.5 : 0.12, 0.12, 'sfx', 0.01);
      this.tone(t + at, 'sawtooth', f * 1.5, f * 1.47, at === 0.36 ? 0.5 : 0.12, 0.06, 'sfx', 0.01);
    }
  }

  applause(duration = 1.4) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 70; i++) {
      const at = Math.random() * duration;
      const fade = 1 - at / duration;
      this.noiseBurst(t + at, 0.03, 'bandpass', 1500 + Math.random() * 2500, 1.2, 0.08 * fade + 0.02);
    }
  }

  /** Short funky loop for the victory dance (150 bpm). Returns a function that stops it early. */
  danceMusic(duration: number): () => void {
    if (!this.ready) return () => {};
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const bus = ctx.createGain();
    bus.connect(this.buses.sfx);
    const beat = 0.4;
    const bass = [98, 98, 147, 131, 98, 98, 175, 165];
    const lead = [392, 0, 440, 494, 0, 587, 494, 440, 392, 0, 330, 392, 0, 440, 0, 0];
    const osc = (at: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
      const g = ctx.createGain();
      this.env(g, at, peak, 0.004, dur);
      o.connect(g).connect(bus);
      o.start(at);
      o.stop(at + dur + 0.05);
    };
    for (let i = 0; i * beat < duration; i++) {
      const at = t0 + i * beat;
      osc(at, 'sine', 140, 45, 0.18, 0.7); // kick
      osc(at, 'square', bass[i % bass.length], bass[i % bass.length], 0.3, 0.07);
      const hat = ctx.createBufferSource();
      hat.buffer = this.noise;
      const hf = ctx.createBiquadFilter();
      hf.type = 'highpass';
      hf.frequency.value = 7000;
      const hg = ctx.createGain();
      this.env(hg, at + beat / 2, 0.12, 0.002, 0.04);
      hat.connect(hf).connect(hg).connect(bus);
      hat.start(at + beat / 2, Math.random() * 0.5);
      hat.stop(at + beat / 2 + 0.08);
    }
    for (let i = 0; i * (beat / 2) < duration; i++) {
      const f = lead[i % lead.length];
      if (f) osc(t0 + i * (beat / 2), 'triangle', f, f, 0.16, 0.1);
    }
    return () => {
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      setTimeout(() => bus.disconnect(), 300);
    };
  }

  /** Continuous water hiss (burst hydrant). Volume is set every frame by the caller (distance). */
  /** Continuous water hiss (burst hydrant) at `pos`; the caller sets its strength every frame. */
  hiss(pos: Vec): { setVolume(v: number): void; stop(): void } {
    let g: GainNode | null = null;
    const loop = this.loopAt(pos, 'normal', (out, ctx) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2200;
      f.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      g = gain;
      src.connect(f).connect(gain).connect(out);
      src.start();
      return () => {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        src.stop(ctx.currentTime + 0.5);
      };
    });
    if (!loop || !g) return { setVolume() {}, stop() {} };
    const gain: GainNode = g;
    const ctx = this.ctx!;
    return {
      setVolume: (v) => gain.gain.setTargetAtTime(0.25 * v, ctx.currentTime, 0.05),
      stop: () => loop.stop(),
    };
  }

  /** Bronze gong: a mallet thud and inharmonic partials ringing for a few seconds. */
  gong() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.08, 'lowpass', 600, 0.7, 0.3);
    const partials: [number, number, number][] = [[92, 0.22, 4.5], [139, 0.14, 3.8], [197, 0.1, 3.2], [263, 0.07, 2.6], [354, 0.05, 2], [478, 0.03, 1.4]];
    for (const [f, peak, dur] of partials) this.tone(t, 'sine', f * (0.99 + Math.random() * 0.02), f * 0.985, dur, peak, 'sfx', 0.012);
  }

  /**
   * Bronze temple bell (`size` 1 ≈ a 1.25 m bell; bigger is deeper and rings longer): the strike's clank,
   * then bell partials (hum, prime, tierce, quint, nominal...), each a slightly detuned pair so it beats
   * ("wah-wah") as it fades.
   */
  bell(size = 1, note?: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const f = note ?? 300 / size;
    const ring = note ? 1.6 + 1.2 * size : 2.2 + 2.2 * size;
    this.noiseBurst(t, 0.05, 'bandpass', 2400 / size, 1.5, 0.18);
    this.tone(t, 'triangle', f * 4.2, f * 4.1, 0.08, 0.06, 'sfx', 0.001);
    // A tuned bell (`note`, Hz) leans on its prime and octave so the melody reads; a temple bell keeps its
    // deep hum and minor third.
    const partials: [number, number, number][] = note
      ? [[0.5, 0.05, 0.7], [1, 0.22, 1], [2, 0.08, 0.6], [2.4, 0.03, 0.35], [3, 0.03, 0.25], [4.1, 0.015, 0.15]]
      : [[0.5, 0.13, 1], [1, 0.15, 0.8], [1.19, 0.09, 0.6], [1.5, 0.05, 0.45], [2, 0.07, 0.4], [2.66, 0.035, 0.25], [3.3, 0.02, 0.15]];
    for (const [ratio, peak, life] of partials) {
      const p = f * ratio * (0.995 + Math.random() * 0.01);
      this.tone(t, 'sine', p, p * 0.998, ring * life, peak, 'sfx', 0.003);
      this.tone(t, 'sine', p * 1.004, p * 1.002, ring * life * 0.8, peak * 0.6, 'sfx', 0.003);
    }
  }

  /** Biting the Dragon Cherry: a juicy crunch, then a rising sparkle (more max health). */
  cherry() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.09, 'bandpass', 1400, 1.4, 0.3);
    this.noiseBurst(t + 0.03, 0.12, 'lowpass', 700, 0.8, 0.18);
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(t + 0.08 + i * 0.06, 'triangle', f, f * 1.01, 0.22, 0.09, 'sfx', 0.004));
  }

  /** A cherry knocked off the tree: a wet little splat and the snap of its stem. */
  fruitSplat() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.06, 'bandpass', 2600, 2, 0.12);
    this.noiseBurst(t + 0.01, 0.1, 'lowpass', 900, 0.9, 0.16);
    this.tone(t, 'sine', 520, 260, 0.08, 0.05, 'sfx', 0.002);
  }

  /** The cherry wears off: a short falling blip. */
  cherryEnd() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'triangle', 880, 440, 0.25, 0.08, 'sfx', 0.004);
  }

  /** A struck drum (`size` 1 = a big temple drum; small ones are higher and drier): boom, body and skin slap. */
  drum(size = 1) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const f = 95 / size;
    const p = 0.96 + Math.random() * 0.08;
    this.tone(t, 'sine', f * 1.6 * p, f * p, 0.1 + 0.6 * size, 0.6, 'sfx', 0.002);
    this.tone(t, 'sine', f * 2.3 * p, f * 1.5 * p, 0.06 + 0.2 * size, 0.18, 'sfx', 0.002);
    this.noiseBurst(t, 0.08 + 0.3 * size, 'lowpass', 260 / size, 0.8, 0.35);
    this.noiseBurst(t, 0.035, 'bandpass', 1800 / size, 1.2, 0.12);
  }

  /** The fountain dragon: a growl that rises into a roar, over the whoosh of its fire breath. */
  roar() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sawtooth', 70, 150, 0.35, 0.14, 'sfx', 0.08);
    this.tone(t + 0.3, 'sawtooth', 150, 60, 1.1, 0.16, 'sfx', 0.02);
    this.tone(t + 0.3, 'square', 110, 48, 1.0, 0.05, 'sfx', 0.02);
    this.noiseBurst(t + 0.25, 1.3, 'bandpass', 900, 0.6, 0.22);
    this.noiseBurst(t + 0.35, 1.1, 'lowpass', 400, 0.7, 0.18);
  }

  /** A paper lantern taking a bullet: soft thump and a rustle. */
  lanternTap() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.12, 'bandpass', 700, 1.2, 0.14);
    this.tone(t, 'sine', 420, 260, 0.12, 0.06);
  }

  splash() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.35, 'lowpass', 1800, 0.8, 0.22);
    this.tone(t, 'sine', 300, 120, 0.2, 0.1);
  }

  /** Ambient: a distant bird, now and then. */
  ambientBird() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const base = 2600 + Math.random() * 1200;
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) this.tone(t + i * 0.11, 'sine', base, base * 1.25, 0.07, 0.035, 'sfx', 0.004);
  }

  /** Slide: gravelly scrape that fades as the slide slows down. */
  slide(material: SurfaceMaterial) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    const base = material === 'grass' ? 700 : material === 'wood' ? 1100 : material === 'metal' ? 2600 : 1600;
    f.frequency.setValueAtTime(base, t);
    f.frequency.exponentialRampToValueAtTime(base * 0.4, t + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    src.connect(f).connect(g).connect(this.out('sfx'));
    src.start(t, Math.random() * 0.1);
    src.stop(t + 0.9);
    this.tone(t, 'sine', 120, 60, 0.12, 0.25);
  }

  /** Pin pull: metallic ping plus the spoon clack. */
  pinPull() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'triangle', 3200, 2800, 0.08, 0.12, 'sfx', 0.001);
    this.noiseBurst(t + 0.05, 0.04, 'bandpass', 2400, 4, 0.25);
  }

  grenadeThrow() {
    this.knifeSwing();
  }

  /** Grenade hitting the ground/walls; `strength` 0..1 from the impact speed. */
  grenadeBounce(strength: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'triangle', 1500 + Math.random() * 500, 900, 0.06, 0.12 * strength, 'sfx', 0.001);
    this.noiseBurst(t, 0.04, 'bandpass', 2000, 3, 0.18 * strength);
  }

  /** Cooking tick: one short beep per second of fuse, faster pitch as it runs out. */
  fuseBeep(urgency: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'square', 900 + urgency * 700, 900 + urgency * 700, 0.05, 0.05, 'ui', 0.002);
  }

  /** Explosion: sub thump, crack, rumble tail. Played through `at(center, 'boom', ...)` for its distance and direction. */
  explosion() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sine', 90, 30, 0.6, 1.0);
    this.noiseBurst(t, 0.12, 'lowpass', 3000, 0.7, 0.9);
    this.noiseBurst(t + 0.02, 1.2, 'lowpass', 500, 0.8, 0.6);
    this.noiseBurst(t + 0.1, 0.8, 'bandpass', 250, 0.6, 0.3);
  }

  /** Doghouse gag: two cartoon woofs. */
  bark() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (const at of [0, 0.22]) {
      this.tone(t + at, 'sawtooth', 420, 180, 0.12, 0.18, 'sfx', 0.005);
      this.noiseBurst(t + at, 0.1, 'bandpass', 900, 2, 0.25);
    }
  }

  /** Swing sound of each knife (the kitchen knife uses knifeSwing). */
  meleeSwing(knife: KnifeId) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    switch (knife) {
      case 'faca':
        return this.knifeSwing();
      case 'colher': // wooden spoon: hollow knock
        this.tone(t + 0.08, 'triangle', 520, 300, 0.07, 0.35);
        return this.noiseBurst(t, 0.1, 'bandpass', 700, 1.5, 0.15);
      case 'baguete': // stale baguette: crunch
        this.noiseBurst(t + 0.08, 0.05, 'highpass', 2500, 1, 0.45);
        this.noiseBurst(t + 0.13, 0.04, 'highpass', 3200, 1, 0.3);
        return this.noiseBurst(t, 0.12, 'bandpass', 900, 1, 0.12);
      case 'peixe': // frozen fish: wet slap
        this.noiseBurst(t + 0.09, 0.07, 'lowpass', 1400, 1, 0.6);
        return this.tone(t + 0.09, 'sine', 220, 90, 0.1, 0.3);
      case 'macarrao': // pool noodle
        return this.boing();
      case 'frango': // rubber chicken: the classic squeal
        this.tone(t, 'square', 700, 1500, 0.09, 0.12, 'sfx', 0.004);
        this.tone(t + 0.09, 'square', 1500, 900, 0.22, 0.1, 'sfx', 0.004);
        this.tone(t + 0.09, 'sawtooth', 1480, 880, 0.22, 0.05, 'sfx', 0.004);
        return;
      case 'sabre': // knock-off lightsaber: "vuuum"
        this.tone(t, 'sawtooth', 110, 160, 0.32, 0.14, 'sfx', 0.02);
        this.tone(t, 'sawtooth', 113, 150, 0.32, 0.1, 'sfx', 0.02);
        return this.noiseBurst(t, 0.3, 'bandpass', 400, 3, 0.08);
    }
  }

  /** New weapon level: short fanfare. */
  levelUp() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.09, 'square', f, f, i === 3 ? 0.35 : 0.1, 0.1, 'ui', 0.004));
    this.tone(t + 0.27, 'triangle', 1568, 1568, 0.4, 0.08, 'ui', 0.004);
  }

  /** Planting a land mine: a metallic clack and a beep. */
  minePlant() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.05, 'bandpass', 2400, 2, 0.35);
    this.tone(t + 0.12, 'sine', 1800, 1800, 0.06, 0.12, 'sfx', 0.002);
  }

  /** Amora's bite: a short growl and a snap of the jaws. */
  bite() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sawtooth', 120, 85, 0.35, 0.22, 'sfx', 0.01);
    this.tone(t + 0.02, 'square', 240, 170, 0.3, 0.06, 'sfx', 0.01);
    this.tone(t + 0.32, 'sawtooth', 520, 200, 0.1, 0.25, 'sfx', 0.003);
    this.noiseBurst(t + 0.34, 0.07, 'highpass', 1800, 1, 0.5);
    this.noiseBurst(t + 0.35, 0.12, 'lowpass', 700, 1, 0.6);
  }

  // --- Vila Assombrada (Halloween map) ---------------------------------------------------------------

  /** The grave's ghost rising: a wobbly "wooOOoo" over a breath of wind. */
  ghostMoan() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(260, t);
    o.frequency.linearRampToValueAtTime(420, t + 0.6);
    o.frequency.linearRampToValueAtTime(300, t + 1.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const depth = ctx.createGain();
    depth.gain.value = 14;
    lfo.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g).connect(this.out('sfx'));
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.7);
    lfo.stop(t + 1.7);
    this.noiseBurst(t, 1.4, 'bandpass', 500, 0.8, 0.08);
  }

  /** Cartoon mumbling for speech bubbles: a few formant-ish blips. */
  grumble() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const f = 140 + Math.random() * 90;
      this.tone(t + i * 0.11, 'sawtooth', f, f * (0.75 + Math.random() * 0.4), 0.09, 0.07, 'sfx', 0.01);
      this.noiseBurst(t + i * 0.11, 0.06, 'bandpass', 700 + Math.random() * 500, 3, 0.05);
    }
  }

  /** Church bell: a strike and slowly decaying, slightly inharmonic partials. */
  churchBell(pitch = 1) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.05, 'highpass', 2000, 0.7, 0.12);
    const partials: [number, number, number][] = [[1, 0.18, 3.2], [2, 0.1, 2.6], [2.4, 0.08, 2.2], [3, 0.06, 1.8], [4.2, 0.04, 1.2], [5.4, 0.02, 0.8]];
    for (const [k, peak, dur] of partials) this.tone(t, 'sine', 300 * pitch * k, 300 * pitch * k * 0.995, dur, peak, 'sfx', 0.004);
  }

  /** Old car horn; `seconds` grows when someone keeps honking. */
  carHorn(seconds: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.setValueAtTime(0.12, t + seconds);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.08);
    f.connect(g).connect(this.out('sfx'));
    for (const hz of [392, 494]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = hz;
      o.connect(f);
      o.start(t);
      o.stop(t + seconds + 0.1);
    }
  }

  /** A pumpkin smashing: wet thud and a squelch. */
  pumpkinSmash() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sine', 180, 60, 0.15, 0.2);
    this.noiseBurst(t, 0.25, 'lowpass', 900, 0.8, 0.3);
    this.noiseBurst(t + 0.03, 0.18, 'bandpass', 1800, 1.5, 0.12);
  }

  /** A lamp shot out: glass tink and a fizzle. */
  bulbPop() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'triangle', 3200, 2400, 0.08, 0.08);
    this.noiseBurst(t, 0.12, 'highpass', 3000, 0.8, 0.18);
    this.noiseBurst(t + 0.08, 0.4, 'bandpass', 5000, 2, 0.04);
  }

  /** The giant rat: a big squeak (idle, or when it notices someone). */
  ratSqueak() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sawtooth', 900, 1500, 0.12, 0.07, 'sfx', 0.01);
    this.tone(t + 0.13, 'sawtooth', 1300, 700, 0.16, 0.06, 'sfx', 0.01);
    this.noiseBurst(t, 0.25, 'bandpass', 2400, 3, 0.05);
  }

  /** The giant rat taking a hit: a short, angry shriek. */
  ratHit() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'square', 1400, 900, 0.09, 0.06, 'sfx', 0.005);
    this.noiseBurst(t, 0.08, 'bandpass', 1800, 2, 0.08);
  }

  /** The giant rat going down: a long falling squeal and a thud. */
  ratDeath() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sawtooth', 1600, 300, 0.9, 0.1, 'sfx', 0.01);
    this.tone(t + 0.85, 'sine', 140, 50, 0.25, 0.25);
    this.noiseBurst(t + 0.85, 0.3, 'lowpass', 600, 0.8, 0.25);
  }

  /** A humanity, Dark Souls style: a soft rising shimmer over a low chord. */
  humanity() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (const [f, d] of [[110, 2.2], [165, 2.0], [220, 1.8]] as const) this.tone(t, 'sine', f, f, d, 0.08, 'sfx', 0.3);
    for (let i = 0; i < 6; i++) this.tone(t + 0.2 + i * 0.12, 'triangle', 660 * 1.122 ** i, 680 * 1.122 ** i, 0.5, 0.04, 'sfx', 0.05);
  }

  /** The Scooby biscuit: "Scoo-by Doo-by Doo!" on a cartoon horn. */
  scoobySnack() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const notes: [number, number, number][] = [[392, 0, 0.14], [330, 0.16, 0.2], [392, 0.42, 0.14], [330, 0.58, 0.2], [523, 0.84, 0.45]];
    for (const [f, at, d] of notes) {
      this.tone(t + at, 'square', f, f * 1.02, d, 0.07, 'sfx', 0.01);
      this.tone(t + at, 'sawtooth', f / 2, f / 2, d, 0.04, 'sfx', 0.01);
    }
  }

  /** Drinking the witch's potion: three gulps and a bubbly burp. */
  potionGulp() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 3; i++) this.tone(t + i * 0.22, 'sine', 220, 120, 0.12, 0.14, 'sfx', 0.01);
    this.tone(t + 0.75, 'sawtooth', 110, 70, 0.35, 0.08, 'sfx', 0.02);
    for (let i = 0; i < 4; i++) this.tone(t + 0.8 + i * 0.06, 'sine', 400 + i * 120, 900 + i * 150, 0.05, 0.05);
  }

  /** An old cabinet door swinging open: a creak. */
  cabinetCreak() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sawtooth', 320, 520, 0.45, 0.05, 'sfx', 0.04);
    this.noiseBurst(t, 0.45, 'bandpass', 1200, 6, 0.06);
  }

  /** The witch's cauldron: a run of bloops. */
  cauldronBubble() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 5; i++) {
      const f = 180 + Math.random() * 220;
      this.tone(t + i * 0.07 + Math.random() * 0.03, 'sine', f, f * 2.2, 0.07, 0.1);
    }
  }

  /** Rubber duck. */
  quack() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sawtooth', 900, 520, 0.16, 0.09, 'sfx', 0.01);
    this.noiseBurst(t, 0.12, 'bandpass', 1300, 4, 0.08);
  }

  /** The giant pumpkin's evil laugh: "ha-ha-ha-HAAA" dropping in pitch. */
  evilLaugh() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 6; i++) {
      const f = 210 - i * 14;
      const dur = i === 5 ? 0.5 : 0.13;
      this.tone(t + i * 0.17, 'sawtooth', f, f * 0.8, dur, 0.12, 'sfx', 0.01);
      this.noiseBurst(t + i * 0.17, dur * 0.8, 'bandpass', 900, 2, 0.06);
    }
  }

  /** Grandfather clock: `n` low bongs. */
  clockChime(n: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < n; i++) {
      for (const [k, peak, dur] of [[1, 0.14, 1.6], [2.7, 0.05, 0.9], [4.1, 0.03, 0.5]] as const) this.tone(t + i * 0.9, 'sine', 196 * k, 196 * k * 0.99, dur, peak, 'sfx', 0.006);
    }
  }

  /** Shooting gallery target going down. */
  targetDing() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'triangle', 1760, 1700, 0.25, 0.1);
    this.tone(t, 'sine', 2640, 2600, 0.15, 0.04);
  }

  /** Every target down: a quick calliope fanfare. */
  carnivalJingle() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const notes = [523, 659, 784, 1047, 0, 784, 1047];
    notes.forEach((f, i) => {
      if (f) this.tone(t + i * 0.12, 'square', f, f, i === notes.length - 1 ? 0.5 : 0.11, 0.06, 'sfx', 0.005);
    });
  }

  /** Scarecrow hitting the ground: a straw thump. */
  strawThud() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sine', 120, 50, 0.18, 0.18);
    this.noiseBurst(t, 0.3, 'bandpass', 1200, 0.6, 0.12);
  }

  /** Ambient: a crow somewhere. */
  ambientCrow() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const n = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      this.tone(t + i * 0.32, 'sawtooth', 620, 380, 0.22, 0.05, 'sfx', 0.01);
      this.noiseBurst(t + i * 0.32, 0.2, 'bandpass', 1500, 3, 0.05);
    }
  }

  /** Ambient: a wolf howling far away. */
  ambientHowl() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(380, t);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.8);
    o.frequency.setValueAtTime(720, t + 1.8);
    o.frequency.exponentialRampToValueAtTime(420, t + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.5);
    g.gain.setValueAtTime(0.06, t + 2.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.1);
    o.connect(g).connect(this.out('sfx'));
    o.start(t);
    o.stop(t + 3.2);
  }


  // --- Zumbi mode -------------------------------------------------------------------------------------

  /** A zombie's groan: a low, wobbly vowel through a throaty filter ("uuuurgh"); `pitch` per kind. */
  zombieGroan(pitch = 1) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const p = pitch * (0.9 + Math.random() * 0.2);
    const dur = 0.7 + Math.random() * 0.6;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95 * p, t);
    o.frequency.linearRampToValueAtTime(120 * p, t + dur * 0.3);
    o.frequency.linearRampToValueAtTime(70 * p, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7 + Math.random() * 4;
    const depth = ctx.createGain();
    depth.gain.value = 9 * p;
    lfo.connect(depth).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 520 * p;
    f.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out('sfx'));
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    this.noiseBurst(t, dur * 0.8, 'bandpass', 380 * p, 1.2, 0.04);
  }

  /** A zombie going down: a gurgle and a wet thud. */
  zombieDeath(pitch = 1) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sawtooth', 160 * pitch, 55 * pitch, 0.5, 0.12, 'sfx', 0.01);
    for (let i = 0; i < 4; i++) this.tone(t + 0.08 + i * 0.07, 'sine', 140 + Math.random() * 120, 60, 0.06, 0.07);
    this.noiseBurst(t + 0.45, 0.2, 'lowpass', 500, 0.8, 0.22);
    this.tone(t + 0.45, 'sine', 120, 45, 0.18, 0.18);
  }

  /** Coming out of the ground: dirt cracking and a gasp. */
  zombieRise() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.5, 'lowpass', 700, 0.7, 0.18);
    this.noiseBurst(t + 0.1, 0.3, 'bandpass', 1800, 2, 0.06);
    this.tone(t + 0.35, 'sawtooth', 110, 160, 0.3, 0.06, 'sfx', 0.05);
  }

  /** The gossip aunt's spit: a hork and a whoosh. */
  zombieSpit() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.18, 'bandpass', 900, 3, 0.16);
    this.tone(t, 'sawtooth', 220, 420, 0.12, 0.06, 'sfx', 0.01);
    this.noiseBurst(t + 0.12, 0.3, 'highpass', 2500, 0.8, 0.06);
  }

  /** Spit landing: a splat. */
  zombieSplat() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.16, 'lowpass', 1200, 1, 0.22);
    this.tone(t, 'sine', 300, 90, 0.1, 0.12);
  }

  /** The barbecue uncle bursting: the blast and a long, rude squelch. */
  bloaterPop() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.explosion();
    this.tone(t + 0.05, 'sawtooth', 180, 40, 0.7, 0.14, 'sfx', 0.01);
    this.noiseBurst(t + 0.1, 0.6, 'bandpass', 400, 1.5, 0.12);
  }

  /** A boss's roar: three detuned growls over a sub rumble; `pitch` lower for bigger bosses. */
  bossRoar(pitch = 0.6) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (const d of [0.97, 1, 1.04]) this.tone(t, 'sawtooth', 120 * pitch * d, 60 * pitch * d, 1.2, 0.09, 'sfx', 0.08);
    this.tone(t, 'sine', 55, 35, 1.3, 0.25, 'sfx', 0.1);
    this.noiseBurst(t, 1.1, 'bandpass', 600 * pitch, 1, 0.12);
  }

  /** A boss winding up a slam or a stomp: a rising grunt and a creak of strain. */
  bossWindup() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sawtooth', 70, 140, 0.9, 0.12, 'sfx', 0.1);
    this.noiseBurst(t, 0.9, 'bandpass', 300, 2, 0.06);
  }

  /** The bride's scream: a piercing wail that wobbles and falls. */
  bossScream() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.9);
    o.frequency.exponentialRampToValueAtTime(600, t + 1.8);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const depth = ctx.createGain();
    depth.gain.value = 60;
    lfo.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    o.connect(g).connect(this.out('sfx'));
    o.start(t);
    lfo.start(t);
    o.stop(t + 2);
    lfo.stop(t + 2);
    this.noiseBurst(t, 1.6, 'highpass', 3000, 0.7, 0.04);
  }

  /** The gravedigger calling the dead: a hollow chant over digging. */
  bossSummon() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (const [f, at] of [[110, 0], [104, 0.4], [98, 0.8]] as const) this.tone(t + at, 'square', f, f * 0.98, 0.45, 0.05, 'sfx', 0.05);
    for (let i = 0; i < 4; i++) this.noiseBurst(t + i * 0.35, 0.18, 'lowpass', 800, 0.8, 0.14);
  }

  /** The bride vanishing or coming back: a reverse whoosh and a shimmer. */
  bossBlink() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.35, 'bandpass', 1800, 1.5, 0.1);
    for (let i = 0; i < 5; i++) this.tone(t + i * 0.04, 'sine', 900 + i * 260, 1400 + i * 260, 0.18, 0.03);
  }

  /** The coffin's lid creaking open, then its music box. */
  coffinOpen() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sawtooth', 260, 420, 0.5, 0.05, 'sfx', 0.04);
    this.noiseBurst(t, 0.5, 'bandpass', 1100, 6, 0.06);
    const notes = [784, 659, 587, 659, 523, 587, 494, 523];
    notes.forEach((f, i) => this.tone(t + 0.4 + i * 0.32, 'triangle', f, f, 0.3, 0.05, 'sfx', 0.005));
  }

  /** Each weapon flicking past in the coffin. */
  coffinTick() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'square', 1800, 1600, 0.025, 0.025, 'sfx', 0.002);
  }

  /** The coffin stops on a weapon: a chime, bigger for an epic (1) or a legendary (2) one. */
  coffinReveal(level = 0) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const chord = level === 2 ? [523, 659, 784, 1047, 1319] : level === 1 ? [523, 659, 784, 1047] : [659, 784, 988];
    chord.forEach((f, i) => this.tone(t + i * 0.06, 'triangle', f, f, 0.6 + level * 0.3, 0.06, 'sfx', 0.01));
    if (level === 2) this.applause(1.2);
  }

  /** The coffin stops on a damaged weapon: a crack, then a sour chord sliding down (a deflated "ta-da"). */
  coffinBroken() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.12, 'highpass', 2200, 1, 0.16);
    this.tone(t, 'square', 180, 120, 0.08, 0.08, 'sfx', 0.002);
    // A tritone, bending flat.
    for (const [f, d] of [[523, 0], [740, 0.04], [622, 0.08]] as const) this.tone(t + 0.12 + d, 'triangle', f, f * 0.84, 0.9, 0.05, 'sfx', 0.01);
    this.tone(t + 0.5, 'sawtooth', 160, 90, 0.5, 0.05, 'sfx', 0.02);
  }

  /** A hammer knocking a nail in: two knocks on wood. */
  boardNail() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (const at of [0, 0.16]) {
      this.noiseBurst(t + at, 0.05, 'bandpass', 1800, 2.5, 0.2);
      this.tone(t + at, 'square', 420, 260, 0.05, 0.08, 'sfx', 0.001);
    }
    this.tone(t + 0.16, 'triangle', 1400, 1300, 0.08, 0.03, 'sfx', 0.001);
  }

  /** A barricade going up: a saw's strokes, then a run of hammer knocks. */
  barricadeBuild() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 3; i++) this.noiseBurst(t + i * 0.22, 0.18, 'bandpass', 2600 + (i % 2) * 500, 1.4, 0.08);
    for (let i = 0; i < 5; i++) {
      this.noiseBurst(t + 0.75 + i * 0.14, 0.05, 'bandpass', 1700, 2.5, 0.16);
      this.tone(t + 0.75 + i * 0.14, 'square', 400, 250, 0.05, 0.06, 'sfx', 0.001);
    }
  }

  /** A blow on the boards: a dull thump and a creak. */
  boardHit() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.12, 'lowpass', 700, 1, 0.22);
    this.tone(t, 'sine', 140, 70, 0.14, 0.18);
    this.tone(t + 0.05, 'sawtooth', 300, 380, 0.22, 0.03, 'sfx', 0.02);
  }

  /** A board snapping off (`last`: the whole barricade gone, a bigger crash). */
  boardBreak(last = false) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.08, 'highpass', 2500, 0.9, last ? 0.3 : 0.2);
    this.noiseBurst(t + 0.03, 0.25, 'bandpass', 900, 1.2, last ? 0.22 : 0.14);
    this.tone(t, 'square', 260, 90, 0.18, 0.08, 'sfx', 0.001);
    if (last) {
      this.noiseBurst(t + 0.2, 0.45, 'lowpass', 500, 0.8, 0.25);
      this.tone(t + 0.2, 'sine', 90, 40, 0.4, 0.2);
    }
  }

  /** A wave starting: the church bell tolls (three times, lower on a boss wave). */
  waveStart(boss = false) {
    if (!this.ready) return;
    for (let i = 0; i < 3; i++) setTimeout(() => this.churchBell(boss ? 0.62 : 0.8), i * 900);
  }

  /** A wave cleared: a hopeful organ chord. */
  waveEnd() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (const f of [262, 330, 392, 523]) this.tone(t, 'square', f, f, 1.4, 0.035, 'sfx', 0.15);
  }

  /** Money in: a cash register's "ka-ching". */
  cashRegister() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.05, 'highpass', 3000, 0.8, 0.08);
    this.tone(t + 0.05, 'triangle', 2093, 2093, 0.25, 0.05, 'ui');
    this.tone(t + 0.05, 'triangle', 2637, 2637, 0.3, 0.04, 'ui');
  }

  /** Down and bleeding out: a slow heartbeat. */
  heartbeat() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'sine', 60, 40, 0.12, 0.3);
    this.tone(t + 0.22, 'sine', 55, 38, 0.14, 0.22);
  }

  /** Back on your feet. */
  reviveDone() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (const [f, at] of [[523, 0], [659, 0.08], [784, 0.16], [1047, 0.24]] as const) this.tone(t + at, 'triangle', f, f, 0.35, 0.06, 'sfx', 0.01);
  }
  ui() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 'triangle', 880, 1320, 0.06, 0.12, 'ui');
  }
}

/** @internal The nodes a spatial sound goes through. */
export interface SpatialChain {
  input: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  room: GainNode;
  open: GainNode;
}

/** A looping sound fixed at a point: walls and echo follow the listener a few times a second. */
export class SpatialLoop {
  onStop: () => void = () => {};
  private stopped = false;

  constructor(
    private sfx: Sfx,
    private pos: Vec,
    private kind: SpatialKindName,
    private chain: SpatialChain,
  ) {}

  get panner(): PannerNode {
    return this.chain.panner;
  }

  refresh() {
    const e = this.sfx.earPos;
    this.sfx.tune(this.chain, this.pos, this.kind, Math.hypot(this.pos.x - e.x, this.pos.y - e.y, this.pos.z - e.z), false);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.onStop();
  }
}
