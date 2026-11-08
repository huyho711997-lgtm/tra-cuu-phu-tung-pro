import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateOverview,overviewPage} from '../assets/js/parts-knowledge-overview.mjs';

test('overview aggregates and sorts all terms, including those beyond the former 50-row limit',()=>{
    const rows=Array.from({length:65},(_,i)=>({original_query:`Phụ tùng ${i}`,outcome:'ready'}));
    rows.push({original_query:'PHỤ TÙNG 64'.normalize('NFD'),outcome:'error',selected_names:['part']});
    const terms=aggregateOverview(rows);
    assert.equal(terms.length,65);
    assert.deepEqual(terms[0],{query:'Phụ tùng 64',total:2,missing:1,selected:1});
    assert.equal(overviewPage(terms,6,10).items.length,5);
});

test('pagination clamps after filtering, handles empty results and changes page size',()=>{
    const rows=Array.from({length:21},(_,i)=>i);
    assert.deepEqual(overviewPage(rows,5,10),{items:[20],page:2,pages:3,start:20,total:21});
    assert.deepEqual(overviewPage([],3,10),{items:[],page:0,pages:1,start:0,total:0});
    assert.equal(overviewPage(rows,0,20).items.length,20);
});
