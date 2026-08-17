import { inputNodes } from './input.nodes';
import { outputNodes } from './output.nodes';
import { aiNodes } from './ai.nodes';
import { assetNodes } from './asset.nodes';
import { libraryNodes } from './library.nodes';
import type { WorkflowNodeDefinition } from './types';

export const ALL_NODE_DEFINITIONS: WorkflowNodeDefinition[] = [
  ...inputNodes,
  ...outputNodes,
  ...aiNodes,
  ...assetNodes,
  ...libraryNodes,
];

export * from './types';
