import type { CapabilityItem } from '@agent-lab/shared'

export class CapabilityService {
  list(): CapabilityItem[] {
    return [
      {
        id: 'project-index',
        title: '真实项目索引',
        description: '支持从本地目录导入项目，扫描文件、识别技术栈并写入 SQLite。',
        status: 'available',
      },
      {
        id: 'tool-runtime',
        title: '工具运行时',
        description: '支持读文件、搜代码、生成 patch 草案和受限 lint 命令。',
        status: 'available',
      },
      {
        id: 'patch-workflow',
        title: 'Patch 工作流',
        description: '支持保存 patch 和安全应用新文件补丁，复杂修改仍需人工审查。',
        status: 'partial',
      },
      {
        id: 'multi-agent',
        title: '多 Agent 分工',
        description: 'Planner、Researcher、Coder、Reviewer 角色尚未拆分。',
        status: 'missing',
      },
      {
        id: 'vector-memory',
        title: '向量检索与记忆召回',
        description: '目前是 SQLite 长期记忆，尚未接入 embedding 与相似度召回。',
        status: 'missing',
      },
      {
        id: 'worker-queue',
        title: '后台队列与并发控制',
        description: '已有异步 run 接口，但还缺独立 worker、取消传播和并发策略。',
        status: 'partial',
      },
      {
        id: 'evaluation-suite',
        title: '评测数据集',
        description: '已有单次自动评分，尚缺固定样例集、趋势图和回归评测。',
        status: 'partial',
      },
      {
        id: 'security',
        title: '工具安全边界',
        description: '已有路径沙箱和受限命令，尚缺用户审批、敏感文件策略和审计。',
        status: 'partial',
      },
    ]
  }
}

export const capabilityService = new CapabilityService()
