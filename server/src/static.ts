import { basename, join, resolve } from "node:path";

export function createStaticHandler() {
    const root = resolve(process.env.STATIC_DIR || "../web/dist");
    return async function handleStatic(request: Request, url: URL) {
        if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });
        if (url.pathname === "/healthz") {
            return new Response("ok\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
        }
        if (url.pathname === "/config.js") {
            const payload = {
                ANALYTICS_GA4_ID: process.env.ANALYTICS_GA4_ID || "",
                ANALYTICS_BAIDU_ID: process.env.ANALYTICS_BAIDU_ID || "",
            };
            return new Response(`window.__RUNTIME_CONFIG__=${JSON.stringify(payload)};`, {
                headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" },
            });
        }
        const requested = url.pathname === "/" ? "/index.html" : url.pathname;
        const filePath = safePath(root, requested);
        const file = filePath ? Bun.file(filePath) : null;
        if (file && (await file.exists())) return fileResponse(file, url.pathname);
        if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
        const fallback = Bun.file(join(root, "index.html"));
        return (await fallback.exists()) ? fileResponse(fallback, "/index.html") : new Response("Build not found", { status: 503 });
    };
}

function safePath(root: string, pathname: string) {
    try {
        const decoded = decodeURIComponent(pathname);
        if (decoded.includes("\0") || decoded.split("/").includes("..")) return null;
        const candidate = resolve(root, `.${decoded}`);
        return candidate === root || candidate.startsWith(`${root}\\`) || candidate.startsWith(`${root}/`) ? candidate : null;
    } catch {
        return null;
    }
}

function fileResponse(file: ReturnType<typeof Bun.file>, pathname: string) {
    const headers = new Headers();
    if (pathname === "/index.html" || pathname === "/build-info.json") headers.set("Cache-Control", "no-store");
    else if (pathname.startsWith("/assets/")) headers.set("Cache-Control", "public, max-age=31536000, immutable");
    else if (basename(pathname) !== "config.js") headers.set("Cache-Control", "no-cache");
    return new Response(file, { headers });
}
