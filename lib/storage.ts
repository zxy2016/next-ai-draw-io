// Centralized localStorage keys for quota tracking and settings
// Chat data is now stored in IndexedDB via session-storage.ts

export const STORAGE_KEYS = {
    // Quota tracking
    requestCount: "hdraw-request-count",
    requestDate: "hdraw-request-date",
    tokenCount: "hdraw-token-count",
    tokenDate: "hdraw-token-date",
    tpmCount: "hdraw-tpm-count",
    tpmMinute: "hdraw-tpm-minute",

    // Settings
    accessCode: "hdraw-access-code",
    accessCodeRequired: "hdraw-access-code-required",
    aiProvider: "hdraw-ai-provider",
    aiBaseUrl: "hdraw-ai-base-url",
    aiApiKey: "hdraw-ai-api-key",
    aiModel: "hdraw-ai-model",

    // Multi-model configuration
    modelConfigs: "hdraw-model-configs",
    selectedModelId: "hdraw-selected-model-id",

    // Chat input preferences
    sendShortcut: "hdraw-send-shortcut",

    // Diagram validation
    vlmValidationEnabled: "hdraw-vlm-validation-enabled",

    // Custom system message
    customSystemMessage: "hdraw-custom-system-message",

    // Panel visibility
    showRecentChats: "hdraw-show-recent-chats",
    showMyTemplates: "hdraw-show-my-templates",
    showQuickExamples: "hdraw-show-quick-examples",
} as const

/**
 * Migrate localStorage keys from previous brand prefix to new prefix
 */
export function migrateLocalStorage() {
    if (
        typeof window === "undefined" ||
        typeof localStorage === "undefined" ||
        typeof localStorage.getItem !== "function"
    )
        return

    for (const newKey of Object.values(STORAGE_KEYS)) {
        if (localStorage.getItem(newKey) === null) {
            // Try next-ai-draw-io- prefix
            const oldKey1 = newKey.replace(/^hdraw-/, "next-ai-draw-io-")
            const oldVal1 = localStorage.getItem(oldKey1)
            if (oldVal1 !== null) {
                localStorage.setItem(newKey, oldVal1)
                continue
            }

            // Try next-ai-drawio- prefix
            const oldKey2 = newKey.replace(/^hdraw-/, "next-ai-drawio-")
            const oldVal2 = localStorage.getItem(oldKey2)
            if (oldVal2 !== null) {
                localStorage.setItem(newKey, oldVal2)
            }
        }
    }
}

// Self-execute on client load to avoid useEffect timing issues
if (typeof window !== "undefined") {
    migrateLocalStorage()
}
