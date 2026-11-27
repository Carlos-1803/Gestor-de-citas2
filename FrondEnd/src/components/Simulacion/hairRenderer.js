import * as THREE from "three";
import { crearModeloCabello, cambiarTonoCabello, liberarModeloCabello } from "./modelosCabello.js";
import { fitFace, viewportPose, safeHairOffset } from "./facePose.js";

export function createHairRenderer(canvas, source, settings, onStatus, onError) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2.1); light.position.set(-1, 3, 5); scene.add(light);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 100); camera.position.z = 10;
  let current = settings, hair = crearModeloCabello(settings.key, settings.tone), result = null;
  let colorTimer = 0, appliedTone = settings.tone;
  let frame = 0, disposed = false, lastTime = -1, lastDetection = 0, tracked = false, status = "", dirty = true;
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const matrix = new THREE.Matrix4(), translation = new THREE.Vector3(), matrixScale = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  hair.visible = false; scene.add(hair);
  const notify = text => { if (text !== status) { status = text; onStatus(text); } };
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    camera.left = -w / h; camera.right = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false); dirty = true;
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function draw() {
    const width = source.width(), height = source.height();
    const landmarks = result?.faceLandmarks?.[0];
    const face = fitFace(landmarks, width, height, source.mirror);
    const offset = safeHairOffset(face, current.scale, hair.userData.fringe, current.offset);
    const pose = viewportPose(face, width, height, canvas.clientWidth, canvas.clientHeight, current.scale, offset);
    if (hair.userData.error) throw hair.userData.error;
    if (!pose) {
      hair.visible = false; tracked = false;
      notify("No se detecta un rostro. Mira al frente y deja visibles la frente y las sienes.");
    } else {
      position.set(...pose.position); scale.set(...pose.scale);
      const transform = result?.facialTransformationMatrixes?.[0]?.data;
      if (transform?.length === 16 && Array.from(transform).every(Number.isFinite)) {
        matrix.fromArray(transform); matrix.decompose(translation, rotation, matrixScale);
        euler.setFromQuaternion(rotation, "YXZ");
        euler.x = THREE.MathUtils.clamp(euler.x, -.9, .9);
        euler.y = THREE.MathUtils.clamp(euler.y * (source.mirror ? -1 : 1), -1.2, 1.2);
        euler.z = pose.roll; rotation.setFromEuler(euler);
      } else rotation.setFromEuler(new THREE.Euler(0, 0, pose.roll));
      if (tracked && source.live) {
        hair.position.lerp(position, .5); hair.scale.lerp(scale, .5); hair.quaternion.slerp(rotation, .5);
      } else { hair.position.copy(position); hair.scale.copy(scale); hair.quaternion.copy(rotation); }
      tracked = true; hair.visible = true;
      notify(hair.userData.loading ? "Preparando hebras y sombras del corte…" : offset > current.offset + .001
        ? "Filtro ajustado al rostro. La altura se limita para dejar libres las cejas."
        : source.live ? "Rostro detectado. El filtro sigue tu cabeza." : "Rostro detectado en la foto. Puedes cambiar el corte, tono y ajuste.");
    }
    renderer.render(scene, camera);
  }
  function tick() {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    try {
      const now = performance.now();
      if (source.live && source.ready() && source.time() !== lastTime && now - lastDetection >= 66) {
        lastTime = source.time(); lastDetection = now; result = source.detect(); dirty = true;
      }
      if (dirty || hair.userData.loading || (tracked && source.live)) { draw(); dirty = false; }
    } catch (error) { cancelAnimationFrame(frame); onError(error); }
  }
  hair.userData.ready?.then(() => { if (!disposed) dirty = true; });
  tick();
  return {
    update(next) {
      if (disposed) return;
      if (next.key !== current.key) {
        clearTimeout(colorTimer); appliedTone = next.tone;
        scene.remove(hair); liberarModeloCabello(hair); hair = crearModeloCabello(next.key, next.tone); scene.add(hair);
      } else {
        clearTimeout(colorTimer);
        if (next.tone !== appliedTone) colorTimer = setTimeout(() => {
          if (disposed) return;
          appliedTone = next.tone; cambiarTonoCabello(hair, next.tone); dirty = true;
          hair.userData.ready?.then(() => { if (!disposed) dirty = true; });
        }, 80);
      }
      current = next; dirty = true;
      hair.userData.ready?.then(() => { if (!disposed) dirty = true; });
    },
    setResult(value) { result = value; dirty = true; },
    dispose() { disposed = true; clearTimeout(colorTimer); cancelAnimationFrame(frame); observer.disconnect(); liberarModeloCabello(hair); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
