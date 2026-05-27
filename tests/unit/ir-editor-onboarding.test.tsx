import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    IR_ONBOARDING_DISMISSED_KEY,
    IrEditorOnboarding,
} from "@/components/ir-editor-onboarding"

// ---- mock useDictionary ----
vi.mock("@/hooks/use-dictionary", () => ({
    useDictionary: () => ({
        nav: {
            irEditorOnboardingTitle: "✨ 智能结构编辑",
            irEditorOnboardingDesc:
                "点击此处可直接在编辑器中对图表的结构和节点连接进行精细化调整。",
            irEditorGotIt: "我知道了",
            irEditorDismiss: "不再提醒",
        },
    }),
}))

// ---- mock Radix Popover Arrow ----
vi.mock("@radix-ui/react-popover", async (importActual) => {
    const actual = await importActual<any>()
    return {
        ...actual,
        Arrow: () => <div data-testid="mock-popover-arrow" />,
    }
})

// ---- mock Radix Popover ----
// Radix Popover 在 jsdom 中无法正常渲染 portal，
// 这里用简单的 div 替换来验证逻辑行为。
vi.mock("@/components/ui/popover", () => ({
    Popover: ({
        children,
        open,
    }: {
        children: React.ReactNode
        open?: boolean
        onOpenChange?: (open: boolean) => void
    }) => (
        <div data-testid="mock-popover" data-open={open}>
            {children}
        </div>
    ),
    PopoverAnchor: ({
        children,
    }: {
        children: React.ReactNode
        asChild?: boolean
    }) => <div data-testid="mock-popover-anchor">{children}</div>,
    PopoverContent: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="mock-popover-content">{children}</div>
    ),
}))

// ---- mock localStorage ----
// jsdom 环境下 localStorage 可能不完全可用，手动 mock
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

describe("IrEditorOnboarding", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        // 重置 mock store 和所有 mock 函数的调用记录
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
        vi.useRealTimers()
        cleanup()
    })

    it("应该正常渲染 children", () => {
        render(
            <IrEditorOnboarding>
                <button data-testid="ir-btn">编辑 IR</button>
            </IrEditorOnboarding>,
        )
        expect(screen.getByTestId("ir-btn")).toBeDefined()
    })

    it("初始时 Popover 应为关闭状态", () => {
        render(
            <IrEditorOnboarding>
                <button>编辑 IR</button>
            </IrEditorOnboarding>,
        )
        const popover = screen.getByTestId("mock-popover")
        expect(popover.getAttribute("data-open")).toBe("false")
    })

    it("500ms 后应自动弹出 Popover", () => {
        render(
            <IrEditorOnboarding>
                <button>编辑 IR</button>
            </IrEditorOnboarding>,
        )

        // 500ms 之前仍为关闭
        act(() => {
            vi.advanceTimersByTime(499)
        })
        const popover = screen.getByTestId("mock-popover")
        expect(popover.getAttribute("data-open")).toBe("false")

        // 500ms 时弹出
        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(popover.getAttribute("data-open")).toBe("true")
    })

    it("弹出后 12 秒应自动关闭", () => {
        render(
            <IrEditorOnboarding>
                <button>编辑 IR</button>
            </IrEditorOnboarding>,
        )

        // 先触发弹出
        act(() => {
            vi.advanceTimersByTime(500)
        })
        const popover = screen.getByTestId("mock-popover")
        expect(popover.getAttribute("data-open")).toBe("true")

        // 12 秒后自动关闭
        act(() => {
            vi.advanceTimersByTime(12000)
        })
        expect(popover.getAttribute("data-open")).toBe("false")
    })

    it("弹出后应显示脉冲动画类名", () => {
        render(
            <IrEditorOnboarding>
                <button>编辑 IR</button>
            </IrEditorOnboarding>,
        )

        // 弹出前无动画类名
        const anchor = screen.getByTestId("ir-onboarding-anchor")
        expect(anchor.className).not.toContain("ir-pulse-animation")

        // 弹出后有动画类名
        act(() => {
            vi.advanceTimersByTime(500)
        })
        expect(anchor.className).toContain("ir-pulse-animation")
    })

    it("点击「不再提醒」应永久关闭并写入 localStorage", () => {
        render(
            <IrEditorOnboarding>
                <button>编辑 IR</button>
            </IrEditorOnboarding>,
        )

        // 触发弹出
        act(() => {
            vi.advanceTimersByTime(500)
        })

        // 点击「不再提醒」
        const dismissBtn = screen.getByTestId("ir-onboarding-dismiss-btn")
        fireEvent.click(dismissBtn)

        // 验证 localStorage 已设置
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            IR_ONBOARDING_DISMISSED_KEY,
            "true",
        )

        // 验证 Popover 已关闭（组件不再渲染 Popover）
        // 当 dismissed 为 true 时，组件直接透传 children，不渲染 mock-popover
        expect(screen.queryByTestId("mock-popover")).toBeNull()
    })

    it("localStorage 已设置时不应弹出 Popover", () => {
        mockStore[IR_ONBOARDING_DISMISSED_KEY] = "true"

        render(
            <IrEditorOnboarding>
                <button data-testid="ir-btn">编辑 IR</button>
            </IrEditorOnboarding>,
        )

        // 等待可能的弹出时间
        act(() => {
            vi.advanceTimersByTime(1000)
        })

        // 直接透传 children，不渲染 Popover
        expect(screen.queryByTestId("mock-popover")).toBeNull()
        expect(screen.getByTestId("ir-btn")).toBeDefined()
    })

    it("组件卸载后定时器不应导致错误", () => {
        const { unmount } = render(
            <IrEditorOnboarding>
                <button>编辑 IR</button>
            </IrEditorOnboarding>,
        )

        // 在定时器触发前卸载组件
        unmount()

        // 推进定时器，不应抛出错误
        expect(() => {
            act(() => {
                vi.advanceTimersByTime(10000)
            })
        }).not.toThrow()
    })

    it("应该显示正确的说明文字", () => {
        render(
            <IrEditorOnboarding>
                <button>编辑 IR</button>
            </IrEditorOnboarding>,
        )

        // mock 实现下内容在 DOM 中可见
        expect(screen.getByText("✨ 智能结构编辑")).toBeDefined()
        expect(
            screen.getByText(
                "点击此处可直接在编辑器中对图表的结构和节点连接进行精细化调整。",
            ),
        ).toBeDefined()
    })

    it("应该显示「不再提醒」和「我知道了」按钮", () => {
        render(
            <IrEditorOnboarding>
                <button>编辑 IR</button>
            </IrEditorOnboarding>,
        )

        expect(screen.getByText("不再提醒")).toBeDefined()
        expect(screen.getByText("我知道了")).toBeDefined()
    })

    it("点击「我知道了」应仅关闭本次 Popover 且不写入 localStorage", () => {
        render(
            <IrEditorOnboarding>
                <button>编辑 IR</button>
            </IrEditorOnboarding>,
        )

        // 触发弹出
        act(() => {
            vi.advanceTimersByTime(500)
        })

        const popover = screen.getByTestId("mock-popover")
        expect(popover.getAttribute("data-open")).toBe("true")

        // 点击「我知道了」
        const okBtn = screen.getByTestId("ir-onboarding-ok-btn")
        fireEvent.click(okBtn)

        // Popover 应关闭
        expect(popover.getAttribute("data-open")).toBe("false")

        // 验证 localStorage 未被写入 true
        expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
            IR_ONBOARDING_DISMISSED_KEY,
            "true",
        )
    })
})
