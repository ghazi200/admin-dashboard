/** True for production mobile/web builds (npm run build / build:mobile). */
export const isProductionBuild = process.env.NODE_ENV === "production";
