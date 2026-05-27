"use client"

import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Sparkles } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { useDictionary } from "@/hooks/use-dictionary"

/**
 * localStorage 中用于持久化「不再提醒」偏好的 key。
 * 遵循项目统一前缀 `next-ai-draw-io-`。
 */
export const IR_ONBOARDING_DISMISSED_KEY =
    "next-ai-draw-io-ir-editor-onboarding-dismissed"

/** 弹出延迟（ms） */
const POPUP_DELAY = 500
/** 自动关闭超时（ms） */
const AUTO_CLOSE_TIMEOUT = 12000 // 加长展示时间，方便用户阅读

interface IrEditorOnboardingProps {
    children: React.ReactNode
}

/**
 * IR 编辑按钮新手引导组件（高级精致 UI 版）。
 *
 * 当用户首次看到 IR 编辑按钮时：
 * 1. 按钮后方出现一层酷炫的 AI 渐变光晕，并带有呼吸 (animate-pulse) 和涟漪 (animate-ping) 特效，极大增强存在感。
 * 2. 500ms 后自动弹出玻璃微光材质的 Popover 气泡，突出全新功能标识。
 * 3. 气泡中展示精心设计的标题、功能描述，并支持“不再提醒”和“我知道了”按钮双选。
 * 4. “我知道了”点击后仅关闭本次；“不再提醒”点击后写入 localStorage 永久屏蔽该引导。
 */
export function IrEditorOnboarding({ children }: IrEditorOnboardingProps) {
    const dict = useDictionary()
    const [showPopover, setShowPopover] = useState(false)
    const [showPulse, setShowPulse] = useState(false)
    const [dismissed, setDismissed] = useState(false)

    // 用于跟踪组件是否已卸载，防止定时器回调中操作已卸载组件
    const isMountedRef = useRef(true)
    // 延迟弹出和自动关闭的定时器引用
    const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // 挂载时读取 localStorage 判断是否已永久关闭
    useEffect(() => {
        try {
            const val = localStorage.getItem(IR_ONBOARDING_DISMISSED_KEY)
            if (val === "true") {
                setDismissed(true)
            }
        } catch {
            // localStorage 不可用时静默失败
        }
    }, [])

    // 若未被永久关闭，挂载后延迟弹出 Popover 并启动脉冲光环
    useEffect(() => {
        if (dismissed) return

        isMountedRef.current = true

        popupTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return
            setShowPulse(true)
            setShowPopover(true)
        }, POPUP_DELAY)

        return () => {
            isMountedRef.current = false
            if (popupTimerRef.current) {
                clearTimeout(popupTimerRef.current)
                popupTimerRef.current = null
            }
        }
    }, [dismissed])

    // Popover 显示后启动自动关闭定时器
    useEffect(() => {
        if (!showPopover) return

        autoCloseTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return
            setShowPopover(false)
        }, AUTO_CLOSE_TIMEOUT)

        return () => {
            if (autoCloseTimerRef.current) {
                clearTimeout(autoCloseTimerRef.current)
                autoCloseTimerRef.current = null
            }
        }
    }, [showPopover])

    /**
     * 用户点击「不再提醒」：
     * 1. 写入 localStorage 永久记住
     * 2. 立即关闭 Popover 和脉冲动画
     */
    const handleDismissForever = useCallback(() => {
        try {
            localStorage.setItem(IR_ONBOARDING_DISMISSED_KEY, "true")
        } catch {
            // localStorage 不可用时静默失败
        }
        setDismissed(true)
        setShowPopover(false)
        setShowPulse(false)
    }, [])

    /**
     * 用户点击「我知道了」：
     * 1. 仅关闭本次 Popover 与动画，不写入 localStorage
     */
    const handleDismissOnce = useCallback(() => {
        setShowPopover(false)
        setShowPulse(false)
    }, [])

    /**
     * Popover 的 onOpenChange 回调：
     * 用户点击外部区域关闭卡片（本次关闭，下次仍弹出）
     */
    const handleOpenChange = useCallback((open: boolean) => {
        if (!open) {
            setShowPopover(false)
        }
    }, [])

    // 已永久关闭：直接透传 children，不渲染任何引导 UI
    if (dismissed) {
        return <>{children}</>
    }

    return (
        <Popover open={showPopover} onOpenChange={handleOpenChange}>
            <PopoverAnchor asChild>
                <div
                    className={`relative inline-block ${showPulse ? "ir-pulse-animation" : ""}`}
                    data-testid="ir-onboarding-anchor"
                >
                    {showPulse && (
                        <>
                            {/* 炫彩渐变光晕背景，利用模糊产生高级外发光 */}
                            <div className="absolute -inset-1.5 rounded-lg bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 opacity-75 blur-md animate-pulse pointer-events-none z-0" />
                            {/* 动态扩散的波纹边缘 */}
                            <div className="absolute -inset-1.5 rounded-lg border border-indigo-500/80 animate-ping opacity-30 pointer-events-none z-0" />
                        </>
                    )}
                    <div className="relative z-10">{children}</div>
                </div>
            </PopoverAnchor>
            <PopoverContent
                side="bottom"
                sideOffset={8}
                className="w-80 p-4 bg-popover/90 backdrop-blur-md border border-indigo-500/30 shadow-[0_10px_30px_rgba(79,70,229,0.25)] rounded-xl relative overflow-hidden z-50"
                data-testid="ir-onboarding-popover"
            >
                {/* 气泡顶部的磨砂炫彩渐变装饰条 */}
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600" />

                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1 rounded-md bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
                            <Sparkles className="h-4 w-4 animate-pulse" />
                        </div>
                        <h4 className="font-semibold text-sm text-foreground leading-none">
                            {dict.nav.irEditorOnboardingTitle}
                        </h4>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                        {dict.nav.irEditorOnboardingDesc}
                    </p>

                    <div className="flex justify-between items-center gap-2 mt-2 pl-7">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 px-2 py-1 h-7"
                            onClick={handleDismissForever}
                            data-testid="ir-onboarding-dismiss-btn"
                        >
                            {dict.nav.irEditorDismiss}
                        </Button>
                        <Button
                            size="sm"
                            className="text-xs bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-medium shadow-[0_2px_8px_rgba(79,70,229,0.35)] transition-all duration-200 px-3 py-1 h-7 rounded-lg active:scale-95"
                            onClick={handleDismissOnce}
                            data-testid="ir-onboarding-ok-btn"
                        >
                            {dict.nav.irEditorGotIt}
                        </Button>
                    </div>
                </div>
                {/* Radix UI 指针 */}
                <PopoverPrimitive.Arrow
                    className="fill-popover"
                    width={12}
                    height={6}
                />
            </PopoverContent>
        </Popover>
    )
}
