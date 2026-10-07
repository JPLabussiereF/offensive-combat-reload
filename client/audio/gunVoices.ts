// How each gun's shot sounds (client/audio/sfx.ts gunshot builds it with Web Audio): the parameters of the three
// common layers and the extra layer of the newer secondaries. Pure data, no Web Audio, so the tests can check
// that every secondary has a voice of its own (client/tests/weapon.test.ts).
import type { GunId } from '@shared/progression';

/** A gun's bang: pitch (×), body length (s) and low end of the three common layers, plus a layer of its own. */
export interface ShotVoice {
  pitch: number;
  body: number;
  low: number;
  /**
   * The newer secondaries' own touch: the stapler's metallic clack, the revolver's long crack, the drill's motor
   * buzz, the garrucha's deep POW, the hand cannon's boom (the deepest of all).
   */
  extra?: 'grampo' | 'estalo' | 'motor' | 'pow' | 'canhao';
}

/** Each gun's voice; the old rifles sound like the rifle. every secondary has its own. */
export const SHOT_VOICES: Partial<Record<GunId, ShotVoice>> = {
  rifle: { pitch: 1, body: 0.14, low: 0.8 },
  pistola: { pitch: 1.35, body: 0.09, low: 0.55 },
  smg: { pitch: 1.2, body: 0.08, low: 0.5 },
  grampeador: { pitch: 1.7, body: 0.05, low: 0.25, extra: 'grampo' },
  revolver: { pitch: 0.95, body: 0.2, low: 0.9, extra: 'estalo' },
  furadeira: { pitch: 1.45, body: 0.05, low: 0.3, extra: 'motor' },
  garrucha: { pitch: 0.75, body: 0.22, low: 1.1, extra: 'pow' },
  pistolao: { pitch: 0.62, body: 0.26, low: 1.3, extra: 'canhao' },
};
export const shotVoiceOf = (gun: GunId): ShotVoice => SHOT_VOICES[gun] ?? SHOT_VOICES.rifle!;
