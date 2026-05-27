import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChatInput } from "@/components/chat-input"

// Mock all complex dependencies
vi.mock("@/components/button-with-tooltip", () => ({
    ButtonWithTooltip: () => null,
}))
vi.mock("@/components/chat/TemplateCreateDialog", () => ({
    TemplateCreateDialog: () => null,
}))
vi.mock("@/components/history-dialog", () => ({ HistoryDialog: () => null }))
vi.mock("@/components/model-selector", () => ({ ModelSelector: () => null }))
vi.mock("@/components/save-dialog", () => ({ SaveDialog: () => null }))
vi.mock("@/components/url-input-dialog", () => ({ UrlInputDialog: () => null }))
vi.mock("./file-preview-list", () => ({ FilePreviewList: () => null }))
vi.mock("@/contexts/diagram-context", () => ({
    useDiagram: () => ({
        chartXML: "",
        diagramHistory: [],
        saveDiagramToFile: vi.fn(),
        showSaveDialog: false,
        setShowSaveDialog: vi.fn(),
    }),
}))
vi.mock("@/hooks/use-dictionary", () => ({
    useDictionary: () => ({
        chat: { placeholder: "test", send: "Send" },
        templates: {},
        save: {},
        errors: {},
    }),
}))

// We need an actual textarea and form to simulate the submit logic
vi.mock("@/components/ui/textarea", () => {
    const React = require("react")
    return {
        Textarea: React.forwardRef((props: any, ref: any) => (
            <textarea data-testid="chat-textarea" ref={ref} {...props} />
        )),
    }
})

// Mock localStorage
let mockStore: Record<string, string> = {}
Object.defineProperty(globalThis, "localStorage", {
    value: {
        getItem: vi.fn((key: string) => mockStore[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            mockStore[key] = value
        }),
        removeItem: vi.fn((key: string) => {
            delete mockStore[key]
        }),
        clear: vi.fn(() => {
            mockStore = {}
        }),
    },
    writable: true,
})

describe("ChatInput", () => {
    beforeEach(() => {
        mockStore = {}
    })

    it("should trigger submit on Enter by default (since default shortcut is enter)", () => {
        const onSubmit = vi.fn((e) => e.preventDefault())
        render(
            <ChatInput
                input="test input"
                status="ready"
                onSubmit={onSubmit}
                onChange={vi.fn()}
            />,
        )

        const textarea = screen.getByTestId("chat-textarea")
        const form = textarea.closest("form")!
        form.requestSubmit = vi.fn()

        // Pressing Enter (without ctrl/meta) should trigger submit
        fireEvent.keyDown(textarea, {
            key: "Enter",
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
        })

        expect(form.requestSubmit).toHaveBeenCalled()
    })
})
