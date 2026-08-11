import markAsset from "@/assets/alamaa-mark.svg.asset.json";
import logoDarkAsset from "@/assets/alamaa-logo-dark.png.asset.json";
import logoLightAsset from "@/assets/alamaa-logo-light.png.asset.json";

export const brand = {
  name: "علامة",
  nameLatin: "ALAMAA",
  tagline: "نظام الموارد البشرية",
  mark: markAsset.url,
  logoOnDark: logoDarkAsset.url,
  logoOnLight: logoLightAsset.url,
} as const;
