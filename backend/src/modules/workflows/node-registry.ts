import { Injectable, OnModuleInit } from '@nestjs/common';
import type { WorkflowNodeCatalogItem } from '@ai-video-studio/shared';
import { ALL_NODE_DEFINITIONS, type WorkflowNodeDefinition } from './nodes';

@Injectable()
export class NodeRegistry implements OnModuleInit {
  private readonly byType = new Map<string, WorkflowNodeDefinition>();

  onModuleInit() {
    for (const def of ALL_NODE_DEFINITIONS) {
      if (this.byType.has(def.type)) {
        throw new Error(`重复注册工作流节点: ${def.type}`);
      }
      this.byType.set(def.type, def);
    }
  }

  get(type: string): WorkflowNodeDefinition | undefined {
    return this.byType.get(type);
  }

  require(type: string): WorkflowNodeDefinition {
    const d = this.byType.get(type);
    if (!d) throw new Error(`未知工作流节点类型: ${type}`);
    return d;
  }

  catalog(): WorkflowNodeCatalogItem[] {
    return [...this.byType.values()].map(
      ({
        type,
        title,
        category,
        description,
        inputs,
        outputs,
        defaultParams,
        paramSchema,
        domains,
      }) => ({
        type,
        title,
        category,
        description,
        inputs,
        outputs,
        defaultParams,
        paramSchema,
        domains,
      }),
    );
  }
}
