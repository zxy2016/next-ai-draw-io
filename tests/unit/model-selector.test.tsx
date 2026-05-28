import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ModelSelector } from "@/components/model-selector"
// Mock dictionary
import zhDict from "@/lib/i18n/dictionaries/zh.json"
import type { FlattenedModel } from "@/lib/types/model-config"

vi.mock("@/hooks/use-dictionary", () => ({
    useDictionary: () => zhDict,
}))

// Mock ResizeObserver
class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as any

// Mock Radix UI cmdk / popover components to render simplified structure
vi.mock("@/components/ai-elements/model-selector", () => ({
    ModelSelector: ({ children }: any) => (
        <div data-testid="model-selector-root">{children}</div>
    ),
    ModelSelectorTrigger: ({ children }: any) => (
        <div data-testid="model-selector-trigger">{children}</div>
    ),
    ModelSelectorContent: ({ children }: any) => (
        <div data-testid="model-selector-content">{children}</div>
    ),
    ModelSelectorInput: (props: any) => (
        <input data-testid="model-selector-input" {...props} />
    ),
    ModelSelectorList: ({ children }: any) => (
        <div data-testid="model-selector-list">{children}</div>
    ),
    ModelSelectorEmpty: ({ children }: any) => <div>{children}</div>,
    ModelSelectorGroup: ({ children, heading }: any) => (
        <div data-testid={`model-group-${heading}`}>{children}</div>
    ),
    ModelSelectorItem: ({ children, onSelect, value }: any) => (
        <div
            data-testid={`model-item-${value}`}
            onClick={() => onSelect?.(value)}
            className="cursor-pointer"
        >
            {children}
        </div>
    ),
    ModelSelectorName: ({ children }: any) => <span>{children}</span>,
    ModelSelectorLogo: () => <span>[Logo]</span>,
    ModelSelectorSectionHeader: ({ label }: any) => <div>{label}</div>,
    ModelSelectorSeparator: () => <hr />,
}))

describe("ModelSelector", () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    const mockModels: FlattenedModel[] = [
        {
            id: "server-model-1",
            modelId: "gpt-4o",
            provider: "openai",
            providerLabel: "OpenAI",
            apiKey: "",
            validated: true,
            source: "server",
        },
        {
            id: "user-model-1",
            modelId: "claude-3-5-sonnet",
            provider: "anthropic",
            providerLabel: "Anthropic",
            apiKey: "",
            validated: true,
            source: "user",
        },
    ]

    it("should render using server default when selectedModelId is undefined", () => {
        render(
            <ModelSelector
                models={mockModels}
                selectedModelId={undefined}
                onSelect={vi.fn()}
            />,
        )

        // It should render using translation key for default
        expect(screen.getByText(zhDict.modelConfig.default)).toBeDefined()
    })

    it("should render selected model name when selectedModelId is provided", () => {
        render(
            <ModelSelector
                models={mockModels}
                selectedModelId="user-model-1"
                onSelect={vi.fn()}
            />,
        )

        expect(screen.getAllByText("claude-3-5-sonnet").length).toBeGreaterThan(
            0,
        )
    })

    it("should trigger onSelect when a model item is selected", () => {
        const handleSelect = vi.fn()
        render(
            <ModelSelector
                models={mockModels}
                selectedModelId="server-model-1"
                onSelect={handleSelect}
            />,
        )

        // Open options or interact directly with items
        // Since we mock the dialog trigger / content, they render immediately
        const item = screen.getByTestId("model-item-claude-3-5-sonnet")
        fireEvent.click(item)

        expect(handleSelect).toHaveBeenCalledWith("user-model-1")
    })
})

import { migrateLocalStorage, STORAGE_KEYS } from "@/lib/storage"

describe("migrateLocalStorage", () => {
    let mockLocalStorageStore: Record<string, string> = {}

    beforeEach(() => {
        mockLocalStorageStore = {}
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => mockLocalStorageStore[key] ?? null,
            setItem: (key: string, value: string) => {
                mockLocalStorageStore[key] = value
            },
            removeItem: (key: string) => {
                delete mockLocalStorageStore[key]
            },
            clear: () => {
                mockLocalStorageStore = {}
            },
        })
    })

    it("should migrate keys from next-ai-draw-io- prefix if new key is null", () => {
        // Set older prefix keys
        mockLocalStorageStore["next-ai-draw-io-selected-model-id"] =
            "old-model-uuid"
        mockLocalStorageStore["next-ai-drawio-access-code"] = "old-code"

        migrateLocalStorage()

        // Check if migrated to new hdraw prefix keys
        expect(mockLocalStorageStore[STORAGE_KEYS.selectedModelId]).toBe(
            "old-model-uuid",
        )
        expect(mockLocalStorageStore[STORAGE_KEYS.accessCode]).toBe("old-code")
    })

    it("should NOT migrate and overwrite if new key already has a value", () => {
        mockLocalStorageStore["next-ai-draw-io-selected-model-id"] =
            "old-model-uuid"
        mockLocalStorageStore[STORAGE_KEYS.selectedModelId] = "already-new-uuid"

        migrateLocalStorage()

        expect(mockLocalStorageStore[STORAGE_KEYS.selectedModelId]).toBe(
            "already-new-uuid",
        )
    })
})
