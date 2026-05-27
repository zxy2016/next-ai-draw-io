"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { SwimlaneIR } from "@/lib/swimlane/ir/schema"
import { cn } from "@/lib/utils"

/**
 * IR 编辑器本体 —— 移植自 flow/components/IREditor.tsx,适配 next 的 shadcn 风格。
 *
 * 设计取舍(沿用 flow 的简化):
 * - NodesView / EdgesView 只允许改 label。type/roleId/phaseId/from/to 这些
 *   结构性字段改起来容易破坏图,让模型重生成更稳妥。
 * - 使用延迟受控输入(blur/Enter 才回传),处理三类问题:
 *   1. 中文 IME 合成期间被受控组件打断
 *   2. 父级 setIr → 整图重画的频率压低
 *   3. 焦点不被 drawio iframe 抢走
 * - 单次 onChange 把 *整个 IR* 回传,父级负责存 state、决定何时校验/保存。
 */

interface Props {
    ir: SwimlaneIR
    onChange: (next: SwimlaneIR) => void
}

type Tab = "roles" | "phases" | "nodes" | "edges" | "rules"

const TABS: readonly Tab[] = [
    "roles",
    "phases",
    "nodes",
    "edges",
    "rules",
] as const

function labelOf(t: Tab): string {
    return {
        roles: "角色",
        phases: "阶段",
        nodes: "节点",
        edges: "连线",
        rules: "规则",
    }[t]
}

function countOf(ir: SwimlaneIR, t: Tab): number {
    if (t === "rules") return ir.rules?.length ?? 0
    return ir[t].length
}

export function IREditor({ ir, onChange }: Props) {
    const [tab, setTab] = useState<Tab>("roles")

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Tab bar */}
            <div
                className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-1 pb-2 text-xs"
                role="tablist"
            >
                {TABS.map((t) => (
                    <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setTab(t)}
                        className={cn(
                            "rounded-lg px-2.5 py-1.5 transition-colors",
                            tab === t
                                ? "bg-primary text-primary-foreground"
                                : "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                    >
                        {labelOf(t)}
                        <span
                            className={cn(
                                "ml-1 text-[10px]",
                                tab === t
                                    ? "text-primary-foreground/80"
                                    : "text-muted-foreground/60",
                            )}
                        >
                            {countOf(ir, t)}
                        </span>
                    </button>
                ))}
            </div>

            {/* Tab body */}
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-1 py-3 text-xs">
                {tab === "roles" && <RolesView ir={ir} onChange={onChange} />}
                {tab === "phases" && <PhasesView ir={ir} onChange={onChange} />}
                {tab === "nodes" && <NodesView ir={ir} onChange={onChange} />}
                {tab === "edges" && <EdgesView ir={ir} onChange={onChange} />}
                {tab === "rules" && <RulesView ir={ir} onChange={onChange} />}
            </div>
        </div>
    )
}

/**
 * 延迟受控输入框。本地维护 state,只在 blur/Enter 时 propagate 到父级。
 * - 中文 IME 合成期间不打断
 * - 外部 value 变化(整个 IR 被替换)时同步到本地
 */
function EditableCell({
    value,
    onCommit,
    className,
    placeholder,
}: {
    value: string
    onCommit: (next: string) => void
    className?: string
    placeholder?: string
}) {
    const [local, setLocal] = useState(value)
    const composingRef = useRef(false)

    useEffect(() => {
        setLocal(value)
    }, [value])

    return (
        <input
            value={local}
            placeholder={placeholder}
            onChange={(e) => setLocal(e.target.value)}
            onCompositionStart={() => {
                composingRef.current = true
            }}
            onCompositionEnd={(e) => {
                composingRef.current = false
                setLocal((e.target as HTMLInputElement).value)
            }}
            onBlur={() => {
                if (local !== value) onCommit(local)
            }}
            onKeyDown={(e) => {
                if (composingRef.current) return
                if (e.key === "Enter") {
                    e.preventDefault()
                    ;(e.currentTarget as HTMLInputElement).blur()
                } else if (e.key === "Escape") {
                    setLocal(value)
                    ;(e.currentTarget as HTMLInputElement).blur()
                }
            }}
            className={cn(
                // 紧凑版,适合表格单元格;调用方可传 className 完整覆盖
                "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 outline-none transition-colors",
                "hover:border-border-subtle focus:border-primary focus:bg-surface-1",
                className,
            )}
        />
    )
}

function RolesView({
    ir,
    onChange,
}: {
    ir: SwimlaneIR
    onChange: (ir: SwimlaneIR) => void
}) {
    return (
        <table className="w-full">
            <thead className="text-muted-foreground">
                <tr>
                    <th className="w-14 py-1 text-left font-normal">ID</th>
                    <th className="py-1 text-left font-normal">名称</th>
                    <th className="py-1 text-left font-normal">说明</th>
                </tr>
            </thead>
            <tbody>
                {ir.roles.map((r, i) => (
                    <tr key={r.id} className="border-t border-border-subtle/60">
                        <td className="py-1.5 text-muted-foreground/70">
                            {r.id}
                        </td>
                        <td className="py-1.5">
                            <EditableCell
                                value={r.name}
                                onCommit={(next) => {
                                    const roles = [...ir.roles]
                                    roles[i] = { ...r, name: next }
                                    onChange({ ...ir, roles })
                                }}
                            />
                        </td>
                        <td className="py-1.5">
                            <EditableCell
                                value={r.description ?? ""}
                                placeholder="—"
                                onCommit={(next) => {
                                    const roles = [...ir.roles]
                                    roles[i] = {
                                        ...r,
                                        description: next || undefined,
                                    }
                                    onChange({ ...ir, roles })
                                }}
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

function PhasesView({
    ir,
    onChange,
}: {
    ir: SwimlaneIR
    onChange: (ir: SwimlaneIR) => void
}) {
    return (
        <table className="w-full">
            <thead className="text-muted-foreground">
                <tr>
                    <th className="w-14 py-1 text-left font-normal">ID</th>
                    <th className="py-1 text-left font-normal">名称</th>
                </tr>
            </thead>
            <tbody>
                {ir.phases.map((p, i) => (
                    <tr key={p.id} className="border-t border-border-subtle/60">
                        <td className="py-1.5 text-muted-foreground/70">
                            {p.id}
                        </td>
                        <td className="py-1.5">
                            <EditableCell
                                value={p.name}
                                onCommit={(next) => {
                                    const phases = [...ir.phases]
                                    phases[i] = { ...p, name: next }
                                    onChange({ ...ir, phases })
                                }}
                            />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

function NodesView({
    ir,
    onChange,
}: {
    ir: SwimlaneIR
    onChange: (ir: SwimlaneIR) => void
}) {
    return (
        <table className="w-full">
            <thead className="text-muted-foreground">
                <tr>
                    <th className="py-1 text-left font-normal">名称</th>
                    <th className="w-16 py-1 text-left font-normal">类型</th>
                    <th className="w-20 py-1 text-left font-normal">角色</th>
                    <th className="w-20 py-1 text-left font-normal">阶段</th>
                </tr>
            </thead>
            <tbody>
                {ir.nodes.map((n, i) => (
                    <tr key={n.id} className="border-t border-border-subtle/60">
                        <td className="py-1.5">
                            <EditableCell
                                value={n.label}
                                onCommit={(next) => {
                                    const nodes = [...ir.nodes]
                                    nodes[i] = { ...n, label: next }
                                    onChange({ ...ir, nodes })
                                }}
                            />
                        </td>
                        <td className="py-1.5 text-muted-foreground">
                            {n.type}
                        </td>
                        <td className="py-1.5 text-muted-foreground">
                            {ir.roles.find((r) => r.id === n.roleId)?.name ??
                                n.roleId}
                        </td>
                        <td className="py-1.5 text-muted-foreground">
                            {ir.phases.find((p) => p.id === n.phaseId)?.name ??
                                n.phaseId}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

function EdgesView({
    ir,
    onChange,
}: {
    ir: SwimlaneIR
    onChange: (ir: SwimlaneIR) => void
}) {
    return (
        <table className="w-full">
            <thead className="text-muted-foreground">
                <tr>
                    <th className="py-1 text-left font-normal">From → To</th>
                    <th className="py-1 text-left font-normal">标签</th>
                    <th className="w-16 py-1 text-left font-normal">样式</th>
                </tr>
            </thead>
            <tbody>
                {ir.edges.map((e, i) => (
                    <tr key={e.id} className="border-t border-border-subtle/60">
                        <td className="py-1.5 text-muted-foreground">
                            {ir.nodes.find((n) => n.id === e.from)?.label}
                            <span className="mx-1">→</span>
                            {ir.nodes.find((n) => n.id === e.to)?.label}
                        </td>
                        <td className="py-1.5">
                            <EditableCell
                                value={e.label ?? ""}
                                placeholder="—"
                                onCommit={(next) => {
                                    const edges = [...ir.edges]
                                    edges[i] = {
                                        ...e,
                                        label: next || undefined,
                                    }
                                    onChange({ ...ir, edges })
                                }}
                            />
                        </td>
                        <td className="py-1.5 text-muted-foreground">
                            {e.style ?? "solid"}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

function RulesView({
    ir,
    onChange,
}: {
    ir: SwimlaneIR
    onChange: (ir: SwimlaneIR) => void
}) {
    const rules = ir.rules ?? []

    function commitAt(i: number, next: string) {
        const trimmed = next.trim()
        const updated = [...rules]
        if (!trimmed) {
            updated.splice(i, 1)
        } else {
            updated[i] = trimmed
        }
        onChange({ ...ir, rules: updated.length > 0 ? updated : undefined })
    }

    function addRule() {
        if (rules.length >= 8) return
        onChange({ ...ir, rules: [...rules, "新规则"] })
    }

    function removeAt(i: number) {
        const updated = rules.filter((_, idx) => idx !== i)
        onChange({ ...ir, rules: updated.length > 0 ? updated : undefined })
    }

    return (
        <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
                业务规则会渲染到图例下方。空规则保存时会被自动删除,最多 8 条。
            </p>
            {rules.length === 0 && (
                <div className="italic text-muted-foreground/60">
                    暂无规则。点击下方「新增」开始添加。
                </div>
            )}
            {rules.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 w-5 shrink-0 text-right text-muted-foreground/70">
                        {i + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                        <EditableCell
                            value={r}
                            onCommit={(next) => commitAt(i, next)}
                            className="w-full rounded-md border border-border-subtle px-2 py-1 hover:border-border-default focus:border-primary focus:bg-surface-1"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => removeAt(i)}
                        className="mt-1 px-1.5 text-muted-foreground/60 hover:text-destructive"
                        title="删除该规则"
                        aria-label="删除规则"
                    >
                        ✕
                    </button>
                </div>
            ))}
            {rules.length < 8 && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addRule}
                    className="h-7 px-2 text-[11px] text-primary hover:text-primary"
                >
                    + 新增规则
                </Button>
            )}
        </div>
    )
}
