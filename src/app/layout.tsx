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
            <head>
                {/* Disable WebKit text autosizing.
                 *
                 * MUST live here as a raw <style> rather than in a .css file.
                 * Lightning CSS (bundled in Next's pipeline) rewrites vendor
                 * prefixes from the browserslist targets, and its compat data
                 * wrongly believes Safari supports unprefixed `text-size-adjust`
                 * — so it deletes `-webkit-text-size-adjust` from every
                 * stylesheet and emits only `-moz-` + unprefixed. WebKit
                 * implements ONLY the prefixed form, so the declaration silently
                 * vanishes on exactly the browsers that need it (all iOS).
                 * A style string in JSX never reaches that pipeline.
                 *
                 * Why it matters: in phone paged mode .ProseMirror keeps its
                 * canonical 818px --page-width and is scaled down with `zoom`,
                 * so WebKit sees a block ~2x the viewport and clamps the 12pt
                 * screenplay font up to a "readable" ~18.7px. That crams the
                 * glyphs into the fixed 16px --line-height and makes the visible
                 * text wrap differently than #pagination-test-div measured it,
                 * so page breaks stutter while typing. Endless mode is immune
                 * (width:100%, so no inflation) — which is why the bug looked
                 * mode-specific.
                 *
                 * Costs no accessibility: desktop engines treat `none` as 100%,
                 * browser page zoom is unaffected, and the editor exposes its
                 * own font-size control. */}
                <style
                    dangerouslySetInnerHTML={{
                        __html: "html{-webkit-text-size-adjust:none}",
                    }}
                />
            </head>
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
