import {
  AssetsManager,
  type AssetsManagerOption,
} from "@gi-tcg/assets-manager";

const OPTIONS_ELEMENT_ID = "assets-manager-options";

function getAssetsManagerOptions(): Partial<AssetsManagerOption> {
  const serializedOptions =
    document.getElementById(OPTIONS_ELEMENT_ID)?.textContent;
  if (!serializedOptions) {
    return {};
  }
  try {
    const options: unknown = JSON.parse(serializedOptions);
    return typeof options === "object" && options !== null
      ? (options as Partial<AssetsManagerOption>)
      : {};
  } catch {
    // The development index.html contains the unreplaced server probe.
    return {};
  }
}

export const ASSETS_MANAGER = new AssetsManager(getAssetsManagerOptions());
