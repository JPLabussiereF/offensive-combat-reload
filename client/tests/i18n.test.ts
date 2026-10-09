// The game's languages (PF-30): pt-BR, en, es and de. The browser's language picks one when the device has no choice
// saved (anything else is English); every language has every text, with the same {params} as pt-BR; Spanish and
// German say something of their own (not the English left behind), the back buttons start with a word ◯/B knows,
// and the data (album, clothes, map pieces, the character editor's labels) has the four texts.
import { afterAll, describe, expect, it } from 'bun:test';
import { albumProblems, PAGES, STICKERS } from '@shared/achievements';
import { CATALOG } from '@shared/catalog';
import { isLang, LANG_LOCALE, LANG_NAMES, LANGS, TEXT_FIELD, type Lang, type Text } from '@shared/langs';
import { MAP_CATALOG } from '@shared/mapCatalog';
import { et, nameOf, type EditorKey } from '../editor/strings';
import { de as editorDe } from '../editor/strings.de';
import { es as editorEs } from '../editor/strings.es';
import { CUSTOMIZE_LABELS, l } from '../ui/customizeLabels';
import { BACK_WORDS, DEATH_MESSAGES, detectLang, getLang, locale, QUICK_CHAT, resolveLang, setLang, t, textOf, TIPS, type StringKey } from '../ui/strings';
import { de as gameDe } from '../ui/strings.de';
import { es as gameEs } from '../ui/strings.es';

const initial = getLang();
afterAll(() => setLang(initial));

const KEYS = Object.keys(gameEs) as StringKey[];
const EDITOR_KEYS = Object.keys(editorEs) as EditorKey[];
/** Params that come back as ‹name›, so a text's {params} can be read through t(). */
const PARAMS = new Proxy({}, { get: (_, k) => `‹${String(k)}›` }) as Record<string, string>;
const paramsOf = (s: string) => [...s.matchAll(/‹(\w+)›/g)].map((m) => m[1]).sort();
const inLang = <T>(lang: Lang, f: () => T): T => {
  setLang(lang);
  return f();
};

/** Texts that are the same in English and in that language (a name, a loanword, a number). */
const SAME_AS_EN: Record<'es' | 'de', StringKey[]> = {
  es: [
    'title', 'arsenal', 'prog_rifle', 'fx_zoom', 'botCount', 'skillNormal', 'touchChat', 'tabArsenal', 'zColXp', 'pillarArsenalKicker', 'mgRole_admin',
    'mgRoles', 'pmSubVideo', 'pmSubAudio', 'gpSt_arsenal', 'gpSign_arsenal', 'gpTagOn', 'gpTagOff', 'gpCtaLine',
    // Keys of the branches merged after PF-30 (sprint): PF-35's detail and PF-32's Play tab.
    'detailNormal', 'modeBotsShort', 'playBotsN', 'playCtaOnline', 'playCtaBots',
    // PF-29: the pet's collar is a collar in Spanish too.
    'petCollar',
  ],
  de: [
    'title', 'arsenal', 'level', 'knifePassive', 'fx_zoom', 'cvUpgRow_resto', 'cvUpgrades', 'cvOptional', 'touchPause', 'botCount', 'skillNormal',
    'sessions', 'touchChat', 'tabArsenal', 'tabAlbum', 'modeOnline', 'gameMode_zumbi', 'ztype_comum', 'zAssist', 'zColXp', 'pillarArsenalKicker',
    'zstatMatches', 'finishDourada', 'onlineSubtitle', 'mapsCommunity', 'mapsByName', 'mgRole_admin', 'mgRole_moderador', 'mgName', 'pmSubPad',
    'gpQuickLine', 'gpSt_arsenal', 'gpSt_album', 'gpSign_arsenal', 'gpAlbumCover2', 'gpCtaLine',
    // Keys of the branches merged after PF-30 (sprint): PF-35's detail and PF-32's Play tab.
    'detailNormal', 'modeOnlineShort', 'modeBotsShort', 'playSessionsBtn', 'playCtaOnline', 'playCtaBots',
  ],
};
const EDITOR_SAME_AS_EN: Record<'es' | 'de', EditorKey[]> = {
  es: ['local', 'global', 'viewPersp', 'pose', 'emoji', 'panelInspector', 'transform'],
  de: ['hand', 'global', 'viewPersp', 'viewOrtho', 'position', 'budget', 'name', 'emoji', 'layout', 'transform'],
};

describe('idioma do navegador e idioma salvo', () => {
  it('detectLang pega o primeiro idioma do navegador que o jogo tem; nenhum vira inglês', () => {
    const table: [string[] | undefined, Lang][] = [
      [['pt-BR'], 'pt-BR'],
      [['pt-PT', 'en'], 'pt-BR'],
      [['pt'], 'pt-BR'],
      [['es-MX'], 'es'],
      [['es-ES', 'pt-BR'], 'es'],
      [['es_419'], 'es'],
      [['de-AT'], 'de'],
      [['de-CH', 'fr'], 'de'],
      [['en-GB'], 'en'],
      [['EN-us'], 'en'],
      [['fr-FR', 'fr'], 'en'],
      [['fr-FR', 'de'], 'de'],
      [['ja', 'it', 'ru'], 'en'],
      [[], 'en'],
      [undefined, 'en'],
    ];
    for (const [languages, want] of table) expect({ languages, got: detectLang(languages) }).toEqual({ languages, got: want });
  });

  it('resolveLang usa o salvo quando é válido, senão o do sistema', () => {
    for (const saved of LANGS) expect(resolveLang(saved, 'en')).toBe(saved);
    for (const saved of ['fr', 'pt', 'PT-BR', 'es-MX', '', null, undefined, 3, { pt: 'x' }]) {
      expect({ saved, got: resolveLang(saved, 'de') }).toEqual({ saved, got: 'de' });
    }
  });

  it('a lista tem os quatro idiomas, cada um com o nome nele mesmo e um locale', () => {
    expect([...LANGS]).toEqual(['pt-BR', 'en', 'es', 'de']);
    expect(LANG_NAMES).toEqual({ 'pt-BR': 'Português (Brasil)', en: 'English', es: 'Español', de: 'Deutsch' });
    expect(LANG_LOCALE.es).toBe('es-419');
    expect(LANGS.every(isLang)).toBe(true);
    expect(isLang('fr')).toBe(false);
  });

  it('números no formato do idioma escolhido', () => {
    const fmt = (lang: Lang) => inLang(lang, () => (1234.5).toLocaleString(locale()));
    expect(fmt('pt-BR')).toBe('1.234,5');
    expect(fmt('de')).toBe('1.234,5');
    expect(fmt('en')).toBe('1,234.5');
    expect(fmt('es')).toBe('1,234.5');
  });
});

describe('textos do jogo nos quatro idiomas', () => {
  it('os quatro dicionários têm as mesmas chaves', () => {
    expect(Object.keys(gameDe).sort()).toEqual([...KEYS].sort());
    expect(KEYS.length).toBeGreaterThan(1000);
  });

  for (const lang of LANGS) {
    it(`todo texto existe em ${lang} com os mesmos {params} do pt-BR`, () => {
      const bad: string[] = [];
      for (const k of KEYS) {
        const pt = inLang('pt-BR', () => t(k, PARAMS));
        const text = inLang(lang, () => t(k, PARAMS));
        if (!text.trim() || text.includes('undefined')) bad.push(`${k}: vazio`);
        else if (paramsOf(text).join() !== paramsOf(pt).join()) bad.push(`${k}: {${paramsOf(text)}} em vez de {${paramsOf(pt)}}`);
      }
      expect(bad).toEqual([]);
    });
  }

  for (const lang of ['es', 'de'] as const) {
    it(`${lang} não deixou texto em inglês, salvo os que são iguais mesmo`, () => {
      const same = KEYS.filter((k) => inLang('en', () => t(k, PARAMS)) === inLang(lang, () => t(k, PARAMS)));
      expect(same.sort()).toEqual([...SAME_AS_EN[lang]].sort());
    });
  }

  it('dicas, frases rápidas e mensagens de morte em todos os idiomas', () => {
    const causes = Object.keys(DEATH_MESSAGES['pt-BR']).sort();
    for (const lang of LANGS) {
      expect({ lang, ok: TIPS[lang].length > 0 && TIPS[lang].every((s) => s.trim().length > 0) }).toEqual({ lang, ok: true });
      expect({ lang, n: QUICK_CHAT[lang].length, ok: QUICK_CHAT[lang].every((s) => s.trim().length > 0) }).toEqual({ lang, n: QUICK_CHAT['pt-BR'].length, ok: true });
      expect(Object.keys(DEATH_MESSAGES[lang]).sort()).toEqual(causes);
      for (const [cause, lines] of Object.entries(DEATH_MESSAGES[lang])) {
        expect({ lang, cause, ok: lines.length > 0 && lines.every((s) => s.trim().length > 0) }).toEqual({ lang, cause, ok: true });
      }
    }
    // Spanish and German have their own jokes, not the English ones.
    for (const lang of ['es', 'de'] as const) {
      expect(TIPS[lang].some((s) => TIPS.en.includes(s))).toBe(false);
      expect(DEATH_MESSAGES[lang].fall.some((s) => DEATH_MESSAGES.en.fall.includes(s))).toBe(false);
    }
  });

  it('a capa da revista do galpão tem a palavra dividida em duas linhas em todos os idiomas', () => {
    for (const lang of LANGS) {
      const [a, b] = inLang(lang, () => [t('gpAlbumCover2'), t('gpAlbumCover3')]);
      expect({ lang, ok: a.length > 0 && b.length > 0 && a.length <= 8 && b.length <= 8 }).toEqual({ lang, ok: true });
    }
  });

  it('as recusas de entrada em sessão e a linha do idioma estão nos quatro idiomas', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const k of ['language', 'pmDescLanguage', 'langLater', 'docTitle', 'wsErr_sessao_lotada', 'wsErr_mapa_indisponivel'] as StringKey[]) {
        expect({ lang, k, ok: t(k).length > 0 }).toEqual({ lang, k, ok: true });
      }
    }
    expect(inLang('de', () => t('wsErr_sessao_lotada'))).toBe('Session voll.');
    expect(inLang('es', () => t('wsErr_sessao_lotada'))).toBe('Sesión llena.');
  });
});

describe('voltar com o controle (◯/B) em espanhol e alemão', () => {
  // Buttons whose English starts with Back, Cancel or Close go back; cancelDeletion is an action of the profile.
  const NOT_BACK = new Set<string>(['cancelDeletion']);
  const BACK_EN = /^(back|cancel|close)\b/i;

  it('todo botão de voltar, cancelar ou fechar começa com uma palavra que o PadNav reconhece', () => {
    const bad: string[] = [];
    for (const k of KEYS) {
      if (NOT_BACK.has(k) || !BACK_EN.test(inLang('en', () => t(k)))) continue;
      for (const lang of LANGS) {
        const text = inLang(lang, () => t(k));
        if (!BACK_WORDS.test(text)) bad.push(`${lang} ${k}: ${text}`);
      }
    }
    for (const k of EDITOR_KEYS) {
      if (!BACK_EN.test(inLang('en', () => et(k)))) continue;
      for (const lang of LANGS) if (!BACK_WORDS.test(inLang(lang, () => et(k)))) bad.push(`editor ${lang} ${k}`);
    }
    expect(bad).toEqual([]);
  });

  it('reconhece os voltar comuns em cada idioma', () => {
    const backs = (lang: Lang) => inLang(lang, () => [t('back'), t('pmBack'), t('resume'), t('exitToHome'), t('mapsCancel'), t('mapsClose'), t('cvClose'), t('chatClose'), et('cancel'), l('cancel')]);
    for (const lang of LANGS) for (const text of backs(lang)) expect({ lang, text, back: BACK_WORDS.test(text) }).toEqual({ lang, text, back: true });
    expect(inLang('es', () => t('back'))).toBe('Volver');
    expect(inLang('de', () => t('back'))).toBe('Zurück');
  });

  it('espanhol e alemão não criam botões de voltar que o português não tem', () => {
    const bad: string[] = [];
    for (const k of KEYS) {
      const pt = inLang('pt-BR', () => t(k));
      for (const lang of ['es', 'de'] as const) {
        const text = inLang(lang, () => t(k));
        if (BACK_WORDS.test(text) && !BACK_WORDS.test(pt)) bad.push(`${lang} ${k}: ${text}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('palavras que só começam igual não contam (Zurücksetzen, Cerrarse)', () => {
    for (const text of ['Zurücksetzen', 'Cerrarse', 'Backstab', 'Closet', 'Sairam']) expect({ text, back: BACK_WORDS.test(text) }).toEqual({ text, back: false });
  });
});

describe('editor de mapas nos quatro idiomas', () => {
  it('os quatro dicionários têm as mesmas chaves e os mesmos {params}', () => {
    expect(Object.keys(editorDe).sort()).toEqual([...EDITOR_KEYS].sort());
    const bad: string[] = [];
    for (const k of EDITOR_KEYS) {
      const pt = paramsOf(inLang('pt-BR', () => et(k, PARAMS))).join();
      for (const lang of LANGS) {
        const text = inLang(lang, () => et(k, PARAMS));
        if (!text.trim()) bad.push(`${lang} ${k}: vazio`);
        else if (paramsOf(text).join() !== pt) bad.push(`${lang} ${k}: {${paramsOf(text)}} em vez de {${pt}}`);
      }
    }
    expect(bad).toEqual([]);
  });

  for (const lang of ['es', 'de'] as const) {
    it(`o editor em ${lang} não deixou texto em inglês, salvo os que são iguais mesmo`, () => {
      const same = EDITOR_KEYS.filter((k) => inLang('en', () => et(k, PARAMS)) === inLang(lang, () => et(k, PARAMS)));
      expect(same.sort()).toEqual([...EDITOR_SAME_AS_EN[lang]].sort());
    });
  }

  it('o nome da peça vem no idioma escolhido (não mais nome.pt fixo)', () => {
    const k = MAP_CATALOG.caixa;
    expect(LANGS.map((lang) => inLang(lang, () => nameOf(k.nome)))).toEqual([k.nome.pt, k.nome.en, k.nome.es, k.nome.de]);
  });
});

describe('dados com os quatro textos', () => {
  const filled = (x: Text | undefined) => !!x && Object.values(TEXT_FIELD).every((f) => typeof x[f] === 'string' && x[f].trim().length > 0);

  it('álbum: páginas, figurinhas, itens e dicas', () => {
    expect(albumProblems()).toEqual([]);
    const bad: string[] = [];
    for (const p of PAGES) if (!filled(p.nome) || !filled(p.titulo)) bad.push(p.id);
    for (const s of STICKERS) {
      if (!filled(s.nome) || !filled(s.como)) bad.push(s.id);
      if (s.dica && !filled(s.dica)) bad.push(`${s.id} dica`);
      for (const i of s.itens ?? []) if (!filled(i.nome)) bad.push(`${s.id}:${i.id}`);
    }
    expect(bad).toEqual([]);
  });

  it('álbum: o "como" de cada idioma mostra a meta; espanhol e alemão escolhem a palavra pelo número como o pt-BR', () => {
    const pickers = (s: string) => (s.match(/\{[^{}|]*\|[^{}|]*\}/g) ?? []).length;
    // English may drop a picker ("golden koi" is both); Spanish and German keep pt-BR's.
    const bad = STICKERS.filter(
      (s) => Object.values(TEXT_FIELD).some((f) => s.como[f].includes('{meta}') !== s.como.pt.includes('{meta}')) || pickers(s.como.es) !== pickers(s.como.pt) || pickers(s.como.de) !== pickers(s.como.pt),
    );
    expect(bad.map((s) => s.id)).toEqual([]);
  });

  it('catálogo de roupas e peças do mapa', () => {
    expect(CATALOG.filter((i) => !filled(i.name)).map((i) => i.id)).toEqual([]);
    expect(Object.values(MAP_CATALOG).filter((k) => !filled(k.nome)).map((k) => k.id)).toEqual([]);
    // The clothes' table keeps its columns: nothing slipped into the slots.
    expect(CATALOG.find((i) => i.id === 'basica')).toMatchObject({ slots: ['tronco'], channels: ['P', 'S'], sleeve: 'curta' });
  });

  it('o texto dos dados vem no idioma escolhido', () => {
    const page = PAGES[0];
    expect(LANGS.map((lang) => inLang(lang, () => textOf(page.nome)))).toEqual([page.nome.pt, page.nome.en, page.nome.es, page.nome.de]);
  });

  it('rótulos do editor de personagem: quatro textos, um por idioma', () => {
    const bad = Object.entries(CUSTOMIZE_LABELS).filter(([, v]) => v.length !== 4 || v.some((s) => !s.trim())).map(([k]) => k);
    expect(bad).toEqual([]);
    expect(LANGS.map((lang) => inLang(lang, () => l('save')))).toEqual(CUSTOMIZE_LABELS.save);
    expect(inLang('de', () => l('chave-que-nao-existe'))).toBe('chave-que-nao-existe');
  });
});
