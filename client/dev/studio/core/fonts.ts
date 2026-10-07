// Sticker studio: the font gate. Canvas text (signs, bubbles, the clock dial, the corpse timer, epitaphs, the
// coffin's plate) is painted once, when its prop is built, with whatever font is there at that moment: without
// Lilita One and Nunito (Google Fonts, loaded by the studio page) it silently bakes in a fallback font. So the
// studio waits for them, and checks the Windows CJK face the garden's plaques use, before building anything.

/** Text with the glyphs the stickers paint (accents included: the Latin subset must be the one loaded). */
const SAMPLE = 'ÁÃÇÉÊÍÓÕÚáãçéêíóõú AaBbHh 0123456789 ?!.';

const WEB_FONTS = ['400 40px "Lilita One"', '600 20px Nunito', '800 20px Nunito', '900 20px Nunito'];

/** The CJK face of the garden's plaques (編鐘), a Windows system font. */
export const CJK_FONT = 'Microsoft YaHei';

/** Whether a system font is installed: text set in it measures differently from every generic fallback. */
function hasSystemFont(name: string): boolean {
  const g = document.createElement('canvas').getContext('2d')!;
  const text = 'mmmmmmmmmmlli WwQq 編鐘燈籠';
  return ['monospace', 'serif', 'sans-serif'].some((fallback) => {
    g.font = `72px ${fallback}`;
    const base = g.measureText(text).width;
    g.font = `72px "${name}", ${fallback}`;
    return g.measureText(text).width !== base;
  });
}

/** Loads the stickers' fonts; returns what failed (empty: all there). */
export async function fontGate(): Promise<string[]> {
  const problems: string[] = [];
  for (const font of WEB_FONTS) {
    try {
      const faces = await document.fonts.load(font, SAMPLE);
      if (!faces.length || !document.fonts.check(font, SAMPLE)) problems.push(`a fonte ${font} não carregou (rede para fonts.googleapis.com?)`);
    } catch (err) {
      problems.push(`a fonte ${font} não carregou: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await document.fonts.ready;
  if (!hasSystemFont(CJK_FONT)) problems.push(`a fonte do sistema "${CJK_FONT}" não existe (as placas em chinês do Jardim precisam dela: faça o bake no Windows)`);
  return problems;
}
