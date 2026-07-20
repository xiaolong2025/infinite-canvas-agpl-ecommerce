export const STORYBOARD_IMAGE_REQUEST_TIMEOUT_MS = 180_000;
export const STORYBOARD_IMAGE_RETRY_DELAYS_MS = [15_000, 30_000] as const;
export const STORYBOARD_IMAGE_MIN_INTERVAL_MS = 30_000;

export type StoryboardImageRequestQueuePhase = "queued" | "generating" | "retrying";

export type StoryboardImageRequestQueueEvent = {
    phase: StoryboardImageRequestQueuePhase;
    attempt: number;
    retryDelayMs?: number;
};

type StoryboardImageRequestQueueOptions = {
    sleep?: (durationMs: number, signal?: AbortSignal) => Promise<void>;
    setTimer?: (callback: () => void, durationMs: number) => number;
    clearTimer?: (timer: number) => void;
    minIntervalMs?: number;
};

export class StoryboardImageRequestQueue {
    private tail: Promise<void> = Promise.resolve();
    private readonly sleep: (durationMs: number, signal?: AbortSignal) => Promise<void>;
    private readonly setTimer: (callback: () => void, durationMs: number) => number;
    private readonly clearTimer: (timer: number) => void;
    private readonly minIntervalMs: number;

    constructor(options: StoryboardImageRequestQueueOptions = {}) {
        this.sleep = options.sleep ?? waitForDuration;
        this.setTimer = options.setTimer ?? ((callback, durationMs) => window.setTimeout(callback, durationMs));
        this.clearTimer = options.clearTimer ?? ((timer) => window.clearTimeout(timer));
        this.minIntervalMs = Math.max(0, options.minIntervalMs ?? STORYBOARD_IMAGE_MIN_INTERVAL_MS);
    }

    run<T>(
        task: (context: { attempt: number; signal: AbortSignal }) => Promise<T>,
        options: {
            signal?: AbortSignal;
            timeoutMs?: number;
            retryDelaysMs?: readonly number[];
            shouldRetry?: (error: unknown) => boolean;
            onPhase?: (event: StoryboardImageRequestQueueEvent) => void;
        } = {},
    ): Promise<T> {
        options.onPhase?.({ phase: "queued", attempt: 0 });
        const current = this.tail.then(() => this.execute(task, options));

        this.tail = current.then(
            () => this.sleep(this.minIntervalMs, options.signal).catch(() => undefined),
            () => this.sleep(this.minIntervalMs, options.signal).catch(() => undefined),
        );
        return current;
    }

    private async execute<T>(
        task: (context: { attempt: number; signal: AbortSignal }) => Promise<T>,
        options: {
            signal?: AbortSignal;
            timeoutMs?: number;
            retryDelaysMs?: readonly number[];
            shouldRetry?: (error: unknown) => boolean;
            onPhase?: (event: StoryboardImageRequestQueueEvent) => void;
        },
    ) {
        const retryDelaysMs = options.retryDelaysMs ?? STORYBOARD_IMAGE_RETRY_DELAYS_MS;
        const timeoutMs = options.timeoutMs ?? STORYBOARD_IMAGE_REQUEST_TIMEOUT_MS;
        const shouldRetry = options.shouldRetry ?? isRetryableStoryboardImageError;

        for (let attempt = 1; ; attempt += 1) {
            throwIfAborted(options.signal);
            options.onPhase?.({ phase: "generating", attempt });
            try {
                return await this.runAttempt(task, attempt, timeoutMs, options.signal);
            } catch (error) {
                const retryDelayMs = retryDelaysMs[attempt - 1];
                if (retryDelayMs === undefined || !shouldRetry(error) || options.signal?.aborted) throw error;
                options.onPhase?.({ phase: "retrying", attempt, retryDelayMs });
                await this.sleep(retryDelayMs, options.signal);
            }
        }
    }

    private runAttempt<T>(task: (context: { attempt: number; signal: AbortSignal }) => Promise<T>, attempt: number, timeoutMs: number, parentSignal?: AbortSignal) {
        const controller = new AbortController();
        const handleAbort = () => controller.abort(parentSignal?.reason);
        parentSignal?.addEventListener("abort", handleAbort, { once: true });

        return new Promise<T>((resolve, reject) => {
            let settled = false;
            const finish = (callback: () => void) => {
                if (settled) return;
                settled = true;
                this.clearTimer(timer);
                parentSignal?.removeEventListener("abort", handleAbort);
                callback();
            };
            const timer = this.setTimer(() => {
                controller.abort();
                finish(() => reject(new Error(`单张图片请求超过 ${Math.round(timeoutMs / 1000)} 秒，已自动停止`)));
            }, timeoutMs);

            task({ attempt, signal: controller.signal }).then(
                (value) => finish(() => resolve(value)),
                (error) => finish(() => reject(error)),
            );
        });
    }
}

export function isRetryableStoryboardImageError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "");
    return /(?:HTTP\s*5\d\d|429|限流|上游模型请求失败|网络或本地代理未返回响应|请求超过\s*\d+\s*秒)/i.test(message);
}

function waitForDuration(durationMs: number, signal?: AbortSignal) {
    if (durationMs <= 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            signal?.removeEventListener("abort", handleAbort);
            resolve();
        }, durationMs);
        const handleAbort = () => {
            window.clearTimeout(timer);
            signal?.removeEventListener("abort", handleAbort);
            reject(createAbortError());
        };
        signal?.addEventListener("abort", handleAbort, { once: true });
    });
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw createAbortError();
}

function createAbortError() {
    return new DOMException("故事板生成已取消", "AbortError");
}
