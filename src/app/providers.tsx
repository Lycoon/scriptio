"use client"; // 👈 CRITICAL: This makes hooks and context work

import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import { UserContextProvider } from "@src/context/UserContext";
import { DashboardContextProvider } from "@src/context/DashboardContext";
import fetcher from "@src/lib/fetcher";

export function Providers({ children }: { children: ReactNode }) {
    return (
        <SWRConfig
            value={{
                revalidateOnFocus: false,
                fetcher,
                onSuccess: () => { },
                onError: (err) => {
                    console.error("[Fetcher] An unexpected error occurred: ", err);
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
                    <ThemeProvider
                        attribute="class"
                        disableTransitionOnChange
                        defaultTheme="dark"
                        themes={["dark", "light", "latte", "wonka", "mint", "blossom"]}
                        enableColorScheme={false}
                    >
                        {children}
                    </ThemeProvider>
                </DashboardContextProvider>
            </UserContextProvider>
        </SWRConfig>
    );
}
