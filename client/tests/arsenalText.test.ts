// Every weapon and upgrade of shared/data/progression.json has its name and description in both languages
// (client/ui/strings.ts): the Arsenal, the HUD and the kill feed show them by id.
import { describe, expect, it } from 'bun:test';
import { PROG_WEAPONS, PROGRESSION } from '@shared/progression';
import { setLang, t, type Lang, type StringKey } from '../ui/strings';

describe('textos do Arsenal', () => {
  for (const lang of ['pt-BR', 'en'] as Lang[]) {
    it(`toda arma e melhoria tem nome e descrição em ${lang}`, () => {
      setLang(lang);
      const missing: string[] = [];
      const check = (key: string) => {
        const text = t(key as StringKey);
        if (!text || text === 'undefined') missing.push(key);
      };
      for (const w of PROG_WEAPONS) {
        check(`arma_${w}`);
        check(`armaDesc_${w}`);
        for (const u of PROGRESSION[w].melhorias) {
          check(`upg_${w}_${u.id}`);
          check(`upgDesc_${w}_${u.id}`);
          for (const [k, v] of Object.entries(u.efeitos)) {
            if (k === 'mira' || k === 'visual') continue;
            check(k === 'forma' || k === 'tipo' ? `fx_${k}_${v}` : `fx_${k}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });
  }
});
