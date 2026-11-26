import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const RUTAS_MODELOS = {
  "corte-clasico": "/models/cabello/coleccion/corte-clasico.glb",
  "corte-texturizado": "/models/cabello/coleccion/corte-texturizado.glb",
};

const ROTACION_Y_BASE = {
  "corte-clasico": 0,
  "corte-texturizado": 0,
};

// Posición vertical centrada alrededor del cráneo para que abrace frente y sienes
const OFFSET_LOCAL_Y = {
  "corte-clasico": -0.04,
  "corte-texturizado": -0.04,
};

const OFFSET_LOCAL_Z = {
  "corte-clasico": -0.06,
  "corte-texturizado": -0.06,
};

const cacheEscenas = new Map();

function cargarEscenaGLTF(ruta) {
  if (!cacheEscenas.has(ruta)) {
    const loader = new GLTFLoader();
    const promesa = loader.loadAsync(ruta).catch((error) => {
      cacheEscenas.delete(ruta);
      throw error;
    });
    cacheEscenas.set(ruta, promesa);
  }
  return cacheEscenas.get(ruta);
}

function liberarObjeto(objeto) {
  objeto.traverse((hijo) => {
    if (hijo.isMesh) {
      hijo.geometry?.dispose();
      const mats = Array.isArray(hijo.material)
        ? hijo.material
        : [hijo.material];
      mats.forEach((m) => m?.dispose());
    }
  });
}

function sanearGeometria(geometria) {
  const posAttr = geometria.attributes.position;
  if (posAttr) {
    let corregido = false;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        posAttr.setXYZ(i, 0, 0, 0);
        corregido = true;
      }
    }
    if (corregido) {
      posAttr.needsUpdate = true;
    }
  }
  if (!geometria.attributes.normal) {
    geometria.computeVertexNormals();
  }
}

function crearOclusorCabeza() {
  // Óvalo invisible que representa tu cabeza/rostro para ocultar la parte trasera del cabello
  const geoOclusor = new THREE.SphereGeometry(0.42, 24, 24);
  geoOclusor.scale(0.84, 1.08, 0.92);

  const matOclusor = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
  });

  const oclusor = new THREE.Mesh(geoOclusor, matOclusor);
  oclusor.position.set(0, -0.16, -0.02);
  oclusor.renderOrder = 0;
  return oclusor;
}

function prepararModelo(escenaOriginal, estilo) {
  const contenedor = new THREE.Group();
  const pivote = new THREE.Group();
  pivote.rotation.y = ROTACION_Y_BASE[estilo] ?? 0;

  // 1. Oclusor primero (renderOrder = 0)
  const oclusor = crearOclusorCabeza();
  pivote.add(oclusor);

  // 2. Modelo de cabello después (renderOrder = 1)
  const clonEscena = escenaOriginal.clone(true);

  const materialCabello = new THREE.MeshStandardMaterial({
    color: 0x24160e,
    roughness: 0.78,
    metalness: 0.04,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  clonEscena.traverse((hijo) => {
    if (hijo.isMesh && hijo.geometry) {
      hijo.geometry = hijo.geometry.clone();
      sanearGeometria(hijo.geometry);
      hijo.frustumCulled = false;
      hijo.material = materialCabello;
      hijo.renderOrder = 1;
    }
  });

  pivote.add(clonEscena);
  pivote.updateMatrixWorld(true);

  const caja = new THREE.Box3().setFromObject(clonEscena);
  if (!caja.isEmpty() && Number.isFinite(caja.min.x)) {
    const centro = new THREE.Vector3();
    const tamano = new THREE.Vector3();
    caja.getCenter(centro);
    caja.getSize(tamano);

    const mayorDimension = Math.max(tamano.x, tamano.y, tamano.z, 0.0001);
    const factorNormalizacion = 1 / mayorDimension;

    clonEscena.scale.setScalar(factorNormalizacion);
    clonEscena.position.set(
      -centro.x * factorNormalizacion,
      -centro.y * factorNormalizacion + (OFFSET_LOCAL_Y[estilo] ?? -0.04),
      -centro.z * factorNormalizacion + (OFFSET_LOCAL_Z[estilo] ?? -0.06)
    );
  }

  contenedor.add(pivote);
  return contenedor;
}

export function crearModeloCabello(estilo = "corte-clasico") {
  const grupo = new THREE.Group();
  grupo.name = `ModeloCabello-${estilo}`;
  grupo.userData.cancelado = false;

  const ruta = RUTAS_MODELOS[estilo] || RUTAS_MODELOS["corte-clasico"];

  cargarEscenaGLTF(ruta)
    .then((gltf) => {
      if (grupo.userData.cancelado) return;

      const modeloListo = prepararModelo(gltf.scene, estilo);

      if (grupo.userData.cancelado) {
        liberarObjeto(modeloListo);
        return;
      }

      grupo.add(modeloListo);
      console.log(`Modelo GLB cargado: ${estilo} (${ruta})`);
    })
    .catch((error) => {
      console.error(`Error al cargar ${ruta}:`, error);
    });

  return grupo;
}

export function liberarModeloCabello(modelo) {
  if (!modelo) return;
  modelo.userData.cancelado = true;
  liberarObjeto(modelo);
  modelo.clear();
}