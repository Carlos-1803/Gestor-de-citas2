import { useCallback, useEffect, useRef, useState } from "react";

import * as THREE from "three";

import { api } from "../../api";

import {
  inicializarDetector,
  iniciarCamara,
  detectarRostro,
  liberarCamara,
  liberarDetector,
} from "./servicioSimulacion";

import {
  crearModeloCabello,
  liberarModeloCabello,
} from "./modelosCabello";

import "./simulacion.css";

const CORTES = [
  {
    id: "corte-clasico",
    nombre: "Corte clásico",
    descripcion: "Peinado clásico con volumen superior y textura.",
  },
  {
    id: "corte-texturizado",
    nombre: "Corte texturizado",
    descripcion: "Capas marcadas con textura en la parte superior.",
  },
];

// Escala uniforme para preservar la forma original del .glb
const AJUSTES = {
  escalaRelativaRostro: 1.22,
  offsetFrenteY: -0.01,
  posicionZ: 1,

  suavizadoPosicion: 0.62,
  suavizadoEscala: 0.38,
  suavizadoRotacion: 0.48,
};
function resolverEstiloModelo(corteSeleccionado, haircuts) {
  const corteActual = haircuts.find(
    (corte) => String(corte.id) === String(corteSeleccionado)
  );

  const identificador = [
    corteSeleccionado,
    corteActual?.nombre,
    corteActual?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    identificador.includes("texturizado") ||
    identificador.includes("french") ||
    identificador.includes("crop")
  ) {
    return "corte-texturizado";
  }

  if (
    identificador.includes("clasico") ||
    identificador.includes("clásico") ||
    identificador.includes("classic")
  ) {
    return "corte-clasico";
  }

  return "corte-clasico";
}

export function SimulacionView() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameRef = useRef(null);

  const [estado, setEstado] = useState("inactivo");
  const [mensaje, setMensaje] = useState("");
  const [corteSeleccionado, setCorteSeleccionado] = useState("corte-clasico");
  const [haircuts, setHaircuts] = useState(CORTES);

  const iniciarSimulador = useCallback(async () => {
    try {
      setEstado("iniciando");
      setMensaje("Solicitando acceso a la cámara...");

      await inicializarDetector();
      await iniciarCamara(videoRef.current);

      setEstado("activo");
      setMensaje("Coloca tu rostro frente a la cámara.");
    } catch (error) {
      console.error("Error al iniciar el simulador:", error);

      setEstado("error");
      setMensaje(error.message || "No se pudo iniciar el simulador.");

      liberarCamara();
      liberarDetector();
    }
  }, []);

  // Consultar los cortes del catálogo.
  useEffect(() => {
    let activo = true;

    api("/haircuts")
      .then((respuesta) => {
        const lista = Array.isArray(respuesta)
          ? respuesta
          : respuesta?.data;

        if (activo && Array.isArray(lista) && lista.length > 0) {
          setHaircuts(lista);
        }
      })
      .catch((error) => {
        console.warn("Se utilizarán los cortes iniciales:", error);
      });

    return () => {
      activo = false;
    };
  }, []);

  // Escena 3D y seguimiento facial.
  useEffect(() => {
    if (estado !== "activo") return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();

    const camera = new THREE.OrthographicCamera(
      -1,
      1,
      1,
      -1,
      0.1,
      100
    );

    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    const luzAmbiente = new THREE.AmbientLight(0xffffff, 2.2);
    scene.add(luzAmbiente);

    const luzPrincipal = new THREE.DirectionalLight(0xffffff, 1.5);
    luzPrincipal.position.set(0, 2, 5);
    scene.add(luzPrincipal);

    const estiloModelo = resolverEstiloModelo(corteSeleccionado, haircuts);

    const cabello = crearModeloCabello(estiloModelo);
    cabello.visible = false;

    scene.add(cabello);
    cabello.rotation.set(0, 0, 0);

    let primerSeguimiento = true;

    const posicionObjetivo = new THREE.Vector3();
    const escalaObjetivo = new THREE.Vector3();

    const posicionSuavizada = new THREE.Vector3();
    const escalaSuavizada = new THREE.Vector3();

    const matrizTransformacion = new THREE.Matrix4();
    const posicionMatriz = new THREE.Vector3();
    const escalaMatriz = new THREE.Vector3();
    const rotacionObjetivo = new THREE.Quaternion();
    const eulerRotacion = new THREE.Euler(0, 0, 0, "YXZ");

    const redimensionar = () => {
      const ancho = canvas.clientWidth;
      const alto = canvas.clientHeight;

      if (!ancho || !alto) return;

      const aspecto = ancho / alto;

      camera.left = -aspecto;
      camera.right = aspecto;
      camera.top = 1;
      camera.bottom = -1;

      camera.updateProjectionMatrix();

      renderer.setSize(ancho, alto, false);
    };

    redimensionar();

    const observador = new ResizeObserver(redimensionar);
    observador.observe(canvas.parentElement);

    const convertirCoordenadas = (x, y) => {
      const anchoCanvas = canvas.clientWidth;
      const altoCanvas = canvas.clientHeight;

      const anchoVideo = video.videoWidth;
      const altoVideo = video.videoHeight;

      if (
        !anchoCanvas ||
        !altoCanvas ||
        !anchoVideo ||
        !altoVideo
      ) {
        return null;
      }

      const escalaVideo = Math.min(
        anchoCanvas / anchoVideo,
        altoCanvas / altoVideo
      );

      const anchoRenderizado = anchoVideo * escalaVideo;
      const altoRenderizado = altoVideo * escalaVideo;

      const desplazamientoX =
        (anchoCanvas - anchoRenderizado) / 2;

      const desplazamientoY =
        (altoCanvas - altoRenderizado) / 2;

      const xReflejada = 1 - x;

      const pixelX =
        xReflejada * anchoRenderizado + desplazamientoX;

      const pixelY =
        y * altoRenderizado + desplazamientoY;

      const mundoX =
        (pixelX / altoCanvas) * 2 -
        anchoCanvas / altoCanvas;

      const mundoY =
        1 - (pixelY / altoCanvas) * 2;

      return new THREE.Vector2(mundoX, mundoY);
    };

    const animar = () => {
      frameRef.current = requestAnimationFrame(animar);

      try {
        const resultado = detectarRostro(video);
        const puntos = resultado?.faceLandmarks?.[0];
        const transformacionFacial =
          resultado?.facialTransformationMatrixes?.[0]?.data;

        if (puntos && puntos.length > 356) {
          const frente = puntos[10];
          const barbilla = puntos[152];
          const ladoIzquierdo = puntos[127];
          const ladoDerecho = puntos[356];

          const puntoFrente = convertirCoordenadas(frente.x, frente.y);
          const puntoBarbilla = convertirCoordenadas(barbilla.x, barbilla.y);
          const puntoIzquierdo = convertirCoordenadas(ladoIzquierdo.x, ladoIzquierdo.y);
          const puntoDerecho = convertirCoordenadas(ladoDerecho.x, ladoDerecho.y);

          if (!puntoFrente || !puntoBarbilla || !puntoIzquierdo || !puntoDerecho) {
            renderer.render(scene, camera);
            return;
          }

   const anchoRostro = puntoIzquierdo.distanceTo(puntoDerecho);
          const altoRostro = Math.max(
            Math.abs(puntoFrente.y - puntoBarbilla.y),
            anchoRostro * 0.8
          );
          const centroX = (puntoIzquierdo.x + puntoDerecho.x) / 2;
          const centroSienesY = (puntoIzquierdo.y + puntoDerecho.y) / 2;
          const anclajeY =
            puntoFrente.y * 0.65 +
            centroSienesY * 0.35 +
            altoRostro * AJUSTES.offsetFrenteY;

          const escalaUniforme = anchoRostro * AJUSTES.escalaRelativaRostro;

          posicionObjetivo.set(centroX, anclajeY, AJUSTES.posicionZ);
          escalaObjetivo.setScalar(escalaUniforme);

          const primerFrame = primerSeguimiento;

          if (primerFrame) {
            posicionSuavizada.copy(posicionObjetivo);
            escalaSuavizada.copy(escalaObjetivo);

            cabello.position.copy(posicionSuavizada);
            cabello.scale.copy(escalaSuavizada);

            primerSeguimiento = false;
          } else {
            posicionSuavizada.lerp(
              posicionObjetivo,
              AJUSTES.suavizadoPosicion
            );
            escalaSuavizada.lerp(
              escalaObjetivo,
              AJUSTES.suavizadoEscala
            );

            cabello.position.copy(posicionSuavizada);
            cabello.scale.copy(escalaSuavizada);
          }

          if (
            transformacionFacial &&
            transformacionFacial.length === 16
          ) {
            matrizTransformacion.fromArray(transformacionFacial);
            matrizTransformacion.decompose(
              posicionMatriz,
              rotacionObjetivo,
              escalaMatriz
            );

            eulerRotacion.setFromQuaternion(rotacionObjetivo, "YXZ");
            eulerRotacion.y = -eulerRotacion.y;
            eulerRotacion.z = -eulerRotacion.z;
            rotacionObjetivo.setFromEuler(eulerRotacion);

            if (primerFrame) {
              cabello.quaternion.copy(rotacionObjetivo);
            } else {
              cabello.quaternion.slerp(
                rotacionObjetivo,
                AJUSTES.suavizadoRotacion
              );
            }
          }

          cabello.visible = true;

          setMensaje("Rostro detectado. Mantén la cabeza frente a la cámara.");
        } else {
          cabello.visible = false;
          primerSeguimiento = true;

          setMensaje("Buscando tu rostro...");
        }

        renderer.render(scene, camera);
      } catch (error) {
        console.error("Error durante el seguimiento facial:", error);
      }
    };

    animar();

    return () => {
      cancelAnimationFrame(frameRef.current);
      observador.disconnect();
      liberarModeloCabello(cabello);
      renderer.dispose();
    };
  }, [estado, corteSeleccionado, haircuts]);

  // Liberar cámara y detector al salir.
  useEffect(() => {
    return () => {
      liberarCamara();
      liberarDetector();
    };
  }, []);

  const seleccionarCorte = async (corte) => {
    setCorteSeleccionado(String(corte.id));

    if (
      !Number.isNaN(Number(corte.id)) &&
      String(corte.id).trim() !== ""
    ) {
      try {
        await api("/preferencias/guardar", {
          method: "POST",
          body: JSON.stringify({
            estiloId: Number(corte.id),
          }),
        });
      } catch (error) {
        console.warn("No se pudo guardar la preferencia:", error);
      }
    }
  };

  return (
    <main className="simulador-container">
      <header className="simulador-header">
        <span className="simulador-etiqueta">
          ENTRECORTES
        </span>

        <h1>Simulador de cortes AR</h1>

        <p>
          Prueba diferentes estilos y observa cómo se ajustan a tu rostro.
        </p>
      </header>

      <section className="simulador-layout">
        <div className="simulador-camara">

          <video
            ref={videoRef}
            className="simulador-video"
            autoPlay
            muted
            playsInline
          />

          <canvas
            ref={canvasRef}
            className="simulador-canvas"
          />

          {estado !== "activo" && (
            <div className="simulador-inicio">
              <span className="simulador-icono">✦</span>

              <h2>Prueba tu próximo corte</h2>

              <p>
                Activa tu cámara para comenzar la simulación.
              </p>

              <button
                className="simulador-boton"
                onClick={iniciarSimulador}
                disabled={estado === "iniciando"}
              >
                {estado === "iniciando"
                  ? "Iniciando cámara..."
                  : estado === "error"
                    ? "Intentar nuevamente"
                    : "Activar cámara"}
              </button>
            </div>
          )}

          <div className="simulador-estado">
            <span
              className={
                estado === "activo"
                  ? "punto-activo"
                  : "punto-inactivo"
              }
            />

            {mensaje || "Cámara desactivada"}
          </div>
        </div>

        <aside className="simulador-panel">
          <h2>Elige tu estilo</h2>

          <p>
            Selecciona el corte que deseas probar.
          </p>

          <div className="simulador-cortes">
            {haircuts.map((corte) => (
              <button
                key={corte.id}
                className={`simulador-corte ${
                  String(corteSeleccionado) === String(corte.id)
                    ? "seleccionado"
                    : ""
                }`}
                onClick={() => seleccionarCorte(corte)}
              >
                <span className="corte-nombre">
                  {corte.nombre || corte.name}
                </span>

                <span className="corte-descripcion">
                  {corte.descripcion ||
                    corte.description ||
                    "Estilo disponible"}
                </span>
              </button>
            ))}
          </div>

          <div className="simulador-nota">
            <strong>Versión inicial</strong>

            <p>
              Los modelos 3D representan geometrías preliminares.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}