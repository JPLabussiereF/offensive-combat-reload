---
title: Technical Debt
type: problem
status: documented
area: decisions
source_paths:
  - client/main.ts
  - client/ai/bots.ts
  - client/ai/bot.ts
  - server/session.ts
  - server/app.ts
  - server/jobs.ts
  - server/email.ts
  - server/config.ts
  - server/db.ts
  - shared/weapons.ts
  - shared/protocol.ts
  - shared/data/weapons/rifle_padrao.json
  - client/render/renderer.ts
  - client/ui/corpseTimer.ts
  - client/ui/strings.ts
  - vite.config.ts
  - .github/workflows/ci.yml
  - deploy/nginx
  - shared/progression.ts
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
tags:
  - game
  - decisions
  - technical-debt
updated: 2026-10-06
---

# Dívida técnica

Lista consolidada da dívida técnica encontrada ao documentar o código (2026-10-05). Cada item cita a fonte. Problemas com nota própria aparecem como link para `Problem - ...`. Ao resolver um item, risque-o aqui e atualize a nota relacionada.

## Segurança e autoridade online

- Posição e ponto de respawn são confiados ao cliente; não há simulação de movimento no servidor (`server/session.ts`, `case 'respawn'`). Ver [[ADR - Movimento confiado ao cliente]] e [[Problem - Lacunas de validação de gameplay online]].
- A região do acerto é confiada ao cliente: informar `virilha` mata na hora (`onHit` e `computeDamage` em `shared/weapons.ts`).
- A explosão de granada com pavio não tem checagem de posição e aceita `fuse: 0`. Quantidade e recarga das cargas só são controladas no cliente ([[Problem - Cargas de granada controladas só pelo cliente]]).
- A mira afiada do tiro ao alvo é decidida só no cliente (`map.rewards.aimBonus` em `client/main.ts`). A contagem de tiros no rato, o `behind` da faca e a proximidade dos eventos `prop` também não são validados (`server/session.ts`).
- Quando a cereja expira, o servidor corta a vida para 100, ignorando a humanidade ([[Problem - Fim da cereja ignora a humanidade no servidor]]).
- A poção `pato` faz o servidor descartar um efeito temporizado ativo (por exemplo, o crítico), mas o cliente continua mostrando o efeito (`onPotion` × `applyPotion`).
- Faltam cabeçalhos CSP, HSTS e X-Frame-Options no nginx (`deploy/nginx/*.conf`).
- Os papéis de staff são gravados mas nunca verificados, e `issued_by` fica sempre nulo ([[Problem - Papéis de staff sem uso no código]]).
- Sem SMTP, o link de redefinição de senha vai para o log, inclusive em produção (`server/email.ts`; [[ADR - E-mail pelo SMTP do Gmail com fallback no log]]).

## Arquitetura e código

- `client/main.ts` tem cerca de 1.890 linhas numa única closure, e não existe abstração de modo de jogo: os modos são ramificações `online`/`botMode`/`offline` ([[ADR - Bootstrap do cliente numa única closure]]).
- As regras de abate e de prêmio estão duplicadas entre `server/session.ts` e `client/ai/bots.ts`.
- O atraso de respawn aparece em 3 lugares (`NET.respawnDelay`, `RESPAWN` em `client/ai/bots.ts`, `player.respawnDelay = 5` em `client/main.ts`).
- Os bots usam literais em vez das constantes: regeneração 4 s / 25 por segundo no lugar de `HEALTH`, e morte por queda em `y < −20` no lugar de `map.killY` (`client/ai/bots.ts`). Os limites de comportamento (75 m, 35 de vida, 24/7/3,5 m) estão fixos em `client/ai/bot.ts`.
- O limite de 3 minas está duplicado (`MAX_MINES` no cliente, literal `3` no servidor). EYE/CHEST do servidor (1,6/1,1) diferem de `MOVE.eyeStand` (1,65) (`client/weapons/mines.ts`, `server/session.ts`).
- Helpers duplicados: `nameplate` (`bot.ts`, `remote.ts`; `namePlate` em `dog.ts`), `angleDiff`/`lerpAngle`.
- A navmesh é estática, sem reconstrução nem obstáculos dinâmicos (`client/ai/navmesh.ts`).
- O estado das partidas fica só na memória de um processo, então não há escala horizontal ([[Problem - Estado das partidas só em memória de um processo]]).
- O perfil é carregado só no handshake: troca de nome ou aparência só vale ao reconectar (`server/app.ts`, `upgrade`).
- Sem reconexão automática no cliente (`client/net/connection.ts`). "Sair para o início" faz `location.reload()` e refaz todo o boot (`client/main.ts`).
- `vmCamera` é criada a 62° em `renderer.ts`, mas `main.ts` força `VM_FOV = 58`: são duas fontes de verdade.
- `patchBackFaceShadows` altera um ShaderChunk do three.js por busca de texto e pula em silêncio se o chunk mudar, o que é um risco em atualizações (`client/render/renderer.ts`; [[ADR - Sombras ignoradas em faces de costas para o sol]]).
- `client/audio/sfx.ts` tem cerca de 1.100 linhas, com um método por som. Não há volume por barramento (sfx/ui), só o master.
- `CONFIG.production` está definido mas não é usado (`server/config.ts`). As migrations não têm trava entre processos e o rollback é só manual (`server/db.ts`).
- Não há expurgo de `auth_event` nem de sessões vencidas (`server/jobs.ts`).

## Dados e esquema sem uso

- Campos sem uso em `shared/weapons.ts` e nos JSON das armas de fogo (rifle, pistola, submetralhadora): `preco.moedaJogo`, `premium`, `desbloqueioNivel`, `slotsAcessorio`, `categoria`, `sons`, `nome` (os nomes exibidos agora vêm de `arma_*` em `client/ui/strings.ts`), e `modelo` apontando para um `.glb` inexistente ([[Economy Design]]). O campo `slot` **passou a ser usado**: monta `PRIMARIES`/`SECONDARIES` em `shared/progression.ts`.
- A coluna `weapon_progress.equipped_level` não é mais escrita; só é lida para derivar a escolha do Arsenal de contas antigas (`legacyChoice`, [[Data Migrations]]).
- Campos sem uso no esquema: `player_stats.mmr`, `avatar_url`, `bio`, o status `suspended`, as sanções `ranked_ban`/`shadow_ban`. Também `matches_played` conta entradas em sala, não partidas ([[Database]]).
- `spawnsB` e os spawns de time não são lidos por nenhum modo ([[Spawn Design]], [[Team Deathmatch]]).
- Os contadores de "segredos" da Vila não são lidos por ninguém. A máquina de refrigerante, o esqueleto do palco e os olhos dos retratos são promessas sem implementação (`client/world/halloween.ts`, `shared/data/mapas/halloween.json`).

## Comentários e documentação desatualizados

- O README diz que o Gordo tem 150 de vida e que a altura escala hitbox e visão, mas o código dá 100 de vida para todos e a altura é só visual ([[ADR - Altura e biotipo apenas visuais]]).
- ~~Comentários dizem que a granada nível 1 online "não é letal"~~ — resolvido: `ONLINE_GRENADE_LEVEL` e os comentários foram removidos; a explosão vem de `grenadeStats` ([[Problem - Comentários dizem que a granada nível 1 não é letal]]).
- `taunt.ts` diz "G near a fresh corpse", mas a tecla é E. `localPlayer.ts` diz que corpos mais pesados têm mais vida. O comentário de `lanternas.ts` cita escopetas, que não existem. O comentário do placar diz "Tab, online", mas ele também aparece contra bots.
- `docs/PERSONAGENS.md` diz 336 itens, e o código tem 306. A contagem de superfícies varia entre 12, 13 e 19 nos documentos, e o código tem 20. O README fala de 3 estilos de olho e 3 cabelos (o código tem 6 e 30).
- `docs/MAPAS.md` promete uma checagem automática de vãos que não existe ([[Problem - Teste de estrutura de vãos ausente]]).

## Interface e produto

- `CorpseTimer` desenha o "E" e "OPRIMIDO!" fixos, sem keybind e sem i18n (`client/ui/corpseTimer.ts`).
- `setLang` existe, mas não há seletor de idioma (`client/ui/strings.ts`). A mensagem `errOffline` é voltada ao desenvolvedor ("Rode bun run dev:online").
- O painel de ajuste F6 fica disponível também em produção (`client/main.ts`). `?mapa=` vale também online, sem restrição de modo ([[Problem - Prévia glTF por URL sobrepõe o mapa da sessão]]).
- Os tiros dos outros jogadores só desenham o traçante, sem decal nem partículas de impacto (`conn.on('shot')`).
- Google Fonts é uma dependência externa em tempo de execução (`index.html`).
- Não há fim de partida ([[Problem - Partidas sem fim]]) e os bots só existem offline ([[Problem - Bots só existem offline]]).

## Build, infraestrutura e performance

- Bundle único de cerca de 5 MB sem `import()` dinâmico; `chunkSizeWarningLimit: 6000` só silencia o aviso ([[Problem - Bundle JavaScript único de ~5 MB]]).
- A CI não roda `vite build` nem `bun build` (`.github/workflows/ci.yml`). Não há versão, tags nem changelog, e nenhuma checagem de versão entre cliente e servidor (`package.json` 0.1.0).
- Sem health check, métricas ou monitoramento ([[Problem - Sem monitoramento nem métricas de servidor]]). Sem backup automático do volume `oc-pg` (`docs/DEPLOY.md`).
- As geometrias despejadas do `bodyCache` não são liberadas, e outros caches (personagem, Enclosure) não têm limite (`client/character/*.ts`, `client/audio/spatial.ts`).
- Os pools de InstancedMesh usam `frustumCulled = false` e são sempre enviados (`effects.ts`, `halloween.ts`, `luzes.ts`). Jardim e Vila passam da meta de triângulos de `docs/MAPAS.md` (a Vila chega a ~520 mil).
