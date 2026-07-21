import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createApiHandler } from "../src/api";
import { AppDatabase } from "../src/database";

const tempDir = mkdtempSync(join(tmpdir(), "canvas-api-test-"));
const databasePath = join(tempDir, "canvas.sqlite");
const encryptionKey = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
let database: AppDatabase;
let handle: ReturnType<typeof createApiHandler>;
let sessionCookie = "";

beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = encryptionKey;
    process.env.APP_SECURE_COOKIES = "false";
    process.env.NODE_ENV = "test";
    database = new AppDatabase(databasePath);
    await database.createUser({ username: "admin", displayName: "管理员", password: "admin-password-123", role: "admin", dailyQuota: 0 });
    handle = createApiHandler(database);
});

afterAll(() => {
    database.db.close();
    rmSync(tempDir, { recursive: true, force: true });
});

describe("authentication and managed configuration", () => {
    test("rejects unauthenticated model access", async () => {
        const response = await handle(new Request("http://localhost/api/models"), new URL("http://localhost/api/models"));
        expect(response.status).toBe(401);
    });

    test("logs in and returns safe model configuration", async () => {
        const response = await handle(
            new Request("http://localhost/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: "admin", password: "admin-password-123" }),
            }),
            new URL("http://localhost/api/auth/login"),
        );
        expect(response.status).toBe(200);
        sessionCookie = response.headers.get("set-cookie") || "";
        expect(sessionCookie).toContain("canvas_session=");

        const createChannel = await handle(
            new Request("http://localhost/api/admin/channels", {
                method: "POST",
                headers: { Cookie: sessionCookie, Origin: "http://localhost" },
                body: JSON.stringify({
                    name: "Gemini 文本",
                    baseUrl: "https://api.yigeai.work",
                    apiKey: "test-secret-key",
                    apiFormat: "gemini",
                    enabled: true,
                    models: [{ name: "gemini-test", capability: "text" }],
                }),
            }),
            new URL("http://localhost/api/admin/channels"),
        );
        expect(createChannel.status).toBe(201);

        const adminChannels = await handle(
            new Request("http://localhost/api/admin/channels", { headers: { Cookie: sessionCookie } }),
            new URL("http://localhost/api/admin/channels"),
        );
        const adminPayload = (await adminChannels.json()) as { channels: Array<Record<string, unknown>> };
        expect(adminChannels.status).toBe(200);
        expect(adminPayload.channels[0].encryptedApiKey).toBeUndefined();
        expect(adminPayload.channels[0].apiKey).toBeUndefined();
        expect(adminPayload.channels[0].apiKeyPreview).toBe("****-key");

        const models = await handle(new Request("http://localhost/api/models", { headers: { Cookie: sessionCookie } }), new URL("http://localhost/api/models"));
        const modelPayload = (await models.json()) as { channels: Array<{ baseUrl: string; apiKey: string }> };
        expect(modelPayload.channels[0].baseUrl).toContain("/api/ai/");
        expect(modelPayload.channels[0].apiKey).toBe("server-managed");
    });

    test("restricts proxy paths and requires an opened model", async () => {
        const response = await handle(
            new Request("http://localhost/api/ai/invalid/admin", { method: "POST", headers: { Cookie: sessionCookie } }),
            new URL("http://localhost/api/ai/invalid/admin"),
        );
        expect(response.status).toBe(403);

        const modelList = await handle(
            new Request("http://localhost/api/ai/invalid/v1/models", { headers: { Cookie: sessionCookie } }),
            new URL("http://localhost/api/ai/invalid/v1/models"),
        );
        expect(modelList.status).toBe(403);

        const crossSite = await handle(
            new Request("http://localhost/api/ai/invalid/v1/responses", {
                method: "POST",
                headers: { Cookie: sessionCookie, Origin: "https://attacker.example", "Content-Type": "application/json" },
                body: JSON.stringify({ model: "gemini-test", input: "hello" }),
            }),
            new URL("http://localhost/api/ai/invalid/v1/responses"),
        );
        expect(crossSite.status).toBe(403);
    });
});
