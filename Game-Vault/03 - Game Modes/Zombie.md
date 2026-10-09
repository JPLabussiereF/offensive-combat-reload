---
title: Zombie
type: mode
status: documented
area: game-modes
source_paths:
  - server/maps.ts
  - shared/data/zumbi.json
  - shared/zombies.ts
  - shared/zombieMatch.ts
  - shared/barricades.ts
  - shared/modes.ts
  - shared/maps.ts
  - shared/arsenal.ts
  - shared/protocol.ts
  - shared/data/navmesh/cemiterio.json
  - server/modes.ts
  - server/session.ts
  - server/navmesh.ts
  - server/app.ts
  - tools/bake-navmesh.ts
  - shared/data/mapas/cemiterio.json
  - client/zombies/client.ts
  - client/zombies/view.ts
  - client/zombies/coffin.ts
  - client/zombies/barricades.ts
  - client/zombies/looks.ts
  - client/zombies/local.ts
  - client/zombies/link.ts
  - client/zombies/ambience.ts
  - client/zombies/spectate.ts
  - client/zombies/crows.ts
  - shared/trees.ts
  - shared/altar.ts
  - shared/seeded.ts
  - client/ai/navmesh.ts
  - client/character/animator.ts
  - client/entities/rig.ts
  - client/main.ts
  - client/ui/home.ts
  - client/ui/hud.ts
  - client/ui/scoreboard.ts
  - client/audio/sfx.ts
  - server/tests/zombies.test.ts
  - server/tests/zombieBarricades.test.ts
  - server/tests/progression-modes.test.ts
  - client/tests/offlineModes.test.ts
  - shared/pets.ts
  - shared/data/pets.json
  - client/pets/manager.ts
  - server/tests/pets.test.ts
tags:
  - game
  - modes
  - online
  - coop
  - zombies
updated: 2026-10-09
---

# Zombie

**Zumbi** (`'zumbi'` em [[Shared Systems|shared/modes.ts]]): sobrevivência **cooperativa em ondas** no [[Map - Cemitério da Capela]], um mapa **só deste modo**. A vizinhança morreu e voltou: os zumbis sobem das covas do campo do lado de fora do muro do cemitério e só entram pelas **cinco brechas** dele, que o time pode **barricar** para mandar a horda para onde quer. Cada zumbi morto dá **XP de conta** a quem matou (só online, decidido pelo servidor) e **dinheiro da partida**, gasto no **Caixão Misterioso** (armas aleatórias, que às vezes vêm **danificadas**) e em **barricadas**. Todo mundo começa só com a mesma **Pistola do Porteiro** sem melhorias: **comprar armas é a progressão do modo** (o Rifle Padrão sai do caixão). São **12 ondas** e **3 chefes**; sobreviver à última vence.

> As regras globais (movimento, tiro, hitboxes, coletáveis) são as de [[Game Rules]], [[Combat]] e [[Damage System]]. Esta nota registra o que difere. Decisões: [[ADR - Modo zumbi cooperativo com caixão e raridades]] (design original), [[ADR - Mapa exclusivo e barricadas no modo zumbi]] (mapa e barricadas), [[ADR - Caixão fixo com armas danificadas]] (o caixão, no lugar do pato), [[ADR - Zumbis simulados no servidor sobre navmesh pré-gerada]] e [[ADR - Barricadas como polígonos próprios na navmesh]] (arquitetura).

## Ambientação

- **Onde:** só em mapas feitos para o modo (`MODE_RULES.zumbi.ownMaps`; o oficial é o Cemitério da Capela, ou uma cópia dele na comunidade), e o cemitério só neste modo (`exclusivo: 'zumbi'` nos dados: fora das salas, dos seletores e do campo de tiro dos outros modos; `modeAllowsMap`). Pátio murado de 40 × 36 m em volta de uma capela num pedestal, campo de covas antigas fora do muro, sebe e mata seca em volta. Feito para **ler a horda**: muro de pedra baixa (0,6 m) com grades até 2,4 m (vê-se e atira-se através), covas baixas, lanternas em cada brecha.
- **Clima** (o próprio mapa e `client/zombies/ambience.ts`): noite de lua, **névoa verde `#2c3a30` afastada (18–85 m)** para as brechas e o campo continuarem visíveis de qualquer ponto do pátio; numa **onda de chefe** a névoa vai ficando vermelho-sangue.
- **Som** ([[SFX]], Web Audio procedural): o **sino da capela** toca três vezes a cada onda (mais grave numa onda de chefe), um acorde de órgão quando ela acaba, gemidos dos 6 zumbis mais próximos, **terra rachando e um gemido alto no ponto onde um zumbi vai sair** (3D), o "ka-ching" da caixa registradora a cada dinheiro, a caixinha de música do caixão e um **acorde azedo** quando sai arma danificada, **serrote e martelo** ao erguer barricada, martelada a cada tábua, pancadas e madeira estalando quando a horda bate, rugidos e telegrafias dos chefes, batimento cardíaco quando você está caído.
- **Os zumbis são os vizinhos** (`client/zombies/looks.ts`), montados com o mesmo sistema de personagens dos jogadores ([[Character Customization]]): pele verde-acinzentada, olhos amarelos ou vermelhos e caídos, cicatrizes, roupas do catálogo. O vizinho de pijama, o turista de camisa havaiana, o mecânico **sem um braço** (modo PCD: sem braço e sem a hitbox dele), o executivo de gravata, a roqueira, a vovó de cardigã. Os chefes ganham adereços próprios: a pá do Coveiro, o véu da Noiva, a faixa de prefeito.

## Objetivo

Sobreviver às 12 ondas com o time, matando todos os zumbis de cada uma, e derrotar os chefes das ondas 4, 8 e 12.

## Condição de vitória

Matar todos os zumbis da **onda 12** (o Prefeito e a escolta dele). Todos na partida ganham **+250 XP de conta** (`xp.vitoria`) e veem o resumo ("SOBREVIVERAM À HORDA!").

## Condição de derrota

Durante uma onda, **ninguém de pé**: todos caídos ou mortos. Sozinho, cair é perder (não há quem reanime), **a não ser que a gata esteja vindo** (Sétima Vida, ver Pets abaixo): caído com carga da gata não conta como derrota. O resumo diz "A HORDA VENCEU".

## Times

Um só time: todos os jogadores da sessão contra os zumbis. **Não há fogo amigo** (`combatOpen()` sempre falso: tiros, facadas e granadas de um jogador não ferem outro; a própria granada ainda fere você). Não se oprime corpo de colega e as estatísticas de abates/mortes da conta não mudam ([[ADR - Modo zumbi cooperativo com caixão e raridades]]).

## Regras

### O que todo mundo carrega

| Item | No modo zumbi |
|---|---|
| Primária | **Pistola do Porteiro sem melhorias** (`pistolaInicial`, raridade inicial ×1), a mesma para todos, na mão da primária; o rifle vem do caixão. As armas (rifle, secundária, faca) e as melhorias do Arsenal da conta **não valem** aqui (`startItems`, `zombieLoadout`) |
| Secundária | vazia até sair uma do caixão |
| Faca | a faca de cozinha (golpe rápido `F`/`V`): **120 de dano** contra zumbis (mata um zumbi da onda 1, depois só ajuda); o Sabre de Luz do caixão multiplica pela raridade |
| Granadas | 2 granadas de fragmentação básicas (sem mina nem Dose Dupla), **devolvidas só no intervalo** entre ondas (não recarregam com o tempo). Contra zumbis o dano cresce 25% por onda (`armas.granadaPorOnda`) |
| Munição | reserva **×3** (`armas.municaoReserva`), cheia de novo em todo intervalo (uma arma danificada por munição tem menos: ver o caixão) |

### As ondas (`ondas` em `shared/data/zumbi.json`)

Zumbis por onda para 1 jogador; com mais gente, × (1 + 0,6 × (jogadores − 1)) (4 jogadores: ×2,8). No máximo `min(24, 8 + 4 × jogadores + ⌊onda/2⌋)` andando (ou anunciados) ao mesmo tempo; os outros esperam a vez.

| Onda | Zumbis (1 / 4 jog.) | Vida do comum | Surge a cada | Comuns correndo | Variantes (chance) | Chefe |
|---|---|---|---|---|---|---|
| 1 | 8 / 22 | 100 | 2,2 s | 0% | — | |
| 2 | 12 / 34 | 118 | 2,0 s | 0% | — | |
| 3 | 16 / 45 | 139 | 1,8 s | 15% | Maratonista 10% | |
| 4 | 10 / 28 | 164 | 1,8 s | 20% | Maratonista 15% | **O Coveiro** |
| 5 | 22 / 62 | 194 | 1,5 s | 30% | Maratonista 15%, Tio do Churrasco 8% | |
| 6 | 26 / 73 | 229 | 1,4 s | 40% | + Segurança 6% | |
| 7 | 30 / 84 | 270 | 1,2 s | 50% | + Tia da Fofoca 8% | |
| 8 | 14 / 39 | 319 | 1,2 s | 50% | Maratonista 20%, Tia 12% | **A Noiva** |
| 9 | 34 / 95 | 376 | 1,0 s | 60% | todas (10–18%) | |
| 10 | 38 / 106 | 444 | 0,9 s | 70% | todas (12–20%) | |
| 11 | 42 / 118 | 524 | 0,8 s | 75% | todas (12–22%) | |
| 12 | 18 / 50 | 618 | 0,8 s | 80% | todas (12–25%) | **O Prefeito** |

- A vida cresce ~18% por onda e o golpe dos zumbis 4% por onda (`danoPorOnda`: 25 na onda 1, 36 na 12). A dificuldade também vem de **mais corredores, mais variantes e menos tempo entre eles**.
- **Contagem regressiva** de 15 s antes da onda 1 (`inicioSegundos`: hora de achar o caixão e decidir o que barricar), **intervalo** de 20 s (25 s depois de chefe) entre ondas. No intervalo a munição e as granadas enchem, quem estava caído levanta e quem morreu volta.
- Uma onda acaba quando os zumbis dela (os do chefe e os anunciados inclusive) morreram todos.

### De onde vem a horda

- Os zumbis **sobem só no campo de covas fora do muro** (24 pontos, `zumbi.surgir` em `shared/data/mapas/cemiterio.json`), nos 6 mais próximos de alguém que estão a pelo menos 14 m de todo jogador de pé (a altura conta dobrado). Nunca dentro do muro (`zombieProblems` confere os dados; o motor confere o ponto sorteado).
- **Telegrafia** (`zfx 'rise'`): **0,9 s antes** de cada zumbi aparecer, o ponto se acende — disco verde no chão, **duas mãos saindo da terra**, um **feixe de luz verde** de 3,2 m que se vê por cima do muro, terra rachando e um **gemido alto** (3D). Depois o zumbi sai do chão (1,2 s; já pode levar tiro).
- Eles entram **só pelas brechas** do muro, pela aberta mais curta até o alvo (ver Barricadas).
- **Setas no HUD**: em volta da mira, uma seta para cada brecha com zumbis chegando (até 10 m fora dela), verde/laranja/vermelha por quantos (1–2 / 3–5 / 6+), com o número, ou o símbolo de tábuas se a brecha está barricada.
- Zumbi parado por 8 s longe do alvo (e que não está batendo em tábuas) volta a sair do chão num ponto de surgimento (destrava).

### Tipos de zumbi (`tipos`)

| Tipo (no jogo) | id | Visual | Vida | Velocidade | Ataque | Comportamento | Nas tábuas | $ / XP | Desde |
|---|---|---|---|---|---|---|---|---|---|
| Zumbi | `comum` | os vizinhos (6 visuais) | ×1 | anda 1,4–1,9 m/s; corre 3,2–3,8 | arranhão 25 (alcance 1,3 m, preparo 0,5 s, a cada 1,3 s) | vem atrás do jogador de pé mais próximo e arranha; a **virilha mata na hora** ("No pássaro!") | contorna; 30 só com tudo fechado | 60 / 3 | 1 |
| Maratonista | `corredor` | agasalho e faixa na testa | ×0,6 | 5,4–6,2 m/s | 15 (preparo 0,35 s) | chega rápido, pouco resistente | contorna; 20 | 70 / 4 | 3 |
| Tio do Churrasco | `inchado` | regata, bermuda de praia, barrigão | ×1,6 | lento | — | a 2,2 m de alguém **incha 1 s e estoura** (3,5 m: até 50 nos jogadores, 150 nos zumbis). Morto, estoura também ("explosão em cadeia", crédito de quem matou) | contorna; com tudo fechado **estoura nas tábuas** (400 nas barricadas do raio) | 80 / 6 | 5 |
| Segurança da Balada | `brutamontes` | camiseta preta, óculos escuros, 1,25× | ×3,5 | lento | 45 (alcance 1,7 m) | tanque | **arromba** a brecha fechada no caminho: 110 por golpe | 120 / 8 | 6 |
| Tia da Fofoca | `cuspidor` | bata, coque, lenço | ×1,2 | 2,0–2,4 | cuspe 15 (raio 1,3 m), arranhão 10 | de 5 a 14 m e com linha aberta (raycast na navmesh; uma barricada fecha a linha), para e **cospe** uma bola verde que cai **onde você estava** (13 m/s) | contorna; 30 | 90 / 6 | 7 |

### Chefes (`chefes`)

Vida × (1 + 0,75 × (jogadores − 1)). Chefe não morre de um tiro na virilha: lá o dano é **dobrado**. Cada golpe especial é **telegrafado** (anel ou faixa no chão que enche até o golpe cair, pose e som), e o servidor aplica o dano quando ele cai (`t1`). Os três surgem **fora do muro**, em chão limpo, e **arrombam** (260 por golpe) a barricada que estiver no caminho.

| Chefe | Onda | Onde surge | Vida (1 / 4 jog.) | Tamanho, velocidade | Golpes |
|---|---|---|---|---|---|
| **O Coveiro** (macacão, chapéu de palha, pá) | 4 | campo norte, atrás da capela (0, −24,3) | 3.500 / 11.375 | 1,6×, 2,4 m/s, pá 40 | **Pancada de pá**: alguém a 5 m → ergue a pá 1,2 s (anel vermelho de 4,5 m) → 45 em todos no anel; a cada 7 s. **Chamar os mortos**: ajoelha 1,5 s (anel verde) → 4 zumbis saem do chão em volta (40% correndo); o primeiro 6 s depois de surgir, depois a cada 16 s |
| **A Noiva** (vestido branco, coroa de flores, véu) | 8 | campo oeste (−26, −8) | 6.000 / 19.500 | 1,3×, **4,2 m/s**, 30 | **Grito**: alguém a ~10 m → inspira 1 s (anel roxo de 12 m) → 15 de dano e **lentidão** (55% por 3 s, "Arrepiado") em todos a 12 m (atravessa o muro); a cada 10 s. **Sumir**: some 0,7 s e reaparece ~3 m **depois** do alvo, já arranhando (passa por cima de muro e barricada); quando o alvo está a 15 m ou mais (ou de surpresa), a cada 8 s |
| **O Prefeito** (terno, gravata, fedora, faixa) | 12 | anel sul, a oeste do portão (−11, 24,5) | 12.000 / 39.000 | **1,8×**, 2,2 m/s, 50 (alcance 2,8 m) | **Investida**: alvo a 6–22 m no mesmo nível → 1,1 s de aviso (faixa vermelha) → corre em linha a 13 m/s por até 18 m (para antes das paredes e das barricadas: raycast na navmesh): 50 e **arremessa** quem estiver no caminho; a cada 9 s. **Tremor**: alguém a 12 m → 1,4 s erguendo os punhos → onda de choque até 15 m: 35 em quem estiver **no chão** quando ela passa — **pular a onda** escapa; a cada 12 s. **Fúria** (metade da vida): +40% de velocidade, recargas ×0,7 e chama 3 Maratonistas a cada 15 s |

Quem mata o chefe ganha $500 e 50 XP; **todo o time** que não está morto ganha $1.000 ($1.500 do Prefeito) e 100 XP (150 do Prefeito). A barra de vida do chefe fica no alto da tela.

### Barricadas (`barricadas`, `shared/barricades.ts`)

As cinco brechas do muro (Portão Principal ao sul, Brechas Oeste, Leste, Noroeste e Nordeste; ver [[Map - Cemitério da Capela]]) começam **abertas**. Tudo decidido pelo servidor (online) ou pelo motor local (solo), com as mesmas regras:

| Ação | Como | Custo / prêmio | Tempo |
|---|---|---|---|
| **Erguer** | segurar `E` a até 2,4 m do centro da brecha (de qualquer lado), de pé | **$300**, pagos ao terminar | 2,5 s; já vem com **5 tábuas** de **150** de vida |
| **Repregar** | segurar `E` numa barricada erguida com tábua faltando ou a de cima danificada | **de graça**; **+$10 por tábua**, até **$150 por jogador por onda** (zera quando a onda acaba) | 0,8 s por tábua (refaz a de cima, ou põe uma por cima) |

- **Fechada** enquanto houver uma tábua. A tábua que fecha a brecha espera o **vão estar livre** (nenhum zumbi ou jogador dentro dele: "Passagem ocupada").
- **Zumbis comuns** (e Maratonistas, Tios, Tias) **contornam** o muro até a brecha aberta mais curta; **só atacam tábuas quando todas as brechas estão fechadas** (e o alvo do outro lado do muro). **Seguranças e chefes** arrombam a brecha fechada que estiver no caminho mesmo com outras abertas. Quem bate para na frente das tábuas e golpeia no ritmo do ataque dele; jogador colado nas tábuas pode levar arranhão por cima delas.
- **Nenhum golpe atravessa o muro** (PF-16): com o zumbi e o alvo em lados opostos, o arranhão só sai (e só acerta, quando cai) se a linha entre os dois passa por uma **brecha aberta**; pelas grades, pela base de pedra ou por uma brecha com tábuas, não (`wallBetween` em `shared/barricades.ts`). O zumbi então contorna até uma brecha (ou arranca as tábuas, como antes). Vale para o Tio que incha: ele não começa a estourar do outro lado das grades. Antes isso era aceito como "braço pela grade": colado nas barras, o zumbi comum fica a ~1,37 m de quem está encostado por dentro (fora dos 1,3 m dele), mas o Segurança (1,7 m), os chefes (2,3–2,8 m) e o golpe que acerta com 0,6 m de folga alcançavam através delas. O braço ainda atravessa as barras no desenho (a animação não colide), mas não acerta.
- **Dano nas tábuas** por golpe: comum 30, Maratonista 20, Tia 30, Tio 30 (ou **400** quando estoura perto), Segurança **110**, chefe **260**. Uma barricada cheia tem 750: um zumbi comum sozinho leva ~32 s, um Segurança ~13 s, um chefe ~5 s.
- **Tudo fechado vale**, mas não tranca: a horda bate nas tábuas da brecha no caminho, e o time precisa repregar.
- Tábua a zero cai (a próxima leva o resto do golpe); sem tábuas, a brecha **abre** e a barricada continua erguida (repregar é de graça).
- **Duram entre as ondas**; numa partida nova não há barricada nenhuma.
- **Tábuas não param balas** (há espaço entre elas para atirar) mas param jogadores e granadas.
- **A zona de abate**: fechar as quatro brechas menores manda a horda inteira pelo Portão Principal e pela Alameda, 25 m em linha reta até o terraço da capela.
- No cliente: tábuas pregadas na face de fora (moldura de dois postes), a de cima frouxa e depois pendurada por um prego conforme apanha, lascas e tremida a cada golpe, tábua caindo e rolando no chão quando cai ([[Visual Effects]]). Prompt com o preço e o progresso ([[HUD]]).

### Dinheiro (`dinheiro`) — só da partida, nunca salvo

| Evento | $ |
|---|---|
| Começo da partida (e ao entrar no meio) | 500 |
| Abate | do tipo (60–120; chefe 500) |
| + tiro na cabeça | +40 |
| + facada | +60 |
| Ajuda (≥ 10% da vida do zumbi, outro matou) | +25 |
| Reanimar um colega | +100 |
| Onda vencida (quem não está morto) | +100 |
| Chefe derrotado (o time, menos os mortos) | +1.000 / +1.500 |
| Repregar tábua | +10 (até $150 por onda) |
| **Gastos**: caixão | −950 |
| **Gastos**: erguer barricada | −300 |

### O Caixão Misterioso (`caixa`, `itens`, `raridades`)

Um caixão velho com um "?" brilhando e um **feixe de luz** que se vê de longe, **sempre no mesmo lugar**: o pátio nordeste, encostado no muro leste (17,6; −9), entre dois candelabros.

- `E` perto dele (2,2 m): paga **$950** e gira (3,5 s, as armas passam piscando). Para numa arma, que fica flutuando, na cor da raridade, por **8 s** só para quem pagou, que decide (PF-25):
  - **`E` pega** a arma;
  - **`X` recusa**: a arma some e o caixão fecha na hora, livre para girar de novo (`refuseBox`);
  - **`Z` doa**: a arma **fica no caixão** (a mesma, com o mesmo defeito, se tiver) por **15 s** (`caixa.doacaoSegundos`) para **qualquer outro jogador** pegar com `E`, de graça. Ninguém recebe a arma na mão: quem quiser vai até o caixão. Quem doou não pode pegar de volta, nem recusar depois; se ninguém pegar, ela some. Se quem doou sair da partida, a arma doada continua lá (a oferta própria sai junto com quem saiu) (`donateBox`);
  - não fez nada em 8 s: a arma some, como antes.
- O prompt da própria oferta mostra as teclas: "Pegar Rifle Firme (Rara) · [Z] doar · [X] recusar" (as teclas são remapeáveis em [[Input & Controls]]). O `Z` só aparece com mais alguém na partida (no solo não há para quem doar). Os outros veem no feed "Fulano doou Rifle Firme (Rara) no caixão: quem quiser, pegue!" e, perto do caixão, "Pegar Rifle Firme (Rara) · doada por Fulano", com a barra dos 15 s. Doar não repete o som de revelação. Com controle ou no celular as teclas `Z`/`X` não existem: só pegar (`E`) ou esperar.
- O sorteio é **no servidor** online (`rollBox` e `rollFlaw`, `Math.random` do servidor): a raridade pelo peso, uma arma dela e, por cima, **se vem danificada**. **Nunca sai a arma que você já tem intacta naquele lugar** (uma cópia danificada pode sair de novo).
- A arma nova vai para o **lugar dela** (rifle → primária; qualquer secundária → secundária; sabre → faca; `itemSlot` usa `PRIMARIES`) e a que estava lá **é jogada fora**.
- **A pistola inicial** fica na mão da primária: quando sai um rifle, ele vai para a primária e a pistola passa para a secundária (se estiver vazia), em vez de ser jogada fora; quando sai outra pistola do mesmo tipo (a Pistola do Porteiro comum), ela toma o lugar da inicial; outra arma de mão (grampeador, garrucha...) fica na secundária, ao lado dela (`withItem`). O dano de cada uma é o da raridade dela, esteja na primária ou na secundária (`itemOfGun` procura a arma nos dois lugares).
- **A raridade multiplica o dano contra zumbis** (não muda o comportamento da arma).

| Raridade | Chance | Dano × | Vem danificada | Armas (arma + melhorias fixas) |
|---|---|---|---|---|
| Inicial | — | 1,0 | nunca | Pistola do Porteiro (só no começo) |
| Comum | 50% | 1,4 | 25% | **Rifle Padrão**; Rifle com Ponto Vermelho; Rifle Silencioso (ponto vermelho + silenciador); Pistola do Porteiro; Pistola da Batata; Liquidificador; **Grampeador do RH**; **Revólver do Delegado da Quadrilha** |
| Rara | 32% | 1,9 | 18% | Rifle Firme (ponto vermelho + empunhadura); Rifle do Vovô (empunhadura + luneta); Pistola Ligeira (gatilho + ponto vermelho + coldre); Liquidificador com Motor (motor + holográfica); **Furadeira do Vizinho de Domingo**; **Garrucha do Cangaceiro** |
| Épica | 14% | 2,6 | 12% | Rifle Remendado (empunhadura + pente); Liquidificador Turbo (motor + holo + coronha); Liquidificador Pipoqueiro (motor + holo + tambor); **Pistolão do Marombeiro** |
| Lendária | 4% | 3,5 | **6%** | Rifle Completo (ponto vermelho + empunhadura + pente); Liquidificador Supremo (as 4); **Sabre de Luz Paraguaio** (o item `{ "arma": "faca", "faca": "sabre" }`: a faca vira o sabre, 420 por golpe) |

As cinco secundárias da PF-10 entram no caixão **sem melhorias**, com o nome da própria arma ([[ADR - Secundárias novas no Arsenal]]). Uma garrucha danificada com menos munição fica com 1 cartucho no pente (`zombieGunData` nunca deixa menos de 1).

> [!warning] Nomes dos itens × armas do Arsenal (PF-8)
> Os itens do caixão continuam sendo o **Rifle Padrão** com melhorias fixas, mesmo os que levam o nome de um rifle antigo ("Rifle do Vovô", "Rifle Remendado"). Desde que as melhorias deixaram de mudar a pintura ([[ADR - Rifles e facas antigos como armas próprias]]), esses itens aparecem com a pintura do Rifle Padrão, e o "Rifle do Vovô" do caixão não é o `rifleVovo` do Arsenal. Pôr os rifles antigos no caixão ficou fora do escopo da PF-8.

**Armas danificadas** (`caixa.danificada`, [[ADR - Caixão fixo com armas danificadas]]):

| Defeito | Chance (entre as danificadas) | Efeito |
|---|---|---|
| Menos munição (`municao`) | 45% | **60% do pente** e **50% da reserva** (a reserva ×3 do modo já vem cortada) |
| Menos dano (`dano`) | 45% | dano contra zumbis **×0,75** (vale na validação do servidor) |
| Os dois (`ambos`) | 10% | as duas penalidades |

- O Sabre não tem munição: quando vem danificado, é sempre menos dano.
- A penalidade de dano entra no multiplicador que o servidor usa para validar cada acerto (`weaponMul`); a de munição, no cliente (`zombieGunData`, a partir de `Loadout.danificadas`, que o servidor manda junto com o equipamento).
- **Sem conserto**: para se livrar dela, girar de novo (a oferta seguinte que cair no mesmo lugar a substitui, e o defeito vai embora com ela). Uma oferta danificada pode ser recusada (`X`) ou doada (`Z`) antes de pegar; a doada vai com o defeito.
- Como aparece: a arma flutua torta, piscando, com brilho avermelhado e a placa "DANIFICADA" com uma rachadura; acorde azedo; faixa "Saiu DANIFICADA: menos munição" para quem pagou; o prompt diz o defeito antes de pegar; no HUD o nome da arma ganha a etiqueta com o ícone de rachadura; na pausa, a arma carregada mostra o defeito com os números e cada raridade, a chance de vir danificada.
- Não existe mais o **pato de borracha** nem o caixão que voa para outro lugar (substituídos por este azar).

### Espinhos na grade e na sebe (`espinhos`)

A base do muro deixava uma beirada para subir nas grades, e dava para subir na sebe. As duas agora têm espinhos:

- **Quem sobe** (pés a 0,3 m do chão ou mais, em cima da grade do muro fora das brechas ou da sebe; `thornsAt` em `shared/barricades.ts`) leva **10 de dano** a cada segundo que fica lá.
- E fica **sangrando por 10 s**: perde **2 de vida por segundo** (um tique por segundo). Encostar de novo **renova** os 10 s, sem somar.
- O sangramento pode **derrubar** durante a onda (vira caído, como um golpe de zumbi) e para quando o jogador cai ou morre. Fora da onda, zerar a vida é a morte comum (`thorns` nas mensagens de morte).
- Decidido pelo motor (`ZombieMatch.tickThorns`): no servidor online, com a posição dos pés que ele já recebe, e no navegador no jogo solo. Evento `zbleed` (`{ id, until }`) para o HUD: o painel de efeitos mostra **🩸 Sangrando** com a contagem, e o primeiro corte avisa "Espinhos!".

### Lápides assombradas (`fantasmas`)

Subir numa lápide (arco, cruz, laje ou obelisco, dentro ou fora do muro) desperta os mortos:

- Ficar **3 s seguidos** em cima de uma lápide chama **10 fantasmas**, e **mais 10 a cada 2 s** que o jogador continua lá. Encostar, pular por cima ou descer antes dos 3 s não chama nada (descer zera a contagem). Só conta quem está **pisando** no topo da pedra (`tombUnder` em `shared/tombs.ts`: pés na altura do topo e sobre ele; passar do lado ou pular por cima não conta).
- Eles **descem do céu**: nascem uns 30 m acima do jogador, espalhados a 12–20 m em volta (nunca na frente nem perto dele), e mergulham a 14 m/s.
- Perto dele (a menos de 10 m) passam a **perseguir** a 6 m/s, mais rápidos que andar (5,5) e mais lentos que correr (8), atravessando muros, por **20 s** desde que surgiram.
- Cada um que chega **tira 10 de vida**, de novo só depois de 1,5 s; o jogador leva **no máximo um golpe a cada 0,5 s** (dez fantasmas juntos não derrubam de uma vez).
- **Não morrem**: tiro não pega. Uma **facada** (o golpe, acertando algo ou não) espanta os que estão a até 2,5 m; uma **granada**, os que estão a até 6 m do estouro.
- Somem quando o tempo acaba ou quando o alvo cai ou morre. No máximo 60 na partida; partida nova, nenhum.
- Quem subiu vê a faixa "A lápide não gostou!"; todos ouvem o gemido e veem o sopro branco quando são espantados.

Decidido pelo motor (`ZombieMatch.tickGhosts`, `raiseGhosts`, `scareGhosts`, `knifeScare`): no servidor online, com a posição dos pés que ele já recebe, e no navegador no jogo solo. As lápides vêm das peças `lapide` do mapa (`ZOMBIE.mapas.cemiterio.lapides`), com as mesmas caixas que o mapa usa como colisor (`TOMB_BOXES`). Os fantasmas vão em cada `zsnap` (`g`) e são desenhados em `client/zombies/ghosts.ts`.

### O altar e as árvores: sacrilégio e corvos (`sacrilegio`, `corvos`)

Os outros lugares altos onde a horda não chega também punem, com a mesma regra das lápides: só depois de **3 s seguidos** em cima (encostar, pular por cima ou descer antes não conta; descer zera a contagem; só vale quem está pisando no topo).

**O altar da capela (sacrilégio).** É a pedra embaixo do totem (2,4 × 1 × 0,8 m, topo a 1,6 m).
- Depois de 3 s em cima: o sino toca, as velas soltam um clarão, e o jogador é **jogado para fora** do altar (empurrão de 9 m/s para longe do meio dele; bem no meio, para a frente, na direção da nave) e leva **25 de dano**.
- E fica **Profanado por 20 s**: enquanto houver alguém profanado de pé, **todos os zumbis vão atrás dos profanados** (o mais perto entre eles), mesmo com outros jogadores mais perto; na hora do sacrilégio todos escolhem o alvo de novo. Fora de uma onda, só o empurrão e o dano valem.
- Quem profanou vê a faixa "SACRILÉGIO! A horda inteira vem atrás de você" e o buff ☠️ Profanado com o tempo; os outros veem uma **caveira num disco vermelho** sobre ele (vista através das paredes) e o aviso "Fulano profanou o altar e virou o alvo da horda por 20 s". Voltar ao altar repete tudo (e renova os 20 s).
- A horda alcança quem está no altar: entra na capela pelas escadas do pedestal e para na frente da pedra (de onde o golpe alcança o topo). Até a PF-67 (09/10/2026) a capela ficava fora da malha dos zumbis e eles esperavam atrás dela, do lado de fora do muro ([[Map - Cemitério da Capela]] → Problemas conhecidos).
- O altar vem das peças do mapa (`altarOf` em `shared/altar.ts`: a peça `caixa` cujo topo é onde o totem está e que o contém), então vale em qualquer mapa do modo que tenha totem.

**As árvores (corvos).** Só as 6 árvores mortas que têm colisão (dentro e fora do muro); as da borda do mapa não colidem e não contam.
- Depois de 3 s no alto do tronco, um bando de **corvos** começa a bicar: **5 de dano por segundo** enquanto o jogador está na árvore e por **mais 5 s** depois de descer. Voltar à árvore renova os 5 s.
- Quem é bicado vê a faixa "CORVOS! Desça da árvore", o buff 🌳 Corvos ("na árvore e mais 5 s") e **penas pretas** balançando nas bordas da tela; os corvos voam em volta, mais altos e afastados da própria câmera. Os outros veem o bando de 7 corvos rodando e mergulhando na cabeça dele, e todos ouvem os grasnados (`client/zombies/crows.ts`, como os morcegos do mapa).
- O tronco é a mesma caixa que o mapa usa como colisor: `shared/trees.ts` tira a inclinação e a altura da semente da peça (`treeShape`, com o gerador `shared/seeded.ts`) e monta a caixa (`trunkOf`); o desenho da árvore (`deadTree`) usa as mesmas funções, então o motor e o mapa não divergem.

Morrer por eles (fora de uma onda; numa onda, cai) dá mensagens próprias ("Subiu no altar. O altar não gostou.", "Os corvos acharam você primeiro."). Decidido pelo motor (`ZombieMatch.tickPerches`, `profane`, e `nearest` para o alvo dos zumbis), no servidor online e no navegador no jogo solo; o mapa do modo leva o altar e os troncos junto com as lápides (`zombieMapOf`).

### O totem da capela: Vigília Sem Trégua (`totem`)

No altar da capela, entre as duas velas, fica um **totem** (um ídolo de osso e madeira com chifres; olhos verdes apagados). `E` perto dele (a até 2,2 m, de pé) **acende a Vigília Sem Trégua**:

- **Custa $500** de quem acende e vale **até o fim da partida**: **não desliga**, e uma partida nova começa com ele apagado.
- **Sem intervalo**: a próxima onda vem assim que a anterior acaba (`totem.intervaloSegundos` = 0). Aceso num intervalo, a próxima onda vem na hora. A munição, as granadas e quem caiu ou morreu voltam no fim de cada onda, como antes.
- **Rende mais**: todo dinheiro da partida **+20%** e todo XP de conta **+10%**, para todos, desde que acende (`pay` e `xp` do motor; o XP quebrado de abates pequenos vai somando).
- Aceso: os olhos ficam vermelhos e uma chama dança na cabeça; faixa "Fulano acendeu a Vigília Sem Trégua!" para todos e **🕯️ Vigília Sem Trégua** no painel de efeitos. Quem entra no meio recebe o estado em `joined.zumbi.totem`.
- Quem entra com uma onda em andamento e o totem aceso entra no começo da onda seguinte (não há intervalo para esperar).

Decidido pelo motor (`ZombieMatch.useTotem`): no servidor online (mensagem `totem`, evento `ztotem`) e no navegador no jogo solo. O lugar fica no mapa (`zumbi.totem` em `shared/data/mapas/cemiterio.json`); o modelo, em `client/zombies/totem.ts`.

### Pets (PF-29)

Cada jogador pode trazer o seu pet ([[Pets]], com o interruptor **Junto no zumbi** ligado). Ele age **sozinho** quando a habilidade está pronta, **sem dano, sem dinheiro e sem estatística**, e os zumbis o ignoram (o pet não existe no motor; só o efeito). Números em `shared/data/pets.json`.

| Pet | Habilidade | Resumo | Recarga |
|---|---|---|---|
| Amora | Segura, Amora! | segura pela canela, por 3 s, o zumbi mais perto do dono (até 7 m, sem o muro no meio), **cancelando o golpe que ele tinha começado**; o Segurança e os chefes só levam um tranco de 0,6 s, que não cancela (`ZF.held`) | 18 s |
| Bruxinha | Feitiço do Pato | boia de patinho por 4 s na variante perigosa mais perto a até 10 m (qualquer tipo menos o comum) ou, sem nenhuma, no comum mais perto (P41; chefes imunes): parado e levando tiro (`ZF.duck`) | 25 s |
| Gata | Sétima Vida | levanta o dono caído em 6 s (começa 2 s depois da queda), 2 vezes por partida; **cede a vez a um colega** que comece a reanimar e nunca entra nas reanimações | cargas |
| Fuinha | Mão na Massa | prega 1 tábua a cada 2,5 s, até 2, na barricada erguida mais danificada perto do dono (até 6 m), sem dinheiro | 15 s |
| Lontra | Pedrada | cancela o cuspe da Tia ou o inchaço do Tio perto do dono (até 9 m) e deixa o zumbi tonto 1,5 s; o Tio só volta a inchar 3 s depois | 12 s |
| Iguana | Rabo de Isca | um golpe de zumbi ou de fantasma (não espinhos nem corvos) deixa o dono com 35% da vida ou menos: os zumbis a até 8 m (não os chefes) vão atrás do rabo por 5 s | 40 s |

Decidido pelo motor (`ZombieMatch.tickPets`): no servidor online, no navegador no solo. Evento `zpet` para a sala ([[Remote Calls]]); o dono vê o ícone do pet com a recarga no [[HUD]].

### Caído, reanimar, morrer

- Vida a zero **durante uma onda** (zumbi, chefe, queda, a própria granada; **não** cair para fora do mapa): você **cai** (`Session.onLethal` → `ZombieMatch.lethal`). Caído não anda, não atira, a câmera fica rente ao chão, a tela mostra "CAÍDO!" e quanto falta para sangrar; os zumbis passam a ignorar você.
- Um colega fica a até 2,5 m e **segura E por 3 s** ("Segure para reanimar Fulano", cruz vermelha sobre quem caiu, vista através das paredes): você levanta com 50% da vida e ele ganha $100 e 10 XP. Afastar-se ou soltar cancela. Reanimar tem prioridade sobre o caixão e as barricadas no `E`.
- Ninguém veio em **30 s**: você **sangra até morrer** e fica fora até o **intervalo**; volta lá com a **pistola inicial** (as armas do caixão se perdem) e com o seu dinheiro.
- **Com a gata** ([[Pets]]): 2 s depois da queda ela começa a te levantar, e em 6 s você volta com 50% (duas vezes por partida). A tela diz "A gata está te levantando · Ns"; os colegas veem uma pata na cor da coleira sobre a sua cruz vermelha e **continuam vendo o aviso de reanimar**: se um deles começa, a gata espera (e continua se ele soltar). No solo, o estado "caído" só existe para quem leva a gata.
- **Assistir um colega** (PF-24, só online): quem está fora até o intervalo (sangrou até morrer, ou entrou com a onda em andamento) passa a ver, depois de **2 s** (`SPECTATE_DELAY`), **pelos olhos de um colega de pé**:
  - a câmera fica onde ele está e olha para onde ele olha, na altura dos olhos dele (em pé, agachado ou caído); a mira dele aproxima a visão (o zoom da arma dele);
  - os braços e a arma dele aparecem em primeira pessoa (um segundo viewmodel, com a aparência dele): mirando, correndo, recarregando, e cada tiro dele dá o coice e o clarão; o corpo dele não é desenhado;
  - **D** volta para o colega anterior e **F** vai para o próximo (por id, dando a volta). São as teclas físicas, fixas: fora da onda não se anda nem se ataca, então elas não fazem mais nada. No controle, **LB/RB**; no celular, as setas da barra;
  - a barra "ASSISTINDO Fulano · 80 de vida · [D] anterior · [F] próximo" fica embaixo, e o cartão de espera ("Você volta no intervalo" / "Você entra quando esta onda acabar") sobe para o topo, sem o vermelho; a vida do HUD (e a borda vermelha de vida baixa) é a do colega;
  - se ele morrer ou sair, a visão passa para o próximo; sem ninguém de pé, volta a câmera de morte. Os sons ficam onde a câmera está (ouve-se o que ele ouve).
  - Escolha e altura dos olhos em `client/zombies/spectate.ts` (`pickSpectate`, `spectateEye`), câmera e viewmodel em `client/main.ts`, barra em `hud.setSpectate`.
- No fim de cada onda, quem está caído levanta sozinho. Morrer fora de uma onda (uma queda no intervalo) é o renascimento comum de 5 s ([[Respawn]]).
- **Quem entra com uma onda em andamento espera ela acabar**: fica de fora como os mortos ("Onda em andamento — você entra quando esta onda acabar", vendo o pátio de um ponto de nascimento) e entra no **começo do intervalo**, com $500 e a pistola inicial; as barricadas chegam como estão. Antes da primeira onda e nos intervalos, entra na hora. Quem ainda está esperando quando a partida acaba não ganha a vitória (XP e estatísticas) nem conta a partida: não jogou. Sair e voltar zera dinheiro e armas. (Antes, quem entrava no meio da onda já entrava de pé.)

## Fluxo da partida

```mermaid
stateDiagram-v2
    [*] --> Esperando: sessão vazia
    Esperando --> Contagem: alguém entra (15 s)
    Contagem --> Onda: onda 1
    Onda --> Intervalo: todos os zumbis da onda mortos (20–25 s)
    Intervalo --> Onda: próxima onda
    Onda --> Fim: ninguém de pé (derrota)
    Onda --> Fim: onda 12 vencida (vitória)
    Fim --> Contagem: resumo (15 s) e nova partida (sem barricadas)
    Onda --> Esperando: todos saíram
```

- **Resumo** (`zend`): título, onda alcançada, tempo e, por jogador, abates, tiros na cabeça, dinheiro ganho, quantas vezes caiu, quantos reanimou e o XP ganho (online). Depois de 15 s (`fimSegundos`), uma partida nova começa para quem está lá (`roundStart`): todos renascem com $500 e o rifle inicial, e as barricadas somem (`zbar` `reset`).

## Respawn

Ver "Caído, reanimar, morrer". Na troca de partida todos renascem na hora. O ponto de nascimento (os 16 do pátio) evita zumbis (12 m) e prefere ficar perto de um colega de pé (`pickSpawn` em `client/main.ts`).

## Pontuação

- **Placar** (`Tab`, [[Scoreboard]]): abates de zumbi, dinheiro atual, vezes caído, reanimações e ping; quem está caído aparece com "✚". O número "Pontos" do HUD é o dinheiro ganho na partida.
- **XP de conta** (só online, sempre do servidor, [[Progression]]): por abate 3–8 XP conforme o tipo, chefe (50 a quem mata, 100–150 ao time), onda vencida +10, reanimar +10, vitória +250, além do XP por minuto vivo que vale em todo modo. Barricadas não dão XP.
- **Sem XP de arma** (`weaponXp: false`): as armas são do caixão, não do Arsenal do jogador (mesmo motivo da [[Gun Game]]), e o PvE não vira atalho para as melhorias do PvP.
- **Sem estatística de abates/mortes da conta** (`player_stats`): zumbis não são jogadores, e morrer para eles não mexe no K/D.
- **Estatísticas próprias do modo** (só online, tabela `zombie_stats`, aba Perfil em "Modo zumbi"): partidas até o fim, vitórias, melhor onda alcançada, ondas sobrevividas, zumbis abatidos (e quantos na cabeça, no pássaro, na faca e com granada), golpe final em cada chefe, quedas, reanimações feitas, mortes (sangrar até o fim, cair no vazio, ou estar caído quando a partida é perdida, já que ninguém vai reanimar) e giros no caixão. O motor avisa cada evento pelo gancho opcional `ZombieHost.stat` (`ZStat`); no servidor, `addZombieStat` soma no delta da conta e o flush grava ([[Save System]]). O jogo solo não implementa o gancho.
- Sozinho (offline) não há XP, como em todo modo offline.

## Limites de tempo

Nenhum limite por onda. Contagem de 15 s, intervalos de 20/25 s, resumo de 15 s.

## Configurações

Tudo em `shared/data/zumbi.json`, menos os dados do mapa, que ficam no campo `zumbi` do JSON do mapa (lido por `shared/zombies.ts` como o objeto `ZOMBIE`; os testes encurtam os tempos e preços nele):

| Chave | Valor | O que é |
|---|---|---|
| `inicioSegundos` / `intervaloSegundos` / `intervaloChefeSegundos` / `fimSegundos` | 15 / 20 / 25 / 15 | os tempos da partida |
| `dinheiroInicial` | 500 | |
| `jogadoresFator` / `chefeVidaFator` | 0,6 / 0,75 | escala com o número de jogadores |
| `maxVivosBase` / `maxVivosPorJogador` / `maxVivosTeto` | 8 / 4 / 24 | quantos andam ao mesmo tempo |
| `danoPorOnda` | 0,04 | +4% de golpe por onda |
| `ondas[]` | 12 | ver a tabela |
| `tipos`, `chefes` | | vida, velocidade, ataque, golpes, $ e XP |
| `dinheiro`, `xp` | | prêmios |
| `jogador` | caído 30 s, reanimar 3 s, volta com 50%, alcance 2,5 m | |
| `armas` | faca 120, granada +25%/onda, reserva ×3 | |
| `caixa` | $950, gira 3,5 s, oferta 8 s, alcance 2,5 m | |
| `caixa.danificada` | chance por raridade 25/18/12/6%; defeitos 45/45/10%; pente ×0,6, reserva ×0,5, dano ×0,75 | armas danificadas |
| `barricadas` | 5 tábuas × 150, $300, erguer 2,5 s, repregar 0,8 s, +$10 até $150/onda, alcance 2,4 m, `dano` por tipo | barricadas |
| `fantasmas` | 3 s em cima para chamar; 10 por vez, mais 10 a cada 2 s em cima; descem do céu (30 m acima, 12–20 m em volta, mergulho a 14 m/s); 20 s; 6 m/s; 10 de dano (recarga 1,5 s, um golpe a cada 0,5 s no alvo); faca espanta a 2,5 m, granada a 6 m; máximo 60 | lápides assombradas |
| `totem` | $500, alcance 2,2 m, intervalo 0 s, dinheiro ×1,2, XP ×1,1 | Vigília Sem Trégua |
| `espinhos` | 10 a cada 1 s em cima; sangra 10 s, 2 por tique de 1 s; conta com os pés a 0,3 m ou mais, até 0,5 m do muro e 0,8 m da sebe | grade e sebe |
| `raridades`, `itens`, `inicial` | | o caixão |
| `zumbi` (em `shared/data/mapas/cemiterio.json`) | `dentro` (o muro), `sebe` (a sebe em volta do campo, com espinhos), 24 pontos de surgimento (fora do muro), o lugar do caixão, onde cada chefe surge, as 5 brechas (`barricadas`: eixo, centro, largura) | o mapa (o muro foi cortado nas brechas na conversão; `ZOMBIE.mapas.cemiterio`; `checkZombieMap`) |
| `MODE_RULES.zumbi` | `weapons: 'mode'`, `lockedLoadout`, `grenades`, sem XP de arma, `rounds`, `bots` (jogo solo), `coop`, `ownMaps: true`, `pets: 'ability'` | `shared/modes.ts` |
| `shared/data/pets.json` | alcance, duração, recarga e cargas de cada habilidade dos pets | [[Pets]] |
| Sala | sob demanda, aberta pelo `play` num mapa do modo (as salas fixas, como `zumbi-cemiterio`, saíram na PF-6) | `server/app.ts` |

> [!info] A `sebe` (espinhos) fica no campo `zumbi` do mapa (`shared/data/mapas/cemiterio.json`, `zumbi.sebe`), validada por `checkZombieMap`; `ZOMBIE.mapas.cemiterio` lê esse campo. Na main ela ficava em `mapas.cemiterio` de `shared/data/zumbi.json`, que não tem mais `mapas` (merge de 07/10/2026). Ver [[Map - Cemitério da Capela]].

## Sistemas utilizados

[[Weapons]] · [[Melee]] · [[Grenades]] · [[Combat]] · [[Damage System]] · [[Health System]] · [[Respawn]] · [[Progression]] · [[Economy Design]] · [[Sessions]] · [[Client Server Model]] · [[Validation]] · [[Remote Calls]] · [[AI Overview]] · [[Navigation]] · [[NPC Behavior]]

## Código relacionado

- `shared/data/zumbi.json`: todos os números do modo.
- `shared/zombies.ts`: regras puras (`waveSpec`, `pickType`, `zombieHp`, `zombieHit`, `gunDamageToZombie`, `knifeDamageToZombie`, `grenadeDamageToZombie`, `killMoney`, `killXp`, `rollBox`, `rollFlaw`, `flawChance`, `flawDamageMul`, `flawAmmo`, `zombieGunData`, `withItem`, `startItems`, `zombieLoadout`, `weaponMul`, flags `ZF` e o formato `ZNet`, `zombieProblems` checado nos testes).
- `shared/barricades.ts`: as brechas (geometria: `gapFrame`, `inGap`, `atGap`, `inReach`, `insideWall`; as caixas e flags da navmesh: `gateAreas`, `gateFlag`, `WALK_FLAG`) e as regras das tábuas (`buildBarricade`, `nailBoard`, `hitBarricade`, `boardDamage`, `smashesThrough`).
- `shared/zombieMatch.ts`: o motor da partida (`ZombieMatch`): ondas com telegrafia de surgimento, zumbis numa `Crowd` do Detour com dois filtros (contornar / atravessar barricadas), ataques e arrombamento, chefes, cuspes e ondas de choque, o caixão, as barricadas (`barricadeWork`, `tickWork`), caído/reanimar, resumo. Roda no servidor e no navegador (solo).
- `server/modes.ts` (`ZombieMode`): liga o motor à `Session`, valida `zhit`/`zstab`/granadas contra as posições do servidor (dano com a raridade e o defeito da arma), repassa `barricade`, dá o XP. `server/navmesh.ts`: carrega a navmesh pré-gerada. `server/session.ts`: ganchos e o estado `downed`.
- `shared/data/mapas/cemiterio.json` (peças em `client/world/catalog/cemetery.ts`): o mapa ([[Map - Cemitério da Capela]]). `tools/bake-navmesh.ts` (`bun run navmesh`) e `shared/data/navmesh/cemiterio.json`: a navmesh do servidor, com as brechas marcadas ([[ADR - Barricadas como polígonos próprios na navmesh]]); `client/ai/navmesh.ts` (`soloNavMeshWithAreas`).
- `client/zombies/`: `crows.ts` (os corvos das árvores), `spectate.ts` (assistir um colega: quem, e a altura dos olhos), `client.ts` (eventos, HUD, `E` no caixão, nas barricadas e para reanimar, setas das brechas, caído, renascimento), `view.ts` (zumbis desenhados e interpolados, hitboxes, telegrafias, a de surgimento com mãos e feixe), `coffin.ts` (o caixão fixo, a placa de danificada), `barricades.ts` (as tábuas, o colisor delas, sons), `looks.ts` (visuais), `local.ts` (o jogo solo: o mesmo motor no navegador), `link.ts` (a interface `ZombieLink`), `ambience.ts` (névoa e a página do caixão na pausa, `flawText`).
- `client/character/animator.ts`, `client/entities/rig.ts`, `client/entities/avatar.ts`, `client/net/remote.ts`: poses, hitboxes com escala, colega caído.
- Testes: `server/tests/zombies.test.ts` (regras, motor, servidor real, progressão de armas, chefes, entrar no meio e esperar o intervalo, arma danificada na validação do servidor, barricadas no servidor e sincronia de quem entra no meio), `server/tests/zombieBarricades.test.ts` (mapa exclusivo, brechas na navmesh, barricadas no motor, armas danificadas), `server/tests/progression-modes.test.ts` (matriz com todas as combinações do caixão, danificadas incluídas) e `client/tests/offlineModes.test.ts` (jogo solo, arma danificada e barricada). Ver [[Integration Tests]].

## UI relacionada

- [[HUD]]: "ONDA 3/12 · 14 zumbis" (ou a contagem, ou o intervalo) sob o placar, barra do chefe, dinheiro sobre a vida, "+$100 Tiro na cabeça" nos pop-ups, nomes das armas na cor da raridade com a etiqueta "Danificada", **setas das brechas** em volta da mira, faixas de onda, de chefe e de arma danificada, "PULE A ONDA!", tela de caído, prompts do caixão, das barricadas ("Segure para erguer a barricada: Brecha Oeste ($300)", "Segure para pregar tábuas (2/5)", "Passagem ocupada") e de reanimar, cartão de resumo.
- [[Scoreboard]]: colunas do modo.
- [[Matchmaking UI]]: "Zumbi" no tipo de partida (online e contra bots: "ENCARAR A HORDA SOZINHO"), só o Cemitério da Capela nos mapas; o cemitério não aparece nos outros modos nem no campo de tiro.
- [[Menus]]: a aba **Caixão** na pausa ("Você carrega" ao lado das "Chances · $950" por raridade); online o aviso diz "a horda não espera" e a saída avisa que o dinheiro da partida não é guardado (com equipe, "Sua equipe continua sem você"; sozinho online, a partida recomeça para o próximo que entrar; no solo, ela acaba). A linha do trilho diz "Onda X/12 · …" e, antes da primeira onda, o mesmo título da contagem do HUD ("A HORDA VEM AÍ · …").

## Limites e próximos passos

- Um mapa oficial só. Desde a PF-6 (fase 2), qualquer mapa salvo com `exclusivo: 'zumbi'` e o campo `zumbi` (muro, brechas, caixão, surgimentos) vira mapa do modo: o servidor gera a navmesh ao salvar (`server/mapWorker.ts`) e a guarda com a versão; o editor (fase 3) monta esses dados com marcadores (surgimentos, caixão, chefes, cantos do muro e brechas, que ficam na linha do muro) e um modelo inicial válido ([[ADR - Editor de mapas no jogo]]).
- O "não há caminho aberto" é decidido pela caixa `dentro` do mapa: vale porque o muro é fechado e as brechas são a única ligação.
- Zumbis não sobem em lugares fora da navmesh; o caixão e as tábuas têm colisão só para os jogadores (as tábuas são regra do motor). Ver [[Navigation]].
- O braço do zumbi atravessa as barras no desenho (a animação não colide com a grade); o golpe, não (PF-16).
- Equilíbrio de barricadas e armas danificadas sem teste com jogadores reais.
- Não há "loja" de munição, perks nem portas pagas (ideias para depois).
