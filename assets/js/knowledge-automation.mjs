import {getPartsCandidateRelevance} from './parts-relevance.mjs';

export const exactKnowledgeKey=value=>String(value || '').normalize('NFC').toLowerCase().trim().replace(/\s+/g,' ');
export function knowledgeReviewHint(row){
    if(row.review_method==='exact_name')return 'Tự duyệt · Cùng tên, khác cách viết';
    if(row.review_method==='approved_rule')return 'Tự duyệt · Quy tắc đã xác nhận';
    if(row.status!=='pending')return 'Quản trị viên duyệt';
    if(row.automation_hint)return row.automation_hint;
    const guard=getPartsCandidateRelevance(row.alias,row.canonical_name);
    if(guard.relation==='related_part')return 'Cần kiểm tra loại chi tiết hoặc vị trí; chưa tự duyệt.';
    if(guard.exact)return 'Chờ máy chủ đối chiếu tên kho và quyết định trước đó.';
    return 'Chạy thử: tên gọi mới chỉ là đề xuất, chưa tự duyệt.';
}

// Server is the only authority for promotion. Never mark local rows successful without acknowledgement.
export async function autoReviewKnowledgeRows({supabase,rows,signal,isCurrent=()=>true}){
    const pending=rows.filter(row=>row.status==='pending').slice(0,25);
    if(!pending.length||!isCurrent())return {rows,reviewed:0,error:false};
    try{
        const {data,error}=await supabase.rpc('kgpt_auto_review_parts_knowledge',{p_ids:pending.map(row=>row.id)}).abortSignal(signal);
        if(!isCurrent())return {rows,reviewed:0,error:false};
        if(error||!Array.isArray(data?.reviewed)||!Array.isArray(data?.held))return {rows,reviewed:0,error:true};
        const eligible=new Set(pending.map(row=>row.id));
        const updated=new Map(data.reviewed.filter(row=>eligible.has(row.id)&&row.status==='approved'&&['exact_name','approved_rule'].includes(row.review_method)).map(row=>[row.id,row]));
        const held=new Map(data.held.filter(row=>eligible.has(row.id)).map(row=>[row.id,String(row.reason || '').slice(0,400)]));
        return {rows:rows.map(row=>updated.get(row.id) || (held.has(row.id)?{...row,automation_hint:held.get(row.id)}:row)),reviewed:updated.size,error:false};
    }catch{return {rows,reviewed:0,error:isCurrent()};}
}
