
import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

let faceLandmarker = null;
let flujoCamara = null;
let inicializando = null;

export async function inicializarDetector() {
  if (faceLandmarker) return faceLandmarker;

  if (inicializando) return inicializando;

  inicializando = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });

    return faceLandmarker;
  })();

  try {
    return await inicializando;
  } catch (error) {
    faceLandmarker = null;
    throw error;
  } finally {
    inicializando = null;
  }
}

export async function iniciarCamara(videoElement) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("El navegador no permite acceder a la cámara.");
  }

  flujoCamara = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });

  videoElement.srcObject = flujoCamara;
  await videoElement.play();

  return flujoCamara;
}

export function detectarRostro(videoElement) {
  if (!faceLandmarker) {
    throw new Error("El detector facial no está inicializado.");
  }

  if (
    videoElement.readyState < 2 ||
    videoElement.videoWidth === 0
  ) {
    return null;
  }

  return faceLandmarker.detectForVideo(
    videoElement,
    performance.now()
  );
}

export function liberarCamara() {
  if (flujoCamara) {
    flujoCamara.getTracks().forEach((track) => track.stop());
    flujoCamara = null;
  }
}

export function liberarDetector() {
  if (faceLandmarker) {
    faceLandmarker.close();
    faceLandmarker = null;
  }
}
