
import * as THREE from "three";

const COLOR_BASE = 0x30221c;

function crearMaterial(color = COLOR_BASE, opciones = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    ...opciones,
  });
}

// Construye una superficie curva sobre la cabeza.
function crearSuperficie(grupo, opciones = {}) {
  const {
    thetaInicio = 0,
    thetaFinal = 1.62,
    radioX = 0.95,
    radioY = 0.76,
    radioZ = 0.85,
    segmentosTheta = 36,
    segmentosPhi = 96,
    color = 0x49362c,
    colorInferior = null,
    ondulacion = 0,
  } = opciones;

  const vertices = [];
  const colores = [];
  const indices = [];

  const colorSuperior = new THREE.Color(color);
  const colorBajo = colorInferior
    ? new THREE.Color(colorInferior)
    : colorSuperior.clone();

  for (let i = 0; i <= segmentosTheta; i++) {
    const progreso = i / segmentosTheta;
    const theta =
      thetaInicio + progreso * (thetaFinal - thetaInicio);

    for (let j = 0; j <= segmentosPhi; j++) {
      const phi = (j / segmentosPhi) * Math.PI * 2;

      const variacion =
        1 + Math.sin(phi * 7 + theta * 4) * ondulacion;

      const x =
        radioX * Math.sin(theta) * Math.cos(phi) * variacion;

      const y =
        radioY * Math.cos(theta) * variacion;

      const z =
        radioZ * Math.sin(theta) * Math.sin(phi) * variacion;

      vertices.push(x, y, z);

      const colorVertice = colorSuperior.clone().lerp(
        colorBajo,
        progreso
      );

      colores.push(
        colorVertice.r,
        colorVertice.g,
        colorVertice.b
      );
    }
  }

  for (let i = 0; i < segmentosTheta; i++) {
    for (let j = 0; j < segmentosPhi; j++) {
      const actual = i * (segmentosPhi + 1) + j;
      const siguiente = actual + segmentosPhi + 1;

      indices.push(
        actual,
        actual + 1,
        siguiente,
        actual + 1,
        siguiente + 1,
        siguiente
      );
    }
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3)
  );

  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colores, 3)
  );

  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = crearMaterial(0xffffff, {
    vertexColors: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  grupo.add(mesh);

  return mesh;
}

// Crea mechones curvos y estilizados.
function crearMechon(
  grupo,
  puntos,
  color = 0x38251d,
  grosor = 0.025
) {
  const curva = new THREE.CatmullRomCurve3(
    puntos.map((punto) => new THREE.Vector3(...punto))
  );

  const geometry = new THREE.TubeGeometry(
    curva,
    18,
    grosor,
    5,
    false
  );

  const mesh = new THREE.Mesh(
    geometry,
    crearMaterial(color)
  );

  grupo.add(mesh);

  return mesh;
}

// Añade textura fina siguiendo la superficie del cabello.
function crearTexturaCabello(grupo, opciones = {}) {
  const {
    cantidad = 450,
    thetaInicio = 0.12,
    thetaFinal = 1.55,
    radioX = 0.95,
    radioY = 0.76,
    radioZ = 0.85,
    longitud = 0.018,
    color = 0x211610,
  } = opciones;

  const posiciones = [];
  const colores = [];

  const paleta = [
    new THREE.Color(color),
    new THREE.Color(0x493328),
    new THREE.Color(0x614535),
    new THREE.Color(0x302019),
  ];

  for (let i = 0; i < cantidad; i++) {
    const theta =
      thetaInicio +
      Math.random() * (thetaFinal - thetaInicio);

    const phi = Math.random() * Math.PI * 2;

    const variacion = (Math.random() - 0.5) * 0.025;

    const t1 = theta;
    const t2 = Math.min(theta + longitud, thetaFinal);

    const x1 =
      radioX * Math.sin(t1) * Math.cos(phi) * 1.008;

    const y1 =
      radioY * Math.cos(t1) * 1.008;

    const z1 =
      radioZ * Math.sin(t1) * Math.sin(phi) * 1.008;

    const x2 =
      radioX *
      Math.sin(t2) *
      Math.cos(phi + variacion) *
      1.01;

    const y2 =
      radioY * Math.cos(t2) * 1.01;

    const z2 =
      radioZ *
      Math.sin(t2) *
      Math.sin(phi + variacion) *
      1.01;

    posiciones.push(x1, y1, z1, x2, y2, z2);

    const tono = paleta[
      Math.floor(Math.random() * paleta.length)
    ];

    colores.push(
      tono.r, tono.g, tono.b,
      tono.r, tono.g, tono.b
    );
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(posiciones, 3)
  );

  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colores, 3)
  );

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.42,
  });

  grupo.add(new THREE.LineSegments(geometry, material));
}

// Crea mechones largos para la parte posterior del Mullet.
function crearPartePosteriorMullet(grupo) {
  const material = crearMaterial(0x38251e);

  // Base posterior, con forma alargada y redondeada.
  const base = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 32),
    material
  );

  base.position.set(0, -0.35, -0.48);
  base.scale.set(0.61, 0.63, 0.48);

  grupo.add(base);

  // Mechones posteriores con puntas diferenciadas.
  for (let lado = -1; lado <= 1; lado++) {
    const desplazamiento = lado * 0.30;

    crearMechon(
      grupo,
      [
        [desplazamiento * 0.7, -0.38, -0.67],
        [desplazamiento, -0.62, -0.78],
        [desplazamiento * 1.12, -0.94, -0.82],
        [desplazamiento * 1.2, -1.12, -0.72],
      ],
      lado === 0 ? 0x493026 : 0x302019,
      0.075
    );
  }

  // Textura en la zona posterior.
  crearTexturaCabello(grupo, {
    cantidad: 180,
    thetaInicio: 1.0,
    thetaFinal: 1.85,
    radioX: 0.65,
    radioY: 0.68,
    radioZ: 0.62,
    longitud: 0.025,
  });
}

// BUZZ CUT
function crearBuzzCut(grupo) {
  crearSuperficie(grupo, {
    thetaInicio: 0,
    thetaFinal: 1.66,
    radioX: 0.95,
    radioY: 0.76,
    radioZ: 0.85,
    color: 0x493328,
  });

  // Laterales cortos y uniformes.
  crearSuperficie(grupo, {
    thetaInicio: 1.42,
    thetaFinal: 1.72,
    radioX: 0.952,
    radioY: 0.762,
    radioZ: 0.852,
    color: 0x39271f,
    colorInferior: 0x493328,
  });

  crearTexturaCabello(grupo, {
    cantidad: 1700,
    thetaInicio: 0.08,
    thetaFinal: 1.62,
    longitud: 0.012,
  });
}

// MULLET
function crearMullet(grupo) {
  // Parte superior con mayor volumen.
  crearSuperficie(grupo, {
    thetaInicio: 0,
    thetaFinal: 1.48,
    radioX: 0.97,
    radioY: 0.79,
    radioZ: 0.88,
    color: 0x39251e,
    ondulacion: 0.008,
  });

  // Laterales más cortos.
  crearSuperficie(grupo, {
    thetaInicio: 1.18,
    thetaFinal: 1.73,
    radioX: 0.955,
    radioY: 0.765,
    radioZ: 0.86,
    color: 0x281c17,
    colorInferior: 0x493126,
  });

  // Cabello más largo en la nuca.
  crearPartePosteriorMullet(grupo);

  // Textura de la zona superior.
  crearTexturaCabello(grupo, {
    cantidad: 1000,
    thetaInicio: 0.10,
    thetaFinal: 1.45,
    longitud: 0.026,
    color: 0x21150f,
  });

  // Mechones de la parte superior orientados hacia atrás.
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.13;

    crearMechon(
      grupo,
      [
        [x * 0.6, 0.55, 0.20],
        [x, 0.62, -0.05],
        [x * 1.08, 0.50, -0.34],
        [x * 1.1, 0.32, -0.55],
      ],
      0x513629,
      0.018
    );
  }
}

// DEGRADADO MEDIO
function crearMidFade(grupo) {
  // Volumen superior.
  crearSuperficie(grupo, {
    thetaInicio: 0,
    thetaFinal: 1.48,
    radioX: 0.94,
    radioY: 0.78,
    radioZ: 0.86,
    color: 0x39251e,
    ondulacion: 0.006,
  });

  // Transición de cabello más denso a más corto.
  crearSuperficie(grupo, {
    thetaInicio: 1.15,
    thetaFinal: 1.83,
    radioX: 0.953,
    radioY: 0.765,
    radioZ: 0.87,
    color: 0x38261f,
    colorInferior: 0x725644,
  });

  // Banda inferior que suaviza el degradado.
  crearSuperficie(grupo, {
    thetaInicio: 1.66,
    thetaFinal: 1.92,
    radioX: 0.955,
    radioY: 0.767,
    radioZ: 0.872,
    color: 0x725644,
    colorInferior: 0x9a806d,
  });

  // Textura de la parte superior.
  crearTexturaCabello(grupo, {
    cantidad: 1150,
    thetaInicio: 0.10,
    thetaFinal: 1.45,
    longitud: 0.025,
    color: 0x21150f,
  });

  // Detalles discretos en la parte superior.
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.12;

    crearMechon(
      grupo,
      [
        [x * 0.8, 0.57, 0.20],
        [x, 0.65, 0.05],
        [x * 1.1, 0.58, -0.16],
      ],
      0x50362a,
      0.014
    );
  }
}

// Crear el modelo según el corte seleccionado.
export function crearModeloCabello(estilo) {
  const grupo = new THREE.Group();

  switch (estilo) {
    case "buzz-cut":
      crearBuzzCut(grupo);
      break;

    case "mullet":
      crearMullet(grupo);
      break;

    case "mid-fade":
      crearMidFade(grupo);
      break;

    default:
      crearBuzzCut(grupo);
      break;
  }

  return grupo;
}

// Liberar geometrías y materiales.
export function liberarModeloCabello(grupo) {
  if (!grupo) return;

  grupo.traverse((objeto) => {
    if (
      objeto.isMesh ||
      objeto.isLineSegments
    ) {
      objeto.geometry?.dispose();

      if (Array.isArray(objeto.material)) {
        objeto.material.forEach((material) => {
          material.dispose();
        });
      } else {
        objeto.material?.dispose();
      }
    }
  });
}
