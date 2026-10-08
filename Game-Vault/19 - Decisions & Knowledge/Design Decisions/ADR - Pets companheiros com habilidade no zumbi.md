---
title: ADR - Pets companheiros com habilidade no zumbi
type: decision
status: documented
area: gameplay
source_paths:
  - shared/pets.ts
  - shared/data/pets.json
  - shared/zombieMatch.ts
  - shared/modes.ts
  - shared/protocol.ts
  - server/accounts.ts
  - server/session.ts
  - server/modes.ts
  - server/migrations/007_pets.sql
  - client/pets/rig.ts
  - client/pets/species.ts
  - client/pets/manager.ts
  - client/world/dog.ts
  - client/ui/galpao/petStage.ts
  - client/ui/pets.ts
tags:
  - game
  - decision
  - pets
  - zombies
updated: 2026-10-08
---

# ADR - Pets companheiros com habilidade no zumbi

> Origem: PF-29 (plano aprovado na versão 2 da página "PF-29 PLANO", com o parecer de UI/UX e câmera da PF-36 e as respostas P23 a P26 do dev). A versão anterior do plano (pets só com o pacote de apoio, mordida com dano, seção no Personalizar, nome visível para todos) foi **substituída** por esta.

## Contexto

Dois pedidos chegaram juntos: pets que acompanham o jogador (vindo da PF-26) e, de outro dev, a Amora da Rua dos Vizinhos e uma Bruxinha chibi como pets, com um lugar no galpão. O modo zumbi é cooperativo e já tem uma economia cuidadosa (dinheiro, caixão, barricadas); o PvP depende de leitura limpa (posição, mira).

## Problema

Dar identidade e um motivo para ter um pet sem vender vantagem agora, sem atrapalhar a leitura do PvP, sem criar moderação de nomes e sem tocar a escolha de alvo dos zumbis.

## Opções consideradas

- **Um sistema de pets só, grátis por enquanto, com uma habilidade de controle ou suporte por pet no zumbi e enfeite no PvP** (escolhida).
- Pets só para o pacote de apoio, mordida com dano, distração comum, extras com dinheiro e pente (a versão anterior). Descartada no realinhamento entre o dev e o Gregory: venderia vantagem e mexeria na economia.
- Pets atacáveis pelos zumbis. Descartada (P15): mexeria na escolha de alvo e no tom.
- Uma tecla para acionar a habilidade. Descartada (P20): celular e controle não têm botão livre, e ninguém pode lucrar parado nem roubar abate.
- Nome do pet visível para todos. Descartada (P17/P22): exigiria moderação nova.

## Decisão

1. **Seis pets** no catálogo (`shared/pets.ts`): Amora, Bruxinha, gata, fuinha, lontra e iguana, todos `libera: 'livre'` por enquanto; o campo já existe para as versões pagas (PF-28).
2. **Zumbi (PvE): habilidade automática com recarga por pet**, sem tecla, **sem dano e sem dinheiro**, decidida pelo motor da partida (o servidor online, o navegador no solo). Números em `shared/data/pets.json`. O pet é **invulnerável e ignorado** (não existe no motor: só o efeito no zumbi ou no dono).
3. **A Sétima Vida nunca toma o lugar de uma reanimação**: pausa enquanto um colega reanima e nunca entra em `reviving`/`revives` (o colega continua vendo o aviso). Caído com a gata vindo não é derrota (P23), e o solo ganha o estado "caído" só para quem leva a gata.
4. **PvP: só enfeite**, coleira curta (0,7 m da borda do corpo), sem som, some quando o dono não está à vista, entra na dança; interruptor "Esconder pets dos outros" (Vídeo, só PvP, no aparelho). Contra bots e campo de tiro contam como PvP.
5. **Nome só para o dono**, 2 ou 3 pelagens por espécie (menos a Amora), 8 cores de coleira, personalização guardada por pet; acessórios ficam para as versões pagas.
6. **Nada da posição do pet trafega**: cada jogo desenha o pet seguindo o dono. A rede só leva `PlayerInfo.pet` (sem o nome), o evento `zpet` e os bits `ZF.held`/`ZF.duck`.
7. **Tudo em código**, como a Amora do mapa, no máximo 2 mil triângulos por pet e versão leve; a Amora pet sai do **mesmo construtor** da Amora do mapa, que não muda.
8. **Assinatura comum das habilidades** (pata na cor da coleira por até 1,5 s, som curto abaixo dos avisos, um latido/miado a cada 2 s, ícone piscando só para o dono), sem cores ou formas reservadas aos avisos do modo.
9. **Galpão: estação 07 · PETS na porta da frente** com quintal de verdade ("os pets moram lá fora"; um por vez entra), escolher não é equipar ("Levar este"), troca curta e interrompível; o Gerenciamento passa a 08. Ver [[ADR - Tela inicial em galpão 3D]] (revisão).

## Motivo

- Ninguém paga por vantagem agora e o modo não ganha dinheiro novo; o equilíbrio vem da recarga, fácil de ajustar.
- O PvP não perde leitura: o pet nunca entrega uma posição que o dono não entrega.
- Sem nome público, sem moderação nova.
- Sem rede nova de posição: o custo de banda é zero.

## Consequências

- Mais um campo no perfil (`player_profile.pet`, migration `007_pets.sql`) e no `PATCH /api/perfil`.
- O motor do zumbi ganhou estados por zumbi (`heldUntil`, `duckUntil`, `dazeUntil`, `lureUntil`) e um gancho opcional `ZombieHost.health` (a iguana).
- Dez pets na tela custam até ~20 mil triângulos e uma chamada de desenho cada.
- Equilíbrio sem teste com jogadores reais, somado às vantagens da PF-19.
- O pet atravessa paredes ao seguir o dono (sem física).

## Código afetado

`shared/pets.ts`, `shared/data/pets.json`, `shared/modes.ts`, `shared/protocol.ts`, `shared/zombies.ts`, `shared/zombieMatch.ts`, `shared/account.ts`, `server/migrations/007_pets.sql`, `server/accounts.ts`, `server/api.ts`, `server/session.ts`, `server/modes.ts`, `client/pets/*`, `client/world/dog.ts`, `client/zombies/{client,view,local}.ts`, `client/character/animator.ts`, `client/ui/{pets,hud,home,menu}.ts`, `client/ui/galpao/{petStage,petBoard,scene,galpao,galpaoRules}.ts`, `client/core/settings.ts`, `client/audio/sfx.ts`, `client/main.ts`, `index.html`, `client/styles.css`.

Relacionado: [[Pets]] · [[Zombie]] · [[Menus]] · [[HUD]] · [[Player Data]] · [[Remote Calls]]
