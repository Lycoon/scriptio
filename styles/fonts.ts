import { Courier_Prime, Inter, Playfair_Display } from "next/font/google";

export const courier = Courier_Prime({
    subsets: ["latin"],
    weight: ["400", "700"],
    variable: "--font-courier",
});

export const inter = Inter({
    subsets: ["latin"],
    weight: ["400", "700"],
    variable: "--font-inter",
});

export const playfair = Playfair_Display({
    subsets: ["latin"],
    weight: ["400", "700"],
    variable: "--font-playfair",
});
