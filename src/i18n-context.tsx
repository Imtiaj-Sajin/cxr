import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { translate, type Lang, type MessageKey } from './lib/i18n';

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const I18nContext = createContext<{ lang: Lang; t: T }>({
  lang: 'bn',
  t: (key, vars) => translate('bn', key, vars),
});

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: ((key, vars) => translate(lang, key, vars)) as T }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
