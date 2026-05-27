# AgentLab Coding Conventions (for AI / Human contributors)

> 任何 AI Agent / 协作者在改本仓库前必须先阅读以下规则，否则提交可能被拒。

## 必读规则（按优先级）

1. [`.cursor/rules/frontend-structure.mdc`](./.cursor/rules/frontend-structure.mdc) — 前端工程规范（组件即目录、Zustand、React Router、性能、a11y）
2. [`.cursor/rules/backend-structure.mdc`](./.cursor/rules/backend-structure.mdc) — 后端工程规范（分层、SSE、Tool、Patch、共享类型）

## 一句话总结

- **组件 / 页面 / 布局** = **同名目录 + `index.tsx`**（如有样式，配 `index.css`）。禁止散落的 `Foo.tsx` + `Foo.css`。
- **业务状态走 Zustand store**，禁止藏在组件 `useState` 里。
- **重型依赖（Monaco / Recharts / Diff）**按 page 维度 `lazy()`，并在 vite `manualChunks` 单独分组。
- **后端三层（controller → service → repository）严格单向依赖**。
- **跨前后端类型唯一来源**：`packages/shared`。
- **提交前**：`pnpm typecheck && pnpm lint && pnpm build` 全过。

## 目录速查

```text
agent-lab/
  apps/
    api/                  # Koa2 + SQLite Agent backend
    web/                  # React 19 + Vite + Zustand + React Router
  packages/
    shared/               # 前后端共享类型 + zod schema
    agent-core/           # Prompt / 评测 / 记忆等纯函数
  .cursor/rules/          # 项目级编码规范（AI Agent 必读）
```
