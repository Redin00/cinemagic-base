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
    (key: keyof Translations) => {
      const dict = locale === "it" ? IT : EN;
      return dict[key] ?? key;
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
