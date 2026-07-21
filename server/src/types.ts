export type UserRole = "admin" | "user";
export type ApiFormat = "openai" | "gemini";
export type ModelCapability = "image" | "video" | "text" | "audio";

export type ChannelModel = {
    name: string;
    capability: ModelCapability;
    script?: string;
    supportsImageReferences?: boolean;
};

export type PublicUser = {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
    disabled: boolean;
    dailyQuota: number;
    createdAt: number;
};

export type StoredChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiFormat: ApiFormat;
    models: ChannelModel[];
    enabled: boolean;
    encryptedApiKey: string;
    apiKeyPreview: string;
    createdAt: number;
    updatedAt: number;
};

export type ChannelInput = {
    id?: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    apiFormat: ApiFormat;
    models: ChannelModel[];
    enabled?: boolean;
};
