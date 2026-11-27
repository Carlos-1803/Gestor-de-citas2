export const publicPhotoCache = "entrecortes-fotos-publicas";
export const isShopPhoto = path => typeof path === "string" && /^\/uploads\/[a-f0-9-]+\.(?:jpe?g|png|webp)$/i.test(path);
