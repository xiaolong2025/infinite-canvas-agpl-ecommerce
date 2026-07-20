import type { AiTextMessage } from "@/services/api/image";
import type { ReferenceImage } from "@/types/image";
import type { CanvasNodeData, CanvasWorkflowKind, EcommerceHookDifficulty, EcommerceHookOption, EcommerceProductBrief, EcommerceStoryboardProductProminence, EcommerceStoryboardShot, EcommerceStoryboardShotRole } from "@/types/canvas";

const WORKFLOW_TITLES: Partial<Record<string, CanvasWorkflowKind>> = {
    对标视频拆解: "reference-analysis",
    创意钩子方案: "hook-options",
    产品带货剧本: "sales-script",
    结构化分镜: "storyboard",
};

export const STORYBOARD_IMAGE_NODE_SIZE = { width: 270, height: 480 } as const;
export const STORYBOARD_IMAGE_NODE_SIZE_VERSION = 3;
export const STORYBOARD_PREVIEW_REQUEST_SIZE = "720x1280";
export const STORYBOARD_PREVIEW_QUALITY = "low";

export function workflowKindOf(node: CanvasNodeData | null | undefined) {
    if (!node) return undefined;
    return node.metadata?.workflowKind || WORKFLOW_TITLES[node.title];
}

export function normalizeStoryboardImageNodeSize(node: CanvasNodeData) {
    const kind = workflowKindOf(node);
    if (!isStoryboardImageKind(kind)) return node;
    const hasExpectedSize = node.width === STORYBOARD_IMAGE_NODE_SIZE.width && node.height === STORYBOARD_IMAGE_NODE_SIZE.height;
    if (hasExpectedSize && node.metadata?.storyboardDisplaySizeVersion === STORYBOARD_IMAGE_NODE_SIZE_VERSION) return node;

    return {
        ...node,
        ...STORYBOARD_IMAGE_NODE_SIZE,
        metadata: {
            ...node.metadata,
            storyboardDisplaySizeVersion: STORYBOARD_IMAGE_NODE_SIZE_VERSION,
        },
    };
}

function isStoryboardImageKind(kind: CanvasWorkflowKind | undefined) {
    return kind === "character-reference" || kind === "storyboard-frame" || kind === "test-frame";
}

export function buildProductBriefMarkdown(brief: EcommerceProductBrief, referenceCount: number) {
    return `# 产品资料

- 产品名称：${brief.productName}
- SKU：${brief.sku || "未填写"}
- 类目：${brief.category}
- 目标市场：${brief.market}
- 投放平台：${brief.platform}
- 目标人群：${brief.audience}
- 视频语言：${brief.language}
- 目标时长：${brief.videoDuration}
- 产品参考图：${referenceCount} 张（仅用于确认外观，不从图片推断材质、功效或价格）

## 已确认卖点

${brief.sellingPoints}

## 优惠与行动指令

- 优惠信息：${brief.offer || "未填写"}
- CTA：${brief.cta || "未填写"}

## 创作约束

- 禁止出现：${brief.prohibitedClaims || "不得编造未提供的材质、功效、价格、销量或认证"}
- 视觉要求：${brief.visualRequirements || "保持产品外观、颜色、图案和版型与参考图一致"}`;
}

export function buildHookOptionsMessages(analysis: string, productBrief: string, references: ReferenceImage[]): AiTextMessage[] {
    const prompt = `你是跨境电商短视频创意总监。请先不要写完整剧本，而是基于“对标视频拆解”的有效机制和新产品资料，提出 3 个剧情明确、第一秒就能看懂的带货视频钩子方案。

硬性规则：
1. 只复用节奏、镜头功能、钩子方式和转化结构，不复制原视频品牌、人物、专有文案或具体画面。
2. 产品事实只能来自产品资料。参考图仅用于识别外观，不得从图片推断材质、功效、价格、销量、库存或认证。
3. 信息缺失时写“待补充”，不得自行补齐。
4. 每个方案必须由单帧可见的具体事件起步，不能把“缺乏自信、太普通、告别平庸、提升气质、获得关注”当成核心冲突。
5. 必须写清：第一秒观众看到什么、发生了什么具体冲突、不解决会有什么可见后果、产品通过什么动作进入画面、换上或展示后出现什么可见结果。
6. 三个方案的事件机制必须明显不同，不能只是换文案。优先覆盖社交窘境、突发事件、强视觉反差或悬念中的不同方向，但必须适合当前产品。
7. 方案要能用手机、1-2 位演员和常见场地执行。productionDifficulty 只能是 low、medium、high。
8. requiredAssets 只列实际拍摄所需的人物、场地、道具和产品图，不得虚构产品能力。
9. 只输出合法 JSON，不要 Markdown，不要解释。结构必须严格如下，且 options 必须正好 3 项：
{"options":[{"id":"A","title":"","angle":"","firstSecondVisual":"","concreteIncident":"","stakes":"","productEntryAction":"","visiblePayoff":"","hookLine":"","productionDifficulty":"low","requiredAssets":[""],"whyItWorks":""}]}

【对标视频拆解，仅作结构参考】
${analysis}

【新产品资料，作为事实来源】
${productBrief}`;

    return multimodalMessages(prompt, references);
}

export function parseHookOptionsResponse(value: string): EcommerceHookOption[] {
    const text = value
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("文本模型没有返回可解析的钩子方案 JSON");
    const parsed = JSON.parse(text.slice(start, end + 1)) as { options?: unknown };
    if (!Array.isArray(parsed.options) || parsed.options.length !== 3) throw new Error("钩子方案必须正好生成 3 个，请重新生成");

    return parsed.options.map((item, index) => normalizeHookOption(item, index));
}

export function formatHookOptionsMarkdown(options: EcommerceHookOption[]) {
    return `# 创意钩子方案

先选择一个方案，再展开完整剧本。三个方向必须由可见事件驱动，不以抽象情绪作为剧情。

${options
    .map(
        (option) => `## ${option.id} · ${option.title}

- 创意角度：${option.angle}
- 第一秒画面：${option.firstSecondVisual}
- 具体事件：${option.concreteIncident}
- 风险/后果：${option.stakes}
- 产品入场：${option.productEntryAction}
- 可见结果：${option.visiblePayoff}
- 开场台词：${option.hookLine || "无"}
- 制作难度：${hookDifficultyLabel(option.productionDifficulty)}
- 所需素材：${option.requiredAssets.join("、") || "待补充"}
- 有效原因：${option.whyItWorks}`,
    )
    .join("\n\n")}`;
}

export function buildSalesScriptMessages(analysis: string, productBrief: string, selectedHook: EcommerceHookOption, references: ReferenceImage[]): AiTextMessage[] {
    const prompt = `你是跨境电商短视频编导。请基于“对标视频拆解”的结构规律，严格执行用户已经选定的创意钩子，为新的产品资料生成一份可拍摄的完整带货视频剧本。

硬性规则：
1. 必须展开选定钩子的具体事件，不得更换创意方向，不得把冲突退化为“缺乏自信、太普通、告别平庸、提升气质”等抽象表达。
2. 前 1 秒必须直接呈现 selectedHook.firstSecondVisual；前 3 秒必须完成具体事件、风险/后果和产品入场动作中的至少两项。
3. 结果必须能从画面中直接看见，不能只靠人物说“更好看、更有自信”。
4. 只复用对标视频的节奏、镜头功能、钩子方式和转化结构，不复制原视频品牌、人物、专有文案或具体画面。
5. 产品事实只能来自产品资料。参考图仅用于识别外观，不得从图片推断材质、功效、价格、销量、库存或认证。
6. 信息缺失时写“待补充”，不得自行补齐。
7. 整份审核文档必须使用简体中文。“视频语言”只控制成片中的口播和屏幕文字，绝不代表整份剧本使用该语言。
8. 输出中文 Markdown，必须包含并保留以下中文标题：选定创意执行摘要、完整剧情、完整口播/字幕、按时间拆分的镜头表、画面执行要求、事实核对清单。
9. “完整剧情”、创意解释、镜头目的、动作、画面要求、产品重点和核对清单必须全部使用中文，方便中文用户审核。
10. “完整口播/字幕”先写目标视频语言原文，并在每条原文后紧跟“中文释义”；不得只输出外语台词。
11. 镜头表至少包含：时间、镜头目的、可见动作、画面、口播/屏幕文字（目标语言）、中文释义、产品展示重点。除目标语言台词外，表格内容使用中文。
12. 面向短视频素材制作，不讨论投放指标或 ROAS。

语言分层示例：
- 审核说明：中文。
- 成片口播/字幕：按产品资料中的“视频语言”生成。
- 中文释义：逐条提供，表达与成片口播一致。
- 不要因为视频语言是英语、泰语、越南语、印尼语、马来语或菲律宾语，就把剧情说明和镜头表改成外语。

【用户选定的创意钩子，必须严格执行】
${JSON.stringify(selectedHook, null, 2)}

【对标视频拆解，仅作结构参考】
${analysis}

【新产品资料，作为事实来源】
${productBrief}`;

    return multimodalMessages(prompt, references);
}

export function validateSalesScriptResponse(value: string) {
    const text = value.trim();
    if (!text) throw new Error("文本模型没有返回产品带货剧本");

    const requiredSections = ["选定创意执行摘要", "完整剧情", "完整口播", "按时间拆分的镜头表", "画面执行要求", "事实核对清单"];
    const missingSections = requiredSections.filter((section) => !text.includes(section));
    const chineseCharacterCount = (text.match(/[\u3400-\u9fff]/g) || []).length;

    if (missingSections.length || chineseCharacterCount < 80) {
        throw new Error(`剧本未按中文审核格式返回${missingSections.length ? `，缺少：${missingSections.join("、")}` : ""}。请重新生成；视频语言只应用于口播和屏幕文字。`);
    }

    return text;
}

export function buildStoryboardMessages(script: string, productBrief: string, references: ReferenceImage[]): AiTextMessage[] {
    const prompt = `你是电商短视频分镜师。把以下产品带货剧本拆成 6 至 10 个连续分镜，并为每个镜头写一条可用于图片模型的 9:16 竖屏故事板提示词。所有分镜连起来必须能让人不看文字也理解事件如何发生、升级、解决并进入产品展示。

生成前先完成这一项，不要直接开始写 JSON：
1. 从原剧本中提取“开场失败动作”和“开场可见问题”，例如抬臂被卡住、衣服脱不下来、拿杯时衣服上缩、走进入口时被拦住。
2. 指定一个唯一的“剧情回报镜头”：优先与 reveal 合并；无法合并时只能使用 reveal 后的第一镜。
3. 该镜头的 storyBeat 必须使用“再次执行开场动作：……；可见结果：……”的句式，characters、requiredVisualEvidence 和 imagePrompt 必须重复同一个动作和结果。
4. 输出前自检：如果 reveal 和其后第一镜都只有换装、拉衣摆、戴配饰、插兜、站立或展示服装，而没有再次执行开场动作，禁止输出，必须先改好。

硬性规则：
1. 只使用产品资料中确认的事实，不得新增材质、功效、价格、销量或认证。
2. 必须忠实执行原剧本的核心地点、冲突发起者/配角、主角失败事件、产品入场动作和可见结果，不得换成另一套更容易生成的剧情。原剧本中的具体事件必须由对应镜头画面承接，不能被改写成独自拍摄或普通换装展示。
3. 参考图只用于保持产品外观、颜色、图案和版型一致。
4. 除 voiceover、onScreenText 和 imagePrompt 外，所有 JSON 字段必须使用简体中文，方便中文用户审核。voiceover 和 onScreenText 使用产品资料指定的视频语言；imagePrompt 使用简洁明确的英文。
5. imagePrompt 必须描述单帧可见画面，不描述镜头运动结果，不要求图片模型生成字幕、Logo 或水印；它只是给图片模型使用的英文执行提示，不能替代中文 visual、storyBeat 和 requiredVisualEvidence。
6. storyBeat 必须写清本镜头相对上一镜头发生了什么新变化，不能只写“展示产品”“人物站立”等静态描述。
7. characterIdentity 是主角身份圣经，必须写成不含动作和服装的稳定外形描述，例如年龄感、脸型、发型、肤色、体型和辨识特征；所有镜头必须逐字使用同一个 characterIdentity，不能每镜改写。
8. characters 必须明确主角和配角在画面中的身份、位置、表情与动作，不能只写主角和衣服。剧本提到旁人侧目、朋友递物、顾客经过等反应时，必须让配角或其手部真实进入画面。
9. scene 必须明确地点、时间、光线、背景、家具和关键道具；同一场景内不得无故改变。剧本点名的沙发、桌子、饮料杯、门、货架、手机等场景元素不能被“简洁墙面”替代。
10. environmentEvidence 必须列出本镜头必须看见的环境、家具、道具或配角证据。hook 镜头至少 3 项并覆盖剧本点名的场地和道具；reveal 镜头至少 2 项；连续动作、细节和 CTA 镜头至少 1 项。不能把服装、脸或身体动作冒充环境证据，也不要把多个证据合并到同一个字符串。
11. compositionPlan 必须明确前景、中景和背景分别放什么，以及环境、人物、服装在画面中的视觉占比。hook 和剧情回报镜头必须让环境与事件占主导，不能使用摄影棚式孤立模特构图。
12. continuity 必须说明承接上一镜头的服装状态、人物位置、手中物品、动作结果、场景道具和情绪变化；第一镜头写“建立初始状态”。
13. 6 至 10 个镜头必须按“事件钩子 → 冲突/风险升级 → 产品通过动作进入 → 清晰揭晓并完成开场问题，或由紧随其后的第一镜完成 → 最多一个自然细节/穿搭展示 → 行动指令”形成连续因果。允许 reveal 镜头把“产品完整亮相”和“成功完成开场动作”合并在同一个画面；如果 reveal 只负责换装亮相，揭晓后的第一镜必须立刻给出结果，不能先戴墨镜、插兜、整理衣服或拍衣服细节。相邻镜头不能是无剧情变化的重复摆拍，也不能把中段全部变成孤立商品特写。
14. shotPurpose 必须写本镜头在剧情中的功能，例如“建立痛点”“完成遮挡转场”“用同一动作证明换装结果”“展示版型”“完成CTA”，不得写“无”。
15. productVisible 必须准确表示目标产品是否有任何部分进入当前单帧。只有画面里完全没有目标产品时才为 false；手持产品、把产品套过头部、用产品布料遮挡镜头或只露出局部时都必须为 true，并用 forbiddenVisuals 控制“暂不展示完整图案”。productVisible=false 时，imagePrompt 不得描述目标产品。
16. productProminence 只能是 none、secondary、primary。产品不可见时必须为 none；剧情镜头中产品作为人物穿着或道具时应为 secondary；只有遮挡转场、首次揭晓或一个必要细节镜头可以为 primary。全片 primary 最多 2 镜，CTA 必须为 secondary，不能让每张图都以衣服为中心。
17. wardrobeState 必须写清主角当前穿什么，包括颜色、松紧、是否为旧衣或目标产品；换装前后必须明确改变，不能只写“承接上一镜头”。
18. requiredVisualEvidence 必须列出 3 至 5 个只看单帧就能核对的剧情证据。剧本明确写到“抬手拿杯导致露肚子、朋友侧目”等动作和后果时，必须逐项保留，不能概括成“主角尴尬”。
19. 剧本中点名的场地、家具、桌面物品、手持物、配角反应和身体后果，必须同时进入对应镜头的 environmentEvidence、requiredVisualEvidence 和 imagePrompt，不能只留在 scene 文本里。
20. forbiddenVisuals 必须列出会破坏本镜头的内容。产品揭晓前必须明确禁止目标产品、目标产品颜色和图案提前出现；剧情镜头必须禁止纯色背景、摄影棚摆拍、孤立模特、正面服装目录照和只看衣服看不到事件；CTA镜头必须禁止手势模糊或指向错误方向。
21. transitionAnchor 必须写明连接前后镜头的可见锚点，例如“白色衣领遮满镜头后切换黑色产品T恤”“保持同一动作构图完成前后对比”；没有转场也要写“无转场，连续动作承接”。
22. camera 必须同时包含景别、机位和静止/推拉/跟拍等运镜说明；visual 只写最终需要生成的单帧画面。hook 默认使用能容纳场景、道具、配角和事件后果的中景或中全景，除非剧本明确要求特写。
23. productFocus 只能写产品资料已确认且能够通过画面展示的外观或版型。不得把“柔软、舒适”扩写成未经确认的弹性、拉伸、回弹、透气、速干或功能性。
24. 只输出合法 JSON，不要 Markdown，不要解释。结构必须严格如下：
{"shots":[{"id":"S01","role":"hook","timeRange":"0-2s","durationSeconds":2,"shotPurpose":"","storyBeat":"","characterIdentity":"","characters":"","scene":"","environmentEvidence":["","",""],"compositionPlan":"","continuity":"","productVisible":false,"productProminence":"none","wardrobeState":"","requiredVisualEvidence":["","",""],"forbiddenVisuals":[""],"transitionAnchor":"","voiceover":"","onScreenText":"","visual":"","camera":"","productFocus":"","imagePrompt":""}]}
25. role 只能是 hook、reveal、detail、cta、other。
26. 第一镜必须是 hook，至少一镜是 reveal，最后一镜必须是 cta；detail 必须出现在 reveal 之后，不能连续出现两个只看局部、看不到主角反应的 detail 镜头。
27. 主角在 hook、reveal、剧情回报和 cta 镜头中必须保持可识别。全片最多只能有一个“不露脸、仅躯干或纯产品局部”的镜头，不能让主角在剧情中段连续消失。
28. 观察视角必须稳定。除非原剧本明确要求，不得在普通第三人称画面、第一人称 POV、镜中自拍之间反复切换；最多使用一次特殊主观视角或镜面构图。
29. reveal 镜头必须同时看见主角和目标产品的完整关键外观，不能只给胸口或衣摆局部。优先在 reveal 镜头直接承接开场失败动作并呈现解决结果；如果单帧构图无法同时清楚完成揭晓和动作结果，则 reveal 后的第一镜必须使用同一动作对象或动作方向呈现解决结果。不能先堆服装细节，再把剧情结果放到后面。
30. CTA 镜头的可见动作必须与 CTA 文案一致。若文案要求点击、查看链接或向下购买，人物必须明确指向对应方向，不能只微笑、竖拇指或站立。
31. 每张 imagePrompt 都要用英文完整重复 characterIdentity、environmentEvidence、compositionPlan、当前服装、配角和本镜头唯一事件；不得写成只包含“a man wearing a T-shirt”的模特照提示词。
32. 第一优先级是让观众进入剧情，第二优先级是动作和情绪，第三优先级才是服装。除遮挡转场、揭晓和一个必要细节镜头外，图片必须像自然发生的手机短视频剧情画面，而不是广告海报、时尚目录或棚拍产品照。
33. reveal 镜头本身或 reveal 后的第一镜必须完成“剧情回报”：主角重新完成开场失败的动作、自然使用产品、回到原场景继续行动，或让开场出现的配角产生明确的新反应。若 reveal 已同时完成产品亮相和可见结果，下一镜可以进入一个自然细节/穿搭展示；若 reveal 没有完成结果，下一镜必须补足。仅戴墨镜、整理领口、插兜、侧身、微笑、看镜头或静态走秀不能算剧情回报。
34. reveal 之后最多只能有一个纯造型整理或静态穿搭展示镜头；不得连续生成“戴配饰 → 插兜侧身 → 对镜摆姿势”等无事件广告画面。
35. 承担剧情回报的 reveal 镜头或其后第一镜，必须在 storyBeat、characters、requiredVisualEvidence 和 imagePrompt 中同时写清“复现了哪个开场动作”“解决了什么开场问题”“观众能看到什么动作结果”，至少出现一个可见动作和一个可见后果，不能只写抽象的轻松、自信或舒适。
36. 如果镜头通过拉衣摆、撑开衣服或捏住侧缝表现宽松，动作只能轻微移动衣摆或侧缝，不能把面料当作弹力布拉伸；imagePrompt 和 forbiddenVisuals 必须明确保持印花原始大小、位置、比例、方向和形状，禁止放大、扭曲、重绘、复制或环绕躯干。
37. 所有产品可见镜头中的 imagePrompt 必须重复同一个产品外观描述，并明确它是同一件衣服；所有同场景镜头必须重复同一地点的建筑结构、地面、围栏、家具、道具、光线方向和时间，禁止无故切换室内外或重新设计场地。

【产品资料】
${productBrief}

【产品带货剧本】
${script}`;

    return [
        {
            role: "system",
            content: "当前任务是严格的结构化数据生成。只能返回一个合法 JSON 对象，不得输出 Markdown、解释、评价、建议或空数组；shots 必须完整包含 6 至 10 个镜头。",
        },
        ...multimodalMessages(prompt, references),
    ];
}

export function buildStoryboardRepairMessages(script: string, productBrief: string, references: ReferenceImage[], previousResponse: string, validationError: string): AiTextMessage[] {
    const payoffRepairInstruction = /(?:都)?没有完成开场问题|缺少可见的剧情回报|没有立即呈现开场问题/i.test(validationError)
        ? `
本次失败属于“剧情回报缺失”，必须按以下方式重写，不得只改形容词：
1. 回到【产品带货剧本】，逐字找出开场失败动作和可见问题。
2. 在 reveal 镜头本身，或紧随 reveal 后的第一镜中，真实复现同一个动作。该镜头 role 必须为 reveal 或 other，productVisible 必须为 true，不能标为 detail。
3. 该镜头四个字段必须同时包含：
   - storyBeat：“再次执行开场动作：<具体动作>；可见结果：<具体成功结果>”
   - characters：主角用身体真实完成该动作，写清手臂、身体、手中物或配角如何变化
   - requiredVisualEvidence：至少分别列出“复现开场动作：<动作>”和“可见结果：<结果>”
   - imagePrompt：必须包含 “repeats the exact opening action” 和可见成功结果
4. 不得用“更自信、很轻松、很舒适、展示宽松版型”代替具体动作结果；不得先安排戴墨镜、插兜、整理衣服、拉衣摆特写或静态摆拍。
5. 只允许 reveal 或其后第一镜承担该结果，不得把结果推迟到更后面的镜头。
`
        : "";
    return [
        ...buildStoryboardMessages(script, productBrief, references),
        {
            role: "assistant",
            content: previousResponse.slice(0, 24000),
        },
        {
            role: "user",
            content: `上一次响应未通过程序校验：${validationError}

请立即重新生成完整结果，不要解释错误，不要复用空数组，不要只修补单个字段。
只输出一个合法 JSON 对象，顶层只能包含 shots；shots 必须为 6 至 10 项，并完整遵守上一条消息中的字段、剧情顺序、场景证据、产品状态和 CTA 规则。
${payoffRepairInstruction}`,
        },
    ];
}

export function parseStoryboardResponse(value: string, sourceScript = ""): EcommerceStoryboardShot[] {
    const text = value
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("文本模型没有返回可解析的分镜 JSON");
    const parsed = JSON.parse(text.slice(start, end + 1)) as { shots?: unknown };
    if (!Array.isArray(parsed.shots)) throw new Error("文本模型没有返回 shots 数组");
    if (parsed.shots.length < 6 || parsed.shots.length > 10) throw new Error(`文本模型返回 ${parsed.shots.length} 个分镜，必须为 6 至 10 个`);

    const shots = parsed.shots.map((item, index) => normalizeShot(item, index));
    validateStoryboardForGeneration(shots, sourceScript);
    return shots;
}

export function validateStoryboardForGeneration(shots: EcommerceStoryboardShot[], sourceScript = "") {
    if (shots.length < 6 || shots.length > 10) throw new Error(`分镜共有 ${shots.length} 个镜头，必须为 6 至 10 个`);
    const incompleteShot = shots.find((shot) => !Array.isArray(shot.environmentEvidence) || !Array.isArray(shot.requiredVisualEvidence) || !Array.isArray(shot.forbiddenVisuals));
    if (incompleteShot) throw new Error(`分镜 ${incompleteShot.id || "未知"} 缺少新版环境证据、必现画面或禁现画面字段，请重新拆分分镜`);
    validateStoryboardSequence(shots);
    validateScriptVisualCoverage(shots, sourceScript);
}

export function formatStoryboardMarkdown(shots: EcommerceStoryboardShot[]) {
    const rows = shots
        .map(
            (shot) =>
                `## ${shot.id} · ${shotRoleLabel(shot.role)} · ${shot.timeRange}

- 剧情推进：${shot.storyBeat || "待补充"}
- 主角身份圣经：${shot.characterIdentity || "待补充"}
- 人物与动作：${shot.characters || "待补充"}
- 场景：${shot.scene || "待补充"}
- 环境证据：${shot.environmentEvidence?.length ? shot.environmentEvidence.join("；") : "待补充"}
- 前中后景构图：${shot.compositionPlan || "待补充"}
- 连续性：${shot.continuity || "待补充"}
- 镜头目的：${shot.shotPurpose || "待补充"}
- 产品状态：${shot.productVisible ? "目标产品可见" : "目标产品不可见"}
- 产品画面权重：${productProminenceLabel(shot.productProminence || inferProductProminence(shot))}
- 服装状态：${shot.wardrobeState || "待补充"}
- 必须出现：${shot.requiredVisualEvidence.length ? shot.requiredVisualEvidence.join("；") : "待补充"}
- 禁止出现：${shot.forbiddenVisuals.length ? shot.forbiddenVisuals.join("；") : "无"}
- 转场锚点：${shot.transitionAnchor || "待补充"}
- 单帧画面：${shot.visual || "待补充"}
- 景别/机位/运镜：${shot.camera || "待补充"}
- 产品展示重点：${shot.productFocus || (shot.productVisible ? "待补充" : "本镜头不展示目标产品")}
- 口播：${shot.voiceover || "无"}
- 屏幕文字：${shot.onScreenText || "无"}
- 故事板画面提示词：${shot.imagePrompt}`,
        )
        .join("\n\n");

    return `# 结构化分镜

共 ${shots.length} 个连续剧情镜头。角色身份参考图会单独放置，不计入剧情镜头；随后严格按 S01 至最后一镜逐张生成故事板，用低成本图片检查事件因果、节奏和产品出场是否成立，确认后再进入视频模型。

> 当前图片渠道只有在真正支持参考图输入时，才能验证人物脸部和产品外观的一致性；不支持参考图的渠道只能用于验证剧情和构图。

${rows}`;
}

export function buildCharacterReferencePrompt(productBrief: string, shots: EcommerceStoryboardShot[] = []) {
    const characterBrief = shots.find((shot) => shot.characterIdentity?.trim())?.characterIdentity?.trim();
    return `生成一张 9:16 竖屏的电商短视频主角角色基准图。这张图片只用于固定后续全部故事板中的同一个主角身份，不是剧情镜头。

角色基准要求：
- 画面中只有一位主角，正面或轻微侧面，膝盖以上的三分之二身站姿；脸部清晰无遮挡且占据足够像素，肩宽、上身比例、体型和双手同时可见，便于后续全身动作复用。
- 主角气质和外形适合以下产品资料中的目标市场与目标人群，但不得模仿任何真实名人。
- 穿无图案、无品牌的中性基础服装，不穿目标产品，避免后续把人物身份与产品图案混在一起。
- 使用简洁中性背景和均匀自然光，不出现配角、复杂道具、字幕、Logo、水印、价格牌或界面按钮。
- 真实商业摄影质感，不使用拼贴、分屏、多人对照或证件照排版。

分镜中的主角身份线索：
${characterBrief || "未提供额外身份线索，按产品目标人群建立一位自然真实的非名人主角。"}

产品与受众资料：
${productBrief}`;
}

export function buildStoryboardFramePrompt(shot: EcommerceStoryboardShot, productBrief: string, productReferenceCount: number, hasPreviousFrame: boolean, referenceInputSupported = true) {
    const hasProductReferences = referenceInputSupported && shot.productVisible && productReferenceCount > 0;
    const productLabels = !hasProductReferences ? "" : productReferenceCount === 1 ? "图片1" : `图片1至图片${productReferenceCount}`;
    const characterLabel = `图片${(hasProductReferences ? productReferenceCount : 0) + 1}`;
    const previousLabel = `图片${(hasProductReferences ? productReferenceCount : 0) + 2}`;
    const characterIdentity = shot.characterIdentity?.trim() || shot.characters;
    const environmentEvidenceItems = Array.isArray(shot.environmentEvidence) ? shot.environmentEvidence : [];
    const requiredVisualEvidenceItems = Array.isArray(shot.requiredVisualEvidence) ? shot.requiredVisualEvidence : [];
    const forbiddenVisualItems = Array.isArray(shot.forbiddenVisuals) ? shot.forbiddenVisuals : [];
    const environmentEvidence = environmentEvidenceItems.length ? environmentEvidenceItems.map((item) => `- ${item}`).join("\n") : `- ${shot.scene}`;
    const productProminence = shot.productProminence || inferProductProminence(shot);
    const visualHierarchy =
        productProminence === "none"
            ? "环境、道具、配角反应和剧情事件约占画面 60%，主角动作约占 40%；服装只承担剧情状态，不做商品展示。"
            : productProminence === "secondary"
              ? "场景和正在发生的事件约占画面 50%，人物表情与动作约占 30%，产品服装约占 20%；产品自然穿在人物身上，不能挤掉环境。"
              : "产品或转场动作约占画面 40%，人物或手部约占 30%，环境上下文至少保留 30%；即使产品是主视觉，也不能退化为无场景商品海报。";
    const requiredVisualEvidence = requiredVisualEvidenceItems.length ? requiredVisualEvidenceItems.map((item) => `- ${item}`).join("\n") : `- ${shot.visual}`;
    const forbiddenVisuals = forbiddenVisualItems.length ? forbiddenVisualItems.map((item) => `- ${item}`).join("\n") : "- 不得出现与当前剧情状态冲突的服装、人物、动作或产品";
    const garmentManipulation = /拉|扯|撑|展开|衣摆|侧缝|hem|pull|stretch|spread|side seam/i.test(`${shot.storyBeat} ${shot.characters} ${shot.visual} ${requiredVisualEvidenceItems.join(" ")} ${shot.imagePrompt}`);
    const productGeometryLock = shot.productVisible
        ? `- PRODUCT IDENTITY LOCK: this is the exact same garment in every product-visible frame. Preserve the same base color, silhouette, neckline, sleeve shape, graphic artwork, graphic placement, graphic scale, orientation and proportions. Never redesign, enlarge, shrink, recolor, duplicate, crop, wrap around the torso or distort the graphic.${
              garmentManipulation
                  ? "\n- GARMENT HANDLING LOCK: the hands may move only the hem or side seams outward by about 10-15 cm to reveal roomy space. Do not stretch the fabric surface. Keep the front graphic flat, undistorted and exactly the same size and shape."
                  : ""
          }`
        : "- PRODUCT ABSENCE LOCK: the target garment and all of its colors, graphics and silhouette must remain completely absent.";

    return `生成一张 9:16 竖屏手机短视频剧情关键帧，执行镜头 ${shot.id}（${shotRoleLabel(shot.role)}）。这张图首先是自然发生的剧情现场，其次才承担产品信息；不能生成孤立模特、服装目录、摄影棚海报或“人物站着展示衣服”的广告摆拍。

叙事视觉优先级（严格按顺序执行）：
1. 先让观众看懂正在发生的具体事件和可见后果。
2. 再让场地、家具、道具、配角和背景反应真实进入画面。
3. 再表现主角表情、身体动作和与环境的关系。
4. 最后才处理服装外观；产品不能覆盖或替代剧情。

本镜头视觉权重：
- 产品权重：${productProminenceLabel(productProminence)}
- ${visualHierarchy}

当前镜头状态锁（优先级最高，任何参考图与其冲突时都以这里为准）：
- 镜头目的：${shot.shotPurpose}
- 目标产品：${shot.productVisible ? "本镜头必须按规定自然出现目标产品" : "本镜头绝对不能出现目标产品，也不能提前出现产品颜色、图案或版型"}
- 主角身份：${characterIdentity}
- 主角服装：${shot.wardrobeState}
- 转场锚点：${shot.transitionAnchor}

跨镜头不可变事实锁：
- SAME PROTAGONIST LOCK: use the same person in every frame. Preserve the same facial identity, face shape, eyes, nose, jawline, hairstyle, hairline, skin tone, apparent age, height, shoulder width and body build. Do not cast a new person or beautify the face differently.
- SAME LOCATION LOCK: preserve the same physical location described as “${shot.scene}”. Keep the same architecture, walls, floor markings, fence, furniture, props, light direction, time of day and spatial layout. Do not switch between indoor and outdoor or redesign the location.
${productGeometryLock}

环境、道具和配角必须真实入镜：
${environmentEvidence}

前景/中景/背景构图：
- ${shot.compositionPlan || `按“${shot.scene}”建立前中后景，不能只用单色墙和孤立人物代替场景`}

必须在单帧中清晰出现：
${requiredVisualEvidence}

绝对禁止出现：
${forbiddenVisuals}

剧情任务：
- 本镜头推进：${shot.storyBeat || shot.visual}
- 人物与动作：${shot.characters || shot.visual}
- 场景：${shot.scene || "承接剧本中的场景"}
- 承接关系：${shot.continuity || (hasPreviousFrame ? "承接上一镜头的状态" : "建立初始状态")}
- 中文单帧画面：${shot.visual}
- 英文执行补充：${shot.imagePrompt}
- 景别/机位：${shot.camera}
- 产品展示重点：${shot.productVisible ? shot.productFocus || "严格按产品参考图展示目标产品" : "本镜头不展示目标产品"}

参考图职责：
${
    referenceInputSupported
        ? `${hasProductReferences ? `- ${productLabels}只控制目标产品的颜色、图案、版型、领口、袖型和可见细节；忽略这些产品图中人物的脸、发型和身份。` : "- 本镜头未提供产品参考图，因为目标产品尚未进入剧情；禁止自行生成、猜测或提前展示目标产品。"}
- ${characterLabel}是唯一主角身份基准。主角的脸、五官、发型、年龄感、肤色、体型和身材比例必须与${characterLabel}保持一致。
${hasPreviousFrame ? `- ${previousLabel}是上一成功故事板画面，只用于承接主角身份、场景、光线、人物位置和动作起点。本镜头状态锁要求换装或改变动作时，必须执行新状态，禁止照抄上一镜头的旧服装和旧动作。` : "- 本镜头没有上一画面参考，按分镜建立故事的初始状态。"}`
        : `- 当前图片渠道不支持参考图输入，本轮不生成无效角色基准，也不声称复制产品图或人物面孔。
- 本轮只验证剧情事件、动作、构图、服装文字描述和镜头顺序。必须完整重复上方人物、服装、产品和场景文字，不得依赖不存在的参考图。`
}

画面约束：
- 主角必须符合“${characterIdentity}”；配角按剧情真实出现，但不能替代主角。
- ${shot.productVisible ? "严格保持目标产品与产品参考图一致，不增加资料中没有确认的材质、功能、装饰或卖点。" : "保持剧本规定的旧衣或非产品服装状态，目标产品不得提前出现。"}
- 人物脸部、体型、场地结构和产品图案属于跨镜头不可变事实，不得为了构图、动作或所谓美化而重新设计。
- 产品可见时必须保持同一件衣服的图案几何关系；人物拉衣摆、转身、行走或抬手时，图案不得变大、变形、换位置、换方向或变成另一幅画。
- 环境证据和剧情证据必须画出来，不能只在提示词中提到；任何被剧本点名的沙发、桌子、杯子、手机、朋友、旁人反应或身体后果，都必须按本镜头字段实际可见。
- 画面必须表现一个明确、可见、可截图理解的剧情瞬间，不能只做无事件的站姿摆拍、正面服装展示或纯色墙前模特照。
- 图片是静态关键帧，只呈现运镜到达后的构图，不生成运动轨迹、多重残影、分屏或前后对比拼贴。
- 真实自然的手机短视频剧情摄影质感，像聚会或生活场景中被抓拍到的瞬间；保留生活杂物、空间深度和人物互动，不要过度干净的商业棚拍。
- 不生成字幕、Logo、水印、价格牌、平台界面或画面边框。

${shot.productVisible ? `产品外观事实（只控制服装细节，不得改变上方剧情、场景、道具、配角或构图）：\n${productBrief}` : "产品事实约束：本镜头处于产品揭晓前，不向图片模型提供目标产品外观资料；严格保持分镜规定的旧衣状态，禁止提前生成目标产品。"}`;
}

export function shotRoleLabel(role: EcommerceStoryboardShotRole) {
    return {
        hook: "开场钩子",
        reveal: "产品亮相",
        detail: "细节展示",
        cta: "行动指令",
        other: "过渡镜头",
    }[role];
}

export function hookDifficultyLabel(difficulty: EcommerceHookDifficulty) {
    return {
        low: "低",
        medium: "中",
        high: "高",
    }[difficulty];
}

function multimodalMessages(prompt: string, references: ReferenceImage[]): AiTextMessage[] {
    if (!references.length) return [{ role: "user", content: prompt }];
    return [
        {
            role: "user",
            content: [{ type: "text", text: prompt }, ...references.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

function normalizeShot(value: unknown, index: number): EcommerceStoryboardShot {
    const item = isRecord(value) ? value : {};
    const id = stringValue(item.id) || `S${String(index + 1).padStart(2, "0")}`;
    const role = normalizeRole(item.role);
    if (typeof item.productVisible !== "boolean") throw new Error(`分镜 ${id} 缺少布尔字段“productVisible”，请重新生成`);
    const minimumEnvironmentEvidence = role === "hook" ? 3 : role === "reveal" ? 2 : 1;
    const environmentEvidence = requiredShotStringArray(item.environmentEvidence, "environmentEvidence", id, minimumEnvironmentEvidence);
    const requiredVisualEvidence = requiredShotStringArray(item.requiredVisualEvidence, "requiredVisualEvidence", id, 3);
    const forbiddenVisuals = requiredShotStringArray(item.forbiddenVisuals, "forbiddenVisuals", id, 1);
    const garmentManipulationText = [stringValue(item.storyBeat), stringValue(item.characters), stringValue(item.visual), stringValue(item.imagePrompt), ...requiredVisualEvidence].join(" ");
    if (item.productVisible && /拉|扯|撑|展开|衣摆|侧缝|hem|pull|stretch|spread|side seam/i.test(garmentManipulationText)) {
        const geometryLocks = ["禁止把产品面料拉伸成弹力布，手部只能轻微移动衣摆或侧缝", "禁止放大、扭曲、重绘、复制或改变印花位置、比例、方向和形状"];
        for (const lock of geometryLocks) {
            if (!forbiddenVisuals.includes(lock)) forbiddenVisuals.push(lock);
        }
    }
    return {
        id,
        role,
        timeRange: stringValue(item.timeRange) || `${index * 2}-${index * 2 + 2}s`,
        durationSeconds: numberValue(item.durationSeconds) || 2,
        shotPurpose: requiredShotString(item.shotPurpose, "shotPurpose", id),
        storyBeat: requiredShotString(item.storyBeat || item.visual, "storyBeat", id),
        characterIdentity: requiredShotString(item.characterIdentity, "characterIdentity", id),
        characters: requiredShotString(item.characters, "characters", id),
        scene: requiredShotString(item.scene, "scene", id),
        environmentEvidence,
        compositionPlan: requiredShotString(item.compositionPlan, "compositionPlan", id),
        continuity: requiredShotString(item.continuity || (index === 0 ? "建立初始状态" : ""), "continuity", id),
        productVisible: item.productVisible,
        productProminence: normalizeProductProminence(item.productProminence, id),
        wardrobeState: requiredShotString(item.wardrobeState, "wardrobeState", id),
        requiredVisualEvidence,
        forbiddenVisuals,
        transitionAnchor: requiredShotString(item.transitionAnchor, "transitionAnchor", id),
        voiceover: stringValue(item.voiceover),
        onScreenText: stringValue(item.onScreenText),
        visual: requiredShotString(item.visual, "visual", id),
        camera: requiredShotString(item.camera, "camera", id),
        productFocus: normalizeProductFocus(item.productFocus, item.productVisible, role),
        imagePrompt: requiredShotString(item.imagePrompt, "imagePrompt", id),
    };
}

function validateStoryboardSequence(shots: EcommerceStoryboardShot[]) {
    if (shots[0]?.role !== "hook") throw new Error("分镜第一镜必须是可见事件钩子，请重新生成");
    const revealIndex = shots.findIndex((shot) => shot.role === "reveal");
    if (revealIndex < 0) throw new Error("分镜缺少明确的产品揭晓镜头，请重新生成");
    if (!shots[revealIndex].productVisible) throw new Error(`分镜 ${shots[revealIndex].id} 标记为产品揭晓，但 productVisible 仍为 false，请重新生成`);
    if (shots.at(-1)?.role !== "cta") throw new Error("分镜最后一镜必须执行行动指令，请重新生成");

    const detailBeforeReveal = shots.find((shot, index) => shot.role === "detail" && index < revealIndex);
    if (detailBeforeReveal) throw new Error(`分镜 ${detailBeforeReveal.id} 在产品揭晓前进入细节展示，请重新生成`);

    const revealShot = shots[revealIndex];
    const postRevealShots = shots.slice(revealIndex + 1, -1);
    const payoffEvidencePattern =
        /可见结果|动作成功|成功完成|重新完成|再次完成|同一动作|解决|没有卡住|不再卡|不再贴身|不再紧绷|不再受限|不受限制|毫无阻碍|顺利|顺畅|轻松(?:完成|脱下|抬手|举手|伸展|展开|活动|移动|拉|运动)|自由(?:活动|伸展|展开|抬臂|摆臂)|活动自如|动作自如|舒展|宽松空间|恢复动作|回到|继续行动|加入|走回|走进|穿过|通过入口|放行|点头|认可|惊讶|羡慕|让开|visible result|same action|problem solved|without getting stuck|without restriction|moves freely|moves with ease|successfully|returns?|walks? back|joins?|enters?|nods?|approves?|impressed|lets? him/i;
    const payoffActionPattern =
        /抬|举|伸|展开|张开|挥臂|摆臂|舞动|弯腰|下蹲|深蹲|投篮|运球|打球|运动|转体|扭身|拉|脱|穿|走|跑|跳|转身|完成|活动|移动|继续|进入|通过|点头|让开|lift|raise|reach|extend|spread|swing|dance|bend|squat|shoot|dribble|play|exercise|pull|remove|wear|walk|run|jump|turn|move|continue|enter|pass|nod/i;
    const explicitPayoffContractPattern = /再次执行开场动作|复现开场动作|repeats? the exact opening action/i;
    const stylingOnlyPattern = /戴.{0,6}(?:墨镜|帽子|项链)|整理.{0,6}(?:领口|衣服|袖口)|插兜|侧身站立|微笑看镜头|耍帅|静态展示|摆姿势|put(?:ting)? on sunglasses|adjust(?:ing)? the collar|hands? in pockets?|stands? sideways|fashion pose|posing/i;
    const shotText = (shot: EcommerceStoryboardShot) => `${shot.storyBeat} ${shot.characters} ${shot.shotPurpose} ${shot.requiredVisualEvidence.join(" ")} ${shot.visual} ${shot.imagePrompt}`;
    const carriesVisiblePayoff = (shot: EcommerceStoryboardShot | undefined) => {
        if (!shot?.productVisible || shot.role === "detail") return false;
        const text = shotText(shot);
        return payoffActionPattern.test(text) && (explicitPayoffContractPattern.test(text) || payoffEvidencePattern.test(text));
    };
    const firstPostRevealShot = postRevealShots[0];
    const revealCarriesPayoff = carriesVisiblePayoff(revealShot);
    const firstPostRevealCarriesPayoff = carriesVisiblePayoff(firstPostRevealShot);
    if (!revealCarriesPayoff && !firstPostRevealCarriesPayoff) {
        throw new Error(`分镜 ${revealShot.id}${firstPostRevealShot ? ` 和 ${firstPostRevealShot.id}` : ""} 都没有完成开场问题的可见解决动作；请在产品揭晓镜头直接复现开场动作，或让紧随其后的第一镜完成，不能先摆拍或展示细节`);
    }

    const stylingOnlyShots = postRevealShots.filter((shot) => {
        const text = shotText(shot);
        return stylingOnlyPattern.test(text) && !carriesVisiblePayoff(shot);
    });
    if (stylingOnlyShots.length > 1) {
        throw new Error(`分镜 ${stylingOnlyShots.map((shot) => shot.id).join("、")} 都是纯造型整理或静态摆拍；产品揭晓后最多保留一个此类镜头，其余必须推进剧情`);
    }

    const characterIdentities = new Set(shots.map((shot) => shot.characterIdentity.trim()));
    if (characterIdentities.size > 1) throw new Error("所有分镜必须逐字使用同一个 characterIdentity，不能在不同镜头改写主角身份");

    const primaryProductShots = shots.filter((shot) => shot.productProminence === "primary");
    if (primaryProductShots.length > 2) throw new Error(`分镜 ${primaryProductShots.map((shot) => shot.id).join("、")} 都把产品设为主视觉，剧情已退化为连续服装广告；primary 最多 2 镜`);

    for (const shot of shots) {
        if (!shot.productVisible && shot.productProminence !== "none") throw new Error(`分镜 ${shot.id} 的产品不可见，但 productProminence 不是 none，请重新生成`);
        if (shot.productVisible && shot.productProminence === "none") throw new Error(`分镜 ${shot.id} 的产品已经入镜，但 productProminence 仍为 none，请重新生成`);
    }

    const hookShot = shots[0];
    const environmentPattern =
        /沙发|桌|杯|饮料|聚会|派对|夜店|入口|门口|霓虹|朋友|旁人|群演|客厅|餐厅|酒吧|咖啡|街|公园|运动场|球场|健身房|体育馆|商场|办公室|教室|卧室|门|窗|货架|车辆|房间|室内|室外|背景|前景|中景|后景|灯光|家具|道具|人群|顾客|路人|同事|家人|party|club|entrance|neon|sofa|couch|table|cup|drink|friend|crowd|street|park|sports court|court|gym|stadium|room|indoor|outdoor|background|foreground|midground|prop/i;
    const hookEnvironmentText = `${hookShot.scene} ${hookShot.environmentEvidence.join(" ")} ${hookShot.compositionPlan}`;
    if (!environmentPattern.test(hookEnvironmentText)) throw new Error(`分镜 ${hookShot.id} 没有可见场景、道具或配角证据，不能用孤立人物替代剧情现场`);
    const isolatedAdPattern = /纯色背景|简洁背景|单色墙|摄影棚|棚拍|孤立模特|服装目录|plain background|studio portrait|fashion catalog|isolated model/i;
    if (isolatedAdPattern.test(`${hookShot.visual} ${hookShot.imagePrompt} ${hookShot.compositionPlan}`)) throw new Error(`分镜 ${hookShot.id} 被写成棚拍或服装目录构图，开场必须优先呈现剧情场景`);

    const ctaShot = shots[shots.length - 1];
    if (ctaShot.productProminence !== "secondary") throw new Error(`分镜 ${ctaShot.id} 的 CTA 必须让产品自然穿在人物身上并保留场景，productProminence 应为 secondary`);

    let consecutiveDetails = 0;
    for (const shot of shots) {
        consecutiveDetails = shot.role === "detail" ? consecutiveDetails + 1 : 0;
        if (consecutiveDetails > 1) throw new Error(`分镜 ${shot.id} 连续使用纯细节镜头，主角和剧情推进已中断，请重新生成`);
    }

    const faceAbsentPattern = /不露脸|脸部不可见|不出现脸|仅躯干|只有躯干|胸口特写|局部特写|no face|face not visible|only torso|torso only/i;
    const faceAbsentShots = shots.filter((shot) => faceAbsentPattern.test(`${shot.characters} ${shot.visual} ${shot.imagePrompt}`));
    if (faceAbsentShots.length > 1) throw new Error(`分镜 ${faceAbsentShots.map((shot) => shot.id).join("、")} 连续弱化或移除主角，无法形成可读剧情，请重新生成`);

    const specialViewPattern = /第一人称|主观镜头|POV|镜中自拍|镜子自拍|mirror selfie|first-person/i;
    const specialViewShots = shots.filter((shot) => specialViewPattern.test(`${shot.camera} ${shot.visual} ${shot.imagePrompt}`));
    if (specialViewShots.length > 1) throw new Error(`分镜 ${specialViewShots.map((shot) => shot.id).join("、")} 反复切换第一人称或镜面视角，画面连续性不足，请重新生成`);

    const ctaAction = `${ctaShot.storyBeat} ${ctaShot.characters} ${ctaShot.visual} ${ctaShot.requiredVisualEvidence.join(" ")}`;
    const ctaActionPattern = /指向|点击|下方|链接|购物|购买|加入购物车|point(?:ing)?|tap|click|link|shop|buy/i;
    if (!ctaActionPattern.test(ctaAction)) throw new Error(`分镜 ${ctaShot.id} 的人物动作没有真正执行 CTA，请明确指向下方、链接或购买入口后重新生成`);
}

function validateScriptVisualCoverage(shots: EcommerceStoryboardShot[], sourceScript: string) {
    const script = sourceScript.trim();
    if (!script) return;

    const revealIndex = shots.findIndex((shot) => shot.role === "reveal");
    const setupShots = shots.slice(0, revealIndex > 0 ? revealIndex : Math.min(2, shots.length));
    const setupVisualText = setupShots.map((shot) => [shot.storyBeat, shot.characters, shot.scene, shot.environmentEvidence.join(" "), shot.compositionPlan, shot.requiredVisualEvidence.join(" "), shot.visual, shot.imagePrompt].join(" ")).join(" ");
    const requiredSetupCues: Array<{ label: string; sourcePattern: RegExp; shotPattern: RegExp }> = [
        {
            label: "聚会或社交现场",
            sourcePattern: /聚会|派对|社交场景|party|social gathering/i,
            shotPattern: /聚会|派对|社交现场|朋友聚集|party|social gathering/i,
        },
        {
            label: "沙发",
            sourcePattern: /沙发|sofa|couch/i,
            shotPattern: /沙发|sofa|couch/i,
        },
        {
            label: "桌子或桌面",
            sourcePattern: /桌子|桌面|桌旁|茶几|table|coffee table/i,
            shotPattern: /桌子|桌面|桌旁|茶几|table|coffee table/i,
        },
        {
            label: "饮料杯",
            sourcePattern: /饮料杯|饮料|杯子|水杯|酒杯|drink|cup|glass/i,
            shotPattern: /饮料杯|饮料|杯子|水杯|酒杯|drink|cup|glass/i,
        },
        {
            label: "抬手或伸手拿饮料",
            sourcePattern: /抬手.{0,12}(?:饮料|杯)|伸手.{0,12}(?:饮料|杯)|拿.{0,12}(?:饮料|杯)|reach.{0,20}(?:drink|cup|glass)/i,
            shotPattern: /抬手.{0,12}(?:饮料|杯)|伸手.{0,12}(?:饮料|杯)|拿.{0,12}(?:饮料|杯)|reach.{0,20}(?:drink|cup|glass)/i,
        },
        {
            label: "衣服上缩并露出肚子",
            sourcePattern: /(?:衣服|T恤|上衣).{0,15}(?:上缩|卷起|掀起).{0,15}(?:肚子|腹部)|露出.{0,8}(?:肚子|腹部)|shirt.{0,20}(?:rides up|lifts).{0,20}(?:belly|stomach)|exposed belly/i,
            shotPattern: /(?:衣服|T恤|上衣).{0,15}(?:上缩|卷起|掀起).{0,15}(?:肚子|腹部)|露出.{0,8}(?:肚子|腹部)|shirt.{0,20}(?:rides up|lifts).{0,20}(?:belly|stomach)|exposed belly/i,
        },
        {
            label: "向下拉旧衣下摆",
            sourcePattern: /(?:向下|往下).{0,8}拉.{0,12}(?:衣服|T恤|下摆)|拉.{0,8}(?:衣服|T恤).{0,8}下摆|pull.{0,15}(?:shirt|tee).{0,12}(?:down|hem)|pulling down the hem/i,
            shotPattern: /(?:向下|往下).{0,8}拉.{0,12}(?:衣服|T恤|下摆)|拉.{0,8}(?:衣服|T恤).{0,8}下摆|pull.{0,15}(?:shirt|tee).{0,12}(?:down|hem)|pulling down the hem/i,
        },
        {
            label: "朋友或旁人侧目反应",
            sourcePattern: /侧目|异样.{0,8}目光|投来.{0,8}目光|朋友.{0,16}(?:看|注视|反应)|周围人.{0,16}(?:看|注视|反应)|friends?.{0,24}(?:glance|look|stare)/i,
            shotPattern: /侧目|异样.{0,8}目光|投来.{0,8}目光|朋友.{0,16}(?:看|注视|反应)|周围人.{0,16}(?:看|注视|反应)|背景.{0,12}(?:朋友|人群).{0,16}(?:看|注视|反应)|friends?.{0,24}(?:glance|look|stare)/i,
        },
    ];

    const missingCues = requiredSetupCues.filter((cue) => cue.sourcePattern.test(script) && !cue.shotPattern.test(setupVisualText)).map((cue) => cue.label);
    if (missingCues.length) {
        throw new Error(`分镜没有把原剧本的开场事实画出来，缺少：${missingCues.join("、")}。请保留场景、道具、旁人反应和动作后果后重新生成`);
    }
}

function normalizeHookOption(value: unknown, index: number): EcommerceHookOption {
    const item = isRecord(value) ? value : {};
    return {
        id: String.fromCharCode(65 + index),
        title: requiredString(item.title, "方案标题"),
        angle: requiredString(item.angle, "创意角度"),
        firstSecondVisual: requiredString(item.firstSecondVisual, "第一秒画面"),
        concreteIncident: requiredString(item.concreteIncident, "具体事件"),
        stakes: requiredString(item.stakes, "风险/后果"),
        productEntryAction: requiredString(item.productEntryAction, "产品入场动作"),
        visiblePayoff: requiredString(item.visiblePayoff, "可见结果"),
        hookLine: stringValue(item.hookLine),
        productionDifficulty: normalizeDifficulty(item.productionDifficulty),
        requiredAssets: requiredStringArray(item.requiredAssets),
        whyItWorks: requiredString(item.whyItWorks, "有效原因"),
    };
}

function normalizeRole(value: unknown): EcommerceStoryboardShotRole {
    const role = stringValue(value).toLowerCase();
    if (role === "hook" || role === "reveal" || role === "detail" || role === "cta") return role;
    return "other";
}

function normalizeProductProminence(value: unknown, shotId: string): EcommerceStoryboardProductProminence {
    const prominence = stringValue(value).toLowerCase();
    if (prominence === "none" || prominence === "secondary" || prominence === "primary") return prominence;
    throw new Error(`分镜 ${shotId} 缺少有效的“productProminence”，只能是 none、secondary 或 primary`);
}

function inferProductProminence(shot: Pick<EcommerceStoryboardShot, "productVisible" | "role">): EcommerceStoryboardProductProminence {
    if (!shot.productVisible) return "none";
    if (shot.role === "reveal" || shot.role === "detail") return "primary";
    return "secondary";
}

function normalizeProductFocus(value: unknown, productVisible: boolean, role: EcommerceStoryboardShotRole) {
    const productFocus = stringValue(value);
    if (!productVisible) return productFocus;
    if (productFocus && !/^(?:无|没有|none|n\/a|not applicable|待补充)$/i.test(productFocus)) return productFocus;
    if (role === "reveal") return "目标产品完整关键外观与换装后的可见结果，严格依据产品参考图和已确认产品资料";
    if (role === "detail") return "目标产品在本镜头中的可见外观或版型细节，严格依据产品参考图和已确认产品资料";
    return "目标产品作为人物穿着或剧情道具自然出现，严格依据产品参考图和已确认产品资料";
}

function productProminenceLabel(prominence: EcommerceStoryboardProductProminence) {
    return {
        none: "不出现产品，剧情与场景完全优先",
        secondary: "产品作为人物穿着或剧情道具自然出现，不能主导画面",
        primary: "产品或转场动作是本镜重点，但仍须保留人物和场景上下文",
    }[prominence];
}

function normalizeDifficulty(value: unknown): EcommerceHookDifficulty {
    const difficulty = stringValue(value).toLowerCase();
    if (difficulty === "medium" || difficulty === "high") return difficulty;
    return "low";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function requiredString(value: unknown, field: string) {
    const result = stringValue(value);
    if (!result) throw new Error(`钩子方案缺少“${field}”，请重新生成`);
    return result;
}

function stringArray(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map(stringValue).filter(Boolean);
}

function storyboardStringArray(value: unknown) {
    const seen = new Set<string>();
    return stringArray(value)
        .flatMap((item) => item.split(/[\n；;、]+/))
        .map((item) => item.trim())
        .filter((item) => {
            const key = item.toLocaleLowerCase();
            if (!item || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function requiredStringArray(value: unknown) {
    const result = stringArray(value);
    if (!result.length) throw new Error("钩子方案缺少“所需素材”，请重新生成");
    return result;
}

function requiredShotString(value: unknown, field: string, shotId: string) {
    const result = stringValue(value);
    if (!result || /^(?:无|没有|none|n\/a|not applicable|待补充)$/i.test(result)) throw new Error(`分镜 ${shotId} 缺少有效的“${field}”，请重新生成`);
    return result;
}

function requiredShotStringArray(value: unknown, field: string, shotId: string, minimum: number) {
    const result = storyboardStringArray(value);
    if (result.length < minimum) throw new Error(`分镜 ${shotId} 的“${field}”至少需要 ${minimum} 项，请重新生成`);
    return result;
}

function numberValue(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}
