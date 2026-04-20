import nodemailer from "nodemailer";
import * as fs from "fs";
import { BASE_URL } from "../utils/constants";
import hogan from "hogan.js";

const transporter = nodemailer.createTransport({
    pool: true,
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_SECRET,
    },
});

export const sendProjectInviteEmail = async (email: string, projectTitle: string, token: string) => {
    const link = `${BASE_URL}/api/projects/accept-invite?token=${token}`;
    const content = `You have been invited to join project '${projectTitle}' as a collaborator. Click the button below to accept the invite.`;

    sendFormattedEmail(email, "Project Invitation", "Project Invitation", content, "Join project", link);
};

export const sendMagicLinkEmail = async (email: string, token: string) => {
    const link = `${BASE_URL}/auth/magic-link?token=${token}`;
    const content = `Click the button below to sign in to your Scriptio account. This link will expire in 10 minutes and can only be used once. If you didn't request this, you can safely ignore this email.`;

    sendFormattedEmail(email, "Sign in to Scriptio", "Your sign-in link", content, "Sign in", link);
};

const sendFormattedEmail = async (
    email: string,
    welcomeMessage: string,
    subject: string,
    bodyText: string,
    buttonText: string,
    link: string,
) => {
    const template = fs.readFileSync("./src/lib/mail/template.html").toString();
    const signature = fs.readFileSync("./src/lib/mail/signature.html").toString();
    const compiled = hogan.compile(template);
    const rendered = compiled.render({
        bodyText,
        buttonText,
        welcomeMessage,
        link,
        signature,
    });

    sendEmail(email, subject, rendered, bodyText);
};

export const sendContactEmail = async (email: string, reason: string, message: string) => {
    const html = `
        <h2>New Contact Form Submission</h2>
        <p><strong>From:</strong> ${email}</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br>")}</p>
    `;
    const text = `From: ${email}\nReason: ${reason}\nMessage:\n${message}`;
    transporter.sendMail({
        from: "Scriptio Form <no-reply@scriptio.app>",
        replyTo: email,
        to: "contact@scriptio.app",
        subject: `[Contact] ${reason}`,
        html,
        text,
    });
};

const sendEmail = async (to: string, subject: string, html: string, text: string) => {
    transporter.sendMail({
        from: "Scriptio <no-reply@scriptio.app>",
        to,
        subject,
        html: html,
        text: text,
    });
};
