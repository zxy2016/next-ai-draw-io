import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
    plugins: [tsconfigPaths(), react()],
    test: {
        environment: "jsdom",
        include: ["tests/**/*.test.{ts,tsx}"],
        // server-only 包在客户端环境会抛错;单测环境下 stub 为空模块
        // 这样 server-only 模块(如 swimlane/handler、tools/free-mode-tools)能被测试导入
        server: {
            deps: {
                inline: ["server-only"],
            },
        },
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["lib/**/*.ts", "app/**/*.ts", "app/**/*.tsx"],
            exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.d.ts"],
        },
    },
    resolve: {
        alias: {
            "server-only": new URL(
                "./tests/stubs/server-only.ts",
                import.meta.url,
            ).pathname,
        },
    },
})
