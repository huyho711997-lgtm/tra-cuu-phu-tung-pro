// Deterministic checks protect part identity before and after an AI decision.
export function normalizePartName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
const word = (text, value) => (' ' + text + ' ').includes(' ' + value + ' ');
const head = value => normalizePartName(value).replace(/^(?:(?:cum|bo|tam|chi tiet|nguyen cum)\s+)+/, '');

export function getPartsCandidateFamily(value) {
    const text = head(value);
    // Classify the named item, never a parent assembly mentioned later in its name.
    if (/^(?:bat|pat)\b|^gia (?:do|cai|bat)\b/.test(text)) return 'mount';
    if (/^xuong\b|^khung\b|^thanh (?:gia cuong|tang cung|dung|tren|duoi)\b|^dam\b/.test(text)) return 'reinforcement';
    if (/^nep\b/.test(text)) return 'trim';
    if (/^op\b/.test(text)) return 'cover';
    if (/^bong den\b/.test(text)) return 'bulb';
    if (/^den\b/.test(text)) return 'lamp';
    if (/^can gat\b/.test(text) && /cần|gat|gạt/i.test(String(value))) return 'wiper';
    if (/^(?:(?:cụm|bộ|tấm|chi tiết)\s+)*cần(?:\s|$)/i.test(String(value || '').normalize('NFC').trim())) return '';
    if (/^can\b|^ba do soc\b|^badosoc\b/.test(text)) return 'bumper';
    if (/^(?:duong ong|ong|tuy o)\b/.test(text)) return 'pipe';
    if (/^quat\b/.test(text)) return 'fan';
    if (/^lam mat (?:bao gom|gom|tong thanh)\b|^(?:mo dun|module) lam mat\b/.test(text)) return 'cooling-module';
    if (/^hoi\b/.test(text) && /(?:may nen|loc lanh|loc dieu hoa)/.test(text)) return 'compressor-internals';
    if (/^(?:puly|pu ly|bu ly|buly)\b/.test(text)) return 'pulley';
    if (/^ly hop\b/.test(text)) return 'clutch';
    if (/^(?:phot|gioang|ron|oring|o ring)\b/.test(text)) return 'seal';
    if (/^cuon (?:hut|dien)\b/.test(text)) return 'coil';
    if (/^may nen\b|^loc (?:lanh|dieu hoa)\b/.test(text)) return 'compressor';
    if (/^(?:gian|dan) nong\b/.test(text)) return 'condenser';
    if (/^(?:gian|dan) lanh\b/.test(text)) return 'evaporator';
    if (/^ket (?:nuoc|lam mat dong co)\b/.test(text)) return 'radiator';
    return '';
}

function canonical(value, family) {
    let text = head(value);
    if (family === 'compressor') text = text.replace(/^(?:loc lanh|loc dieu hoa|may nen(?: (?:dieu hoa|lanh))?)(?= |$)/, 'may nen');
    if (family === 'condenser') text = text.replace(/^dan nong\b/, 'gian nong');
    if (family === 'evaporator') text = text.replace(/^dan lanh\b/, 'gian lanh');
    if (family === 'bumper') text = text.replace(/^(?:ba do soc|badosoc)\b/, 'can');
    return text;
}

export function getPartsCandidateRelevance(query, name) {
    const requested = normalizePartName(query), candidate = normalizePartName(name);
    const qFamily = getPartsCandidateFamily(query), cFamily = getPartsCandidateFamily(name);
    const different = reason => ({relation:'related_part',reason});
    const uncertain = reason => ({relation:'uncertain',reason});
    if (qFamily && cFamily && qFamily !== cFamily) return different('Khác loại chi tiết; không phải cùng phụ tùng đang tìm.');
    for (const [first,second,title] of [['truoc','sau','trước / sau'],['trai','phai','trái / phải']]) {
        const q1=word(requested,first),q2=word(requested,second),c1=word(candidate,first),c2=word(candidate,second);
        if (q1!==q2 && c1!==c2 && q1!==c1) return different('Không đúng vị trí '+title+' đã yêu cầu.');
    }
    const technologies = text => ['led','halogen','xenon'].filter(t => word(text,t));
    const qt=technologies(requested),ct=technologies(candidate);
    if (qt.length===1 && ct.length===1 && qt[0]!==ct[0]) return different('Khác công nghệ đèn đã yêu cầu.');
    const hasLamp = value => /(?:^|\s)đèn(?:\s|$)/i.test(String(value || '').normalize('NFC'));
    if (qFamily==='cover' && cFamily==='cover' && word(requested,'can') && word(candidate,'can') && hasLamp(query)!==hasLamp(name)) return different('Ốp đèn cản là chi tiết khác với ốp cản.');
    if (qFamily==='compressor' && cFamily==='compressor') {
        const system = text => /(?:dieu hoa|lanh)/.test(text) ? 'ac' : word(text,'khi') ? 'air' : '';
        if (system(requested) && system(candidate) && system(requested)!==system(candidate)) return different('Máy nén khí và máy nén điều hòa thuộc hai hệ thống khác nhau.');
    }
    const exact = String(query || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ')===String(name || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ');
    if (exact) return {relation:'same_part',reason:'',exact:true,verified:true};
    for (const token of ['trai','phai']) if (word(requested,token)!==word(candidate,token)) return uncertain('Cần xác nhận bên trái / phải của chi tiết.');
    for (const token of ['truoc','sau']) if (word(requested,token) && !word(candidate,token)) return uncertain('Tên kho chưa ghi rõ vị trí trước / sau.');
    if (qt.length===1 && !ct.length) return uncertain('Tên kho chưa ghi rõ công nghệ đèn đã yêu cầu.');
    if (qFamily==='condenser' && cFamily==='condenser' && word(candidate,'ket nuoc') && !word(requested,'ket nuoc')) return uncertain('Tên kho nhắc cả giàn nóng và két nước; cần xác nhận là chi tiết riêng hay bộ làm mát.');
    if (qFamily && qFamily===cFamily && canonical(query,qFamily)===canonical(name,cFamily)) return {relation:'same_part',reason:'Cùng loại chi tiết, khác cách gọi hoặc cách viết.',verified:true};
    return uncertain('');
}

export function canRoutePartsCandidate(query, name) {
    const guard = getPartsCandidateRelevance(query,name);
    if (guard.relation==='related_part') return false;
    if (guard.exact || guard.verified) return true;
    const q=getPartsCandidateFamily(query),n=getPartsCandidateFamily(name);
    if (q && n) return q===n;
    const weak = new Set(['bo','cum','chi','tiet','cai','tam','xe','o','to','phu','tung','truoc','sau','trai','phai']);
    const qt=[...new Set(normalizePartName(query).split(' ').filter(t=>t&&!weak.has(t)))];
    const nt=new Set(normalizePartName(name).split(' '));
    return qt.length>0 && qt.filter(t=>nt.has(t)).length>=Math.min(qt.length,2);
}
