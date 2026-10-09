---
title: Pets
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/pets.ts
  - shared/data/pets.json
  - shared/modes.ts
  - shared/protocol.ts
  - shared/zombies.ts
  - shared/zombieMatch.ts
  - server/accounts.ts
  - server/api.ts
  - server/session.ts
  - server/modes.ts
  - server/migrations/007_pets.sql
  - client/pets/rig.ts
  - client/pets/species.ts
  - client/pets/anim.ts
  - client/pets/follow.ts
  - client/pets/manager.ts
  - client/pets/portrait.ts
  - client/world/dog.ts
  - client/zombies/client.ts
  - client/zombies/view.ts
  - client/zombies/local.ts
  - client/character/animator.ts
  - client/ui/pets.ts
  - client/ui/galpao/petStage.ts
  - client/ui/galpao/petBoard.ts
  - client/ui/galpao/scene.ts
  - client/ui/galpao/galpao.ts
  - client/ui/home.ts
  - client/ui/hud.ts
  - client/core/settings.ts
  - client/audio/sfx.ts
  - client/main.ts
  - server/tests/pets.test.ts
  - client/tests/pets.test.ts
  - client/tests/galpaoRules.test.ts
tags:
  - game
  - gameplay
  - pets
  - zombies
updated: 2026-10-08
---

# Pets

Desde a PF-29, cada conta pode levar **um pet companheiro**. São seis: a **Amora** (a Chow Chow preta da [[Map - Rua dos Vizinhos]]), a **Bruxinha** (versão chibi da bruxa da [[Map - Vila Assombrada]]), uma **gata**, uma **fuinha**, uma **lontra** e uma **iguana**. No [[Zombie]] cada um tem uma **habilidade automática** que ajuda sem matar e sem dar dinheiro; no PvP são só enfeite e podem ser desligados. **Todos são grátis por enquanto**: o catálogo já tem o campo `libera` (`livre` ou `apoio`) para as versões pagas que virão com o pacote de apoio (PF-28). Decisão: [[ADR - Pets companheiros com habilidade no zumbi]].

## Catálogo (`shared/pets.ts`)

| Pet | `id` | Pelagens | Habilidade no zumbi | Porte |
|---|---|---|---|---|
| Amora | `amora` | nenhuma (personagem fixa: nome e pelagem travados, só a coleira muda) | Segura, Amora! | cachorro |
| Bruxinha | `bruxinha` | robe roxo (o do mapa), verde-musgo ou vinho | Feitiço do Pato | pequeno (voa) |
| Gata | `gato` | cinza rajada, laranja ou preta | Sétima Vida | pequeno |
| Fuinha | `fuinha` | marrom, canela ou branca | Mão na Massa | pequeno |
| Lontra | `lontra` | marrom, chocolate ou caramelo | Pedrada | pequeno |
| Iguana | `iguana` | verde, laranja ou turquesa | Rabo de Isca | pequeno |

- **Coleira:** 8 cores (vermelha, azul, verde, amarela, rosa, roxa, laranja, branca), para qualquer pet.
- **Nome:** opcional, até 12 caracteres (letras, números, espaço e `_ . ' -`), **visível só para o dono** (nunca vai para os outros jogadores: não precisa de moderação). Vazio = o nome do catálogo. A Amora não muda de nome.
- **Cada pet guarda o seu nome, pelagem e coleira**; trocar de pet não perde a personalização do anterior.
- **Sem pet:** conta nova começa sem pet; "Deixar no quintal" volta a sem pet.
- **Interruptores:** **Junto no PvP** (enfeite) e **Junto no zumbi** (habilidade), por conta.
- Acessórios (chapéu, laço, bandana) ficam para as versões pagas.

## No modo zumbi (PvE)

Cada pet age **sozinho**, sem tecla, quando a habilidade está pronta e há o que fazer, e depois espera a recarga. **Sem dano, sem dinheiro, sem estatística.** O pet é **invulnerável e os zumbis o ignoram** (ele nem existe no motor: só o efeito). Números em `shared/data/pets.json` (`PET_ABILITIES`), fáceis de ajustar:

| Pet | Habilidade | Quando | Efeito | Recarga |
|---|---|---|---|---|
| Amora | **Segura, Amora!** | um zumbi a até 7 m do dono, **sem o muro no meio** (ou por um vão aberto) | late, morde a canela do mais perto e o **segura 3 s** (não anda nem começa golpe; o que já começou termina). No Segurança e nos chefes, só um **tranco** de 0,6 s | 18 s |
| Bruxinha | **Feitiço do Pato** | um zumbi a até 10 m (variante antes de comum; **chefes imunes**) | prende o zumbi numa **boia de patinho por 4 s**: parado, cancela o que preparava e **continua levando tiro** (a boia fica na barriga, acima da virilha: o tiro no pássaro vale como sempre) | 25 s |
| Gata | **Sétima Vida** | o dono cai | 2 s depois começa a levantá-lo; em **6 s** ele volta com 50% da vida (um colega leva 3 s). **2 vezes por partida.** Se um colega começa a reanimar, a gata **cede a vez** (pausa) e continua se ele soltar; ela **nunca entra nas reanimações** (`reviving`/`revives`): o colega continua vendo o aviso de reanimar | cargas |
| Fuinha | **Mão na Massa** | uma barricada já erguida e danificada a até 6 m do dono | prega **1 tábua a cada 2,5 s** (o jogador: 0,8 s), até 2 por vez, na mais danificada; nunca ergue barricada (isso é pago); espera o vão ficar livre como o jogador | 15 s |
| Lontra | **Pedrada** | a Tia da Fofoca preparando o cuspe ou o Tio do Churrasco inchando a até 9 m | a pedra **cancela o golpe** e deixa o zumbi **tonto 1,5 s** (a Tia recomeça a espera do próximo cuspe; o Tio "murcha") | 12 s |
| Iguana | **Rabo de Isca** | um golpe de zumbi deixa o dono com **35% da vida ou menos** | solta o rabo onde o dono está; os zumbis a até 8 m (**não os chefes**) vão atrás do rabo por 5 s, sem atacar | 40 s |

- **Ninguém de pé (inclui o solo):** caído **com a gata vindo** não é derrota; a partida espera (os zumbis ignoram quem está caído). No **solo** o estado "caído" só existe para quem leva a gata: sem cargas, cair sozinho é perder, como antes.
- Partida nova: tudo pronto de novo e a gata com as 2 cargas.

### Como aparece (todos veem e ouvem)

Assinatura comum, sem cores ou formas reservadas aos avisos do modo (nada de anéis ou faixas no chão, disco ou feixe verde, cruz vermelha, caveira em disco vermelho, estrelas):

- **Pata na cor da coleira** sobre o alvo por até 1,5 s.
- O pet **corre até o alvo** e faz o gesto: a Amora morde a canela com o corpo para fora do zumbi (o zumbi olha para baixo e se debate); a Bruxinha voa perto e **sobe a 2,4 m** para lançar o feitiço (por cima da grade, se o zumbi estiver do lado de fora) (a boia amarela com cabeça de pato aparece na barriga; só a boia balança, a cabeça do zumbi fica parada; um **quá** baixo na captura e a cada ~1,5 s); a lontra fica de pé e joga a pedra, que voa em arco até a cabeça, e uma **espiral** gira sobre o zumbi tonto (o Tio murcha com um **"pfff"** escrito e ar saindo); a fuinha vai até a barricada e martela (**martelada aguda**, três por gesto); a iguana larga um **rabo colorido** que se remexe no chão (o dela volta a crescer); a gata vai para **0,9 m à frente do dono caído, de frente para ele**, e o empurra: quem está caído a vê na própria câmera baixa (ela não fica apagada ali).
- **Som curto, abaixo dos avisos do modo**, no máximo **um latido ou miado a cada 2 s** por cliente.
- **Para o dono:** o ícone do pet no HUD pisca com um texto curto **em branco** (a cor da coleira fica só no anel: um roxo some à noite e um vermelho parece alerta) por 1,5 s — no celular, uma palavra ao lado do rosto por ~1,2 s e o anel pulsando — ("Segurou!", "Pato!", "Pedrada!", "Tábua!", "Rabo!", "Levantando…", "De pé!") e, caído com a gata, a tela diz **"A gata está te levantando · Ns"** (com nome: "{nome} está te levantando · Ns"). Os colegas veem uma **pata sobre a cruz vermelha** de quem a gata está levantando. Ver [[HUD]].

## No PvP (enfeite)

Mata-mata, corrida armada, contra bots e campo de tiro (`MODE_RULES[m].pets = 'cosmetic'`; sem modo = PvP):

- **Coleira curta:** no máximo **0,7 m da borda do corpo do dono**, sempre atrás e do mesmo lado (sem corridinhas de um lado para o outro).
- **Sem som nenhum**, sem passos audíveis.
- **Some quando o dono não está à vista** da câmera (um raio da câmera até o peito ou a cabeça do dono, ~10 vezes por segundo). O próprio pet sempre aparece.
- A Bruxinha voa baixo (vassoura a ~0,25 m do chão).
- **Entra na dança da Opressão** quando o dono dança.
- **Esconder pets dos outros** ([[Settings]], subaba Vídeo, salvo no aparelho): no PvP, os pets dos outros não são desenhados (o seu continua). No zumbi não vale: os pets fazem parte da leitura das habilidades.

## Onde o pet anda (`client/pets/follow.ts`)

Nada da posição do pet trafega: cada jogo desenha cada pet a partir da posição do dono, que já é replicada.

- **Zumbi:** segue o **caminho do dono** (migalhas a cada 0,25 m) ~1,2 m atrás e ~0,8 m ao lado, **fora do cone de 60° à frente do dono a menos de 3 m** (onde ele mira). Indo agir e voltando, **nunca corta esse cone**: dentro dele, sai primeiro para o lado; um caminho que o cruzaria passa por um ponto ao lado e à frente (2,6 m à frente, 1,75 m ao lado), fora do cone, e só então segue (`routeAround`); um alvo dentro do próprio cone (um zumbi bem na frente) é ido direto. O seu pet fica **semitransparente a menos de 1 m da câmera e nos 30° do meio da sua visão a menos de 3 m** (agindo e voltando também; a gata levantando você, não).
- **PvP:** a coleira curta acima.
- Longe da câmera (mais de 14 m) usa a versão leve do modelo.

## Escolher e personalizar

- **Galpão — estação 07 · PETS** (a porta da frente com quintal): ver [[Menus]]. Os pets "moram lá fora": um por vez entra pela porta. **Escolher não é equipar**: clicar num gancho (no celular e no retrato, num rosto da fileira no topo da ficha) chama o pet ao capacho; só **"Levar este"** troca o que vai junto.
- **Home clássica — aba Pets** (`#tab-pets`): lista com o retrato 2D de cada pet, o retrato grande e a mesma ficha (`client/ui/pets.ts`).
- A ficha: espécie e nome, Levar este / Vai com você + Deixar no quintal (ou APOIO bloqueado, sem uso agora), a habilidade com os números, nome, pelagem (ou robe), coleira e os dois interruptores. Cada mudança salva na conta (`PATCH /api/perfil {pet}`) e aparece na hora; se o servidor recusar, volta e avisa "Não foi possível salvar o pet".

## Modelos (`client/pets/`)

- Feitos em código, facetados como a Amora, com cor por vértice; **pets pretos com brilho nos olhos e pingente da coleira, nunca preto puro**. Um esqueleto pequeno com **pesos rígidos** (cada peça segue um osso): **uma chamada de desenho por pet** (`rig.ts`).
- **Até 2 mil triângulos** e versão leve para longe: Amora 1.960 / 644, Bruxinha 1.168 / 332, Gata 1.204–1.248 / 260, Fuinha 830 / 240, Lontra 890 / 240, Iguana 906 / 290 (a leve fica entre 21% e 33%). Dez jogadores com o pet mais pesado ficam abaixo de 20 mil triângulos.
- A **Amora pet usa o mesmo construtor da Amora do mapa** (`chowParts` em `client/world/dog.ts`) com a opção `pet`: em pé, com pernas próprias, cabeça 12% e olhos 15% maiores, menos triângulos. A Amora do mapa não muda (a mesma geometria, conferida) e o pet não herda o colisor sólido nem o alvo de tiro dela.
- A **Bruxinha** é a mini da bruxa do mapa: robe `0x3a2a48`, pele `0x7aa040`, chapéu `0x1a1420` com faixa `0x6a3a8a`, nariz adunco, verruga, olhos desiguais, cabeça com 40–45% da altura, numa vassoura.
- Material: no galpão o do personagem (padrão facetado, rugoso); na partida o toon do mapa. Pets **sem colisão de tiro** (nem colisor nem hitbox).
- Animação em código (`anim.ts`): trote em pares diagonais, sentar (a gata senta fundo, sobre ancas largas ao lado das patas da frente e com o rabo no chão, para não parecer em pé de pernas retas), respirar, abanar, olhar; a iguana rasteja e rebola e, "sentada", ergue o peito nas patas da frente (no capacho, de perfil, ela ainda balança a cabeça a cada ~2,6 s, como as iguanas); a Bruxinha flutua e se inclina; o cachorro na mesa fica em pé atrás dela só com a cabeça e as patas por cima do tampo (o queixo ~0,14 m acima). Gestos da estação: Amora puxa um brinquedo de corda, Bruxinha joga uma poção e surge um patinho, Gata se espreguiça e levanta, Lontra faz malabarismo com pedras, Fuinha dá 3 marteladas, Iguana mexe o rabo.

## Dados e rede

- `player_profile.pet jsonb` (migration `007_pets.sql`; nula = sem pet): `{ id, pvp, pve, cfg: { <pet>: { nome?, cor?, coleira? } } }`, conferido por `sanitizePet` na leitura e na escrita, como a aparência. Ver [[Player Data]] e [[Database]].
- `PATCH /api/perfil {pet}` ([[APIs]]); `GET /api/perfil` devolve `pet`.
- `PlayerInfo.pet = { id, cor, coleira, pvp, pve }` só em `joined`/`playerJoined` e **só se o pet vai junto no modo da sessão**; **nunca o nome**. Evento `zpet` e bits `ZF.held`/`ZF.duck` no `zsnap`. Ver [[Remote Calls]].
- O motor da partida zumbi decide as habilidades: o servidor online (`ZombieMode` repassa o pet no `join`), o navegador no solo. Um pet escolhido vale a partir da próxima conexão.

## Código relacionado

- `shared/pets.ts` (catálogo, `sanitizePet`, `playerPet`, `petAlong`, `PET_ABILITIES`, `petProblems`), `shared/data/pets.json`.
- `shared/zombieMatch.ts` (`join(id, name, pet)`, `tickPets`, `petHold`, `petDuck`, `petStone`, `petTail`, `tickCat`, `tickWeasel`, `petCanLift`, `zHurt`), `shared/zombies.ts` (`ZF.held`, `ZF.duck`).
- `server/accounts.ts` (`setPet`), `server/api.ts`, `server/session.ts` (`playerInfo`), `server/modes.ts` (`ZombieMode.petOf`, `health`).
- `client/pets/` (`rig.ts`, `species.ts`, `anim.ts`, `follow.ts`, `manager.ts`, `portrait.ts`), `client/zombies/client.ts` (HUD do dono, pata sobre a cruz), `client/zombies/view.ts` (boia, quá), `client/zombies/local.ts` (solo com a gata), `client/character/animator.ts` (`ZombiePose.stuck`).
- `client/ui/pets.ts` (ficha e aba clássica), `client/ui/galpao/petStage.ts`, `petBoard.ts`, `scene.ts`, `galpao.ts`, `client/ui/home.ts`.

## Testes

- `server/tests/pets.test.ts`: catálogo e `sanitizePet`; quem vê o quê e em que modo; cada habilidade no motor com relógio falso (incluindo a Amora sem atravessar o muro, a Sétima Vida cedendo ao colega e fora das reanimações, e o solo com a gata); PATCH, `PlayerInfo.pet` por modo e interruptor (nunca o nome) e a Amora agindo numa partida zumbi no servidor de verdade.
- `client/tests/pets.test.ts`: triângulos de cada pet e pelagem (e da versão leve), a Amora pelo construtor do mapa, os gestos, a coleira curta do PvP, o caminho e o cone do zumbi, a volta em torno da mira do dono ao agir e voltar, e o meio da visão onde o pet fica apagado.
- `client/tests/galpaoRules.test.ts`: ordem das estações, `petSpot` e `flightDuration`.

## Limites e próximos passos

- Equilíbrio nunca testado com jogadores reais (e somado às vantagens da PF-19): os números estão em `pets.json`.
- Versões pagas, acessórios e o pacote de apoio: PF-28.
- O pet atravessa paredes ao seguir (sem física); ele anda pelo caminho do dono, então isso quase não aparece.
- Espanhol e alemão dos textos: PF-30 (quem entrar depois na main completa).
