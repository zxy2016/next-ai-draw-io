import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SettingsDialog } from "@/components/settings-dialog"

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

import zhDict from "@/lib/i18n/dictionaries/zh.json"

// Mock next/navigation hooks
vi.mock("next/navigation", () => ({
    usePathname: () => "/zh",
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
}))

// Mock useDictionary hook
vi.mock("@/hooks/use-dictionary", () => ({
    useDictionary: () => zhDict,
}))

// Mock Radix UI components to avoid portal rendering issues in jsdom
vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children, open }: any) =>
        open ? <div data-testid="mock-dialog">{children}</div> : null,
    DialogContent: ({ children }: any) => (
        <div data-testid="mock-dialog-content">{children}</div>
    ),
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <div>{children}</div>,
    DialogDescription: ({ children }: any) => <div>{children}</div>,
}))

vi.mock("@/components/ui/select", () => ({
    Select: ({ children }: any) => <div>{children}</div>,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ children, value }: any) => (
        <div data-value={value}>{children}</div>
    ),
    SelectTrigger: ({ children }: any) => <div>{children}</div>,
    SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}))

vi.mock("@/components/ui/switch", () => ({
    Switch: ({ checked, onCheckedChange }: any) => (
        <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
        />
    ),
}))

vi.mock("@/components/ui/textarea", () => {
    const React = require("react")
    return {
        Textarea: React.forwardRef((props: any, ref: any) => (
            <textarea data-testid="mock-textarea" ref={ref} {...props} />
        )),
    }
})

describe("SettingsDialog", () => {
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

    it("should render the feedback link with correct text and feishu url", () => {
        render(
            <SettingsDialog
                open={true}
                onOpenChange={vi.fn()}
                drawioUi="min"
                onDrawioUiChange={vi.fn()}
                darkMode={false}
                onToggleDarkMode={vi.fn()}
            />,
        )

        // Find the feedback anchor element
        const feedbackLink = screen.getByText("问题反馈") as HTMLAnchorElement
        expect(feedbackLink).toBeDefined()
        expect(feedbackLink.tagName).toBe("A")
        expect(feedbackLink.href).toBe(
            "https://ihaier.feishu.cn/base/A5YAbK9hra3gOTspK05citszn8e?table=tblS8TQwTU1eLw2g&view=vewyEQZsT7",
        )
        expect(feedbackLink.target).toBe("_blank")
    })

    it("should not contain GitHub repository link", () => {
        render(
            <SettingsDialog
                open={true}
                onOpenChange={vi.fn()}
                drawioUi="min"
                onDrawioUiChange={vi.fn()}
                darkMode={false}
                onToggleDarkMode={vi.fn()}
            />,
        )

        // Ensure github.com link is not present
        const links = screen.queryAllByRole("link")
        const hasGithubLink = links.some((link) => {
            const href = link.getAttribute("href")
            return href?.includes("github.com/DayuanJiang/next-ai-draw-io")
        })
        expect(hasGithubLink).toBe(false)
    })

    it("should not display the app version", () => {
        const originalVersion = process.env.APP_VERSION
        process.env.APP_VERSION = "9.9.9-test-version"

        try {
            render(
                <SettingsDialog
                    open={true}
                    onOpenChange={vi.fn()}
                    drawioUi="min"
                    onDrawioUiChange={vi.fn()}
                    darkMode={false}
                    onToggleDarkMode={vi.fn()}
                />,
            )

            expect(screen.queryByText("9.9.9-test-version")).toBeNull()
        } finally {
            process.env.APP_VERSION = originalVersion
        }
    })

    it("should not render the diagram validation (experimental) module", () => {
        render(
            <SettingsDialog
                open={true}
                onOpenChange={vi.fn()}
                drawioUi="min"
                onDrawioUiChange={vi.fn()}
                darkMode={false}
                onToggleDarkMode={vi.fn()}
                vlmValidationEnabled={true}
                onVlmValidationChange={vi.fn()}
            />,
        )

        // Ensure the diagram validation switch/label is not rendered
        expect(screen.queryByText(zhDict.settings.diagramValidation)).toBeNull()
        expect(
            screen.queryByText(zhDict.settings.diagramValidationDescription),
        ).toBeNull()

        // Also check with element id
        const vlmSwitch = document.getElementById("vlm-validation")
        expect(vlmSwitch).toBeNull()
    })

    it("should render access code pulse and ping effect when access code is required but empty", () => {
        // Set up localStorage mocks
        localStorageMock.setItem("next-ai-draw-io-access-code-required", "true")
        localStorageMock.setItem("next-ai-draw-io-access-code", "")

        // Mock global fetch to return accessCodeRequired: true
        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ accessCodeRequired: true }),
            }),
        )
        globalThis.fetch = mockFetch as any

        render(
            <SettingsDialog
                open={true}
                onOpenChange={vi.fn()}
                drawioUi="min"
                onDrawioUiChange={vi.fn()}
                darkMode={false}
                onToggleDarkMode={vi.fn()}
            />,
        )

        // The elements with data-testid="access-code-pulse-glow" and data-testid="access-code-ping-wave" should be present
        expect(screen.getByTestId("access-code-pulse-glow")).toBeDefined()
        expect(screen.getByTestId("access-code-ping-wave")).toBeDefined()
    })

    it("should NOT render access code pulse and ping effect when access code is already stored", () => {
        // Set up localStorage mocks
        localStorageMock.setItem("next-ai-draw-io-access-code-required", "true")
        localStorageMock.setItem("next-ai-draw-io-access-code", "valid-code")

        // Mock global fetch to return accessCodeRequired: true
        const mockFetch = vi.fn().mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ accessCodeRequired: true }),
            }),
        )
        globalThis.fetch = mockFetch as any

        render(
            <SettingsDialog
                open={true}
                onOpenChange={vi.fn()}
                drawioUi="min"
                onDrawioUiChange={vi.fn()}
                darkMode={false}
                onToggleDarkMode={vi.fn()}
            />,
        )

        // The elements with data-testid="access-code-pulse-glow" and data-testid="access-code-ping-wave" should not be rendered
        expect(screen.queryByTestId("access-code-pulse-glow")).toBeNull()
        expect(screen.queryByTestId("access-code-ping-wave")).toBeNull()
    })
})
