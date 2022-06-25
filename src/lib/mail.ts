import nodemailer from "nodemailer";
import { getSecretsFromId } from "../server/service/user-service";

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

export const sendVerificationEmail = async (
    userId: number,
    email: string,
    emailHash: string
) => {
    const link = `https://scriptio.app/api/verify?id=${userId}?code=${emailHash}`;

    sendEmail(
        email,
        "Verify your account",
        `Click here to verify your account: ${link}.`
    );
};

export const sendEmail = async (
    to: string,
    subject: string,
    content: string
) => {
    transporter.sendMail({
        from: "'Scriptio' <contact@scriptio.app>",
        to,
        subject,
        html: content,
    });
};
