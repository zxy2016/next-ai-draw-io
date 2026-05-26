import { describe, expect, it } from "vitest"
import { procurementExample } from "@/lib/swimlane/examples/procurement"
import {
    handleProposeSwimlaneIr,
    SwimlaneIrValidationError,
} from "@/lib/swimlane/handler"

describe("handleProposeSwimlaneIr", () => {
    it("合法 IR 返回包含 XML 与统计信息的结果", () => {
        const result = handleProposeSwimlaneIr(procurementExample)
        expect(result.xml).toMatch(/<mxGraphModel\b/)
        expect(result.title).toBe(procurementExample.title)
        expect(result.stats.roles).toBe(procurementExample.roles.length)
        expect(result.stats.nodes).toBe(procurementExample.nodes.length)
    })

    it("没有 start 节点时抛 SwimlaneIrValidationError", () => {
        const bad = {
            ...procurementExample,
            nodes: procurementExample.nodes.map((n) =>
                n.type === "start" ? { ...n, type: "task" as const } : n,
            ),
        }
        expect(() => handleProposeSwimlaneIr(bad)).toThrow(
            SwimlaneIrValidationError,
        )
    })

    it("错误信息包含可读路径,便于模型自我修复", () => {
        const bad = { ...procurementExample, roles: [] }
        try {
            handleProposeSwimlaneIr(bad)
            expect.fail("should have thrown")
        } catch (err) {
            expect(err).toBeInstanceOf(SwimlaneIrValidationError)
            const e = err as SwimlaneIrValidationError
            expect(e.message).toContain("IR 校验失败")
            expect(e.issues.length).toBeGreaterThan(0)
            // 至少一条 issue 应该带有路径(如 "roles:" 或 "(root):")
            expect(e.issues.some((s) => /[a-z()]+:/i.test(s))).toBe(true)
        }
    })

    it("边引用不存在的 node 时拒绝", () => {
        const bad = {
            ...procurementExample,
            edges: [
                ...procurementExample.edges,
                {
                    id: "e99",
                    from: "n1",
                    to: "n999", // 不存在
                    style: "solid" as const,
                },
            ],
        }
        expect(() => handleProposeSwimlaneIr(bad)).toThrow(
            SwimlaneIrValidationError,
        )
    })

    it("完全错误的输入(非对象)也走 Zod 错误而不是 crash", () => {
        expect(() => handleProposeSwimlaneIr("not an ir")).toThrow(
            SwimlaneIrValidationError,
        )
        expect(() => handleProposeSwimlaneIr(null)).toThrow(
            SwimlaneIrValidationError,
        )
    })
})
