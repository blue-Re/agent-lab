import type { EvalCase } from '@agent-lab/shared'

export const goldenCases: EvalCase[] = [
  {
    id: 'analyze-architecture',
    title: '分析项目整体架构',
    requirement: '分析这个前端项目的整体架构，列出入口文件、关键模块边界，并指出潜在技术债。',
    category: 'analysis',
    expectations: {
      minPlanItems: 3,
      minReviewItems: 2,
      requireKeywords: ['入口', '模块'],
    },
  },
  {
    id: 'unify-api-errors',
    title: '统一 API 错误处理',
    requirement: '为项目里的 API 调用统一错误处理，提供 loading/error/empty 状态的最小实现。',
    category: 'quality',
    expectations: {
      minPlanItems: 3,
      minReviewItems: 2,
      requireDiff: true,
      requireKeywords: ['error', 'loading'],
    },
  },
  {
    id: 'add-login-modal',
    title: '新增登录弹窗组件',
    requirement: '为项目新增登录弹窗组件，复用现有 Button 样式，并提供受控的 open/close props。',
    category: 'feature',
    expectations: {
      minPlanItems: 3,
      requireDiff: true,
      minReviewItems: 2,
      requireKeywords: ['Modal', 'Button'],
    },
  },
  {
    id: 'extract-design-tokens',
    title: '抽取设计 token',
    requirement: '审查项目样式系统，抽取可复用的颜色、间距、字体 token，并给出落地建议。',
    category: 'refactor',
    expectations: {
      minPlanItems: 3,
      minReviewItems: 2,
      requireKeywords: ['token', '样式'],
    },
  },
]
