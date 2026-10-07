---
title: SFX
type: system
status: documented
area: audio
source_paths:
  - client/audio/sfx.ts
  - client/main.ts
  - client/ai/bots.ts
  - client/world/blockoutMap.ts
  - client/world/dragonGarden.ts
  - client/world/hauntedTown.ts
  - client/world/jardim/santuario.ts
  - client/world/jardim/lanternas.ts
  - client/world/jardim/lago.ts
  - client/world/dog.ts
  - client/world/hydrant.ts
  - client/net/remote.ts
  - client/zombies/view.ts
  - client/zombies/coffin.ts
  - client/zombies/client.ts
  - client/zombies/barricades.ts
tags:
  - game
  - audio
  - sfx
updated: 2026-10-06
---

# SFX

Catálogo dos efeitos sonoros do jogo. **Todos são procedurais** (métodos da classe `Sfx` em `client/audio/sfx.ts`), gerados por combinações de três primitivas internas:

- `noiseBurst` — ruído branco filtrado (passa-alta, passa-baixa ou passa-banda) com envelope rápido;
- `tone` — oscilador (seno, triângulo, quadrada, dente de serra) com glissando exponencial;
- osciladores e LFOs montados à mão nos sons mais elaborados (sinos, gongo, fantasma, buzina).

O comentário do arquivo diz que cada função "mapeia para uma futura entrada de banco de samples" (`rifle_fire`, `dry_fire`, `rifle_reload`...): os sons são **placeholders de protótipo** que poderiam ser trocados por amostras sem mudar quem os chama. Ver [[ADR - Áudio procedural em Web Audio]].

> [!info]
> Nenhum método de `Sfx` está sem uso: todos são chamados por `main.ts`, bots ou mapas (verificado por grep em `client/`).

## Famílias de sons

### Armas e combate (jogador)

| Método | Som | Disparado por |
| --- | --- | --- |
| `gunshot(volume, voz)` | 3 camadas: estalo (ruído passa-alta), corpo (ruído passa-baixa + seno 150→45 Hz) e cauda (passa-banda). ±5% de altura aleatória. Cada arma tem uma voz (`GunVoice`): `rifle` (estampido cheio), `pistola` (mais aguda e curta), `smg` (estalo leve e rápido) e `silenciado` (um "pff" abafado, para o silenciador). | Tiro do jogador (na cabeça); tiros de outros e de bots via `at(muzzle, 'gun')`. Um tiro silenciado de outro jogador toca como `step` (ouvido até ~34 m) e não desenha traçante. |
| `weaponSwitch()` | Pano e um clique metálico. | Troca entre primária e secundária. Ver [[Weapons]]. |
| `dryFire()` | Clique seco. | Gatilho sem munição. |
| `reload(duração, vazio)` | Linha do tempo: pente sai (20%), pente entra (55%) e, se vazio, ferrolho (80% e 86%). | Início da recarga; recargas de outros via [[Spatial Audio]] (`BodySounds`). |
| `hitmarker(cabeça)` | Bip agudo (mais agudo e com segundo tom no tiro na cabeça/virilha). Barramento `ui`. | Acerto confirmado. |
| `killDing()` | Acorde em seno (dó-sol-dó). Barramento `ui`. | Abate. |
| `boing()` | "Boing" cartunesco com LFO. | Abate (junto com o ding e confete). |
| `hurt()` | Dente de serra descendente + ruído. | Dano recebido. |
| `sadTrombone()` | Trombone triste (4 notas descendentes). | Morte do próprio jogador. Ver [[Flow - Death and Respawn]]. |
| `bird()` | Dois piados e apito descendente ("NO PÁSSARO!"). | Tiro na virilha. Ver [[Humiliation]]. |
| `knifeSwing()` / `meleeSwing(faca)` / `knifeHit()` | Assobio de lâmina; cada faca tem seu som (`faca` = `knifeSwing`, `colher` = toque oco de madeira, `frango` = guincho de borracha, `baguete` = crocante, `peixe` = tapa molhado, `macarrao` = `boing()`, `sabre` = "vuuum"); impacto. | [[Melee]]. O golpe de outro jogador toca o som da faca dele: a faca de cozinha como `step`, as outras como `normal` (ouvidas mais longe). |
| `levelUp()` | Fanfarra curta. | Novo nível de arma/conta. Ver [[Progression]]. |
| `airHorn()` + `applause()` | Buzina de estádio e aplausos (ruído granulado). | Fim de uma humilhação ("OPRIMIDO!"). |

### Granadas e minas

| Método | Som |
| --- | --- |
| `pinPull()` | Ping metálico do pino + estalo da alavanca. |
| `fuseBeep(urgência)` | Um bip por segundo de pavio enquanto se "cozinha" a granada, mais agudo conforme acaba. |
| `grenadeThrow()` | Arremesso (também tocado para o arremesso de outros, tipo `step`). |
| `grenadeBounce(força)` | Quique, proporcional à velocidade do impacto. |
| `explosion()` | Sub grave, estalo e cauda de estrondo; sempre via `at(centro, 'boom')`. |
| `minePlant()` | Clack metálico e bip. Ver [[Land Mines]]. |
| `quack()` | Pato de borracha: substitui o quique da granada quando o jogador está sob a poção "granadas de pato". Ver [[Buffs & Debuffs]]. |

### Corpo e movimento

| Método | Som |
| --- | --- |
| `footstep(material, força)` | Ruído passa-baixa com frequência por material (grama 350 Hz, concreto 700, madeira 450, metal 1400, vidro 1200, azulejo 900, papel 500) + batida grave. |
| `land(forte)` | Aterrissagem; "forte" acima de 2,5 m de queda (jogador) ou 0,9 s no ar (outros). |
| `slide(material)` | Raspado de cascalho que esmaece com o deslize. |
| `impact(material)` | Impacto de bala por material (metal tem ressonância extra). |
| `splash()` | Splash na água. |

### Coletáveis, bônus e criaturas

`cherry()` (mordida + brilho: Cereja do Dragão), `cherryEnd()` (fim do bônus), `fruitSplat()` (cereja derrubada), `scoobySnack()` (biscoito Scooby), `potionGulp()` (poção da bruxa), `humanity()` (humanidade ganha ao matar o rato), `bark()` / `bite()` (cachorra Amora), `ratSqueak()` / `ratHit()` / `ratDeath()` (rato gigante). Ver [[Pickups]], [[Buffs & Debuffs]] e [[Map Gags]].

### Props e piadas de mapa

| Mapa | Sons |
| --- | --- |
| [[Map - Rua dos Vizinhos]] | `iceCream()` (caminhão de sorvete, no máx. 1 a cada 4 s), `squeak()` (flamingos), `bark()` (casinha do cachorro), `hiss()` (hidrante estourado, contínuo). |
| [[Map - Jardim do Dragão]] | `gong()`, `bell(tamanho, nota)` (sinos e carrilhão de cinco notas), `drum(tamanho)` (tambores), `roar()` (fonte do dragão), `lanternTap()` (lanterna de papel baleada). |
| [[Map - Vila Assombrada]] | `churchBell(altura)`, `carHorn(segundos)` (cresce se alguém insiste), `clockChime(n)` (relógio de pêndulo), `evilLaugh()` (bruxa e abóbora gigante), `grumble()` (resmungos), `ghostMoan()`, `cauldronBubble()`, `cabinetCreak()`, `pumpkinSmash()`, `bulbPop()`, `strawThud()` (espantalho), `targetDing()` e `carnivalJingle()` (barraca de tiro ao alvo). |

### Modo zumbi

Todos via `at(...)` no lugar do zumbi, do chefe, do caixão ou da barricada, exceto os do próprio jogador. Ver [[Zombie]].

| Método | Som | Quando |
| --- | --- | --- |
| `zombieGroan(altura)` | vogal grave e trêmula num filtro de garganta ("uuuurgh") | a cada 3–9 s, só os **6 zumbis mais próximos** do ouvinte (senão vira uma parede de barulho); altura por tipo (chefes e o segurança mais graves, o maratonista e a tia mais agudos) |
| `zombieRise()` | terra rachando e um suspiro | um zumbi vai sair do chão (no anúncio `zfx 'rise'`, 0,9 s antes, junto com um `zombieGroan` na categoria `loud`, que se ouve longe) e de novo quando ele aparece |
| `zombieDeath(altura)` | gorgolejo e baque molhado | zumbi morreu |
| `zombieSpit()` / `zombieSplat()` | escarro e assobio / "splat" | a Tia da Fofoca cospe / o cuspe cai |
| `bloaterPop()` | a explosão + um peido longo | o Tio do Churrasco estoura |
| `bossRoar(altura)` | três rosnados desafinados sobre um sub | um chefe surge; a investida do Prefeito |
| `bossWindup()` | grunhido subindo e rangido | o Coveiro ergue a pá; o Prefeito ergue os punhos |
| `bossScream()` | lamento agudo que oscila e cai | o grito da Noiva |
| `bossSummon()` | cântico oco sobre pá cavando | o Coveiro chama os mortos |
| `bossBlink()` | "whoosh" invertido com brilho | a Noiva some e reaparece |
| `coffinOpen()` / `coffinTick()` / `coffinReveal(nível)` | tampa rangendo + caixinha de música / um clique por arma que passa / acorde (maior numa épica, com aplausos numa lendária) | o Caixão Misterioso gira e para |
| `coffinBroken()` | estalo, um trítono escorregando para baixo e um zumbido grave (um "ta-da" murcho) | o caixão para numa arma **danificada** |
| `barricadeBuild()` | três passadas de serrote e uma sequência de marteladas | uma barricada é erguida |
| `boardNail()` | duas marteladas na madeira | uma tábua é pregada |
| `boardHit()` | baque surdo e rangido | um golpe da horda nas tábuas |
| `boardBreak(última)` | madeira estalando (com estrondo quando é a última, categoria `loud`) | uma tábua cai / a barricada é arrombada |
| `waveStart(chefe)` | o `churchBell` três vezes (mais grave numa onda de chefe) | começa uma onda |
| `waveEnd()` | acorde de órgão | onda vencida |
| `cashRegister()` | "ka-ching" (barramento `ui`) | dinheiro ganho |
| `heartbeat()` | batimento lento | caído, a cada 1,1 s |
| `reviveDone()` | arpejo subindo | reanimado |

### Interface

- `ui()` — bip curto no barramento `ui`; toca ao clicar JOGAR e ao fechar o menu de pausa com Esc. Ver [[Menus]].

## Regras gerais

- Todas as funções retornam imediatamente se o `AudioContext` não estiver rodando (antes do primeiro clique).
- Um som chamado dentro de `sfx.at(...)` é roteado para a cadeia espacial em vez do barramento (`out()` usa `this.route`). Assim o mesmo método serve para som "na cabeça" e som posicionado.
- Sons de interface (`hitmarker`, `killDing`, `ui`) usam o barramento `ui`; o resto usa `sfx`. Os dois barramentos não têm controles de volume separados nas configurações (só o master).

## Código relacionado

- `client/audio/sfx.ts` — todos os métodos listados.
- `client/main.ts` — chamadas do jogador local e de eventos de rede.
- `client/ai/bots.ts` — tiros, impactos e facadas dos bots (via `at`).
- `client/world/*.ts`, `client/world/jardim/*.ts` — sons de props e ambiente.
- `client/zombies/view.ts`, `client/zombies/coffin.ts`, `client/zombies/client.ts` — sons do modo zumbi.

## Ver também

[[Audio Events]] · [[Spatial Audio]] · [[Ambient Audio]] · [[Music]] · [[Audio Overview]]
