---
title: Documentation Status
type: reference
status: documented
area: index
source_paths:
  - README.md
  - docs/MAPAS.md
  - docs/PERSONAGENS.md
  - docs/DEPLOY.md
tags:
  - game
  - index
  - status
updated: 2026-10-05
---

# Estado da documentação

## Base

- **Código documentado:** branch `main`, commit `4af5b0a` (merge do PR #19, 2026-10-04). Trabalho não commitado ou de outras branches **não** está no cofre.
- **Primeira geração:** 2026-10-05, a partir da leitura do código (client, server, shared, tools, deploy), dos documentos `README.md`, `docs/MAPAS.md`, `docs/PERSONAGENS.md`, `docs/DEPLOY.md` e do histórico do git. Quando documento e código divergiam, valeu o código, e a divergência foi registrada em [[Technical Debt]].
- **Regras de manutenção:** [README do cofre](../README.md) §23. Mudou o código, atualize só as notas afetadas, corrija `source_paths` e `updated` e registre aqui.

## Cobertura por área

| Área | Estado | Observação |
|---|---|---|
| 00 Index | documented | Índices, mapas de sistemas e dependências |
| 01 Vision & Design | documented / parcial | Pilares, público e experiência são **inferências** (o documento de design não está no repositório) |
| 02 Gameplay & Mechanics | documented | 17 notas; [[Inventory]] é stub (não existe) |
| 03 Game Modes | documented | 3 modos reais; [[Team Deathmatch]] e [[Objective Modes]] são stubs (não existem) |
| 04 World & Maps | documented | 4 mapas, regras de design, spawns, objetos interativos |
| 05 Rendering & Visuals | documented | [[Post Processing]] é stub (não existe) |
| 06 Art & Assets | documented | Toda a arte é procedural; [[Reference Images]] é stub |
| 07 Audio | documented | [[Music]] e [[Voice]] praticamente sem conteúdo no jogo (só jingles e música da dança; sem voz) |
| 08 UI & UX | documented | [[Inventory UI]] é stub; 3 fluxos de UX |
| 09 Code Architecture | documented | Sem camadas formais de Controller, Service ou Manager; cada nota explica o que faz esse papel |
| 10 Networking | documented | [[Matchmaking]] é um lobby com lista de salas, sem fila |
| 11 Data & Persistence | documented | |
| 12 AI & NPCs | documented | Bots só offline |
| 13 Backend & Services | documented | |
| 14 Infrastructure | documented | Há CI (GitHub Actions); não há CD nem monitoramento |
| 15 Performance | documented | Métricas vêm de comentários e docs, sem nova medição |
| 16 Security | documented | |
| 17 Testing | documented | Sem testes automatizados de render, E2E ou performance |
| 18 Live Ops | documented | Sem temporadas, eventos ou feature flags; histórico de releases montado a partir dos merges |
| 19 Decisions & Knowledge | documented | 53 ADRs e problemas conhecidos, mais [[Technical Debt]], [[Alternatives Considered]] e [[Lessons Learned]] |
| 20 Reference | documented | |

## Critério de conclusão (README §24)

| Pergunta | Resposta em |
|---|---|
| O que é o jogo? | [[Game Overview]] · [[Game Concept]] |
| Qual é seu loop principal? | [[Core Loop]] |
| Quais são suas mecânicas? | [[Mechanics Index]] |
| Quais são os modos de jogo? | [[Game Modes Index]] |
| Como uma partida funciona? | [[Free For All]] · [[Sessions]] · [[Flow - Join Online Match]] |
| Como o mapa é estruturado? | [[World Structure]] · [[Maps Index]] |
| Como o jogo é renderizado? | [[Rendering Overview]] |
| Como texturas e materiais funcionam? | [[Texture System]] · [[Materials]] · [[Procedural Textures]] |
| Como os assets são organizados? | [[Asset Pipeline]] · [[Art Direction]] |
| Como o áudio funciona? | [[Audio Overview]] |
| Como a UI funciona? | [[UI Overview]] |
| Como cliente e servidor se comunicam? | [[Networking Overview]] · [[Client Server Model]] · [[Remote Calls]] |
| Onde os dados são persistidos? | [[Data Architecture]] · [[Database]] |
| Como os sistemas dependem uns dos outros? | [[Dependencies Map]] · [[Systems Map]] |
| Como o projeto é executado? | [[Local Development]] |
| Como é feito o deploy? | [[Build Pipeline]] · [[Hosting]] |
| Quais são os principais gargalos? | [[Known Bottlenecks]] |
| Quais problemas conhecidos existem? | Pasta `Known Problems/` · [[Technical Debt]] |
| Quais decisões arquiteturais são importantes? | Pastas `Architecture Decisions/`, `Technical Decisions/`, `Design Decisions/` |

Todas as perguntas têm resposta. Os pontos abaixo continuam em aberto.

## Não confirmado / desconhecido

- **Documentos citados no código e ausentes do repositório:** o "documento de design (seção N)", o "Guia de Estilo de Personagens", o `README_Halloween.md` e o "plano de autenticação (P27)". Por isso pilares, público e intenção dos segredos da Vila são inferências.
- **Planos futuros:** se times, modos de objetivo, ranqueada e economia são planos ativos não está confirmado. Só existem indícios em dados e esquema (spawns A/B, `mmr`, `preco`).
- **Números de performance** (draw calls, triângulos, memória, linha de visão 0,6% × 11,6%, varredura de 260 mil ticks) vêm de `docs/MAPAS.md` e do README. Não foram medidos de novo, e a ferramenta da varredura não está no repositório.
- **Runtime:** expiração ociosa e pings do WebSocket ficam no padrão do Bun. O comportamento com várias instâncias do servidor é inferência, porque o deploy atual tem uma só.
- **Detalhes não verificados:** se os telhados das casas são alcançáveis; se tiros de bots acertam `critters`; se personagens recebem sombra (`receiveShadow` não é definido); o efeito de balanço da poção do bêbado (confirmado só pelo comentário); se as músicas e sons da dança são só locais (inferido pela falta de mensagem de rede).
- **Repositório remoto:** os PRs #1, #6, #8 e #9 não aparecem na main, e a proteção de branch do GitHub não é verificável pelo repositório.

## Divergências entre documentos humanos e código

Registradas em [[Technical Debt]], na seção "Comentários e documentação desatualizados". As principais: vida do Gordo e efeito da altura (README), contagem de itens de personagem (`docs/PERSONAGENS.md`), contagem de superfícies e checagem de vãos (`docs/MAPAS.md`), e a granada "não letal" (comentários).

## Histórico do cofre

| Data | Mudança |
|---|---|
| 2026-10-05 | Criação do cofre a partir da `main` em `4af5b0a` |
| 2026-10-05 | Nova tela inicial (design `Home.dc.html`): abas logadas (Jogar, Arsenal, Perfil, Configurações), landing deslogada e entrada rápida online. Atualizadas: [[Menus]], [[Matchmaking UI]], [[Settings]], [[Inventory UI]], [[UI Overview]], [[Flow - First Access]], [[Flow - Join Online Match]]. Nova: [[ADR - Conexão online aberta sob demanda na tela inicial]]. |
| 2026-10-05 | Tela inicial: o cartão e o botão da conta mostram o personagem real (palco 3D do editor e retrato), não mais um emoji. Atualizada: [[Menus]]. |
| 2026-10-05 | Servidor: todo mapa sempre tem uma sala com vaga (sala extra `<Mapa> 2` quando lotam) e `GET /api/sessoes` público. Tela inicial: contagem de sessões nos mapas antes de conectar; filtro de mapas em grade de largura total. Atualizadas: [[Matchmaking]], [[Sessions]], [[APIs]], [[Matchmaking UI]], [[ADR - Conexão online aberta sob demanda na tela inicial]]. |
| 2026-10-06 | Aba Jogar: sessões já carregadas ao abrir (sem VER SESSÕES), 6 por vez com VER MAIS; a conexão de jogo abre ao entrar/criar. Atualizadas: [[Matchmaking UI]], [[Menus]], [[Flow - Join Online Match]], [[ADR - Conexão online aberta sob demanda na tela inicial]] (revisão). |
