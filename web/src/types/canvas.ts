export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Group = "group",
}

// 节点类型放开为字符串,内置类型用 CanvasNodeType,插件类型为 "<pluginId>:<name>"
export type CanvasNodeTypeId = CanvasNodeType | (string & {});

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";
export type CanvasWorkflowKind = "reference-analysis" | "product-brief" | "hook-options" | "sales-script" | "storyboard" | "character-reference" | "storyboard-frame" | "test-frame";
export type CanvasTestFrameReviewStatus = "pending" | "kept" | "approved";
export type CanvasStoryboardImageReviewStatus = "pending" | "approved";
export type EcommerceHookDifficulty = "low" | "medium" | "high";

export type EcommerceProductBrief = {
    productName: string;
    sku?: string;
    category: string;
    market: string;
    platform: string;
    audience: string;
    language: string;
    videoDuration: string;
    sellingPoints: string;
    offer?: string;
    cta?: string;
    prohibitedClaims?: string;
    visualRequirements?: string;
};

export type EcommerceProductReference = {
    id: string;
    name: string;
    url: string;
    storageKey: string;
    mimeType: string;
};

export type EcommerceHookOption = {
    id: string;
    title: string;
    angle: string;
    firstSecondVisual: string;
    concreteIncident: string;
    stakes: string;
    productEntryAction: string;
    visiblePayoff: string;
    hookLine: string;
    productionDifficulty: EcommerceHookDifficulty;
    requiredAssets: string[];
    whyItWorks: string;
};

export type EcommerceStoryboardShotRole = "hook" | "reveal" | "detail" | "cta" | "other";
export type EcommerceStoryboardProductProminence = "none" | "secondary" | "primary";
export type StoryboardGenerationPhase = "queued" | "generating" | "saving" | "retrying";

export type EcommerceStoryboardShot = {
    id: string;
    role: EcommerceStoryboardShotRole;
    timeRange: string;
    durationSeconds: number;
    shotPurpose: string;
    storyBeat: string;
    characterIdentity: string;
    characters: string;
    scene: string;
    environmentEvidence: string[];
    compositionPlan: string;
    continuity: string;
    productVisible: boolean;
    productProminence: EcommerceStoryboardProductProminence;
    wardrobeState: string;
    requiredVisualEvidence: string[];
    forbiddenVisuals: string[];
    transitionAnchor: string;
    voiceover: string;
    onScreenText: string;
    visual: string;
    camera: string;
    productFocus: string;
    imagePrompt: string;
};

export type CanvasNodeMetadata = {
    content?: string;
    composerContent?: string;
    prompt?: string;
    background?: string;
    interactive?: boolean;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    size?: string;
    quality?: string;
    count?: number;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    analysisModel?: string;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    groupId?: string;
    workflowKind?: CanvasWorkflowKind;
    workflowParentId?: string;
    referenceAnalysisNodeId?: string;
    productBriefNodeId?: string;
    productBrief?: EcommerceProductBrief;
    productReferenceImages?: EcommerceProductReference[];
    hookOptionsNodeId?: string;
    hookOptions?: EcommerceHookOption[];
    selectedHookId?: string;
    hookOption?: EcommerceHookOption;
    storyboardShots?: EcommerceStoryboardShot[];
    storyboardNodeId?: string;
    storyboardVersion?: number;
    storyboardFrameIndex?: number;
    storyboardShotId?: string;
    storyboardShotRole?: EcommerceStoryboardShotRole;
    storyboardProductVisible?: boolean;
    characterReferenceNodeId?: string;
    previousStoryboardFrameNodeId?: string;
    storyboardImageReviewStatus?: CanvasStoryboardImageReviewStatus;
    storyboardDisplaySizeVersion?: number;
    storyboardGenerationPhase?: StoryboardGenerationPhase;
    storyboardGenerationQueuedAt?: number;
    storyboardGenerationStartedAt?: number;
    storyboardGenerationAttempt?: number;
    storyboardGenerationRetryDelayMs?: number;
    storyboardGenerationElapsedMs?: number;
    storyboardReferenceInputSupported?: boolean;
    testFrameReviewStatus?: CanvasTestFrameReviewStatus;
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    references?: CanvasAssistantReference[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
