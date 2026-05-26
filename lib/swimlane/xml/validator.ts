/**
 * 对生成的 XML 做后置校验,确保符合 drawio 解析规范。
 * 这一层是"安全网",防止引擎或外部输入引入违规结构。
 */
export interface ValidateResult {
    valid: boolean
    errors: string[]
}

export function validateDrawioXml(xml: string): ValidateResult {
    const errors: string[] = []

    // 规则 1: 不允许 XML 注释
    if (/<!--/.test(xml)) {
        errors.push("XML 包含 <!-- 注释,drawio 解析器不允许")
    }

    // 规则 2: 必须有 mxGraphModel 根
    if (!/<mxGraphModel\b/.test(xml)) {
        errors.push("缺失 <mxGraphModel> 根节点")
    }

    // 规则 3: 必须有 mxCell id=0 和 id=1
    if (!/<mxCell\s+id="0"/.test(xml)) errors.push("缺失 mxCell id=0")
    if (!/<mxCell\s+id="1"/.test(xml)) errors.push("缺失 mxCell id=1")

    // 规则 4: 所有 edge="1" 的 mxCell 必须包含 mxGeometry relative="1"
    const edgeRegex = /<mxCell\b[^>]*\bedge="1"[^>]*>[\s\S]*?<\/mxCell>/g
    const edges = xml.match(edgeRegex) ?? []
    edges.forEach((edgeXml, i) => {
        if (!/<mxGeometry\b[^>]*\brelative="1"/.test(edgeXml)) {
            errors.push(`第 ${i + 1} 个 edge 缺失 <mxGeometry relative="1">`)
        }
    })

    // 规则 5: id 唯一性
    const ids = [...xml.matchAll(/<mxCell\s+id="([^"]+)"/g)].map((m) => m[1])
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
    if (dup.length > 0) {
        errors.push(`存在重复 mxCell id: ${[...new Set(dup)].join(", ")}`)
    }

    return { valid: errors.length === 0, errors }
}
