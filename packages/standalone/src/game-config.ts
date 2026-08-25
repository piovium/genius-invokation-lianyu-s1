import {
  AssetsManager,
  DEFAULT_ASSETS_API_ENDPOINT,
  type AssetsManagerOption,
  type OverrideData,
} from "@gi-tcg/assets-manager";
import {
  createOfficialVersionResolver,
  getVersionBehavior,
  type Version,
  type VersionBehavior,
} from "@gi-tcg/core";
import { CustomDataLoader } from "@gi-tcg/custom-data-loader";
import DEPS from "@gi-tcg/data-code-analyzer";

const MATCH_CONFIG = (await fetch(
  "https://piovium.github.io/lianyu-s1-data-config/config.json",
).then((response) => response.json())) as {
  version: string;
  overrides: OverrideData[];
  versions: Record<string, Version>;
  mods: string[];
};

const versionResolver = createOfficialVersionResolver(
  undefined,
  MATCH_CONFIG.versions,
  DEPS,
);
const customDataLoader = new CustomDataLoader();
customDataLoader.setVersion(versionResolver);
await customDataLoader.loadMod(...MATCH_CONFIG.mods);
const [gameData, assetsManagerOptions] = customDataLoader.done();

export const GAME_DATA = gameData;
export const GAME_VERSION_BEHAVIOR: VersionBehavior = {
  ...getVersionBehavior("v7.0.0"),
  discardMaxCostHandsAbortPreview: false,
};
export const ASSETS_MANAGER_OPTIONS: Partial<AssetsManagerOption> = {
  ...assetsManagerOptions,
  apiEndpoint: DEFAULT_ASSETS_API_ENDPOINT,
  language: "CHS",
  overrideData: [
    ...(assetsManagerOptions.overrideData ?? []),
    ...MATCH_CONFIG.overrides,
  ],
  version: versionResolver.versionMap,
  defaultDeckCompatible: true,
};
export const ASSETS_MANAGER = new AssetsManager(ASSETS_MANAGER_OPTIONS);

void ASSETS_MANAGER.prepareForSync();
