"use client"; // 👈 CRITICAL: This makes hooks and context work

import { ReactNode, useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { SWRConfig } from "swr";
import { UserContextProvider } from "@src/context/UserContext";
import { DashboardContextProvider } from "@src/context/DashboardContext";
import { LocaleContextProvider, useLocale } from "@src/context/LocaleContext";
import { SpellcheckProvider } from "@src/context/SpellcheckContext";
import { useSettings } from "@src/lib/utils/hooks";
import fetcher from "@src/lib/fetcher";

/**
 * Syncs the "themed-editor" CSS class on <html> with the user's persisted setting.
 * Runs at the root so it applies before any editor is rendered.
 */
function EditorThemeSync() {
    const { settings } = useSettings();

    useEffect(() => {
        if (settings?.themedEditor !== undefined) {
            document.documentElement.classList.toggle("themed-editor", settings.themedEditor);
        }
        if (settings?.highlightOnHover !== undefined) {
            document.documentElement.classList.toggle("highlight-on-hover", settings.highlightOnHover);
        }
    }, [settings?.themedEditor, settings?.highlightOnHover]);

    return null;
}

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
                onSuccess: () => { },
                onError: (err) => {
                    if (err?.status !== 401 && err?.status !== 403) {
                        console.error("[Fetcher] An unexpected error occurred: ", err);
                    }
                },
                shouldRetryOnError: (err) => {
                    // Don't retry on auth errors (401, 403) or network errors (server unreachable)
                    if (err?.status === 401 || err?.status === 403 || err?.isNetworkError) {
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
                                themes={["dark", "light", "latte", "wonka", "mint", "blossom"]}
                                enableColorScheme={false}
                            >
                                <SpellcheckProvider>
                                    <EditorThemeSync />
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
