import { generateText, streamText } from "ai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getAIModel, supportsImageInput } from "@/lib/ai-providers"
import {
    analyzeFlowchartImages,
    streamAnalyzeFlowchartImages,
} from "@/lib/swimlane/vision"

// Mock the dependencies
vi.mock("ai", () => ({
    generateText: vi
        .fn()
        .mockResolvedValue({ text: "mocked flowchart description" }),
    streamText: vi.fn().mockReturnValue({
        text: Promise.resolve("mocked flowchart description stream"),
        toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response()),
    }),
}))

vi.mock("@/lib/ai-providers", () => ({
    getAIModel: vi.fn(),
    supportsImageInput: vi.fn(),
}))

describe("analyzeFlowchartImages", () => {
    const mockMainConfig = {
        model: {},
        modelId: "main-model",
        provider: "openai",
        headers: { "x-api-key": "main-key" },
    }

    const mockVisionConfig = {
        model: {},
        modelId: "vision-model",
        provider: "qwen",
        headers: { "x-api-key": "vision-key" },
    }

    beforeEach(() => {
        vi.clearAllMocks()
        delete process.env.VISION_MODEL
        delete process.env.VISION_PROVIDER
    })

    afterEach(() => {
        delete process.env.VISION_MODEL
        delete process.env.VISION_PROVIDER
    })

    it("should throw error if images array is empty", async () => {
        await expect(
            analyzeFlowchartImages([], mockMainConfig),
        ).rejects.toThrow("images 不能为空")
    })

    it("should use designated VISION_MODEL when configured", async () => {
        process.env.VISION_MODEL = "designated-vision-model"
        process.env.VISION_PROVIDER = "openai"

        vi.mocked(getAIModel).mockReturnValue(mockVisionConfig as any)

        const images = [{ mediaType: "image/jpeg", base64: "base64data" }]
        const result = await analyzeFlowchartImages(
            images,
            mockMainConfig,
            "user text",
        )

        expect(getAIModel).toHaveBeenCalledWith({
            modelId: "designated-vision-model",
            provider: "openai",
        })
        expect(generateText).toHaveBeenCalledWith(
            expect.objectContaining({
                model: mockVisionConfig.model,
                headers: mockVisionConfig.headers,
            }),
        )
        expect(result.description).toBe("mocked flowchart description")
    })

    it("should fallback to main model if supportsImageInput is true and no VISION_MODEL is configured", async () => {
        vi.mocked(supportsImageInput).mockReturnValue(true)

        const images = [{ mediaType: "image/jpeg", base64: "base64data" }]
        const result = await analyzeFlowchartImages(
            images,
            mockMainConfig,
            "user text",
        )

        expect(getAIModel).not.toHaveBeenCalled()
        expect(supportsImageInput).toHaveBeenCalledWith("main-model")
        expect(generateText).toHaveBeenCalledWith(
            expect.objectContaining({
                model: mockMainConfig.model,
                headers: mockMainConfig.headers,
            }),
        )
        expect(result.description).toBe("mocked flowchart description")
    })

    it("should throw error if main model does not support image and no VISION_MODEL configured", async () => {
        vi.mocked(supportsImageInput).mockReturnValue(false)

        const images = [{ mediaType: "image/jpeg", base64: "base64data" }]
        await expect(
            analyzeFlowchartImages(images, mockMainConfig),
        ).rejects.toThrow(
            "当前选用的主模型不支持图片输入，且未配置有效的 VISION_MODEL",
        )
    })
})

describe("streamAnalyzeFlowchartImages", () => {
    const mockMainConfig = {
        model: {},
        modelId: "main-model",
        provider: "openai",
        headers: { "x-api-key": "main-key" },
    }

    const mockVisionConfig = {
        model: {},
        modelId: "vision-model",
        provider: "qwen",
        headers: { "x-api-key": "vision-key" },
    }

    beforeEach(() => {
        vi.clearAllMocks()
        delete process.env.VISION_MODEL
        delete process.env.VISION_PROVIDER
    })

    afterEach(() => {
        delete process.env.VISION_MODEL
        delete process.env.VISION_PROVIDER
    })

    it("should throw error if images array is empty", () => {
        expect(() => streamAnalyzeFlowchartImages([], mockMainConfig)).toThrow(
            "images 不能为空",
        )
    })

    it("should use designated VISION_MODEL and streamText", () => {
        process.env.VISION_MODEL = "designated-vision-model"
        process.env.VISION_PROVIDER = "openai"

        vi.mocked(getAIModel).mockReturnValue(mockVisionConfig as any)

        const images = [{ mediaType: "image/jpeg", base64: "base64data" }]
        streamAnalyzeFlowchartImages(images, mockMainConfig, "user text")

        expect(getAIModel).toHaveBeenCalledWith({
            modelId: "designated-vision-model",
            provider: "openai",
        })
        expect(streamText).toHaveBeenCalledWith(
            expect.objectContaining({
                model: mockVisionConfig.model,
                headers: mockVisionConfig.headers,
            }),
        )
    })
})
