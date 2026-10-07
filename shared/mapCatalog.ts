// Every kind of map piece (shared/mapData.ts Peca.tipo): what it is, its parameters (type, range and
// default), how the editor moves it and how many a map may have. The client builds each kind with its
// adapter (client/world/catalog, one per id here); the server and the editor validate pieces against this.
//
// How a piece is placed (`transformacao`):
// - 'livre': Peca.p (and yaw and escala where the kind turns or scales) puts it anywhere;
// - 'linear': it runs along an axis between two ends given in its params (walls, fences, stairs);
// - 'fixa': its params hold its whole layout in world coordinates (roofs over a rectangle, a garden sector).
//
// Coordinates are meters, angles radians, colors 0xRRGGBB numbers (or CSS strings where a canvas paints them).

/** Library surfaces (client/world/surfaces.ts SURFACES). */
export const SUPERFICIES = [
  'grama', 'asfalto', 'calcada', 'concreto', 'tijolo', 'reboco', 'madeira', 'piso', 'telhado', 'azulejo', 'metal', 'vidro',
  'papel', 'pedra', 'lataria', 'folhagem', 'casca', 'feno', 'tecido', 'pintura',
] as const;
export type Superficie = (typeof SUPERFICIES)[number];

/** Physics and sound materials (client/world/physics.ts SurfaceMaterial). */
export const FISICAS = ['grass', 'concrete', 'wood', 'metal', 'glass', 'tile', 'paper'] as const;
/** What a collider is for the sound's occlusion. */
export const OCLUSORES = ['solid', 'vehicle', 'trunk'] as const;

export type Param =
  | { tipo: 'numero'; min?: number; max?: number; padrao?: number; opcional?: boolean }
  | { tipo: 'inteiro'; min?: number; max?: number; padrao?: number; opcional?: boolean }
  | { tipo: 'booleano'; padrao?: boolean; opcional?: boolean }
  | { tipo: 'texto'; max?: number; padrao?: string; opcional?: boolean }
  | { tipo: 'cor'; padrao?: number; opcional?: boolean }
  | { tipo: 'superficie'; padrao?: Superficie; opcional?: boolean }
  | { tipo: 'opcao'; opcoes: readonly (string | number)[]; padrao?: string | number; opcional?: boolean }
  | { tipo: 'vec2' | 'vec3' | 'vec4'; min?: number; max?: number; padrao?: number[]; opcional?: boolean }
  | { tipo: 'lista'; item: Param; max?: number; opcional?: boolean }
  | { tipo: 'objeto'; campos: Record<string, Param>; opcional?: boolean }
  /** Free-form JSON (a whole layout, such as a pavilion's stories): checked by the adapter. */
  | { tipo: 'json'; opcional?: boolean };

export type Transformacao = 'livre' | 'linear' | 'fixa';

/** 'organizacao': the editor's own kinds (a group), made from the Hierarchy and never listed with the pieces. */
export type Categoria = 'primitivas' | 'estrutura' | 'construcoes' | 'natureza' | 'moveis' | 'veiculos' | 'objetos' | 'luzes' | 'ambiente' | 'importado' | 'organizacao';

export interface TipoPeca {
  id: string;
  categoria: Categoria;
  nome: { pt: string; en: string };
  transformacao: Transformacao;
  /** Whether Peca.p, Peca.yaw and Peca.escala mean something for this kind ('livre' pieces). */
  usa?: { p?: boolean; yaw?: boolean; escala?: boolean };
  params: Record<string, Param>;
  /** At most this many in a map. */
  limite?: number;
  /** PropBus id (or id prefix, "prefixo:N") of the gag it registers: Peca.prop names it. */
  prop?: string;
  /** Draws from the seeded randomness (Peca.semente). */
  semente?: boolean;
  /** Holds a collectible (Peca.coletavel: an id of MapData.objetos.coletaveis). */
  coletavel?: boolean;
}

// --- Parameter shorthands -----------------------------------------------------------------------------

const num = (padrao?: number, min = -1000, max = 1000): Param => ({ tipo: 'numero', padrao, min, max });
const pos = (padrao?: number, max = 1000): Param => ({ tipo: 'numero', padrao, min: 0, max });
const int = (padrao?: number, min = 0, max = 1000): Param => ({ tipo: 'inteiro', padrao, min, max });
const bool = (padrao?: boolean): Param => ({ tipo: 'booleano', padrao });
const text = (max = 120, padrao?: string): Param => ({ tipo: 'texto', max, padrao });
const cor = (padrao?: number): Param => ({ tipo: 'cor', padrao });
const surf = (padrao?: Superficie): Param => ({ tipo: 'superficie', padrao });
const opt = (opcoes: readonly (string | number)[], padrao?: string | number): Param => ({ tipo: 'opcao', opcoes, padrao });
const v2 = (padrao?: number[]): Param => ({ tipo: 'vec2', padrao, min: -1000, max: 1000 });
const v3 = (padrao?: number[]): Param => ({ tipo: 'vec3', padrao, min: -1000, max: 1000 });
const v4 = (padrao?: number[]): Param => ({ tipo: 'vec4', padrao, min: -1000, max: 1000 });
const list = (item: Param, max = 500): Param => ({ tipo: 'lista', item, max });
const obj = (campos: Record<string, Param>): Param => ({ tipo: 'objeto', campos });
const json = (): Param => ({ tipo: 'json' });
/** Optional: absent means the adapter's default. */
const o = (p: Param): Param => ({ ...p, opcional: true });

const eixo = opt(['x', 'z'], 'x');
const rect = obj({ x0: num(), z0: num(), x1: num(), z1: num() });
/** Options of a MapBuilder piece (PieceOpts). */
const pieceOpts = {
  cor: o(cor(0xffffff)),
  colide: o(bool(true)),
  sombra: o(bool(true)),
  fisica: o(opt(FISICAS)),
  oclusor: o(opt(OCLUSORES)),
};
/** A three.js geometry by name, its constructor arguments and the operations applied to it in order. */
const geometria = {
  geo: opt(['caixa', 'cilindro', 'cone', 'esfera', 'icosaedro', 'toro', 'plano', 'circulo']),
  args: list(num(), 12),
  ops: list(json(), 12),
};
const livre = (yaw = true, escala = false) => ({ transformacao: 'livre' as const, usa: { p: true, yaw, escala } });
const fixa = { transformacao: 'fixa' as const };
const linear = { transformacao: 'linear' as const };

type Def = Omit<TipoPeca, 'id'>;

const DEFS: Record<string, Def> = {
  // --- Primitives (MapBuilder) ------------------------------------------------------------------------
  caixa: { categoria: 'primitivas', nome: { pt: 'Caixa', en: 'Box' }, ...livre(), params: { tamanho: v3([1, 1, 1]), superficie: surf('concreto'), ...pieceOpts, rot: o(v3()), ordem: o(opt(['XYZ', 'YXZ', 'ZXY', 'XZY', 'YZX', 'ZYX'])) } },
  cilindro: { categoria: 'primitivas', nome: { pt: 'Cilindro', en: 'Cylinder' }, ...livre(false), params: { raio: pos(0.5), altura: pos(1), raioTopo: o(pos()), segmentos: o(int(12, 3, 64)), superficie: surf('concreto'), ...pieceOpts } },
  parede: {
    categoria: 'primitivas',
    nome: { pt: 'Parede', en: 'Wall' },
    ...linear,
    params: { eixo, fixo: num(0), de: num(0), ate: num(4), espessura: pos(0.3), altura: pos(3), superficie: surf('reboco'), vaos: list(v4(), 40), y0: num(0), ...pieceOpts, moldura: o(obj({ superficie: o(surf()), cor: o(cor()), largura: o(pos()) })) },
  },
  escada: { categoria: 'primitivas', nome: { pt: 'Escada', en: 'Stairs' }, ...linear, params: { eixo, sentido: opt([1, -1], 1), inicio: num(0), de: num(0), ate: num(1.2), base: num(0), subida: pos(3, 30), superficie: surf('madeira'), ...pieceOpts, suave: o(bool(false)) } },
  telhado: {
    categoria: 'primitivas',
    nome: { pt: 'Telhado de duas águas', en: 'Gable roof' },
    ...fixa,
    params: { x0: num(), z0: num(), x1: num(), z1: num(), beiral: num(3), subida: pos(2), superficie: surf('telhado'), ...pieceOpts, aba: o(pos(0.45)), cumeeira: o(eixo), oitao: o(surf()), corOitao: o(cor()) },
  },
  sala: { categoria: 'primitivas', nome: { pt: 'Sala (som)', en: 'Room (sound)' }, ...livre(false), params: { tamanho: v3([4, 3, 4]), fechamento: { tipo: 'numero', min: 0, max: 1, padrao: 1 } } },
  forma: { categoria: 'primitivas', nome: { pt: 'Forma', en: 'Shape' }, ...fixa, params: { ...geometria, superficie: surf('pintura'), cor: o(cor()), sombra: o(bool(true)) } },
  brilho: { categoria: 'luzes', nome: { pt: 'Brilho', en: 'Glow' }, ...fixa, params: { ...geometria, cor: cor(0xffc861) } },
  luz: { categoria: 'luzes', nome: { pt: 'Luz', en: 'Light' }, ...livre(false), params: { cor: o(cor(0xffb46a)), intensidade: o(pos(10)), alcance: o(pos(10)), piscar: o(pos()), lampada: o(bool(false)) } },
  colisor: { categoria: 'primitivas', nome: { pt: 'Colisor invisível', en: 'Invisible collider' }, ...livre(), params: { meia: v3([0.5, 0.5, 0.5]), fisica: opt(FISICAS, 'wood'), oclusor: o(opt(OCLUSORES)) } },
  lajeComFuros: { categoria: 'primitivas', nome: { pt: 'Laje com furos', en: 'Slab with holes' }, ...fixa, params: { x0: num(), z0: num(), x1: num(), z1: num(), y0: num(), y1: num(), furos: list(rect, 40), superficie: surf('concreto'), ...pieceOpts } },
  laje: { categoria: 'primitivas', nome: { pt: 'Chão com recortes', en: 'Ground with cut-outs' }, ...fixa, params: { area: rect, furos: list(rect, 40), y0: num(), y1: num(), superficie: surf('grama'), ...pieceOpts } },

  // --- Structures -------------------------------------------------------------------------------------
  corrimao: { categoria: 'estrutura', nome: { pt: 'Corrimão', en: 'Railing' }, ...linear, params: { eixo, fixo: num(), de: num(), ate: num(), y: num(0), altura: o(pos(1)), cor: o(cor()), colide: o(bool(true)) } },
  grade: { categoria: 'estrutura', nome: { pt: 'Grade de ferro', en: 'Iron fence' }, ...linear, params: { eixo, fixo: num(), de: num(), ate: num(), vaos: list(v2(), 20), altura: o(pos(1.9)) } },
  sebe: { categoria: 'estrutura', nome: { pt: 'Sebe', en: 'Hedge' }, ...linear, params: { eixo, fixo: num(), de: num(), ate: num(), vaos: list(v2(), 20), altura: o(pos(2.6)), espessura: o(pos(1.1)) } },
  arcoPortao: { categoria: 'estrutura', nome: { pt: 'Arco de portão', en: 'Gate arch' }, ...linear, params: { eixo, fixo: num(), de: num(), ate: num(), texto: text(40) } },
  coluna: { categoria: 'estrutura', nome: { pt: 'Coluna laqueada', en: 'Lacquered column' }, ...livre(false), params: { topo: num(3), raio: o(pos(0.17)) } },
  paredePapel: { categoria: 'estrutura', nome: { pt: 'Parede de papel', en: 'Paper wall' }, ...linear, params: { eixo, fixo: num(), de: num(), ate: num(), altura: pos(2.8), y0: num(0), portas: list(num(), 10), larguraPorta: o(pos(1.8)) } },
  tampaMuro: { categoria: 'estrutura', nome: { pt: 'Cobertura de muro', en: 'Wall cap' }, ...fixa, params: { x0: num(), z0: num(), x1: num(), z1: num(), topo: num() } },
  muroLua: { categoria: 'estrutura', nome: { pt: 'Muro com portão da lua', en: 'Moon gate wall' }, ...linear, params: { eixo, fixo: num(), de: num(), ate: num(), espessura: pos(0.6), altura: pos(4), centro: num(), raio: pos(1.8), vaos: list(v4(), 10) } },
  telhadoCurvo: {
    categoria: 'estrutura',
    nome: { pt: 'Telhado curvo', en: 'Curved roof' },
    ...fixa,
    params: { externo: rect, topo: rect, beiral: num(), cume: num(), curva: o(pos(0.6)), cor: o(cor()), corBaixo: o(cor()), colide: o(bool(true)), cumeeiras: o(bool(false)), espessura: o(pos(0.18)), lanternas: o(pos()) },
  },
  pavilhao: { categoria: 'construcoes', nome: { pt: 'Pavilhão', en: 'Pavilion' }, ...fixa, params: { spec: json(), lanternas: o(pos()) } },
  muroCemiterio: { categoria: 'estrutura', nome: { pt: 'Muro do cemitério', en: 'Cemetery wall' }, ...linear, params: { eixo, fixo: num(), de: num(), ate: num() } },
  pilarCemiterio: { categoria: 'estrutura', nome: { pt: 'Pilar de pedra', en: 'Stone pillar' }, ...livre(false), params: { largura: pos(0.5), altura: pos(2.6) } },
  muroJardim: {
    categoria: 'estrutura',
    nome: { pt: 'Muro do jardim', en: 'Garden wall' },
    ...linear,
    params: {
      eixo,
      fixo: num(),
      de: num(),
      ate: num(),
      portoes: list(obj({ at: num(), kind: o(opt(['portal', 'lua', 'porta'])), w: o(pos()), h: o(pos()), name: o(text(12)), tint: o(cor()), leaves: o(bool()), roof: o(bool()) }), 12),
      altura: o(pos(4)),
      espessura: o(pos(0.6)),
    },
  },

  // --- Buildings ----------------------------------------------------------------------------------------
  casaRua: { categoria: 'construcoes', nome: { pt: 'Sobrado', en: 'Two-story house' }, ...livre(false), params: { corParede: cor(0xf2e2c4), corTelhado: cor(0x8e4b3a) } },
  casaAssombrada: {
    categoria: 'construcoes',
    nome: { pt: 'Casa assombrada', en: 'Haunted house' },
    ...fixa,
    params: {
      x0: num(),
      z0: num(),
      x1: num(),
      z1: num(),
      andares: o(opt([1, 2], 1)),
      pe: o(pos(3.2)),
      parede: surf('reboco'),
      cor: cor(),
      telhado: cor(),
      cumeeira: o(eixo),
      subida: o(pos(2.2)),
      portas: o(obj({ n: o(list(num(), 6)), s: o(list(num(), 6)), e: o(list(num(), 6)), w: o(list(num(), 6)) })),
      larguraPorta: o(pos(1.7)),
      janelas: o(obj({ n: o(list(num(), 6)), s: o(list(num(), 6)), e: o(list(num(), 6)), w: o(list(num(), 6)) })),
      superiores: o(obj({ n: o(list(num(), 6)), s: o(list(num(), 6)), e: o(list(num(), 6)), w: o(list(num(), 6)) })),
      tabuas: o(bool(false)),
      moldura: cor(),
      lampada: o(bool(true)),
    },
  },
  barraca: { categoria: 'construcoes', nome: { pt: 'Barraca de feira', en: 'Market stall' }, ...livre(), params: { cor: cor(0xb02a2a) } },
  ponteArco: { categoria: 'construcoes', nome: { pt: 'Ponte em arco', en: 'Arched bridge' }, ...linear, params: { eixo, de: num(), ate: num(), atravessa: num(), largura: pos(2.4), pico: pos(1), y0: o(num(0)), cor: o(cor()), superficie: o(surf('pedra')) } },
  deck: { categoria: 'construcoes', nome: { pt: 'Deque', en: 'Deck' }, ...fixa, params: { area: rect, y: num(0.5), postesAte: o(num(-0.8)), cor: o(cor()) } },
  ting: { categoria: 'construcoes', nome: { pt: 'Quiosque oriental', en: 'Open pavilion' }, ...livre(false), params: { metade: pos(2.2), base: o(pos(0)), altura: o(pos(2.8)), degraus: o(list(opt(['n', 's', 'e', 'w']), 4)), corrimao: o(bool(false)), corTelhado: o(cor()), lanternas: o(pos()) } },
  tanque: { categoria: 'construcoes', nome: { pt: 'Lago raso', en: 'Pond' }, ...fixa, params: { area: rect, fundo: pos(0.8), bordas: o(list(opt(['n', 's', 'e', 'w']), 4)), agua: o(num(-0.25)), cor: o(cor()) } },
  placa: { categoria: 'objetos', nome: { pt: 'Placa torta', en: 'Crooked sign' }, ...livre(), params: { linhas: list(text(40), 5), fundo: o(text(20)), texto: o(text(20)), altura: o(pos(1.5)), largura: o(pos(1.3)), alturaPlaca: o(pos(0.8)), inclinacao: o(num(0)) } },
  placaRua: { categoria: 'objetos', nome: { pt: 'Placa de piada', en: 'Pun sign' }, ...livre(), params: { linhas: list(text(40), 3), fundo: text(20), texto: text(20), altura: o(pos(1.3)) } },
  placaJardim: { categoria: 'objetos', nome: { pt: 'Placa laqueada', en: 'Lacquered sign' }, ...livre(), params: { linhas: list(text(40), 3), fundo: text(20), texto: text(20), altura: pos(1.3) } },
  placaNome: { categoria: 'objetos', nome: { pt: 'Placa com ideogramas', en: 'Name plaque' }, ...livre(), params: { texto: text(12), largura: pos(2), altura: pos(0.6), fundo: o(text(20)), letra: o(text(20)) } },
  inscricao: { categoria: 'objetos', nome: { pt: 'Inscrição em pedra', en: 'Stone inscription' }, ...livre(), params: { colunas: list(text(12), 8), largura: pos(1), altura: pos(1.6) } },

  // --- Nature ---------------------------------------------------------------------------------------------
  arvoreMorta: { categoria: 'natureza', nome: { pt: 'Árvore morta', en: 'Dead tree' }, ...livre(false, true), params: { cor: o(cor()), colide: o(bool(true)), galhos: o(int(5, 1, 20)) }, semente: true },
  arvoreRua: { categoria: 'natureza', nome: { pt: 'Árvore', en: 'Tree' }, ...livre(false, true), params: {} },
  arbusto: { categoria: 'natureza', nome: { pt: 'Arbusto', en: 'Bush' }, ...livre(false), params: { largura: pos(2) } },
  copaSimples: { categoria: 'natureza', nome: { pt: 'Copa', en: 'Canopy' }, ...livre(false), params: { raio: pos(2.6), cor: cor(0x5dbb45) } },
  rocha: { categoria: 'natureza', nome: { pt: 'Rocha', en: 'Rock' }, ...livre(false), params: { tamanho: v3([1, 0.7, 1]), cor: o(cor()), colide: o(bool(true)) }, semente: true },
  pinheiro: { categoria: 'natureza', nome: { pt: 'Pinheiro', en: 'Pine' }, ...livre(false, true), params: { verdes: o(list(cor(), 4)), tronco: o(cor()), colide: o(bool(true)) }, semente: true },
  bonsai: { categoria: 'natureza', nome: { pt: 'Bonsai', en: 'Bonsai' }, ...livre(false, true), params: { corVaso: o(cor(0x2f5d8a)) }, semente: true },
  bambu: { categoria: 'natureza', nome: { pt: 'Touceira de bambu', en: 'Bamboo clump' }, ...livre(false), params: { quantidade: int(6, 1, 40), espalhamento: pos(1) }, semente: true },
  bosqueBambu: { categoria: 'natureza', nome: { pt: 'Bambuzal', en: 'Bamboo grove' }, ...fixa, params: { area: rect, densidade: o(pos(1.1, 5)) }, semente: true },
  sebeJardim: { categoria: 'natureza', nome: { pt: 'Cerca viva aparada', en: 'Clipped hedge' }, ...fixa, params: { x0: num(), z0: num(), x1: num(), z1: num(), altura: o(pos(1.1)) } },

  // --- Furniture and props ------------------------------------------------------------------------------
  caixote: { categoria: 'moveis', nome: { pt: 'Caixote', en: 'Crate' }, ...livre(true, true), params: { cor: o(cor(0x9a7650)) } },
  caixoteJardim: { categoria: 'moveis', nome: { pt: 'Caixote laqueado', en: 'Garden crate' }, ...livre(true, true), params: {} },
  fardoFeno: { categoria: 'moveis', nome: { pt: 'Fardo de feno', en: 'Hay bale' }, ...livre(), params: { tamanho: o(v3([1.1, 0.5, 0.55])) } },
  barril: { categoria: 'moveis', nome: { pt: 'Barril', en: 'Barrel' }, ...livre(false), params: { raio: o(pos(0.38)), altura: o(pos(1)), cor: o(cor(0x7a4a2a)) } },
  banco: { categoria: 'moveis', nome: { pt: 'Banco de praça', en: 'Park bench' }, ...livre(), params: { comprimento: o(pos(1.8)) } },
  bancoJardim: { categoria: 'moveis', nome: { pt: 'Banco de pedra', en: 'Stone bench' }, ...livre(false), params: { ao: opt(['x', 'z']), comprimento: o(pos(1.8)) } },
  sofa: { categoria: 'moveis', nome: { pt: 'Sofá', en: 'Sofa' }, ...livre(), params: { comprimento: o(pos(2.3)), cor: o(cor()), detalhe: o(cor()) } },
  mesa: { categoria: 'moveis', nome: { pt: 'Mesa', en: 'Table' }, ...livre(), params: { largura: pos(1.4), profundidade: pos(0.8), altura: o(pos(0.78)), cor: o(cor()) } },
  mesaBaixa: { categoria: 'moveis', nome: { pt: 'Mesa baixa', en: 'Low table' }, ...livre(false), params: { largura: pos(1.2), profundidade: pos(0.8), topo: o(opt(['cha', 'nada'])) } },
  cadeira: { categoria: 'moveis', nome: { pt: 'Cadeira', en: 'Chair' }, ...livre(), params: { cor: o(cor()), assento: o(cor()) } },
  vela: { categoria: 'moveis', nome: { pt: 'Vela', en: 'Candle' }, ...livre(false), params: { altura: o(pos(0.16)), suporte: o(bool(true)), cera: o(cor()) } },
  cama: { categoria: 'moveis', nome: { pt: 'Cama', en: 'Bed' }, ...livre(), params: { largura: o(pos(1.4)), comprimento: o(pos(2)), coberta: o(cor()), madeira: o(cor()) } },
  caixao: { categoria: 'moveis', nome: { pt: 'Caixão', en: 'Coffin' }, ...livre(), params: { cor: o(cor()), comprimento: o(pos(2)) } },
  bancoIgreja: { categoria: 'moveis', nome: { pt: 'Banco de igreja', en: 'Pew' }, ...livre(), params: { comprimento: o(pos(1.6)), cor: o(cor()) } },
  armadura: { categoria: 'moveis', nome: { pt: 'Armadura', en: 'Suit of armor' }, ...livre(), params: {} },
  bauBrinquedos: { categoria: 'moveis', nome: { pt: 'Baú de brinquedos', en: 'Toy chest' }, ...livre(), params: {} },
  cavaloBalanco: { categoria: 'moveis', nome: { pt: 'Cavalinho de balanço', en: 'Rocking horse' }, ...livre(), params: {} },
  estante: { categoria: 'moveis', nome: { pt: 'Estante de livros', en: 'Bookshelf' }, ...livre(), params: { largura: pos(1.8), altura: o(pos(2.2)), dosDoisLados: o(bool(true)) }, semente: true },
  pocao: { categoria: 'moveis', nome: { pt: 'Poção', en: 'Potion bottle' }, ...livre(false, true), params: { forma: opt([0, 1, 2], 0), cor: cor(0x6affd8) } },
  estantePocoes: { categoria: 'moveis', nome: { pt: 'Prateleira de poções', en: 'Potion shelf' }, ...livre(), params: {}, semente: true },
  cofre: { categoria: 'moveis', nome: { pt: 'Cofre', en: 'Safe' }, ...livre(), params: {} },
  maquinaRefrigerante: { categoria: 'moveis', nome: { pt: 'Máquina de refrigerante', en: 'Vending machine' }, ...livre(), params: {} },
  retrato: { categoria: 'moveis', nome: { pt: 'Retrato', en: 'Portrait' }, ...livre(), params: { quem: opt([0, 1], 0) } },
  vaso: { categoria: 'moveis', nome: { pt: 'Vaso', en: 'Vase' }, ...livre(false), params: { altura: o(pos(1)), cor: o(cor()) } },
  biombo: { categoria: 'moveis', nome: { pt: 'Biombo', en: 'Folding screen' }, ...livre(false), params: { ao: opt(['x', 'z']), paineis: o(int(4, 1, 12)), largura: o(pos(0.7)), altura: o(pos(1.9)) } },
  incensario: { categoria: 'moveis', nome: { pt: 'Incensário', en: 'Incense burner' }, ...livre(false, true), params: {} },
  leaoPedra: { categoria: 'moveis', nome: { pt: 'Leão de pedra', en: 'Stone lion' }, ...livre(), params: { tipo: opt(['macho', 'femea']) } },

  // --- Vehicles -----------------------------------------------------------------------------------------
  carro: { categoria: 'veiculos', nome: { pt: 'Carro', en: 'Car' }, ...livre(), params: { cor: cor(0xd8342a) } },
  carroBuzina: { categoria: 'veiculos', nome: { pt: 'Carro que buzina', en: 'Honking car' }, ...livre(), params: { cor: cor(), vizinho: v3(), fala: text(40, 'CHEGA.') }, prop: 'buzina', limite: 1 },
  van: { categoria: 'veiculos', nome: { pt: 'Van de mudança', en: 'Moving van' }, ...livre(false), params: { cor: cor(0xf2f2f2), faixa: cor() } },
  caminhaoSorvete: { categoria: 'veiculos', nome: { pt: 'Caminhão de sorvete', en: 'Ice cream truck' }, ...fixa, params: { cor: cor(), detalhe: cor() }, prop: 'caminhao', limite: 1 },
  carrinhosBateBate: { categoria: 'veiculos', nome: { pt: 'Carrinhos de bate-bate', en: 'Bumper cars' }, ...fixa, params: { carros: list(obj({ p: v2(), cor: cor(), detalhe: cor(), yaw: num(0) }), 20) } },
  trailerCirco: { categoria: 'veiculos', nome: { pt: 'Trailer de circo', en: 'Circus trailer' }, ...livre(), params: { cor: cor(), faixa: cor(), texto: text(30) } },

  // --- Gags and game objects ----------------------------------------------------------------------------
  hidrante: { categoria: 'objetos', nome: { pt: 'Hidrante', en: 'Hydrant' }, ...livre(false), params: {}, prop: 'hidrante' },
  flamingo: { categoria: 'objetos', nome: { pt: 'Flamingo', en: 'Flamingo' }, ...livre(), params: {}, prop: 'flamingo' },
  abobora: { categoria: 'objetos', nome: { pt: 'Abóbora que explode', en: 'Smashing pumpkin' }, ...livre(true, true), params: {}, prop: 'abobora' },
  aboboraEstatica: { categoria: 'objetos', nome: { pt: 'Abóbora', en: 'Jack-o-lantern' }, ...livre(), params: { raio: pos(0.42), rosto: o(bool(true)) } },
  aboboraGigante: { categoria: 'objetos', nome: { pt: 'Abóbora gigante', en: 'Giant pumpkin' }, ...livre(), params: { raio: pos(2.2) }, prop: 'aboboragigante', limite: 1 },
  fantasma: { categoria: 'objetos', nome: { pt: 'Túmulo do fantasma', en: "Ghost's grave" }, ...livre(), params: {}, prop: 'fantasma', limite: 1 },
  sino: { categoria: 'objetos', nome: { pt: 'Sino', en: 'Bell' }, ...livre(false), params: { tamanho: pos(1), som: v3(), tom: o(pos()), alto: o(bool(false)), bolha: o(obj({ p: v3(), largura: pos(4), texto: text(40), toques: int(5, 1, 50) })) }, prop: 'sino' },
  poste: { categoria: 'luzes', nome: { pt: 'Poste antigo', en: 'Old lamp post' }, ...livre(false), params: { braco: v2([1, 0]), piscar: o(bool(false)) }, prop: 'poste' },
  posteRua: { categoria: 'luzes', nome: { pt: 'Poste de rua', en: 'Street lamp' }, ...livre(false), params: { lado: opt([1, -1], 1) } },
  espantalho: { categoria: 'objetos', nome: { pt: 'Espantalho', en: 'Scarecrow' }, ...livre(), params: {}, prop: 'espantalho' },
  caldeirao: { categoria: 'objetos', nome: { pt: 'Caldeirão', en: 'Cauldron' }, ...livre(false), params: { area: rect }, prop: 'caldeirao', limite: 1 },
  bruxa: { categoria: 'objetos', nome: { pt: 'Bruxa', en: 'Witch' }, ...livre(), params: {}, prop: 'bruxa', limite: 1 },
  alvos: { categoria: 'objetos', nome: { pt: 'Tiro ao alvo', en: 'Shooting gallery' }, ...fixa, params: { alvos: list(v3(), 20), lampadas: o(list(v3(), 60)), festa: v3() }, prop: 'alvo', limite: 1 },
  rodaGigante: { categoria: 'objetos', nome: { pt: 'Roda-gigante', en: 'Ferris wheel' }, ...livre(false), params: { raio: pos(7) } },
  fogueira: { categoria: 'objetos', nome: { pt: 'Fogueira', en: 'Bonfire' }, ...livre(false), params: {} },
  relogio: { categoria: 'objetos', nome: { pt: 'Relógio de pêndulo', en: 'Grandfather clock' }, ...livre(), params: { som: v3() }, prop: 'relogio', limite: 1 },
  cogumelosBrilho: { categoria: 'objetos', nome: { pt: 'Cogumelos que acendem', en: 'Glowing mushrooms' }, ...fixa, params: { pontos: list(v3(), 10) }, prop: 'cogumelo', limite: 1 },
  armarioBiscoito: { categoria: 'objetos', nome: { pt: 'Armário dos biscoitos', en: 'Biscuit cabinet' }, ...livre(), params: { som: v3() }, prop: 'armario', coletavel: true, limite: 1 },
  ratoGigante: { categoria: 'objetos', nome: { pt: 'Rato gigante', en: 'Giant rat' }, ...livre(), params: { id: text(16, 'rato') } },
  peixes: { categoria: 'objetos', nome: { pt: 'Carpas', en: 'Koi' }, ...fixa, params: {}, semente: true, limite: 1 },
  cachorro: { categoria: 'objetos', nome: { pt: 'Cachorra de guarda', en: 'Guard dog' }, ...livre(true, true), params: { nome: text(16, 'Amora') }, limite: 1 },
  brasas: { categoria: 'objetos', nome: { pt: 'Brasas', en: 'Embers' }, ...livre(false), params: {} },
  lustre: { categoria: 'luzes', nome: { pt: 'Lustre de velas', en: 'Candle chandelier' }, ...livre(false), params: {} },
  placaParede: { categoria: 'objetos', nome: { pt: 'Placa de parede', en: 'Wall plaque' }, ...livre(), params: { texto: text(40), largura: pos(1.4), altura: pos(0.5), estilo: opt(['tumulo', 'esgoto'], 'tumulo') } },
  agua: { categoria: 'natureza', nome: { pt: 'Água', en: 'Water' }, ...fixa, params: { area: rect, y: num(0), cor: cor(0x3a5a3a), opacidade: { tipo: 'numero', min: 0, max: 1, padrao: 0.75 } } },
  lampadaPendurada: { categoria: 'luzes', nome: { pt: 'Lâmpada pendurada', en: 'Hanging bulb' }, ...livre(false), params: { intensidade: o(pos()), alcance: o(pos()) } },
  arandela: { categoria: 'luzes', nome: { pt: 'Arandela', en: 'Sconce' }, ...livre(false), params: { para: v2([0, 1]) } },
  lanternaPedra: { categoria: 'luzes', nome: { pt: 'Lanterna de pedra', en: 'Stone lantern' }, ...livre(false), params: {} },
  lanternaPapel: { categoria: 'luzes', nome: { pt: 'Lanterna de papel', en: 'Paper lantern' }, ...livre(false), params: { queda: o(pos(0.85)) }, prop: 'lanterna' },
  gongo: { categoria: 'objetos', nome: { pt: 'Gongo', en: 'Gong' }, ...livre(false), params: {}, prop: 'gongo', limite: 1 },
  sinoOriental: { categoria: 'objetos', nome: { pt: 'Sino de bronze', en: 'Bronze bell' }, ...livre(false), params: { tamanho: pos(0.85) }, prop: 'sino' },

  // --- The Dragon Garden's own pieces -------------------------------------------------------------------
  cerejeiraDragao: { categoria: 'natureza', nome: { pt: 'Cerejeira do Dragão', en: 'Dragon Cherry' }, ...livre(false), params: {}, semente: true, coletavel: true, limite: 1, prop: 'fruta' },
  estanteJardim: { categoria: 'moveis', nome: { pt: 'Estante laqueada', en: 'Lacquered bookshelf' }, ...livre(false), params: { ao: opt(['x', 'z']), comprimento: pos(2.6) }, semente: true },
  quadro: { categoria: 'objetos', nome: { pt: 'Pintura em rolo', en: 'Painted scroll' }, ...livre(), params: { estilo: opt(['paisagem', 'ancestral'], 'paisagem'), largura: pos(1.4), altura: pos(1.9), indice: o(int(0, 0, 2)) } },
  dragaoDecorativo: { categoria: 'objetos', nome: { pt: 'Dragão decorativo', en: 'Decorative dragon' }, ...livre(false), params: { caminho: list(v3(), 40), raio: pos(0.16), cores: opt(['dourado', 'carmesim', 'jade'], 'dourado'), espelho: o(bool(false)), sombra: o(bool(false)) } },
  pedestalBonsai: { categoria: 'natureza', nome: { pt: 'Bonsai no pedestal', en: 'Bonsai on a pedestal' }, ...livre(false), params: {}, semente: true },
  bonsaiDragao: { categoria: 'natureza', nome: { pt: 'Bonsai do Dragão', en: 'Dragon Bonsai' }, ...livre(false), params: {}, semente: true },
  postoLanterna: { categoria: 'luzes', nome: { pt: 'Poste com lanterna', en: 'Lantern post' }, ...livre(false), params: { braco: v2([1, 0]) } },
  fonteDragao: { categoria: 'objetos', nome: { pt: 'Fonte do dragão', en: 'Dragon fountain' }, ...livre(false), params: {}, semente: true, prop: 'dragao', limite: 1 },
  sinosBianzhong: { categoria: 'objetos', nome: { pt: 'Carrilhão de sinos', en: 'Chime bells' }, ...linear, params: { de: num(), ate: num() }, prop: 'carrilhao', limite: 1 },
  barracaMercado: { categoria: 'construcoes', nome: { pt: 'Barraca do mercado', en: 'Market stall' }, ...livre(false), params: { pano: cor(0xc0352b), mercadorias: list(cor(), 6), frutas: bool(true) }, semente: true, prop: 'banca' },
  cesto: { categoria: 'moveis', nome: { pt: 'Cesto', en: 'Basket' }, ...livre(false), params: {} },
  carrinho: { categoria: 'veiculos', nome: { pt: 'Carrinho de mão', en: 'Hand cart' }, ...livre(false), params: {} },
  suporteArmas: { categoria: 'moveis', nome: { pt: 'Suporte de armas', en: 'Weapon rack' }, ...livre(false), params: { ao: opt(['x', 'z']), comprimento: o(pos(2.2)) } },
  bonecoTreino: { categoria: 'moveis', nome: { pt: 'Boneco de treino', en: 'Training dummy' }, ...livre(false), params: {} },
  armaduraLaqueada: { categoria: 'moveis', nome: { pt: 'Armadura laqueada', en: 'Lacquered armor' }, ...livre(false), params: {} },
  tumulo: { categoria: 'moveis', nome: { pt: 'Túmulo', en: 'Tomb' }, ...livre(false), params: { ao: opt(['x', 'z']) } },
  sinoPortico: { categoria: 'objetos', nome: { pt: 'Sino no pórtico', en: 'Bell on a frame' }, ...livre(false), params: {}, prop: 'sino' },
  sinoSuspenso: { categoria: 'objetos', nome: { pt: 'Sino grande suspenso', en: 'Great hanging bell' }, ...livre(false), params: {}, prop: 'sino' },
  tamborGrande: { categoria: 'objetos', nome: { pt: 'Tambor grande', en: 'Big drum' }, ...livre(false), params: {}, prop: 'tambor' },
  tamborGuerra: { categoria: 'objetos', nome: { pt: 'Tambor de guerra', en: 'War drum' }, ...livre(false), params: {}, prop: 'tambor' },
  tamborBanco: { categoria: 'objetos', nome: { pt: 'Tambor de pé', en: 'Standing drum' }, ...livre(false), params: {}, prop: 'tambor' },
  estela: { categoria: 'construcoes', nome: { pt: 'Estela', en: 'Stele' }, ...livre(false), params: {} },
  pinheiroVaso: { categoria: 'natureza', nome: { pt: 'Pinheiro no vaso', en: 'Pine in a planter' }, ...livre(false), params: {}, semente: true },
  panda: { categoria: 'objetos', nome: { pt: 'Panda', en: 'Panda' }, ...livre(), params: {} },
  lampiao: { categoria: 'luzes', nome: { pt: 'Lampião de pedra', en: 'Stone lamp' }, ...livre(false), params: {} },
  lirios: { categoria: 'natureza', nome: { pt: 'Lírios aquáticos', en: 'Water lilies' }, ...fixa, params: { area: rect, n: int(10, 1, 60), y: o(num(-0.235)) }, semente: true },
  juncos: { categoria: 'natureza', nome: { pt: 'Juncos', en: 'Reeds' }, ...livre(false), params: { n: int(10, 1, 60), espalhamento: pos(1) }, semente: true },
  caminhoPedras: { categoria: 'natureza', nome: { pt: 'Caminho de pedras', en: 'Stepping stones' }, ...fixa, params: { pontos: list(v2(), 40), espacamento: o(pos(0.95)), y: o(num(0.025)) }, semente: true },
  varalLanternas: { categoria: 'luzes', nome: { pt: 'Varal de lanternas', en: 'String of lanterns' }, ...linear, params: { de: v3(), ate: v3(), n: int(3, 1, 30) }, prop: 'lanterna' },
  portalJardim: { categoria: 'estrutura', nome: { pt: 'Portal laqueado', en: 'Lacquered gateway' }, ...linear, params: { eixo, fixo: num(), portao: obj({ at: num(), kind: o(opt(['portal', 'lua', 'porta'])), w: o(pos()), h: o(pos()), name: o(text(12)), tint: o(cor()), leaves: o(bool()), roof: o(bool()) }), largura: pos(2.4), altura: pos(3), alturaMuro: pos(4), espessura: pos(0.3) } },
  folhasPorta: { categoria: 'estrutura', nome: { pt: 'Folhas de porta abertas', en: 'Open door leaves' }, ...linear, params: { eixo, fixo: num(), centro: num(), largura: pos(2.4), altura: pos(3), espessura: pos(0.3), lado: o(opt([1, -1], 1)) } },

  // --- Ambience -----------------------------------------------------------------------------------------
  morcegos: { categoria: 'ambiente', nome: { pt: 'Morcegos', en: 'Bats' }, ...fixa, params: { bandos: list(obj({ centro: v3(), raio: pos(5), n: int(5, 1, 30) }), 10) }, semente: true },
  nevoa: { categoria: 'ambiente', nome: { pt: 'Névoa rasteira', en: 'Ground mist' }, ...fixa, params: { manchas: list(v3(), 40) }, semente: true },
  lapide: { categoria: 'natureza', nome: { pt: 'Lápide', en: 'Tombstone' }, ...livre(), params: { tipo: opt(['arco', 'cruz', 'laje', 'obelisco'], 'arco'), cor: o(cor()), epitafio: o(list(text(30), 6)) }, semente: true },

  // --- Imported ------------------------------------------------------------------------------------------
  glb: { categoria: 'importado', nome: { pt: 'Modelo GLB', en: 'GLB model' }, ...livre(true, true), params: { arquivo: text(80) } },

  // --- Organization ----------------------------------------------------------------------------------------
  /**
   * A group of the editor's Hierarchy (Revisions 01): builds nothing; its pose is the frame of the pieces that
   * name it as their parent (Peca.pai), so moving or turning it carries them.
   */
  grupo: { categoria: 'organizacao', nome: { pt: 'Grupo', en: 'Group' }, ...fixa, params: {} },
};

export const MAP_CATALOG: Readonly<Record<string, TipoPeca>> = Object.fromEntries(Object.entries(DEFS).map(([id, d]) => [id, { id, ...d }]));

export const isTipoPeca = (t: unknown): t is string => typeof t === 'string' && Object.hasOwn(MAP_CATALOG, t);

const isVec = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Problems of one value against its parameter's schema (`path` names it in the messages). */
export function checkParam(p: Param, v: unknown, path: string): string[] {
  if (v === undefined) return p.opcional ? [] : [`${path}: obrigatório`];
  switch (p.tipo) {
    case 'numero':
    case 'inteiro': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return [`${path}: deve ser um número`];
      if (p.tipo === 'inteiro' && !Number.isInteger(v)) return [`${path}: deve ser inteiro`];
      if ((p.min !== undefined && v < p.min) || (p.max !== undefined && v > p.max)) return [`${path}: fora da faixa [${p.min}, ${p.max}]`];
      return [];
    }
    case 'booleano':
      return typeof v === 'boolean' ? [] : [`${path}: deve ser verdadeiro ou falso`];
    case 'texto':
      return typeof v === 'string' && v.length <= (p.max ?? 200) ? [] : [`${path}: texto de até ${p.max ?? 200} caracteres`];
    case 'cor':
      return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 0xffffff ? [] : [`${path}: cor 0xRRGGBB`];
    case 'superficie':
      return (SUPERFICIES as readonly unknown[]).includes(v) ? [] : [`${path}: superfície desconhecida`];
    case 'opcao':
      return p.opcoes.includes(v as string | number) ? [] : [`${path}: deve ser ${p.opcoes.join(' | ')}`];
    case 'vec2':
    case 'vec3':
    case 'vec4': {
      const n = p.tipo === 'vec2' ? 2 : p.tipo === 'vec3' ? 3 : 4;
      if (!isVec(v, n)) return [`${path}: ${n} números`];
      if ((v as number[]).some((x) => (p.min !== undefined && x < p.min) || (p.max !== undefined && x > p.max))) return [`${path}: fora da faixa [${p.min}, ${p.max}]`];
      return [];
    }
    case 'lista': {
      if (!Array.isArray(v)) return [`${path}: deve ser uma lista`];
      if (v.length > (p.max ?? 500)) return [`${path}: no máximo ${p.max ?? 500} itens`];
      return v.flatMap((x, i) => checkParam(p.item, x, `${path}[${i}]`));
    }
    case 'objeto': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return [`${path}: deve ser um objeto`];
      const rec = v as Record<string, unknown>;
      const extra = Object.keys(rec).filter((k) => !Object.hasOwn(p.campos, k)).map((k) => `${path}.${k}: campo desconhecido`);
      return [...extra, ...Object.entries(p.campos).flatMap(([k, c]) => checkParam(c, rec[k], `${path}.${k}`))];
    }
    case 'json':
      return v === null || ['object', 'number', 'string', 'boolean'].includes(typeof v) ? [] : [`${path}: JSON inválido`];
  }
}

/** Problems of a piece's params against its kind's schema (unknown kinds and params included). */
export function checkPieceParams(tipo: string, params: unknown, path = 'params'): string[] {
  const t = MAP_CATALOG[tipo];
  if (!t) return [`${path}: tipo de peça desconhecido "${tipo}"`];
  return checkParam({ tipo: 'objeto', campos: t.params }, params, path);
}
