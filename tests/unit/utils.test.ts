import { describe, expect, it } from "vitest"
import {
    cn,
    extractRootContent,
    isMxCellXmlComplete,
    wrapWithMxFile,
} from "@/lib/utils"

describe("isMxCellXmlComplete", () => {
    it("returns false for empty/null input", () => {
        expect(isMxCellXmlComplete("")).toBe(false)
        expect(isMxCellXmlComplete(null)).toBe(false)
        expect(isMxCellXmlComplete(undefined)).toBe(false)
    })

    it("returns true for self-closing mxCell", () => {
        const xml =
            '<mxCell id="2" value="Hello" style="rounded=1;" vertex="1" parent="1"/>'
        expect(isMxCellXmlComplete(xml)).toBe(true)
    })

    it("returns true for mxCell with closing tag", () => {
        const xml = `<mxCell id="2" value="Hello" vertex="1" parent="1">
            <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
        </mxCell>`
        expect(isMxCellXmlComplete(xml)).toBe(true)
    })

    it("returns false for truncated mxCell", () => {
        const xml =
            '<mxCell id="2" value="Hello" style="rounded=1;" vertex="1" parent'
        expect(isMxCellXmlComplete(xml)).toBe(false)
    })

    it("returns false for mxCell with unclosed geometry", () => {
        const xml = `<mxCell id="2" value="Hello" vertex="1" parent="1">
            <mxGeometry x="100" y="100" width="120"`
        expect(isMxCellXmlComplete(xml)).toBe(false)
    })

    it("returns true for multiple complete mxCells", () => {
        const xml = `<mxCell id="2" value="A" vertex="1" parent="1"/>
            <mxCell id="3" value="B" vertex="1" parent="1"/>`
        expect(isMxCellXmlComplete(xml)).toBe(true)
    })
})

describe("wrapWithMxFile", () => {
    it("wraps empty string with default structure", () => {
        const result = wrapWithMxFile("")
        expect(result).toContain("<mxfile>")
        expect(result).toContain("<mxGraphModel>")
        expect(result).toContain('<mxCell id="0"/>')
        expect(result).toContain('<mxCell id="1" parent="0"/>')
    })

    it("wraps raw mxCell content", () => {
        const xml = '<mxCell id="2" value="Hello"/>'
        const result = wrapWithMxFile(xml)
        expect(result).toContain("<mxfile>")
        expect(result).toContain(xml)
        expect(result).toContain("</mxfile>")
    })

    it("returns full mxfile unchanged", () => {
        const fullXml =
            '<mxfile><diagram name="Page-1"><mxGraphModel></mxGraphModel></diagram></mxfile>'
        const result = wrapWithMxFile(fullXml)
        expect(result).toBe(fullXml)
    })

    it("handles whitespace in input", () => {
        const result = wrapWithMxFile("   ")
        expect(result).toContain("<mxfile>")
    })
})

describe("cn (class name utility)", () => {
    it("merges class names", () => {
        expect(cn("foo", "bar")).toBe("foo bar")
    })

    it("handles conditional classes", () => {
        expect(cn("foo", false && "bar", "baz")).toBe("foo baz")
    })

    it("merges tailwind classes correctly", () => {
        expect(cn("px-2", "px-4")).toBe("px-4")
        expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500")
    })
})

describe("extractRootContent", () => {
    it("returns null for null/undefined/empty input", () => {
        expect(extractRootContent(null)).toBeNull()
        expect(extractRootContent(undefined)).toBeNull()
        expect(extractRootContent("")).toBeNull()
    })

    it("extracts root content from a standard mxfile XML", () => {
        const xml = `<mxfile><diagram><mxGraphModel dx="100" dy="200" pageScale="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const result = extractRootContent(xml)
        expect(result).not.toBeNull()
        expect(result).toContain('id="0"')
        expect(result).toContain('id="1"')
    })

    it("returns the same root content when only view state (dx/dy/pageScale) changes", () => {
        const xml1 = `<mxfile><diagram><mxGraphModel dx="100" dy="200" pageScale="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const xml2 = `<mxfile><diagram><mxGraphModel dx="999" dy="888" pageScale="2.5"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`

        const root1 = extractRootContent(xml1)
        const root2 = extractRootContent(xml2)

        expect(root1).not.toBeNull()
        expect(root1).toBe(root2)
    })

    it("returns different root content when diagram content actually changes", () => {
        const xml1 = `<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const xml2 = `<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="New" parent="1"/></root></mxGraphModel></diagram></mxfile>`

        const root1 = extractRootContent(xml1)
        const root2 = extractRootContent(xml2)

        expect(root1).not.toBeNull()
        expect(root2).not.toBeNull()
        expect(root1).not.toBe(root2)
    })

    it("returns null when XML has no <root> element", () => {
        const xml = `<mxfile><diagram><mxGraphModel></mxGraphModel></diagram></mxfile>`
        expect(extractRootContent(xml)).toBeNull()
    })

    it("handles whitespace differences by normalizing them away", () => {
        const xml1 = `<mxfile><diagram><mxGraphModel><root><mxCell id="0"/>  <mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const xml2 = `<mxfile><diagram><mxGraphModel><root><mxCell id="0"/>\n<mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`

        expect(extractRootContent(xml1)).toBe(extractRootContent(xml2))
    })
})
