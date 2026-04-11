"use client";

import styles from "../Landing.module.css";
import Footer from "../Footer";

export default function PrivacyContent() {
    return (
        <div className={styles.pageWrapper}>
            <div className={styles.gradientBackground}></div>
            <div className={styles.pageContainer}>
                <h1 className={styles.pageTitle}>Privacy Policy</h1>

                <section>
                    <p className={styles.pageText}>
                        We are committed to protecting the privacy and security of the people who use our screenwriting
                        software. This Privacy Policy explains what information we collect, how we use and store it, the
                        choices available to you, and the safeguards we put in place — whether you use Scriptio® offline
                        on desktop, sign in to synchronize with the cloud, or use Scriptio® in a web browser. Please
                        read this policy carefully. By using Scriptio® you accept the practices described below.
                    </p>
                </section>

                <section>
                    <h2 className={styles.pageSectionTitle}>Transparency</h2>
                    <p className={styles.pageText}>
                        At Scriptio®, we believe that trust is earned through radical transparency, not vague promises.
                        We understand that your creative work is your most valuable asset, and you deserve to know
                        exactly how it is handled, stored, and protected. To honor this commitment, we have made the
                        choice to be a source-available platform.
                    </p>
                </section>

                <section>
                    <h2 className={styles.pageSectionTitle}>Data residency</h2>
                    <p className={styles.pageText}>
                        The privacy of your creative work starts with where it is stored. We have purposefully designed
                        our infrastructure to ensure that your data remains in control, hosted entirely on European
                        soil.
                    </p>
                    <ul>
                        <li className={styles.pageText}>
                            <b>User Accounts & Core Database</b> — Your identity and account details are hosted on
                            servers located in France, operated by OVHcloud. By choosing a French infrastructure
                            provider, we ensure your core data never leaves the country.
                        </li>
                        <li className={styles.pageText}>
                            <b>Project Assets & Backups</b> — Every screenplay, asset, and backup you create is stored
                            in the <b>Western Europe (WEUR)</b> region via Cloudflare R2.
                        </li>
                        <li className={styles.pageText}>
                            <b>Emailing & Communications</b> — All notifications and support exchanges are managed
                            through Zoho.eu. This means your metadata and communications are processed within secure
                            data centers located in Europe.
                        </li>
                    </ul>
                </section>

                <section>
                    <h2 className={styles.pageSectionTitle}>Information we collect</h2>
                    <p className={styles.pageText}>
                        We limit collection to the minimum required to deliver the service, including <b>account</b> and
                        <b> project</b> information. When you create an account (required for browser use and optional
                        for desktop sync) we collect your e-mail address and a password.
                    </p>
                    <p className={styles.pageText}>
                        Screenplays, user preferences, boards, notes and other creative content you create or edit in
                        Scriptio® whenever your project is synced to cloud.
                    </p>
                    <p className={styles.pageText}>
                        Technical and diagnostic data: minimal technical information necessary to operate, secure and
                        improve the product (for example, basic error reports). We do not collect advertising or
                        behavioral tracking data. Desktop use can be entirely offline and does not require an account,
                        signing in on desktop is optional and enables cloud synchronization.
                    </p>
                </section>

                <section>
                    <h2 className={styles.pageSectionTitle}>How we use your information</h2>
                    <p className={styles.pageText}>
                        We use the information we collect for the following purposes and only to the extent necessary:
                        To create and manage your Scriptio® account and to authenticate you. To provide cloud
                        synchronization between devices when you sign in. To enable collaboration features, but only
                        where you explicitly authorize sharing. To operate, maintain and improve Scriptio®, including
                        diagnosing and fixing errors and securing the service. To respond to your requests, support
                        inquiries and legal obligations. We do not sell your personal data to third parties under any
                        circumstances.
                    </p>
                </section>

                <section>
                    <h2 className={styles.pageSectionTitle}>Sharing and disclosure</h2>
                    <p className={styles.pageText}>
                        No sale of data. We do not sell, trade, or otherwise monetize user personal data. Project files
                        and screenplay content are never shared with other users unless the project owner explicitly
                        grants access. Project content is not transferred to external third parties for commercial or
                        marketing purposes. We may disclose information if required by law, governmental request, or to
                        protect the rights, property or safety of Scriptio®, our users, or others — only to the extent
                        required.
                    </p>
                </section>

                <section>
                    <h2 className={styles.pageSectionTitle}>Security</h2>
                    <p className={styles.pageText}>
                        We apply reasonable technical and organizational measures to protect your personal data and
                        project content from unauthorized access, alteration, disclosure or destruction. These measures
                        include industry-standard protections such as encrypted communications (TLS) for data in transit
                        and secure storage practices for data at rest. Passwords are stored using strong hashing
                        algorithms. In the unlikely event of a security breach affecting personal data, we will follow
                        applicable law and promptly notify affected users and authorities where required.
                    </p>
                </section>

                <section>
                    <h2 className={styles.pageSectionTitle}>Data retention</h2>
                    <p className={styles.pageText}>
                        We retain personal data for as long as necessary to provide Scriptio® services and as required
                        by law. In general: Account information is retained while your account is active and for a
                        limited period after account deletion to comply with legal obligations or to prevent fraud.
                        Project content stored in the cloud will be deleted upon request, subject to any backup or legal
                        hold obligations. Feel free to reach out to us through our contact form
                    </p>
                </section>

                <section>
                    <h2 className={styles.pageSectionTitle}>Your Rights</h2>
                    <p className={styles.pageText}>
                        Where applicable (for example under the GDPR), you have rights in relation to your personal
                        data, including the right to: Access the personal data we hold about you. Request correction of
                        inaccurate information. Request deletion of your personal data (subject to contractual or legal
                        retention obligations). Request portability of your personal data in a commonly used format.
                        Object to or restrict certain processing activities. Withdraw consent where processing is based
                        on consent.
                    </p>
                    <p className={styles.pageText}>
                        To exercise these rights or for account deletion/export requests, please contact us at:
                        contact@scriptio.app. We will respond within the timeframe required by applicable law.
                    </p>
                </section>

                <section>
                    <h2 className={styles.pageSectionTitle}>Changes to This Policy</h2>
                    <p className={styles.pageText}>
                        We may update this Privacy Policy from time to time to reflect changes in our practices or legal
                        requirements. We will post the revised policy within the application and on our website and
                        update the “Last updated” date. Significant changes will be communicated by appropriate means.
                    </p>
                </section>
            </div>
            <Footer />
        </div>
    );
}
