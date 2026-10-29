import React, {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import i18n from "../shared/i18n.cjs";

/**
 * The interface language is app-wide state that several unrelated subtrees need
 * (titlebar, preferences, every page). It lives in a tiny external store so the
 * provider can sit above `App` while `App` itself still calls `useT()`.
 */
let current = i18n.DEFAULT_LOCALE;
const listeners = new Set();

const getLocale = () => current;
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function setLocale(value) {
  const next = i18n.normalizeLocale(value);
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

const I18nContext = createContext(i18n.createT(i18n.DEFAULT_LOCALE));

export function LocaleProvider({ children }) {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  const value = React.useMemo(() => i18n.createT(locale), [locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `const t = useT()` — translate a key, optionally with `{name}` parameters. */
export const useT = () => useContext(I18nContext);

export const useLocale = () => useSyncExternalStore(subscribe, getLocale, getLocale);

/**
 * Formats dates and numbers with the same conventions the English interface
 * used before (`en-GB`: 24-hour clock, day/month order).
 */
export function useFormat() {
  const locale = useLocale();
  return React.useMemo(() => {
    const tag = i18n.dateLocale(locale);
    return {
      time: (value) =>
        value instanceof Date || typeof value === "number"
          ? value.toLocaleTimeString(tag, {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
      timestamp: (value) =>
        value instanceof Date || typeof value === "number"
          ? value.toLocaleString(tag)
          : "",
    };
  }, [locale]);
}

/** Translates a process-boundary error string when it is one of our keys. */
export function useErrorMessage() {
  const t = useT();
  return (value) => i18n.translateMaybe(t, value);
}

export default i18n;
