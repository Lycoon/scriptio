"use client";

import { useState } from "react";
import styles from "../Landing.module.css";
import form from "@components/utils/Form.module.css";
import FormInfo, { FormInfoType } from "@components/utils/FormInfo";
import Footer from "../Footer";

export default function ContactContent() {
    const [email, setEmail] = useState("");
    const [reason, setReason] = useState("General inquiry");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [info, setInfo] = useState<FormInfoType | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setInfo(null);

        try {
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, reason, message }),
            });

            if (res.ok) {
                setInfo({ content: "Your message has been sent. We'll get back to you soon!" });
                setEmail("");
                setReason("General inquiry");
                setMessage("");
            } else {
                const data: { message?: string } = await res.json();
                setInfo({ content: data.message || "Something went wrong. Please try again.", isError: true });
            }
        } catch {
            setInfo({ content: "Something went wrong. Please try again.", isError: true });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={styles.pageWrapper}>
            <div className={styles.gradientBackground}></div>
            <div className={styles.pageContainer}>
                <h1 className={styles.pageTitle}>Contact</h1>
                <p className={styles.pageText} style={{ textAlign: "center", marginBottom: "2rem" }}>
                    Have a question, found a bug, or want to suggest a feature? Send us a message.
                </p>

                <form onSubmit={handleSubmit} className={styles.contactForm}>
                    <div className={form.element}>
                        <label className={form.label}>Email</label>
                        <input
                            type="email"
                            className={form.input}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <div className={form.element}>
                        <label className={form.label}>Reason</label>
                        <select
                            className={form.input}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        >
                            <option>Bug report</option>
                            <option>Feature request</option>
                            <option>General inquiry</option>
                            <option>Other</option>
                        </select>
                    </div>

                    <div className={form.element}>
                        <label className={form.label}>Message</label>
                        <textarea
                            className={`${form.input} ${form.input_desc}`}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Your message..."
                            required
                        />
                    </div>

                    {info && <FormInfo info={info} />}

                    <button type="submit" className={styles.ctaButton} disabled={submitting}>
                        {submitting ? "Sending..." : "Send message"}
                    </button>
                </form>
            </div>
            <Footer />
        </div>
    );
}
