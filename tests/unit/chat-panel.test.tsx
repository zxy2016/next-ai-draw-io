import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ChatPanel from "@/components/chat-panel"
import zhDict from "@/lib/i18n/dictionaries/zh.json"

// Mock localStorage
let mockStore: Record<string, string> = {}
const localStorageMock = {
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
    get length() {
        return Object.keys(mockStore).length
    },
    key: vi.fn((_index: number) => null),
}

Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
})

// Mock next/navigation hooks
vi.mock("next/navigation", () => ({
    usePathname: () => "/zh",
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
    }),
    useSearchParams: () => ({
        get: vi.fn(() => null),
    }),
}))

// Mock all complex subcomponents and hooks
vi.mock("@/components/button-with-tooltip", () => ({
    ButtonWithTooltip: () => null,
}))
vi.mock("@/components/chat-input", () => ({
    ChatInput: () => null,
}))
vi.mock("@/components/image-with-basepath", () => ({
    __esModule: true,
    default: () => null,
}))
vi.mock("@/components/ir-editor-onboarding", () => ({
    IrEditorOnboarding: ({ children }: any) => children,
}))
vi.mock("@/components/model-config-dialog", () => ({
    ModelConfigDialog: () => null,
}))
vi.mock("@/components/settings-dialog", () => ({
    SettingsDialog: ({ open }: any) =>
        open ? <div data-testid="settings-dialog">Settings Open</div> : null,
}))
vi.mock("@/components/swimlane/IREditorDrawer", () => ({
    IREditorDrawer: () => null,
}))
const mockChatMessageDisplay = vi.fn()
vi.mock("@/components/chat-message-display", () => ({
    ChatMessageDisplay: (props: any) => {
        mockChatMessageDisplay(props)
        return <div data-testid="chat-message-display" />
    },
}))
vi.mock("@/components/dev-xml-simulator", () => ({
    DevXmlSimulator: () => null,
}))

vi.mock("@ai-sdk/react", () => ({
    useChat: () => ({
        messages: [],
        input: "",
        setInput: vi.fn(),
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        status: "ready",
        isLoading: false,
    }),
}))

vi.mock("@/contexts/diagram-context", () => ({
    useDiagram: () => ({
        loadDiagram: vi.fn(),
        handleExport: vi.fn(),
        chartXML: "",
        latestSvg: "",
        clearDiagram: vi.fn(),
        getThumbnailSvg: vi.fn(),
        captureValidationPng: vi.fn(),
        diagramHistory: [],
        setDiagramHistory: vi.fn(),
        fetchChart: vi.fn(),
    }),
}))

vi.mock("@/hooks/use-dictionary", () => ({
    useDictionary: () => zhDict,
}))

vi.mock("@/hooks/use-model-config", () => ({
    useModelConfig: () => ({
        selectedModelId: "test-model",
        setSelectedModelId: vi.fn(),
        configs: [],
    }),
    getSelectedAIConfig: () => ({}),
}))

vi.mock("@/hooks/use-session-manager", () => ({
    useSessionManager: () => ({
        currentSession: null,
        setCurrentSession: vi.fn(),
        sessions: [],
        deleteAllSessions: vi.fn(),
    }),
}))

vi.mock("@/lib/use-file-processor", () => ({
    useFileProcessor: () => ({
        files: [],
        pdfData: null,
        handleFileChange: vi.fn(),
        setFiles: vi.fn(),
    }),
}))

vi.mock("@/lib/use-quota-manager", () => ({
    useQuotaManager: () => ({
        isOverQuota: false,
        checkQuota: vi.fn(),
    }),
}))

vi.mock("@/hooks/use-validate-diagram", () => ({
    useValidateDiagram: () => ({
        validateDiagram: vi.fn(),
        isValidating: false,
    }),
}))

describe("ChatPanel first-load access code check", () => {
    beforeEach(() => {
        mockStore = {}
        localStorageMock.getItem.mockImplementation(
            (key: string) => mockStore[key] ?? null,
        )
        localStorageMock.setItem.mockImplementation(
            (key: string, value: string) => {
                mockStore[key] = value
            },
        )
        vi.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it("should auto-open SettingsDialog when accessCodeRequired is true and localStorage is empty", async () => {
        // Mock fetch to return accessCodeRequired: true
        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ accessCodeRequired: true }),
            }),
        )
        globalThis.fetch = mockFetch as any

        render(
            <ChatPanel
                isVisible={true}
                onToggleVisibility={vi.fn()}
                drawioUi="min"
                onDrawioUiChange={vi.fn()}
                darkMode={false}
                onToggleDarkMode={vi.fn()}
            />,
        )

        // Wait for SettingsDialog to be opened
        await waitFor(() => {
            expect(screen.getByTestId("settings-dialog")).toBeDefined()
        })
    })

    it("should NOT auto-open SettingsDialog when accessCodeRequired is true but accessCode is already stored", async () => {
        // Set stored access code
        localStorageMock.setItem("next-ai-draw-io-access-code", "valid-code")

        // Mock fetch to return accessCodeRequired: true
        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ accessCodeRequired: true }),
            }),
        )
        globalThis.fetch = mockFetch as any

        render(
            <ChatPanel
                isVisible={true}
                onToggleVisibility={vi.fn()}
                drawioUi="min"
                onDrawioUiChange={vi.fn()}
                darkMode={false}
                onToggleDarkMode={vi.fn()}
            />,
        )

        // Verify settings dialog is not open
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(screen.queryByTestId("settings-dialog")).toBeNull()
    })

    it("should NOT auto-open SettingsDialog when accessCodeRequired is false", async () => {
        // Mock fetch to return accessCodeRequired: false
        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ accessCodeRequired: false }),
            }),
        )
        globalThis.fetch = mockFetch as any

        render(
            <ChatPanel
                isVisible={true}
                onToggleVisibility={vi.fn()}
                drawioUi="min"
                onDrawioUiChange={vi.fn()}
                darkMode={false}
                onToggleDarkMode={vi.fn()}
            />,
        )

        // Verify settings dialog is not open
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(screen.queryByTestId("settings-dialog")).toBeNull()
    })

    it("should pass onDeleteAllSessions prop to ChatMessageDisplay", () => {
        // Mock fetch to prevent config check failure on render
        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ accessCodeRequired: false }),
            }),
        )
        globalThis.fetch = mockFetch as any

        render(
            <ChatPanel
                isVisible={true}
                onToggleVisibility={vi.fn()}
                drawioUi="min"
                onDrawioUiChange={vi.fn()}
                darkMode={false}
                onToggleDarkMode={vi.fn()}
            />,
        )

        expect(mockChatMessageDisplay).toHaveBeenCalled()
        const lastCallProps =
            mockChatMessageDisplay.mock.calls[
                mockChatMessageDisplay.mock.calls.length - 1
            ][0]
        expect(lastCallProps.onDeleteAllSessions).toBeDefined()
        expect(typeof lastCallProps.onDeleteAllSessions).toBe("function")
    })
})
