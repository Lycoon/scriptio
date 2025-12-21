import { Courier_Prime, Josefin_Sans, Inter } from "next/font/google";

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

export const josefin = Josefin_Sans({
    subsets: ["latin"],
    weight: ["400", "700"],
    variable: "--font-josefin",
});
