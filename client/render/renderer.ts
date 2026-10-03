import * as THREE from 'three';

export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  vmScene: THREE.Scene;
  vmCamera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  /** Sky, fog and lights for the map (the default is the sunny day every map started with). */
  setAtmosphere(a: Atmosphere): void;
  render(): void;
}

/** A map's lighting mood: sky and fog colors, the two lights, and how far the sun's shadows reach. */
export interface Atmosphere {
  sky: THREE.ColorRepresentation;
  fog: THREE.ColorRepresentation;
  fogNear: number;
  fogFar: number;
  hemiSky: THREE.ColorRepresentation;
  hemiGround: THREE.ColorRepresentation;
  hemiIntensity: number;
  sunColor: THREE.ColorRepresentation;
  sunIntensity: number;
  /** Where the sun (or moon) shines from, relative to the map center. */
  sunPosition: [number, number, number];
  /** Half size of the shadow camera (m): the map's half extent plus a margin. */
  shadowHalf: number;
  /** Multiplies the viewmodel's lights, so the gun in hand matches the scene. */
  viewmodelLight: number;
}

/**
 * Toon shading is half-Lambert (dot(N, L) * 0.5 + 0.5), so faces turned away from the sun still get direct
 * light, and those are exactly the faces three.js renders into the shadow map (shadowSide = back): they
 * compared against themselves and speckled with acne (big flat sides like the ice cream truck's). A face
 * turned away from the sun can't receive a cast shadow anyway, so only test shadows when dot(N, L) > 0.
 */
function patchBackFaceShadows() {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const from = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap';
  if (!chunk.includes(from)) return console.warn('[render] lights_fragment_begin changed; back-face shadow patch skipped');
  THREE.ShaderChunk.lights_fragment_begin = chunk.replace(from, 'directLight.color *= ( directLight.visible && receiveShadow && dot( geometryNormal, directLight.direction ) > 0.0 ) ? getShadow( directionalShadowMap');
}

export function createRenderContext(container: HTMLElement): RenderContext {
  patchBackFaceShadows();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // Integrated GPUs choke on 2x+ DPR at full screen; 1.5 is a good default for the medium preset.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = new THREE.Color(0x6ec3ff);
  scene.background = sky;
  scene.fog = new THREE.Fog(0xa9dcff, 70, 180);

  const hemi = new THREE.HemisphereLight(0xcfeeff, 0x6b8f4a, 1.4);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-30, 45, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -48;
  sc.right = 48;
  sc.top = 40;
  sc.bottom = -40;
  sc.near = 5;
  sc.far = 120;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);
  camera.rotation.order = 'YXZ';

  // Viewmodel lives in its own scene/camera so the gun never clips into walls (section 4).
  const vmScene = new THREE.Scene();
  // Its own FOV (style guide: 60–70°), independent of the player's.
  const vmCamera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.01, 10);
  const vmHemi = new THREE.HemisphereLight(0xe8f6ff, 0x5a6a48, 1.6);
  vmScene.add(vmHemi);
  const vmSun = new THREE.DirectionalLight(0xfff1d6, 1.8);
  vmSun.position.set(-1, 2, 1.5);
  vmScene.add(vmSun);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = vmCamera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    vmCamera.updateProjectionMatrix();
  });

  return {
    renderer,
    scene,
    camera,
    vmScene,
    vmCamera,
    sun,
    setAtmosphere(a) {
      scene.background = new THREE.Color(a.sky);
      scene.fog = new THREE.Fog(a.fog, a.fogNear, a.fogFar);
      hemi.color.set(a.hemiSky);
      hemi.groundColor.set(a.hemiGround);
      hemi.intensity = a.hemiIntensity;
      sun.color.set(a.sunColor);
      sun.intensity = a.sunIntensity;
      sun.position.set(...a.sunPosition);
      sc.left = sc.bottom = -a.shadowHalf;
      sc.right = sc.top = a.shadowHalf;
      sc.far = Math.hypot(...a.sunPosition) + a.shadowHalf * 1.5;
      sc.updateProjectionMatrix();
      vmHemi.color.set(a.hemiSky);
      vmHemi.groundColor.set(a.hemiGround);
      vmHemi.intensity = 1.6 * a.viewmodelLight;
      vmSun.color.set(a.sunColor);
      vmSun.intensity = 1.8 * a.viewmodelLight;
    },
    render() {
      renderer.info.autoReset = false;
      renderer.info.reset();
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(vmScene, vmCamera);
    },
  };
}
