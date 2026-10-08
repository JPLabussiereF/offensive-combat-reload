// The game's languages (PF-30): one list for the client (strings, the language picker) and the server (the
// password e-mail). The choice is per device (client/core/settings.ts Settings.idioma); without one, the browser's
// language picks (client/ui/strings.ts detectLang), and any other language falls back to English.

export const LANGS = ['pt-BR', 'en', 'es', 'de'] as const;
export type Lang = (typeof LANGS)[number];

/** Each language's name in itself (the picker shows these, so a player finds theirs whatever is on screen). */
export const LANG_NAMES: Record<Lang, string> = {
  'pt-BR': 'Português (Brasil)',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
};

/** The locale for numbers, dates and <html lang>: Spanish is the neutral Latin American one (es-419). */
export const LANG_LOCALE: Record<Lang, string> = { 'pt-BR': 'pt-BR', en: 'en', es: 'es-419', de: 'de' };

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/** A text in every language, as the data files keep it (pt is pt-BR). */
export interface Text {
  pt: string;
  en: string;
  es: string;
  de: string;
}

/** The field of a Text for each language. */
export const TEXT_FIELD: Record<Lang, keyof Text> = { 'pt-BR': 'pt', en: 'en', es: 'es', de: 'de' };

/** A Text in a language. */
export const textIn = (x: Text, lang: Lang): string => x[TEXT_FIELD[lang]];
