import { describe, expect, it } from "vitest"
import { procurementExample } from "@/lib/swimlane/examples/procurement"
import { irToXml } from "@/lib/swimlane/xml/engine"
import {
    computeCanvasSize,
    computeLegendHeight,
    getMatrixBottomY,
    LAYOUT,
} from "@/lib/swimlane/xml/layout"
import { validateDrawioXml } from "@/lib/swimlane/xml/validator"

describe("irToXml + validator", () => {
    const xml = irToXml(procurementExample)

    it("生成的 XML 通过 drawio 校验器", () => {
        const result = validateDrawioXml(xml)
        if (!result.valid) console.error(result.errors)
        expect(result.valid).toBe(true)
        expect(result.errors).toEqual([])
    })

    it("不包含 XML 注释", () => {
        expect(xml).not.toContain("<!--")
    })

    it("包含正确的根结构", () => {
        expect(xml).toContain("<mxfile")
        expect(xml).toContain("<mxGraphModel")
        expect(xml).toContain('<mxCell id="0"')
        expect(xml).toContain('<mxCell id="1"')
    })

    it("包含所有 role/phase/node/edge", () => {
        procurementExample.roles.forEach((r) => {
            expect(xml).toContain(`id="row-${r.id}"`)
            expect(xml).toContain(r.name)
        })
        procurementExample.phases.forEach((p) => {
            expect(xml).toContain(`id="col-${p.id}"`)
            expect(xml).toContain(p.name)
        })
        procurementExample.nodes.forEach((n) => {
            expect(xml).toContain(`id="${n.id}"`)
        })
        procurementExample.edges.forEach((e) => {
            expect(xml).toContain(`id="${e.id}"`)
        })
    })

    it("所有 edge 都包含 mxGeometry relative=1", () => {
        const edgeBlocks =
            xml.match(/<mxCell\b[^>]*\bedge="1"[^>]*>[\s\S]*?<\/mxCell>/g) ?? []
        // IR 边 + 3 条图例边
        expect(edgeBlocks.length).toBeGreaterThanOrEqual(
            procurementExample.edges.length,
        )
        edgeBlocks.forEach((block) => {
            expect(block).toMatch(/<mxGeometry[^>]*relative="1"/)
        })
    })

    it("图例外框存在且在内容之前(z 序)", () => {
        expect(xml).toContain(`id="legend-frame"`)
        // 外框出现位置必须早于第一个图例内容(确保 z 序:框在底层)
        const frameIdx = xml.indexOf(`id="legend-frame"`)
        const firstNodeIdx = xml.indexOf(`id="legend-node-`)
        expect(frameIdx).toBeGreaterThan(0)
        expect(firstNodeIdx).toBeGreaterThan(frameIdx)
    })

    it("图例只包含 IR 实际出现的 node type", () => {
        // procurement 用到的 type: start / end / task / decision / document
        ;["start", "end", "task", "decision", "document"].forEach((t) => {
            expect(xml).toContain(`id="legend-node-${t}"`)
            expect(xml).toContain(`id="legend-node-${t}-label"`)
        })
        // 未用到的不应该出现
        ;["subprocess", "data", "manual", "system"].forEach((t) => {
            expect(xml).not.toContain(`id="legend-node-${t}"`)
        })
    })

    it("图例只包含 IR 实际出现的 edge style", () => {
        // procurement 用到: solid + dashed
        ;["solid", "dashed"].forEach((s) => {
            expect(xml).toContain(`id="legend-edge-${s}"`)
            expect(xml).toContain(`id="legend-edge-${s}-label"`)
        })
        // 没用 thick
        expect(xml).not.toContain(`id="legend-edge-thick"`)
    })

    it("规则说明渲染 IR.rules 中的每一条", () => {
        const rules = procurementExample.rules ?? []
        expect(rules.length).toBeGreaterThan(0)
        for (let i = 0; i < rules.length; i++) {
            expect(xml).toContain(`id="legend-rule-${i}"`)
            // 内容前缀加了 "• " 项目符号
            expect(xml).toContain(rules[i])
        }
        // 规则数量应该正好对应,后面一个序号不存在
        expect(xml).not.toContain(`id="legend-rule-${rules.length}"`)
    })

    it("无规则的 IR 不渲染规则段", () => {
        const noRulesIR = { ...procurementExample, rules: undefined }
        const xmlNoRules = irToXml(noRulesIR)
        expect(xmlNoRules).not.toContain(`id="legend-rule-`)
        // 节点/边图例仍存在
        expect(xmlNoRules).toContain(`id="legend-node-start"`)
    })

    it("canvas 高度 = 矩阵底 + 图例高度(按 IR 动态)", () => {
        const canvas = computeCanvasSize(procurementExample)
        const matrixBottom = getMatrixBottomY(procurementExample)
        const legendH = computeLegendHeight(procurementExample)
        expect(canvas.height).toBe(matrixBottom + legendH)
        expect(legendH).toBeGreaterThan(LAYOUT.ORIGIN_Y)

        // 删掉 rules 后,canvas 高度变小
        const shorter = computeLegendHeight({
            ...procurementExample,
            rules: undefined,
        })
        expect(shorter).toBeLessThan(legendH)
    })

    it("节点坐标落在所属单元格范围内(抽样)", () => {
        // 验证 n2 (申请人/申请) 落在第一行第一列内
        const n2Match = xml.match(/<mxCell\s+id="n2"[\s\S]*?<\/mxCell>/)
        expect(n2Match).toBeTruthy()
        const geom = n2Match![0].match(/<mxGeometry\s+x="(\d+)"\s+y="(\d+)"/)
        expect(geom).toBeTruthy()
        const x = Number(geom![1])
        const y = Number(geom![2])
        // 申请人行 y 应在 [80, 200] 区间内,申请阶段 x 应 > 180(行表头之后)
        expect(y).toBeGreaterThanOrEqual(80)
        expect(y).toBeLessThan(240)
        expect(x).toBeGreaterThan(180)
    })
})
