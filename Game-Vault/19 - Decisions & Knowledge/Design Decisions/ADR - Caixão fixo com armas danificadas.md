---
title: ADR - Caixão fixo com armas danificadas
type: decision
status: documented
area: design
source_paths:
  - shared/data/zumbi.json
  - shared/zombies.ts
  - shared/zombieMatch.ts
  - shared/arsenal.ts
  - shared/protocol.ts
  - server/modes.ts
  - client/zombies/coffin.ts
  - client/zombies/client.ts
  - client/zombies/ambience.ts
  - client/main.ts
  - client/ui/hud.ts
tags:
  - decision
  - adr
  - design
  - zombies
  - economy
updated: 2026-10-06
---

# ADR - Caixão fixo com armas danificadas

> Substitui a parte do **pato de borracha** (o caixão que devolve o dinheiro e muda de lugar) do item 3 de [[ADR - Modo zumbi cooperativo com caixão e raridades]]. O resto daquela decisão (preço, raridades, sorteio no servidor, lugar da arma) continua valendo.

## Contexto

Pedido do usuário: "sobre a caixa mudar de posição como mecânica de azar: em vez de mudar, quero que ela dê versões danificadas das armas, com menos munição ou menos dano. Assim, mesmo que o jogador pegue uma lendária, ainda tem uma pequena chance de vir quebrada." Antes, a partir da 4ª rodada no mesmo lugar, cada rodada tinha 15% (+5% por rodada) de sair um pato: o dinheiro voltava e o caixão voava para outro dos 5 lugares do mapa. No mapa novo e compacto do modo ([[Map - Cemitério da Capela]]) o caixão tem um lugar só.

## Problema

Manter um "azar" no caixão sem tirá-lo do lugar, que afete até as armas mais raras, sem esconder informação do jogador e com a penalidade valendo onde o jogo decide o dano (o servidor).

## Opções consideradas

- **Manter o pato, sem mudar de lugar** (só devolve o dinheiro): sem custo real, não é azar.
- **Raridade "quebrada" separada** (um sexto nível): a lendária nunca viria danificada, contra o pedido.
- **Defeito sorteado por cima da raridade** (escolhida): qualquer arma pode vir danificada, com chance que cai com a raridade.
- Conserto: **pagar para consertar** (mais um preço, outro `E`, outra regra) × **sem conserto, só outra rodada** (escolhida).

## Decisão

1. O caixão **não sai do lugar**: um ponto só por mapa (`mapas.<id>.caixa`); os estados são parado, girando e oferecendo. O pato, o voo e os sons dele saíram.
2. **Toda rodada** pode vir **danificada** (`caixa.danificada`, sorteado no servidor junto com a arma, revelado quando o caixão para):

| Raridade | Chance de vir danificada |
|---|---|
| Comum | 25% |
| Rara | 18% |
| Épica | 12% |
| Lendária | **6%** (nunca zero) |

3. **O defeito** (pesos): **menos munição** 45%, **menos dano** 45%, **os dois** 10% (o raro). Penalidades: menos munição = **60% do pente e 50% da reserva** (a reserva ×3 do modo já vem cortada); menos dano = **×0,75** no dano contra zumbis (a raridade continua multiplicando: uma lendária danificada fica em ×2,625, um pouco acima de uma épica). O **Sabre** não tem munição: o defeito dele é sempre menos dano.
4. **Onde vale**: o dano no **servidor** (`weaponMul` multiplica a raridade pela penalidade; é o mesmo multiplicador da validação dos acertos online e do jogo solo); a munição no **cliente** (`zombieGunData` monta a arma com menos pente e reserva a partir de `Loadout.danificadas`, que o servidor manda junto com o equipamento).
5. **Sem conserto**. Uma arma danificada fica assim até ser trocada. Para se livrar dela: deixar a oferta expirar (8 s) e girar de novo, ou girar até outra arma do mesmo lugar sair. Uma **cópia danificada na mão pode sair de novo do caixão** (inteira, se der sorte); uma intacta nunca repete (a regra antiga).
6. **Apresentação**: a arma flutua torta, com brilho mais avermelhado e piscando, sob uma placa "DANIFICADA" com uma rachadura; o caixão toca um acorde azedo em vez do sino; faixa "Saiu DANIFICADA: …" para quem pagou; o prompt diz o defeito antes de pegar; no HUD o nome da arma ganha a etiqueta com o ícone de rachadura (na cor da raridade); na pausa, cada arma carregada mostra o defeito com os números e cada raridade, a chance de vir danificada.

## Motivo

- O azar passa a ser uma escolha informada: o jogador vê o defeito antes de pegar e decide se fica com uma lendária ruim ou gira de novo.
- Chance decrescente mantém a raridade valiosa; nunca zero atende ao pedido ("mesmo a lendária").
- Sem conserto: nenhuma regra nova de economia; o dinheiro continua indo para o caixão e as barricadas.

## Consequências

- `BoxInfo` perdeu `spot` e ganhou `flaw`; `BoxState` perdeu `duck`/`moving` ([[Remote Calls]]). `ZItems` ganhou `danificadas` (por lugar) e `Loadout` ganhou `danificadas` (por arma), mantido por `sanitizeLoadout`.
- A matriz de progressão × modos cobre todas as combinações do caixão, danificadas incluídas ([[Integration Tests]]).
- `caixa.patoApos`, `patoChance`, `patoAumento`, `patoSegundos`, `mudarSegundos` saíram do JSON; `duckChance` saiu do código.

## Código afetado

`shared/data/zumbi.json` (`caixa.danificada`), `shared/zombies.ts` (`rollFlaw`, `flawChance`, `flawDamageMul`, `flawAmmo`, `zombieGunData`, `withItem`, `weaponMul`, `rollBox`), `shared/zombieMatch.ts` (caixão sem pato), `shared/arsenal.ts` (`WeaponFlaw`, `Loadout.danificadas`), `shared/protocol.ts`, `client/zombies/coffin.ts`, `client/zombies/client.ts`, `client/zombies/ambience.ts`, `client/ui/hud.ts`, `client/main.ts`, `client/audio/sfx.ts` (`coffinBroken`).

Relacionado: [[Zombie]] · [[Economy Design]] · [[Weapons]] · [[ADR - Modo zumbi cooperativo com caixão e raridades]]
