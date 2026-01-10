"use client"; // 👈 CRITICAL: This makes hooks and context work

import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import { UserContextProvider } from "@src/context/UserContext";
import { DashboardContextProvider } from "@src/context/DashboardContext";
import fetchJson from "@src/lib/fetchJson";

export function Providers({ children }: { children: ReactNode }) {
    return (
        <SWRConfig
            value={{
                revalidateOnFocus: true,
                fetcher: fetchJson,
                onSuccess: () => {},
                onError: (err) => {
                    console.error(err);
                },
            }}
        >
            <UserContextProvider>
                <DashboardContextProvider>
                    <ThemeProvider
                        attribute="class"
                        disableTransitionOnChange
                        defaultTheme="dark"
                        themes={["dark", "light", "latte", "wonka", "mint"]}
                        enableColorScheme={false}
                    >
                        {children}
                    </ThemeProvider>
                </DashboardContextProvider>
            </UserContextProvider>
        </SWRConfig>
    );
}
