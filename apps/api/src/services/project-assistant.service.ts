import type { ProjectQuestionAnswer, TaskTemplate } from '@agent-lab/shared'
import { deepSeekClient } from '../llm/deepseek.client.ts'
import { memoryRepository } from '../repositories/memory.repository.ts'
import { projectRepository } from '../repositories/project.repository.ts'

function fallbackAnswer(question: string, references: string[]): ProjectQuestionAnswer {
  return {
    answer: `我已根据项目索引检索这个问题：“${question}”。当前可以先关注这些相关文件：${references.join(
      '、',
    ) || '暂无明确匹配文件'}。更深入的回答需要结合文件内容继续检索。`,
    references,
  }
}

export class ProjectAssistantService {
  async answerQuestion(projectId: string, question: string): Promise<ProjectQuestionAnswer> {
    const project = projectRepository.findById(projectId)

    if (!project) {
      throw new Error('Project not found')
    }

    const keywords = question.toLowerCase().split(/\s+|，|。|、/).filter(Boolean)
    const matchedFiles = project.files
      .filter((file) =>
        keywords.some((keyword) =>
          `${file.path} ${file.kind} ${file.summary}`.toLowerCase().includes(keyword),
        ),
      )
      .slice(0, 8)
    const references = (matchedFiles.length ? matchedFiles : project.files.slice(0, 5)).map(
      (file) => file.path,
    )
    const memories = memoryRepository.listProjectMemories(projectId).slice(0, 8)

    try {
      const result = (await deepSeekClient.generateJson(
        '你是 AgentLab 的项目问答助手。请基于项目索引、文件摘要和长期记忆回答用户问题。只返回 JSON：{"answer":"string","references":["file"]}。',
        {
          question,
          project: {
            name: project.name,
            stack: project.stack,
            files: project.files.slice(0, 80),
          },
          matchedFiles,
          memories,
        },
      )) as Partial<ProjectQuestionAnswer>

      return {
        answer: String(result.answer ?? fallbackAnswer(question, references).answer),
        references: Array.isArray(result.references)
          ? result.references.map(String)
          : references,
      }
    } catch {
      return fallbackAnswer(question, references)
    }
  }

  listTemplates(projectId: string): TaskTemplate[] {
    const project = projectRepository.findById(projectId)

    if (!project) {
      throw new Error('Project not found')
    }

    const stack = project.stack.join(' / ') || '当前技术栈'
    const hasApi = project.files.some((file) => file.kind === 'api')
    const hasStyle = project.files.some((file) => file.kind === 'style')

    return [
      {
        id: 'architecture-review',
        title: '分析项目架构',
        category: 'analysis',
        prompt: `分析 ${project.name} 的 ${stack} 架构，指出入口、模块边界和潜在技术债。`,
      },
      {
        id: 'quality-check',
        title: '质量检查',
        category: 'quality',
        prompt: '检查这个项目的可维护性问题，重点关注大文件、重复逻辑、缺少测试和 lint/build 风险。',
      },
      {
        id: 'api-state',
        title: hasApi ? '统一 API 状态' : '设计 API 层',
        category: 'refactor',
        prompt: hasApi
          ? '检查项目 API 调用链路，统一 loading/error/empty 状态和错误提示。'
          : '为项目设计统一 API 请求层，包括错误处理、loading 状态和类型定义。',
      },
      {
        id: 'ui-system',
        title: hasStyle ? '整理 UI 规范' : '建立 UI 基础规范',
        category: 'feature',
        prompt: hasStyle
          ? '审查项目样式系统，提取可复用 design token 和基础组件规范。'
          : '为项目建立基础 UI 规范，包括颜色、间距、按钮和卡片组件建议。',
      },
    ]
  }
}

export const projectAssistantService = new ProjectAssistantService()
