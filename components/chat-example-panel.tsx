"use client"

import {
    Cloud,
    FileText,
    GitBranch,
    LayoutGrid,
    Palette,
    Terminal,
    Zap,
} from "lucide-react"
import { useDictionary } from "@/hooks/use-dictionary"
import { getAssetUrl } from "@/lib/base-path"

interface ExampleCardProps {
    icon: React.ReactNode
    title: string
    description: string
    onClick: () => void
    isNew?: boolean
}

function ExampleCard({
    icon,
    title,
    description,
    onClick,
    isNew,
}: ExampleCardProps) {
    const dict = useDictionary()

    return (
        <button
            onClick={onClick}
            className={`group w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 hover:shadow-sm ${
                isNew
                    ? "border-primary/40 ring-1 ring-primary/20"
                    : "border-border/60"
            }`}
        >
            <div className="flex items-start gap-3">
                <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isNew
                            ? "bg-primary/20 group-hover:bg-primary/25"
                            : "bg-primary/10 group-hover:bg-primary/15"
                    }`}
                >
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                            {title}
                        </h3>
                        {isNew && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded">
                                {dict.common.new}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {description}
                    </p>
                </div>
            </div>
        </button>
    )
}

export default function ExamplePanel({
    setInput,
    setFiles,
    minimal = false,
}: {
    setInput: (input: string) => void
    setFiles: (files: File[]) => void
    minimal?: boolean
}) {
    const dict = useDictionary()

    const handleReplicateFlowchart = async () => {
        setInput("帮我复制这个流程图")

        try {
            const response = await fetch(getAssetUrl("/example.png"))
            const blob = await response.blob()
            const file = new File([blob], "example.png", { type: "image/png" })
            setFiles([file])
        } catch (error) {
            console.error(dict.errors.failedToLoadExample, error)
        }
    }

    const handleReplicateArchitecture = async () => {
        setInput("用 AWS 风格复制这个架构图")

        try {
            const response = await fetch(getAssetUrl("/architecture.png"))
            const blob = await response.blob()
            const file = new File([blob], "architecture.png", {
                type: "image/png",
            })
            setFiles([file])
        } catch (error) {
            console.error(dict.errors.failedToLoadExample, error)
        }
    }

    const handleSketchExample = async () => {
        setInput("帮我梳理这个流程")

        try {
            const response = await fetch(getAssetUrl("/example_flow.jpg"))
            const blob = await response.blob()
            const file = new File([blob], "example_flow.jpg", {
                type: "image/jpeg",
            })
            setFiles([file])
        } catch (error) {
            console.error(dict.errors.failedToLoadExample, error)
        }
    }

    return (
        <div className={minimal ? "" : "py-6 px-2 animate-fade-in"}>
            {!minimal && (
                <>
                    {/* Welcome section */}
                    <div className="text-center mb-6">
                        <h2 className="text-lg font-semibold text-foreground mb-2">
                            {dict.examples.title}
                        </h2>
                        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                            {dict.examples.subtitle}
                        </p>
                    </div>
                </>
            )}

            {/* Examples grid */}
            <div className="space-y-3">
                {!minimal && (
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                        {dict.examples.quickExamples}
                    </p>
                )}

                <div className="grid gap-2">
                    <ExampleCard
                        icon={<LayoutGrid className="w-4 h-4 text-primary" />}
                        title={dict.examples.swimlaneDiagram}
                        description={dict.examples.swimlaneDescription}
                        onClick={() => {
                            setInput(
                                "帮我梳理财务报销流程。\n参与角色：员工、直线经理、财务共享。\n主要步骤：\n1. 员工填写报销申请单，附上发票\n2. 直线经理审核业务合理性并审批确认\n3. 财务共享核查发票合规性及报销金额\n4. 审批通过后财务部完成付款并归档",
                            )
                            setFiles([])
                        }}
                        isNew
                    />

                    <ExampleCard
                        icon={<FileText className="w-4 h-4 text-primary" />}
                        title={dict.examples.paperToDiagram}
                        description={dict.examples.paperDescription}
                        onClick={handleSketchExample}
                    />

                    <ExampleCard
                        icon={<Zap className="w-4 h-4 text-primary" />}
                        title={dict.examples.animatedDiagram}
                        description={dict.examples.animatedDescription}
                        onClick={() => {
                            setInput(
                                "用带动画连接器的图表展示 Transformer 架构",
                            )
                            setFiles([])
                        }}
                    />

                    <ExampleCard
                        icon={<Cloud className="w-4 h-4 text-primary" />}
                        title={dict.examples.awsArchitecture}
                        description={dict.examples.awsDescription}
                        onClick={handleReplicateArchitecture}
                    />

                    <ExampleCard
                        icon={<GitBranch className="w-4 h-4 text-primary" />}
                        title={dict.examples.replicateFlowchart}
                        description={dict.examples.replicateDescription}
                        onClick={handleReplicateFlowchart}
                    />

                    <ExampleCard
                        icon={<Palette className="w-4 h-4 text-primary" />}
                        title={dict.examples.creativeDrawing}
                        description={dict.examples.creativeDescription}
                        onClick={() => {
                            setInput("帮我画一只猫")
                            setFiles([])
                        }}
                    />
                </div>

                <p className="text-[11px] text-muted-foreground/60 text-center mt-4">
                    {dict.examples.cachedNote}
                </p>
            </div>
        </div>
    )
}
