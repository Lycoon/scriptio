import nodemailer from "nodemailer";
import * as fs from "fs";
var hogan = require("hogan.js");

const transporter = nodemailer.createTransport({
    pool: true,
    host: "email-smtp.eu-west-3.amazonaws.com",
    port: 465,
    secure: true, // use TLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_SECRET,
    },
});

export const sendRecoveryEmail = async (
    userId: number,
    email: string,
    recoverHash: string
) => {
    const link = `https://scriptio.app/recovery?id=${userId}&code=${recoverHash}`;
    const content = `A request has been issued to update ${email} account password. Click the button below to change your password.`;

    sendFormattedEmail(
        email,
        "Change password",
        "Password change request",
        content,
        "Change password",
        link
    );
};

export const sendVerificationEmail = async (
    userId: number,
    email: string,
    emailHash: string
) => {
    const link = `https://scriptio.app/api/verify?id=${userId}&code=${emailHash}`;
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
    content: string,
    buttonContent: string,
    link: string
) => {
    const template = fs.readFileSync("./src/lib/mail/template.html").toString();
    const compiled = hogan.compile(template);
    const rendered = compiled.render({
        content,
        buttonContent,
        welcomeMessage,
        link,
    });

    sendEmail(email, subject, rendered);
};

const sendEmail = async (to: string, subject: string, content: string) => {
    transporter.sendMail({
        from: "Scriptio <no-reply@scriptio.app>",
        to,
        subject,
        html: content,
    });
};
