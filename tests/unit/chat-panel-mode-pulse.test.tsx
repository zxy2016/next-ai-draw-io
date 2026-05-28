import { describe, expect, it } from "vitest"
import { SWIMLANE_SYSTEM_PROMPT } from "@/lib/swimlane/system-prompt"
import { shouldTriggerFlowModePulse } from "@/lib/swimlane/utils"

describe("Swimlane mode switch prompt and flow-mode pulse logic", () => {
    it("should contain mode switch instruction in SWIMLANE_SYSTEM_PROMPT", () => {
        expect(SWIMLANE_SYSTEM_PROMPT).toContain(
            "请点击上方的模式切换按钮切换到自由模式",
        )
    })

    describe("shouldTriggerFlowModePulse utility function", () => {
        it("should return true when in swimlane mode and AI message suggests switching to free mode", () => {
            const content =
                "抱歉，我无法画狗，请点击上方的模式切换按钮切换到自由模式来绘制其他图形。"
            expect(shouldTriggerFlowModePulse(content, "swimlane")).toBe(true)
        })

        it("should return false when current mode is free", () => {
            const content = "请点击上方的模式切换按钮切换到自由模式"
            expect(shouldTriggerFlowModePulse(content, "free")).toBe(false)
        })

        it("should return false when content is null or empty", () => {
            expect(shouldTriggerFlowModePulse("", "swimlane")).toBe(false)
            expect(shouldTriggerFlowModePulse(null, "swimlane")).toBe(false)
            expect(shouldTriggerFlowModePulse(undefined, "swimlane")).toBe(
                false,
            )
        })

        it("should return false when content does not specify switching to free mode", () => {
            const content =
                "抱歉，我只负责梳理流程。如果您有采购审批流程需要梳理，请告诉我您的业务场景。"
            expect(shouldTriggerFlowModePulse(content, "swimlane")).toBe(false)
        })

        it("should return true with variation of keywords", () => {
            // "模式切换" + "切换"
            expect(
                shouldTriggerFlowModePulse(
                    "你可以进行模式切换，切换到其他模式。",
                    "swimlane",
                ),
            ).toBe(true)
            // "自由模式" + "点击"
            expect(
                shouldTriggerFlowModePulse(
                    "请点击这里进入自由模式。",
                    "swimlane",
                ),
            ).toBe(true)
        })
    })
})
