import { createApiHandler } from "./api";
import { AppDatabase } from "./database";
import { createStaticHandler } from "./static";
import { decryptSecret, hasEncryptionKey } from "./security";

const database = new AppDatabase();
await database.bootstrapAdmin();
const api = createApiHandler(database);
const staticHandler = createStaticHandler();
const port = Number(process.env.PORT || 3000);

const server = Bun.serve({
    port,
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/healthz") {
            const ready = await healthReady();
            return new Response(ready ? "ok\n" : "not ready\n", {
                status: ready ? 200 : 503,
                headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
            });
        }
        try {
            if (url.pathname.startsWith("/api/")) return await api(request, url);
            return await staticHandler(request, url);
        } catch (error) {
            console.error(error);
            return new Response(JSON.stringify({ error: "服务器请求处理失败" }), {
                status: 500,
                headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
            });
        }
    },
});

console.info(`Canvas server listening on ${server.url}`);

async function healthReady() {
    if (database.setupRequired() || !hasEncryptionKey()) return false;
    try {
        await Promise.all(database.listChannels().map((channel) => decryptSecret(channel.encryptedApiKey)));
        return true;
    } catch {
        return false;
    }
}
