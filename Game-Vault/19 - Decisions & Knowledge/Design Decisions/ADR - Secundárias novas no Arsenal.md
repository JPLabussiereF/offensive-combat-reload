---
title: ADR - Secundárias novas no Arsenal
type: decision
status: documented
area: design
source_paths:
  - shared/data/weapons/grampeador.json
  - shared/data/weapons/revolver.json
  - shared/data/weapons/furadeira.json
  - shared/data/weapons/garrucha.json
  - shared/data/weapons/pistolao.json
  - shared/weapons.ts
  - shared/progression.ts
  - shared/data/corrida_armada.json
  - shared/data/zumbi.json
  - server/session.ts
  - server/modes.ts
  - client/weapons/weapon.ts
  - client/weapons/hitscan.ts
  - client/main.ts
  - client/ai/bot.ts
  - client/ai/botGuns.ts
  - client/ai/bots.ts
  - client/render/weaponModels.ts
  - client/render/viewmodel.ts
  - client/audio/sfx.ts
  - client/audio/gunVoices.ts
  - client/ui/strings.ts
  - client/ui/ladder.ts
tags:
  - game
  - decision
  - weapons
  - progression
updated: 2026-10-07
---

# ADR - Secundárias novas no Arsenal

> [!info] Origem
> Issue PF-10 do Jira ("Armas secundárias"), com as decisões P1 a P18 respondidas pelo dev no chat em 07/10/2026 (plano "PF-10 PLANO" no Confluence, espaço PF). Segue o precedente de [[ADR - Rifles e facas antigos como armas próprias]] (armas próprias sobre progressões compartilhadas, trava em pontos no JSON da arma).

## Contexto

A linha Secundária do Arsenal tinha só duas armas: a Pistola do Porteiro (padrão) e a Submetralhadora Liquidificador (1.800 pontos de pistola). A primária ganhou seis rifles e a faca seis facas na PF-8, e a secundária ficou para trás.

## Problema

- Mais secundárias, cada uma com uma identidade cômica e um nicho de jogo, sem criar uma "melhor secundária" e sem mexer no banco (`weapon_progress` só aceita as 5 progressões).
- O tipo `WeaponData` já previa `modo: 'rajada'`, mas nada o implementava; e nenhuma arma atirava mais de um projétil por disparo.

## Opções consideradas

- **Progressão**: própria por arma (migration nova, recomeçar do zero) × compartilhada (escolhida: grampeador, revólver, garrucha e pistolão usam a da pistola; a furadeira, a da submetralhadora — P2/P3).
- **Trava**: pelos pontos da progressão de cada uma × todas pelos pontos de pistola (escolhida, inclusive a furadeira: 700, 3.200, 5.200, 7.000 e 9.000; a submetralhadora continua 1.800 — P4).
- **Diferença entre as armas**: cada uma ganha um nicho estreito (escolhida, P10) × progressivamente melhores.
- **Efeitos cômicos de gameplay** (grampo que prende, furadeira que atravessa paredes…): fora (P6). A graça fica no nome, no modelo e no som.
- **Rajada**: segurar repete × um clique, uma rajada, segurar não repete (escolhida, P7).
- **Bagos**: dano em área / um único raio com dano multiplicado × um raio por bago, cada acerto um `hit` próprio (escolhida, P8), com o limite de acertos do servidor multiplicado pelos bagos só para essa arma.
- **Modelos**: `.glb` do Blender × procedurais como as outras armas (escolhida, P11).
- **Sons**: um som por arma, sem sons contínuos (escolhida, P12).

## Decisão

1. **Cinco armas novas**, cada uma com o seu JSON em `shared/data/weapons/`, `slot: "secundaria"`, `icone` e `libera: { arma: "pistola", pontos }`. Ordem na linha (`GUN_IDS` depois dos rifles): `pistola`, `grampeador`, `smg`, `revolver`, `furadeira`, `garrucha`, `pistolao` — a ordem em que liberam.
2. **Ficha** (diferenças sobre a Pistola do Porteiro; o resto é igual a ela): ver a tabela em [[Weapons#Secundárias]]. Em resumo: 📎 **Grampeador do RH** (rajada de 3 a 1.100/min, pausa mínima 0,2 s), ⭐ **Revólver do Delegado da Quadrilha** (semi lento, 50→32, 6 balas, coice ×1,6 na tela), 🔩 **Furadeira do Vizinho de Domingo** (automática 1.200/min, 17→9 até 16 m, alcance 120 m), 🌵 **Garrucha do Cangaceiro** (8 bagos num cone fixo de 4,5°, 13→4 por bago até 12 m — **revisto em 2026-10-07 para 20→4 entre 5 e 15 m**, ver abaixo —, 2 tiros, alcance 40 m, sem penetração, coice ×2) e 💪 **Pistolão do Marombeiro** (semi lento, 60→40 até 40 m, 7 balas, coice ×2,5).
3. **Regra de equilíbrio (P10)**: com **qualquer** combinação das melhorias da sua progressão, nenhuma mata (no peito) mais rápido que o Rifle Padrão de 15 m em diante (rifle: 0,257 s até 30 m, 0,343 s a 40 m). Tiro único na cabeça só de perto: revólver até 10 m, pistolão até ~27 m (P9). Verificado por `server/tests/secondaries.test.ts`; nenhum valor do plano precisou mudar.
4. **`WeaponData`** ganha `rajada?: { tiros, pausa }`, `bagos?`, `cone?` (meio-ângulo em graus) e `coiceVisual?` (multiplicador só do coice na tela). `pelletsOf(arma)` e `hitsPerSecond(arma)` em `shared/weapons.ts`.
5. **Rajada** (`client/weapons/weapon.ts`): um clique (ou um toque mais curto que um tick) dispara `tiros` na cadência; depois do último, pelo menos `pausa` segundos; segurar não dispara outra (é preciso soltar). A rajada termina sozinha ao soltar o gatilho, mas para se a arma for guardada, a recarga começar, o sprint voltar, as mãos ficarem ocupadas (`holdFire`: faca, dança, granada, saque) ou o pente acabar.
6. **Bagos**: cada disparo sorteia os bagos uniformemente no cone fixo (não abre com movimento) em volta da direção do tiro, que tem a dispersão normal da arma. O cliente traça um raio por bago e cada bago que acerta vira um `hit` próprio (online), um dano próprio (bots, bonecos) ou um acerto próprio no zumbi. Um único `shot` por disparo vai para os outros (traçante e som), e o retorno de acerto (som e marcador) toca uma vez por disparo, com o melhor resultado.
7. **Servidor**: o limite de acertos por segundo passa a `(ceil(cadência/60) + 2) × bagos` (`hitsPerSecond`), na sessão e no modo zumbi; o repasse de `shot` continua limitado pela cadência (um por disparo). Formato do protocolo inalterado.
8. **Modos**: a corrida armada ganha os degraus `garrucha` e `grampeador` (sem melhorias) entre o rifle silenciado e a pistola ligeira — 9 degraus, 25 abates para vencer (P14/P17). O caixão do zumbi ganha os cinco, sem melhorias: grampeador e revólver comuns, furadeira e garrucha raras, pistolão épico (P15/P18).
9. **Bots**: continuam 60% rifle; os outros 40% sorteiam qualquer uma das 7 secundárias com a mesma chance (P16), com o gatilho certo (solto a cada outro tick em semi e rajada; um raio por bago).
10. **Apresentação**: um construtor procedural por arma na mão da pistola (`GUN_MODELS`; `holdOf` pelo `slot`: secundárias na mão da pistola, a submetralhadora curta, rifles longos); coice do viewmodel × `coiceVisual`; uma voz de tiro por arma (`SHOT_VOICES`) e recarga própria do revólver (tambor girando), da garrucha (abre e fecha) e da furadeira (bateria encaixando). O ícone do degrau da corrida armada vem da arma (`weaponIcon`).

## Motivo

- É o que a issue pediu: mais secundárias com identidade, sem mexer no banco nem na economia ([[Economy Design]]).
- Progressão compartilhada mantém o que cada conta já fez; a trava em pontos de pistola dá um prêmio novo a cada nível da pistola (e dois além do último, 7.000 e 9.000).
- Nichos estreitos + a regra contra o rifle evitam que uma secundária substitua a primária.
- Um `hit` por bago reaproveita toda a validação existente (arma em mãos, distância, penetração mínima, dano no servidor) sem mudar o protocolo.

## Consequências

- Uma mesma progressão vale para várias armas: as melhorias da pistola (gatilho, ponto vermelho, coldre, batata) valem no grampeador, no revólver, na garrucha e no pistolão; as da submetralhadora (motor, holográfica, tambor, coronha) na furadeira. A batata (silenciador) também vira um "silenciador de batata" nessas armas.
- A garrucha e o pistolão liberam acima do último nível da pistola (5.200): os pontos continuam contando depois do nível máximo.
- O limite de acertos da garrucha é 8× maior: um cliente trapaceiro pode mandar até 56 acertos/s (72 com o Gatilho) com ela. E os tiros únicos na cabeça do revólver e do pistolão pioram a lacuna da região do acerto confiada ao cliente ([[Problem - Lacunas de validação de gameplay online]]).
- **Revisão da garrucha (2026-10-07)**: no jogo, a 13 por bago com queda a partir de 3 m ela quase não matava (com o cone de 4,5°, só parte dos bagos acerta o tronco: um tiro só matava a ~2 m, menos que o bote da faca), e a faca valia mais que ela. O dano subiu para 20 → 4 por bago, com a queda entre 5 e 15 m; cone, cadência, pente e o mínimo ficaram iguais, então a regra P10 (nada mais rápido que o rifle de 15 m em diante) continua valendo. Detalhes em [[Weapons#Secundárias]].
- O Arsenal mostra 7 armas na linha Secundária ([[Inventory UI]]); as barras de atributo não mudaram de escala (o revólver e o pistolão enchem a barra de dano, a furadeira a de cadência).
- Cliente e servidor precisam ser publicados juntos (ids novos de arma em `hit.w`, `kill.arma` e `playerLoadout`).
- Fora do escopo: efeitos cômicos de gameplay, progressões próprias, lançadores/akimbo/projéteis, mudar valores das armas existentes, modelos do Blender, sons contínuos, mudar degraus existentes da corrida armada e a escala das barras do Arsenal.

## Código afetado

- `shared/data/weapons/{grampeador,revolver,furadeira,garrucha,pistolao}.json`, `shared/weapons.ts` (`rajada`, `bagos`, `cone`, `coiceVisual`, `pelletsOf`, `hitsPerSecond`), `shared/progression.ts` (`GunId`, `GUN_IDS`, `GUN_DATA_ID`, `GUN_PROG`), `shared/data/corrida_armada.json`, `shared/data/zumbi.json`
- `server/session.ts` (`fireRate`), `server/modes.ts`
- `client/weapons/weapon.ts` (rajada, `pelletSpread`, `Pellet`, `holdFire`), `client/weapons/hitscan.ts` (`offsetDir`), `client/main.ts` (tiro com N raios), `client/ai/bot.ts`, `client/ai/botGuns.ts` (`pickGun`), `client/ai/bots.ts`, `client/render/weaponModels.ts` (`GUN_MODELS`, `holdOf`), `client/render/viewmodel.ts` (`kick(mul)`), `client/audio/sfx.ts`, `client/audio/gunVoices.ts` (`SHOT_VOICES`), `client/ui/strings.ts`, `client/ui/ladder.ts`
- Testes: `server/tests/secondaries.test.ts` (novo), `client/tests/weapon.test.ts` (novo), `server/tests/arsenal.test.ts`, `modes.test.ts`, `zombies.test.ts`, `client/tests/arsenalTree.test.ts`, `arsenalText.test.ts`, `arsenalCanvasLayout.test.ts`, `offlineModes.test.ts`

Relacionado: [[Weapons]] · [[Progression]] · [[Inventory UI]] · [[Weapon Models]] · [[SFX]] · [[Gun Game]] · [[Zombie]] · [[Versus Bots]] · [[Anti Cheat]] · [[Validation]]
