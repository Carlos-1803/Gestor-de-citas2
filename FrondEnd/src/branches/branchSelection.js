export const branchKey = (userId) => `barberst.activeShop.${userId}`;

export function chooseBranch(shops, preferredId = null) {
  if (shops.length === 0) return { page: "createBranch", activeShopId: null };
  const preferred = shops.find((shop) => shop.id === Number(preferredId));
  if (preferred) return { page: "manage", activeShopId: preferred.id };
  if (shops.length === 1) return { page: "manage", activeShopId: shops[0].id };
  return { page: "branches", activeShopId: null };
}
