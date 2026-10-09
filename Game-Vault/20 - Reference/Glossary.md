---
title: Glossary
type: reference
status: documented
area: reference
source_paths:
  - client/ui/home.ts
  - client/ui/playRules.ts
  - client/ui/galpao/galpao.ts
  - server/modes.ts
  - shared/gunGame.ts
  - shared/zombies.ts
  - shared/zombieMatch.ts
  - shared/modes.ts
  - shared/constants.ts
  - shared/protocol.ts
  - shared/maps.ts
  - shared/weapons.ts
  - shared/progression.ts
  - client/main.ts
  - server/session.ts
  - server/app.ts
  - shared/arsenal.ts
  - client/ui/arsenal.ts
  - shared/data/progression.json
  - shared/mapData.ts
  - client/editor/batches.ts
tags:
  - game
  - reference
  - glossary
updated: 2026-10-08
---

# Glossário

Termos próprios do projeto, com o **nome exibido ao jogador**, o **nome no código** e o significado. Organizado por área; dentro de cada área, por ordem alfabética.

## Jogo (termos que o jogador vê)

| Termo exibido | No código | Significado | Nota |
|---|---|---|---|
| Aba do modo | `ModeTab` (`'arsenal' \| 'escada' \| 'caixao'`), `pauseContext().tab`, `#pm-mode` | A primeira aba do menu de pausa, que muda com o modo: Arsenal, Escada (corrida armada) ou Caixão (zumbi) | [[Menus]] |
| Arsenal | `client/ui/arsenal.ts` (`ArsenalPanel`, aba do menu de pausa), `client/ui/arsenalCanvas.ts` (canvas, aba da home), `ArsenalChoice` | Tela para escolher o rifle, a secundária e a faca e ligar/desligar qualquer melhoria já liberada; mostra o nível, os pontos que faltam e os atributos de cada arma. Na pausa mostra só o que está em uso (editável só no campo de tiro) | [[Inventory UI]] · [[Progression]] · [[Menus]] |
| Banner | `hud.showBanner` | Texto grande animado (NO PÁSSARO!, OPRIMIDO!, nível) | [[Notifications]] |
| Beber Poção | prompt `promptPotion` | Ação da tecla de contexto perto da bruxa | [[Interaction System]] |
| Biscoito Scooby | `biscoito` | Coletável da Vila Assombrada: cura total; aparece com o armário da cozinha aberto | [[Pickups]] |
| Campo de tiro / Treino | `mode: 'offline'`, `variant: 'range'` | Modo offline com bonecos | [[Training]] |
| Carpa dourada / Mira afiada | `goldenKoi`, `KOI`, `galleryAim` | Bônus de dispersão ×0,5 e recuo ×0,6 por 60 s (carpa dourada do Jardim ou último alvo do tiro ao alvo da Vila) | [[Buffs & Debuffs]] |
| Cereja do Dragão | `cereja`, `CHERRY` | Coletável do Jardim: +50 de vida máxima por 30 s | [[Pickups]] |
| Contra bots | `mode: 'bots'` | Modo offline contra bots (`facil`/`normal`/`dificil`) | [[Versus Bots]] |
| Cozinhar | `cookT` | Segurar G com o pino tirado; depois de 3 s a granada explode na mão | [[Grenades]] |
| Dancinha da Vitória | `taunt`, `danceMusic` | A dança da Opressão (3,2 s, funk de 150 bpm) | [[Humiliation]] |
| Detalhe dos objetos (Normal / Leve) | `Settings.detalhe`, `ObjectDetail`, `objectDetail`, `MapBuilder.seg` | Quanto de geometria o mapa monta: o Leve (padrão no celular e com renderização por software) simplifica folhagem, árvores mortas, lanternas do céu, telhados, props esculpidos e estantes e troca o LOD dos personagens mais cedo; colisão igual. Vale a partir da próxima partida (PF-35) | [[Settings]] · [[ADR - Detalhe geométrico Normal e Leve]] |
| Entrada rápida | `#gp-quick`, `quickJoin`, `playHooks.quickPlay` | O botão ENTRADA RÁPIDA (e Enter) da visão geral do galpão: sempre online, faz o mesmo que o botão laranja do Online, com o tipo e o mapa do Online ("Mata-mata · Online · Rua dos Vizinhos") | [[Matchmaking UI]] |
| Botão laranja (aba Jogar) | `#home-play-cta`, `ctaText` | A ação principal da aba Jogar: sempre no pé do painel lateral, com altura fixa, dizendo o que vai acontecer (JOGAR ONLINE, CONTRA N BOTS, ENCARAR A HORDA SOZINHO, CAMPO DE TIRO) | [[Menus]] |
| Qualquer mapa | `onlineMap = null`, `effectiveOnlineMap`, `quickTarget` | O primeiro cartão de mapa do Online: entra no mapa da sessão mais cheia não lotada do tipo, ou num oficial quando ninguém joga | [[Matchmaking UI]] |
| Dose Dupla | melhoria opcional da granada (nível 3, grupo `modo`), `tipo: 'dupla'` | Duas granadas por carga, com 0,3 s entre elas | [[Grenades]] |
| Frases rápidas | `QUICK_CHAT` | Mensagens de chat de um toque no celular | [[Chat]] |
| Granada de pato | poção `pato` | Visual e som de pato de borracha nas granadas, sem efeito de jogo | [[Buffs & Debuffs]] |
| Humanidade | `humanity`, `RAT.extraHealth` | +50 de vida máxima até morrer, por derrubar o rato gigante | [[Buffs & Debuffs]] |
| Idioma | `Settings.idioma`, `LANGS` (`pt-BR`, `en`, `es`, `de`) | O idioma do jogo, escolhido por aparelho nas Configurações (subaba Vídeo) ou no botão da landing; sem escolha, o do navegador. Espanhol = latino-americano neutro (es-419) | [[Settings]], [[ADR - Seletor de idioma por aparelho]] |
| Investida | `lunge` | Avanço da faca até o alvo próximo | [[Melee]] |
| Kill feed | `hud.killfeed` | Linhas "Matador [arma] ícone Vítima" | [[HUD]] |
| Mata-mata (livre) | `'mata-mata'` (`GameModeId`), `DeathmatchMode` | Modo todos contra todos com o Arsenal da conta, escolhido antes e travado durante a partida | [[Free For All]] · [[Versus Bots]] |
| Corrida armada (en: Gun game) | `'corrida-armada'`, `GunGameMode`, `shared/gunGame.ts` | Modo em que todos sobem a mesma escada de armas: 3 abates sobem, facada tira um abate, abate com o Sabre de Luz vence a rodada | [[Gun Game]] |
| Escada / degrau | `LADDER`, `LadderPos {step, kills}`, `PlayerInfo.ladder`, `ladder_<id>` | Sequência de 9 armas fixas da corrida armada e a posição de cada jogador nela ("ARMA N/7") | [[Gun Game]] |
| Zumbi (en: Zombies) | `'zumbi'`, `ZombieMode`, `ZombieMatch`, `shared/zombies.ts` | Modo cooperativo de 12 ondas de zumbis e 3 chefes no Cemitério da Capela (mapa só dele); dinheiro da partida, armas do caixão e barricadas | [[Zombie]] |
| Onda / intervalo | `ZPhase` (`countdown`, `wave`, `break`, `over`), `zwave` | Uma leva de zumbis do modo zumbi; o intervalo de 20–25 s entre ondas (munição e granadas cheias, caídos levantam, mortos voltam) | [[Zombie]] |
| Caixão Misterioso (en: Mystery Coffin) | `box`, `zbox`, `rollBox`, `client/zombies/coffin.ts` | A "caixa" do modo zumbi, num lugar fixo: $950 sorteiam uma arma (arma + melhorias fixas) de uma raridade, que às vezes vem **danificada** (o pato de borracha e a mudança de lugar de antes saíram) | [[Zombie]] |
| Arma danificada (en: Damaged) | `ZFlaw`/`WeaponFlaw` (`municao`, `dano`, `ambos`), `ZItems.danificadas`, `Loadout.danificadas`, `rollFlaw`, `zDamaged` | Prêmio do caixão com defeito: menos munição (60% do pente, 50% da reserva), menos dano (×0,75) ou os dois; chance de 25% (comum) a 6% (lendária); sem conserto | [[Zombie]] · [[ADR - Caixão fixo com armas danificadas]] |
| Barricada / brecha (en: Barricade / gap) | `barricade`, `zbar`, `zbarwork`, `ZBarricade`, `shared/barricades.ts`, `zumbi.barricadas` (em `shared/data/mapas/cemiterio.json`), `zgap_<id>` | As 5 aberturas do muro do cemitério (Portão Principal, Brechas Oeste, Leste, Noroeste e Nordeste) e as tábuas que o time prega nelas ($300 para erguer, repregar de graça) para desviar a horda | [[Zombie]] · [[Map - Cemitério da Capela]] |
| Telegrafia de surgimento | `zfx 'rise'`, `RISE_TELL_MS` | O aviso 0,9 s antes de um zumbi sair do chão: mãos saindo da terra, brilho e feixe verdes, gemido | [[Zombie]] |
| Filtro de contornar / de atravessar | `FILTER_AROUND`, `FILTER_THROUGH`, `gateFlag` | Os dois filtros de navegação da horda: um tira as brechas barricadas do caminho, o outro não (Seguranças, chefes, e todos quando tudo está fechado) | [[Navigation]] · [[ADR - Barricadas como polígonos próprios na navmesh]] |
| Raridade | `Rarity` (`inicial`, `comum`, `raro`, `epico`, `lendario`), `rar_<id>` | Cor e força de uma arma do caixão: multiplica o dano contra zumbis (×1 a ×3,5) | [[Zombie]] · [[Weapons]] |
| Caído / reanimar / sangrar | `SPlayer.downed`, `zdown`, `revive`, `zrevive`, `zup`, `KillKind 'zombie'` | No modo zumbi, vida a zero numa onda derruba o jogador; um colega reanima segurando E (3 s); depois de 30 s ele sangra até morrer e volta no intervalo | [[Zombie]] |
| Dinheiro (zumbi) | `ZombiePlayer.money`, `zmoney` | Moeda **só da partida** do modo zumbi, nunca salva | [[Zombie]] · [[Economy Design]] |
| Chefes: Coveiro, Noiva, Prefeito | `BossId` (`coveiro`, `noiva`, `prefeito`), `zboss_<id>` | Os chefes das ondas 4, 8 e 12 do modo zumbi | [[Zombie]] |
| Maratonista, Tio do Churrasco, Segurança da Balada, Tia da Fofoca | `ZType` (`corredor`, `inchado`, `brutamontes`, `cuspidor`), `ztype_<id>` | As variantes de zumbi (rápido, explode, tanque, cospe de longe); o comum é `comum` | [[Zombie]] |
| Tipo de partida | `#home-game`, `GameModeId` | Seletor de modo de jogo na home (Mata-mata / Corrida armada / Zumbi) | [[Matchmaking UI]] |
| Rodada | `roundEnd`, `roundStart` | Na corrida armada, do início até o abate com o sabre; 6 s de intervalo antes da próxima | [[Gun Game]] |
| Melhoria (upgrade) | `Upgrade` em `progression.json` (`melhorias`), `upg_<arma>_<id>` | O que cada nível de arma ≥ 2 libera: muda atributos reais (e às vezes o visual). As **comuns** ficam ativas assim que liberadas | [[Weapons]] · [[Progression]] |
| Melhoria opcional | `opcional: true`, `grupo`, `ArsenalChoice.ligadas` | Melhoria com troca (ganha algo, perde algo; ex.: silenciador, lunetas, mina). Vem desligada; o jogador liga no Arsenal. Num `grupo`, só uma fica ligada e ela substitui as comuns do grupo | [[Weapons]] · [[Inventory UI]] |
| Mina Terrestre | melhoria opcional da granada (nível 2, grupo `modo`), `tipo: 'mina'` | Mina plantada com G; arma em 1 s, no máximo 3 por jogador | [[Land Mines]] |
| Modo PCD | membro ausente na aparência | Sem um membro: recarga ×1,3 ou velocidade ×0,75, e o membro não tem hitbox | [[Character Customization]] |
| No pássaro! | região `virilha`, kind `groin` | Tiro na virilha: morte instantânea, +100 pontos | [[Damage System]] · [[Scoring]] |
| Oprimir / Opressão (en: Humiliation) | `taunt`, `humiliation`, `HUMILIATION` | Dançar sobre um corpo até 6 s depois da morte; vale 150 pontos. Coluna "Opress." no placar e faixa OPRIMIDO! | [[Humiliation]] |
| Pelas costas | `backstab`, `behind` | Bônus de +50 da faca atacando por trás | [[Melee]] · [[Scoring]] |
| Poções da bruxa | `POTION`, `pato`/`veloz`/`lerdo`/`critico`/`bebado` | Efeito sorteado, uma poção por minuto | [[Buffs & Debuffs]] |
| Prompt | `hud.setPrompt` | Dica de ação ("Oprimir {nome}", "Beber Poção") | [[HUD]] |
| Sala / Sessão | `Session` | Uma partida online; ≠ sessão de login (cookie `oc_sessao`) | [[Sessions]] |
| Primária | `primaria`, `PRIMARIES`, tecla `weapon1` | Espaço da arma de fogo principal: um dos sete rifles (padrão: o Rifle Padrão). Toda vida começa com ela na mão | [[Weapons]] |
| Rifles antigos / facas antigas | `rifleFita`…`rifleOuro`, `colher`…`sabre` | As armas das primeiras versões do jogo, de volta como armas próprias (PF-8): cada uma com uma troca, usando os pontos e as melhorias do rifle ou da faca | [[Weapons]] · [[Melee]] · [[ADR - Rifles e facas antigos como armas próprias]] |
| Progressão (de uma arma) | `ProgWeapon`, `progOf` | Onde ficam os pontos, o nível e as melhorias: `rifle` (os sete rifles), `pistola` (pistola, grampeador, revólver, garrucha, pistolão), `smg` (submetralhadora, furadeira), `faca` (as sete facas), `granada` | [[Progression]] |
| Trava | `libera: { arma, pontos }`, `weaponUnlocked` | No JSON de uma arma: os pontos de uma progressão que a liberam (ex.: Sabre com 9.000 de faca) | [[Progression]] |
| Pintura | `visual`, `GunLook`, `LOOKS` | As cores e enfeites de um rifle (`padrao`, `fita`, `tia`, `natal`, `chamas`, `vovo`, `ouro`); vem do JSON do rifle | [[Weapon Models]] |
| Sala sob demanda | `play {map, mode}` | Sala aberta quando alguém joga um mapa, numa versão dele, e fechada quando esvazia (as salas permanentes, como `principal`, saíram na PF-6) | [[Sessions]] · [[Matchmaking]] |
| Versão de mapa | `map_version`, `SessionInfo.versao` | Cada salvamento de um mapa; imutável; a sala joga a mesma até o fim | [[Maps Index]] |
| Equipe | papéis `admin` e `moderador` | Quem usa o Gerenciamento e mantém os mapas oficiais (`shared/roles.ts`) | [[Moderation]] |
| Secundária | `secundaria`, `SECONDARIES`, `FLAG.secondary`, tecla `weapon2` | Segundo espaço de arma de fogo: uma das sete secundárias (Pistola do Porteiro, padrão; Grampeador do RH; Submetralhadora Liquidificador; Revólver do Delegado da Quadrilha; Furadeira do Vizinho de Domingo; Garrucha do Cangaceiro; Pistolão do Marombeiro), escolhida no Arsenal; troca com 1/2/roda | [[Weapons]] · [[Inventory]] |
| Grampeador do RH (en: HR Stapler) | `grampeador`, `grampeador.json` | Secundária de **rajada** (3 grampos por clique); usa a progressão da pistola, libera com 700 pts de pistola | [[Weapons#Secundárias]] |
| Revólver do Delegado da Quadrilha (en: Square Dance Sheriff's Revolver) | `revolver`, `revolver.json` | Secundária semi de 6 balas, tiro único na cabeça até 10 m; progressão da pistola, 3.200 pts | [[Weapons#Secundárias]] |
| Furadeira do Vizinho de Domingo (en: Neighbor's Sunday Drill) | `furadeira`, `furadeira.json` | Secundária automática de 1.200/min e alcance curto; usa a progressão da **submetralhadora**, mas libera com 5.200 pts de **pistola** | [[Weapons#Secundárias]] |
| Garrucha do Cangaceiro (en: Cangaceiro's Double-Barrel) | `garrucha`, `garrucha.json` | Secundária de dois canos com **8 bagos** por tiro; progressão da pistola, 7.000 pts | [[Weapons#Secundárias]] |
| Pistolão do Marombeiro (en: Gym Bro's Hand Cannon) | `pistolao`, `pistolao.json` | Secundária semi de 7 balas que bate como rifle, tiro único na cabeça até ~27 m; progressão da pistola, 9.000 pts | [[Weapons#Secundárias]] |
| Rajada (en: burst) | `modo: 'rajada'`, `rajada: { tiros, pausa }` | Um clique dispara `tiros` na cadência, depois uma pausa mínima; segurar não repete (o grampeador) | [[Weapons]] |
| Bagos (en: pellets) | `bagos`, `cone`, `pelletSpread`, `Pellet`, `pelletsOf` | Os projéteis de um tiro de garrucha: cada um é um raio próprio num cone fixo, e cada um que acerta é um acerto (`hit`) próprio | [[Weapons]] · [[Damage System]] |
| Coice na tela | `coiceVisual`, `viewmodel.kick(mul)` | Multiplicador do tranco visual da arma em 1ª pessoa (revólver ×1,6, garrucha ×2, pistolão ×2,5); não muda a mira | [[Weapon Models]] |

## Mapas

| Termo | Significado | Nota |
|---|---|---|
| `rua` / Rua dos Vizinhos | Mapa padrão (`DEFAULT_MAP`), de dia | [[Map - Rua dos Vizinhos]] |
| `jardim` / Jardim do Dragão | Propriedade chinesa noturna com 6 setores em volta do anel | [[Map - Jardim do Dragão]] |
| `halloween` / Vila Assombrada | Cidade de Halloween com 8 regiões e esgoto | [[Map - Vila Assombrada]] |
| `cemiterio` / Cemitério da Capela | Cemitério murado do modo zumbi, exclusivo dele (`exclusivo: 'zumbi'`) | [[Map - Cemitério da Capela]] |
| Mapa exclusivo / mapas abertos | `exclusivo` nos dados do mapa, `modeAllowsMap` | Um mapa feito para um modo só (o cemitério); os abertos são os outros, os únicos dos modos versus, dos bots e do campo de tiro | [[Maps Index]] |
| Alameda / Travessa / terraço | — | A avenida do Portão Principal até a capela (a zona de abate), o caminho entre as brechas laterais e a frente elevada da capela | [[Map - Cemitério da Capela]] |
| `principal` | Id da antiga sala fixa da Rua (até a PF-6) | [[Sessions]] |
| Amora | Chow Chow da Rua; quem entra na faixa em frente à casinha morre com uma mordida | [[Map - Rua dos Vizinhos]] |
| Anel | Corredor entre a Casa Principal e os setores do Jardim | [[Map - Jardim do Dragão]] |
| Setores do Jardim | Santuário Ancestral, Jardim de Bonsai, Lago de Lótus, Pátio das Lanternas, Pátio dos Guerreiros, Vale do Bambu | [[Map - Jardim do Dragão]] |
| Regiões da Vila | Floresta, Estrada Maldita, Cemitério, Mansão, Vila, Parque, Praça da Lua Cheia, Esgoto | [[Map - Vila Assombrada]] |
| `killY` / void | Altura abaixo da qual se morre por queda (−20 nos mapas em código, −10 na arena) | [[World Structure]] |
| `spawnsA` / `spawnsB` / `spawnsFFA` | Pontos de nascimento: lado A (treino), lado B (sem uso), neutros (online e bots) | [[Spawn Design]] |
| `?mapa=` | Parâmetro de URL que abre a prévia de um `.glb` | [[Map - Arena Teste (glTF)]] |
| Convenções glTF (`COL_`, `NOCOL`, `SPAWN_A_`/`SPAWN_B_`/`SPAWN_FFA_`, `DUMMY_`, `KILLVOLUME`, `GAG_`, `MAT_<superfície>`) | Nomes de objetos no Blender que viram colisores, spawns, bonecos, zona de morte, piadas e materiais | [[Asset Pipeline]] |
| `blocker` / `ironFence` | Barreiras que param jogadores e granadas, mas não balas | [[Cover & Combat Spaces]] |
| `critters` | Coisas pequenas que tiro e faca acertam sem colisor próprio (carpas, frutas, rato, abóboras) | [[Interactive Objects]] |
| `gentle` | Escada com degraus extras para ficar abaixo de 45° | [[ADR - Escadas com colisão em rampa sólida]] |
| `seeded` | Gerador aleatório com semente: a colisão sai idêntica em todos os clientes | [[ADR - Aleatoriedade com semente na construção dos mapas]] |
| `pose` (`Peca.pose`) | Giro livre e deslocamento que o gizmo do editor dá a uma peça inteira (P32) | [[ADR - Mapas como dados com catálogo de peças]] |
| Grupo (`tipo: 'grupo'`, `Peca.pai`) | Peça sem geometria da Hierarchy do editor; a pose dela é o referencial das peças que a nomeiam em `pai` | [[World Structure]], [[Map Editor UI]] |
| Lote do editor (`EditorBatches`) | `BatchedMesh` em que o editor desenha as peças fora da seleção (P46) | [[ADR - Lotes do editor com BatchedMesh]] |
| Pivô / Centro (Pivot / Center) | Onde fica o gizmo do editor: na peça ativa, ou no meio da caixa da seleção (o ponto em volta do qual ela gira e escala) | [[Map Editor UI]] |
| Local / Global | Eixos do gizmo do editor: os da peça ativa, ou os do mundo | [[Map Editor UI]] |
| Encaixe (snap) e Grade | O gizmo do editor anda em passos (0,5 m e 15° por padrão) com Ctrl segurado, ou sempre com o botão Grade | [[Map Editor UI]] |
| Retângulo (Rect Tool, T) | Ferramenta do editor: retângulo sobre a seleção que move, estica caixas, salas e colisores e escala o resto pelos cantos | [[Map Editor UI]] |
| Pivô da câmera | O ponto que a câmera do editor olha, à distância dela; a órbita, a roda e o F giram em volta dele | [[Map Editor UI]] |
| Projeto (Project) / miniatura | Painel do editor com os tipos do catálogo por pasta em miniaturas desenhadas pelo próprio editor e guardadas no navegador (IndexedDB `oc-editor`); arrastar cria a peça | [[Map Editor UI]] |
| Play / aba Jogo (Game) | ▶ joga o mapa em edição numa página própria posta sobre a aba Jogo (`?jogoEditor=`); ❚❚ congela, ■ termina e devolve o editor como estava | [[Map Editor UI]], [[ADR - Editor de mapas no jogo]] |

## Combate e dados

| Termo | Significado | Nota |
|---|---|---|
| Bloom (`porTiro`) | Dispersão acumulada a cada tiro | [[Weapons]] |
| `keep` | Fração do dano que sobra depois de atravessar superfícies (penetração) | [[Damage System]] |
| `KillKind` | Causa da morte: `gun`, `head`, `groin`, `knife`, `grenade`, `fall`, `void`, `explosion`, `dog` | [[Scoring]] |
| `LETHAL_DAMAGE` | 9999: dano que mata qualquer um | [[Constants Reference]] |
| Prêmio (`Award`, `AwardLabel`) | Bônus de pontos de um abate | [[Scoring]] |
| Traçante (`tracanteACada`) | Um traçante a cada N tiros (3) | [[Visual Effects]] |
| Luneta / scoped | Mira ampliada com overlay em CSS | [[Camera]] |
| XP de arma / XP da conta | `weapon_progress.xp` por arma (rifle, pistola, smg, faca, granada); `ACCOUNT_XP` e `nivel_conta.json` para a conta | [[Progression]] |
| `troca` (tempo de saque) | Segundos para a arma subir depois de uma troca; nada atira, mira ou recarrega nesse tempo | [[Weapons]] |

## Rede e servidor

| Termo | Significado | Nota |
|---|---|---|
| `NET` | Constantes de rede: tick e envio a 20 Hz, interpolação de 100 ms, 10 jogadores, respawn 5 s, porta 8787, `/ws` | [[Networking Overview]] |
| `ClientMsg` / `ServerMsg` | Uniões das mensagens JSON do WebSocket, identificadas pelo campo `t` | [[Remote Calls]] |
| `snap` / `scores` / `joined` / `progresso` | Snapshot de todos os jogadores (20 Hz) / placar (1 Hz) / estado completo para quem entra / XP e níveis da conta | [[Replication]] |
| Ticket do WebSocket | Token de uso único, 30 s, Redis `ws:ticket:<sha256>`, obtido em `POST /api/ws-ticket` | [[ADR - Ticket de uso único para o WebSocket]] |
| `CLOSE.revoked` (4001) / `CLOSE.replaced` (4002) | Conexão revogada / mesma conta conectada em outro lugar | [[Sessions]] |
| `LAG_SLACK` / `PICKUP_SLACK` | Folga de 4 m (+10%) nos acertos / 1,5 m para pegar itens | [[Validation]] |
| `serverNow` | Relógio do servidor estimado pelo cliente a partir do ping | [[Synchronization]] |
| `hold()` / `release()` | Enfileira as mensagens do servidor enquanto o mapa carrega | [[Events & Messaging]] |
| `LiveAccount` / `ProgressDelta` / flush | Perfil em memória / ganho ainda não gravado / gravação no banco a cada 60 s ou ao sair | [[Save System]] |
| Participação (`session_participation`) | Uma estadia numa sala: o equivalente persistido de "partida" | [[Player Data]] |
| Tag `Nome#1234` / discriminator | Nome exibido mais um número de 1 a 9999; único ignorando maiúsculas | [[Player Data]] |
| `oc_sessao` | Cookie HttpOnly da sessão de login (30 dias deslizantes; o banco guarda o SHA-256) | [[Authentication]] |
| `oc:revogacao` / `oc:silencio` | Canais Redis de revogação de conexão e de silêncio do chat | [[Events & Messaging]] |
| Sanção (`ban`, `chat_mute`) | Punição na tabela `sanction` (7d, 12h, 30m ou permanente) | [[Moderation]] |
| `admin` / `offensive` | Console de moderação (`tools/admin.ts`) / CLI que sobe a pilha Docker (`tools/offensive.ts`) | [[Moderation]] · [[Local Development]] |
| BFF | O servidor guarda a sessão; o navegador nunca vê o token | [[ADR - Sessão em cookie HttpOnly com servidor como BFF]] |
| Carência de exclusão | 30 dias antes de anonimizar a conta ("Jogador excluído") | [[Sensitive Data]] |
| `outbox` | Fila de e-mails em memória quando não há SMTP (o link vai para o log) | [[External Services]] |
| `ORIGENS_PERMITIDAS` / `DISCORD_RETORNOS` | Origens extras aceitas / URLs de retorno do OAuth do Discord | [[Configuration Reference]] |

## Código e arquitetura

| Termo | Significado | Nota |
|---|---|---|
| `boot()` | Função de `client/main.ts` que monta e roda o cliente inteiro | [[Client Architecture]] |
| `startServer()` | Função de `server/app.ts` que monta o servidor (Bun.serve, lobby, flush, Redis) | [[Server Architecture]] |
| `Conn` / `Peer` / `SPlayer` | Conexão de socket / dados presos ao socket / jogador dentro de uma sala (servidor) | [[Server Architecture]] |
| `HomeChoice` | O que a tela inicial devolve: `offline`, `bots` (com `game`, o modo de jogo) ou `online` (o modo vem da sessão) | [[Client Architecture]] |
| `SessionMode` / `MODE_RULES` | Lado do servidor de um modo de jogo (ganchos chamados pela `Session`) / regras declaradas de cada modo | [[ADR - Modos de jogo com regras declaradas e ganchos no servidor]] |
| `soFaca` | Campo do `Loadout`: só a faca, sempre na mão, o tiro golpeia (a faca `sabre` da corrida armada) | [[Melee]] · [[Gun Game]] |
| `GameMap` / `MapFrame` | Contrato que todo mapa devolve / informações por quadro passadas ao mapa | [[World Structure]] |
| `MapBuilder` / célula | Construtor de mapas que funde geometria por (material, célula de 40/45/60 m) e cria colisores | [[ADR - Lotes estáticos por material e célula]] |
| `PropBus` | Registro que sincroniza piadas de mapa (gatilho local → mensagem `prop` → `remote`) | [[Map Gags]] · [[Events & Messaging]] |
| `Target` / `Humiliable` / `HitboxRegistry` / `Combatant` | Contratos que o código de combate usa nos 3 modos | [[Client Architecture]] |
| `BotManager` / `Bot` / `BOT_SKILLS` / `NavMap` | Gerente da partida contra bots / um bot / tabela de dificuldades / navmesh Recast | [[AI Overview]] |
| Modos do bot (`roam`, `engage`, `chase`, `flee`, `toTaunt`, `taunt`) | Estados de comportamento dos bots | [[States]] |
| `GrenadeThrower` | A mão do jogador como máquina de estados (cozinhar, arremessar, recarga) | [[Controllers]] |
| `ArsenalChoice` | O que o jogador escolheu no Arsenal e a conta guarda: `{ primaria, secundaria, faca, ligadas, desligadas }` (rifle, secundária e faca; opcionais ligadas e comuns desligadas por progressão); sempre limpo por `sanitizeChoice` | [[Shared Systems]] · [[Player Data]] |
| `Loadout` | O que o jogador leva na partida: `{ primaria, secundaria, ativas }` (arma de cada espaço e melhorias em efeito por arma), resolvido por `resolveLoadout(choice, níveis)` e replicado em `playerLoadout` | [[Shared Systems]] · [[Inventory]] |
| `gunStats` / `meleeStats` / `grenadeStats` | Atributos efetivos de uma arma com uma lista de melhorias (`shared/arsenal.ts`); cliente e servidor usam as mesmas funções | [[Shared Systems]] · [[Weapons]] |
| `GunId` / `KnifeId` / `WeaponId` / `ProgWeapon` | Armas de fogo (os sete rifles, `pistola`, `grampeador`, `smg`, `revolver`, `furadeira`, `garrucha`, `pistolao`) / as sete facas / qualquer arma (+ `granada`) / as cinco progressões (`rifle`, `pistola`, `smg`, `faca`, `granada`) | [[Shared Systems]] |
| `SIM` | Passo fixo da simulação (1/60 s, até 5 passos por quadro) | [[ADR - Simulação em passo fixo com render interpolado]] |
| `FLAG` | Bits de animação enviados junto com o estado | [[Replication]] |
| `HttpError` / `ApiError` / `ApiErrorCode` | Códigos de erro estáveis em snake_case português | [[Error Handling]] |
| `oc.settings.v1` / `oc.bots` | Chaves do `localStorage`: preferências / escolhas da aba Jogar (lugar, tipo, mapas, bots) | [[Settings]] · [[Save System]] |
| `__oc` | Handle de depuração no `window`, só em dev (perf, stats, trace) | [[Troubleshooting]] |
| F3 / F4 / F6 | Overlay de depuração / hitboxes e navmesh / painel de ajuste | [[Troubleshooting]] |
| PadNav | Navegação dos menus pelo controle | [[Input & Controls]] |
| Trilho / painel do menu de pausa | O trilho (`.pm-rail`: onde se está, voltar, as duas abas, a saída) e o painel da aba aberta (`#pm-panel`) do menu de pausa e do cartão de início; `pauseContext` diz o que o trilho mostra em cada lugar × modo | [[Menus]] · [[ADR - Menu de pausa com trilho e abas]] |
| `data-pad-back` / `data-pad-explicit` / `data-pad-subtabs` | Marcas para o `PadNav`: o botão que ◯/B aperta / tela que marca o seu voltar em cada nível (sem chutar pelo texto) / subabas que L1/R1 só trocam quando não há outra barra | [[Menus]] |
| Galpão | `GalpaoHome`, `createGalpao`, `#galpao`, `oc.galpao` | A tela inicial logada em 3D: um galpão com sete **estações** (objetos que seguram as abas: mesa, cortiça, painel perfurado, revista, armário, quadro elétrico, monitor); a home clássica fica sem GPU ou com `oc.galpao` = 'off' | [[Menus]] · [[ADR - Tela inicial em galpão 3D]] |
| Superfície (galpão) | `.gp-surf`, `bindSurface`, homografia | O elemento DOM de uma estação, preso ao objeto 3D por uma `matrix3d` a cada quadro | [[ADR - Tela inicial em galpão 3D]] |
| Canvas do Arsenal | `ArsenalCanvas`, `canvasLayout`, `data-pad-pan` | A aba Arsenal da tela inicial: quadros por espaço, armas e melhorias ligadas, câmera com arrastar e zoom, painel de detalhes | [[Inventory UI]] · [[ADR - Arsenal da tela inicial em canvas]] |
| Primária / Alternativa | Os dois espaços de tecla de cada ação | [[ADR - Teclas remapeáveis com primária e alternativa]] |

## Renderização e arte

| Termo | Significado | Nota |
|---|---|---|
| Viewmodel | Braços e arma em 1ª pessoa, em cena e câmera próprias (FOV 58°) | [[ADR - Viewmodel em cena e câmera próprias]] |
| `VM_FEEL` / `ANIM` | Números de "sensação" da 1ª pessoa (balanço, recuo...) / da animação procedural em 3ª pessoa | [[Animation]] |
| Superfície (`SurfaceKey`) | Chave da biblioteca de materiais do mapa (20 chaves): textura, repetição em metros e física | [[Materials]] · [[Material Palette]] |
| Tint | Cor por vértice que multiplica a textura | [[ADR - Texturas procedurais claras tingidas por vértice]] |
| Pintor (`PAINTERS`) / `metros` / `tingir` | Função que pinta a textura em canvas / tamanho de uma repetição / campo do `manifest.json` | [[Procedural Textures]] · [[Texture System]] |
| `toonGradient` | Rampa toon de 3 tons [95, 175, 255] | [[ADR - Toon shading com rampa de 3 tons]] |
| Atmosphere / `shadowExtent` | Céu, névoa e luzes de um mapa / meia-largura da câmera de sombra | [[Lighting]] |
| `LightSpot` / `LightPool` / `LanternLights` | Pontos de luz e o pool fixo de luzes reais (6 no Jardim, 10 na Vila) | [[ADR - Pool fixo de luzes reais]] |
| Glow | Mesh único, sem iluminação, das coisas acesas | [[Lighting]] |
| Bake (personagem) | Fusão do personagem num SkinnedMesh com cores nos vértices e 3 LODs | [[ADR - Personagem bakeado em um mesh com LOD]] |
| Atlas de paleta / canais P/S/D / `_TINT` / `_REGION` | Textura 256² dos personagens / cores primária, secundária e detalhe / atributos de canal e região do corpo | [[Character Customization]] |
| Qualidade automática | Baixa/média/alta mais resolução dinâmica (piso 45 FPS, meta 57) | [[ADR - Qualidade automática com resolução dinâmica]] |

## Áudio

| Termo | Significado | Nota |
|---|---|---|
| `Sfx` | Motor de som procedural (Web Audio) | [[SFX]] |
| `SPATIAL_KINDS` (`gun`, `boom`, `step`, `normal`, `loud`, `ambient`) | Categorias de propagação do som (alcance, eco, prioridade) | [[Spatial Audio]] |
| Oclusão | Abafamento atrás de paredes, por raycast, com peso por material (papel 0,25, vidro 0,35, madeira 0,7, resto 1) | [[Spatial Audio]] |
| Enclosure | Medida de 0 a 1 de quão fechado é um ponto (controla o eco) | [[Spatial Audio]] |
| `BodySounds` | Passos, pouso, deslize e recarga dos outros, deduzidos do movimento replicado | [[SFX]] |
| HRTF "Fone (3D)" / equalpower "Caixa de som (estéreo)" | Modos de som espacial; "Automático" usa estéreo no celular | [[Spatial Audio]] |

## Documentos citados no código e ausentes do repositório

O código cita um "documento de design (seção N)", um "Guia de Estilo de Personagens", o `README_Halloween.md` e um "plano de autenticação (P27)". Nenhum deles está no repositório; ver [[Documentation Status]].
