---
title: ADR - Equipamento travado no mata-mata
type: decision
status: documented
area: design
source_paths:
  - shared/modes.ts
  - server/modes.ts
  - server/session.ts
  - server/app.ts
  - client/main.ts
  - client/ui/home.ts
  - client/ui/arsenal.ts
  - client/ui/pauseMenu.ts
tags:
  - game
  - decision
  - modes
  - weapons
updated: 2026-10-07
---

# ADR - Equipamento travado no mata-mata

> [!info] Revisão (07/10/2026, PF-11)
> [[ADR - Menu de pausa com trilho e abas]] mudou o item 5: na partida a aba Arsenal da pausa mostra o equipamento **em uso** (o loadout travado ao entrar, com nível e pontos ao vivo), só para consulta, com o selo "🔒 Só consulta"; uma melhoria liberada durante a partida aparece com "Vale na próxima partida". No **campo de tiro** a troca de arma passou para o cartão do espaço (as armas liberadas com Equipar) e as melhorias ligam e desligam ali. As regras de travamento (itens 1 a 4 e 6) não mudaram.

## Contexto

Com a [[ADR - Progressão por melhorias de arma]], o jogador podia mudar o Arsenal pelo menu de pausa em plena partida, e cada nível que subia aplicava na hora as melhorias comuns (o servidor anunciava o loadout novo a todos). O usuário pediu que, no modo padrão **mata-mata**, o equipamento só possa ser escolhido **antes** de começar a partida; a troca automática ao subir de nível fica para a [[ADR - Corrida armada]].

## Problema

As partidas online não terminam ([[Problem - Partidas sem fim]]): é preciso definir o que é "a próxima partida", e o servidor precisa recusar mudanças no meio dela.

## Opções consideradas

- **Aceitar a mudança no meio da partida e só aplicá-la na próxima** (guardar a escolha). Exige o menu de pausa editável com regras confusas ("mudou, mas não mudou") e esconde do jogador quando vale.
- **Recusar a mudança** e editar o Arsenal só na tela inicial (adotada). O menu de pausa mostra o Arsenal só para leitura.
- "Partida" = rodada com fim — não existe no mata-mata hoje.

## Decisão

1. **"Partida" no mata-mata = a estadia numa sessão.** O loadout é resolvido **ao entrar** na sessão (`mode.joinLoadout` → `loadoutOf(conta)`) e fica fixo até sair. Sair para a tela inicial e entrar de novo (em qualquer sessão) pega a escolha nova e as melhorias liberadas.
2. **Escolha no saguão**: a aba Arsenal da tela inicial continua editando a conta (`PATCH /api/perfil`); antes de `join`/`create` o cliente manda `loadout` com a escolha, e o servidor a aplica **no saguão** (fora de sessão). Isso também mantém a conta em memória do servidor igual à do banco.
3. **Servidor recusa** `loadout` dentro de uma sessão com `lockedLoadout` (responde só `progresso` com a escolha que ficou; ninguém recebe `playerLoadout`).
4. **Subir de nível** continua dando e gravando XP e níveis, mas **não muda as armas na mão**; o banner avisa "Vale a partir da próxima partida" (ou "Ligue no Arsenal antes da próxima partida", para melhorias opcionais).
5. **Menu de pausa**: Arsenal só leitura com o aviso de travamento. No **campo de tiro** (sem modo de jogo) o Arsenal segue editável, para testar armas. (Desde a PF-11: `ArsenalPanel` com `editable: false` mostra o que está em uso; ver a revisão acima.)
6. Vale também contra bots no mata-mata (mesmas regras, sem progresso).

## Motivo

Pedido do usuário; justiça (ninguém troca a arma para responder a uma situação); e o servidor continua a única autoridade sobre o que cada um carrega ([[Client Server Model]]).

## Consequências

- O fluxo antigo "mudar no menu e o servidor anunciar `playerLoadout`" deixou de existir online; os testes foram atualizados para escolher no saguão.
- Quem sobe de nível precisa voltar à tela inicial para usar a melhoria.
- A regra é declarada em `MODE_RULES[modo].lockedLoadout` ([[ADR - Modos de jogo com regras declaradas e ganchos no servidor]]); um modo futuro pode desligá-la.

## Código afetado

`shared/modes.ts`, `server/modes.ts`, `server/session.ts` (`handle('loadout')`, `progress`), `server/app.ts` (`loadout` no saguão), `client/ui/home.ts` (manda a escolha antes de entrar), `client/main.ts` (loadout do `joined`, `progresso` não troca armas), `client/ui/arsenal.ts` (`readOnly`), `client/ui/strings.ts`.

Relacionado: [[Free For All]] · [[Versus Bots]] · [[Inventory UI]] · [[Progression]]
