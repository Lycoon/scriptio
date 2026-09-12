import "@styles/globals.css";

import { playfair, inter, courier, josefin } from "@styles/fonts";
import layout from "@components/utils/Layout.module.css";
import { Metadata } from "next";

const TITLE = "Scenarly | Screenwriting Software";
const DESCRIPTION = "Modern, elegant and affordable screenwriting software. Screenwriters first.";
// Self-hosted under /_site so the homepage's OG tag never depends on the app container.
const TITLE_IMG = "https://scenarly.com/_site/images/banner.png";
const URL = "https://scenarly.com/";

// The homepage only ever renders in dark — no theme switching, so no ThemeProvider
// or next-themes: the class is fixed at build time, not toggled client-side.
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        // Font variables sit on <html> here too, matching the app layout.
        <html
            lang="en"
            className={`dark ${courier.variable} ${inter.variable} ${playfair.variable} ${josefin.variable}`}
        >
            <body>
                <div className="app-layout">
                    <main className={layout.main}>{children}</main>
                </div>
            </body>
        </html>
    );
}

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    applicationName: "Scenarly",
    authors: [{ name: "Hugo 'Lycoon' Bois" }],
    keywords: ["movie", "script", "writing", "story", "screenwriting"],
    icons: { icon: "/_site/favicon.ico" },

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
                alt: "Scenarly Banner",
            },
        ],
        siteName: "Scenarly",
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
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover" as const,
    themeColor: "#525252",
};
