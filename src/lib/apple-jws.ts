/**
 * Apple StoreKit 2 JWS verification.
 *
 * Apple signs all transaction and notification payloads as compact JWS (ES256).
 * The certificate chain is embedded in the `x5c` JOSE header; the root must
 * match Apple Root CA G3 before we trust the leaf key that verifies the
 * signature. Using `decodeJwt` alone (no verification) would allow anyone to
 * forge receipts with arbitrary expiry dates.
 */

import { compactVerify, importX509 } from "jose";
import { ForbiddenError } from "@src/lib/utils/api-utils";

export const APPLE_BUNDLE_IDS = ["app.scriptio", "app.scriptio.staging"];
export const APPLE_PRODUCT_ID = "app.scriptio.pro.monthly";

// Apple Root CA G3 — the trust anchor for all App Store JWS certificates.
// Source: https://www.apple.com/certificateauthority/ ("Apple Root CA - G3")
const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAxMS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLEx1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UEChMKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDExJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsTHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKEwpBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygnnkNkA0KiOmhDBlKAjnTNDCJ8SBRp2a
WUBZ8Z8z6LgEcNAMNJOJLj5Y+Mrt4L3FYFqaOzjkzL2B6G5CiEF5W1GpMpBW5RE
3bTqWR5IGFlS3v7VPqNjMGEwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6sWibyVGkB
MB8GA1UdIwQYMBaAFLuw3qFYM4iapIqZ3r6sWibyVGkBMA8GA1UdEwEB/wQFMAMB
Af8wDgYDVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY
2e3v9GwOAEZKuEi2ggmD6Ngi3AKU9G1vSqJwNHX7TLDL3TFWoA8CMHdpckGvN3C
XdHNMfQ6z5M+4+oMikUdSh6dE9nBaSaA3o04fhXMXN4Y1aMB77MONA==
-----END CERTIFICATE-----`;

/**
 * Verify an Apple StoreKit 2 JWS string and return its decoded payload.
 *
 * Validates the x5c certificate chain against Apple Root CA G3, then
 * verifies the JWS signature using the leaf certificate's public key.
 */
export async function verifyAppleJws<T = unknown>(jws: string): Promise<T> {
    const [headerB64] = jws.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString()) as {
        x5c?: string[];
    };

    if (!header.x5c || header.x5c.length < 2) {
        throw new ForbiddenError("Missing certificate chain in Apple JWS");
    }

    const leafCert = `-----BEGIN CERTIFICATE-----\n${header.x5c[0]}\n-----END CERTIFICATE-----`;
    const rootCert = `-----BEGIN CERTIFICATE-----\n${header.x5c[header.x5c.length - 1]}\n-----END CERTIFICATE-----`;

    if (rootCert.trim() !== APPLE_ROOT_CA_G3.trim()) {
        throw new ForbiddenError("Apple JWS root certificate does not match Apple Root CA G3");
    }

    const publicKey = await importX509(leafCert, "ES256");
    const { payload } = await compactVerify(jws, publicKey);
    return JSON.parse(new TextDecoder().decode(payload)) as T;
}
