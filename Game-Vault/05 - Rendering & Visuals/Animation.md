---
title: Animation
type: system
status: documented
area: rendering
source_paths:
  - client/character/animator.ts
  - client/character/character.ts
  - client/character/rig.ts
  - client/entities/avatar.ts
  - client/entities/rig.ts
  - client/render/viewmodel.ts
  - client/render/springs.ts
  - client/ui/tuning.ts
  - client/main.ts
  - docs/PERSONAGENS.md
tags:
  - game
  - rendering
  - animation
updated: 2026-10-05
---

# Animation

## Visão geral

**Não há clipes de animação** no jogo hoje: toda animação é **procedural**, calculada em código a cada quadro. São três frentes:

1. **Personagens em terceira pessoa** (`CharacterAnimator`): esqueleto canônico, pés plantados com IK e camadas aditivas.
2. **Primeira pessoa** (`Viewmodel`): pose base mais camadas de **molas amortecidas**.
3. **Props do mapa**: cada objeto animado (lanternas, sinos, roda-gigante, morcegos...) atualiza o próprio transform em `map.update`.

Todos os números de "sensação" ficam em dois objetos, `ANIM` (terceira pessoa) e `VM_FEEL` (primeira pessoa), ajustáveis ao vivo com **F6** (`client/ui/tuning.ts`, com "Copiar JSON" para colar de volta no código).

## Personagens (terceira pessoa)

### Esqueleto

Esqueleto canônico (`BONES` em `client/character/rig.ts`): `root → hips → spine → chest → neck → head`, ombros, braços, antebraços, mãos e pernas (coxa, canela, pé) dos dois lados. Quadril a 0,95 m na T-pose. Itens rígidos ficam em *sockets* (`head`, `back`, `hand_R`, `hand_L`, `wrist_L`, `wrist_R`). Ver [[Character Models]].

### `CharacterAnimator` (duas camadas)

- **Parte de baixo (locomoção):** cada pé tem um alvo no chão; na fase de apoio fica parado enquanto o corpo passa, na fase de balanço levanta e vai à frente. Resolvido com **IK de dois ossos**. A passada acompanha a velocidade em qualquer direção (o comentário chama de "blend de 8 direções de graça"). Agachar dobra os joelhos com os pés no chão; deslizar estica as pernas à frente. As pernas só giram no lugar depois que o tronco torce **60°**.
- **Parte de cima:** o pitch da visão é dividido em coluna 30%, peito 40%, cabeça 30% (limite ±70°). O rifle fica nas duas mãos por IK (mão direita no punho, esquerda sob o guarda-mão) em três poses: quadril, ADS e corrida.
- **Camadas aditivas curtas:** recuo a cada tiro, recarga (ciclo 1,6 s), faca, granada (arremesso de 0,5 s, solta aos 45%), reação a tiro (o tronco "dá um tranco" na direção da bala), pouso.
- **Poses especiais:** idle e caminhada desarmados (editor), **dança** da [[Humiliation]] (`dance`), **queda** dura de desenho para trás ou de cara (`die`).

Números principais de `ANIM`:

| Grupo | Valores |
| --- | --- |
| Altura do quadril | em pé 0,925; agachado 0,56; deslizando 0,36 |
| Meia passada | `0,1 + 0,105 × velocidade`, até 0,72 m |
| Elevação do pé | andar 0,09; correr 0,17; agachado 0,06 |
| Inclinação do tronco | correr −0,16; agachado −0,3; deslizar 0,38 rad |
| Giro | limite 60°, 7 rad/s |
| Suavização (1/s) | agachar 10, ADS 12, corrida 8, marcha 6, ar 12 |

### Sincronia com as hitboxes

O esqueleto de hitboxes (`entities/rig.ts`, proporções padrão para todos) roda **o mesmo animador** no tick da simulação; o personagem visível copia o estado dele (`syncFrom`) em vez de ter relógio próprio. Assim, agachar, mirar ou recarregar movem as hitboxes exatamente como o visual. Ver [[Damage System]].

### LOD de animação

`Avatar.setCamera(camera)` é chamado uma vez por quadro. Cada avatar:

- **fora do frustum** (esfera de 1,3 m no centro do corpo): não atualiza a pose;
- **a mais de 30 m:** atualiza a cada 2 quadros; **a mais de 60 m:** a cada 4;
- o `dt` acumulado é limitado a 0,25 s quando volta a atualizar.

Isso é independente do LOD de **malha** (20 m e 45 m), descrito em [[Character Models]] e [[Performance Rendering]].

### Clipes (preparado, não usado)

`Character` cria um `AnimationMixer` se o corpo GLB trouxer clipes, e `play(name)` faz *fade in*. Como nenhum corpo GLB está registrado, isso não é exercitado hoje. Status: **não utilizado**.

## Primeira pessoa (viewmodel)

Pose base do rifle no espaço da câmera, misturada entre quadril, ADS (*ease-out* cúbico) e corrida; por cima, camadas com `Spring` (`springs.ts`: mola-amortecedor, Euler semi-implícito em passos de 1/240 s, estável em qualquer taxa de quadros; `Spring.settling(tempo, bounce)` com `ω = 4,7 / tempo`):

| Camada | Comportamento | Números (`VM_FEEL`) |
| --- | --- | --- |
| Sway | o rifle atrasa atrás do mouse | 0,0009/px, máx. 0,05; acomoda em 0,22 s, bounce 0,25; 20% mantido no ADS |
| Bob | figura de oito sincronizada com a passada do corpo (mesma `ANIM.stride`) | x 0,009, y 0,01 m; correr ×1,5; agachado ×0,6; 15% no ADS |
| Recuo visual | chute para trás, para cima e de lado, separado do recuo da mira | 0,028 / 0,045 / 0,012; acomoda em 0,2 s; máx. 0,07 / 0,14 |
| Pouso | afunda proporcional à queda | `0,015 + 0,008 × altura`, máx. 0,07 |
| Inclinação no strafe | roll de até 0,06 rad (≈ 3,4°) a 5 m/s | — |
| Recarga | inclina a arma, o carregador sai do quadro e volta | por progresso 0..1 |
| Deslize | a arma rola para dentro e desce | — |
| Faca | o rifle abaixa; a faca segue 5 *keyframes* (estocada para facas, arco lateral para colher, frango etc.) | `KNIFE_KEYS`, `SWING_KEYS` |
| Granada | o rifle abaixa, a mão esquerda segura a granada tremendo e arremessa por cima | — |

Os braços em primeira pessoa são do próprio personagem (pele, manga, luvas, PCD). Ver [[Weapon Models]] e [[Character Customization]].

## Props animados do mapa

Animados por código em `map.update(dt)` (lista em [[Map Gags]] e [[Interactive Objects]]): lanternas que balançam com tiros, sinos, gongo, roda-gigante, morcegos, espantalhos que caem e levantam, relógio de pêndulo, fantasma da cova, rato gigante, bruxa, cachorro Amora (vira a cabeça para quem chega), nuvens e lanternas do céu.

## Código relacionado

- `client/character/animator.ts` (`CharacterAnimator`, `ANIM`, `AvatarPose`)
- `client/character/rig.ts` (`BONES`, `SOCKETS`)
- `client/entities/avatar.ts` (`Avatar`, LOD de animação)
- `client/entities/rig.ts` (`CharacterRig`, hitboxes posadas)
- `client/render/viewmodel.ts` (`Viewmodel`, `VM_FEEL`)
- `client/render/springs.ts` (`Spring`)
- `client/ui/tuning.ts` (painel F6)

## Ver também

[[Character Models]] · [[Camera]] · [[Performance Rendering]] · [[Humiliation]] · [[Melee]] · [[Grenades]]
