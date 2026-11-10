import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'vi' | 'en';

// Only the strings the interface still reads through t(); the rest of the
// site is written in English directly.
const dictionary: Record<string, { vi: string; en: string }> = {
  'common.connectWallet': { vi: 'Kết nối ví', en: 'Connect wallet' },
  'common.disconnect': { vi: 'Ngắt kết nối giao diện', en: 'Disconnect UI' },
  'cert.noneHint': { vi: 'Sau khi retire, chứng nhận của bạn sẽ hiện ở đây sau vài giây.', en: 'After you retire SAL, your certificate appears here within a few seconds.' },
};

interface LanguageContextValue {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function initialLanguage(): Language {
  const saved = localStorage.getItem('salx.language');
  if (saved === 'en') return 'en';
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = (next: Language) => {
    localStorage.setItem('salx.language', next);
    setLanguageState(next);
  };

  useEffect(() => { document.documentElement.lang = language; localStorage.setItem('salx.language', language); }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: language === 'vi' ? 'vi-VN' : 'en-US',
    setLanguage,
    toggleLanguage: () => setLanguage(language === 'vi' ? 'en' : 'vi'),
    t: (key: string) => dictionary[key]?.[language] || key,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
