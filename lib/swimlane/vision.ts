import { generateText, streamText } from "ai"
import { getAIModel, supportsImageInput } from "@/lib/ai-providers"

export interface VisionImage {
    /** MIME type like 'image/png' or 'image/jpeg' */
    mediaType: string
    /** Base64 string without data url prefix */
    base64: string
}

export const VISION_SYSTEM_PROMPT = `你是流程图视觉分析助手。用户提交了一张手绘的流程图(可能是二维矩阵泳道图,也可能是普通流程草图)。
请按以下固定模板输出(纯文本,不要 Markdown,不要任何解释):

【角色候选】纵轴/泳道行,1-10 个,逗号分隔
【阶段候选】横轴/列,1-10 个,逗号分隔。若图里没有明显的列分组,写:未识别
【节点清单】每行一条格式:动作描述 | 角色 | 阶段 | 类型(start/end/task/decision 之一)
【连线】每行一条格式:来源动作 → 去向动作 | 条件标签(无条件则省略竖线和条件)
【业务规则线索】从图上的标注/箭头标签里能看出的硬约束,每条一句,最多 5 条;没有写:无
【整体可信度】高/中/低 加一句原因,例如:低 — 字迹模糊,部分节点无法辨认

约束:
- 只描述图里实际看到的内容,不要脑补或推断
- 字迹辨认不清的地方写(辨认不清)
- 不要输出 JSON,不要输出 Markdown 标题或列表符号
- 严格按上述六段模板输出,每段占一行或多行`

/**
 * 流式分析手绘流程图图片
 */
export function streamAnalyzeFlowchartImages(
    images: VisionImage[],
    mainModelConfig: any,
    userText?: string,
) {
    if (images.length === 0) {
        throw new Error("streamAnalyzeFlowchartImages: images 不能为空")
    }

    let modelConfig: any = null
    const visionModelId = process.env.VISION_MODEL

    // 1. 优先使用指定的 VISION_MODEL
    if (visionModelId) {
        console.log(
            `[Vision] Found VISION_MODEL: ${visionModelId}. Instantiating...`,
        )
        try {
            const provider =
                process.env.VISION_PROVIDER || mainModelConfig.provider
            modelConfig = getAIModel({
                modelId: visionModelId,
                provider: provider,
            })
        } catch (e) {
            console.error(
                `[Vision] Failed to initialize designated VISION_MODEL:`,
                e,
            )
        }
    }

    // 2. 如果没有配置 VISION_MODEL，Fallback 复用主多模态大模型
    if (!modelConfig) {
        if (supportsImageInput(mainModelConfig.modelId)) {
            console.log(
                `[Vision] Fallback: Reusing main vision-capable model: ${mainModelConfig.modelId}`,
            )
            modelConfig = mainModelConfig
        }
    }

    // 3. 如果都不可用，报错提示用户配置
    if (!modelConfig) {
        throw new Error(
            "当前选用的主模型不支持图片输入，且未配置有效的 VISION_MODEL。请在设置中切换为多模态模型（如 GPT-4o, Claude 3.5）或在环境变量中配置 VISION_MODEL。",
        )
    }

    // 构造 Vercel AI SDK 的多模态内容格式
    const imageParts = images.map((img) => ({
        type: "image" as const,
        image: img.base64,
        mimeType: img.mediaType,
    }))

    const textPart = {
        type: "text" as const,
        text: `用户描述: ${userText?.trim() || "(未提供文字说明)"}`,
    }

    const messages = [
        {
            role: "user" as const,
            content: [...imageParts, textPart],
        },
    ]

    console.log(
        `[Vision] Starting stream flowchart visual analysis with model: ${modelConfig.modelId}`,
    )

    return streamText({
        model: modelConfig.model,
        system: VISION_SYSTEM_PROMPT,
        messages,
        headers: modelConfig.headers,
    })
}

/**
 * 分析手绘流程图图片：
 * 依据智能 Fallback 机制获取视觉大模型实例进行识别。
 *
 * @param images 图片数组
 * @param mainModelConfig 当前主模型配置，用于 Fallback 或者继承 credentials
 * @param userText 用户附带的文字描述
 */
export async function analyzeFlowchartImages(
    images: VisionImage[],
    mainModelConfig: any,
    userText?: string,
): Promise<{ description: string }> {
    if (images.length === 0) {
        throw new Error("analyzeFlowchartImages: images 不能为空")
    }

    let modelConfig: any = null
    const visionModelId = process.env.VISION_MODEL

    // 1. 优先使用指定的 VISION_MODEL
    if (visionModelId) {
        console.log(
            `[Vision] Found VISION_MODEL: ${visionModelId}. Instantiating...`,
        )
        try {
            const provider =
                process.env.VISION_PROVIDER || mainModelConfig.provider
            modelConfig = getAIModel({
                modelId: visionModelId,
                provider: provider,
            })
        } catch (e) {
            console.error(
                `[Vision] Failed to initialize designated VISION_MODEL:`,
                e,
            )
        }
    }

    // 2. 如果没有配置 VISION_MODEL，Fallback 复用主多模态大模型
    if (!modelConfig) {
        if (supportsImageInput(mainModelConfig.modelId)) {
            console.log(
                `[Vision] Fallback: Reusing main vision-capable model: ${mainModelConfig.modelId}`,
            )
            modelConfig = mainModelConfig
        }
    }

    // 3. 如果都不可用，报错提示用户配置
    if (!modelConfig) {
        throw new Error(
            "当前选用的主模型不支持图片输入，且未配置有效的 VISION_MODEL。请在设置中切换为多模态模型（如 GPT-4o, Claude 3.5）或在环境变量中配置 VISION_MODEL。",
        )
    }

    // 构造 Vercel AI SDK 的多模态内容格式
    const imageParts = images.map((img) => ({
        type: "image" as const,
        image: img.base64,
        mimeType: img.mediaType,
    }))

    const textPart = {
        type: "text" as const,
        text: `用户描述: ${userText?.trim() || "(未提供文字说明)"}`,
    }

    const messages = [
        {
            role: "user" as const,
            content: [...imageParts, textPart],
        },
    ]

    console.log(
        `[Vision] Starting flowchart visual analysis with model: ${modelConfig.modelId}`,
    )

    const response = await generateText({
        model: modelConfig.model,
        system: VISION_SYSTEM_PROMPT,
        messages,
        headers: modelConfig.headers,
    })

    const raw = response.text?.trim() ?? ""
    if (!raw) {
        throw new Error(`视觉模型 (${modelConfig.modelId}) 返回了空内容`)
    }

    return { description: raw }
}
