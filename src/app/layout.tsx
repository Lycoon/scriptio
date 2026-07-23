import "@styles/globals.css";

import { playfair, inter, courier, josefin } from "@styles/fonts";
import layout from "@components/utils/Layout.module.css";
import { Providers } from "./providers";
import { Metadata } from "next";

const TITLE = "Scriptio | Screenwriting Software";
const DESCRIPTION = "Modern, elegant and affordable screenwriting software. Screenwriters first.";
const TITLE_IMG = "https://scriptio.app/images/banner.png";
const URL = "https://scriptio.app/";

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body>
                <Providers>
                    <div className="app-layout">
                        <main
                            className={`${layout.main} ${courier.variable} ${inter.variable} ${playfair.variable} ${josefin.variable}`}
                        >
                            {children}
                        </main>
                    </div>
                </Providers>
            </body>
        </html>
    );
}

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    applicationName: "Scriptio",
    authors: [{ name: "Hugo 'Lycoon' Bois" }],
    keywords: ["movie", "script", "writing", "story", "screenwriting"],
    icons: { icon: "/favicon.ico" },
    itunes: { appId: "6762051812", appArgument: URL },

    openGraph: {
        type: "website",
        url: URL,
        title: TITLE,
        description: DESCRIPTION,
        images: [
            {
                url: TITLE_IMG,
                width: 1200,
                height: 630,
                alt: "Scriptio Banner",
            },
        ],
        siteName: "Scriptio",
    },

    twitter: {
        card: "summary_large_image",
        site: "@your_handle",
        creator: "@your_handle",
        title: TITLE,
        description: DESCRIPTION,
        images: [TITLE_IMG],
    },
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
    // Fit-to-width auto-zoom handles page sizing on phones, so lock user scaling
    // to stop iOS from auto-zooming when a text field is focused.
    maximumScale: 1,
    userScalable: false,
    // Extend under the notch / home indicator; components pad with safe-area insets.
    viewportFit: "cover" as const,
    themeColor: "#525252",
};
