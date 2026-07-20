import { useEffect, useState } from "react";
import { Button, Form, Input, Modal, Select, Upload, type UploadFile } from "antd";
import { Check, ImagePlus, UploadCloud } from "lucide-react";

import { hookDifficultyLabel } from "@/lib/canvas/ecommerce-workflow";
import type { EcommerceHookOption, EcommerceProductBrief } from "@/types/canvas";

type ProductScriptModalProps = {
    open: boolean;
    loading: boolean;
    onClose: () => void;
    onSubmit: (brief: EcommerceProductBrief, files: File[]) => void;
};

const initialValues: EcommerceProductBrief = {
    productName: "",
    sku: "",
    category: "服装",
    market: "东南亚",
    platform: "TikTok",
    audience: "18-35 岁女性",
    language: "英语",
    videoDuration: "15 秒",
    sellingPoints: "",
    offer: "",
    cta: "点击购物链接查看",
    prohibitedClaims: "不得编造材质、功效、价格、销量、库存或认证",
    visualRequirements: "保持产品颜色、图案、版型和细节与参考图一致",
};

export function ProductScriptModal({ open, loading, onClose, onSubmit }: ProductScriptModalProps) {
    const [form] = Form.useForm<EcommerceProductBrief>();
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [fileError, setFileError] = useState(false);

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue(initialValues);
        setFileList([]);
        setFileError(false);
    }, [form, open]);

    const submit = async () => {
        const values = await form.validateFields();
        const files = fileList.flatMap((item) => (item.originFileObj ? [item.originFileObj as unknown as File] : []));
        if (!files.length) {
            setFileError(true);
            return;
        }
        onSubmit(values, files);
    };

    return (
        <Modal
            title="生成新剧本"
            open={open}
            width={760}
            centered
            destroyOnHidden
            mask={{ closable: !loading }}
            closable={!loading}
            styles={{ body: { maxHeight: "68vh", overflowY: "auto", paddingRight: 8 } }}
            onCancel={onClose}
            footer={
                <>
                    <Button disabled={loading} onClick={onClose}>
                        取消
                    </Button>
                    <Button type="primary" loading={loading} onClick={() => void submit()}>
                        创建产品资料并生成3个钩子
                    </Button>
                </>
            }
        >
            <div className="mb-5 text-sm text-foreground/55">产品事实以这里填写的内容为准。参考图只用于保持外观一致，不会自动推断材质、功效或价格。</div>
            <Form form={form} layout="vertical" requiredMark={false} initialValues={initialValues}>
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <Form.Item name="productName" label="产品名称" rules={[{ required: true, message: "请填写产品名称" }]}>
                        <Input placeholder="例如：女款短袖棒球衫" />
                    </Form.Item>
                    <Form.Item name="sku" label="SKU（可选）">
                        <Input placeholder="内部款号" />
                    </Form.Item>
                    <Form.Item name="category" label="类目" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="market" label="目标市场" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="platform" label="投放平台" rules={[{ required: true }]}>
                        <Select options={[{ value: "TikTok" }, { value: "Shopee" }, { value: "Lazada" }, { value: "Instagram Reels" }]} />
                    </Form.Item>
                    <Form.Item name="audience" label="目标人群" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="language" label="视频语言" rules={[{ required: true }]}>
                        <Select options={[{ value: "英语" }, { value: "泰语" }, { value: "越南语" }, { value: "印尼语" }, { value: "马来语" }, { value: "菲律宾语" }]} />
                    </Form.Item>
                    <Form.Item name="videoDuration" label="目标时长" rules={[{ required: true }]}>
                        <Select options={[{ value: "10 秒" }, { value: "15 秒" }, { value: "20 秒" }, { value: "30 秒" }]} />
                    </Form.Item>
                </div>

                <Form.Item name="sellingPoints" label="已确认卖点" rules={[{ required: true, message: "请填写至少一个已确认卖点" }]}>
                    <Input.TextArea rows={3} placeholder="每行一个，只写已经确认的信息。例如：宽松版型、前胸刺绣、三种配色。" />
                </Form.Item>

                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <Form.Item name="offer" label="优惠信息（可选）">
                        <Input placeholder="没有就留空" />
                    </Form.Item>
                    <Form.Item name="cta" label="行动指令（CTA）">
                        <Input />
                    </Form.Item>
                </div>

                <Form.Item name="prohibitedClaims" label="禁止出现的说法">
                    <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="visualRequirements" label="视觉要求">
                    <Input.TextArea rows={2} />
                </Form.Item>

                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <ImagePlus className="size-4" />
                    产品参考图
                    <span className="font-normal text-foreground/45">1-4 张，优先正面、背面和细节图</span>
                </div>
                <Upload.Dragger
                    accept="image/*"
                    multiple
                    maxCount={4}
                    beforeUpload={() => false}
                    fileList={fileList}
                    onChange={({ fileList: next }) => {
                        const limited = next.slice(-4);
                        setFileList(limited);
                        if (limited.length) setFileError(false);
                    }}
                    listType="picture"
                    disabled={loading}
                >
                    <div className="flex items-center justify-center gap-3 py-3">
                        <UploadCloud className="size-5 opacity-55" />
                        <span className="text-sm">点击或拖入产品图</span>
                    </div>
                </Upload.Dragger>
                <div className={`mt-2 text-xs ${fileError ? "text-red-400" : "text-foreground/45"}`}>
                    {fileError ? "请至少上传 1 张产品参考图。" : "至少需要 1 张产品参考图，最多上传 4 张。"}
                </div>
            </Form>
        </Modal>
    );
}

export function HookSelectionModal({
    open,
    options,
    selectedId,
    loading,
    onClose,
    onSubmit,
}: {
    open: boolean;
    options: EcommerceHookOption[];
    selectedId?: string;
    loading: boolean;
    onClose: () => void;
    onSubmit: (option: EcommerceHookOption) => void;
}) {
    const [value, setValue] = useState<string>();

    useEffect(() => {
        if (!open) return;
        setValue(selectedId || options[0]?.id);
    }, [open, options, selectedId]);

    const selected = options.find((option) => option.id === value);

    return (
        <Modal
            title="选择一个剧情钩子"
            open={open}
            centered
            width={1080}
            destroyOnHidden
            mask={{ closable: !loading }}
            closable={!loading}
            styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 8 } }}
            onCancel={onClose}
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button disabled={loading} onClick={onClose}>
                        稍后选择
                    </Button>
                    <Button type="primary" loading={loading} disabled={!selected} onClick={() => selected && onSubmit(selected)}>
                        使用该钩子生成完整剧本
                    </Button>
                </div>
            }
        >
            <div className="mb-4 text-sm text-foreground/55">先判断第一秒是否能看懂事件，再看产品入场和结果是否能直接拍出来。选择后才会生成完整剧本。</div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {options.map((option) => {
                    const active = option.id === value;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            aria-pressed={active}
                            className={`relative min-w-0 rounded-md border p-4 text-left transition ${
                                active ? "border-primary bg-primary/5 ring-1 ring-primary/25" : "border-border bg-background hover:border-foreground/35"
                            }`}
                            onClick={() => setValue(option.id)}
                        >
                            <div className="mb-3 flex items-start gap-3">
                                <span className={`grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                    {active ? <Check className="size-4" /> : option.id}
                                </span>
                                <span className="min-w-0">
                                    <span className="block break-words text-sm font-semibold">{option.title}</span>
                                    <span className="mt-0.5 block text-xs text-foreground/45">
                                        {option.angle} · 难度 {hookDifficultyLabel(option.productionDifficulty)}
                                    </span>
                                </span>
                            </div>

                            <HookDetail label="第一秒" value={option.firstSecondVisual} emphasize />
                            <HookDetail label="具体事件" value={option.concreteIncident} />
                            <HookDetail label="风险/后果" value={option.stakes} />
                            <HookDetail label="产品入场" value={option.productEntryAction} />
                            <HookDetail label="可见结果" value={option.visiblePayoff} emphasize />
                            <HookDetail label="所需素材" value={option.requiredAssets.join("、") || "待补充"} />
                        </button>
                    );
                })}
            </div>
        </Modal>
    );
}

function HookDetail({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
    return (
        <div className="mb-2 last:mb-0">
            <div className="mb-0.5 text-[11px] font-medium text-foreground/45">{label}</div>
            <div className={`break-words text-xs leading-5 ${emphasize ? "font-medium text-foreground" : "text-foreground/75"}`}>{value}</div>
        </div>
    );
}

export function StoryboardImagePromptModal({
    open,
    prompt,
    onClose,
    onSave,
}: {
    open: boolean;
    prompt: string;
    onClose: () => void;
    onSave: (prompt: string) => void;
}) {
    const [value, setValue] = useState(prompt);

    useEffect(() => {
        if (open) setValue(prompt);
    }, [open, prompt]);

    return (
        <Modal
            title="修改故事板提示词"
            open={open}
            centered
            width={680}
            onCancel={onClose}
            footer={
                <>
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" disabled={!value.trim()} onClick={() => onSave(value.trim())}>
                        保存提示词
                    </Button>
                </>
            }
        >
            <Input.TextArea value={value} rows={12} onChange={(event) => setValue(event.target.value)} placeholder="描述这一张故事板画面中的人物、动作、场景和剧情变化" />
            <div className="mt-3 text-xs text-foreground/45">保存不会自动调用生图。回到图片节点点击“重新生成”后才会产生新的图片请求。</div>
        </Modal>
    );
}
