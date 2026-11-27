const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function fitFace(landmarks, width, height, mirror = false) {
  if (!landmarks || ![10, 152, 127, 356, 1].every(i => landmarks[i] && Number.isFinite(landmarks[i].x) && Number.isFinite(landmarks[i].y))) return null;
  const forehead = landmarks[10], chin = landmarks[152], a = landmarks[127], b = landmarks[356];
  const faceWidth = Math.hypot((b.x - a.x) * width, (b.y - a.y) * height);
  const faceHeight = Math.hypot((chin.x - forehead.x) * width, (chin.y - forehead.y) * height);
  if (faceWidth < 10 || faceHeight < 10) return null;
  const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
  const roll = -Math.atan2((right.y - left.y) * height, (right.x - left.x) * width) * (mirror ? -1 : 1);
  const upX = (forehead.x - chin.x) * width / faceHeight;
  const upY = (forehead.y - chin.y) * height / faceHeight;
  const browLandmarks = [9, 70, 63, 105, 66, 107, 336, 296, 334, 293, 300]
    .map(i => landmarks[i]).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const browY = browLandmarks.length ? Math.max(...browLandmarks.map(p =>
    ((p.x - forehead.x) * width * upX + (p.y - forehead.y) * height * upY) / faceWidth)) : -.25;
  // FaceLandmarker has no scalp landmark. Estimate the crown from forehead/chin.
  return { browY, x: mirror ? 1 - forehead.x : forehead.x, y: forehead.y, width: faceWidth,
    stretch: clamp(faceHeight / faceWidth, .85, 1.35), roll,
    crown: { x: forehead.x + (forehead.x - chin.x) * .35, y: forehead.y + (forehead.y - chin.y) * .35 } };
}
export function viewportPose(face, sourceWidth, sourceHeight, viewportWidth, viewportHeight, scale = 1, offset = 0) {
  if (!face || ![sourceWidth, sourceHeight, viewportWidth, viewportHeight].every(v => Number.isFinite(v) && v > 0)) return null;
  const fit = Math.min(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const dx = (viewportWidth - sourceWidth * fit) / 2, dy = (viewportHeight - sourceHeight * fit) / 2;
  const units = 2 / viewportHeight;
  const width = face.width * fit * units;
  return { position: [(dx + face.x * sourceWidth * fit - viewportWidth / 2) * units,
    (viewportHeight / 2 - dy - face.y * sourceHeight * fit) * units + offset * width, 0],
  scale: [width * scale, width * scale * face.stretch, width * scale], roll: face.roll };
}

export function safeHairOffset(face, scale, fringe, requested) {
  if (!face) return requested;
  const rootDepth = Math.max(.09, fringe || 0) + .025;
  return Math.max(requested, face.browY + .045 + rootDepth * scale * face.stretch);
}
