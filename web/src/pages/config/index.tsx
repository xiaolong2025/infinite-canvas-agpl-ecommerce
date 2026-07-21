import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs, Tag } from "antd";
import { KeyRound, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
    createAdminUser,
    deleteAdminChannel,
    fetchAdminChannels,
    fetchAdminUsers,
    saveAdminChannel,
    updateAdminUser,
    type AdminChannel,
    type SessionUser,
} from "@/services/app-api";
import { useAuthStore } from "@/stores/use-auth-store";
import type { ChannelModel, ModelCapability } from "@/stores/use-config-store";

type ChannelFormValues = {
    name: string;
    baseUrl: string;
    apiKey?: string;
    apiFormat: "openai" | "gemini";
    enabled: boolean;
    modelsText: string;
};

type UserFormValues = {
    username?: string;
    displayName: string;
    password?: string;
    role: "admin" | "user";
    dailyQuota: number;
};

export default function ConfigPage() {
    const { message, modal } = App.useApp();
    const refreshManagedModels = useAuthStore((state) => state.refreshManagedModels);
    const currentUser = useAuthStore((state) => state.user);
    const [channels, setChannels] = useState<AdminChannel[]>([]);
    const [users, setUsers] = useState<SessionUser[]>([]);
    const [loadingChannels, setLoadingChannels] = useState(true);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [channelOpen, setChannelOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<AdminChannel | null>(null);
    const [userOpen, setUserOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<SessionUser | null>(null);
    const [saving, setSaving] = useState(false);
    const [channelForm] = Form.useForm<ChannelFormValues>();
    const [userForm] = Form.useForm<UserFormValues>();

    const loadChannels = async () => {
        setLoadingChannels(true);
        try {
            setChannels((await fetchAdminChannels()).channels);
        } catch (error) {
            message.error(readError(error));
        } finally {
            setLoadingChannels(false);
        }
    };

    const loadUsers = async () => {
        setLoadingUsers(true);
        try {
            setUsers((await fetchAdminUsers()).users);
        } catch (error) {
            message.error(readError(error));
        } finally {
            setLoadingUsers(false);
        }
    };

    useEffect(() => {
        void Promise.all([loadChannels(), loadUsers()]);
    }, []);

    const openChannel = (channel?: AdminChannel) => {
        setEditingChannel(channel || null);
        channelForm.setFieldsValue({
            name: channel?.name || "",
            baseUrl: channel?.baseUrl || "https://api.yigeai.work",
            apiKey: "",
            apiFormat: channel?.apiFormat || "openai",
            enabled: channel?.enabled ?? true,
            modelsText: modelsToText(channel?.models || []),
        });
        setChannelOpen(true);
    };

    const submitChannel = async () => {
        const values = await channelForm.validateFields();
        setSaving(true);
        try {
            await saveAdminChannel({
                ...(editingChannel ? { id: editingChannel.id } : {}),
                name: values.name,
                baseUrl: values.baseUrl,
                apiKey: values.apiKey?.trim() || undefined,
                apiFormat: values.apiFormat,
                enabled: values.enabled,
                models: textToModels(values.modelsText),
            });
            setChannelOpen(false);
            await Promise.all([loadChannels(), refreshManagedModels()]);
            message.success(editingChannel ? "渠道已更新" : "渠道已创建");
        } catch (error) {
            message.error(readError(error));
        } finally {
            setSaving(false);
        }
    };

    const confirmDeleteChannel = (channel: AdminChannel) => {
        modal.confirm({
            title: `删除渠道“${channel.name}”？`,
            content: "删除后普通用户将无法继续使用该渠道中的模型。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            async onOk() {
                await deleteAdminChannel(channel.id);
                await Promise.all([loadChannels(), refreshManagedModels()]);
            },
        });
    };

    const openUser = (user?: SessionUser) => {
        setEditingUser(user || null);
        userForm.setFieldsValue({
            username: user?.username || "",
            displayName: user?.displayName || "",
            password: "",
            role: user?.role || "user",
            dailyQuota: user?.dailyQuota ?? 50,
        });
        setUserOpen(true);
    };

    const submitUser = async () => {
        const values = await userForm.validateFields();
        setSaving(true);
        try {
            if (editingUser) {
                await updateAdminUser(editingUser.id, {
                    displayName: values.displayName,
                    password: values.password?.trim() || undefined,
                    role: values.role,
                    dailyQuota: values.dailyQuota,
                });
            } else {
                await createAdminUser({
                    username: values.username || "",
                    displayName: values.displayName,
                    password: values.password || "",
                    role: values.role,
                    dailyQuota: values.dailyQuota,
                });
            }
            setUserOpen(false);
            await loadUsers();
            message.success(editingUser ? "用户已更新" : "用户已创建");
        } catch (error) {
            message.error(readError(error));
        } finally {
            setSaving(false);
        }
    };

    const channelColumns = useMemo(
        () => [
            {
                title: "渠道",
                dataIndex: "name",
                render: (_: unknown, channel: AdminChannel) => (
                    <div>
                        <div className="font-medium text-stone-900 dark:text-stone-100">{channel.name}</div>
                        <div className="mt-1 max-w-[420px] truncate text-xs text-stone-500">{channel.baseUrl}</div>
                    </div>
                ),
            },
            {
                title: "协议",
                dataIndex: "apiFormat",
                width: 110,
                render: (value: string) => <Tag>{value === "gemini" ? "Gemini" : "OpenAI"}</Tag>,
            },
            {
                title: "模型",
                dataIndex: "models",
                width: 100,
                render: (models: ChannelModel[]) => `${models.length} 个`,
            },
            {
                title: "密钥",
                dataIndex: "apiKeyPreview",
                width: 120,
                render: (value: string) => <span className="font-mono text-xs text-stone-500">{value}</span>,
            },
            {
                title: "状态",
                dataIndex: "enabled",
                width: 90,
                render: (enabled: boolean) => <Tag color={enabled ? "green" : "default"}>{enabled ? "启用" : "停用"}</Tag>,
            },
            {
                title: "操作",
                key: "actions",
                width: 150,
                render: (_: unknown, channel: AdminChannel) => (
                    <Space>
                        <Button type="link" onClick={() => openChannel(channel)}>
                            编辑
                        </Button>
                        <Button type="text" danger icon={<Trash2 className="size-4" />} aria-label="删除渠道" onClick={() => confirmDeleteChannel(channel)} />
                    </Space>
                ),
            },
        ],
        [channels],
    );

    const userColumns = useMemo(
        () => [
            {
                title: "用户",
                dataIndex: "displayName",
                render: (_: unknown, user: SessionUser) => (
                    <div>
                        <div className="font-medium text-stone-900 dark:text-stone-100">{user.displayName}</div>
                        <div className="mt-1 text-xs text-stone-500">@{user.username}</div>
                    </div>
                ),
            },
            {
                title: "权限",
                dataIndex: "role",
                width: 120,
                render: (role: SessionUser["role"]) => <Tag color={role === "admin" ? "blue" : "default"}>{role === "admin" ? "管理员" : "普通用户"}</Tag>,
            },
            {
                title: "每日额度",
                dataIndex: "dailyQuota",
                width: 120,
                render: (value: number) => (value === 0 ? "不限" : `${value} 次`),
            },
            {
                title: "可登录",
                dataIndex: "disabled",
                width: 100,
                render: (disabled: boolean, user: SessionUser) => (
                    <Switch
                        size="small"
                        checked={!disabled}
                        disabled={user.id === currentUser?.id}
                        onChange={async (checked) => {
                            await updateAdminUser(user.id, { disabled: !checked });
                            await loadUsers();
                        }}
                    />
                ),
            },
            {
                title: "操作",
                key: "actions",
                width: 100,
                render: (_: unknown, user: SessionUser) => (
                    <Button type="link" onClick={() => openUser(user)}>
                        编辑
                    </Button>
                ),
            },
        ],
        [currentUser?.id, users],
    );

    return (
        <main className="h-full overflow-y-auto bg-background">
            <div className="mx-auto max-w-7xl px-6 py-7">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-sm text-stone-500">
                            <ShieldCheck className="size-4" />
                            管理员控制台
                        </div>
                        <h1 className="text-2xl font-semibold text-stone-950 dark:text-stone-100">用户与模型服务</h1>
                        <p className="mt-2 text-sm text-stone-500">API Key 由服务器加密保存，普通用户只能使用已开放的模型。</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} onClick={() => void Promise.all([loadChannels(), loadUsers()])}>
                        刷新
                    </Button>
                </div>

                <Tabs
                    items={[
                        {
                            key: "channels",
                            label: "模型渠道",
                            children: (
                                <section>
                                    <div className="mb-4 flex items-center justify-between gap-4">
                                        <div className="text-sm text-stone-500">配置 Gemini、Kedaya、ZZ 等服务器统一渠道</div>
                                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openChannel()}>
                                            新增渠道
                                        </Button>
                                    </div>
                                    <Table rowKey="id" loading={loadingChannels} columns={channelColumns} dataSource={channels} pagination={false} scroll={{ x: 860 }} />
                                </section>
                            ),
                        },
                        {
                            key: "users",
                            label: "用户账号",
                            children: (
                                <section>
                                    <div className="mb-4 flex items-center justify-between gap-4">
                                        <div className="text-sm text-stone-500">当前采用管理员创建账号，不开放公开注册</div>
                                        <Button type="primary" icon={<UserPlus className="size-4" />} onClick={() => openUser()}>
                                            新增用户
                                        </Button>
                                    </div>
                                    <Table rowKey="id" loading={loadingUsers} columns={userColumns} dataSource={users} pagination={false} scroll={{ x: 720 }} />
                                </section>
                            ),
                        },
                    ]}
                />
            </div>

            <Modal open={channelOpen} title={editingChannel ? "编辑模型渠道" : "新增模型渠道"} width={720} onCancel={() => setChannelOpen(false)} onOk={() => void submitChannel()} confirmLoading={saving} okText="保存" cancelText="取消">
                <Form form={channelForm} layout="vertical" requiredMark={false}>
                    <div className="grid gap-x-4 md:grid-cols-2">
                        <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: "请输入渠道名称" }]}>
                            <Input placeholder="例如：Gemini 文本" />
                        </Form.Item>
                        <Form.Item name="apiFormat" label="接口协议" rules={[{ required: true }]}>
                            <Select options={[{ value: "openai", label: "OpenAI 兼容" }, { value: "gemini", label: "Gemini 原生" }]} />
                        </Form.Item>
                    </div>
                    <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, message: "请输入接口地址" }]}>
                        <Input placeholder="https://api.yigeai.work" />
                    </Form.Item>
                    <Form.Item
                        name="apiKey"
                        label={
                            <span className="inline-flex items-center gap-2">
                                <KeyRound className="size-4" />
                                API Key
                            </span>
                        }
                        extra={editingChannel ? `留空则继续使用当前密钥 ${editingChannel.apiKeyPreview}` : "密钥仅发送给服务器，不会返回浏览器。"}
                        rules={editingChannel ? [] : [{ required: true, message: "请输入 API Key" }]}
                    >
                        <Input.Password autoComplete="new-password" placeholder={editingChannel ? "留空表示不修改" : "输入渠道密钥"} />
                    </Form.Item>
                    <Form.Item
                        name="modelsText"
                        label="开放模型"
                        extra="每行一个：模型名 | 能力。能力可填 text、image、video、audio；需要接收参考图片的文本或生图模型，第三列填 image-ref。"
                        rules={[{ required: true, message: "至少配置一个模型" }]}
                    >
                        <Input.TextArea rows={7} placeholder={"gemini-2.5-flash | text\nkedaya-image | image | image-ref"} />
                    </Form.Item>
                    <Form.Item name="enabled" label="启用渠道" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal open={userOpen} title={editingUser ? "编辑用户" : "新增用户"} onCancel={() => setUserOpen(false)} onOk={() => void submitUser()} confirmLoading={saving} okText="保存" cancelText="取消">
                <Form form={userForm} layout="vertical" requiredMark={false}>
                    {!editingUser ? (
                        <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }, { min: 3, message: "用户名至少 3 个字符" }]}>
                            <Input autoComplete="off" />
                        </Form.Item>
                    ) : null}
                    <Form.Item name="displayName" label="显示名称" rules={[{ required: true, message: "请输入显示名称" }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="password" label={editingUser ? "重置密码" : "初始密码"} extra={editingUser ? "留空表示不修改密码" : "密码至少 10 个字符"} rules={editingUser ? [] : [{ required: true, min: 10, message: "密码至少 10 个字符" }]}>
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <div className="grid gap-x-4 md:grid-cols-2">
                        <Form.Item name="role" label="权限">
                            <Select options={[{ value: "user", label: "普通用户" }, { value: "admin", label: "管理员" }]} />
                        </Form.Item>
                        <Form.Item name="dailyQuota" label="每日调用额度" extra="0 表示不限">
                            <InputNumber min={0} max={100000} className="w-full" />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>
        </main>
    );
}

function textToModels(value: string): ChannelModel[] {
    const capabilities = new Set<ModelCapability>(["text", "image", "video", "audio"]);
    const seen = new Set<string>();
    return value
        .split(/\r?\n/)
        .map((line) => line.split("|").map((part) => part.trim()))
        .filter(([name]) => name && !seen.has(name) && Boolean(seen.add(name)))
        .map(([name, capability, flags]) => ({
            name,
            capability: capabilities.has(capability as ModelCapability) ? (capability as ModelCapability) : "text",
            ...(flags?.split(",").map((item) => item.trim()).includes("image-ref") ? { supportsImageReferences: true } : {}),
        }));
}

function modelsToText(models: ChannelModel[]) {
    return models.map((model) => `${model.name} | ${model.capability}${model.supportsImageReferences ? " | image-ref" : ""}`).join("\n");
}

function readError(error: unknown) {
    return error instanceof Error ? error.message : "请求失败";
}
