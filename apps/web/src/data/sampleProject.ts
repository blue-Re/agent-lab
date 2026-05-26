import type { ProjectSnapshot } from '../lib/agent'

export const sampleProject: ProjectSnapshot = {
  name: 'React Commerce Starter',
  stack: ['React', 'TypeScript', 'Vite', 'CSS Modules'],
  files: [
    {
      path: 'src/App.tsx',
      kind: 'route',
      summary: '应用入口，组织页面布局和核心交互。',
    },
    {
      path: 'src/components/ProductGrid.tsx',
      kind: 'component',
      summary: '商品卡片列表，负责展示价格、标签和行动按钮。',
    },
    {
      path: 'src/components/AuthDialog.tsx',
      kind: 'component',
      summary: '登录弹窗组件，包含表单校验和提交状态。',
    },
    {
      path: 'src/components/Button.tsx',
      kind: 'component',
      summary: '项目统一按钮组件，封装尺寸、色彩和禁用态。',
    },
    {
      path: 'src/styles/theme.css',
      kind: 'style',
      summary: '设计 token，包括主色、圆角、阴影和间距。',
    },
    {
      path: 'src/lib/api.ts',
      kind: 'api',
      summary: '前端请求封装，统一处理 API 地址和错误返回。',
    },
    {
      path: 'vite.config.ts',
      kind: 'config',
      summary: 'Vite 构建配置和开发服务器代理。',
    },
  ],
}
