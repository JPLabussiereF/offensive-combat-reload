// The editor's keys as in Unity (PF-6 Revisions 01, etapa 3), without a screen: Q W E R T, F, F2, Delete, Esc,
// Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Ctrl+D, Ctrl+C, Ctrl+V, Ctrl+A and Ctrl+G; nothing while a text field has the
// keyboard, and the letters belong to the camera while it flies.
import { describe, expect, it } from 'bun:test';
import { isTextField, shortcutOf, type KeyInput } from '../editor/shortcuts';

const key = (code: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  code,
  key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});
const free = { typing: false, flying: false };

describe('atalhos do editor', () => {
  it('as ferramentas do Unity: Q mão, W mover, E girar, R escalar, T retângulo', () => {
    expect(shortcutOf(key('KeyQ'), free)).toBe('hand');
    expect(shortcutOf(key('KeyW'), free)).toBe('translate');
    expect(shortcutOf(key('KeyE'), free)).toBe('rotate');
    expect(shortcutOf(key('KeyR'), free)).toBe('scale');
    expect(shortcutOf(key('KeyT'), free)).toBe('rect');
    // The old 1/2/3 are gone.
    expect(shortcutOf(key('Digit1'), free)).toBeNull();
  });

  it('F centraliza, F2 renomeia, Delete e Backspace apagam, Esc limpa a seleção', () => {
    expect(shortcutOf(key('KeyF'), free)).toBe('focus');
    expect(shortcutOf(key('F2'), free)).toBe('rename');
    expect(shortcutOf(key('Delete'), free)).toBe('remove');
    expect(shortcutOf(key('Backspace'), free)).toBe('remove');
    expect(shortcutOf(key('Escape'), free)).toBe('clear');
  });

  it('com Ctrl (ou Cmd): desfazer, refazer, duplicar, copiar, colar, selecionar tudo e agrupar', () => {
    const ctrl = { ctrlKey: true };
    expect(shortcutOf(key('KeyZ', ctrl), free)).toBe('undo');
    expect(shortcutOf(key('KeyY', ctrl), free)).toBe('redo');
    expect(shortcutOf(key('KeyZ', { ctrlKey: true, shiftKey: true, key: 'Z' }), free)).toBe('redo');
    expect(shortcutOf(key('KeyD', ctrl), free)).toBe('duplicate');
    expect(shortcutOf(key('KeyC', ctrl), free)).toBe('copy');
    expect(shortcutOf(key('KeyV', ctrl), free)).toBe('paste');
    expect(shortcutOf(key('KeyA', ctrl), free)).toBe('selectAll');
    expect(shortcutOf(key('KeyG', ctrl), free)).toBe('group');
    expect(shortcutOf(key('KeyC', { metaKey: true }), free)).toBe('copy');
    // Ctrl+W, Ctrl+Shift+C and Ctrl+Alt+V aren't the editor's (the browser keeps them).
    expect(shortcutOf(key('KeyW', ctrl), free)).toBeNull();
    expect(shortcutOf(key('KeyC', { ctrlKey: true, shiftKey: true }), free)).toBeNull();
    expect(shortcutOf(key('KeyV', { ctrlKey: true, altKey: true }), free)).toBeNull();
  });

  it('nada dispara enquanto um campo de texto tem o foco (nem Ctrl+Z, que é do campo)', () => {
    const typing = { typing: true, flying: false };
    for (const k of [key('KeyW'), key('KeyQ'), key('Delete'), key('Backspace'), key('KeyF'), key('Escape'), key('KeyZ', { ctrlKey: true }), key('KeyV', { ctrlKey: true }), key('KeyA', { ctrlKey: true })]) expect(shortcutOf(k, typing)).toBeNull();
  });

  it('com o botão direito segurado as letras são da câmera (WASD e Q/E voam)', () => {
    const flying = { typing: false, flying: true };
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyT', 'KeyF', 'Delete']) expect(shortcutOf(key(c), flying)).toBeNull();
    expect(shortcutOf(key('KeyZ', { ctrlKey: true }), flying)).toBe('undo');
  });

  it('Shift ou Alt com uma letra não troca de ferramenta (Shift acelera a câmera, Alt orbita)', () => {
    expect(shortcutOf(key('KeyW', { shiftKey: true }), free)).toBeNull();
    expect(shortcutOf(key('KeyE', { altKey: true }), free)).toBeNull();
  });

  it('o que conta como campo de texto', () => {
    expect(isTextField({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextField({ tagName: 'input', type: 'number' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT' })).toBe(true);
    expect(isTextField({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextField({ tagName: 'SELECT' })).toBe(true);
    expect(isTextField({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    for (const type of ['checkbox', 'radio', 'color', 'range', 'button']) expect(isTextField({ tagName: 'INPUT', type })).toBe(false);
    expect(isTextField({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextField({ tagName: 'CANVAS' })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});
