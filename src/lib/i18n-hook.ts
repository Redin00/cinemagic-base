import { useCallback } from "react";

import { type Locale, type Translations, EN, IT } from "./i18n";
import { useLocale } from "./i18n-provider";

export function useTranslation() {
  const { locale, setLocale } = useLocale();

  const changeLanguage = useCallback(
    (newLocale: Locale) => {
      setLocale(newLocale);
    },
    [setLocale],
  );

  const t = useCallback(
    (key: keyof Translations, params?: Record<string, string | number>) => {
      const dict = locale === "it" ? IT : EN;
      let value: string = dict[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(new RegExp(`{${k}}`, "g"), String(v));
        }
      }
      return value;
    },
    [locale],
  );

  const tPlural = useCallback(
    (singularKey: keyof Translations, pluralKey: keyof Translations, count: number) => {
      const dict = locale === "it" ? IT : EN;
      const singular = dict[singularKey] ?? singularKey;
      const plural = dict[pluralKey] ?? pluralKey;
      return count === 1 ? singular : plural;
    },
    [locale],
  );

  return { locale, changeLanguage, t, tPlural };
}
