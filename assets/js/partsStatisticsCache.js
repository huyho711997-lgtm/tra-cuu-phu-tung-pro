(function(root){
  'use strict';
  // IndexedDB stores typed arrays without converting a large dataset to JSON.
  root.KGPTCreateStatsCache=function(databaseName='kgpt-parts-statistics'){
    function transact(mode,key,value,signal){
      return new Promise((resolve,reject)=>{
        let db,tx,done=false,result;
        const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);db?.close();error?reject(error):resolve(result);};
        const abort=()=>{try{tx?.abort();}catch(_){}finish(new Error('STATS_CANCELLED'));};
        const timer=setTimeout(()=>{try{tx?.abort();}catch(_){}finish(new Error('Bộ nhớ trình duyệt không phản hồi.'));},8000);
        if(signal?.aborted){abort();return;}
        signal?.addEventListener('abort',abort,{once:true});
        try{
          if(!root.indexedDB)throw new Error('Trình duyệt không hỗ trợ lưu dữ liệu.');
          const opening=root.indexedDB.open(databaseName,1);
          opening.onupgradeneeded=()=>{if(!opening.result.objectStoreNames.contains('reports'))opening.result.createObjectStore('reports');};
          opening.onerror=()=>finish(opening.error||new Error('Không mở được bộ nhớ trình duyệt.'));
          opening.onblocked=()=>finish(new Error('Bộ nhớ trình duyệt đang bận.'));
          opening.onsuccess=()=>{
            db=opening.result;if(done){db.close();return;}
            db.onversionchange=()=>db.close();
            try{
              tx=db.transaction('reports',mode);
              tx.oncomplete=()=>finish();
              tx.onabort=tx.onerror=()=>finish(tx.error||new Error('Không lưu/đọc được dữ liệu.'));
              const request=mode==='readonly'?tx.objectStore('reports').get(key):tx.objectStore('reports').put(value,key);
              request.onsuccess=()=>{result=mode==='readonly'?request.result:true;};
            }catch(error){finish(error);}
          };
        }catch(error){finish(error);}
      });
    }
    return {read:(key,signal)=>transact('readonly',key,undefined,signal),write:(key,value,signal)=>transact('readwrite',key,value,signal)};
  };
})(typeof window==='undefined'?globalThis:window);
