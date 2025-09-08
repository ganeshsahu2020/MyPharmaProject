// src/three/avatar-scene.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function fitCameraToObject(camera, object, controls, offset = 1.2) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  let cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * offset;

  camera.position.set(center.x, center.y, cameraZ + center.z);
  camera.lookAt(center);

  const near = maxDim / 100;
  const far = maxDim * 100;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
}

/**
 * Initialize a Three.js scene that loads /avatar.glb into the given mount element.
 * @param {HTMLElement} mountEl A DOM element (e.g., a div) where the canvas should be placed.
 * @param {Object} opts Optional settings.
 * @returns {Function} dispose() cleanup function.
 */
export function initAvatarScene(mountEl, opts = {}) {
  if (!mountEl) throw new Error("initAvatarScene: mountEl is required");

  const width = mountEl.clientWidth || 640;
  const height = mountEl.clientHeight || 360;

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  mountEl.appendChild(renderer.domElement);

  // Scene & Camera
  const scene = new THREE.Scene();
  scene.background = null; // transparent; mountEl background color will show

  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
  camera.position.set(0, 1.4, 3);
  scene.add(camera);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(2, 4, 3);
  dir.castShadow = false;
  scene.add(dir);

  // Ground (optional, invisible but helps AO if you add it later)
  // const ground = new THREE.Mesh(
  //   new THREE.PlaneGeometry(10, 10),
  //   new THREE.MeshStandardMaterial({ color: 0x222222 })
  // );
  // ground.rotation.x = -Math.PI / 2;
  // ground.position.y = -1.0;
  // ground.receiveShadow = true;
  // scene.add(ground);

  // Load avatar
  const loader = new GLTFLoader();
  let avatar = null;
  let mixer = null;

  loader.load(
    opts.src || "/avatar.glb",
    (gltf) => {
      avatar = gltf.scene;
      avatar.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false; // avoid popping for morph targets
        }
      });
      scene.add(avatar);

      // If there are animations, play the first one
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(avatar);
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
      }

      // Frame the camera
      fitCameraToObject(camera, avatar, null, 1.25);

      // ✅ Expose for console debugging (DEV only)
      if (typeof window !== "undefined" && import.meta.env?.DEV) {
        window.__lastAvatar = avatar;
        console.log("[avatar] loaded and available at window.__lastAvatar");
      }
    },
    undefined,
    (err) => {
      console.error("Failed to load /avatar.glb:", err);
    }
  );

  // Resize handling
  const resize = () => {
    const w = mountEl.clientWidth || 640;
    const h = mountEl.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(mountEl);

  // Render loop
  const clock = new THREE.Clock();
  let rafId = 0;

  const animate = () => {
    rafId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    renderer.render(scene, camera);
  };
  animate();

  // Cleanup
  return function dispose() {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    if (mixer) mixer.stopAllAction();
    if (avatar) scene.remove(avatar);
    renderer.dispose();
    mountEl.removeChild(renderer.domElement);

    // free geometries/materials/textures
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose?.();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            Object.keys(m).forEach((k) => {
              const v = m[k];
              if (v && v.isTexture) v.dispose?.();
            });
            m.dispose?.();
          });
        }
      }
    });
  };
}
