import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";

import { apiKeyPreview, encryptSecret, hashPassword, verifyPassword } from "./security";
import type { ChannelInput, ChannelModel, PublicUser, StoredChannel, UserRole } from "./types";

type UserRow = {
    id: string;
    username: string;
    display_name: string;
    password_hash: string;
    role: UserRole;
    disabled: number;
    daily_quota: number;
    created_at: number;
};

type ChannelRow = {
    id: string;
    name: string;
    base_url: string;
    api_format: "openai" | "gemini";
    models_json: string;
    enabled: number;
    encrypted_api_key: string;
    api_key_preview: string;
    created_at: number;
    updated_at: number;
};

export class AppDatabase {
    readonly db: Database;

    constructor(path = resolve(process.env.DATA_DIR || "./data", "canvas.sqlite")) {
        mkdirSync(dirname(path), { recursive: true });
        this.db = new Database(path, { create: true, strict: true });
        this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
        this.migrate();
    }

    async bootstrapAdmin() {
        const row = this.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM users").get();
        if ((row?.count || 0) > 0) return;
        const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
        const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
        if (!username || !password) {
            console.warn("No users exist. Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD before first use.");
            return;
        }
        await this.createUser({ username, displayName: "管理员", password, role: "admin", dailyQuota: 0 });
        console.info(`Bootstrap administrator created: ${username}`);
    }

    setupRequired() {
        const row = this.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM users").get();
        return (row?.count || 0) === 0;
    }

    async authenticate(username: string, password: string) {
        const row = this.db.query<UserRow, [string]>("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username.trim());
        if (!row || row.disabled || !(await verifyPassword(password, row.password_hash))) return null;
        return publicUser(row);
    }

    async createUser(input: { username: string; displayName: string; password: string; role: UserRole; dailyQuota: number }) {
        const username = validateUsername(input.username);
        validatePassword(input.password);
        const now = Date.now();
        const id = crypto.randomUUID();
        const passwordHash = await hashPassword(input.password);
        this.db
            .query(
                `INSERT INTO users (id, username, display_name, password_hash, role, disabled, daily_quota, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
            )
            .run(id, username, input.displayName.trim() || username, passwordHash, input.role, normalizeQuota(input.dailyQuota), now, now);
        return this.getUser(id)!;
    }

    listUsers() {
        return this.db.query<UserRow, []>("SELECT * FROM users ORDER BY created_at ASC").all().map(publicUser);
    }

    getUser(id: string) {
        const row = this.db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ?").get(id);
        return row ? publicUser(row) : null;
    }

    async updateUser(id: string, input: Partial<{ displayName: string; password: string; role: UserRole; disabled: boolean; dailyQuota: number }>) {
        const current = this.getUser(id);
        if (!current) return null;
        const displayName = input.displayName === undefined ? current.displayName : input.displayName.trim() || current.username;
        const role = input.role || current.role;
        const disabled = input.disabled === undefined ? current.disabled : input.disabled;
        const dailyQuota = input.dailyQuota === undefined ? current.dailyQuota : normalizeQuota(input.dailyQuota);
        this.db.query("UPDATE users SET display_name = ?, role = ?, disabled = ?, daily_quota = ?, updated_at = ? WHERE id = ?").run(displayName, role, disabled ? 1 : 0, dailyQuota, Date.now(), id);
        if (input.password) {
            validatePassword(input.password);
            this.db.query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(await hashPassword(input.password), Date.now(), id);
        }
        return this.getUser(id);
    }

    createSession(tokenHash: string, userId: string, expiresAt: number) {
        this.db.query("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(tokenHash, userId, expiresAt, Date.now());
    }

    deleteSession(tokenHash: string) {
        this.db.query("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    }

    getSessionUser(tokenHash: string) {
        this.db.query("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
        const row = this.db
            .query<UserRow, [string, number]>(
                `SELECT users.* FROM sessions
                 JOIN users ON users.id = sessions.user_id
                 WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
            )
            .get(tokenHash, Date.now());
        return row && !row.disabled ? publicUser(row) : null;
    }

    listChannels(enabledOnly = false) {
        const sql = enabledOnly ? "SELECT * FROM channels WHERE enabled = 1 ORDER BY created_at ASC" : "SELECT * FROM channels ORDER BY created_at ASC";
        return this.db.query<ChannelRow, []>(sql).all().map(storedChannel);
    }

    getChannel(id: string) {
        const row = this.db.query<ChannelRow, [string]>("SELECT * FROM channels WHERE id = ?").get(id);
        return row ? storedChannel(row) : null;
    }

    async saveChannel(input: ChannelInput) {
        const existing = input.id ? this.getChannel(input.id) : null;
        const apiKey = input.apiKey?.trim() || "";
        if (!existing && !apiKey) throw new Error("新增渠道必须填写 API Key");
        const now = Date.now();
        const id = existing?.id || crypto.randomUUID();
        const encryptedApiKey = apiKey ? await encryptSecret(apiKey) : existing!.encryptedApiKey;
        const preview = apiKey ? apiKeyPreview(apiKey) : existing!.apiKeyPreview;
        const models = normalizeModels(input.models);
        const values = [
            input.name.trim() || "未命名渠道",
            validateBaseUrl(input.baseUrl),
            input.apiFormat === "gemini" ? "gemini" : "openai",
            JSON.stringify(models),
            input.enabled === false ? 0 : 1,
            encryptedApiKey,
            preview,
            now,
            id,
        ] as const;
        if (existing) {
            this.db
                .query(
                    `UPDATE channels SET name = ?, base_url = ?, api_format = ?, models_json = ?, enabled = ?,
                     encrypted_api_key = ?, api_key_preview = ?, updated_at = ? WHERE id = ?`,
                )
                .run(...values);
        } else {
            this.db
                .query(
                    `INSERT INTO channels (name, base_url, api_format, models_json, enabled, encrypted_api_key,
                     api_key_preview, updated_at, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .run(...values, now);
        }
        return this.getChannel(id)!;
    }

    deleteChannel(id: string) {
        return this.db.query("DELETE FROM channels WHERE id = ?").run(id).changes > 0;
    }

    dailyUsage(userId: string) {
        const now = new Date();
        const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const row = this.db.query<{ count: number }, [string, number]>("SELECT COUNT(*) AS count FROM usage_logs WHERE user_id = ? AND billable = 1 AND created_at >= ?").get(userId, start);
        return row?.count || 0;
    }

    logUsage(input: { userId: string; channelId: string; model: string; path: string; status: number; durationMs: number; billable: boolean }) {
        this.db
            .query("INSERT INTO usage_logs (id, user_id, channel_id, model, path, status, duration_ms, billable, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .run(crypto.randomUUID(), input.userId, input.channelId, input.model, input.path, input.status, input.durationMs, input.billable ? 1 : 0, Date.now());
    }

    private migrate() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
                disabled INTEGER NOT NULL DEFAULT 0,
                daily_quota INTEGER NOT NULL DEFAULT 50,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
            CREATE TABLE IF NOT EXISTS channels (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                base_url TEXT NOT NULL,
                api_format TEXT NOT NULL CHECK(api_format IN ('openai', 'gemini')),
                models_json TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                encrypted_api_key TEXT NOT NULL,
                api_key_preview TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS usage_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                channel_id TEXT NOT NULL,
                model TEXT NOT NULL,
                path TEXT NOT NULL,
                status INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                billable INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS usage_user_created_idx ON usage_logs(user_id, created_at);
        `);
    }
}

function publicUser(row: UserRow): PublicUser {
    return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        disabled: Boolean(row.disabled),
        dailyQuota: row.daily_quota,
        createdAt: row.created_at,
    };
}

function storedChannel(row: ChannelRow): StoredChannel {
    return {
        id: row.id,
        name: row.name,
        baseUrl: row.base_url,
        apiFormat: row.api_format,
        models: normalizeModels(JSON.parse(row.models_json) as ChannelModel[]),
        enabled: Boolean(row.enabled),
        encryptedApiKey: row.encrypted_api_key,
        apiKeyPreview: row.api_key_preview,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function validateUsername(value: string) {
    const username = value.trim();
    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new Error("用户名只能包含字母、数字、点、下划线和短横线，长度 3-40");
    return username;
}

function validatePassword(value: string) {
    if (value.length < 10) throw new Error("密码至少需要 10 个字符");
}

function validateBaseUrl(value: string) {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
        throw new Error("生产渠道必须使用 HTTPS 地址");
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
}

function normalizeQuota(value: number) {
    if (!Number.isFinite(value)) return 50;
    return Math.max(0, Math.min(100000, Math.floor(value)));
}

function normalizeModels(models: ChannelModel[]) {
    const seen = new Set<string>();
    return (models || [])
        .map((model) => ({
            name: String(model.name || "").trim(),
            capability: ["image", "video", "text", "audio"].includes(model.capability) ? model.capability : "text",
            ...(model.script?.trim() ? { script: model.script.trim() } : {}),
            ...(typeof model.supportsImageReferences === "boolean" ? { supportsImageReferences: model.supportsImageReferences } : {}),
        }))
        .filter((model) => model.name && !seen.has(model.name) && Boolean(seen.add(model.name))) as ChannelModel[];
}
