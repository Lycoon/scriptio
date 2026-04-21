import { SignJWT } from "jose";
import { createPrivateKey, KeyObject } from "crypto";

interface AppleAuthConfig {
    teamId: string;
    clientId: string;
    keyId: string;
    privateKey: string;
    expiresIn?: number; // Optional: defaults to 6 months
}

/**
 * Generates an Apple Client Secret JWT with type safety.
 */
export async function generateAppleJWT({
    teamId,
    clientId,
    keyId,
    privateKey,
    expiresIn = 86400 * 180,
}: AppleAuthConfig): Promise<string> {
    const expirationTime = Math.ceil(Date.now() / 1000) + expiresIn;

    // Ensure the private key handles escaped newlines from .env files
    const formattedKey: KeyObject = createPrivateKey(privateKey.replace(/\\n/g, "\n"));

    return new SignJWT({})
        .setAudience("https://appleid.apple.com")
        .setIssuer(teamId)
        .setIssuedAt()
        .setExpirationTime(expirationTime)
        .setSubject(clientId)
        .setProtectedHeader({ alg: "ES256", kid: keyId })
        .sign(formattedKey);
}

// --- CLI Execution Logic ---
// In TS, we check if this file is the entry point differently depending on your runner
if (require.main === module || process.argv[1]?.includes("generate-apple-jwt")) {
    const config: AppleAuthConfig = {
        teamId: process.env.AUTH_APPLE_TEAM_ID!,
        clientId: process.env.AUTH_APPLE_CLIENT_ID!,
        keyId: process.env.AUTH_APPLE_KEY_ID!,
        privateKey: process.env.AUTH_APPLE_PRIVATE_KEY!,
    };

    const missing = Object.entries(config).filter(([, v]) => !v);

    if (missing.length > 0) {
        console.error(`❌ Missing env vars: ${missing.map((m) => m[0]).join(", ")}`);
        process.exit(1);
    }

    generateAppleJWT(config)
        .then((token) => console.log(`\n✅ Apple JWT:\n\n${token}\n`))
        .catch((err) => console.error("❌ Error:", err));
}
