import ContactContent from "@components/home/contact/ContactContent";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Contact | Scenarly®",
};

export default function ContactPage() {
    return <ContactContent />;
}
