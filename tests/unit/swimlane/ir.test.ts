import { describe, expect, it } from "vitest"
import { procurementExample } from "@/lib/swimlane/examples/procurement"
import { SwimlaneIR } from "@/lib/swimlane/ir/schema"

describe("SwimlaneIR schema", () => {
    it("接受合法的 IR", () => {
        const result = SwimlaneIR.safeParse(procurementExample)
        expect(result.success).toBe(true)
    })

    it("拒绝没有 start 节点的 IR", () => {
        const bad = {
            ...procurementExample,
            nodes: procurementExample.nodes.filter((n) => n.type !== "start"),
        }
        const result = SwimlaneIR.safeParse(bad)
        expect(result.success).toBe(false)
    })

    it("拒绝有多个 start 节点的 IR", () => {
        const bad = {
            ...procurementExample,
            nodes: [
                ...procurementExample.nodes,
                {
                    id: "n99",
                    roleId: "r1",
                    phaseId: "p1",
                    type: "start",
                    label: "另一个开始",
                    order: 5,
                },
            ],
        }
        const result = SwimlaneIR.safeParse(bad)
        expect(result.success).toBe(false)
    })

    it("拒绝节点引用了不存在的 role/phase", () => {
        const bad = {
            ...procurementExample,
            nodes: [
                ...procurementExample.nodes,
                {
                    id: "n50",
                    roleId: "r99",
                    phaseId: "p1",
                    type: "task",
                    label: "孤儿",
                    order: 10,
                },
            ],
        }
        const result = SwimlaneIR.safeParse(bad)
        expect(result.success).toBe(false)
    })

    it("拒绝边引用了不存在的 node", () => {
        const bad = {
            ...procurementExample,
            edges: [
                ...procurementExample.edges,
                { id: "e99", from: "n1", to: "n999", style: "solid" as const },
            ],
        }
        const result = SwimlaneIR.safeParse(bad)
        expect(result.success).toBe(false)
    })

    it("拒绝 id 格式错误", () => {
        const bad = {
            ...procurementExample,
            roles: [
                { id: "role-1", name: "申请人" },
                ...procurementExample.roles.slice(1),
            ],
        }
        const result = SwimlaneIR.safeParse(bad)
        expect(result.success).toBe(false)
    })

    it("拒绝重复 id", () => {
        const bad = {
            ...procurementExample,
            nodes: [
                ...procurementExample.nodes,
                {
                    id: "n1",
                    roleId: "r1",
                    phaseId: "p1",
                    type: "task",
                    label: "重复 id",
                    order: 9,
                },
            ],
        }
        const result = SwimlaneIR.safeParse(bad)
        expect(result.success).toBe(false)
    })
})
