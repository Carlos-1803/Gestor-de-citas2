import { GridLayer } from "leaflet";
import { ancestorCrop, MIN_ZOOM } from "./mapRegion";
import { fetchTile, getStoredTile, storeTile } from "./mapStorage";
import { sourceKey } from "./mapConfig";

async function draw(canvas, record, crop) {
  let image;
  let objectUrl;
  if (typeof createImageBitmap === "function") image = await createImageBitmap(record.blob);
  else {
    objectUrl = URL.createObjectURL(record.blob);
    image = new Image();
    image.src = objectUrl;
    await image.decode();
  }
  const context = canvas.getContext("2d");
  if (crop) {
    const scale = image.width / 256;
    context.drawImage(image, crop.sx * scale, crop.sy * scale, crop.size * scale, crop.size * scale, 0, 0, 256, 256);
  } else context.drawImage(image, 0, 0, 256, 256);
  image.close?.();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
}

export default class PersistentTileLayer extends GridLayer {
  constructor(config, options) {
    super(options);
    this.config = config;
    this.aborters = new WeakMap();
    this.on("tileunload", ({ tile }) => this.aborters.get(tile)?.abort());
  }
  createTile(coords, done) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 256;
    tile.setAttribute("role", "presentation");
    const controller = new AbortController();
    this.aborters.set(tile, controller);
    this.paint(tile, coords, controller.signal).catch(() => {}).finally(() => done(null, tile));
    return tile;
  }
  async paint(tile, coords, signal) {
    const context = tile.getContext("2d");
    context.fillStyle = "#ece9dc";
    context.fillRect(0, 0, 256, 256);
    const sources = [...new Map([this.config.offline, this.config.online].filter(Boolean).map((source) => [sourceKey(source), source])).values()];
    for (const source of sources) {
      const record = await getStoredTile(source, coords);
      if (record) {
        await draw(tile, record);
        tile.dataset.mapTile = `cached-${coords.z}`;
        if (record.pinned || record.expiresAt > Date.now() || navigator.onLine === false) return;
        break;
      }
    }
    // Preserve visible detail immediately; an available coarse parent is scaled
    // and cropped to the requested child, including zooms beyond native detail.
    if (!tile.dataset.mapTile) {
      outer: for (let z = coords.z - 1; z >= MIN_ZOOM; z--) {
        const crop = ancestorCrop(coords, z);
        for (const source of sources) {
          const parent = await getStoredTile(source, crop);
          if (parent) {
            await draw(tile, parent, crop);
            tile.dataset.mapTile = `ancestor-${z}`;
            break outer;
          }
        }
      }
    }
    if (navigator.onLine !== false && !signal.aborted) {
      try {
        const result = await fetchTile(this.config.online, coords, signal);
        if (signal.aborted) return;
        await draw(tile, result);
        tile.dataset.mapTile = "network";
        if (result.cacheable) await storeTile(this.config.online, coords, result.blob, result).catch(() => {});
        return;
      } catch { /* Keep the cached parent during intermittent coverage. */ }
    }
    if (!tile.dataset.mapTile) {
      context.fillStyle = "#5b6457";
      context.font = "12px system-ui";
      context.textAlign = "center";
      context.fillText("Zona aún no guardada", 128, 118);
      context.fillText("Conecta para ver el mapa", 128, 138);
      tile.dataset.mapTile = "missing";
    }
  }
}
