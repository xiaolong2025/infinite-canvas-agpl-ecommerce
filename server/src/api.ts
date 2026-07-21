import { AppDatabase } from "./database";
import { decryptSecret, hasEncryptionKey, hashSessionToken, randomToken } from "./security";
import type { ChannelInput, PublicUser, StoredChannel } from "./types";

const SESSION_COOKIE = "canvas_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function createApiHandler(database: AppDatabase) {
    return async function handleApi(request: Request, url: URL) {
        const pathname = url.pathname;
        if (pathname === "/api/health") {
            return json({ ok: true, setupRequired: database.setupRequired(), encryptionConfigured: hasEncryptionKey() });
        }
        if (pathname.startsWith("/api/ai/")) return proxyAiRequest(request, url, database);

        if (pathname === "/api/auth/login" && request.method === "POST") return login(request, database);
        if (pathname === "/api/auth/logout" && request.method === "POST") return logout(request, database);
        if (pathname === "/api/auth/me" && request.method === "GET") return withUser(request, database, (user) => json({ user }));
        if (pathname === "/api/auth/status" && request.method === "GET") return json({ setupRequired: database.setupRequired(), encryptionConfigured: hasEncryptionKey() });
        if (pathname === "/api/models" && request.method === "GET") {
            return withUser(request, database, () => json(publicModels(database.listChannels(true))));
        }
        if (pathname.startsWith("/api/admin/")) {
            return withUser(request, database, (user) => {
                if (user.role !== "admin") return json({ error: "需要管理员权限" }, 403);
                return handleAdmin(request, url, database, user);
            });
        }
        return json({ error: "Not found" }, 404);
    };
}

async function login(request: Request, database: AppDatabase) {
    const clientKey = request.headers.get("x-forwarded-for") || request.headers.get("user-agent") || "unknown";
    if (isRateLimited(clientKey)) return json({ error: "登录尝试过于频繁，请稍后再试" }, 429);
    const body = await readJson<{ username?: string; password?: string }>(request);
    const username = body.username?.trim() || "";
    const password = body.password || "";
    const user = await database.authenticate(username, password);
    if (!user) {
        recordFailedLogin(clientKey);
        return json({ error: "用户名或密码错误" }, 401);
    }
    loginAttempts.delete(clientKey);
    const token = randomToken();
    await database.createSession(await hashSessionToken(token), user.id, Date.now() + SESSION_TTL_MS);
    return json({ user }, 200, { "Set-Cookie": sessionCookie(token) });
}

async function logout(request: Request, database: AppDatabase) {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) database.deleteSession(await hashSessionToken(token));
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

async function handleAdmin(request: Request, url: URL, database: AppDatabase, actor: PublicUser) {
    if (!assertSameOrigin(request, url)) return json({ error: "跨站请求被拒绝" }, 403);
    if (url.pathname === "/api/admin/channels" && request.method === "GET") {
        return json({ channels: database.listChannels().map(adminChannel) });
    }
    if (url.pathname === "/api/admin/channels" && request.method === "POST") {
        if (!hasEncryptionKey()) return json({ error: "服务器未配置 APP_ENCRYPTION_KEY" }, 503);
        return saveChannel(request, database);
    }
    const channelMatch = url.pathname.match(/^\/api\/admin\/channels\/([^/]+)$/);
    if (channelMatch && request.method === "PUT") {
        if (!hasEncryptionKey()) return json({ error: "服务器未配置 APP_ENCRYPTION_KEY" }, 503);
        return saveChannel(request, database, decodeURIComponent(channelMatch[1]));
    }
    if (channelMatch && request.method === "DELETE") {
        const deleted = database.deleteChannel(decodeURIComponent(channelMatch[1]));
        return json({ deleted });
    }
    if (url.pathname === "/api/admin/users" && request.method === "GET") return json({ users: database.listUsers() });
    if (url.pathname === "/api/admin/users" && request.method === "POST") {
        const body = await readJson<{ username?: string; displayName?: string; password?: string; role?: "admin" | "user"; dailyQuota?: number }>(request);
        try {
            const user = await database.createUser({
                username: body.username || "",
                displayName: body.displayName || "",
                password: body.password || "",
                role: body.role === "admin" ? "admin" : "user",
                dailyQuota: body.dailyQuota ?? 50,
            });
            return json({ user }, 201);
        } catch (error) {
            return json({ error: errorMessage(error) }, 400);
        }
    }
    const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userMatch && request.method === "PATCH") {
        const body = await readJson<{ displayName?: string; password?: string; role?: "admin" | "user"; disabled?: boolean; dailyQuota?: number }>(request);
        const targetId = decodeURIComponent(userMatch[1]);
        if (targetId === actor.id && (body.disabled === true || body.role === "user")) return json({ error: "不能停用或降级当前登录的管理员" }, 400);
        try {
            const user = await database.updateUser(targetId, body);
            return user ? json({ user }) : json({ error: "用户不存在" }, 404);
        } catch (error) {
            return json({ error: errorMessage(error) }, 400);
        }
    }
    return json({ error: "Not found" }, 404);
}

async function saveChannel(request: Request, database: AppDatabase, id?: string) {
    const body = await readJson<ChannelInput>(request);
    try {
        const channel = await database.saveChannel({ ...body, ...(id ? { id } : {}) });
        return json({ channel: adminChannel(channel) }, id ? 200 : 201);
    } catch (error) {
        return json({ error: errorMessage(error) }, 400);
    }
}

async function proxyAiRequest(request: Request, url: URL, database: AppDatabase) {
    const userResult = await currentUser(request, database);
    if (!userResult) return json({ error: "请先登录" }, 401);
    if (!assertSameOrigin(request, url)) return json({ error: "跨站请求被拒绝" }, 403);
    const match = url.pathname.match(/^\/api\/ai\/([^/]+)(\/.*)?$/);
    if (!match) return json({ error: "AI 代理地址无效" }, 400);
    const channelId = decodeURIComponent(match[1]);
    const routePath = match[2] || "/";
    if (!allowedProxyPath(routePath, request.method)) return json({ error: "该 AI 接口未开放代理" }, 403);
    const channel = database.getChannel(channelId);
    if (!channel || !channel.enabled) return json({ error: "模型渠道不可用" }, 404);
    const model = await readRequestedModel(request, routePath);
    if (model && !channel.models.some((item) => item.name === model)) return json({ error: "该模型未被管理员开放" }, 403);
    const user = userResult;
    const billable = request.method !== "GET" && request.method !== "HEAD";
    if (billable && user.dailyQuota > 0 && database.dailyUsage(user.id) >= user.dailyQuota) {
        return json({ error: "今日调用额度已用完" }, 429);
    }
    const startedAt = Date.now();
    let upstreamStatus = 502;
    try {
        const apiKey = await decryptSecret(channel.encryptedApiKey);
        const target = buildUpstreamUrl(channel.baseUrl, routePath, url.searchParams);
        const headers = new Headers();
        for (const [key, value] of request.headers) {
            if (["authorization", "cookie", "host", "origin", "referer", "x-goog-api-key", "content-length"].includes(key.toLowerCase())) continue;
            headers.set(key, value);
        }
        if (channel.apiFormat === "gemini") headers.set("x-goog-api-key", apiKey);
        else headers.set("authorization", `Bearer ${apiKey}`);
        headers.delete("content-length");
        const response = await fetch(target, {
            method: request.method,
            headers,
            body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        });
        upstreamStatus = response.status;
        return proxyResponse(response);
    } catch (error) {
        return json({ error: errorMessage(error, "上游模型请求失败") }, 502);
    } finally {
        database.logUsage({
            userId: user.id,
            channelId,
            model: model || "",
            path: routePath,
            status: upstreamStatus,
            durationMs: Date.now() - startedAt,
            billable,
        });
    }
}

async function readRequestedModel(request: Request, routePath: string) {
    const geminiMatch = routePath.match(/\/models\/([^/:]+):/);
    if (geminiMatch) return decodeURIComponent(geminiMatch[1]);
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        try {
            const body = (await request.clone().json()) as { model?: unknown };
            return typeof body.model === "string" ? body.model.trim() : "";
        } catch {
            return "";
        }
    }
    if (contentType.includes("multipart/form-data")) {
        try {
            const body = await request.clone().formData();
            return String(body.get("model") || "").trim();
        } catch {
            return "";
        }
    }
    return "";
}

function allowedProxyPath(pathname: string, method: string) {
    if (pathname.includes("..") || pathname.includes("\\") || !["GET", "POST", "HEAD"].includes(method)) return false;
    return (
        /^\/v1\/(responses|chat\/completions|images\/generations|images\/edits|audio\/speech)$/.test(pathname) ||
        /^\/v1\/videos(?:\/[^/]+(?:\/content)?)?$/.test(pathname) ||
        /^\/v1\/contents\/generations\/tasks(?:\/[^/]+)?$/.test(pathname) ||
        /^\/v1beta\/models(?:\/[^/:]+(?::(?:generateContent|streamGenerateContent|predictLongRunning))?)?$/.test(pathname) ||
        /^\/v1beta\/(?:operations|models\/[^/]+\/operations)\/[^/]+$/.test(pathname)
    );
}

function buildUpstreamUrl(baseUrl: string, routePath: string, searchParams: URLSearchParams) {
    const base = new URL(baseUrl);
    const basePath = base.pathname.replace(/\/+$/, "");
    let path = routePath;
    if (basePath.endsWith("/v1") && path.startsWith("/v1/")) path = path.slice(3);
    if (basePath.endsWith("/v1beta") && path.startsWith("/v1beta/")) path = path.slice("/v1beta".length);
    base.pathname = `${basePath}${path}`.replace(/\/{2,}/g, "/");
    base.search = "";
    for (const [key, value] of searchParams) {
        if (key.toLowerCase() !== "key") base.searchParams.append(key, value);
    }
    return base.toString();
}

async function withUser(request: Request, database: AppDatabase, action: (user: PublicUser) => Promise<Response> | Response) {
    const user = await currentUser(request, database);
    return user ? action(user) : json({ error: "请先登录" }, 401);
}

async function currentUser(request: Request, database: AppDatabase) {
    const token = readCookie(request, SESSION_COOKIE);
    return token ? database.getSessionUser(await hashSessionToken(token)) : null;
}

function publicModels(channels: StoredChannel[]) {
    return {
        managed: true,
        channels: channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            baseUrl: `/api/ai/${encodeURIComponent(channel.id)}`,
            apiKey: "server-managed",
            apiFormat: channel.apiFormat,
            models: channel.models,
        })),
    };
}

function adminChannel(channel: StoredChannel) {
    return {
        id: channel.id,
        name: channel.name,
        baseUrl: channel.baseUrl,
        apiFormat: channel.apiFormat,
        models: channel.models,
        enabled: channel.enabled,
        apiKeyPreview: channel.apiKeyPreview,
        hasApiKey: Boolean(channel.encryptedApiKey),
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
    };
}

function assertSameOrigin(request: Request, url: URL) {
    const origin = request.headers.get("origin");
    if (!origin) return true;
    const allowed = (process.env.APP_ORIGIN || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (allowed.includes(origin)) return true;
    try {
        return new URL(origin).host === (request.headers.get("host") || url.host);
    } catch {
        return false;
    }
}

function readCookie(request: Request, name: string) {
    const cookies = request.headers.get("cookie") || "";
    return cookies
        .split(";")
        .map((item) => item.trim())
        .map((item) => item.split("="))
        .find(([key]) => key === name)?.slice(1).join("=") || "";
}

function sessionCookie(token: string) {
    const secure = process.env.APP_SECURE_COOKIES !== "false";
    return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function clearSessionCookie() {
    const secure = process.env.APP_SECURE_COOKIES !== "false";
    return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function isRateLimited(key: string) {
    const now = Date.now();
    const state = loginAttempts.get(key);
    if (!state || state.resetAt <= now) return false;
    return state.count >= 8;
}

function recordFailedLogin(key: string) {
    const now = Date.now();
    const current = loginAttempts.get(key);
    if (!current || current.resetAt <= now) loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    else current.count += 1;
}

async function readJson<T>(request: Request) {
    try {
        return (await request.json()) as T;
    } catch {
        throw new Error("请求 JSON 无效");
    }
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
    });
}

function proxyResponse(response: Response) {
    const headers = new Headers();
    for (const key of ["content-type", "content-length", "content-disposition", "cache-control", "location"]) {
        const value = response.headers.get(key);
        if (value) headers.set(key, value);
    }
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
}

function errorMessage(error: unknown, fallback = "请求失败") {
    return error instanceof Error ? error.message : fallback;
}
