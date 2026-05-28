import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChatLobby } from "@/components/chat/ChatLobby"
import zhDict from "@/lib/i18n/dictionaries/zh.json"

// Mock subcomponents
vi.mock("@/components/chat/TemplatePanel", () => ({
    TemplatePanel: () => null,
}))
vi.mock("@/components/chat-example-panel", () => ({
    __esModule: true,
    default: () => null,
}))

// Mock useDictionary hook
vi.mock("@/hooks/use-dictionary", () => ({
    useDictionary: () => zhDict,
}))

// Mock Radix UI AlertDialog to avoid JSDOM portal/layout issues
vi.mock("@/components/ui/alert-dialog", () => ({
    AlertDialog: ({ children, open }: any) =>
        open ? <div data-testid="mock-alert-dialog">{children}</div> : null,
    AlertDialogContent: ({ children }: any) => (
        <div data-testid="mock-alert-dialog-content">{children}</div>
    ),
    AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
    AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
    AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
    AlertDialogCancel: ({ children, onClick }: any) => (
        <button type="button" onClick={onClick}>
            {children}
        </button>
    ),
    AlertDialogAction: ({ children, onClick, className }: any) => (
        <button
            type="button"
            onClick={onClick}
            className={className}
            data-testid="alert-confirm"
        >
            {children}
        </button>
    ),
}))

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

describe("ChatLobby Clear All History", () => {
    const mockSessions = [
        { id: "1", title: "Chat 1", updatedAt: Date.now() - 1000 },
        { id: "2", title: "Chat 2", updatedAt: Date.now() - 5000 },
    ]

    beforeEach(() => {
        mockStore = {}
        vi.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it("should render the Clear All button when sessions exist and onDeleteAllSessions is provided", () => {
        render(
            <ChatLobby
                sessions={mockSessions}
                onSelectSession={vi.fn()}
                onDeleteSession={vi.fn()}
                onDeleteAllSessions={vi.fn()}
                setInput={vi.fn()}
                setFiles={vi.fn()}
                dict={zhDict}
            />,
        )

        // Find the clear all button by title or text
        const clearButton = screen.getByTitle("清空全部历史")
        expect(clearButton).toBeDefined()
        expect(screen.getByText("清空全部历史")).toBeDefined()
    })

    it("should NOT render the Clear All button when sessions is empty", () => {
        render(
            <ChatLobby
                sessions={[]}
                onSelectSession={vi.fn()}
                onDeleteSession={vi.fn()}
                onDeleteAllSessions={vi.fn()}
                setInput={vi.fn()}
                setFiles={vi.fn()}
                dict={zhDict}
            />,
        )

        expect(screen.queryByTitle("清空全部历史")).toBeNull()
        expect(screen.queryByText("清空全部历史")).toBeNull()
    })

    it("should open AlertDialog and invoke onDeleteAllSessions on confirm", () => {
        const onDeleteAll = vi.fn()
        render(
            <ChatLobby
                sessions={mockSessions}
                onSelectSession={vi.fn()}
                onDeleteSession={vi.fn()}
                onDeleteAllSessions={onDeleteAll}
                setInput={vi.fn()}
                setFiles={vi.fn()}
                dict={zhDict}
            />,
        )

        // The confirmation dialog should initially be closed (not in DOM or closed)
        expect(screen.queryByTestId("mock-alert-dialog")).toBeNull()

        // Click Clear All button
        const clearButton = screen.getByTitle("清空全部历史")
        fireEvent.click(clearButton)

        // The confirmation dialog should now be open
        expect(screen.getByTestId("mock-alert-dialog")).toBeDefined()
        expect(screen.getByText("删除其他历史对话？")).toBeDefined()

        // Click the confirm action button in the mocked dialog
        const confirmButton = screen.getByTestId("alert-confirm")
        fireEvent.click(confirmButton)

        // Verify callback is triggered
        expect(onDeleteAll).toHaveBeenCalled()
    })
})
