"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { SwimlaneIR } from "@/lib/swimlane/ir/schema"
import { cn } from "@/lib/utils"
import { IREditor } from "./IREditor"

/**
 * IR 编辑抽屉。
 *
 * - 复用 Radix Dialog 的 Root/Portal/Overlay,但自定义 Content,从右侧 slide-in
 *   取代默认的居中 modal 行为
 * - 抽屉打开时,从 props.ir 拷贝出一份 *本地 draft*,所有编辑操作都改 draft
 * - 用户点「保存并应用」才把 draft 通过 onSave 推回父级(IR-D 阶段接渲染逻辑)
 * - 点「取消」或外部关闭(ESC / 点 overlay)会丢弃 draft
 *
 * 不直接接 onSave 到外层 state setter,是因为想要:
 *   1. 编辑过程不打扰画布(避免边改边重画)
 *   2. 留出"已修改但未保存"的视觉提示(下方 footer 有 dirty 标记)
 */
interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    ir: SwimlaneIR | null
    onSave: (next: SwimlaneIR) => void
}

export function IREditorDrawer({ open, onOpenChange, ir, onSave }: Props) {
    // 抽屉每次打开时基于最新 ir 重新初始化 draft;关闭时清掉
    const [draft, setDraft] = useState<SwimlaneIR | null>(ir)

    useEffect(() => {
        if (open) {
            setDraft(ir)
        }
    }, [open, ir])

    const dirty =
        draft !== null &&
        ir !== null &&
        JSON.stringify(draft) !== JSON.stringify(ir)

    function handleSaveClick() {
        if (draft) {
            onSave(draft)
            onOpenChange(false)
        }
    }

    function handleResetClick() {
        setDraft(ir)
    }

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay
                    className={cn(
                        "fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out",
                        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                        "duration-200",
                    )}
                />
                <DialogPrimitive.Content
                    className={cn(
                        // 右侧固定抽屉
                        "fixed inset-y-0 right-0 z-50 w-full sm:max-w-md md:max-w-lg",
                        "flex flex-col bg-surface-0 shadow-2xl",
                        "border-l border-border-subtle",
                        // 动画:从右侧滑入
                        "data-[state=open]:animate-in data-[state=closed]:animate-out",
                        "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
                        "duration-250",
                    )}
                    aria-describedby={undefined}
                >
                    {/* Header */}
                    <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
                        <div className="min-w-0">
                            <DialogPrimitive.Title className="truncate text-base font-semibold tracking-tight">
                                IR 编辑器
                            </DialogPrimitive.Title>
                            {draft?.title && (
                                <p className="truncate text-xs text-muted-foreground">
                                    {draft.title}
                                </p>
                            )}
                        </div>
                        <DialogPrimitive.Close
                            className={cn(
                                "rounded-lg p-1.5 text-muted-foreground/70 hover:text-foreground hover:bg-accent",
                                "transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                            )}
                            aria-label="关闭"
                        >
                            <XIcon className="size-4" />
                        </DialogPrimitive.Close>
                    </header>

                    {/* Body */}
                    <div className="min-h-0 flex-1 px-4 py-3">
                        {draft ? (
                            <IREditor ir={draft} onChange={setDraft} />
                        ) : (
                            <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
                                还没有 IR 可以编辑。先在右侧对话里描述业务流程,
                                等模型生成图后这里就能用了。
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {draft && (
                        <footer className="flex shrink-0 items-center justify-between border-t border-border-subtle px-4 py-3">
                            <div className="text-xs text-muted-foreground">
                                {dirty ? (
                                    <span className="text-amber-600 dark:text-amber-400">
                                        ● 有未保存改动
                                    </span>
                                ) : (
                                    <span>无变更</span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleResetClick}
                                    disabled={!dirty}
                                >
                                    重置
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleSaveClick}
                                    disabled={!dirty}
                                >
                                    保存并应用
                                </Button>
                            </div>
                        </footer>
                    )}
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}
