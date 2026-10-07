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
updated: 2026-10-07
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

- **Parte de baixo (locomoção):** cada pé tem um alvo no chão; na fase de apoio fica parado enquanto o corpo passa, na fase de balanço levanta e vai à frente. Resolvido com **IK de dois ossos**. A passada acompanha a velocidade em qualquer direção (o comentário chama de "blend de 8 direções de graça"). Agachar dobra os joelhos com os pés no chão; deslizar põe o personagem **de joelhos**: os tornozelos vão para trás do quadril, os joelhos encostam no chão logo à frente dele (o esquerdo um pouco mais), as canelas ficam deitadas e os pés esticados para trás, apoiados no peito do pé (`ANIM.slide`). Até 07/10/2026 o deslize esticava as pernas à frente, e o personagem parecia deslizar sentado. As pernas só giram no lugar depois que o tronco torce **60°**.
- **Parte de cima:** o pitch da visão é dividido em coluna 30%, peito 40%, cabeça 30% (limite ±70°). A arma de fogo fica nas duas mãos por IK (mão direita no punho; a esquerda sob o guarda-mão do rifle, na empunhadura da submetralhadora ou envolvendo o punho da pistola — `AvatarPose.hold`, `ANIM.leftGrip[hold]`) em três poses: quadril, ADS e corrida. Com a secundária na mão (`AvatarPose.secondary`), o rifle fica nas costas.
- **Uma mão só (PCD):** o animador lê as partes que faltam (`Posable.missing`). Sem a mão ou o braço direito, a mão esquerda segura o rifle pela empunhadura (`LEFT_GRIP`, o espelho de `RIFLE_GRIP` por `mirrorGrip` em `registry.ts`), do lado esquerdo do peito, em poses próprias espelhadas (`ANIM.rifleOneHand`: `hip`, `ads`, `sprint`, ajustáveis no F6), e o braço ou coto direito fica pendurado. Sem a mão ou o braço esquerdo, o rifle fica como com duas mãos e o coto apoia o guarda-mão. Com uma mão: a recarga apoia o rifle no corpo (`ANIM.rifleOneHand.reload`, espelhada para a direita) enquanto a mão vai ao carregador e à bolsa (`CharacterAnimator.rifleOffset`, que o `Avatar` aplica ao rifle); a granada é preparada e jogada pela mão que sobra com o rifle nas costas (`rifleAway`); a faca vai na mão que sobra (golpe espelhado sem a direita) e o outro braço fica pendurado. Faca e granada na outra mão espelham posição e rotação. As hitboxes (`entities/rig.ts`) recebem as mesmas partes e fazem a mesma pose.
- **Camadas aditivas curtas:** recuo a cada tiro, recarga (ciclo 1,6 s), faca, granada (arremesso de 0,5 s, solta aos 45%), reação a tiro (o tronco "dá um tranco" na direção da bala), pouso.
- **Poses especiais:** idle e caminhada desarmados (editor), **dança** da [[Humiliation]] (`dance`), **queda** dura de desenho para trás ou de cara (`die`).

Números principais de `ANIM`:

| Grupo | Valores |
| --- | --- |
| Altura do quadril | em pé 0,925; agachado 0,56; deslizando de joelhos 0,5 |
| Deslize de joelhos (`ANIM.slide`) | tornozelos E (−0,13; 0,1; 0,25) e D (0,13; 0,1; 0,3) m; pé girado −2,9 rad (deitado no peito do pé); inclinação do quadril −0,05 rad |
| Meia passada | `0,1 + 0,105 × velocidade`, até 0,72 m |
| Elevação do pé | andar 0,09; correr 0,17; agachado 0,06 |
| Inclinação do tronco | correr −0,16; agachado −0,3; deslizar 0,12 rad (um pouco para trás) |
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
| Faca | a arma abaixa; a faca segue 5 *keyframes* (estocada para a faca, arco lateral para o frango e o sabre) | `KNIFE_KEYS`, `SWING_KEYS` |
| Troca de arma | a arma nova sobe de baixo, inclinada, durante o tempo de saque (`troca`) | `Viewmodel.draw`, `VM_FEEL.draw` |
| Granada | o rifle abaixa, a mão esquerda segura a granada tremendo e arremessa por cima | — |

Os braços em primeira pessoa são do próprio personagem (pele, manga, luvas, PCD). Sem a mão direita, a arma inteira é espelhada para o lado esquerdo da tela, segura pela mão esquerda na empunhadura; mirando, o ponto continua no centro (`Viewmodel.sightCameraSpace` em x = y = 0), e o sway e a inclinação do strafe desfazem o espelho para seguir o lado da visão. Com uma mão só, a recarga abaixa e gira mais a arma (`VM_FEEL.oneHandReload`: inclinação extra 0,2 rad e descida 0,05 m, ajustáveis no F6) enquanto a mão leva o carregador para fora do quadro, e a arma sai da tela durante a faca e a granada. Ver [[Weapon Models]] e [[Character Customization]].

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
