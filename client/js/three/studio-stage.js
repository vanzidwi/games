import * as THREE from 'three';
import { createStudioCamera } from './camera.js';
import { CameraController } from './camera-controls.js';
import { CharacterAnimationController } from './character-animation.js';
import { CharacterManager } from './character-manager.js';
import { buildStudioEnvironment } from './environment.js';
import { HostLookController } from './host-look-controller.js';
import { createStudioRenderer } from './renderer.js';
import { createStudioScene } from './scene.js';
import { SpeechBubbleOverlay } from './speech-bubble.js';

export class StudioStage {
  constructor(canvasContainer, overlayContainer, { transparent = false, interactive = true } = {}) {
    this.canvasContainer = canvasContainer;
    this.overlayContainer = overlayContainer;
    this.interactive = interactive;

    const width = canvasContainer.clientWidth || window.innerWidth;
    const height = canvasContainer.clientHeight || window.innerHeight;

    const { scene, activeSpotlight } = createStudioScene({ transparent });
    this.scene = scene;
    this.camera = createStudioCamera(width / height);
    this.rendererWrap = createStudioRenderer(canvasContainer, { transparent });

    buildStudioEnvironment(this.scene);
    this.characterManager = new CharacterManager(this.scene, activeSpotlight);
    this.animController = new CharacterAnimationController(this.characterManager);
    this.hostLookController = new HostLookController(this.characterManager);
    this.speechOverlay = new SpeechBubbleOverlay(
      overlayContainer,
      this.characterManager,
      this.camera
    );

    this.cameraControls = interactive
      ? new CameraController(this.camera, this.rendererWrap.renderer.domElement)
      : null;

    this.clock = new THREE.Clock();
    this.elapsedTotal = 0;
    this.rafId = null;

    this.onResize = () => {
      const w = this.canvasContainer.clientWidth || window.innerWidth;
      const h = this.canvasContainer.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.rendererWrap.resize();
    };
    window.addEventListener('resize', this.onResize);

    this.startLoop();
  }

  startLoop() {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.elapsedTotal += dt;

      if (this.cameraControls) {
        this.cameraControls.update();
      }
      this.animController.update(dt, this.elapsedTotal);
      this.hostLookController.update(dt);
      this.speechOverlay.update();

      this.rendererWrap.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  setCameraPreset(preset) {
    if (this.cameraControls) {
      this.cameraControls.setPreset(preset);
    }
  }

  resetCamera() {
    if (this.cameraControls) {
      this.cameraControls.reset();
    }
  }

  dispose() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    if (this.cameraControls) this.cameraControls.dispose();
    this.speechOverlay.dispose();
    this.rendererWrap.dispose();
  }
}
