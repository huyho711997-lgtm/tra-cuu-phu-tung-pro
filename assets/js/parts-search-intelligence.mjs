import {normalizePartName} from './parts-relevance.mjs';

const sorted = list => [...new Set((list || []).map(String))].sort();
export function sameKnowledgeScope(rule, context) {
    return rule.brand === context.brand && (rule.kind || 'all') === (context.kind || 'all') &&
        JSON.stringify(sorted(rule.models)) === JSON.stringify(sorted(context.models)) &&
        JSON.stringify(sorted(rule.years)) === JSON.stringify(sorted(context.years));
}

export {normalizePartName};
