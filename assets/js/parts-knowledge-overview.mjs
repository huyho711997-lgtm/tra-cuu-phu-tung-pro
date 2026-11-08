export function aggregateOverview(rows){
    const terms=new Map();
    for(const row of rows){
        const query=row.original_query || '';
        const key=query.normalize('NFC').toLowerCase();
        const item=terms.get(key) || {query,total:0,missing:0,selected:0};
        item.total++;
        if(['not_found','error'].includes(row.outcome))item.missing++;
        if(row.selected_names?.length)item.selected++;
        terms.set(key,item);
    }
    return [...terms.values()].sort((a,b)=>b.missing-a.missing||b.total-a.total);
}

export function overviewPage(items,page,pageSize){
    const pages=Math.max(1,Math.ceil(items.length/pageSize));
    const current=Math.max(0,Math.min(page,pages-1));
    const start=current*pageSize;
    return {items:items.slice(start,start+pageSize),page:current,pages,start,total:items.length};
}
