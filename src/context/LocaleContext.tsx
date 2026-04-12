"use client";

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { UserLanguage } from "@src/lib/utils/types";

import enMessages from "../../messages/en.json";
import esMessages from "../../messages/es.json";
import frMessages from "../../messages/fr.json";
import zhMessages from "../../messages/zh.json";
import koMessages from "../../messages/ko.json";
import jaMessages from "../../messages/ja.json";
import deMessages from "../../messages/de.json";
import plMessages from "../../messages/pl.json";

const LOCALE_KEY = "scriptio-locale";
const DEFAULT_LOCALE: UserLanguage = "en";
const MESSAGES: Record<UserLanguage, typeof enMessages> = { en: enMessages, es: esMessages, fr: frMessages, zh: zhMessages, ko: koMessages, ja: jaMessages, de: deMessages, pl: plMessages };

interface LocaleContextValue {
    locale: UserLanguage;
    messages: typeof enMessages;
    setLanguage: (lang: UserLanguage) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
    locale: DEFAULT_LOCALE,
    messages: enMessages,
    setLanguage: () => {},
});

export function LocaleContextProvider({ children }: { children: ReactNode }) {
    const [locale, setLocale] = useState<UserLanguage>(() => {
        if (typeof window === "undefined") return DEFAULT_LOCALE;
        const stored = window.localStorage.getItem(LOCALE_KEY) as UserLanguage | null;
        return stored && stored in MESSAGES ? stored : DEFAULT_LOCALE;
    });

    const setLanguage = useCallback(
        (lang: UserLanguage) => {
            if (lang === locale) return;
            setLocale(lang);
            window.localStorage.setItem(LOCALE_KEY, lang);
        },
        [locale],
    );

    const value = useMemo(
        () => ({ locale, messages: MESSAGES[locale], setLanguage }),
        [locale, setLanguage],
    );

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
    return useContext(LocaleContext);
}
