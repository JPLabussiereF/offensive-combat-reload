// Bringing a model made in Blender into the map: the player picks a .glb on their computer, it's sent to the
// server (POST /api/mapas/arquivos, checked there and kept by its SHA-256) and the map names it in its files;
// a 'glb' piece then shows it, built by the same adapter the game uses (addGltfToMap: batched, with its COL_
// colliders and ROOM_ boxes), so what the editor shows is the preview.
import type { MapData } from '@shared/mapData';
import { ApiError, apiBinary } from '../net/api';
import { et } from './strings';

/** The server's limit (server/glb.ts GLB_LIMITS.bytes): checked here first to spare the upload. */
export const GLB_MAX_BYTES = 10 * 1024 * 1024;

export interface Uploaded {
  sha256: string;
  url: string;
  bytes: number;
  triangulos: number;
  primitivas: number;
}

/** Asks for a .glb file (null: none picked). */
export function pickGlb(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,model/gltf-binary';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // No change event when the dialog is closed without a file: a focus back on the page settles it.
    window.addEventListener('focus', () => setTimeout(() => resolve(input.files?.[0] ?? null), 500), { once: true });
    input.click();
  });
}

/** Sends the file; the error's message says what went wrong, in the player's language. */
export async function uploadGlb(file: File): Promise<Uploaded> {
  if (file.size > GLB_MAX_BYTES) throw new Error(et('glbTooBig'));
  try {
    return await apiBinary<Uploaded>('POST', `/api/mapas/arquivos?nome=${encodeURIComponent(file.name.slice(0, 120))}`, file, 'model/gltf-binary');
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    if (err.code === 'arquivo_grande_demais') throw new Error(et('glbTooBig'));
    if (err.code === 'glb_invalido') throw new Error(et('glbInvalid', { m: String(err.extra.motivo ?? '') }));
    if (err.code === 'cota_excedida') throw new Error(et('glbQuota'));
    if (err.code === 'muitas_tentativas') throw new Error(et('glbRate'));
    if (err.code === 'nao_autorizado') throw new Error(et('errSignedOut'));
    if (err.code === 'offline') throw new Error(et('errOffline'));
    throw new Error(et('glbFailed', { e: err.code }));
  }
}

/** The file's id in the map: its name (letters, digits, - and _), made unique; the same upload reuses its entry. */
export function fileEntry(data: MapData, name: string, up: Uploaded): { id: string; isNew: boolean } {
  const same = data.arquivos.find((f) => f.url === up.url);
  if (same) return { id: same.id, isNew: false };
  const base = name.replace(/\.glb$/i, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'modelo';
  const used = new Set(data.arquivos.map((f) => f.id));
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return { id, isNew: true };
}
