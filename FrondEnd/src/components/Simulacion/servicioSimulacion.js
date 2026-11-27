import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export async function crearDetector(mode, signal) {
  const response = await fetch("/ra/face_landmarker.task", { signal });
  if (!response.ok) throw new Error("No se descargó el detector facial. Prepara el simulador sin conexión e inténtalo de nuevo.");
  const model = new Uint8Array(await response.arrayBuffer());
  if (model.length < 1000000 || !model.subarray(0, 8).some((byte, i) => byte === 80 && model[i + 1] === 75)) throw new Error("El servidor no está entregando el modelo facial correctamente.");
  const vision = await FilesetResolver.forVisionTasks("/ra/vision");
  signal?.throwIfAborted();
  let detector;
  try {
    detector = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: model, delegate: "GPU" }, runningMode: mode,
      numFaces: 1, outputFacialTransformationMatrixes: true,
    });
  } catch {
    signal?.throwIfAborted();
    detector = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: model, delegate: "CPU" }, runningMode: mode,
      numFaces: 1, outputFacialTransformationMatrixes: true,
    });
  }
  if (signal?.aborted) { detector.close(); signal.throwIfAborted(); }
  return detector;
}
export async function iniciarCamara(signal) {
  if (!window.isSecureContext) throw new Error("La cámara necesita HTTPS o localhost. También puedes cargar una foto.");
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador no ofrece cámara. Puedes cargar una foto.");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
    if (signal?.aborted) { liberarCamara(stream); signal.throwIfAborted(); }
    return stream;
  } catch (error) {
    if (error.name === "NotAllowedError") throw new Error("Permiso de cámara denegado. Autorízalo en el navegador o carga una foto.", { cause: error });
    if (error.name === "NotFoundError") throw new Error("No se encontró una cámara. Puedes cargar una foto.", { cause: error });
    throw error;
  }
}
export function liberarCamara(stream) { stream?.getTracks().forEach(track => track.stop()); }
