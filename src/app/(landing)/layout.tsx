import LandingPageNavbar from "@components/navbar/LandingPageNavbar";

export default function LandingLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <LandingPageNavbar />
            {children}
        </>
    );
}
