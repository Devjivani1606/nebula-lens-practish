import { CloudNode } from './cloud';

export type RuleOperator = "eq" | "neq" | "in" | "nin" | "contains" | "startsWith" | "regex";
export type LogicalOperator = "AND" | "OR" | "NOT";

export interface Rule {
  field: string;
  operator: RuleOperator;
  value: string | string[] | number | boolean;
}

export interface RuleGroup {
  operator: LogicalOperator;
  rules: Array<Rule | RuleGroup>;
}

export type LayerBlendMode = "additive" | "subtractive" | "exclusive" | "override";

export interface LayerDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  isSystem: boolean;
  isEnabled: boolean; // default enabled state
  blendMode: LayerBlendMode;
  rules: RuleGroup;
  priority: number;
  tags: string[];
}

export interface LayerState {
  enabled: boolean;
  opacity: number;
  locked: boolean;
}

export interface LayerStackItem {
  definition: LayerDefinition;
  state: LayerState;
}

export interface SerializedLayerConfig {
  version: string;
  layers: LayerDefinition[];
  states: Record<string, LayerState>;
}
