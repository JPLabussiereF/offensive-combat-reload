---
title: Menus
type: system
status: documented
area: ui
source_paths:
  - client/zombies/ambience.ts
  - shared/modes.ts
  - client/ui/ladder.ts
  - index.html
  - client/ui/menu.ts
  - client/ui/home.ts
  - client/ui/auth.ts
  - client/ui/profile.ts
  - client/ui/maps.ts
  - client/ui/mapsRules.ts
  - client/ui/management.ts
  - client/ui/managementRules.ts
  - client/ui/customize.ts
  - client/ui/arsenal.ts
  - client/ui/padNav.ts
  - client/ui/strings.ts
  - client/main.ts
  - client/styles.css
tags:
  - game
  - ui
  - menus
updated: 2026-10-06
---

# Menus

Telas fora da partida e o menu de pausa. Todas vivem em `index.html`; a lógica está em `client/ui/menu.ts` (classe `Screens`: carregamento e menu início/pausa) e `client/ui/home.ts` (tela inicial).

## 1. Tela de carregamento (`#loading`)

- Logo "OFFENSIVE COMBAT", barra de progresso e uma **dica engraçada** que troca a cada 2,5 s (`TIPS` em `strings.ts`, ex.: "Dica: os flamingos não têm culpa de nada.").
- Aparece duas vezes: no boot (física, renderizador, texturas: 10% → 45% → 100%) e de novo ao construir o mapa escolhido.
- Em erro fatal de inicialização, a dica é trocada por "Erro ao iniciar: …".

## 2. Tela inicial (`#home`)

Página rolável com duas caras, conforme a conta (`/api/me`). Enquanto a consulta não volta, nenhuma das duas aparece. Os textos vêm de atributos `data-t` preenchidos por `t()` (`client/ui/strings.ts`).

### 2.1 Logado (`#home-in`)

- **Cabeçalho:** logo, abas **JOGAR / MAPAS / ARSENAL / PERFIL / CONFIGURAÇÕES** e, só para admin e moderador (`papeis` de `/api/me`), **GERENCIAMENTO** (`role="tab"`, L1/R1 no controle) e um botão da conta com o retrato do personagem (`renderPortrait`, close no rosto), `Nome#1234`, selo de nível e barra de XP da conta (`xpNoNivel / xpProximo`). O botão abre a aba Perfil.
- **Cartão do personagem** (lateral, fixo ao rolar no computador; empilhado no celular): o **personagem real** da conta em 3D (o mesmo palco `Stage` do editor, `client/ui/customize.ts`: parado, girando devagar, arrastar gira; sem zoom pela roda para não travar a rolagem), os ícones do que vai para a partida — primária, secundária escolhida, faca e granada, com a forma ligada (ex.: "🔫 🛎️ 🐔 🧨 equipados"; `weaponIcon`), abates e partidas, botão **PERSONALIZAR** (abre o editor de [[Character Customization]] no lugar do painel, que ocupa a largura toda) e, no modo Online, **JOGAR ONLINE** com a dica "Entra direto na sessão mais cheia dos mapas filtrados".
- **Aba Jogar:**
  - *Modo:* três cartões, **Online**, **Contra bots** e **Campo de tiro**.
  - *Tipo de partida* (Online e Contra bots): **Mata-mata** ou **Corrida armada**, com uma linha sobre o modo ([[Free For All]], [[Gun Game]]). Na landing (sem conta) o mesmo seletor aparece para o jogo contra bots.
  - *Mapas:* cada botão mostra o **cartão** do mapa (emoji e cor de `cartao`, da versão atual; os oficiais do pacote enquanto o servidor não responde). No Online, os mapas vêm de `/api/mapas?tipo=oficial` **somados aos mapas das sessões abertas** (um mapa da comunidade que alguém está jogando entra com o cartão de `GET /api/mapas/:id`), são um **filtro** (vários marcados; um mapa novo entra marcado) e mostram quantas sessões cada um tem. Em Contra bots escolhe-se um mapa e no Campo de tiro **clicar no mapa já começa** o treino ([[Training]]): fora do Online só os oficiais do pacote do cliente. Fora do modo zumbi só aparecem os mapas abertos (sem `exclusivo`): o Cemitério da Capela é só do zumbi.
  - *Contra bots:* dificuldade (Fácil/Normal/Difícil), 3/5/7/9 bots e o botão **CONTRA N BOTS** ([[Versus Bots]]).
  - *Online:* lista de sessões **já carregada** ao abrir a aba (6 por vez, **VER MAIS** quando há mais), filtrada pelos mapas marcados, e a criação de sessão. A conexão de jogo só abre ao entrar. Ver [[Matchmaking UI]].
- **Aba Mapas** (`client/ui/maps.ts`, PF-6): abas **Oficiais** e **Comunidade**, busca por **nome** ou **autor**, ordem **Mais jogados** ou **Mais recentes** e, para a equipe, **Mostrar ocultos** (`?ocultos=1`). Cada mapa é um cartão (emoji, cor e nome da versão atual; autor, jogadas, versão e data; selos "Só zumbi" e "Oculto: motivo") com os botões que quem olha pode usar (`mapActions` em `client/ui/mapsRules.ts`): **Jogar** (online, mensagem `play` no modo escolhido no seletor do cartão; num mapa exclusivo de zumbi, só zumbi), **Editar** (o dono no seu mapa da comunidade; admin e moderador nos oficiais), **Duplicar** (qualquer conta; a cópia "Nome (cópia)" aparece em Comunidade), **Versões** (a lista das versões salvas com **Restaurar**; com Editar), **Ocultar** com motivo e **Desocultar** (equipe), **Excluir** com confirmação (o dono no seu; a equipe em qualquer um). **+ Novo mapa** e **Editar** fecham a tela inicial no editor (`HomeChoice` `{ mode: 'editor', mapa }`, [[ADR - Editor de mapas no jogo]]). O servidor confere cada ação de novo.
- **Aba Gerenciamento** (`client/ui/management.ts`, só admin e moderador): busca de contas por nome ou `Nome#1234` (tags de papel, banida, silenciada, suspensa) e o **painel da conta**: **Sanções** (Banir ou Silenciar com motivo e duração de 1 hora a permanente, Retirar banimento, Retirar silêncio e o histórico com quem aplicou), **Nome** (sem a espera de 7 dias; a do jogador recomeça), **Aparência** (corpo e o editor de [[Character Customization]] salvando na conta do outro: `showCustomizer` com `onSave`), **Progresso** (XP da conta e de cada arma) e **Papéis** (Promover e Tirar). As partes aparecem ou somem pelas permissões que `GET /api/gestao/contas/:id` devolve para quem pergunta (`accountControls` em `client/ui/managementRules.ts`): um moderador diante de um admin vê só "Você não pode mexer nesta conta", e ninguém se pune. Ver [[Moderation]].
- **Aba Arsenal:** o mesmo painel do menu de pausa (`Arsenal`, `client/ui/arsenal.ts`) sobre a progressão da conta. Escolher a secundária ou ligar/desligar uma melhoria grava na conta na hora (`PATCH /api/perfil {arsenal}`). Ver [[Inventory UI]].
- **Aba Perfil** (`client/ui/profile.ts`): tag e nível com barra de XP, aviso de exclusão pendente (com cancelar), corpo (masculino/feminino), **Personalizar personagem**, estatísticas totais, últimas sessões online, troca de nome (com carência), vincular/desvincular Discord, sair e excluir conta (com `confirm`). Ver [[Player Data]].
- **Aba Configurações:** os mesmos controles do menu de pausa (teclas e [[Settings]]). O bloco `#menu-settings` é **emprestado** para a aba enquanto a tela inicial está aberta e devolvido ao `#menu` ao sair, por isso a mudança vale na hora. O editor de layout de toque fica escondido aqui (os controles de toque só existem na partida).
- Uma aba extra sem botão (`#tab-auth`) mostra o formulário "Escolher nome" (primeiro login pelo Discord) e o editor de personagem.

### 2.2 Deslogado: landing (`#home-out`)

1. **Cabeçalho fixo** com âncoras (O jogo, Mapas, Modos, Criar conta) que rolam a página sem deixar `#fragmento` no endereço (os fragmentos são reservados aos retornos do e-mail e do Discord) e o botão **ENTRAR**.
2. **Destaque:** logo, chamada, **COMEÇAR A JOGAR** e **CRIAR CONTA**, e o aviso "Sem conta: treino e bots estão liberados".
3. **Como é o jogo:** três pilares (mira por região do corpo, Opressão vale 150 contra 100 do abate, armas que evoluem). Ver [[Scoring]] e [[Progression]].
4. **Mapas:** vitrine de um mapa (nome e piada) e a lista dos três mapas abertos com clima e tamanho (o cemitério do modo zumbi não entra). Ver [[Maps Index]].
5. **Modos de jogo:** Online (com conta), Contra bots e Campo de tiro (sem conta), cada um com três fatos curtos.
6. **Criar conta:** os formulários de `client/ui/auth.ts` (cadastrar, entrar, esqueci a senha, nova senha), sem o botão Voltar. Ver [[Flow - First Access]] e [[Authentication]].
7. **Começar a jogar:** o nome engraçado aleatório (ex.: "Sargento Pastel"), mapa, dificuldade, número de bots, **CONTRA N BOTS** e o link *Campo de tiro (bonecos parados)*.

> [!info]
> O design traz espaços para imagens (captura de gameplay, mapas, modos). Como o projeto não tem nenhuma captura, cada espaço mostra uma cor do mapa ou modo com um emoji (`.ph` em `client/styles.css`). O personagem não é imagem: é renderizado ao vivo a partir da aparência salva (`aparencia` do perfil; sem perfil, a aparência padrão do corpo).

### 2.3 Preferências e mensagens

- Modo, mapa, filtro de mapas do Online (os mapas **tirados** do filtro, `fora`; o antigo `filtro` com os marcados é convertido), dificuldade e número de bots ficam no `localStorage` (`oc.bots`). A busca e a ordem da aba Mapas e a conta aberta no Gerenciamento duram enquanto a tela inicial está aberta. Ver [[Settings]].
- As mensagens de estado ("Conectando ao servidor…", erros) aparecem num aviso fixo no rodapé da tela (`#home-status`).

## 3. Menu inicial / pausa (`#menu`)

Mesmo cartão para os dois modos (`showMenu('start' | 'pause')`):

| Seção | Conteúdo |
| --- | --- |
| Cabeçalho | Logo, subtítulo ("Sessão: {nome} · {modo}", "Contra N bots · {modo}" ou "Protótipo de tiro · Fase 1"), aviso de GPU por software (se detectado). |
| Botão principal | **JOGAR** (início) ou **VOLTAR AO JOGO** (pausa) + dica "Clique para voltar ao jogo" / "Toque…" / "Aperte ✕ ou Options…". |
| **Arsenal** | Painel de armas e melhorias (`client/ui/arsenal.ts`): um cartão por arma (rifle, pistola, submetralhadora, faca, granada) com espaço, nível, barra de XP até o próximo nível, barras de atributos das armas de fogo com as melhorias em efeito, a lista de melhorias (🔒 com os pontos se bloqueada; ativa; substituída; ou botão liga/desliga nas opcionais) e a descrição sob o mouse. Os cartões das secundárias têm o botão para levá-la no espaço secundário. **Só leitura** no mata-mata (online e contra bots), com o aviso "Equipamento travado durante a partida…"; editável no campo de tiro. Na **corrida armada** a seção vira a **escada** (`client/ui/ladder.ts`): os 7 degraus com ícone, nome, pente/cadência e abates necessários, o degrau do jogador em amarelo. No **zumbi** vira a página do **Caixão Misterioso** (`renderZombieArsenal` em `client/zombies/ambience.ts`): o que o jogador carrega (na cor da raridade; uma arma danificada mostra o defeito com os números, como "Danificada: −40% de pente e −50% de reserva") e a chance, o multiplicador e a chance de vir danificada de cada raridade, com as armas dela; o texto de ajuda explica que não há conserto. Ver [[Inventory UI]], [[Progression]], [[Gun Game]] e [[Zombie]]. |
| **Controles** | Tabela de teclas remapeáveis (computador), tabela de botões do controle (PlayStation ou Xbox) ou ajuda de toque (celular). Ver [[Input & Controls]]. |
| **Configurações** | Ver [[Settings]]. A coluna de controles e configurações (`#menu-settings`) é a mesma que a tela inicial empresta para a aba Configurações. |
| Rodapé | Dica de depuração (F3/F4), botão **Sair para o início** (só na pausa; recarrega a página). |

O jogo renderiza um quadro do mapa **atrás** do menu inicial, para que o mapa apareça antes de clicar em JOGAR.

### Pausa

- **Computador:** Esc abre e fecha. Em tela cheia com Keyboard Lock (Chrome/Edge), o jogo fica com o Esc e a mira volta na hora; fora disso, o navegador consome o Esc que libera o mouse e o próximo Esc fecha o menu, com a mira voltando na próxima tecla ou clique ("A mira volta com a próxima tecla ou clique"). Ver [[Problem - Esc e Pointer Lock no navegador]].
- **Celular:** botão de pausa nos controles de toque.
- **Controle:** Options/Menu.
- **Offline o mundo para** com o menu; **online continua** (os outros não esperam).

## 4. Outros painéis

- **Editor de layout de toque** (`#touch-edit-bar`): ver [[Touch Controls]].
- **Aviso "Gire o celular"** (`#rotate`): durante a partida em retrato.
- **Painel de ajuste F6** (`client/ui/tuning.ts`): ferramenta de desenvolvimento com sliders para `VM_FEEL` (primeira pessoa) e `ANIM` (terceira pessoa) e botão para copiar o JSON; está disponível também fora do modo dev.

## Navegação por controle

`PadNav` (`client/ui/padNav.ts`) funciona em qualquer tela fora da partida: D-pad/analógico movem o foco ao controle visível mais próximo (com repetição ao segurar), ✕/A aciona (checkbox alterna, select cicla, slider move com esquerda/direita), ◯/B volta, L1/R1 trocam abas, analógico direito rola. Start/Options começa ou retoma.

## Código relacionado

- `client/ui/menu.ts` — `Screens` (`setProgress`, `showLoading`, `hideLoading`, `showMenu`, `hideMenu`, `bindSettings`, `showControls`, `onEditLayout`, `onExit`, `showGpuWarning`).
- `client/ui/home.ts` — `showHome()` → `HomeChoice` (`offline` | `bots` | `online` | `editor`): abas, landing, entrada rápida, mapas online (`playableMaps`), empréstimo de `#menu-settings`.
- `client/ui/maps.ts` (`showMaps`) e `client/ui/mapsRules.ts` (botões por papel e dono, modos, endereço da lista, mapas da tela inicial); `client/ui/management.ts` (`showManagement`) e `client/ui/managementRules.ts` (painel pelas permissões, sanção e progresso conferidos antes de enviar).
- `client/ui/auth.ts`, `client/ui/profile.ts`, `client/ui/customize.ts`, `client/ui/arsenal.ts`, `client/ui/padNav.ts`, `client/ui/tuning.ts`.
- `client/main.ts` — ordem das telas no `boot()`, pausa/retomada (`input.onLockChange`).
