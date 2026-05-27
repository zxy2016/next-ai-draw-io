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

    // Check if user is sending images to a model that doesn't support them
    // AI SDK silently drops unsupported parts, so we need to catch this early
    if (fileParts.length > 0 && !supportsImageInput(modelId)) {
        return Response.json(
            {
                error: `The model "${modelId}" does not support image input. Please use a vision-capable model (e.g., GPT-4o, Claude, Gemini) or remove the image.`,
            },
            { status: 400 },
        )
    }

    // User input only - XML is now in a separate cached system message
    const formattedUserInput = `User input:
"""md
${userInputText}
"""`

    // === SUGGEST_REPLIES STRIPPING START ===
    // 在 convertToModelMessages 之前，从原始 UI 消息中剥离 suggest_replies 的
    // tool-invocation parts。必须在此处处理，因为 convertToModelMessages 会把
    // toolName 变形（如 "invocation"），导致转换后按名称过滤完全无效。
    // 剥离的目的：让 LLM 在多轮对话中看不到历史 suggest_replies 调用，
    // 避免模型因为"已经调用过"而在后续轮次偷懒不再调用。
    const messagesWithoutSuggestReplies = messages.map((msg: any) => {
        if (!msg.parts || !Array.isArray(msg.parts)) return msg
        const filteredParts = msg.parts.filter((part: any) => {
            // 过滤 tool-invocation 类型中 toolName 为 suggest_replies 的 parts
            if (part.type === "tool-invocation") {
                const toolName = part.toolInvocation?.toolName || part.toolName
                if (toolName === "suggest_replies") return false
            }
            return true
        })
        // 如果过滤后 parts 为空，保留消息但只留文本部分（避免空消息）
        return { ...msg, parts: filteredParts }
    })
    // === SUGGEST_REPLIES STRIPPING END ===

    // Convert UIMessages to ModelMessages and add system message
    const modelMessages = await convertToModelMessages(
        messagesWithoutSuggestReplies,
    )

    // DEBUG: Log incoming messages structure
    console.log("[route.ts] Incoming messages count:", messages.length)
    messages.forEach((msg: any, idx: number) => {
        console.log(
            `[route.ts] Message ${idx} role:`,
            msg.role,
            "parts count:",
            msg.parts?.length,
        )
        if (msg.parts) {
            msg.parts.forEach((part: any, partIdx: number) => {
                if (
                    part.type === "tool-invocation" ||
                    part.type === "tool-result"
                ) {
                    console.log(`[route.ts]   Part ${partIdx}:`, {
                        type: part.type,
                        toolName: part.toolName,
                        hasInput: !!part.input,
                        inputType: typeof part.input,
                        inputKeys:
                            part.input && typeof part.input === "object"
                                ? Object.keys(part.input)
                                : null,
                    })
                }
            })
        }
    })

    // Replace historical tool call XML with placeholders to reduce tokens
    // Disabled by default - some models (e.g. minimax) copy placeholders instead of generating XML
    // Swimlane mode 不走 display_diagram,历史里都是 IR 对象,replace 没意义还会破坏 IR 结构
    const enableHistoryReplace =
        flowMode === "free" && process.env.ENABLE_HISTORY_XML_REPLACE === "true"
    const placeholderMessages = enableHistoryReplace
        ? replaceHistoricalToolInputs(modelMessages)
        : modelMessages

    // Filter out messages with empty content arrays (Bedrock API rejects these)
    // This is a safety measure - ideally convertToModelMessages should handle all cases
    let enhancedMessages = placeholderMessages.filter(
        (msg: any) =>
            msg.content && Array.isArray(msg.content) && msg.content.length > 0,
    )

    // Filter out tool-calls with invalid inputs (from failed repair or interrupted streaming)
    // Bedrock API rejects messages where toolUse.input is not a valid JSON object
    enhancedMessages = enhancedMessages
        .map((msg: any) => {
            if (!msg.content || !Array.isArray(msg.content)) {
                return msg
            }
            const filteredContent = msg.content.filter((part: any) => {
                if (part.type === "tool-call") {
                    // Check if input is a valid object (not null, undefined, or empty)
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

    // DEBUG: Log modelMessages structure (what's being sent to AI)
    console.log("[route.ts] Model messages count:", enhancedMessages.length)
    enhancedMessages.forEach((msg: any, idx: number) => {
        console.log(
            `[route.ts] ModelMsg ${idx} role:`,
            msg.role,
            "content count:",
            msg.content?.length,
        )
        if (msg.content) {
            msg.content.forEach((part: any, partIdx: number) => {
                if (part.type === "tool-call" || part.type === "tool-result") {
                    console.log(`[route.ts]   Content ${partIdx}:`, {
                        type: part.type,
                        toolName: part.toolName,
                        hasInput: !!part.input,
                        inputType: typeof part.input,
                        inputValue:
                            part.input === undefined
                                ? "undefined"
                                : part.input === null
                                  ? "null"
                                  : "object",
                    })
                }
            })
        }
    })

    // Update the last message with user input only (XML moved to separate cached system message)
    if (enhancedMessages.length >= 1) {
        const lastModelMessage = enhancedMessages[enhancedMessages.length - 1]
        if (lastModelMessage.role === "user") {
            // Build content array with user input text and file parts
            const contentParts: any[] = [
                { type: "text", text: formattedUserInput },
            ]

            // Add image parts back
            for (const filePart of fileParts) {
                contentParts.push({
                    type: "image",
                    image: filePart.url,
                    mimeType: filePart.mediaType,
                })
            }

            enhancedMessages = [
                ...enhancedMessages.slice(0, -1),
                { ...lastModelMessage, content: contentParts },
            ]
        }
    }

    // Add cache point to the last assistant message in conversation history
    // This caches the entire conversation prefix for subsequent requests
    // Strategy: system (cached) + history with last assistant (cached) + new user message
    if (shouldCache && enhancedMessages.length >= 2) {
        // Find the last assistant message (should be second-to-last, before current user message)
        for (let i = enhancedMessages.length - 2; i >= 0; i--) {
            if (enhancedMessages[i].role === "assistant") {
                enhancedMessages[i] = {
                    ...enhancedMessages[i],
                    providerOptions: {
                        bedrock: { cachePoint: { type: "default" } },
                    },
                }
                break // Only cache the last assistant message
            }
        }
    }

    // System messages with multiple cache breakpoints for optimal caching:
    // - Breakpoint 1: System instructions + custom instructions - changes when user updates custom system message
    // - Breakpoint 2: Current XML context - changes per diagram, but constant within a conversation turn
    // Some providers (e.g. MiniMax) don't support multiple system messages
    // Merge them into a single system message for compatibility
    // Also merge for OpenAI-compatible providers with custom base URLs (e.g. vLLM, LMStudio)
    // because open-source model chat templates (Qwen, Llama, etc.) typically reject multiple system messages
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

    // Swimlane mode 输出 IR JSON 不是 mxCell XML,注入 xmlContext 会让模型困惑
    // (画布上的 XML 不是 IR 工具的输入,也不能被 propose_swimlane_ir 增量编辑)
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

    // Swimlane mode 不需要 xml-context system message,只发主 prompt
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
                    // Cache breakpoint 1: Instructions (+ optional custom instructions)
                    {
                        role: "system" as const,
                        content: finalSystemMessage,
                        ...(shouldCache && {
                            providerOptions: {
                                bedrock: { cachePoint: { type: "default" } },
                            },
                        }),
                    },
                    // Cache breakpoint 2: Previous and Current diagram XML context
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

    const allMessages = [...systemMessages, ...enhancedMessages]

    const result = streamText({
        model,
        abortSignal: req.signal,
        ...(process.env.MAX_OUTPUT_TOKENS && {
            maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS, 10),
        }),
        stopWhen: stepCountIs(5),
        // Repair truncated tool calls when maxOutputTokens is reached mid-JSON
        experimental_repairToolCall: async ({ toolCall, error }) => {
            // DEBUG: Log what we're trying to repair
            console.log(`[repairToolCall] Tool: ${toolCall.toolName}`)
            console.log(
                `[repairToolCall] Error: ${error.name} - ${error.message}`,
            )
            console.log(`[repairToolCall] Input type: ${typeof toolCall.input}`)
            console.log(`[repairToolCall] Input value:`, toolCall.input)

            // Only attempt repair for invalid tool input (broken JSON from truncation)
            if (
                error instanceof InvalidToolInputError ||
                error.name === "AI_InvalidToolInputError"
            ) {
                try {
                    // Pre-process to fix common LLM JSON errors that jsonrepair can't handle
                    let inputToRepair = toolCall.input
                    if (typeof inputToRepair === "string") {
                        // Fix `:=` instead of `: ` (LLM sometimes generates this)
                        inputToRepair = inputToRepair.replace(/:=/g, ": ")
                        // Fix `= "` instead of `: "`
                        inputToRepair = inputToRepair.replace(/=\s*"/g, ': "')
                        // Fix inconsistent quote escaping in XML attributes within JSON strings
                        // Pattern: attribute="value\" where opening quote is unescaped but closing is escaped
                        // Example: y="-20\" should be y=\"-20\"
                        inputToRepair = inputToRepair.replace(
                            /(\w+)="([^"]*?)\\"/g,
                            '$1=\\"$2\\"',
                        )
                    }
                    // Use jsonrepair to fix truncated JSON
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
                    // Return a placeholder input to avoid API errors in multi-step
                    // The tool will fail gracefully on client side
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
            // Don't attempt to repair other errors (like NoSuchToolError)
            return null
        },
        messages: allMessages,
        ...(providerOptions && { providerOptions }), // This now includes all reasoning configs
        ...(headers && { headers }),
        // Langfuse telemetry config (returns undefined if not configured)
        ...(getTelemetryConfig({ sessionId: validSessionId, userId }) && {
            experimental_telemetry: getTelemetryConfig({
                sessionId: validSessionId,
                userId,
            }),
        }),
        onFinish: ({ text, totalUsage }) => {
            // AI SDK 6 telemetry auto-reports token usage on its spans
            setTraceOutput(text)

            // Record token usage for server-side quota tracking (if enabled)
            // Use totalUsage (cumulative across all steps) instead of usage (final step only)
            // Include all 4 token types: input, output, cache read, cache write
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
                // AI SDK 6 provides totalTokens directly
                return {
                    totalTokens: usage?.totalTokens ?? 0,
                    finishReason: (part as any).finishReason,
                }
            }
            return undefined
        },
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
