import { create } from "zustand";

import { fetchManagedModels, fetchSession, login as loginRequest, logout as logoutRequest, type SessionUser } from "@/services/app-api";
import { useConfigStore } from "@/stores/use-config-store";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthStore = {
    status: AuthStatus;
    user: SessionUser | null;
    modelLoadError: string;
    initialize: () => Promise<void>;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshManagedModels: () => Promise<void>;
};

let initializePromise: Promise<void> | null = null;

export const useAuthStore = create<AuthStore>()((set, get) => ({
    status: "loading",
    user: null,
    modelLoadError: "",
    initialize: async () => {
        if (initializePromise) return initializePromise;
        initializePromise = (async () => {
            try {
                const { user } = await fetchSession();
                set({ user, status: "loading" });
                await get().refreshManagedModels();
                set({ status: "authenticated" });
            } catch {
                useConfigStore.getState().clearManagedConfig();
                set({ user: null, status: "anonymous", modelLoadError: "" });
            }
        })();
        return initializePromise;
    },
    login: async (username, password) => {
        const { user } = await loginRequest(username, password);
        set({ user, status: "loading", modelLoadError: "" });
        await get().refreshManagedModels();
        set({ status: "authenticated" });
    },
    logout: async () => {
        try {
            await logoutRequest();
        } finally {
            initializePromise = null;
            useConfigStore.getState().clearManagedConfig();
            set({ user: null, status: "anonymous", modelLoadError: "" });
        }
    },
    refreshManagedModels: async () => {
        try {
            const { channels } = await fetchManagedModels();
            useConfigStore.getState().applyManagedChannels(channels);
            set({ modelLoadError: "" });
        } catch (error) {
            useConfigStore.getState().applyManagedChannels([]);
            set({ modelLoadError: error instanceof Error ? error.message : "模型配置加载失败" });
        }
    },
}));
