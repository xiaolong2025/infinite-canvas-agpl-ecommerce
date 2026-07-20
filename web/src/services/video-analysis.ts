import type { AiTextMessage } from "@/services/api/image";
import { getMediaBlob } from "@/services/file-storage";
import type { ReferenceVideo } from "@/types/media";

export type ExtractedVideoFrame = {
    timestampMs: number;
    dataUrl: string;
};

export async function extractVideoFrames(source: ReferenceVideo, frameCount = 8, signal?: AbortSignal): Promise<ExtractedVideoFrame[]> {
    const blob = await readVideoBlob(source, signal);
    const objectUrl = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    try {
        await waitForMetadata(video, signal);
        const durationMs = Math.max(1, Math.round((Number.isFinite(video.duration) ? video.duration * 1000 : source.durationMs) || 1));
        const count = Math.max(1, Math.min(frameCount, Math.ceil(durationMs / 750)));
        const frames: ExtractedVideoFrame[] = [];

        for (let index = 0; index < count; index += 1) {
            assertNotAborted(signal);
            const timestampMs = Math.round(((index + 0.5) / count) * Math.max(1, durationMs - 20));
            await seekVideo(video, timestampMs / 1000, signal);
            frames.push({ timestampMs, dataUrl: captureFrame(video) });
        }

        return frames;
    } finally {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(objectUrl);
    }
}

export function buildReferenceVideoAnalysisMessages(source: ReferenceVideo, frames: ExtractedVideoFrame[], instruction: string): AiTextMessage[] {
    const frameContent = frames.flatMap((frame) => [
        { type: "text" as const, text: `\n关键帧时间：${formatTimestamp(frame.timestampMs)}` },
        { type: "image_url" as const, image_url: { url: frame.dataUrl } },
    ]);
    const userInstruction = instruction.trim() || "面向东南亚服装类目，拆解这条视频并给出可用于制作新产品广告素材的复刻方案。";

    return [
        {
            role: "system",
            content: `你是跨境电商短视频拆解师。根据按时间顺序提供的关键帧，输出可执行的参考视频分析。

要求：
1. 不复制原视频中的人物身份、品牌、Logo、专有文案或受保护素材。
2. 区分“应保留的结构”和“必须替换的内容”。
3. 没有音频或字幕证据时明确写“未确认”，不要编造逐字台词。
4. 输出中文 Markdown，必须包含以下部分：
   - 基础信息
   - 镜头结构表：时间、镜头目的、景别/机位、人物动作、产品展示、字幕/声音证据
   - 文案结构：钩子、卖点、场景、信任表达、CTA
   - 复刻策略：保留、替换、避免
   - 可复用结构蓝图：按时间说明每一段在新视频中承担什么功能
   - 待产品资料补充项：列出生成新剧本前必须确认的事实
5. 当前步骤只分析参考视频，不生成新产品脚本，不假设新产品卖点。
6. 结论必须能交给后续“产品资料 → 新剧本 → 分镜 → 角色基准 → 完整故事板”流程。`,
        },
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: `参考视频：${source.name}
时长：${formatTimestamp(source.durationMs || frames.at(-1)?.timestampMs || 0)}
尺寸：${source.width && source.height ? `${source.width} × ${source.height}` : "未确认"}
补充要求：${userInstruction}

以下关键帧按时间顺序排列：`,
                },
                ...frameContent,
            ],
        },
    ];
}

async function readVideoBlob(source: ReferenceVideo, signal?: AbortSignal) {
    assertNotAborted(signal);
    if (source.storageKey) {
        const stored = await getMediaBlob(source.storageKey);
        if (stored) return stored;
    }
    if (!source.url) throw new Error("当前视频没有可读取的本地文件");
    const response = await fetch(source.url, { signal });
    if (!response.ok) throw new Error(`读取参考视频失败（${response.status}）`);
    return response.blob();
}

function waitForMetadata(video: HTMLVideoElement, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            video.onloadedmetadata = null;
            video.onerror = null;
            signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
            cleanup();
            reject(new DOMException("Aborted", "AbortError"));
        };
        video.onloadedmetadata = () => {
            cleanup();
            resolve();
        };
        video.onerror = () => {
            cleanup();
            reject(new Error("无法读取参考视频，请重新上传可播放的视频文件"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            video.onseeked = null;
            video.onerror = null;
            signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
            cleanup();
            reject(new DOMException("Aborted", "AbortError"));
        };
        video.onseeked = () => {
            cleanup();
            resolve();
        };
        video.onerror = () => {
            cleanup();
            reject(new Error("读取视频关键帧失败"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.01));
    });
}

function captureFrame(video: HTMLVideoElement) {
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;
    const scale = Math.min(1, 768 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建视频关键帧");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
}

function formatTimestamp(milliseconds: number) {
    const totalSeconds = Math.max(0, milliseconds) / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function assertNotAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}
