import {
  ParentProps,
  createMemo,
  createContext,
  useContext,
} from "solid-js";
import type { AssetsManager } from "@gi-tcg/assets-manager";
import { I18nDictionary } from "./locales";
import zhCN from "./locales/zh-CN";
import en from "./locales/en";
import {
  resolveTemplate,
  translator,
  Translator as SolidTranslator,
} from "@solid-primitives/i18n";
import { ASSETS_MANAGER } from "./assets";

export type Locale = "zh-CN" | "en";

const translations = {
  "zh-CN": zhCN,
  en: en,
};

export type Translator = SolidTranslator<I18nDictionary>;

interface I18nContextValue {
  locale: () => Locale;
  assetsManager: () => AssetsManager;
  t: Translator;
}

const I18nContext = createContext<I18nContextValue>();

export function I18nProvider(props: ParentProps) {
  const locale = () => "zh-CN" as const;
  const dict = createMemo(() => translations[locale()]);
  const t = translator(dict, resolveTemplate);

  const value: I18nContextValue = {
    locale,
    assetsManager: () => ASSETS_MANAGER,
    t,
  };

  return (
    <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext)!;
}
