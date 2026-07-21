import { Buffer } from "node:buffer";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function hashPassword(password: string) {
    return Bun.password.hash(password, { algorithm: "argon2id", memoryCost: 65536, timeCost: 3 });
}

export async function verifyPassword(password: string, hash: string) {
    return Bun.password.verify(password, hash);
}

export function randomToken(bytes = 32) {
    const value = crypto.getRandomValues(new Uint8Array(bytes));
    return Buffer.from(value).toString("base64url");
}

export async function hashSessionToken(token: string) {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
    return Buffer.from(digest).toString("hex");
}

export function apiKeyPreview(apiKey: string) {
    const value = apiKey.trim();
    return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

export async function encryptSecret(value: string) {
    const key = await importEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
    return `v1:${Buffer.from(iv).toString("base64")}:${Buffer.from(encrypted).toString("base64")}`;
}

export async function decryptSecret(value: string) {
    const [version, ivValue, encryptedValue] = value.split(":");
    if (version !== "v1" || !ivValue || !encryptedValue) throw new Error("API Key encrypted value is invalid");
    const key = await importEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: Buffer.from(ivValue, "base64") },
        key,
        Buffer.from(encryptedValue, "base64"),
    );
    return decoder.decode(decrypted);
}

export function hasEncryptionKey() {
    try {
        readEncryptionKey();
        return true;
    } catch {
        return false;
    }
}

async function importEncryptionKey() {
    return crypto.subtle.importKey("raw", readEncryptionKey(), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function readEncryptionKey() {
    const value = process.env.APP_ENCRYPTION_KEY?.trim();
    if (!value) throw new Error("APP_ENCRYPTION_KEY is required");
    const bytes = Buffer.from(value, "base64");
    if (bytes.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes");
    return bytes;
}
