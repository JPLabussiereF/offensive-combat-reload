---
title: Integration Tests
type: system
status: documented
area: testing
source_paths:
  - server/tests/sessions.test.ts
  - server/tests/management.test.ts
  - server/tests/maps.test.ts
  - server/tests/helpers.ts
  - server/tests/preload.ts
  - server/tests/env.ts
  - server/tests/auth.test.ts
  - server/tests/game.test.ts
  - server/tests/appearance.test.ts
  - server/tests/zombies.test.ts
  - server/tests/modes.test.ts
  - server/tests/progression-modes.test.ts
  - server/tests/knifePassives.test.ts
  - server/tests/zombieBarricades.test.ts
  - tools/bake-navmesh.ts
  - server/app.ts
  - server/session.ts
  - server/modes.ts
tags:
  - testes
  - integracao
updated: 2026-10-07
---

# Integration Tests

Os testes de servidor sobem um **servidor de jogo real** (`startServer` de `server/app.ts`) numa porta livre, contra **PostgreSQL e Redis reais** (banco `oc_teste`, Redis db 1), e falam com ele pela rede como um navegador falaria. Não há mocks de banco nem de Redis.

## Infraestrutura de teste (`server/tests/helpers.ts`)

| Peça | Papel |
| --- | --- |
| `startTestServer()` | `startServer({ port: 0, host: '127.0.0.1', databaseUrl, redisUrl, jobs: false })` — um por arquivo (`beforeAll`), fechado no `afterAll`. Jobs desligados; testes chamam `anonymizeExpired` diretamente quando precisam. |
| `Browser` | "Navegador mínimo": guarda cookies (pote de cookies a partir de `Set-Cookie`), manda `Origin` (o próprio site por padrão, ou outro para simular ataque) e um **IP próprio** em `X-Forwarded-For` (`uniqueIp()`, faixa `10.9.x.x`) para os limites por IP não vazarem entre testes. Atalhos `register()` e `ticket()`. |
| `Player` | Conexão WebSocket que grava todas as mensagens; `next(tipo, filtro, timeout)` espera/consome uma mensagem (ao estourar o tempo, o erro diz quanto esperou e os tipos das últimas mensagens que chegaram); `waitClose()` devolve o código de fechamento. Uma mensagem atende **um** só `next` (o mais antigo que a quer), um `next` que estourou o tempo sai da fila (antes, ele ainda consumia mensagens e o `splice(-1)` apagava outra da fila), e a entrega acontece **na tarefa seguinte**, fora do evento de mensagem: o cliente de WebSocket do Bun corrompia os quadros (o servidor fechava com 1002, "control frame is fragmented") quando um teste enviava de dentro do evento enquanto os `zsnap` do modo zumbi chegavam. |
| `Player.refusal()` | Envia o pedido de *upgrade* manualmente via `fetch` para ler o **status HTTP** da recusa (um WebSocket só veria o código 1002). |
| `uniqueEmail()` | E-mails únicos por execução. |
| `outbox` (`server/email.ts`) | Sem SMTP, os e-mails ficam em memória — os testes leem o link de recuperação dali. |
| `game.deps` | Acesso direto a `db` e `redis` para preparar estado (ex.: expirar ticket com `pexpire`, envelhecer `deletion_requested_at`). |
| `setWeaponXp(browser, {arma: pontos})` | Grava pontos de arma direto em `weapon_progress` (uma conta "veterana", como se já tivesse jogado); o servidor lê na próxima conexão de jogo. |

Como o servidor confia em `X-Forwarded-For` só vindo de endereço privado, e os testes conectam por `127.0.0.1`, o IP simulado é aceito (ver `clientIp` em `server/http.ts`).

## O que é coberto

### `auth.test.ts` — contas por HTTP

- Cadastro cria conta e sessão e mostra `Nome#1234`.
- Cookie `HttpOnly` + `SameSite=Lax`; `Secure` só com `X-Forwarded-Proto: https`.
- Mesmo erro para senha errada e e-mail inexistente; login correto.
- 6ª tentativa no mesmo minuto do mesmo IP → 429; bloqueio da conta após 10 falhas.
- Validação de e-mail, senha e nome; e-mail repetido (maiúsculas) → `email_em_uso`.
- Sair revoga a sessão (cópia antiga do cookie não vale); cookie forjado recusado; pedido de outro site → `403 origem_invalida` (inclusive sem `Origin`).
- Recuperação de senha e limite de 3 e-mails/hora — ver [[Scenario - Login, bloqueio e recuperação de senha]].
- Perfil: número `#1234` não se repete para o mesmo nome; primeira troca de nome livre, segunda antes de 7 dias → `cooldown_nome`; `PATCH /api/perfil {arsenal}` com melhoria bloqueada → `nivel_bloqueado`, e a secundária escolhida (`smg`) é guardada e devolvida (`armas.smg` = `{xp: 0, nivel: 1}`); um rifle ou uma faca antigos trancados → `nivel_bloqueado`, e com os pontos ficam salvos (`primaria: 'rifleOuro'`, `faca: 'sabre'`); uma escolha antiga com o sabre ligado como forma devolve a faca de cozinha com 6.000 pontos de faca e o sabre com 9.000.
- Exclusão de conta — ver [[Scenario - Exclusão de conta e anonimização]].

### `game.test.ts` — conexão de jogo

- Ticket do WebSocket — ver [[Scenario - Ticket do WebSocket]].
- Conexão nova derruba a antiga (`4002`); sair da conta encerra a partida (`4001`); banimento encerra a partida e bloqueia a API.
- Mapas: sala criada leva o mapa, a versão e o nome dele; mapa desconhecido cai em `rua`.
- Chat: chega a todos já limpo; quem manda rápido demais é segurado; silenciar/dessilenciar vale na partida em andamento.
- Sessões sob demanda: `GET /api/sessoes` lista a sala aberta por `play` (mapa, `versao`, `mapaNome`, modo) sem conexão de jogo, e ela some quando esvazia; com 11 jogadores na `halloween`, a primeira sala lota e a segunda ("Vila Assombrada 2") recebe o 11º, e as duas fecham quando todos saem.
- Os helpers `enterMap(player, mapa, modo)` (manda `play` e espera o `joined`), `promote(browser, papel)` e `tinyMap()` (um mapa pequeno válido) ficam em `server/tests/helpers.ts`. Os modelos enviados nos testes vão para uma pasta temporária (`MAPAS_DIR`, criada pelo `preload.ts`).
- Regras de partida — ver [[Gameplay Tests]].

### `maps.test.ts` — API de mapas (PF-6)

- Criar, salvar versões, `409 versao_desatualizada` com a versão base velha, restaurar (a próxima versão vem depois da mais nova) e listar as versões; a versão antiga com cache `immutable`.
- Outros não editam, apagam, restauram nem ocultam, mas duplicam (cópia da comunidade com `copiaDe`, chamada "Nome (cópia)" no registro e nos dados; `copyName` corta para caber em 60 caracteres); o dono apaga (some da lista).
- Busca por nome e por autor (nome e tag) e ordem por mais jogados (jogadas offline contadas uma vez por conta por hora) ou mais recentes; a lista é pública.
- Mapa oculto pelo moderador some da lista, dá `mapa_oculto` a outros e `play` é recusado; com `?ocultos=1` a equipe o acha na lista, e para quem não é equipe (o autor, outro jogador, sem conta) o parâmetro não muda nada; o autor ainda o vê; mostrar de novo devolve; a equipe apaga qualquer mapa.
- User recebe `sem_permissao` ao salvar oficial; admin cria oficial.
- Os 4 oficiais originais: admin e moderador recebem `403 mapa_protegido` ao apagar e ao ocultar cada um (`pode.apagar` e `pode.ocultar` falsos), e eles continuam editáveis (versão nova) e restauráveis; um oficial criado depois é ocultado e apagado pela equipe (P44, P45).
- `mapa_invalido` (tipo de peça desconhecido, modelo de fora do jogo, modelo nunca enviado) e `orcamento_excedido` (uma esfera de 1 milhão de triângulos, com os números e o limite).
- GLB: envio guardado uma vez pelo SHA-256, download com `model/gltf-binary` e `nosniff`, mapa que o usa salvo (`map_version_asset`); recusa acima de 10 MB (`arquivo_grande_demais`), lixo, URI externa, Draco e o tipo errado (`glb_invalido`).
- Os 4 oficiais semeados: montados headless a partir do que `GET /api/mapas/:id/versoes/1` entrega (o JSON passou pelo `jsonb`) e comparados ao golden (tolerância 1e-6); a navmesh do Cemitério guardada com o tamanho do arquivo pré-gerado; `map_version` recusa `UPDATE`.
- Oficial com o JSON mudado (`seedOfficialMaps` chamado de novo): com o mesmo arquivo, uma edição da equipe no Jardim continua atual e nada é criado; com a última versão do repositório diferente do arquivo, a subida grava o arquivo como versão nova e atual (`created_by` nulo, mesmo `jsonb`), a edição da equipe fica no histórico, e mais uma subida não cria nada ([[ADR - Mapas oficiais do repositório publicados na subida]]).

### `management.test.ts` — Gerenciamento (PF-6)

- Só admin e moderador entram (`401`/`403 sem_permissao`); `GET /api/me` traz `papeis`; um papel tirado vale no pedido seguinte.
- Busca por nome e por tag; o moderador vê a conta de um admin com `permissoes` todas falsas.
- Matriz: o moderador silencia, tira o silêncio, renomeia, promove a moderador e rebaixa um user; nunca promove a admin nem mexe num admin (editar, banir, tirar papel, dar papel); ninguém se pune; user não é equipe; pedidos inválidos não mudam nada.
- O admin concede e tira admin; o último admin não sai (`motivo: ultimo_admin`).
- O nome trocado pela equipe não espera o tempo de espera, e a espera do jogador recomeça a partir da troca (7 dias, mesmo para quem não tinha usado a troca grátis).
- Na partida em andamento: o banimento derruba a conexão (`4001`) e grava o moderador como `actor_id` e `por`; o silêncio vale na hora; `xp` e `armas` novos chegam numa mensagem `progresso` e continuam no banco depois de sair.

### `sessions.test.ts` — sessões sob demanda (PF-6)

- `play` abre a sala quando não há uma com vaga (dois jogadores na mesma), e ela fecha vazia.
- Quem está na v1 continua na v1 depois de salvar a v2; quem chega vai para a v2; `join` pelo id ainda entra na sala da v1; os dados de cada versão são os salvos.
- O admin edita a Rua (um carro mudado de lugar): salas novas na versão nova, a em andamento na antiga; restaurar volta (a sala antiga recebe os novos).
- Jogadas: uma por conta e por sala (sair e voltar à mesma sala não conta de novo).
- Mapa da comunidade online: coletável, poção da bruxa, rato e peixe valem só perto das posições salvas nos dados, e ids de outros mapas são ignorados.
- Uma cópia do cemitério (duplicada) é jogável no modo zumbi, e só nele, com a navmesh copiada.

### `zombies.test.ts` — modo zumbi

- **Regras puras** (`shared/zombies.ts`): dados consistentes com as armas e o mapa (`zombieProblems`); começo com o rifle sem melhorias; ondas crescendo, escalando com os jogadores e com chefes nas ondas 4, 8 e 12; o caixão nunca repete a arma da mão e respeita os pesos das raridades (4.000 sorteios com semente); virilha mata zumbi comum e dobra no chefe; dinheiro por abate; o zumbi só em mapas feitos para ele (`modeAllowsMap`).
- **Navmesh pré-gerada em dia**: refaz a malha do Cemitério da Capela headless (`tools/bake-navmesh.ts`, com as caixas das brechas) e compara o hash com `shared/data/navmesh/cemiterio.json`.
- **Motor com relógio falso** (`ZombieMatch` sobre a navmesh real, sem servidor): contagem → onda → dinheiro e XP por abate → intervalo → próxima onda; zumbis andam até o jogador e o derrubam, sozinho cair é perder, resumo e nova partida; em dupla, reanimar (dinheiro do reanimador) e sangrar (volta no intervalo com o rifle inicial); vencer as 12 ondas com os três chefes (XP de vitória); o caixão (sem dinheiro não gira, longe não gira, gira → oferta → arma no slot certo; 12 rodadas seguidas com a oferta expirando: nunca sai do lugar, nunca pato, sempre cobra); o tio que explode leva os outros com o crédito de quem o matou; sair libera; snapshot com tipo e flags.
- **No servidor real**: `play` do zumbi num mapa aberto, ou de outro modo no cemitério, é recusado; criar zumbi noutro mapa cai lá; criar mata-mata ou corrida armada no cemitério cai num mapa aberto; começa com o rifle sem melhorias mesmo com outra escolha no Arsenal; acerto com distância errada ou arma que não tem é recusado; acerto válido mata, paga e dá XP de conta (`progresso`); troca de Arsenal recusada; o caixão gira no servidor e entrega a arma no slot dela (`playerLoadout`, com o defeito se ela veio danificada); zumbis do servidor machucam quem está de pé; sem fogo amigo; queda mortal numa onda derruba (sem `kill`), o colega reanima (`zrevive` → `zup` com o dinheiro), os dois caídos → `zend` (derrota, com as quedas e reanimações) → `roundStart`.
- **Progressão de armas no modo** (conta veterana com tudo liberado e as opcionais ligadas): entra com a pistola simples; o dano no chefe (lido na barra do chefe do `zsnap`) é o do rifle sem melhorias e o da faca comum (não o silenciador nem o sabre da conta); a arma do caixão chega com as melhorias fixas dela, granada sem melhorias, e o dano no chefe é o dessa arma × a raridade.
- **Chefes contra vários jogadores** (duas sessões ao mesmo tempo): o grito da Noiva fere e manda `zhitfx` com a lentidão (55% por 3 s) a quem está no raio, e não a quem está longe; a investida do Prefeito acerta e arremessa (`zhitfx` com o empurrão no sentido da investida) os dois jogadores na linha. O Prefeito sai do ponto dele, no anel sul (antes o teste precisava trocar o ponto, que ficava num banco da praça da Vila Assombrada).
- **Arma danificada no servidor**: com o defeito forçado (`dano`, `municao`, `ambos`), três compras seguidas; o `playerLoadout` traz o defeito da arma (`danificadas`; o sabre só perde dano) e o dano no chefe é o da arma × a raridade × 0,75 em `dano`/`ambos` e sem penalidade em `municao`.
- **Barricadas no servidor**: longe da brecha ou com um índice que não existe, nada; na brecha oeste, segurar `E` dá `zbarwork`, e depois `zbar` `build` com 5 tábuas e o dinheiro cobrado ($500 → $200); outra barricada sem dinheiro é recusada; quem entra no meio da onda recebe em `joined.zumbi.bars` exatamente as barricadas como estão.
- **Entrar no meio de uma onda**: `joined.zumbi` traz a fase, a onda, o total, o caixão e quem está caído (`down` com o prazo); `joined.players` traz o dinheiro e as armas de cada um (quem comprou no caixão aparece com $400 e a arma); quem entra tem $500 e o rifle simples mesmo com a conta no máximo; o primeiro `zsnap` traz os zumbis que os outros já viam; quem entrou fica esperando (`state: 'dead'`) e o servidor recusa o `respawn` até a onda acabar.
- **Sangrar até morrer**: depois de comprar uma arma, cai e sangra (`kill` com `zombie`, sem atacante); o `respawn` é recusado até o intervalo; no intervalo volta o rifle inicial (`playerLoadout`) e o renascimento é aceito, com o mesmo dinheiro ($400; morto não ganha o prêmio da onda). Quem limpou a onda recebe exatamente o XP de conta de cada abate (`killXp`) mais o da onda, e nenhum ponto de arma.
- Os testes encurtam tempos e preços mexendo no objeto `ZOMBIE` (o servidor roda no mesmo processo) e o restauram depois de cada um. `cheapCoffin(defeito?)` deixa o caixão barato e rápido, com as armas sempre inteiras (ou sempre com o defeito pedido). O `until` do relógio falso confere a condição a cada tick (um intervalo de 0,2 s não escapa entre duas conferências).

### `zombieBarricades.test.ts` — o mapa do zumbi, barricadas e armas danificadas

Motor com relógio falso (`ZombieMatch` sobre a navmesh assada do cemitério), sem servidor:

- **Mapa exclusivo**: o cemitério com `exclusivo: 'zumbi'` nos dados; `modeAllowsMap` de todo modo nos 4 oficiais (o zumbi só o cemitério; os outros só os abertos); dados do modo só no cemitério.
- **Chão do mapa**: os 24 pontos de surgimento fora do muro e sobre a malha; cada chefe em chão limpo (≥ 3 m em 8 direções) e o Prefeito com a linha da investida livre para leste; o caixão dentro do muro.
- **Brechas na navmesh**: todo polígono tem `WALK_FLAG`; cada brecha tem polígonos com a sua flag e não há outras flags; com a flag excluída, o caminho do campo norte desvia da brecha; com todas excluídas, não chega; só o portão aberto, passa por ele.
- **Erguer**: índice inválido ou longe, nada; segurar dá `zbarwork` e, depois de `erguerSegundos`, `zbar` `build` com 5 tábuas, cobrando $300; inteira, nada; sem dinheiro, nada; soltar ou afastar-se para; com alguém no vão, espera até o vão ficar livre.
- **Desvio** (a zona de abate): com as quatro brechas menores fechadas, os zumbis comuns entram todos pelo portão, e ninguém bate nas tábuas.
- **Tudo fechado**: os zumbis comuns batem nas tábuas (`zbar` `hit`) até uma barricada cair (`break`); ninguém entra antes, e entram por onde caiu.
- **O Segurança**: no mesmo lugar (surgindo em frente à brecha oeste fechada, o jogador do outro lado), o zumbi comum dá a volta por outra brecha sem bater nas tábuas, e o Segurança arromba a oeste e entra por ela.
- **Repregar**: depois do arrombamento e da onda limpa, segurar `E` no intervalo prega as 5 tábuas, pagando $10, $10, $5 e nada (teto de $25 no teste); a barricada continua na onda seguinte e some numa partida nova (`zbar` `reset`).
- **Armas danificadas**: 20.000 rolagens por raridade com semente — a taxa bate com `caixa.danificada.chance` (±1,5 pp), cai a cada raridade e não zera na lendária; os defeitos seguem os pesos; o sabre só perde dano. Penalidades: `weaponMul` ×0,75 em `dano`/`ambos` e igual em `municao`, sem tocar a outra arma; `zombieGunData` com 60% do pente e 50% da reserva; o defeito vai no `Loadout` e sobrevive ao `sanitizeLoadout`; trocar de arma limpa o defeito; uma cópia danificada pode sair de novo, uma intacta nunca. O caixão entrega a arma danificada no slot com o defeito em `items.danificadas`, e uma rodada inteira depois tira o defeito.

### `modes.test.ts` — modos online e progressão de armas

- **Regras puras**: a escada da corrida armada (`ladderProblems`, sobe com 3 abates da arma do degrau ou da faca — a facada conta como um abate em todo degrau e, no penúltimo, leva ao sabre sem vencer —, a facada tira um abate da vítima e só volta de arma sem abates no degrau, só o sabre vence) e `MODE_RULES` de todo modo.
- **Mata-mata**: o Arsenal escolhido no saguão vale e a troca no meio é recusada; subir de nível não muda a arma na mão (vale na próxima sessão). Com uma **conta veterana**: o dano do rifle é o dele com o silenciador ligado (mais fraco a 30 m que o simples), a cadência aceita é a da pistola com o gatilho (11 acertos por segundo em vez de 9), G planta mina (a melhoria ligada) e o abate de pistola dá os pontos à pistola e 25 XP à conta. Um **cliente ganancioso** (secundária inexistente, opcionais não liberadas, um `Loadout` inteiro com o sabre) fica com a escolha limpa; acertos de armas fora do loadout são ignorados e a mina sem a melhoria vira granada comum.
- **Rifles e facas antigos no mata-mata**: o servidor valida o acerto com os atributos do rifle escolhido (o da Tia tira 28 no peito a 10 m; um acerto "do Rifle Padrão" que não está na mão é ignorado), os outros recebem `primaria` e `faca` no loadout, o kill feed traz `rifleTia` e os pontos vão para o rifle; a facada vale até o alcance da investida da faca de cada um (a 5 m, com o Tênis: a baguete alcança, o macarrão não).
- **Corrida armada**: primeiro degrau para todos, sem granadas, subir/descer (a facada derruba a vítima um abate e dá um ao atacante), três facadas sobem um degrau com a arma nova na hora, vitória com o sabre e nova rodada. Com uma **conta no máximo** (silenciador, sabre e mina ligados): entra no primeiro degrau; o dano é o da arma do degrau com as melhorias do degrau; ao subir, tiros da arma anterior valem por 1 s com os atributos dela e a arma nova vale com os dela; nenhuma arma ganha pontos (nem no banco depois de sair) e a conta ganha 25 XP por abate.

### `secondaries.test.ts` — o limite de bagos da garrucha

- Uma conta com 7.000 pontos de pistola leva a garrucha com o Gatilho desligado (300/min): o servidor aceita os 8 bagos de cada tiro como acertos próprios, até `(ceil(300/60) + 2) × 8` = 56 num segundo (o limite de uma bala, 7, cortaria até um disparo), e recusa o seguinte. A parte pura do arquivo (ficha, TTK, tiro único na cabeça) está em [[Unit Tests]].

### `knifePassives.test.ts` — passivas das facas no servidor

Cada caso numa sala nova de mata-mata, com contas que têm os pontos de faca para escolher qualquer faca ([[ADR - Passivas das facas e Mão Leve]]):

- a faca escolhida chega no equipamento;
- **Colo de Vó:** depois de levar dois tiros, o dono da colher esfaqueia alguém e o `snap` seguinte traz a vida +50 (até o máximo);
- **Tapa Gelado:** pelas costas com o peixe, o prêmio `backstab` vale 100; com a faca de cozinha, 50;
- **Boia:** com o macarrão, um `selfDamage` de queda não gera `damage` (a mordida do cachorro gera); com a faca de cozinha, a queda machuca;
- **Vuuum:** dois `stab` do mesmo golpe do sabre matam os dois; com a faca de cozinha, o segundo é recusado até passar o intervalo;
- um golpe do sabre 300 ms depois do primeiro já é outro golpe e espera o intervalo.

### `progression-modes.test.ts` — matriz progressão × modos

Sem rede nem banco: uma `Session` real (com os ganchos reais de `server/modes.ts`) sobre sockets falsos e relógio falso, tudo síncrono (~0,3 s). Para **todo modo de `GAME_MODE_IDS`** (um modo novo entra sozinho) × contas com cada arma de `PRIMARIES` (os sete rifles)/`SECONDARIES` em cada nível (com pontos para liberá-la), com as opcionais desligadas, cada uma ligada e todas ligadas (mais faca, granada, conta nova, conta no máximo e um cliente pedindo o que não tem):

- o equipamento de entrada é válido (só ids conhecidos, `slotStats`/`meleeStats`/`grenadeStats` finitos e positivos, dano positivo em toda região e distância) e segue `MODE_RULES.weapons`: `'arsenal'` dá a escolha da conta nos níveis dela (só melhorias liberadas, opcionais só se pedidas, uma por grupo, comuns todas ligadas); `'mode'` ignora a conta (o mesmo equipamento para todas);
- `lockedLoadout`: trocar o Arsenal na partida é recusado; `grenades`: a granada chega aos outros só no modo com granadas, e a mina só com a melhoria; `weaponXp`: abates com cada arma de fogo carregada e com a faca dão os pontos à progressão da arma (`progOf`; `kill.arma` é a arma na mão) só no modo que diz isso (a conta ganha 25 XP sempre), e em modo `coop` não há dano entre jogadores;
- regras coerentes: modo com armas próprias nunca dá XP de arma e precisa registrar no teste tudo o que entrega no meio da partida (degraus da escada, toda combinação de itens do caixão, **inclusive danificados de todo jeito que cada item pode vir**: 2.475 equipamentos), e tudo isso é válido — o defeito atravessa a rede intacto e a arma que o cliente monta com menos munição continua válida; toda combinação de melhorias de toda arma dá atributos válidos.

### `appearance.test.ts` — blocos "perfil" e "no online"

- Perfil começa com aparência padrão, salva e devolve validada; trocar o sexo mantém cabelo e roupas.
- Online: todos veem a aparência de quem entra; o corpo mantém a aparência; o biotipo "gordo" tem a mesma vida.

## Execução

`bun test` (local, com `docker compose up -d banco redis`) ou CI ([[CI CD]]). O preload apaga e recria o banco de teste a cada execução, então os testes não dependem de estado anterior.

## Código relacionado

- `server/tests/helpers.ts`, `server/tests/preload.ts`, `server/tests/env.ts`
- `server/tests/auth.test.ts`, `server/tests/game.test.ts`, `server/tests/appearance.test.ts`, `server/tests/modes.test.ts`, `server/tests/zombies.test.ts`, `server/tests/progression-modes.test.ts`, `server/tests/secondaries.test.ts`, `server/tests/knifePassives.test.ts`, `server/tests/zombieBarricades.test.ts`, `server/tests/maps.test.ts`, `server/tests/management.test.ts`, `server/tests/sessions.test.ts`

Ver também: [[Testing Overview]], [[Authentication]], [[APIs]].
