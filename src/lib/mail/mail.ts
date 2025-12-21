import nodemailer from "nodemailer";
import * as fs from "fs";
import { BASE_URL } from "../utils/constants";
var hogan = require("hogan.js");

const transporter = nodemailer.createTransport({
    pool: true,
    host: process.env.SMTP_HOST,
    port: 465,
    secure: true, // use TLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_SECRET,
    },
});

export const sendProjectInviteEmail = async (email: string, projectTitle: string, token: string) => {
    const link = `${BASE_URL}/api/projects/accept-invite?token=${token}`;
    const content = `You have been invited to join project ${projectTitle} as a collaborator. Click the button below to accept the invite.`;

    sendFormattedEmail(email, "Project invitation", "Project invitation", content, "Accept invitation", link);
};

export const sendRecoveryEmail = async (userId: number, email: string, recoverHash: string) => {
    const link = `${BASE_URL}/recovery?id=${userId}&code=${recoverHash}`;
    const content = `A request has been issued to update ${email} account password. Click the button below to change your password.`;

    sendFormattedEmail(email, "Change password", "Password change request", content, "Change password", link);
};

export const sendVerificationEmail = async (userId: number, email: string, emailHash: string) => {
    const link = `${BASE_URL}/api/verify?id=${userId}&token=${emailHash}`;
    const content = `Welcome ${email}! Click the button below to verify your email address after which you will be able to log in using your credentials.`;

    sendFormattedEmail(
        email,
        "Thank you for joining Scriptio",
        "Verify your account",
        content,
        "Verify your account",
        link
    );
};

const sendFormattedEmail = async (
    email: string,
    welcomeMessage: string,
    subject: string,
    bodyText: string,
    buttonText: string,
    link: string
) => {
    const template = fs.readFileSync("./src/lib/mail/template.html").toString();
    const compiled = hogan.compile(template);
    const rendered = compiled.render({
        bodyText,
        buttonText,
        welcomeMessage,
        link,
    });

    sendEmail(email, subject, rendered, bodyText);
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
