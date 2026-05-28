import { act, render } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DiagramProvider, useDiagram } from "@/contexts/diagram-context"

// Mock react-drawio to avoid real render and DOM exceptions
vi.mock("react-drawio", () => {
    return {
        DrawIoEmbed: React.forwardRef((_props: any, _ref: any) => {
            return <div data-testid="drawio-mock" />
        }),
    }
})

// Mock @/lib/utils to mock extractDiagramXML easily
vi.mock("@/lib/utils", async (importActual) => {
    const actual = await importActual<any>()
    return {
        ...actual,
        extractDiagramXML: vi.fn().mockImplementation((val) => {
            if (val && typeof val === "string") {
                return val
            }
            return ""
        }),
    }
})

// Mock toast from sonner
vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

function TestComponent({ onReady }: { onReady: (actions: any) => void }) {
    const actions = useDiagram()
    onReady(actions)
    return <div>Test</div>
}

describe("DiagramContext - fetchChart", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("should resolve immediately with current chartXML if isDrawioReady is false", async () => {
        let actions: any
        render(
            <DiagramProvider>
                <TestComponent
                    onReady={(a) => {
                        actions = a
                    }}
                />
            </DiagramProvider>,
        )

        // Load some dummy XML into the context
        const dummyXml = "<mxfile>test xml</mxfile>"
        act(() => {
            actions.loadDiagram(dummyXml, true)
        })

        // isDrawioReady defaults to false
        expect(actions.isDrawioReady).toBe(false)

        const promise = actions.fetchChart()
        await expect(promise).resolves.toBe(dummyXml)
    })

    it("should resolve immediately with current chartXML if drawioRef.current is not set", async () => {
        let actions: any
        render(
            <DiagramProvider>
                <TestComponent
                    onReady={(a) => {
                        actions = a
                    }}
                />
            </DiagramProvider>,
        )

        // Set isDrawioReady to true but drawioRef.current is null
        act(() => {
            actions.onDrawioLoad()
        })
        expect(actions.isDrawioReady).toBe(true)
        actions.drawioRef.current = null

        const dummyXml = "<mxfile>test xml</mxfile>"
        act(() => {
            actions.loadDiagram(dummyXml, true)
        })

        const promise = actions.fetchChart()
        await expect(promise).resolves.toBe(dummyXml)
    })

    it("should resolve with exported XML when draw.io editor is ready and export completes successfully", async () => {
        let actions: any
        render(
            <DiagramProvider>
                <TestComponent
                    onReady={(a) => {
                        actions = a
                    }}
                />
            </DiagramProvider>,
        )

        // Mark as ready and setup mock ref
        act(() => {
            actions.onDrawioLoad()
        })
        expect(actions.isDrawioReady).toBe(true)

        const mockExportDiagram = vi.fn()
        actions.drawioRef.current = {
            exportDiagram: mockExportDiagram,
        }

        const promise = actions.fetchChart()

        // Verify that exportDiagram was triggered with format 'xmlsvg'
        expect(mockExportDiagram).toHaveBeenCalledWith({ format: "xmlsvg" })

        // Simulate draw.io returning the export data
        const exportedXml = "<mxfile>exported xml</mxfile>"
        act(() => {
            actions.handleDiagramExport({ data: exportedXml })
        })

        await expect(promise).resolves.toBe(exportedXml)
    })

    it("should reject with timeout error if export takes more than 10 seconds", async () => {
        let actions: any
        render(
            <DiagramProvider>
                <TestComponent
                    onReady={(a) => {
                        actions = a
                    }}
                />
            </DiagramProvider>,
        )

        // Mark as ready and setup mock ref
        act(() => {
            actions.onDrawioLoad()
        })

        const mockExportDiagram = vi.fn()
        actions.drawioRef.current = {
            exportDiagram: mockExportDiagram,
        }

        const promise = actions.fetchChart()

        // Advance timers by 10000ms to trigger the timeout
        act(() => {
            vi.advanceTimersByTime(10000)
        })

        await expect(promise).rejects.toThrow(
            "Chart export timed out after 10 seconds",
        )
    })
})
