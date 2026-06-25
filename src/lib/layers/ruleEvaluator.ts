import { CloudNode } from '../../types/cloud';
import { RuleGroup, Rule, LogicalOperator } from '../../types/layers';

/**
 * Safely accesses a nested property using dot notation.
 * @example getValue(node, "data.category")
 */
function getValue(obj: any, path: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

/**
 * Evaluates a single rule against a node.
 */
function evaluateRule(node: CloudNode, rule: Rule): boolean {
  const nodeValue = getValue(node, rule.field);

  // If the field doesn't exist, we generally return false, unless specifically checking for inequality
  if (nodeValue === undefined) {
    if (rule.operator === 'neq') return true;
    if (rule.operator === 'nin') return true;
    return false;
  }

  const { operator, value } = rule;

  switch (operator) {
    case 'eq':
      return nodeValue === value;
    case 'neq':
      return nodeValue !== value;
    case 'in':
      return Array.isArray(value) && value.includes(nodeValue);
    case 'nin':
      return Array.isArray(value) && !value.includes(nodeValue);
    case 'contains':
      if (typeof nodeValue === 'string' && typeof value === 'string') {
        return nodeValue.toLowerCase().includes(value.toLowerCase());
      }
      if (Array.isArray(nodeValue)) {
        return nodeValue.includes(value);
      }
      return false;
    case 'startsWith':
      if (typeof nodeValue === 'string' && typeof value === 'string') {
        return nodeValue.toLowerCase().startsWith(value.toLowerCase());
      }
      return false;
    case 'regex':
      if (typeof nodeValue === 'string' && typeof value === 'string') {
        try {
          const regex = new RegExp(value, 'i');
          return regex.test(nodeValue);
        } catch (e) {
          return false;
        }
      }
      return false;
    default:
      return false;
  }
}

/**
 * Evaluates a node against a recursively nested RuleGroup.
 * @param node The node to evaluate.
 * @param ruleGroup The group of rules (AND, OR, NOT).
 * @returns boolean True if the node matches the rules.
 */
export function evaluateNode(node: CloudNode, ruleGroup: RuleGroup): boolean {
  if (!ruleGroup.rules || ruleGroup.rules.length === 0) {
    return true; // Empty rule group matches everything
  }

  if (ruleGroup.operator === 'AND') {
    return ruleGroup.rules.every(ruleOrGroup => {
      if ('operator' in ruleOrGroup && 'rules' in ruleOrGroup) {
        return evaluateNode(node, ruleOrGroup as RuleGroup);
      }
      return evaluateRule(node, ruleOrGroup as Rule);
    });
  }

  if (ruleGroup.operator === 'OR') {
    return ruleGroup.rules.some(ruleOrGroup => {
      if ('operator' in ruleOrGroup && 'rules' in ruleOrGroup) {
        return evaluateNode(node, ruleOrGroup as RuleGroup);
      }
      return evaluateRule(node, ruleOrGroup as Rule);
    });
  }

  if (ruleGroup.operator === 'NOT') {
    // NOT implies none of the rules should match (NAND)
    return !ruleGroup.rules.some(ruleOrGroup => {
      if ('operator' in ruleOrGroup && 'rules' in ruleOrGroup) {
        return evaluateNode(node, ruleOrGroup as RuleGroup);
      }
      return evaluateRule(node, ruleOrGroup as Rule);
    });
  }

  return false;
}
