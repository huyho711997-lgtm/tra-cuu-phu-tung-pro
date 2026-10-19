import { normalizePartName, getPartsCandidateFamily } from './parts-relevance.mjs';

const has = (text, pattern) => new RegExp('(?:^| )(' + pattern + ')(?: |$)').test(text);
export function clarificationQuestions(query) {
    const text = normalizePartName(query), family = getPartsCandidateFamily(query), questions = [];
    if (family === 'compressor' && !has(text, 'dieu hoa|lanh|khi')) questions.push({
        key: 'component', title: 'Bạn cần loại máy nén nào?', options: [
            ['ac', 'Máy nén điều hòa', 'máy nén điều hòa'], ['air', 'Máy nén khí', 'máy nén khí'],
            ['internals', 'Bộ hơi máy nén', 'bộ hơi máy nén']
        ]
    });
    if (family === 'bumper' && !has(text, 'truoc|sau')) questions.push({key:'position',title:'Bạn cần cản ở vị trí nào?',options:[['front','Phía trước','trước'],['rear','Phía sau','sau']]});
    if ((['lamp','bulb'].includes(family) || /^(guong|tai xe|chan bun|cua)\b/.test(text)) && !has(text, 'trai|phai|lh|rh|hai ben|ca bo')) {
        questions.push({key:'side',title:'Bạn cần bên nào của xe?',options:[['left','Bên trái','trái'],['right','Bên phải','phải']]});
    }
    if (family === 'lamp' && has(text, 'pha|truoc') && !has(text, 'led|halogen|xenon')) questions.push({key:'technology',title:'Đèn sử dụng công nghệ nào?',options:[['led','LED','LED'],['halogen','Halogen','halogen'],['xenon','Xenon','xenon']]});
    return questions;
}

export function resolveSearchQuery(query, answers = {}) {
    let resolved = String(query).normalize('NFC').trim();
    for (const question of clarificationQuestions(query)) {
        const option = question.options.find(([id]) => id === answers[question.key]);
        if (!option) continue;
        if (question.key === 'component') resolved = resolved.replace(/máy\s+nén|may\s+nen/i, option[2]);
        else resolved += ' ' + option[2];
    }
    // Free text is an explicit replacement reviewed by the user, not an AI instruction.
    return String(answers.description || resolved).trim().replace(/\s+/g, ' ').slice(0, 180);
}

const sorted = list => [...new Set((list || []).map(String))].sort();
export function sameKnowledgeScope(rule, context) {
    return rule.brand === context.brand && (rule.kind || 'all') === (context.kind || 'all') &&
        JSON.stringify(sorted(rule.models)) === JSON.stringify(sorted(context.models)) &&
        JSON.stringify(sorted(rule.years)) === JSON.stringify(sorted(context.years));
}

export function unresolvedQuestions(draft) {
    return clarificationQuestions(resolveSearchQuery(draft.originalQuery,draft.answers));
}

export function applyUnresolvedQuestions(draft, refined) {
    const missing = unresolvedQuestions(draft);
    if (!missing.length) return refined;
    const reason = 'Cần bổ sung: ' + missing.map(q => q.title.replace(/\?$/, '')).join('; ');
    return {...refined, candidates: refined.candidates.map(candidate => candidate.relation === 'same_part'
        ? {...candidate,relation:'uncertain',relevance_verified:false,review_reasons:[...(candidate.review_reasons || []),reason]}
        : candidate)};
}

export { normalizePartName };
