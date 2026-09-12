import "@styles/globals.css";

import { playfair, inter, courier, josefin } from "@styles/fonts";
import layout from "@components/utils/Layout.module.css";
import { Providers } from "./providers";
import { Metadata } from "next";
import { APP_TITLE } from "@src/lib/utils/constants";

const TITLE = APP_TITLE;
const DESCRIPTION = "Modern, elegant and affordable screenwriting software. Screenwriters first.";
const TITLE_IMG = "https://scenarly.com/images/banner.png";
const URL = "https://scenarly.com/";

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        // Font variables live on <html>, not on <main>: the phone drawers render
        // through a portal to document.body, which is outside <main>, so a
        // var(--font-inter) there resolved to nothing and the whole drawer fell
        // back to the OS font. next-themes only swaps its own theme class here,
        // so these survive a theme change.
        <html
            lang="en"
            suppressHydrationWarning
            className={`${courier.variable} ${inter.variable} ${playfair.variable} ${josefin.variable}`}
        >
            <body>
                <Providers>
                    <div className="app-layout">
                        <main className={layout.main}>{children}</main>
                    </div>
                </Providers>
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
    // Fit-to-width auto-zoom handles page sizing on phones, so lock user scaling
    // to stop iOS from auto-zooming when a text field is focused.
    maximumScale: 1,
    userScalable: false,
    // Extend under the notch / home indicator; components pad with safe-area insets.
    viewportFit: "cover" as const,
    themeColor: "#525252",
};
