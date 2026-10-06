---
title: Camera
type: system
status: documented
area: rendering
source_paths:
  - client/render/renderer.ts
  - client/main.ts
  - client/core/settings.ts
  - index.html
  - shared/movement.ts
  - shared/data/progression.json
  - shared/progression.ts
  - client/gameplay/taunt.ts
  - client/render/viewmodel.ts
  - client/styles.css
  - shared/arsenal.ts
  - client/render/weaponModels.ts
tags:
  - game
  - rendering
  - camera
updated: 2026-10-06
---

# Camera

## Visão geral

Há duas câmeras perspectivas renderizadas em sequência no mesmo quadro (ver [[Rendering Overview]]):

| Câmera | FOV | near / far | Cena | Função |
| --- | --- | --- | --- | --- |
| `ctx.camera` (mundo) | `settings.fov` (padrão **75°**, faixa **55–95°** no menu) com multiplicadores | 0,05 m / 400 m | `scene` | visão do jogador, death cam, câmera orbital da humilhação |
| `ctx.vmCamera` (viewmodel) | **58°** (`VM_FOV`), cai até 52,2° mirando | 0,01 m / 10 m | `vmScene` | braços e arma em primeira pessoa |

A ordem de rotação da câmera do mundo é `YXZ` (yaw, depois pitch), o padrão de FPS. O pitch é limitado a ±89°.

> [!note]
> `createRenderContext` cria a câmera do viewmodel com 62° (comentário: "style guide: 60–70°"), mas `main.ts` sobrescreve o FOV a cada quadro com `VM_FOV = 58`. O valor efetivo no jogo é **58°**.

## Posição do olho

O olho segue o corpo simulado, interpolado para o quadro (`player.eye(alpha)`). Alturas em `MOVE` (`shared/movement.ts`): **1,65 m** em pé e **1,05 m** agachado, misturadas por `crouchT`. Ver [[Movement]].

## FOV dinâmico

A cada quadro (`main.ts`):

```
zoom = 1 + (ads.zoom − 1) × weapon.ads
fov  = settings.fov × zoom × (1 + 0,05 × sprintVis + 0,08 × slideVis × (1 − weapon.ads))
vmFov = 58 × (1 − 0,1 × weapon.ads)
```

- Correr abre o FOV em até 5%; deslizar, em até 8% (só sem mira).
- `sprintVis` e `slideVis` são suavizados exponencialmente (taxas 8/s e 10/s).
- A projeção só é recalculada quando o FOV muda mais de 0,01°.

### Zoom de mira (ADS) por arma e melhoria

O multiplicador `zoom` é o `ads.zoom` da arma em mãos (`gunStats`): o valor do JSON da arma, substituído pela melhoria de mira ligada (`shared/data/progression.json`; menor = mais zoom). Com FOV 75°, o FOV mirando fica:

| Arma | Mira (melhoria) | `zoom` | FOV com 75° |
| --- | --- | --- | --- |
| Rifle | ferro (sem melhoria) | 0,85 | 63,8° |
| Rifle | ponto vermelho (nível 2) | 0,78 | 58,5° |
| Rifle | luneta 3x (nível 4, opcional; substitui o ponto vermelho) | 0,38 | 28,5° |
| Pistola | ferro | 0,90 | 67,5° |
| Pistola | mini ponto vermelho (nível 3) | 0,82 | 61,5° |
| Submetralhadora | ferro | 0,90 | 67,5° |
| Submetralhadora | holográfica (nível 3) | 0,82 | 61,5° |

A sensibilidade do mouse é multiplicada pelo mesmo `zoom` (e por `adsSensitivity`) para manter a sensação de giro. Ver [[Input & Controls]] e [[Weapons]].

### Overlay de luneta

Com a luneta do rifle ligada (mira `luneta`, `scoped` em `gunParts`), quando `weapon.ads > 0.85`, o viewmodel some e aparece o elemento HTML `#scope` (máscara radial em CSS com cruz e ponto). Não é um render-to-texture: o mundo continua sendo desenhado pela câmera principal com o FOV reduzido. Ver [[HUD]].

## Movimentos de câmera

| Efeito | Regra | Fonte |
| --- | --- | --- |
| Recuo | `euler.x += recoilPitch`, `euler.y -= recoilYaw` (graus da arma) | `main.ts` |
| Deslize | rolagem de `0,07 rad × slideVis` | `main.ts` |
| Tremor de explosão | "trauma" 0..1: soma `max(0, 1 − distância/18)` por explosão; aplica `k = trauma²` em senos de alta frequência (0,035 rad em pitch/yaw, 0,02 rad em roll); decai 1,6/s | `main.ts` (`shake`) |
| Poção "bêbado" | oscilação lenta (roll 0,07 rad, pitch 0,025, yaw 0,03); a mira segue o centro da tela, não a oscilação | `main.ts` |

Ver [[Grenades]] e [[Buffs & Debuffs]].

## Câmeras especiais

- **Death cam offline:** na morte, um raio para baixo acha o chão; em 0,6 s o olho desce até 0,4 m acima dele e a câmera inclina (pitch −0,4 rad, roll 0,5 rad).
- **Death cam online/contra bots:** 3 m atrás do corpo e 2,2 m acima, olhando para quem matou (se vivo), suavizada com taxa 4/s. Serve para ver a própria [[Humiliation]]. Ver [[Flow - Death and Respawn]].
- **Humiliation (terceira pessoa):** câmera orbital (`Taunt.cameraPose`): raio 3,3 m, altura 1,5 m, gira 0,5 rad/s em volta do jogador, com raio contra paredes (mínimo 0,6 m). A posição e a rotação são misturadas com a de primeira pessoa por `taunt.blend`; o avatar só aparece com `blend > 0.15` e o viewmodel some com `blend ≥ 0.5`.

## Outros consumidores da câmera

- **Ouvinte de áudio:** posição e orientação seguem a câmera a cada quadro (`sfx.setListener`). Ver [[Spatial Audio]].
- **Mira dinâmica:** a abertura da cruz é o cone de dispersão projetado: `gap = tan(spread) / tan(fov/2) × (altura da tela / 2) + 3 px`. Ver [[HUD]].
- **LOD de animação:** `Avatar.setCamera(camera)` usa o frustum da câmera para decidir quem anima. Ver [[Animation]].
- **Redimensionamento:** no `resize` da janela, as duas câmeras recebem o novo aspecto.

## Configurações relacionadas

- `settings.fov` (padrão 75; slider `#set-fov` de 55 a 95) e `settings.adsSensitivity`: `client/core/settings.ts`, `index.html`. Ver [[Settings]].

## Código relacionado

- `client/render/renderer.ts` (criação das câmeras)
- `client/main.ts` (`VM_FOV`, cálculo de FOV, shake, death cam, overlay de luneta)
- `client/gameplay/taunt.ts` (`cameraPose`, `ORBIT_RADIUS`, `ORBIT_HEIGHT`)
- `client/render/viewmodel.ts` (`scoped`, `muzzleCameraSpace`)
- `shared/movement.ts` (`eyeHeight`)
