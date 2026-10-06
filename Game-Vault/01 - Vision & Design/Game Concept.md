---
title: Game Concept
type: concept
status: documented
area: design
source_paths:
  - README.md
  - client/ui/strings.ts
  - client/ui/home.ts
  - shared/maps.ts
  - shared/constants.ts
  - shared/data/progression.json
  - docs/MAPAS.md
  - docs/PERSONAGENS.md
tags:
  - game
  - design
  - concept
updated: 2026-10-06
---

# Game Concept

## Proposta

**Offensive Combat** (nesta recriação) é um **FPS de navegador** em primeira pessoa, feito em Three.js + Rapier no cliente e Bun no servidor. O README o define como uma **"homenagem de mecânicas ao FPS de navegador da U4iA Games"** — ou seja, recria as regras e a sensação do *Offensive Combat* original (tiro rápido, "humilhação" do corpo, armas engraçadas) com código e arte próprios.

O projeto se apresenta como **"Protótipo de tiro · Fase 1"** (texto da tela inicial em `client/ui/strings.ts`). Apesar do nome "Fase 1: protótipo offline", hoje já existem sessões online com contas, progressão e persistência.

## Gênero e formato

| Aspecto | O que existe (código confirmado) |
| --- | --- |
| Gênero | FPS arena, partidas curtas de **mata-mata livre** (todos contra todos) |
| Perspectiva | Primeira pessoa; terceira pessoa só durante a dança de [[Humiliation]] |
| Plataforma | Navegador: PC (teclado/mouse), celular/tablet (toque) e controle (Gamepad API) — ver [[Input & Controls]] e [[Touch Controls]] |
| Jogadores | Até **10 por sessão online** (`NET.maxPlayers`), 3 a 9 bots offline |
| Modos | Online (mata-mata livre), Contra bots, Treino offline — ver [[Game Modes Index]] |
| Mapas | Rua dos Vizinhos, Jardim do Dragão, Vila Assombrada (+ mapas glTF de teste) — ver [[Maps Index]] |
| Tom | Cômico/cartoon: armas absurdas, "No pássaro!", "Dancinha da Vitória", piadas nos mapas |

## Fantasia do jogador

> [!info] Inferência
> O conjunto de regras e textos sugere a fantasia de **"tiroteio de bairro entre amigos, levado a sério na mecânica e não levado a sério no tom"**: o tiro é preciso e guiado por dados (dispersão, recuo, multiplicadores por região), mas a recompensa máxima é **dançar sobre o corpo do adversário** ([[Humiliation]]), a faca pode virar um frango de borracha ou um sabre de luz paraguaio e o rifle ganha um silenciador de garrafa PET.

Elementos que sustentam essa leitura:
- Pontuação que premia a provocação: a Opressão vale **150 pontos**, mais que um abate (100). Ver [[Scoring]].
- Nomes e descrições cômicas das armas e das melhorias ("Pistola do Porteiro", "Submetralhadora Liquidificador", "Luneta do Vovô"; textos em `client/ui/strings.ts`, árvores em `shared/data/progression.json`), nomes de bots ("Capitão Lag", "Recruta 404") e de convidados ("Sargento Pastel").
- Mensagens de morte e dicas de carregamento com humor (`DEATH_MESSAGES`, `TIPS` em `client/ui/strings.ts`).
- Mapas cheios de gags ambientais e segredos (cachorra Amora que morde, bruxa das poções, rato gigante "como em Dark Souls"). Ver [[Map Gags]].

## Público

> [!warning] Inferência; precisa ser confirmada
> Não há documento de público-alvo no repositório. O README e `docs/DEPLOY.md` focam em **jogar com colegas/amigos** (comando `offensive`, Radmin VPN, rede local), o idioma principal é pt-BR (com inglês) e o humor é brasileiro ("Tia do Zap", "25 de Março"). O público provável é casual/social brasileiro, em PC e celular.

## Estilo visual (resumo)

Cartoon com sombreamento em rampa de 3 tons, texturas "pintadas à mão" e personagens "anime low poly esguio". Detalhes em [[Art Direction]] e [[Rendering Overview]].

## Documento de design externo

O código cita repetidamente um **"documento de design"** por seções (ex.: "section 4" movimento, "section 6" nascimento e pontos, "section 8" humilhação, "section 10" mapas, "section 14" rede, "section 23" segredos) e um `README_Halloween.md`. **Esses documentos não estão no repositório** (status: desconhecido). As regras documentadas neste cofre vêm do código.

## Roadmap declarado

- **Fase 1 (atual):** o que está em [[Game Overview]].
- **Fase 2 (README, "Próximo passo"):** arsenal completo a partir de arquivos de dados, ragdoll, bots nas sessões online (simulados no servidor) e **fim de partida**.
- Rede (README, "Ainda não feito"): predição/reconciliação, compensação de lag, mensagens binárias, fim de partida e votação de mapa.

## Notas relacionadas

- [[Core Pillars]] · [[Core Loop]] · [[Game Rules]] · [[Progression]] · [[Player Experience]] · [[Economy Design]]
- [[Game Overview]] · [[Game Modes Index]] · [[Mechanics Index]]

## Código relacionado

- `README.md` (intro, "O que existe na Fase 1", "Próximo passo")
- `client/ui/strings.ts` (título, subtítulo, dicas, mensagens de morte)
- `client/ui/home.ts` (modos oferecidos na home)
- `shared/maps.ts` (lista de mapas jogáveis)
