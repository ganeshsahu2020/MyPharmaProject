// src/components/WebAvatar.jsx
import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Known mouth/viseme keys (OVR + VRoid/RPM-style)
const KNOWN_LIP_KEYS = [
  "viseme_aa",
  "viseme_AA",
  "viseme_ah",
  "viseme_AH",
  "viseme_ee",
  "viseme_EE",
  "viseme_ih",
  "viseme_IH",
  "viseme_oh",
  "viseme_OH",
  "viseme_ou",
  "viseme_OU",
  "jawOpen",
  "JawOpen",
  "mouthOpen",
  "MouthOpen",
  "A",
  "I",
  "U",
  "E",
  "O",
];

function pickLipMorph(mesh) {
  if (!mesh?.morphTargetDictionary) return null;
  for (const k of KNOWN_LIP_KEYS) {
    if (k in mesh.morphTargetDictionary) {
      return { key: k, index: mesh.morphTargetDictionary[k] };
    }
  }
  return null;
}

function buildLipSchedule(text) {
  const openSet = /[aeiouAEIOU]/;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const schedule = [];
  let t = 0;
  for (const w of words) {
    const per = 55,
      gap = 90;
    for (const ch of w) {
      schedule.push({ at: t, weight: openSet.test(ch) ? 1.0 : 0.35 });
      t += per;
    }
    schedule.push({ at: t, weight: 0.1 });
    t += gap;
  }
  schedule.push({ at: t, weight: 0.0 });
  return { schedule, total: t };
}

const WebAvatar = forwardRef(({ src = "/avatar.glb" }, ref) => {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());

  // mouth control
  const lipMeshRef = useRef(null);
  const lipIndexRef = useRef(-1);
  const fallbackMouthRef = useRef(null);

  // speaking state
  const targetWeightRef = useRef(0);
  const scheduleRef = useRef(null); // { base, items }
  const speakUntilRef = useRef(0);
  const pausedRef = useRef(false);
  const pausedElapsedRef = useRef(0);

  // helpers (also exposed for console test)
  const scheduleSpeak = (text) => {
    const now = performance.now();
    const { schedule, total } = buildLipSchedule(text);
    scheduleRef.current = { base: now, items: schedule };
    speakUntilRef.current = now + total + 200;
    pausedRef.current = false;
    pausedElapsedRef.current = 0;
  };

  const doPause = () => {
    if (pausedRef.current || !scheduleRef.current) return;
    pausedRef.current = true;
    pausedElapsedRef.current = performance.now() - scheduleRef.current.base;
  };

  const doResume = () => {
    if (!pausedRef.current || !scheduleRef.current) return;
    pausedRef.current = false;
    scheduleRef.current.base = performance.now() - pausedElapsedRef.current;
  };

  const doStop = () => {
    scheduleRef.current = null;
    speakUntilRef.current = 0;
    pausedRef.current = false;
    pausedElapsedRef.current = 0;
    targetWeightRef.current = 0;
    if (lipMeshRef.current && lipIndexRef.current >= 0) {
      lipMeshRef.current.morphTargetInfluences[lipIndexRef.current] = 0;
    }
    if (fallbackMouthRef.current) fallbackMouthRef.current.scale.y = 1;
  };

  useImperativeHandle(ref, () => ({
    speak: scheduleSpeak,
    pause: doPause,
    resume: doResume,
    stop: doStop,
  }));

  // tiny console hook: window.__avatarTest("hello")
  useEffect(() => {
    window.__avatarTest = scheduleSpeak;
    return () => {
      if (window.__avatarTest === scheduleSpeak) delete window.__avatarTest;
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const width = mount.clientWidth;
    const height = Math.max(220, Math.floor((width * 9) / 16));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 1.35, 2.05);
    cameraRef.current = camera;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(3, 5, 2);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.34));

    // load GLB
    const loader = new GLTFLoader();
    loader.load(
      src,
      (gltf) => {
        const root = gltf.scene || gltf.scenes?.[0];
        if (!root) return;

        // find a valid mouth morph
        root.traverse((o) => {
          if (!lipMeshRef.current && o.isMesh && o.morphTargetDictionary) {
            const picked = pickLipMorph(o);
            if (picked) {
              lipMeshRef.current = o;
              lipIndexRef.current = picked.index;
            }
          }
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });

        // fallback mouth if no morph found
        if (!lipMeshRef.current) {
          const bbox = new THREE.Box3().setFromObject(root);
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const center = new THREE.Vector3();
          bbox.getCenter(center);

          // size + placement tuned so it’s visible on “robot” style heads too
          const w = Math.max(0.06, size.x * 0.32);
          const h = Math.max(0.012, size.y * 0.06);
          const d = Math.max(0.006, size.z * 0.02);
          const geo = new THREE.BoxGeometry(w, h, d);
          const mat = new THREE.MeshStandardMaterial({
            color: 0xff4d4f,
            roughness: 0.5,
            metalness: 0.05,
            emissive: new THREE.Color(0x410000), // a bit of glow so it stands out
            emissiveIntensity: 0.6,
          });
          const mouth = new THREE.Mesh(geo, mat);
          // slightly below head center; push forward so it’s not hidden
          mouth.position.set(
            center.x,
            center.y - size.y * 0.1,
            bbox.max.z + d * 3.2
          );
          mouth.lookAt(camera.position);
          root.add(mouth);
          fallbackMouthRef.current = mouth;
        }

        // frame model nicely
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        root.position.sub(center);
        const s = 1.9 / Math.max(size.x, size.y, size.z);
        root.scale.setScalar(s);
        root.position.y = -0.08;

        scene.add(root);

        // do NOT autoplay embedded animations → no “dancing”
      },
      undefined,
      (e) => console.warn("Avatar load failed:", e?.message || e)
    );

    const onResize = () => {
      const w = mount.clientWidth;
      const h = Math.max(220, Math.floor((w * 9) / 16));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(mount);

    let raf = 0;
    const animate = () => {
      const dt = clockRef.current.getDelta();

      // schedule → target weight
      const now = performance.now();
      if (
        scheduleRef.current &&
        now <= speakUntilRef.current &&
        !pausedRef.current
      ) {
        const elapsed = now - scheduleRef.current.base;
        let w = 0;
        for (const kf of scheduleRef.current.items) {
          if (kf.at <= elapsed) w = kf.weight;
          else break;
        }
        targetWeightRef.current = w;
      } else if (!pausedRef.current) {
        targetWeightRef.current = 0;
      }

      // apply smoothly (morph or fallback)
      if (lipMeshRef.current && lipIndexRef.current >= 0) {
        const cur =
          lipMeshRef.current.morphTargetInfluences[lipIndexRef.current] || 0;
        const next =
          cur +
          (targetWeightRef.current - cur) * Math.min(1, dt * 10);
        lipMeshRef.current.morphTargetInfluences[lipIndexRef.current] =
          THREE.MathUtils.clamp(next, 0, 1);
      } else if (fallbackMouthRef.current) {
        const cur = fallbackMouthRef.current.scale.y;
        const target = 1 + THREE.MathUtils.lerp(0, 1.25, targetWeightRef.current);
        fallbackMouthRef.current.scale.y =
          cur + (target - cur) * Math.min(1, dt * 10);
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      resizeObs.disconnect();
      renderer.dispose();
      scene.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
          else o.material?.dispose?.();
        }
      });
      renderer.domElement?.remove?.();
      lipMeshRef.current = null;
      lipIndexRef.current = -1;
      fallbackMouthRef.current = null;
    };
  }, [src]);

  return (
    <div
      ref={mountRef}
      className="w-full aspect-video bg-black/90 rounded-md overflow-hidden"
      style={{ minHeight: 220 }}
    />
  );
});

export default WebAvatar;
