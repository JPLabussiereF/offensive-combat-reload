// Checking a GLB model someone sends for their map (POST /api/mapas/arquivos) before it is stored: a glTF 2.0
// binary that @gltf-transform/core can read, everything inside the file (no URI to anywhere else), only
// extensions the game's loader takes (client/world/gltfMap.ts: no Draco), textures no larger than 2048 px, a
// bounded number of nodes, and its triangle count (the map's draw budget is checked when the map is saved).
import { Logger, WebIO, type Document } from '@gltf-transform/core';

/** Limits of an uploaded model. */
export const GLB_LIMITS = {
  /** File size (the map rules: models up to 10 MB). */
  bytes: 10 * 1024 * 1024,
  /** Largest texture side (px). */
  textura: 2048,
  /** Nodes in the scene graph (provisional value: the plan names the limit, not its number). */
  nos: 2000,
} as const;

/**
 * Extensions the game's GLTFLoader handles and @gltf-transform/core can read for these checks. Left out:
 * KHR_draco_mesh_compression (the game has no Draco decoder), EXT_meshopt_compression (core can't read the
 * compressed buffers without its decoder) and EXT_texture_avif (its size can't be checked here).
 */
export const GLB_EXTENSIONS: ReadonlySet<string> = new Set([
  'KHR_materials_unlit',
  'KHR_materials_emissive_strength',
  'KHR_materials_clearcoat',
  'KHR_materials_transmission',
  'KHR_materials_ior',
  'KHR_materials_specular',
  'KHR_materials_volume',
  'KHR_materials_sheen',
  'KHR_materials_iridescence',
  'KHR_materials_anisotropy',
  'KHR_materials_dispersion',
  'KHR_texture_transform',
  'KHR_mesh_quantization',
  'KHR_lights_punctual',
  'KHR_texture_basisu',
  'EXT_texture_webp',
  'EXT_mesh_gpu_instancing',
]);

export class GlbError extends Error {}

export interface GlbInfo {
  sha256: string;
  bytes: number;
  triangulos: number;
  primitivas: number;
}

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a;

/** Width and height of an image the loader can show, or null when its format can't be measured. */
function imageSize(image: Uint8Array, mime: string): [number, number] | null {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  if (mime === 'image/png' && image.length >= 24) return [view.getUint32(16), view.getUint32(20)];
  if (mime === 'image/jpeg') {
    // The first start-of-frame marker holds the size.
    for (let i = 2; i + 9 < image.length; ) {
      if (image[i] !== 0xff) return null;
      const marker = image[i + 1];
      const length = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [view.getUint16(i + 7), view.getUint16(i + 5)];
      i += 2 + length;
    }
    return null;
  }
  if (mime === 'image/ktx2' && image.length >= 28) return [view.getUint32(20, true), view.getUint32(24, true)];
  if (mime === 'image/webp' && image.length >= 30) {
    const kind = String.fromCharCode(...image.subarray(12, 16));
    if (kind === 'VP8 ') return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    if (kind === 'VP8L') {
      const b = view.getUint32(21, true);
      return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
    }
    if (kind === 'VP8X') return [1 + (image[24] | (image[25] << 8) | (image[26] << 16)), 1 + (image[27] | (image[28] << 8) | (image[29] << 16))];
  }
  return null;
}

/** Triangles a primitive draws (points and lines: none). */
function primitiveTriangles(mode: number, count: number) {
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0;
}

/** What the scene draws: triangles of every mesh as often as nodes use it, and its primitives. */
function count(doc: Document) {
  const meshTris = new Map<object, number>();
  let primitivas = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    let tris = 0;
    for (const prim of mesh.listPrimitives()) {
      primitivas++;
      const n = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
      tris += primitiveTriangles(prim.getMode(), n);
    }
    meshTris.set(mesh, tris);
  }
  let triangulos = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh) triangulos += meshTris.get(mesh) ?? 0;
  }
  return { triangulos, primitivas };
}

/** Checks an uploaded model; throws GlbError with the reason (in Portuguese, shown to the player). */
export async function checkGlb(raw: Uint8Array): Promise<GlbInfo> {
  if (raw.length > GLB_LIMITS.bytes) throw new GlbError('arquivo maior que 10 MB');
  // A copy aligned for the typed-array views.
  const glb = new Uint8Array(raw);
  const view = new DataView(glb.buffer);
  if (glb.length < 20 || view.getUint32(0, true) !== MAGIC) throw new GlbError('não é um arquivo .glb');
  if (view.getUint32(4, true) !== 2) throw new GlbError('só glTF 2.0');
  if (view.getUint32(8, true) !== glb.length) throw new GlbError('tamanho no cabeçalho não confere');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLength > glb.length) throw new GlbError('sem o bloco JSON');

  let json: Record<string, any>;
  try {
    json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  } catch {
    throw new GlbError('JSON do glTF ilegível');
  }
  if (!json || typeof json !== 'object') throw new GlbError('JSON do glTF ilegível');
  for (const ext of [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])]) {
    if (!GLB_EXTENSIONS.has(ext)) throw new GlbError(`extensão não aceita: ${String(ext).slice(0, 60)}`);
  }
  // Everything inside the file: a URI may only carry its data inline.
  for (const list of [json.buffers, json.images]) {
    for (const item of Array.isArray(list) ? list : []) {
      if (item?.uri !== undefined && !(typeof item.uri === 'string' && item.uri.startsWith('data:'))) throw new GlbError('o modelo aponta para um arquivo fora dele');
    }
  }
  if ((json.nodes?.length ?? 0) > GLB_LIMITS.nos) throw new GlbError(`mais de ${GLB_LIMITS.nos} nós`);

  let doc: Document;
  try {
    const io = new WebIO().setLogger(new Logger(Logger.Verbosity.SILENT));
    const jsonDoc = await io.binaryToJSON(glb);
    // Every extension here is on the list above; core reads the rest of the file without them.
    delete jsonDoc.json.extensionsRequired;
    doc = await io.readJSON(jsonDoc);
  } catch (err) {
    throw new GlbError(`glTF inválido: ${String((err as Error).message).slice(0, 120)}`);
  }

  for (const tex of doc.getRoot().listTextures()) {
    const image = tex.getImage();
    if (!image) continue;
    const size = imageSize(image, tex.getMimeType());
    if (!size) throw new GlbError(`textura em formato não aceito (${tex.getMimeType() || 'desconhecido'})`);
    if (size[0] > GLB_LIMITS.textura || size[1] > GLB_LIMITS.textura) throw new GlbError(`textura maior que ${GLB_LIMITS.textura} px (${size[0]} × ${size[1]})`);
  }

  return { sha256: new Bun.CryptoHasher('sha256').update(glb).digest('hex'), bytes: glb.length, ...count(doc) };
}
