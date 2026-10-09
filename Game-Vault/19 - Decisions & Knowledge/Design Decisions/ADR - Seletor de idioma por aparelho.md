---
title: ADR - Seletor de idioma por aparelho
type: decision
status: documented
area: ui
source_paths:
  - shared/langs.ts
  - client/ui/strings.ts
  - client/ui/strings.es.ts
  - client/ui/strings.de.ts
  - client/editor/strings.ts
  - client/editor/strings.es.ts
  - client/editor/strings.de.ts
  - client/ui/customizeLabels.ts
  - client/core/keybinds.ts
  - client/core/settings.ts
  - client/main.ts
  - client/ui/menu.ts
  - client/ui/home.ts
  - client/ui/padNav.ts
  - client/ui/galpao/scene.ts
  - client/world/canvasText.ts
  - shared/achievements.ts
  - shared/data/conquistas.json
  - shared/catalog.ts
  - shared/mapCatalog.ts
  - shared/protocol.ts
  - server/app.ts
  - server/auth/password.ts
  - client/tests/i18n.test.ts
tags:
  - game
  - ui
  - i18n
  - decision
updated: 2026-10-08
---

# ADR - Seletor de idioma por aparelho

## Contexto

Até a PF-30 o jogo decidia sozinho o idioma pelo navegador: `navigator.language` começando com "pt" dava pt-BR, qualquer outro dava inglês, sem como trocar (`setLang` existia, mas nada o chamava — ver [[Technical Debt]]). Vários pontos escolhiam entre pt e en com sim/não (`getLang() === 'en' ? … : …`), então um terceiro idioma cairia em português ou inglês sem erro de tipo. Recusas do servidor ("Sessão lotada.") e o e-mail de redefinir senha eram sempre em português.

## Problema

Deixar o jogador escolher entre português do Brasil, inglês, espanhol e alemão — no PC, no celular e com controle, e antes de criar conta —, sem misturar idiomas na tela e sem quebrar clientes antigos em cache.

## Opções consideradas

- **Onde guardar:** na conta (a coluna `account.locale` existe) ou no aparelho, junto das outras [[Settings]]. Escolhido o aparelho: as outras configurações já são por aparelho e não há conflito depois do login (resposta P2 do dev).
- **Aplicar a troca:** ao vivo (re-renderizar tudo) ou recarregando. Muitos textos são montados uma vez só (menus, placas do galpão pintadas em textura); escolhido recarregar fora da partida e, dentro dela, salvar e avisar "vale ao voltar ao início" (sair da partida já recarrega) (P4).
- **Onde fica o seletor:** só nas Configurações ou também na tela de entrada. Escolhidos os dois: a linha **Idioma** na subaba Vídeo de `#menu-settings` (que já aparece no galpão, na home clássica e na pausa) e um botão de idioma no cabeçalho da landing, ao lado de ENTRAR, porque o primeiro contato, antes do cadastro, também precisa estar no idioma certo (P1, P10).
- **Tradução:** por pessoas ou gerada por IA. Escolhida a IA, adaptando o humor como o inglês já faz, com revisão do dev por amostragem; os testes garantem chaves e parâmetros (P7). Espanhol latino-americano neutro (es-419) com "tú" (P8); alemão com "du" (P9).

## Decisão

- **Uma lista só** em `shared/langs.ts`: `LANGS = ['pt-BR', 'en', 'es', 'de']`, o nome de cada idioma nele mesmo (`LANG_NAMES`: Português (Brasil), English, Español, Deutsch), o locale de números e datas (`LANG_LOCALE`, es-419 para o espanhol) e o tipo `Text { pt, en, es, de }` dos dados.
- **Escolha por aparelho** em `Settings.idioma` (`oc.settings.v1`), validada ao carregar. Sem escolha vale o navegador: `detectLang(navigator.languages)` pega o primeiro idioma da lista que o jogo tem (pt-* → pt-BR, es-*, de-*, en-*); nenhum → inglês. `resolveLang(salvo, sistema)` junta os dois.
- **Ordem do boot:** `loadSettings()` e `setLang()` rodam antes de `new Screens()`, com `<html lang>` e o título da página, para nenhuma tela nascer no idioma errado.
- **Troca:** `Screens.chooseLanguage` salva; fora da partida chama `location.reload()`, dentro dela (`Screens.inMatch`) mostra o aviso na própria linha.
- **Textos:** pt-BR e en continuam em `client/ui/strings.ts`; es e de ficam em `strings.es.ts` e `strings.de.ts`, tipados como `Record<StringKey, string>` (o typecheck acusa chave faltando). `TIPS`, `QUICK_CHAT` e `DEATH_MESSAGES` são `Record<Lang, …>`. O editor de mapas tem `client/editor/strings.{es,de}.ts`; o editor de personagem, tuplas `[pt, en, es, de]` em `client/ui/customizeLabels.ts`; nomes de tecla em `client/core/keybinds.ts`; dados (`conquistas.json`, catálogo de roupas com colunas `es|de`, catálogo de peças) com os quatro textos.
- **Ficam em pt-BR:** nomes e placas de mapa, falas do fantasma e da bruxa, nomes de bots, bonecos e convidados e o texto dentro das imagens das figurinhas (exceção já registrada em [[Naming Conventions]]).
- **Sem decisões binárias:** stickerArt, customize, editor e keybinds escolhem pelo idioma (não mais `=== 'en'`); números e datas usam `locale()`; o editor mostra o nome da peça no idioma (não mais `nome.pt`); o selo "OPRIMIDO!" usa `t('humiliatedBanner')`; o PadNav reconhece o voltar em espanhol e alemão (`BACK_WORDS`).
- **Textos pintados** (placas do galpão, capa da revista, quadro de armas, tela do admin, selo sobre o corpo) encolhem até caber (`fitText`/`fitFont` de `client/world/canvasText.ts`); a capa divide a palavra por idioma (FIGURI/NHAS, STICK/ERS, ESTAM/PAS, STICK/ER).
- **Servidor:** `{ t: 'error' }` ganha `code` (`WS_ERRORS` em `shared/protocol.ts`) e mantém `message` em pt-BR para clientes antigos; `POST /api/auth/recuperar` aceita `idioma` e manda o e-mail nesse idioma (pt-BR se ausente ou inválido).

## Motivo

A escolha por aparelho reaproveita o mecanismo das configurações e evita decidir entre aparelho e conta depois do login. Recarregar é o caminho mais simples e seguro com tantos textos montados uma vez. Tipar os dicionários pelas chaves do pt-BR transforma "esqueci de traduzir" em erro de compilação.

## Consequências

- O bundle cresce com os textos novos ([[Problem - Bundle JavaScript único de ~5 MB]]): no `vite build` da PF-30, o `index-*.js` foi de 6.766 kB (2.444 kB gzip) para 6.913 kB (2.502 kB gzip), +147 kB (+57 kB gzip). Os quatro idiomas vão no mesmo bundle (sem carregar sob demanda).
- Toda chave nova de texto precisa entrar nos quatro dicionários (o typecheck aponta); tarefas em paralelo que criam chaves só em pt-BR e en completam es e de no merge.
- A coluna `account.locale` continua sem uso.
- Trocar o idioma dentro da partida não muda a tela até voltar ao início (fora do escopo: troca ao vivo).
- As traduções não passaram por falante nativo ([[Technical Debt]]).

## Código afetado

`shared/langs.ts`, `client/ui/strings*.ts`, `client/editor/strings*.ts`, `client/ui/customizeLabels.ts`, `client/ui/customize.ts`, `client/core/keybinds.ts`, `client/core/settings.ts`, `client/main.ts`, `client/ui/menu.ts`, `client/ui/home.ts`, `client/ui/auth.ts`, `client/ui/padNav.ts`, `client/ui/corpseTimer.ts`, `client/ui/galpao/scene.ts`, `client/world/canvasText.ts`, `client/ui/stickerArt.ts`, `client/ui/arsenalStats.ts`, `client/ui/pauseMenu.ts`, `client/ui/hud.ts`, `client/editor/editor.ts`, `client/net/connection.ts`, `shared/achievements.ts`, `shared/data/conquistas.json`, `shared/catalog.ts`, `shared/mapCatalog.ts`, `shared/protocol.ts`, `server/app.ts`, `server/auth/password.ts`. Testes: `client/tests/i18n.test.ts`, `client/tests/settingsLang.test.ts`, `client/tests/keybinds.test.ts`, `client/tests/arsenalText.test.ts`, `server/tests/auth.test.ts`, `server/tests/sessions.test.ts`, `server/tests/maps.test.ts`, `server/tests/zombies.test.ts`. Ver [[Settings]], [[UI Overview]], [[Menus]], [[Remote Calls]], [[Unit Tests]].
