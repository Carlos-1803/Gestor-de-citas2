// Stable keys are independent of database IDs. Names match the shared catalog exactly.
export const HAIR_STYLES = [
  ["buzz", "Buzz cut", "Rapado uniforme siguiendo el contorno craneal."],
  ["classic", "Corte clásico", "Raya lateral, peinado ordenado y laterales limpios."],
  ["scissor", "Corte con tijera", "Volumen natural y laterales suaves con textura."],
  ["curls", "Corte de rizos", "Rizos definidos, volumen superior y contorno limpio."],
  ["junior", "Corte infantil", "Proporción ordenada con flequillo frontal ligero."],
  ["texture", "Corte texturizado", "Mechones irregulares, capas y movimiento."],
  ["crew", "Crew cut", "Superior corto, algo más alto al frente."],
  ["skin", "Degradado a piel", "Transición desde piel hasta volumen medio."],
  ["high", "Degradado alto", "Desvanecido alto con contraste en las sienes."],
  ["low", "Degradado bajo", "Degradado bajo conservando masa lateral."],
  ["mid", "Degradado medio", "Transición equilibrada a media sien."],
  ["lines", "Diseño con líneas", "Degradado con trazos geométricos laterales."],
  ["flat", "Flat top", "Superior plano y laterales rectos."],
  ["crop", "French crop", "Flequillo corto recto y laterales desvanecidos."],
  ["mohawk", "Mohicano", "Franja central alta y laterales muy rebajados."],
  ["mullet", "Mullet", "Frente corto y largo posterior hasta la nuca."],
  ["pompadour", "Pompadour", "Tupé alto, redondeado y peinado hacia atrás."],
  ["quiff", "Quiff", "Volumen frontal levantado con mechones sueltos."],
  ["taper", "Taper fade", "Desvanecido en patillas y nuca; contorno natural."],
  ["undercut", "Undercut", "Superior largo y desconexión marcada de laterales."],
].map(([key, name, description]) => Object.freeze({ key, name, description }));
export function normalizeStyleName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}
const byName = new Map(HAIR_STYLES.map(style => [normalizeStyleName(style.name), style]));
export function styleForName(name) { return byName.get(normalizeStyleName(name)) || null; }
export function linkCatalog(rows) {
  return HAIR_STYLES.map(style => {
    const cut = rows.find(row => normalizeStyleName(row.name || row.nombre) === normalizeStyleName(style.name));
    return { ...style, haircutId: cut?.id ?? null, description: cut?.description || cut?.descripcion || style.description };
  });
}
