/**
 * 泳道图模式工具函数集
 */

/**
 * 判断 AI 的回复内容是否包含“引导用户点击上方模式切换按钮切换到自由模式”的相关提示
 * @param content 回复内容文本
 * @param currentMode 当前绘图模式
 */
export function shouldTriggerFlowModePulse(
    content: string | undefined | null,
    currentMode: string,
): boolean {
    if (currentMode !== "swimlane" || !content) {
        return false
    }

    const hasFreeMode =
        content.includes("自由模式") || content.includes("模式切换")
    const hasClickAction = content.includes("点击") || content.includes("切换")

    return hasFreeMode && hasClickAction
}
