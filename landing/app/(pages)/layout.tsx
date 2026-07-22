import LandingPageNavbar from "@components/navbar/LandingPageNavbar";

/**
 * /privacy and /contact render the shared marketing navbar. The homepage (/)
 * lives outside this group and mounts the navbar itself (see HomeClient).
 */
export default function PagesLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <LandingPageNavbar />
            {children}
        </>
    );
}
