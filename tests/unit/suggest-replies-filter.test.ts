// @vitest-environment node

import { convertToModelMessages } from "ai"
import { describe, expect, it } from "vitest"

/**
 * suggest_replies 历史消息过滤测试
 *
 * 核心发现：AI SDK 的 convertToModelMessages 会把前端 UI 消息中
 * type="tool-invocation" 的 parts 转换后，toolName 会变形
 * （例如变成 "invocation"），导致在转换后按 toolName === "suggest_replies"
 * 过滤完全无效。
 *
 * 因此，过滤必须在 convertToModelMessages 之前、在原始 UI 消息层面进行。
 */
describe("suggest_replies 历史消息过滤", () => {
    /**
     * 复现 route.ts 中新的前置过滤逻辑：
     * 在 convertToModelMessages 之前，从原始 UI messages 的 parts 中
     * 剥离 suggest_replies 的 tool-invocation。
     */
    function stripSuggestRepliesFromMessages(messages: any[]) {
        return messages.map((msg: any) => {
            if (!msg.parts || !Array.isArray(msg.parts)) return msg
            const filteredParts = msg.parts.filter((part: any) => {
                if (part.type === "tool-invocation") {
                    const toolName =
                        part.toolInvocation?.toolName || part.toolName
                    if (toolName === "suggest_replies") return false
                }
                return true
            })
            return { ...msg, parts: filteredParts }
        })
    }

    it("前置过滤能正确剥离 suggest_replies 的 tool-invocation parts", () => {
        const mockMessages: any[] = [
            {
                id: "msg-1",
                role: "user",
                content: "画个图",
                parts: [{ type: "text", text: "画个图" }],
            },
            {
                id: "msg-2",
                role: "assistant",
                content: "好的，我已经为您画好图，请问您满意吗？",
                parts: [
                    {
                        type: "text",
                        text: "好的，我已经为您画好图，请问您满意吗？",
                    },
                    {
                        type: "tool-invocation",
                        toolInvocation: {
                            toolCallId: "call-1",
                            toolName: "suggest_replies",
                            args: { suggestions: ["满意", "需要修改"] },
                            state: "result",
                            result: { status: "success" },
                        },
                    },
                ],
            },
            {
                id: "msg-3",
                role: "user",
                content: "满意",
                parts: [{ type: "text", text: "满意" }],
            },
        ]

        const stripped = stripSuggestRepliesFromMessages(mockMessages)

        // 第一条 user 消息不受影响
        expect(stripped[0].parts).toHaveLength(1)
        expect(stripped[0].parts[0].type).toBe("text")

        // 第二条 assistant 消息：suggest_replies 被剥离，只剩 text
        expect(stripped[1].parts).toHaveLength(1)
        expect(stripped[1].parts[0].type).toBe("text")
        expect(stripped[1].parts[0].text).toBe(
            "好的，我已经为您画好图，请问您满意吗？",
        )

        // 第三条 user 消息不受影响
        expect(stripped[2].parts).toHaveLength(1)
    })

    it("前置过滤后 convertToModelMessages 不再包含 suggest_replies 的残留", async () => {
        const mockMessages: any[] = [
            {
                id: "msg-1",
                role: "user",
                content: "画个图",
                parts: [{ type: "text", text: "画个图" }],
            },
            {
                id: "msg-2",
                role: "assistant",
                content: "好的，我已经为您画好图，请问您满意吗？",
                parts: [
                    {
                        type: "text",
                        text: "好的，我已经为您画好图，请问您满意吗？",
                    },
                    {
                        type: "tool-invocation",
                        toolInvocation: {
                            toolCallId: "call-1",
                            toolName: "suggest_replies",
                            args: { suggestions: ["满意", "需要修改"] },
                            state: "result",
                            result: { status: "success" },
                        },
                    },
                ],
            },
            {
                id: "msg-3",
                role: "user",
                content: "满意",
                parts: [{ type: "text", text: "满意" }],
            },
        ]

        // 先前置过滤，再转换
        const stripped = stripSuggestRepliesFromMessages(mockMessages)
        const modelMessages = await convertToModelMessages(stripped)

        // 验证转换后的 model messages 中不包含任何 tool-call
        for (const msg of modelMessages) {
            if (msg.content && Array.isArray(msg.content)) {
                for (const part of msg.content as any[]) {
                    // 不应该有任何与 suggest_replies 相关的 tool-call 或 tool-result
                    if (
                        part.type === "tool-call" ||
                        part.type === "tool-result"
                    ) {
                        expect(part.toolName).not.toBe("suggest_replies")
                        expect(part.toolName).not.toBe("invocation")
                    }
                }
            }
        }

        // assistant 消息应该只有 text 内容
        const assistantMsg = modelMessages.find(
            (m: any) => m.role === "assistant",
        )
        expect(assistantMsg).toBeDefined()
        expect((assistantMsg as any).content).toHaveLength(1)
        expect((assistantMsg as any).content[0].type).toBe("text")
    })

    it("不影响其他 tool-invocation（如 display_diagram）", () => {
        const mockMessages: any[] = [
            {
                id: "msg-1",
                role: "assistant",
                content: "",
                parts: [
                    { type: "text", text: "这是一个图" },
                    {
                        type: "tool-invocation",
                        toolInvocation: {
                            toolCallId: "call-2",
                            toolName: "display_diagram",
                            args: { xml: "<mxCell/>" },
                            state: "result",
                            result: { status: "success" },
                        },
                    },
                    {
                        type: "tool-invocation",
                        toolInvocation: {
                            toolCallId: "call-3",
                            toolName: "suggest_replies",
                            args: { suggestions: ["好看", "不好看"] },
                            state: "result",
                            result: { status: "success" },
                        },
                    },
                ],
            },
        ]

        const stripped = stripSuggestRepliesFromMessages(mockMessages)

        // display_diagram 应该保留，suggest_replies 被移除
        expect(stripped[0].parts).toHaveLength(2)
        expect(stripped[0].parts[0].type).toBe("text")
        expect(stripped[0].parts[1].type).toBe("tool-invocation")
        expect(stripped[0].parts[1].toolInvocation.toolName).toBe(
            "display_diagram",
        )
    })

    it("处理没有 parts 的消息不会崩溃", () => {
        const mockMessages: any[] = [
            { id: "msg-1", role: "user", content: "hello" },
            { id: "msg-2", role: "assistant", content: "world", parts: null },
        ]

        const stripped = stripSuggestRepliesFromMessages(mockMessages)
        expect(stripped).toHaveLength(2)
        expect(stripped[0].content).toBe("hello")
        expect(stripped[1].content).toBe("world")
    })
})
