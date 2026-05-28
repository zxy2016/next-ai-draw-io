import {
    APICallError,
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    InvalidToolInputError,
    LoadAPIKeyError,
    stepCountIs,
    streamText,
} from "ai"
import { jsonrepair } from "jsonrepair"
import {
    getAIModel,
    SINGLE_SYSTEM_PROVIDERS,
    supportsImageInput,
    supportsPromptCaching,
} from "@/lib/ai-providers"
import { findCachedResponse } from "@/lib/cached-responses"
import {
    isMinimalDiagram,
    replaceHistoricalToolInputs,
    validateFileParts,
} from "@/lib/chat-helpers"
import {
    checkAndIncrementRequest,
    isQuotaEnabled,
    recordTokenUsage,
} from "@/lib/dynamo-quota-manager"
import {
    getTelemetryConfig,
    setTraceInput,
    setTraceOutput,
    wrapWithObserve,
} from "@/lib/langfuse"
import { findServerModelById } from "@/lib/server-model-config"
import {
    analyzeFlowchartImages,
    streamAnalyzeFlowchartImages,
} from "@/lib/swimlane/vision"
import { getSystemPromptForMode } from "@/lib/system-prompts"
import { getToolsForMode, parseFlowMode } from "@/lib/tools"
import { getUserIdFromRequest } from "@/lib/user-id"

export const maxDuration = 120

// Helper function to create cached stream response
function createCachedStreamResponse(xml: string): Response {
    const toolCallId = `cached-${Date.now()}`

    const stream = createUIMessageStream({
        execute: async ({ writer }) => {
            writer.write({ type: "start" })
            writer.write({
                type: "tool-input-start",
                toolCallId,
                toolName: "display_diagram",
            })
            writer.write({
                type: "tool-input-delta",
                toolCallId,
                inputTextDelta: xml,
            })
            writer.write({
                type: "tool-input-available",
                toolCallId,
                toolName: "display_diagram",
                input: { xml },
            })
            writer.write({ type: "finish" })
        },
    })

    return createUIMessageStreamResponse({ stream })
}

// Inner handler function
async function handleChatRequest(req: Request): Promise<Response> {
    // Check for access code
    const accessCodes =
        process.env.ACCESS_CODE_LIST?.split(",")
            .map((code) => code.trim())
            .filter(Boolean) || []
    if (accessCodes.length > 0) {
        const accessCodeHeader = req.headers.get("x-access-code")
        if (!accessCodeHeader || !accessCodes.includes(accessCodeHeader)) {
            return Response.json(
                {
                    error: "Invalid or missing access code. Please configure it in Settings.",
                },
                { status: 401 },
            )
        }
    }

    const body = await req.json()
    const { messages, xml, previousXml, sessionId } = body
    const customSystemMessage =
        typeof body.customSystemMessage === "string"
            ? body.customSystemMessage.slice(0, 5000)
            : ""

    // Get user ID for Langfuse tracking and quota
    const userId = getUserIdFromRequest(req)

    // Validate sessionId for Langfuse (must be string, max 200 chars)
    const validSessionId =
        sessionId && typeof sessionId === "string" && sessionId.length <= 200
            ? sessionId
            : undefined

    // Extract user input text for Langfuse trace
    // Find the last USER message, not just the last message (which could be assistant in multi-step tool flows)
    const lastUserMessage = [...messages]
        .reverse()
        .find((m: any) => m.role === "user")
    const userInputText =
        lastUserMessage?.parts?.find((p: any) => p.type === "text")?.text || ""

    // Update Langfuse trace with input, session, and user
    setTraceInput({
        input: userInputText,
        sessionId: validSessionId,
        userId: userId,
    })

    // === SERVER-SIDE QUOTA CHECK START ===
    // Quota is opt-in: only enabled when DYNAMODB_QUOTA_TABLE env var is set
    const hasOwnApiKey = !!(
        req.headers.get("x-ai-provider") &&
        (req.headers.get("x-ai-api-key") ||
            req.headers.get("x-aws-access-key-id") ||
            req.headers.get("x-vertex-api-key"))
    )

    // Skip quota check if: quota disabled, user has own API key, or is anonymous
    if (isQuotaEnabled() && !hasOwnApiKey && userId !== "anonymous") {
        const quotaCheck = await checkAndIncrementRequest(userId, {
            requests: Number(process.env.DAILY_REQUEST_LIMIT) || 10,
            tokens: Number(process.env.DAILY_TOKEN_LIMIT) || 200000,
            tpm: Number(process.env.TPM_LIMIT) || 20000,
        })
        if (!quotaCheck.allowed) {
            return Response.json(
                {
                    error: quotaCheck.error,
                    type: quotaCheck.type,
                    used: quotaCheck.used,
                    limit: quotaCheck.limit,
                },
                { status: 429 },
            )
        }
    }
    // === SERVER-SIDE QUOTA CHECK END ===

    // === FILE VALIDATION START ===
    const fileValidation = validateFileParts(messages)
    if (!fileValidation.valid) {
        return Response.json({ error: fileValidation.error }, { status: 400 })
    }
    // === FILE VALIDATION END ===

    // === FLOW MODE START ===
    // 'free' (default generic draw.io) or 'swimlane' (IR-driven 2D matrix).
    // 必须在 CACHE CHECK 之前解析 —— swimlane mode 要跳过 cache(避免命中
    // free mode 的预生成 demo XML,语义不一致)。
    const flowMode = parseFlowMode(req.headers.get("x-flow-mode"))
    // === FLOW MODE END ===

    // === CACHE CHECK START ===
    // Swimlane mode 的输出是 IR 工具调用,与 cached display_diagram XML 不兼容,
    // 同时也希望保留 IR self-healing 体验(不被预生成示例打断)
    const isFirstMessage = messages.length === 1
    const isEmptyDiagram = !xml || xml.trim() === "" || isMinimalDiagram(xml)

    if (flowMode === "free" && isFirstMessage && isEmptyDiagram) {
        const lastMessage = messages[0]
        const textPart = lastMessage.parts?.find((p: any) => p.type === "text")
        const filePart = lastMessage.parts?.find((p: any) => p.type === "file")

        const cached = findCachedResponse(textPart?.text || "", !!filePart)

        if (cached) {
            return createCachedStreamResponse(cached.xml)
        }
    }
    // === CACHE CHECK END ===

    // Read client AI provider overrides from headers
    const provider = req.headers.get("x-ai-provider")
    let baseUrl = req.headers.get("x-ai-base-url")
    const selectedModelId = req.headers.get("x-selected-model-id")

    // For EdgeOne provider, construct full URL from request origin
    // because createOpenAI needs absolute URL, not relative path
    if (provider === "edgeone" && !baseUrl) {
        const origin = req.headers.get("origin") || new URL(req.url).origin
        baseUrl = `${origin}/api/edgeai`
    }

    // Get cookie header for EdgeOne authentication (eo_token, eo_time)
    const cookieHeader = req.headers.get("cookie")

    // Check if this is a server model with custom env var names
    let serverModelConfig: {
        apiKeyEnv?: string | string[]
        baseUrlEnv?: string
        provider?: string
    } = {}
    if (selectedModelId?.startsWith("server:")) {
        const serverModel = await findServerModelById(selectedModelId)
        console.log(
            `[Server Model Lookup] ID: ${selectedModelId}, Found: ${!!serverModel}, Provider: ${serverModel?.provider}`,
        )
        if (serverModel) {
            serverModelConfig = {
                apiKeyEnv: serverModel.apiKeyEnv,
                baseUrlEnv: serverModel.baseUrlEnv,
                // Use actual provider from config (client header may have incorrect value due to ID format change)
                provider: serverModel.provider,
            }
        }
    }

    const clientOverrides = {
        // Server model provider takes precedence over client header
        provider: serverModelConfig.provider || provider,
        baseUrl,
        apiKey: req.headers.get("x-ai-api-key"),
        modelId: req.headers.get("x-ai-model"),
        // AWS Bedrock credentials
        awsAccessKeyId: req.headers.get("x-aws-access-key-id"),
        awsSecretAccessKey: req.headers.get("x-aws-secret-access-key"),
        awsRegion: req.headers.get("x-aws-region"),
        awsSessionToken: req.headers.get("x-aws-session-token"),
        // Server model custom env var names
        ...serverModelConfig,
        // Vertex AI credentials (Express Mode)
        vertexApiKey: req.headers.get("x-vertex-api-key"),
        // Pass cookies for EdgeOne Pages authentication
        ...(provider === "edgeone" &&
            cookieHeader && {
                headers: { cookie: cookieHeader },
            }),
    }

    // Read minimal style preference from header
    const minimalStyle = req.headers.get("x-minimal-style") === "true"

    console.log(
        `[Client Overrides] provider: ${clientOverrides.provider}, modelId: ${clientOverrides.modelId}, flowMode: ${flowMode}`,
    )

    // Get AI model with optional client overrides
    const {
        model,
        providerOptions,
        headers,
        modelId,
        provider: resolvedProvider,
    } = getAIModel(clientOverrides)

    // Check if model supports prompt caching
    const shouldCache = supportsPromptCaching(modelId)
    console.log(
        `[Prompt Caching] ${shouldCache ? "ENABLED" : "DISABLED"} for model: ${modelId}`,
    )

    // Get the appropriate system prompt based on model (extended for Opus/Haiku 4.5)
    const systemMessage = getSystemPromptForMode(
        flowMode,
        modelId,
        minimalStyle,
    )
    const finalSystemMessage = customSystemMessage
        ? `${systemMessage}\n\n## Custom Instructions\n${customSystemMessage}`
        : systemMessage

    // Extract file parts (images) from the last user message
    const fileParts =
        lastUserMessage?.parts?.filter((part: any) => part.type === "file") ||
        []

    // 双阶段图片处理逻辑
    const hasImages = fileParts.length > 0
    let imagesToAnalyze: any[] = []

    if (hasImages) {
        const hasVisionModel = !!process.env.VISION_MODEL
        if (!hasVisionModel && !supportsImageInput(modelId)) {
            return Response.json(
                {
                    error: `当前选用的模型 "${modelId}" 不支持图片输入。请在设置中切换到多模态模型（如 GPT-4o, Claude 3.5），或者配置环境变量 VISION_MODEL。`,
                },
                { status: 400 },
            )
        }

        // 将 fileParts 转换为 analyzeFlowchartImages 接受的格式
        imagesToAnalyze = fileParts.map((part: any) => {
            const base64Data = part.url.split(",")[1] || ""
            const mimeType = part.mediaType || "image/jpeg"
            return {
                mediaType: mimeType,
                base64: base64Data,
            }
        })
    }

    // SUGGEST_REPLIES STRIPPING 保持不变，供后续使用
    const messagesWithoutSuggestReplies = messages.map((msg: any) => {
        if (!msg.parts || !Array.isArray(msg.parts)) return msg
        const filteredParts = msg.parts.filter((part: any) => {
            if (part.type === "tool-invocation") {
                const toolName = part.toolInvocation?.toolName || part.toolName
                if (toolName === "suggest_replies") return false
            }
            return true
        })
        return { ...msg, parts: filteredParts }
    })

    const modelMessages = await convertToModelMessages(
        messagesWithoutSuggestReplies,
    )

    console.log("[route.ts] Incoming messages count:", messages.length)

    const enableHistoryReplace =
        flowMode === "free" && process.env.ENABLE_HISTORY_XML_REPLACE === "true"
    const placeholderMessages = enableHistoryReplace
        ? replaceHistoricalToolInputs(modelMessages)
        : modelMessages

    let enhancedMessages = placeholderMessages.filter(
        (msg: any) =>
            msg.content && Array.isArray(msg.content) && msg.content.length > 0,
    )

    enhancedMessages = enhancedMessages
        .map((msg: any) => {
            if (!msg.content || !Array.isArray(msg.content)) {
                return msg
            }
            const filteredContent = msg.content.filter((part: any) => {
                if (part.type === "tool-call") {
                    if (
                        !part.input ||
                        typeof part.input !== "object" ||
                        Object.keys(part.input).length === 0
                    ) {
                        console.warn(
                            `[route.ts] Filtering out tool-call with invalid input:`,
                            { toolName: part.toolName, input: part.input },
                        )
                        return false
                    }
                }
                return true
            })
            return { ...msg, content: filteredContent }
        })
        .filter((msg: any) => msg.content && msg.content.length > 0)

    if (shouldCache && enhancedMessages.length >= 2) {
        for (let i = enhancedMessages.length - 2; i >= 0; i--) {
            if (enhancedMessages[i].role === "assistant") {
                enhancedMessages[i] = {
                    ...enhancedMessages[i],
                    providerOptions: {
                        bedrock: { cachePoint: { type: "default" } },
                    },
                }
                break
            }
        }
    }

    const isCustomOpenAIEndpoint =
        resolvedProvider === "openai" &&
        !!(
            baseUrl ||
            process.env.OPENAI_BASE_URL ||
            (serverModelConfig.baseUrlEnv &&
                process.env[serverModelConfig.baseUrlEnv])
        )
    const isSingleSystemProvider =
        SINGLE_SYSTEM_PROVIDERS.has(resolvedProvider) || isCustomOpenAIEndpoint

    const xmlContext =
        flowMode === "swimlane"
            ? ""
            : `${
                  previousXml
                      ? `Previous diagram XML (before user's last message):
"""xml
${previousXml}
"""

`
                      : ""
              }Current diagram XML (AUTHORITATIVE - the source of truth):
"""xml
${xml || ""}
"""

IMPORTANT: The "Current diagram XML" is the SINGLE SOURCE OF TRUTH for what's on the canvas right now. The user can manually add, delete, or modify shapes directly in draw.io. Always count and describe elements based on the CURRENT XML, not on what you previously generated. If both previous and current XML are shown, compare them to understand what the user changed. When using edit_diagram, COPY search patterns exactly from the CURRENT XML - attribute order matters!`

    const systemMessages =
        flowMode === "swimlane"
            ? [
                  {
                      role: "system" as const,
                      content: finalSystemMessage,
                      ...(shouldCache && {
                          providerOptions: {
                              bedrock: { cachePoint: { type: "default" } },
                          },
                      }),
                  },
              ]
            : isSingleSystemProvider
              ? [
                    {
                        role: "system" as const,
                        content: `${finalSystemMessage}\n\n${xmlContext}`,
                    },
                ]
              : [
                    {
                        role: "system" as const,
                        content: finalSystemMessage,
                        ...(shouldCache && {
                            providerOptions: {
                                bedrock: { cachePoint: { type: "default" } },
                            },
                        }),
                    },
                    {
                        role: "system" as const,
                        content: xmlContext,
                        ...(shouldCache && {
                            providerOptions: {
                                bedrock: { cachePoint: { type: "default" } },
                            },
                        }),
                    },
                ]

    // 封装启动主大模型 streamText 的内部函数
    const runMainModelStream = (userPrompt: string) => {
        const formattedUserInput = `User input:
"""md
${userPrompt}
"""`

        let enhancedMessagesCopy = [...enhancedMessages]
        if (enhancedMessagesCopy.length >= 1) {
            const lastModelMessage =
                enhancedMessagesCopy[enhancedMessagesCopy.length - 1]
            if (lastModelMessage.role === "user") {
                const contentParts = [
                    { type: "text", text: formattedUserInput },
                ]
                enhancedMessagesCopy = [
                    ...enhancedMessagesCopy.slice(0, -1),
                    { ...lastModelMessage, content: contentParts },
                ]
            }
        }

        const allMessagesCopy = [...systemMessages, ...enhancedMessagesCopy]

        const result = streamText({
            model,
            abortSignal: req.signal,
            ...(process.env.MAX_OUTPUT_TOKENS && {
                maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS, 10),
            }),
            stopWhen: stepCountIs(5),
            experimental_repairToolCall: async ({ toolCall, error }) => {
                console.log(`[repairToolCall] Tool: ${toolCall.toolName}`)
                console.log(
                    `[repairToolCall] Error: ${error.name} - ${error.message}`,
                )
                if (
                    error instanceof InvalidToolInputError ||
                    error.name === "AI_InvalidToolInputError"
                ) {
                    try {
                        let inputToRepair = toolCall.input
                        if (typeof inputToRepair === "string") {
                            inputToRepair = inputToRepair.replace(/:=/g, ": ")
                            inputToRepair = inputToRepair.replace(
                                /=\s*"/g,
                                ': "',
                            )
                            inputToRepair = inputToRepair.replace(
                                /(\w+)="([^"]*?)\\"/g,
                                '$1=\\"$2\\"',
                            )
                        }
                        const repairedInput = jsonrepair(inputToRepair)
                        console.log(
                            `[repairToolCall] Repaired truncated JSON for tool: ${toolCall.toolName}`,
                        )
                        return { ...toolCall, input: repairedInput }
                    } catch (repairError) {
                        console.warn(
                            `[repairToolCall] Failed to repair JSON for tool: ${toolCall.toolName}`,
                            repairError,
                        )
                        if (toolCall.toolName === "edit_diagram") {
                            return {
                                ...toolCall,
                                input: {
                                    operations: [],
                                    _error: "JSON repair failed - no operations to apply",
                                },
                            }
                        }
                        if (toolCall.toolName === "display_diagram") {
                            return {
                                ...toolCall,
                                input: {
                                    xml: "",
                                    _error: "JSON repair failed - empty diagram",
                                },
                            }
                        }
                        return null
                    }
                }
                return null
            },
            messages: allMessagesCopy,
            ...(providerOptions && { providerOptions }),
            ...(headers && { headers }),
            ...(getTelemetryConfig({ sessionId: validSessionId, userId }) && {
                experimental_telemetry: getTelemetryConfig({
                    sessionId: validSessionId,
                    userId,
                }),
            }),
            onFinish: ({ text, totalUsage }) => {
                setTraceOutput(text)
                if (
                    isQuotaEnabled() &&
                    !hasOwnApiKey &&
                    userId !== "anonymous" &&
                    totalUsage
                ) {
                    const totalTokens =
                        (totalUsage.inputTokens || 0) +
                        (totalUsage.outputTokens || 0) +
                        (totalUsage.cachedInputTokens || 0) +
                        (totalUsage.inputTokenDetails?.cacheWriteTokens || 0)
                    recordTokenUsage(userId, totalTokens)
                }
            },
            tools: getToolsForMode(flowMode),
            ...(process.env.TEMPERATURE !== undefined && {
                temperature: parseFloat(process.env.TEMPERATURE),
            }),
        })

        return result.toUIMessageStreamResponse({
            sendReasoning: true,
            messageMetadata: ({ part }) => {
                if (part.type === "finish") {
                    const usage = (part as any).totalUsage
                    return {
                        totalTokens: usage?.totalTokens ?? 0,
                        finishReason: (part as any).finishReason,
                    }
                }
                return undefined
            },
        })
    }

    // 分支 1: 无图片，直接运行主模型
    if (!hasImages) {
        return runMainModelStream(userInputText)
    }

    // 分支 2: 有图片，运行流式拼接双流模式
    console.log(
        `[route.ts] Preprocessing: Triggering stream visual analysis with ${imagesToAnalyze.length} image(s)...`,
    )

    const mainModelConfig = {
        model,
        providerOptions,
        headers,
        modelId,
        provider: resolvedProvider,
    }

    const visionResultStream = streamAnalyzeFlowchartImages(
        imagesToAnalyze,
        mainModelConfig,
        userInputText,
    )

    const visionResponse = visionResultStream.toUIMessageStreamResponse()
    const visionBody = visionResponse.body
    if (!visionBody) {
        throw new Error("无法获取视觉大模型的响应流")
    }

    // 把 VL 流的 text-* 事件改写成 reasoning-*，让前端把视觉分析内容渲染为"思考气泡"
    // 而不是污染主模型正文
    const visionReasoningBody = remapVisionTextToReasoning(visionBody)

    const accumulatedTextPromise = visionResultStream.text

    const combinedStream = concatStreams(visionReasoningBody, async () => {
        let parsedText = ""
        try {
            parsedText = await accumulatedTextPromise
            console.log(
                `[route.ts] Stream Image analysis completed. Content length: ${parsedText.length}`,
            )
        } catch (err) {
            console.error(
                "[route.ts] Stream Image analysis failed, running main model without visual details:",
                err,
            )
        }

        const finalUserInputText = parsedText
            ? `${userInputText}\n\n[手绘流程图识别结果]\n${parsedText}`
            : userInputText

        const mainResponse = runMainModelStream(finalUserInputText)
        const mainBody = mainResponse.body
        if (!mainBody) {
            throw new Error("无法获取主模型的响应流")
        }
        return mainBody
    })

    return new Response(combinedStream, {
        headers: visionResponse.headers,
    })
}

// Helper to categorize errors and return appropriate response
function handleError(error: unknown): Response {
    console.error("Error in chat route:", error)

    const isDev = process.env.NODE_ENV === "development"

    // Check for specific AI SDK error types
    if (APICallError.isInstance(error)) {
        return Response.json(
            {
                error: error.message,
                ...(isDev && {
                    details: error.responseBody,
                    stack: error.stack,
                }),
            },
            { status: error.statusCode || 500 },
        )
    }

    if (LoadAPIKeyError.isInstance(error)) {
        return Response.json(
            {
                error: "Authentication failed. Please check your API key.",
                ...(isDev && {
                    stack: error.stack,
                }),
            },
            { status: 401 },
        )
    }

    // Fallback for other errors with safety filter
    const message =
        error instanceof Error ? error.message : "An unexpected error occurred"
    const status = (error as any)?.statusCode || (error as any)?.status || 500

    // Prevent leaking API keys, tokens, or other sensitive data
    const lowerMessage = message.toLowerCase()
    const safeMessage =
        lowerMessage.includes("key") ||
        lowerMessage.includes("token") ||
        lowerMessage.includes("sig") ||
        lowerMessage.includes("signature") ||
        lowerMessage.includes("secret") ||
        lowerMessage.includes("password") ||
        lowerMessage.includes("credential")
            ? "Authentication failed. Please check your credentials."
            : message

    return Response.json(
        {
            error: safeMessage,
            ...(isDev && {
                details: message,
                stack: error instanceof Error ? error.stack : undefined,
            }),
        },
        { status },
    )
}

// Wrap handler with error handling
async function safeHandler(req: Request): Promise<Response> {
    try {
        return await handleChatRequest(req)
    } catch (error) {
        return handleError(error)
    }
}

// Wrap with Langfuse observe (if configured)
const observedHandler = wrapWithObserve(safeHandler)

export async function POST(req: Request) {
    return observedHandler(req)
}

function concatStreams(
    stream1: ReadableStream<Uint8Array>,
    getStream2: () => Promise<ReadableStream<Uint8Array>>,
): ReadableStream<Uint8Array> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    let readingFirst = true
    let heartbeatInterval: any = null

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            // 1. 发送初始的加载提示语，消除首字延迟，确保前台第 1 秒就有反应
            const introText = `0:"[系统提示] 正在调用 Qwen3.6-27B 视觉模型识别手绘流程图，复杂识别与深度推理大约需要 30-60 秒，请稍候...\\n\\n"\n`
            controller.enqueue(new TextEncoder().encode(introText))

            // 2. 启动 5 秒一次的保活心跳，发送空文本 delta 以保持 HTTP 连接活跃，防止网关因无数据流出而断开
            heartbeatInterval = setInterval(() => {
                try {
                    controller.enqueue(new TextEncoder().encode('0:""\n'))
                } catch (e) {
                    if (heartbeatInterval) {
                        clearInterval(heartbeatInterval)
                        heartbeatInterval = null
                    }
                }
            }, 5000)

            reader = stream1.getReader()
        },
        async pull(controller) {
            if (!reader) return
            try {
                const { done, value } = await reader.read()
                if (done) {
                    if (readingFirst) {
                        readingFirst = false
                        const stream2 = await getStream2()
                        reader = stream2.getReader()
                        const next = await reader.read()
                        if (next.done) {
                            if (heartbeatInterval) {
                                clearInterval(heartbeatInterval)
                                heartbeatInterval = null
                            }
                            controller.close()
                            reader = null
                        } else {
                            controller.enqueue(next.value)
                        }
                    } else {
                        if (heartbeatInterval) {
                            clearInterval(heartbeatInterval)
                            heartbeatInterval = null
                        }
                        controller.close()
                        reader = null
                    }
                } else {
                    controller.enqueue(value)
                }
            } catch (err) {
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval)
                    heartbeatInterval = null
                }
                controller.error(err)
            }
        },
        cancel() {
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval)
                heartbeatInterval = null
            }
            if (reader) {
                reader.cancel()
            }
        },
    })
}

/**
 * 把 UIMessage Stream 中的 text-* 事件改写成 reasoning-* 事件。
 * 用途：VL 视觉模型本身是辅助"思考"步骤，它的结构化文本不应该污染主模型正文。
 * 通过改写事件类型，让前端把这段内容渲染为可折叠的思考气泡。
 * 同时给 id 加上 "vision-" 前缀，避免与主模型的 text/reasoning id 冲突。
 */
function remapVisionTextToReasoning(
    input: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let buffer = ""

    const rewriteLine = (line: string): string => {
        // SSE 行格式: "data: {...}\n"。非 data 行（注释、空行、心跳）原样透传
        if (!line.startsWith("data:")) return line
        const payload = line.slice(5).trim()
        if (!payload || payload === "[DONE]") return line
        try {
            const evt = JSON.parse(payload)
            if (!evt || typeof evt !== "object") return line
            const type = (evt as { type?: unknown }).type
            if (type === "text-start") {
                ;(evt as any).type = "reasoning-start"
            } else if (type === "text-delta") {
                ;(evt as any).type = "reasoning-delta"
            } else if (type === "text-end") {
                ;(evt as any).type = "reasoning-end"
            } else {
                return line
            }
            if (typeof (evt as any).id === "string") {
                ;(evt as any).id = `vision-${(evt as any).id}`
            }
            // 保留原有换行风格：把改写后的 JSON 重新拼回 "data: ...\n"
            const newline = line.endsWith("\n") ? "\n" : ""
            return `data: ${JSON.stringify(evt)}${newline}`
        } catch {
            return line
        }
    }

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            const reader = input.getReader()
            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) {
                        if (buffer.length > 0) {
                            controller.enqueue(
                                encoder.encode(rewriteLine(buffer)),
                            )
                            buffer = ""
                        }
                        controller.close()
                        return
                    }
                    buffer += decoder.decode(value, { stream: true })
                    let nlIndex: number
                    while ((nlIndex = buffer.indexOf("\n")) !== -1) {
                        const line = buffer.slice(0, nlIndex + 1)
                        buffer = buffer.slice(nlIndex + 1)
                        controller.enqueue(encoder.encode(rewriteLine(line)))
                    }
                }
            } catch (err) {
                controller.error(err)
            }
        },
        cancel() {
            input.cancel().catch(() => {})
        },
    })
}
