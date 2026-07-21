import { getDataUrlByteSize } from "@/lib/image-utils";
import type { AiTextMessage } from "@/services/api/image";

const TOTAL_IMAGE_BYTES_BUDGET = 560 * 1024;
const SINGLE_IMAGE_BYTES_BUDGET = 400 * 1024;
const MIN_IMAGE_BYTES_BUDGET = 48 * 1024;
const JPEG_QUALITIES = [0.82, 0.72, 0.62, 0.52];

export async function optimizeAiVisionMessages(messages: AiTextMessage[]): Promise<AiTextMessage[]> {
    const imageCount = messages.reduce((count, message) => count + (Array.isArray(message.content) ? message.content.filter((item) => item.type === "image_url").length : 0), 0);
    if (!imageCount || typeof document === "undefined" || typeof Image === "undefined") return messages;

    const targetBytes = Math.max(MIN_IMAGE_BYTES_BUDGET, Math.min(SINGLE_IMAGE_BYTES_BUDGET, Math.floor(TOTAL_IMAGE_BYTES_BUDGET / imageCount)));
    const maxEdge = imageCount >= 6 ? 640 : imageCount >= 2 ? 896 : 1280;

    return Promise.all(
        messages.map(async (message) => {
            if (!Array.isArray(message.content)) return message;
            const content = await Promise.all(
                message.content.map(async (item) => {
                    if (item.type !== "image_url") return item;
                    return {
                        ...item,
                        image_url: {
                            ...item.image_url,
                            url: await optimizeDataUrlForVision(item.image_url.url, targetBytes, maxEdge),
                        },
                    };
                }),
            );
            return { ...message, content };
        }),
    );
}

async function optimizeDataUrlForVision(dataUrl: string, targetBytes: number, maxEdge: number) {
    if (!dataUrl.startsWith("data:image/") || getDataUrlByteSize(dataUrl) <= targetBytes) return dataUrl;

    const image = await loadImage(dataUrl);
    const sourceWidth = Math.max(1, image.naturalWidth || image.width);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height);
    const initialScale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    let width = Math.max(1, Math.round(sourceWidth * initialScale));
    let height = Math.max(1, Math.round(sourceHeight * initialScale));
    let smallest = dataUrl;

    for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return smallest;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        for (const quality of JPEG_QUALITIES) {
            const candidate = canvas.toDataURL("image/jpeg", quality);
            if (getDataUrlByteSize(candidate) < getDataUrlByteSize(smallest)) smallest = candidate;
            if (getDataUrlByteSize(candidate) <= targetBytes) return candidate;
        }

        const currentBytes = Math.max(1, getDataUrlByteSize(smallest));
        const reduction = Math.min(0.82, Math.sqrt(targetBytes / currentBytes) * 0.9);
        const minimumScale = Math.min(1, 256 / Math.max(width, height));
        const nextScale = Math.max(minimumScale, reduction);
        const nextWidth = Math.max(1, Math.round(width * nextScale));
        const nextHeight = Math.max(1, Math.round(height * nextScale));
        if (nextWidth === width && nextHeight === height) break;
        width = nextWidth;
        height = nextHeight;
    }

    return smallest;
}

function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("参考图片无法读取，请重新上传后再试"));
        image.src = dataUrl;
    });
}
