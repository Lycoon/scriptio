"use client"; // 👈 CRITICAL: This makes hooks and context work

import { ReactNode, useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { SWRConfig } from "swr";
import { UserContextProvider } from "@src/context/UserContext";
import { DashboardContextProvider } from "@src/context/DashboardContext";
import { LocaleContextProvider, useLocale } from "@src/context/LocaleContext";
import { SpellcheckProvider } from "@src/context/SpellcheckContext";
import fetcher from "@src/lib/fetcher";

/**
 * Reads locale/messages from LocaleContext and feeds NextIntlClientProvider.
 * Needed because useLocale() must be called inside LocaleContextProvider.
 */
function IntlBridge({ children }: { children: ReactNode }) {
    const { locale, messages } = useLocale();
    return (
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
            {children}
        </NextIntlClientProvider>
    );
}

/**
 * Syncs <html lang=""> attribute to the active locale.
 * Mirrors the EditorThemeSync pattern.
 */
function LocaleSync() {
    const { locale } = useLocale();
    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);
    return null;
}

export function Providers({ children }: { children: ReactNode }) {
    return (
        <SWRConfig
            value={{
                revalidateOnFocus: false,
                fetcher,
                onSuccess: () => {},
                onError: (err) => {
                    // 401/403 are handled by the auth flow. 404 is expected for offline-first
                    // resources (e.g. a cached project whose cloud copy no longer exists) — the
                    // calling hook decides what to do, no need to log it as unexpected.
                    if (err?.status !== 401 && err?.status !== 403 && err?.status !== 404) {
                        console.error("[Fetcher] An unexpected error occurred: ", err);
                    }
                },
                shouldRetryOnError: (err) => {
                    // Don't retry on auth errors (401, 403), missing resources (404), or
                    // network errors (server unreachable).
                    if (err?.status === 401 || err?.status === 403 || err?.status === 404 || err?.isNetworkError) {
                        return false;
                    }
                    return true;
                },
                errorRetryCount: 3,
            }}
        >
            <UserContextProvider>
                <DashboardContextProvider>
                    <LocaleContextProvider>
                        <IntlBridge>
                            <ThemeProvider
                                attribute="class"
                                disableTransitionOnChange
                                defaultTheme="dark"
                                themes={["dark", "wonka", "midnight", "light", "latte", "mint", "blossom"]}
                                enableColorScheme={false}
                            >
                                <SpellcheckProvider>
                                    <LocaleSync />
                                    {children}
                                </SpellcheckProvider>
                            </ThemeProvider>
                        </IntlBridge>
                    </LocaleContextProvider>
                </DashboardContextProvider>
            </UserContextProvider>
        </SWRConfig>
    );
}
