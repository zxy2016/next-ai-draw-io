"use client"

import { useState } from "react"
import { toast } from "sonner"

export interface FileData {
    text: string
    charCount: number
    isExtracting: boolean
    base64Url?: string
    sizeKB?: number
}

const COMPRESS_MAX_DIM = 1024
const COMPRESS_JPEG_QUALITY = 0.75
const IMAGE_MIME_WHITELIST = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
]
const MAX_IMAGE_SIZE = 4 * 1024 * 1024 // 4MB

/**
 * 浏览器端通过 Canvas 等比缩放并重压缩图片：
 * - 限制最长边不超过 1024px，等比缩放
 * - 重编码为 image/jpeg 格式，0.75 质量（以自动抹除 EXIF/XMP 元数据）
 * - 返回 mediaType、压缩后的 base64Url、大小（KB）
 */
async function compressImageToBase64(
    file: File,
): Promise<{ mediaType: string; base64Url: string; sizeKB: number }> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () =>
            reject(reader.error ?? new Error("File reading failed"))
        reader.readAsDataURL(file)
    })

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error("Image decoding failed"))
        el.src = dataUrl
    })

    let width = img.naturalWidth
    let height = img.naturalHeight
    if (width > COMPRESS_MAX_DIM || height > COMPRESS_MAX_DIM) {
        const ratio = Math.min(
            COMPRESS_MAX_DIM / width,
            COMPRESS_MAX_DIM / height,
        )
        width = Math.floor(width * ratio)
        height = Math.floor(height * ratio)
    }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas 2D context is unavailable")
    ctx.drawImage(img, 0, 0, width, height)

    const compressedDataUrl = canvas.toDataURL(
        "image/jpeg",
        COMPRESS_JPEG_QUALITY,
    )
    const base64 = compressedDataUrl.split(",")[1] ?? ""
    const sizeKB = Math.round((base64.length * 3) / 4 / 1024)
    return { mediaType: "image/jpeg", base64Url: compressedDataUrl, sizeKB }
}

/**
 * Hook for processing image file uploads.
 * Handles browser-side canvas resizing, JPEG re-compression and state management.
 */
export function useFileProcessor() {
    const [files, setFiles] = useState<File[]>([])
    const [pdfData, setPdfData] = useState<Map<File, FileData>>(new Map()) // Keep variable name 'pdfData' for compatibility

    const handleFileChange = async (newFiles: File[]) => {
        setFiles(newFiles)

        // Compress and encode images
        for (const file of newFiles) {
            const isImage = IMAGE_MIME_WHITELIST.includes(file.type)
            if (!isImage) {
                toast.error(
                    `仅支持图片文件 (PNG, JPEG, WebP, GIF)，已忽略: ${file.name}`,
                )
                setFiles((prev) => prev.filter((f) => f !== file))
                continue
            }

            if (file.size > MAX_IMAGE_SIZE) {
                toast.error(
                    `文件 ${file.name} 超过了 ${MAX_IMAGE_SIZE / 1024 / 1024}MB 限制。`,
                )
                setFiles((prev) => prev.filter((f) => f !== file))
                continue
            }

            const needsCompression = !pdfData.has(file)
            if (needsCompression) {
                // Mark as compressing
                setPdfData((prev) => {
                    const next = new Map(prev)
                    next.set(file, {
                        text: "",
                        charCount: 0,
                        isExtracting: true,
                    })
                    return next
                })

                try {
                    const { base64Url, sizeKB } =
                        await compressImageToBase64(file)
                    console.log(
                        `[useFileProcessor] Image compressed from ${(file.size / 1024).toFixed(1)}KB to ${sizeKB}KB`,
                    )

                    setPdfData((prev) => {
                        const next = new Map(prev)
                        next.set(file, {
                            text: "",
                            charCount: 0,
                            isExtracting: false,
                            base64Url,
                            sizeKB,
                        })
                        return next
                    })
                } catch (error) {
                    console.error("Failed to compress image:", error)
                    toast.error(`图片压缩失败: ${file.name}`)
                    setPdfData((prev) => {
                        const next = new Map(prev)
                        next.delete(file)
                        return next
                    })
                    // Remove file
                    setFiles((prev) => prev.filter((f) => f !== file))
                }
            }
        }

        // Clean up pdfData for removed files
        setPdfData((prev) => {
            const next = new Map(prev)
            for (const key of prev.keys()) {
                if (!newFiles.includes(key)) {
                    next.delete(key)
                }
            }
            return next
        })
    }

    return {
        files,
        pdfData,
        handleFileChange,
        setFiles,
    }
}
