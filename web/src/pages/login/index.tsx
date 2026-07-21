import { App, Button, Form, Input } from "antd";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "@/stores/use-auth-store";

type LoginValues = { username: string; password: string };

export default function LoginPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const status = useAuthStore((state) => state.status);
    const initialize = useAuthStore((state) => state.initialize);
    const login = useAuthStore((state) => state.login);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        void initialize();
    }, [initialize]);

    useEffect(() => {
        if (status === "authenticated") navigate("/", { replace: true });
    }, [navigate, status]);

    const submit = async (values: LoginValues) => {
        setSubmitting(true);
        try {
            await login(values.username, values.password);
            const target = (location.state as { from?: string } | null)?.from || "/";
            navigate(target, { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-stone-950 px-5 py-10 text-stone-100">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:32px_32px]" />
            <div className="relative w-full max-w-[420px] border border-stone-800 bg-stone-950/95 p-7 shadow-2xl shadow-black/30 sm:p-9">
                <div className="mb-9">
                    <div className="mb-5 flex size-11 items-center justify-center border border-stone-700 bg-stone-900">
                        <span
                            className="size-6 bg-stone-100"
                            style={{
                                mask: "url(/logo.svg) center / contain no-repeat",
                                WebkitMask: "url(/logo.svg) center / contain no-repeat",
                            }}
                        />
                    </div>
                    <h1 className="text-3xl font-semibold text-white">一格画布</h1>
                    <p className="mt-2 text-sm leading-6 text-stone-400">登录后进入你的 AI 创作工作台</p>
                </div>

                <Form<LoginValues> layout="vertical" requiredMark={false} onFinish={(values) => void submit(values)}>
                    <Form.Item name="username" label={<span className="text-stone-300">用户名</span>} rules={[{ required: true, message: "请输入用户名" }]}>
                        <Input size="large" autoComplete="username" prefix={<UserRound className="size-4 text-stone-500" />} placeholder="用户名" />
                    </Form.Item>
                    <Form.Item name="password" label={<span className="text-stone-300">密码</span>} rules={[{ required: true, message: "请输入密码" }]}>
                        <Input.Password size="large" autoComplete="current-password" prefix={<LockKeyhole className="size-4 text-stone-500" />} placeholder="密码" />
                    </Form.Item>
                    <Button className="mt-2" type="primary" htmlType="submit" size="large" block loading={submitting} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                        登录
                    </Button>
                </Form>
            </div>
        </main>
    );
}
