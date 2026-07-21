import { FileText, ImagePlus, Images, Maximize2, Settings2, Video } from "lucide-react";

export type NavigationTool = {
    slug: "canvas" | "image" | "video" | "prompts" | "assets" | "config";
    label: string;
    icon: typeof Maximize2;
    adminOnly?: boolean;
};

export const navigationTools: NavigationTool[] = [
    {
        slug: "canvas",
        label: "我的画布",
        icon: Maximize2,
    },
    {
        slug: "image",
        label: "生图工作台",
        icon: ImagePlus,
    },
    {
        slug: "video",
        label: "视频创作台",
        icon: Video,
    },
    {
        slug: "prompts",
        label: "提示词库",
        icon: FileText,
    },
    {
        slug: "assets",
        label: "我的资产",
        icon: Images,
    },
    {
        slug: "config",
        label: "管理",
        icon: Settings2,
        adminOnly: true,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];

export function visibleNavigationTools(role?: "admin" | "user") {
    return navigationTools.filter((tool) => !tool.adminOnly || role === "admin");
}
