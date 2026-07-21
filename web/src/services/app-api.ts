import type { ModelChannel } from "@/stores/use-config-store";

export type SessionUser = {
    id: string;
    username: string;
    displayName: string;
    role: "admin" | "user";
    disabled: boolean;
    dailyQuota: number;
    createdAt: number;
};

export type AdminChannel = Omit<ModelChannel, "apiKey"> & {
    enabled: boolean;
    apiKeyPreview: string;
    hasApiKey: boolean;
    createdAt: number;
    updatedAt: number;
};

export async function fetchSession() {
    return apiRequest<{ user: SessionUser }>("/api/auth/me");
}

export async function login(username: string, password: string) {
    return apiRequest<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
}

export async function logout() {
    return apiRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export async function fetchManagedModels() {
    return apiRequest<{ managed: true; channels: ModelChannel[] }>("/api/models");
}

export async function fetchAdminChannels() {
    return apiRequest<{ channels: AdminChannel[] }>("/api/admin/channels");
}

export async function saveAdminChannel(channel: Partial<AdminChannel> & { name: string; baseUrl: string; apiKey?: string; apiFormat: "openai" | "gemini"; models: ModelChannel["models"]; enabled: boolean }) {
    const path = channel.id ? `/api/admin/channels/${encodeURIComponent(channel.id)}` : "/api/admin/channels";
    return apiRequest<{ channel: AdminChannel }>(path, {
        method: channel.id ? "PUT" : "POST",
        body: JSON.stringify(channel),
    });
}

export async function deleteAdminChannel(id: string) {
    return apiRequest<{ deleted: boolean }>(`/api/admin/channels/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchAdminUsers() {
    return apiRequest<{ users: SessionUser[] }>("/api/admin/users");
}

export async function createAdminUser(input: { username: string; displayName: string; password: string; role: "admin" | "user"; dailyQuota: number }) {
    return apiRequest<{ user: SessionUser }>("/api/admin/users", { method: "POST", body: JSON.stringify(input) });
}

export async function updateAdminUser(id: string, input: Partial<{ displayName: string; password: string; role: "admin" | "user"; disabled: boolean; dailyQuota: number }>) {
    return apiRequest<{ user: SessionUser }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

async function apiRequest<T>(path: string, init?: RequestInit) {
    const response = await fetch(path, {
        ...init,
        credentials: "same-origin",
        headers: {
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...init?.headers,
        },
    });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || `请求失败（HTTP ${response.status}）`);
    return payload;
}
