import type { CSSProperties } from "react";
import { BookOpen, Keyboard, LogOut, Puzzle, Settings2, UserRound } from "lucide-react";
import { Dropdown } from "antd";
import { useNavigate } from "react-router-dom";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { GitHubLink } from "@/components/layout/github-link";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { DOCS_URL } from "@/constant/env";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useAuthStore } from "@/stores/use-auth-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    onOpenPlugins?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, onOpenPlugins }: UserStatusActionsProps) {
    const navigate = useNavigate();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const managed = useConfigStore((state) => state.managed);
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const versionStyle = iconStyle;
    const gitHubClassName = "size-7 text-base";
    const gitHubStyle = iconStyle;

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {onOpenPlugins ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenPlugins} aria-label="节点插件" title="节点插件">
                    <Puzzle className="size-4" />
                </button>
            ) : null}
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label="文档" title="文档">
                <BookOpen className="size-4" />
            </a>
            {showConfig && user?.role === "admin" ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => navigate("/config")} aria-label="管理" title="管理">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
            <VersionReleaseModal style={versionStyle} />
            <GitHubLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", gitHubClassName)} style={gitHubStyle} />
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            {managed && user ? (
                <Dropdown
                    trigger={["click"]}
                    menu={{
                        items: [
                            { key: "identity", label: <span className="text-xs text-stone-500">@{user.username}</span>, disabled: true },
                            {
                                key: "logout",
                                icon: <LogOut className="size-4" />,
                                label: "退出登录",
                                onClick: () => void logout().then(() => navigate("/login", { replace: true })),
                            },
                        ],
                    }}
                >
                    <button type="button" className={naturalIconClass} style={iconStyle} aria-label="用户菜单" title={user.displayName}>
                        <UserRound className="size-4" />
                    </button>
                </Dropdown>
            ) : null}
        </div>
    );
}
