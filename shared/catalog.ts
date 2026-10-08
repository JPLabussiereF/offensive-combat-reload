// The character catalog (style guide, "Catálogo"): every hair style, piece of clothing, headwear, accessory
// and piece of tactical gear, with the slots it takes, the color channels the player paints (P primary, S
// secondary, D detail) and its names. Shared by the client (editor, models) and the server (validation).
//
// Rules (style guide): two items in the same slot can't be worn together; an item that takes more than one
// slot (a full-face helmet: head + face) frees the others. Cosmetics never change the hitbox.
// `ready`: the item has a model. Items arrive in batches; the rest of the list is the plan.

import type { Text } from './langs';

/** Where items go. Clothes first, then the sockets accessories hang from. */
export const SLOTS = [
  'tronco', // shirt, sweater (the torso)
  'sobreposicao', // jacket or coat over the torso
  'baixo', // pants, shorts, skirt
  'calcado', // shoes
  'cabeca', // hat, cap, helmet
  'rosto', // glasses, mask
  'orelhas',
  'pescoco',
  'pulsoE',
  'pulsoD',
  'maos',
  'antebraco',
  'cotovelos',
  'ombro', // one shoulder: radio, flashlight, crossbody bag
  'ombros', // both: armored shoulder pads
  'colete', // vest, plate carrier
  'acessorioColete', // things clipped to the vest or the chest
  'peito', // suspenders, bandolier
  'costas', // backpack
  'cintura', // belt, pouch
  'coxaE',
  'coxaD',
  'joelhos',
  'pes', // a knife in the boot
  'pele', // tattoos
] as const;
export type Slot = (typeof SLOTS)[number];

/** Slots a look must always fill. */
export const REQUIRED_SLOTS: readonly Slot[] = ['tronco', 'baixo', 'calcado'];

/** Big pieces: their primary color can't be an accent (saturation rule). */
export const BIG_SLOTS: readonly Slot[] = ['tronco', 'sobreposicao', 'baixo'];

export type Category = 'cabelo' | 'barba' | 'camiseta' | 'blusa' | 'jaqueta' | 'calca' | 'short' | 'calcado' | 'cabeca' | 'acessorio' | 'tatico';
export type Channel = 'P' | 'S' | 'D';
/** Sleeve length of tops (the first-person arms show it). */
export type Sleeve = 'nenhuma' | 'curta' | 'longa';

export interface CatalogItem {
  id: string;
  category: Category;
  /** The first is where the look stores it; the others are taken too. */
  slots: Slot[];
  channels: Channel[];
  name: Text;
  sleeve?: Sleeve;
  ready: boolean;
}

// One line per item: id | pt | en | es | de | slots (comma-separated) | channels | sleeve (n/c/l).
const TABLES: Record<Category, string> = {
  cabelo: `
raspado|Raspado|Shaved|Rapado|Kahlrasiert|||
buzzCut|Buzz cut|Buzz cut|Corte a máquina|Buzzcut|||
militar|Militar alto e reto|High and tight|Corte militar alto|Militärschnitt|||
degrade|Degradê clássico|Classic fade|Degradado clásico|Klassischer Fade|||
topete|Topete|Quiff|Copete|Tolle|||
franjaReta|Franja reta curta|Short straight bangs|Flequillo recto corto|Kurzer gerader Pony|||
curto|Bagunçado curto|Messy short|Corto despeinado|Kurz zerzaust|||
moicano|Moicano espetado|Spiked mohawk|Mohicano en picos|Stachel-Irokese|||
moicanoBaixo|Moicano baixo|Low mohawk|Mohicano bajo|Flacher Irokese|||
afroCurto|Afro curto|Short afro|Afro corto|Kurzer Afro|||
blackPower|Afro volumoso|Big afro|Afro voluminoso|Großer Afro|||
trancasNago|Tranças nagô|Cornrows|Trenzas pegadas|Cornrows|||
dreadsCurtos|Dreads curtos|Short dreads|Rastas cortas|Kurze Dreads|||
dreadsPresos|Dreads longos presos|Tied long dreads|Rastas largas recogidas|Lange Dreads, gebunden|||
cacheado|Cacheado médio|Medium curls|Rizos medianos|Mittellange Locken|||
repartido|Repartido de lado|Side part|Raya de lado|Seitenscheitel|||
penteadoTras|Penteado para trás|Slicked back|Peinado hacia atrás|Nach hinten gegelt|||
undercut|Undercut com topo longo|Long-top undercut|Undercut, largo arriba|Undercut, oben lang|||
medioDesfiado|Médio desfiado|Choppy medium|Mediano desfilado|Mittellang, stufig|||
chanel|Chanel reto|Straight bob|Bob recto|Gerader Bob|||
franjaLateral|Médio com franja lateral|Side-swept medium|Mediano con flequillo de lado|Mittellang mit Seitenpony|||
longo|Longo liso solto|Long straight|Largo lacio suelto|Lang, glatt, offen|||
longoOndulado|Longo ondulado|Long wavy|Largo ondulado|Lang gewellt|||
raboAlto|Rabo de cavalo alto|High ponytail|Cola de caballo alta|Hoher Pferdeschwanz|||
rabo|Rabo de cavalo baixo|Low ponytail|Cola de caballo baja|Tiefer Pferdeschwanz|||
coque|Coque alto|High bun|Moño alto|Hoher Dutt|||
coqueDuplo|Coque duplo|Space buns|Doble moño|Doppeldutt|||
tranca|Trança única|Single braid|Trenza sencilla|Einzelner Zopf|||
trancasBox|Tranças box longas|Long box braids|Box braids largas|Lange Box Braids|||
meioPreso|Meio preso|Half-up|Semirrecogido|Halb hochgesteckt|||`,
  barba: `
barbaPorFazer|Barba por fazer|Stubble|Barba de tres días|Dreitagebart|||
bigode|Bigode|Mustache|Bigote|Schnurrbart|||
cavanhaque|Cavanhaque|Goatee|Candado|Ziegenbart|||
barbaCurta|Barba curta|Short beard|Barba corta|Kurzer Bart|||
barbaCheia|Barba cheia|Full beard|Barba poblada|Vollbart|||
barbaLonga|Barba longa|Long beard|Barba larga|Langer Bart|||`,
  camiseta: `
basica|Básica gola careca|Crew neck tee|Básica cuello redondo|Rundhals-Shirt|tronco|PS|c
golaV|Gola V|V-neck tee|Cuello en V|V-Ausschnitt|tronco|PS|c
polo|Gola polo|Polo shirt|Camisa polo|Poloshirt|tronco|PSD|c
henley|Henley|Henley|Camiseta Henley|Henley-Shirt|tronco|PD|c
oversized|Oversized|Oversized tee|Camiseta oversized|Oversized-Shirt|tronco|PS|c
mangaDobrada|Manga dobrada|Rolled-sleeve tee|Mangas dobladas|Gekrempelte Ärmel|tronco|PS|c
raglan|Raglan|Raglan tee|Camiseta raglán|Raglan-Shirt|tronco|PS|c
listrada|Listrada horizontal|Striped tee|Rayas horizontales|Quergestreift|tronco|PS|c
estampa|Estampa frontal|Graphic tee|Estampado frontal|Frontprint|tronco|PD|c
timeEsportivo|Time esportivo|Sports jersey|Camiseta de equipo|Trikot|tronco|PSD|c
mangaLonga|Manga longa básica|Long-sleeve tee|Manga larga básica|Langarmshirt|tronco|PS|l
termica|Manga longa térmica|Thermal shirt|Manga larga térmica|Thermoshirt|tronco|PS|l
segundaPele|Segunda pele tática|Tactical base layer|Segunda piel táctica|Taktischer Baselayer|tronco|PS|l
camisetaTatica|Camiseta tática|Tactical tee|Camiseta táctica|Taktisches T-Shirt|tronco|PSD|c
rasgada|Rasgada|Ripped tee|Camiseta rasgada|Zerrissenes Shirt|tronco|P|c
regataCavada|Regata cavada|Muscle tank|Sin mangas escotada|Muskelshirt|tronco|PS|n
regata|Regata básica|Tank top|Sin mangas básica|Tanktop|tronco|P|n
regataCanelada|Regata canelada|Ribbed tank|Sin mangas acanalada|Geripptes Tanktop|tronco|P|n
cropped|Cropped|Crop top|Top corto|Crop-Top|tronco|PS|c
topEsportivo|Top esportivo|Sports top|Top deportivo|Sport-Top|tronco|PS|n
socialCurta|Camisa social manga curta|Short-sleeve dress shirt|Camisa de vestir manga corta|Kurzarmhemd|tronco|PSD|c
socialLonga|Camisa social manga longa|Long-sleeve dress shirt|Camisa de vestir manga larga|Langarmhemd|tronco|PSD|l
xadrezAberta|Camisa xadrez aberta|Open flannel shirt|Camisa a cuadros abierta|Offenes Karohemd|tronco|PSD|l
havaiana|Camisa havaiana|Hawaiian shirt|Camisa hawaiana|Hawaiihemd|tronco|PD|c
camisaJeans|Camisa jeans|Denim shirt|Camisa de mezclilla|Jeanshemd|tronco|PS|l
flanela|Camisa de flanela fechada|Flannel shirt|Camisa de franela cerrada|Flanellhemd|tronco|PSD|c
bata|Bata de mangas largas|Peasant blouse|Blusa campesina|Bauernbluse|tronco|PS|l
mecanico|Uniforme de mecânico|Mechanic shirt|Uniforme de mecánico|Mechanikerhemd|tronco|PSD|c
hoquei|Camiseta de hóquei (jersey)|Hockey jersey|Jersey de hockey|Eishockey-Trikot|tronco|PSD|l
coleteLa|Colete de lã sobre camisa|Sweater vest over shirt|Chaleco de lana con camisa|Pullunder mit Hemd|tronco|PS|l`,
  blusa: `
moletomCanguru|Moletom canguru|Hoodie|Sudadera con capucha|Kapuzenpulli|tronco|PS|l
moletomCapuz|Moletom canguru com capuz|Hoodie, hood up|Sudadera, capucha puesta|Kapuzenpulli, Kapuze auf|tronco,cabeca|PS|l
moletomZiper|Moletom com zíper|Zip hoodie|Sudadera con cierre|Sweatjacke|tronco|PSD|l
moletomSemCapuz|Moletom sem capuz|Crewneck sweatshirt|Sudadera sin capucha|Sweatshirt|tronco|PS|l
moletomOversized|Moletom oversized|Oversized hoodie|Sudadera oversized|Oversized-Hoodie|tronco|PS|l
moletomCropped|Moletom cropped|Cropped hoodie|Sudadera corta|Crop-Hoodie|tronco|PS|l
universitario|Moletom universitário|College sweatshirt|Sudadera universitaria|College-Sweatshirt|tronco|PSD|l
bicolor|Moletom bicolor|Two-tone sweatshirt|Sudadera bicolor|Zweifarbiges Sweatshirt|tronco|PS|l
trico|Suéter tricô grosso|Chunky knit sweater|Suéter tejido grueso|Grobstrickpullover|tronco|P|l
golaAlta|Suéter gola alta|Turtleneck|Suéter de cuello alto|Rollkragenpullover|tronco|PS|l
sueterV|Suéter decote V|V-neck sweater|Suéter cuello en V|Pulli mit V-Ausschnitt|tronco|PS|l
natalino|Suéter natalino|Holiday sweater|Suéter navideño|Weihnachtspulli|tronco|PSD|l
cardiga|Cardigã aberto|Open cardigan|Cárdigan abierto|Offene Strickjacke|tronco|PD|l
cardigaLongo|Cardigã longo|Long cardigan|Cárdigan largo|Lange Strickjacke|tronco|PS|l
pescador|Blusa de pescador|Fisherman sweater|Suéter de pescador|Fischerpullover|tronco|P|l
fleeceMeioZiper|Fleece com meio zíper|Half-zip fleece|Polar de medio cierre|Halfzip-Fleece|tronco|PSD|l
fleeceTatico|Fleece tático|Tactical fleece|Polar táctico|Taktisches Fleece|tronco|PSD|l
termicaMontanha|Blusa térmica de montanha|Mountain thermal|Térmica de montaña|Berg-Thermopulli|tronco|PS|l
anorak|Anorak|Anorak|Anorak|Anorak|tronco|PSD|l
puloverMilitar|Pulôver militar|Military pullover|Suéter militar|Militärpullover|tronco|PS|l
sueterHoquei|Suéter de hóquei|Hockey sweater|Suéter de hockey|Eishockey-Pulli|tronco|PS|l
golaCanoa|Blusa de gola canoa|Off-shoulder top|Blusa cuello barco|Off-Shoulder-Top|tronco|P|l
ciganinha|Blusa ciganinha|Ruffle top|Blusa de volantes|Rüschentop|tronco|PS|c
poncho|Poncho de lã|Wool poncho|Poncho de lana|Wollponcho|tronco|PSD|n
ciclista|Blusa de ciclista|Cycling jersey|Jersey de ciclismo|Radtrikot|tronco|PSD|c
agasalho|Agasalho de treino|Track jacket|Chamarra deportiva|Trainingsjacke|tronco|PS|l
goleiro|Blusa de goleiro|Goalkeeper jersey|Camiseta de portero|Torwarttrikot|tronco|PS|l
tunica|Túnica|Tunic|Túnica|Tunika|tronco|PS|l
remendos|Suéter com remendos|Patched sweater|Suéter con parches|Flickenpulli|tronco|PS|l
balaclavaMoletom|Balaclava + moletom|Balaclava hoodie|Pasamontañas + sudadera|Sturmhaube + Hoodie|tronco,cabeca,rosto|PS|l`,
  jaqueta: `
jaquetaJeans|Jaqueta jeans|Denim jacket|Chamarra de mezclilla|Jeansjacke|sobreposicao|PS|l
coleteJeans|Colete jeans sem mangas|Denim vest|Chaleco de mezclilla|Jeansweste|sobreposicao|PD|n
couroMoto|Jaqueta de couro motociclista|Biker leather jacket|Chamarra biker de cuero|Biker-Lederjacke|sobreposicao|PD|l
jaquetaAviador|Jaqueta de couro aviador|Leather flight jacket|Chamarra de cuero de aviador|Leder-Fliegerjacke|sobreposicao|PS|l
bomber|Bomber|Bomber jacket|Chamarra bomber|Bomberjacke|sobreposicao|PSD|l
cortaVento|Corta-vento|Windbreaker|Rompevientos|Windjacke|sobreposicao|PS|l
pufferCurta|Puffer curta|Short puffer|Puffer corta|Kurze Pufferjacke|sobreposicao|PS|l
pufferLonga|Puffer longa|Long puffer|Puffer larga|Puffermantel|sobreposicao|PS|l
coletePuffer|Colete puffer|Puffer vest|Chaleco puffer|Pufferweste|sobreposicao|PS|n
parka|Parka militar|Military parka|Parka militar|Militärparka|sobreposicao|PS|l
m65|Jaqueta de campo M65|M65 field jacket|Chamarra de campo M65|M65-Feldjacke|sobreposicao|PS|l
softshell|Jaqueta tática softshell|Tactical softshell|Softshell táctica|Taktische Softshell|sobreposicao|PSD|l
jaquetaCamuflada|Jaqueta de camuflagem|Camo jacket|Chamarra camuflada|Tarnjacke|sobreposicao|PD|l
blazer|Blazer|Blazer|Blazer|Blazer|sobreposicao|PS|l
paleto|Paletó de terno|Suit jacket|Saco de traje|Sakko|sobreposicao|PSD|l
trench|Trench coat|Trench coat|Gabardina|Trenchcoat|sobreposicao|PS|l
sobretudo|Sobretudo de lã|Wool overcoat|Abrigo de lana|Wollmantel|sobreposicao|P|l
shearling|Casaco de pastor (shearling)|Shearling coat|Abrigo de borrego|Lammfellmantel|sobreposicao|PS|l
brim|Jaqueta de brim de trabalho|Work canvas jacket|Chamarra de lona de trabajo|Canvas-Arbeitsjacke|sobreposicao|PS|l
varsity|Jaqueta varsity|Varsity jacket|Chamarra universitaria|Collegejacke|sobreposicao|PSD|l
jaquetaCorrida|Jaqueta de corrida|Running jacket|Chamarra para correr|Laufjacke|sobreposicao|PSD|l
jaquetaChuva|Jaqueta de chuva|Rain jacket|Chamarra impermeable|Regenjacke|sobreposicao|PS|l
capaPoncho|Capa de chuva poncho|Rain poncho|Poncho impermeable|Regenponcho|sobreposicao|P|n
jaquetaEsqui|Jaqueta de esqui|Ski jacket|Chamarra de esquí|Skijacke|sobreposicao|PSD|l
macacaoVoo|Macacão de voo (parte de cima)|Flight suit top|Overol de vuelo (parte superior)|Fliegeroverall (oben)|sobreposicao|PSD|l
guardaPo|Guarda-pó|Duster coat|Guardapolvo|Staubmantel|sobreposicao|P|l
chef|Jaqueta de chef|Chef jacket|Chamarra de chef|Kochjacke|sobreposicao|PD|l
jaleco|Jaleco|Lab coat|Bata de laboratorio|Laborkittel|sobreposicao|PD|l
coletePesca|Colete de pesca|Fishing vest|Chaleco de pesca|Anglerweste|sobreposicao|PS|n
capaCapuz|Capa com capuz|Hooded cape|Capa con capucha|Kapuzenumhang|sobreposicao,cabeca|PS|n`,
  calca: `
calcaJeans|Jeans reta|Straight jeans|Jeans recto|Gerade Jeans|baixo|PS|
jeansSkinny|Jeans skinny|Skinny jeans|Jeans skinny|Röhrenjeans|baixo|PS|
jeansRasgada|Jeans rasgada|Ripped jeans|Jeans rasgados|Zerrissene Jeans|baixo|PS|
jeansDobrada|Jeans com barra dobrada|Cuffed jeans|Jeans arremangados|Gekrempelte Jeans|baixo|PS|
jeans90|Jeans larga anos 90|Baggy 90s jeans|Jeans holgados de los 90|90er-Baggy-Jeans|baixo|PS|
cargoTatica|Cargo tática|Tactical cargo pants|Pantalón cargo táctico|Taktische Cargohose|baixo|PS|
calcaCargo|Cargo casual|Casual cargo pants|Pantalón cargo casual|Lässige Cargohose|baixo|PS|
combate|Calça de combate|Combat pants|Pantalón de combate|Kampfhose|baixo|PSD|
calcaCamuflada|Calça camuflada|Camo pants|Pantalón camuflado|Tarnhose|baixo|PD|
chino|Chino|Chinos|Pantalón chino|Chinohose|baixo|P|
social|Calça social|Dress pants|Pantalón de vestir|Stoffhose|baixo|PD|
calcaTerno|Calça de terno|Suit pants|Pantalón de traje|Anzughose|baixo|P|
calcaMoletom|Moletom jogger|Joggers|Pantalón jogger|Jogginghose|baixo|PS|
calcaAgasalho|Calça de agasalho|Track pants|Pantalón deportivo|Trainingshose|baixo|PS|
legging|Legging|Leggings|Leggins|Leggings|baixo|PS|
calcaTrabalho|Calça de trabalho|Work pants|Pantalón de trabajo|Arbeitshose|baixo|PS|
jardineira|Macacão jardineira (parte de baixo)|Overalls|Overol de peto|Latzhose|baixo|PSD|
calcaCouro|Calça de couro|Leather pants|Pantalón de cuero|Lederhose|baixo|P|
calcaMoto|Calça de motociclista|Moto pants|Pantalón de motociclista|Motorradhose|baixo|PS|
pantalona|Pantalona|Wide-leg pants|Pantalón ancho|Weite Hose|baixo|P|
linho|Calça de linho|Linen pants|Pantalón de lino|Leinenhose|baixo|P|
calcaXadrez|Calça xadrez|Plaid pants|Pantalón a cuadros|Karohose|baixo|PS|
calcaEsqui|Calça de esqui|Ski pants|Pantalón de esquí|Skihose|baixo|PS|
pijama|Calça de pijama|Pajama pants|Pantalón de pijama|Pyjamahose|baixo|PS|
montaria|Calça de montaria|Riding breeches|Pantalón de montar|Reithose|baixo|P|
enfermagem|Calça de enfermagem|Scrub pants|Pantalón de enfermería|OP-Hose|baixo|P|
paraquedista|Calça de paraquedista|Parachute pants|Pantalón paracaídas|Fallschirmhose|baixo|PS|
caminhada|Calça de caminhada|Hiking pants|Pantalón de senderismo|Wanderhose|baixo|PS|
bocaSino|Calça boca de sino|Flared pants|Pantalón acampanado|Schlaghose|baixo|P|
escolar|Calça de uniforme escolar|School uniform pants|Pantalón escolar|Schuluniformhose|baixo|PS|`,
  short: `
bermudaJeans|Bermuda jeans|Denim shorts|Bermuda de mezclilla|Jeans-Bermuda|baixo|P|
shortJeans|Short jeans curto|Short denim shorts|Short de mezclilla corto|Kurze Jeansshorts|baixo|PS|
bermudaCargo|Bermuda cargo|Cargo shorts|Bermuda cargo|Cargoshorts|baixo|PS|
bermudaTatica|Bermuda tática|Tactical shorts|Bermuda táctica|Taktische Shorts|baixo|PSD|
shortMoletom|Short de moletom|Sweat shorts|Short de sudadera|Sweatshorts|baixo|PS|
shortCorrida|Short de corrida|Running shorts|Short para correr|Laufshorts|baixo|PS|
bermudaEsportiva|Short de basquete|Basketball shorts|Short de básquet|Basketballshorts|baixo|PS|
shortFutebol|Short de futebol|Soccer shorts|Short de fútbol|Fußballshorts|baixo|PSD|
bermudaPraia|Bermuda de surf|Board shorts|Bermuda de surf|Boardshorts|baixo|PD|
bermudaChino|Bermuda chino|Chino shorts|Bermuda chino|Chino-Shorts|baixo|P|
bermudaXadrez|Bermuda xadrez|Plaid shorts|Bermuda a cuadros|Karo-Shorts|baixo|PS|
shortCiclista|Short de ciclista|Bike shorts|Short de ciclista|Radlerhose|baixo|PS|
shortLutador|Short de lutador|Fight shorts|Short de luchador|Fightshorts|baixo|PS|
bermudaTrabalho|Bermuda de trabalho|Work shorts|Bermuda de trabajo|Arbeitsshorts|baixo|PS|
shortCinturaAlta|Short cintura alta|High-waist shorts|Short de cintura alta|High-Waist-Shorts|baixo|PD|
saiaJeans|Saia jeans curta|Denim skirt|Falda corta de mezclilla|Kurzer Jeansrock|baixo|PS|
saiaLapis|Saia lápis|Pencil skirt|Falda lápiz|Bleistiftrock|baixo|P|
saiaPregas|Saia plissada|Pleated skirt|Falda plisada|Faltenrock|baixo|PS|
saiaRodada|Saia midi rodada|Midi circle skirt|Falda midi circular|Midi-Tellerrock|baixo|P|
saiaLonga|Saia longa|Long skirt|Falda larga|Langer Rock|baixo|P|
saiaXadrez|Saia xadrez|Plaid skirt|Falda a cuadros|Karorock|baixo|PS|
saiaCouro|Saia de couro|Leather skirt|Falda de cuero|Lederrock|baixo|PD|
kilt|Saia tática (kilt utilitário)|Utility kilt|Kilt utilitario|Taktischer Kilt|baixo|PSD|
saiaEnvelope|Saia envelope|Wrap skirt|Falda cruzada|Wickelrock|baixo|PS|
saiaShort|Saia-short|Skort|Falda short|Hosenrock|baixo|P|
saiaTenis|Saia de tênis|Tennis skirt|Falda de tenis|Tennisrock|baixo|PS|
shortMeiaCalca|Short com meia-calça|Shorts with tights|Short con medias|Shorts mit Strumpfhose|baixo|PS|
bermudaJoelheira|Bermuda com joelheira|Shorts with knee pads|Bermuda con rodilleras|Shorts mit Knieschonern|baixo|PS|
shortBanho|Short de banho|Swim shorts|Short de baño|Badeshorts|baixo|PD|
bermudaLinho|Bermuda de linho|Linen shorts|Bermuda de lino|Leinenshorts|baixo|P|`,
  calcado: `
tenis|Tênis casual|Sneakers|Tenis casuales|Sneaker|calcado|PSD|
tenisCorrida|Tênis de corrida|Running shoes|Tenis para correr|Laufschuhe|calcado|PSD|
canoAlto|Tênis cano alto|High-tops|Tenis de caña alta|High-Top-Sneaker|calcado|PSD|
skate|Tênis skate|Skate shoes|Tenis de skate|Skaterschuhe|calcado|PS|
tenisBasquete|Tênis de basquete|Basketball shoes|Tenis de básquet|Basketballschuhe|calcado|PSD|
slipOn|Tênis slip-on|Slip-ons|Tenis slip-on|Slip-On-Sneaker|calcado|PS|
bota|Coturno militar|Combat boots|Botas militares|Kampfstiefel|calcado|PS|
botaTatica|Bota tática|Tactical boots|Botas tácticas|Taktische Stiefel|calcado|PS|
botaDeserto|Bota de deserto|Desert boots|Botas de desierto|Wüstenstiefel|calcado|PS|
botaTrilha|Bota de trilha|Hiking boots|Botas de senderismo|Wanderstiefel|calcado|PSD|
botaTrabalho|Bota de trabalho|Work boots|Botas de trabajo|Arbeitsstiefel|calcado|PS|
botaMoto|Bota de motociclista|Biker boots|Botas de motociclista|Bikerstiefel|calcado|PD|
botaCauboi|Bota de caubói|Cowboy boots|Botas vaqueras|Cowboystiefel|calcado|PS|
botaChuva|Bota de chuva|Rain boots|Botas de lluvia|Regenstiefel|calcado|P|
botaNeve|Bota de neve|Snow boots|Botas de nieve|Schneestiefel|calcado|PS|
chelsea|Chelsea boot|Chelsea boots|Botas Chelsea|Chelsea-Boots|calcado|PS|
botaCanoLongo|Bota de cano longo|Knee-high boots|Botas altas|Langschaftstiefel|calcado|P|
sapatoSocial|Sapato social|Dress shoes|Zapatos de vestir|Anzugschuhe|calcado|PS|
mocassim|Mocassim|Loafers|Mocasines|Mokassins|calcado|P|
sapatoTrabalho|Sapato de trabalho|Work shoes|Zapatos de trabajo|Arbeitsschuhe|calcado|P|
sapatilha|Sapatilha|Flats|Balerinas|Ballerinas|calcado|PD|
papete|Sandália papete|Sport sandals|Sandalias deportivas|Trekkingsandalen|calcado|PS|
chinelo|Chinelo|Flip-flops|Chanclas|Flip-Flops|calcado|PS|
chuteira|Chuteira|Cleats|Zapatos de fútbol|Fußballschuhe|calcado|PSD|
lona|Tênis de lona clássico|Canvas sneakers|Tenis de lona clásicos|Canvas-Sneaker|calcado|PS|
galocha|Galocha de trabalho|Work galoshes|Galochas de trabajo|Arbeits-Gummistiefel|calcado|P|
botaSalto|Bota de salto|Heeled boots|Botas de tacón|Absatzstiefel|calcado|P|
tamanco|Tamanco|Clogs|Zuecos|Clogs|calcado|PS|
plataforma|Tênis plataforma|Platform sneakers|Tenis de plataforma|Plateau-Sneaker|calcado|PS|
descalco|Pés descalços|Barefoot|Descalzo|Barfuß|calcado||`,
  cabeca: `
bone|Boné de aba curva|Curved-brim cap|Gorra de visera curva|Rundschirm-Cap|cabeca|PS|
boneReto|Boné aba reta|Flat-brim cap|Gorra de visera plana|Flachschirm-Cap|cabeca|PS|
bonePraTras|Boné para trás|Backwards cap|Gorra hacia atrás|Cap nach hinten|cabeca|PS|
boneTatico|Boné tático|Tactical cap|Gorra táctica|Taktische Cap|cabeca|PSD|
gorroLa|Gorro de lã|Wool beanie|Gorro de lana|Wollmütze|cabeca|PS|
gorro|Gorro com pompom|Pom-pom beanie|Gorro con pompón|Bommelmütze|cabeca|PSD|
touca|Touca justa|Skullcap|Gorro ajustado|Enge Mütze|cabeca|P|
cauboi|Chapéu de caubói|Cowboy hat|Sombrero vaquero|Cowboyhut|cabeca|PS|
palha|Chapéu de palha|Straw hat|Sombrero de paja|Strohhut|cabeca|PS|
panama|Chapéu panamá|Panama hat|Sombrero panamá|Panamahut|cabeca|PS|
fedora|Fedora|Fedora|Sombrero fedora|Fedora|cabeca|PS|
bucket|Bucket hat|Bucket hat|Gorro bucket|Fischerhut|cabeca|PS|
boonie|Boonie militar|Boonie hat|Boonie militar|Buschhut|cabeca|PS|
boina|Boina|Beret|Boina|Barett|cabeca|P|
bandanaCabeca|Bandana na cabeça|Head bandana|Bandana en la cabeza|Kopf-Bandana|cabeca|PS|
faixaCabeca|Faixa de cabeça|Headband|Banda para la cabeza|Stirnband|cabeca|PS|
capaceteMilitar|Capacete militar|Military helmet|Casco militar|Militärhelm|cabeca|PS|
capaceteTatico|Capacete tático|Tactical helmet|Casco táctico|Taktischer Helm|cabeca|PSD|
capaceteVisao|Capacete tático com visão noturna|Night-vision helmet|Casco con visión nocturna|Nachtsichthelm|cabeca,rosto|PSD|
motoAberto|Capacete de moto aberto|Open-face moto helmet|Casco de moto abierto|Jethelm|cabeca|PSD|
motoFechado|Capacete de moto fechado|Full-face moto helmet|Casco de moto integral|Integralhelm|cabeca,rosto|PSD|
capaceteObra|Capacete de obra|Hard hat|Casco de obra|Bauhelm|cabeca|P|
capaceteBike|Capacete de bicicleta|Bike helmet|Casco de bicicleta|Fahrradhelm|cabeca|PSD|
capacetePiloto|Capacete de piloto de avião|Pilot helmet|Casco de piloto|Pilotenhelm|cabeca,rosto|PSD|
headset|Headset|Headset|Audífonos con micro|Headset|orelhas|PS|
protetorAuricular|Protetor auricular tático|Tactical ear protection|Protector auditivo táctico|Taktischer Gehörschutz|orelhas|PS|
shemagh|Capuz de guerrilha (shemagh)|Shemagh|Pañuelo shemagh|Shemagh-Tuch|cabeca,pescoco|PS|
chapeuChef|Chapéu de chef|Chef hat|Gorro de chef|Kochmütze|cabeca|P|
pescadorOculos|Chapéu de pescador com óculos|Fisherman hat with goggles|Sombrero de pescador con lentes|Anglerhut mit Brille|cabeca|PSD|
coroaFlores|Coroa de flores|Flower crown|Corona de flores|Blumenkranz|cabeca|PSD|`,
  acessorio: `
aviador|Óculos de sol aviador|Aviator sunglasses|Lentes de aviador|Pilotenbrille|rosto|PS|
escuros|Óculos de sol quadrado|Square sunglasses|Lentes de sol cuadrados|Eckige Sonnenbrille|rosto|PS|
redondos|Óculos de grau redondo|Round glasses|Lentes redondos|Runde Brille|rosto|P|
balistico|Óculos balístico|Ballistic glasses|Lentes balísticos|Ballistische Brille|rosto|PS|
oculosEsqui|Óculos de esqui|Ski goggles|Lentes de esquí|Skibrille|rosto|PS|
mascaraCirurgica|Máscara cirúrgica|Surgical mask|Mascarilla quirúrgica|OP-Maske|rosto|P|
bandanaRosto|Bandana no rosto|Face bandana|Bandana en la cara|Gesichts-Bandana|rosto|PS|
mascaraGas|Máscara de gás|Gas mask|Máscara de gas|Gasmaske|rosto|PSD|
balaclava|Balaclava|Balaclava|Pasamontañas|Sturmhaube|rosto,cabeca|P|
mascaraHoquei|Máscara de hóquei|Hockey mask|Máscara de hockey|Eishockeymaske|rosto|PS|
tapaOlho|Tapa-olho|Eye patch|Parche en el ojo|Augenklappe|rosto|P|
argola|Brinco de argola|Hoop earrings|Aretes de aro|Creolen|orelhas|P|
piercings|Piercings|Piercings|Piercings|Piercings|rosto|P|
corrente|Corrente no pescoço|Neck chain|Cadena al cuello|Halskette|pescoco|P|
dogTag|Plaquinha de identificação (dog tag)|Dog tags|Placas de identificación|Hundemarke|pescoco|P|
cachecol|Cachecol|Scarf|Bufanda|Schal|pescoco|PS|
lencoPescoco|Lenço de pescoço|Neckerchief|Pañuelo al cuello|Halstuch|pescoco|PS|
gravata|Gravata|Tie|Corbata|Krawatte|pescoco|P|
relogio|Relógio|Watch|Reloj|Armbanduhr|pulsoE|PSD|
micangas|Pulseiras|Bracelets|Pulseras|Armbänder|pulsoD|PD|
couro|Pulseira de couro|Leather cuff|Pulsera de cuero|Lederarmband|pulsoD|P|
luvasSemDedos|Luvas sem dedos|Fingerless gloves|Guantes sin dedos|Fingerlose Handschuhe|maos|PS|
luvasTaticas|Luvas táticas|Tactical gloves|Guantes tácticos|Taktische Handschuhe|maos|PS|
luvasTrabalho|Luvas de trabalho|Work gloves|Guantes de trabajo|Arbeitshandschuhe|maos|PS|
mochilaEscolar|Mochila escolar|School backpack|Mochila escolar|Schulrucksack|costas|PSD|
mochilaTrilha|Mochila de trilha|Hiking backpack|Mochila de senderismo|Wanderrucksack|costas|PSD|
bolsaTransversal|Bolsa transversal|Crossbody bag|Bolso cruzado|Umhängetasche|ombro|PS|
pochete|Pochete|Fanny pack|Riñonera|Bauchtasche|cintura|PS|
cinto|Cinto com fivela|Buckle belt|Cinturón con hebilla|Schnallengürtel|cintura|PD|
suspensorios|Suspensórios|Suspenders|Tirantes|Hosenträger|peito|PD|
tatuagens|Tatuagens|Tattoos|Tatuajes|Tattoos|pele|P|`,
  tatico: `
coletePlacas|Colete de placas|Plate carrier|Chaleco portaplacas|Plattenträger|colete|PS|
portaCarregadores|Colete porta-carregadores|Magazine vest|Chaleco portacargadores|Magazinweste|colete|PS|
assaltoPesado|Colete de assalto pesado|Heavy assault vest|Chaleco de asalto pesado|Schwere Sturmweste|colete|PS|
chestRig|Colete leve (chest rig)|Chest rig|Chaleco ligero|Chest-Rig|colete|PS|
coleteImprensa|Colete de imprensa|Press vest|Chaleco de prensa|Presseweste|colete|PD|
coletePolicia|Colete de polícia|Police vest|Chaleco de policía|Polizeiweste|colete|PSD|
cinturao|Cinturão de combate|Battle belt|Cinturón de combate|Kampfgürtel|cintura|PS|
coldre|Coldre de perna|Leg holster|Pistolera de pierna|Beinholster|coxaD|PS|
bolsaPerna|Bolsa de perna|Leg pouch|Bolsa de pierna|Beintasche|coxaE|PS|
primeirosSocorros|Bolsa de primeiros socorros|First-aid pouch|Bolsa de primeros auxilios|Erste-Hilfe-Tasche|cintura|PD|
portaGranadas|Porta-granadas|Grenade pouches|Portagranadas|Granatentaschen|acessorioColete|PS|
radioOmbro|Rádio no ombro|Shoulder radio|Radio en el hombro|Schulterfunkgerät|ombro|PS|
mochilaAssalto|Mochila de assalto|Assault pack|Mochila de asalto|Sturmrucksack|costas|PS|
mochilaRadio|Mochila de rádio|Radio pack|Mochila de radio|Funkrucksack|costas|PS|
hidratacao|Kit de hidratação|Hydration pack|Kit de hidratación|Trinkrucksack|costas|PS|
joelheiras|Joelheiras|Knee pads|Rodilleras|Knieschoner|joelhos|PS|
cotoveleiras|Cotoveleiras|Elbow pads|Coderas|Ellbogenschoner|cotovelos|PS|
ombreiras|Ombreiras blindadas|Armored shoulder pads|Hombreras blindadas|Schulterpanzer|ombros|PS|
protetorPescoco|Protetor de pescoço|Neck guard|Protector de cuello|Halsschutz|pescoco|PS|
protetorVirilha|Protetor de virilha|Groin protector|Protector de ingle|Tiefschutz|cintura|PS|
patches|Patches de velcro|Velcro patches|Parches de velcro|Klett-Patches|acessorioColete|PD|
lanternaOmbro|Lanterna no ombro|Shoulder flashlight|Linterna en el hombro|Schulterlampe|ombro|PS|
canivete|Canivete no colete|Vest knife|Navaja en el chaleco|Westenmesser|acessorioColete|PS|
facaBota|Faca na bota|Boot knife|Cuchillo en la bota|Stiefelmesser|pes|PS|
bandoleira|Bandoleira|Bandolier|Bandolera de balas|Patronengurt|peito|PSD|
ghillie|Poncho camuflado (ghillie)|Ghillie poncho|Poncho ghillie|Ghillie-Poncho|costas,cabeca|PS|
capaTatica|Capa de chuva tática|Tactical rain cape|Capa de lluvia táctica|Taktisches Regencape|costas|P|
rapel|Corda de rapel|Rappel rope|Cuerda de rapel|Abseilseil|cintura|PS|
mapaBussola|Mapa e bússola|Map and compass|Mapa y brújula|Karte und Kompass|antebraco|PS|`,
};

/**
 * Items with a model (procedural or GLB), one list per batch. 'all' = the whole category. Grows with every
 * batch.
 */
const READY_LISTS: Record<string, readonly string[] | { all: Category }> = {
  cabelo: { all: 'cabelo' },
  barba: { all: 'barba' },
  camiseta: { all: 'camiseta' },
  blusa: { all: 'blusa' },
  jaqueta: { all: 'jaqueta' },
  calca: { all: 'calca' },
  short: { all: 'short' },
  calcado: { all: 'calcado' },
  cabeca: [
    'bone', 'boneReto', 'bonePraTras', 'boneTatico', 'gorroLa', 'gorro', 'touca', 'cauboi', 'palha', 'panama', 'fedora', 'bucket', 'boonie', 'boina',
    'bandanaCabeca', 'faixaCabeca', 'capaceteMilitar', 'capaceteTatico', 'capaceteVisao', 'motoAberto', 'motoFechado', 'capaceteObra', 'capaceteBike',
    'capacetePiloto', 'headset', 'protetorAuricular', 'shemagh', 'chapeuChef', 'pescadorOculos', 'coroaFlores',
  ],
  // Face and ear accessories (glasses, masks, earrings, piercings).
  rosto: [
    'aviador', 'escuros', 'redondos', 'balistico', 'oculosEsqui', 'mascaraCirurgica', 'bandanaRosto', 'mascaraGas', 'balaclava', 'mascaraHoquei', 'tapaOlho',
    'argola', 'piercings',
  ],
  // The other accessories (neck, wrists, hands, bags, belts, tattoos).
  acessorio: [
    'relogio',
    'micangas',
    'couro',
    'corrente',
    'dogTag',
    'cachecol',
    'lencoPescoco',
    'gravata',
    'luvasSemDedos',
    'luvasTaticas',
    'luvasTrabalho',
    'mochilaEscolar',
    'mochilaTrilha',
    'bolsaTransversal',
    'pochete',
    'cinto',
    'suspensorios',
    'tatuagens',
  ],
  tatico: { all: 'tatico' },
};

const SLEEVES: Record<string, Sleeve> = { n: 'nenhuma', c: 'curta', l: 'longa' };

function parse(): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const [category, table] of Object.entries(TABLES) as [Category, string][]) {
    for (const line of table.trim().split('\n')) {
      const [id, pt, en, es, de, slots, channels, sleeve] = line.split('|');
      out.push({
        id,
        category,
        slots: category === 'cabelo' || category === 'barba' ? [] : (slots.split(',') as Slot[]),
        channels: channels.split('') as Channel[],
        name: { pt, en, es, de },
        sleeve: sleeve ? SLEEVES[sleeve] : undefined,
        ready: false,
      });
    }
  }
  return out;
}

export const CATALOG: readonly CatalogItem[] = parse();
for (const list of Object.values(READY_LISTS)) {
  for (const it of CATALOG) if ('all' in list ? it.category === list.all : list.includes(it.id)) it.ready = true;
}
const byId = new Map(CATALOG.map((i) => [i.id, i]));

export const catalogItem = (id: string): CatalogItem | undefined => byId.get(id);

/** Items of a category (only the ones with a model, unless `all`). */
export function catalogOf(category: Category, all = false): CatalogItem[] {
  return CATALOG.filter((i) => i.category === category && (all || i.ready));
}

/** Items that go in a slot (as their first slot). */
export function catalogForSlot(slot: Slot, all = false): CatalogItem[] {
  return CATALOG.filter((i) => i.slots[0] === slot && (all || i.ready));
}
