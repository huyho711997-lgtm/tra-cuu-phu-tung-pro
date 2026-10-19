import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createSecureAiClient,migrateLegacyKeys} from '../assets/js/secure-ai.mjs';
import {createHandler} from '../supabase/functions/kgpt-ai/handler.mjs';
import {generateGroqContent} from '../assets/js/ai-provider.mjs';

const USER='11111111-1111-4111-8111-111111111111', OTHER='22222222-2222-4222-8222-222222222222';
const SECRET='gsk_this-is-a-provider-secret';
const origin='https://huyho711997-lgtm.github.io';
const ask={action:'generate',provider:'groq',parts:[{text:'Tìm cản trước'}],config:{responseMimeType:'application/json'}};
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});

function server({user=USER,profile={role:'user',status:'active'},credentials={groq1:{id:'revision-one',key:SECRET}},rate=true,rpcError=null,fetchImpl}={}) {
    const calls=[],upstream=[];
    const client={
        auth:{getUser:async token=>token==='session-token'&&user?{data:{user:{id:user}}}:{data:{user:null},error:{message:'invalid'}}},
        from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile})})})}),
        rpc:async(name,args)=>{
            calls.push([name,args]);
            if(rpcError&&name===rpcError.name) return {error:rpcError};
            if(name==='kgpt_ai_consume_rate') return {data:rate};
            if(name==='kgpt_ai_credentials') return {data:credentials};
            if(name==='kgpt_ai_settings_read') {
                if(args.p_target!==args.p_actor&&profile.role!=='admin') return {error:{code:'42501'}};
                return {data:{userId:args.p_target,settings:{llmProvider:'groq'},credentials:{groq1:{id:'revision-one',suffix:'cret'}}}};
            }
            if(name==='kgpt_ai_settings_save') return {data:{userId:args.p_target,settings:args.p_settings,credentials:{groq1:{id:'revision-two',suffix:'cret'}}}};
            throw new Error('Unexpected RPC '+name);
        }
    };
    const handler=createHandler({createClient:()=>client,env:name=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret'})[name],
        fetchImpl:async(url,options)=>{upstream.push([url,options]);return fetchImpl?fetchImpl(url,options):json({choices:[{message:{content:'{"items":[]}'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:2,total_tokens:12}});}});
    const request=(body=ask,headers={})=>handler(new Request('https://test.supabase.co/functions/v1/kgpt-ai',{method:'POST',headers:{Origin:origin,Authorization:'Bearer session-token','Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
    return {handler,request,calls,upstream};
}

test('missing/invalid sessions and locked accounts cannot read keys or call providers',async()=>{
    for(const [options,headers,status] of [[{}, {Authorization:''},401],[{}, {Authorization:'Bearer anon-public-key'},401],[{profile:{role:'user',status:'locked'}},{},403]]) {
        const app=server(options),res=await app.request(ask,headers);
        assert.equal(res.status,status);assert.equal(app.calls.length,0);assert.equal(app.upstream.length,0);
    }
});
test('CORS preflight allows only configured origin and does not substitute for authentication',async()=>{
    const app=server();
    let res=await app.handler(new Request('https://test/functions/v1/kgpt-ai',{method:'OPTIONS',headers:{Origin:origin}}));
    assert.equal(res.status,204);assert.equal(res.headers.get('Access-Control-Allow-Origin'),origin);
    res=await app.request(ask,{Origin:'https://malicious.example'});assert.equal(res.status,403);assert.equal(app.calls.length,0);
    res=await app.request(ask,{Origin:'',Authorization:''});assert.equal(res.status,401);
});
test('metadata excludes keys and cross-account reads/admin lists are rejected',async()=>{
    const app=server();
    let res=await app.request({action:'settings'});assert.equal(res.status,200);assert.ok(!(await res.text()).includes(SECRET));
    res=await app.request({action:'settings',targetUserId:OTHER});assert.equal(res.status,403);
    res=await app.request({action:'list'});assert.equal(res.status,403);
    assert.ok(!app.calls.some(([name])=>name==='kgpt_ai_credentials'));
});
test('actor identity comes from verified session; unknown fields are rejected before storing keys',async()=>{
    const app=server();
    const res=await app.request({action:'save',actor:OTHER,settings:{llmProvider:'groq'},keys:{groq1:SECRET},onlyIfMissing:true});
    assert.equal(res.status,200);
    const args=app.calls.find(([name])=>name==='kgpt_ai_settings_save')[1];
    assert.equal(args.p_actor,USER);assert.equal(args.p_target,USER);assert.equal(args.p_only_missing,true);
    assert.ok(!(await res.text()).includes(SECRET));
    assert.equal((await app.request({action:'save',settings:{service_role:'true'}})).status,400);
    assert.equal((await app.request({action:'save',keys:{groq1:'short'}})).status,400);
});
test('rate limit and storage failure stop upstream requests without exposing internal errors',async()=>{
    let app=server({rate:false});assert.equal((await app.request()).status,429);assert.equal(app.upstream.length,0);
    app=server({rpcError:{name:'kgpt_ai_credentials',message:SECRET}});
    const res=await app.request();assert.equal(res.status,503);assert.ok(!(await res.text()).includes(SECRET));assert.equal(app.upstream.length,0);
});
test('provider request uses only the logged-in account key and returns safe output/usage',async()=>{
    const app=server(),res=await app.request({...ask,apiKey:'attacker-key',targetUserId:OTHER});
    assert.equal(res.status,200);
    assert.equal(app.calls.find(([name])=>name==='kgpt_ai_credentials')[1].p_user_id,USER);
    assert.equal(app.upstream[0][0],'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(app.upstream[0][1].headers.Authorization,'Bearer '+SECRET);
    assert.equal(app.upstream[0][1].redirect,'error');
    const data=await res.json();assert.equal(data.output,'{"items":[]}');assert.equal(data.attempts[0].usage.total_tokens,12);
    assert.ok(!JSON.stringify(data).includes(SECRET));
});
test('fallback stays on server and tries each distinct Groq key once',async()=>{
    let count=0;
    const app=server({credentials:{groq1:{id:'one',key:SECRET},groq2:{id:'two',key:'second-secret'},groq3:{id:'three',key:SECRET}},
        fetchImpl:async()=>++count===1?json({error:{message:SECRET}},429,{'retry-after':'60'}):json({choices:[{message:{content:'ok'}}]})});
    const res=await app.request();assert.equal(res.status,200);const data=await res.json();
    assert.equal(app.upstream.length,2);assert.equal(data.slot,'groq2');assert.equal(data.attempts[0].status,429);
    assert.ok(!JSON.stringify(data).includes(SECRET));
});
test('bad provider keys and network errors never disclose provider error text',async()=>{
    for(const fetchImpl of [async()=>json({error:{message:SECRET}},401),async()=>{throw new Error(SECRET);}]) {
        const app=server({fetchImpl}),res=await app.request();
        assert.ok([502,504].includes(res.status));assert.ok(!(await res.text()).includes(SECRET));
    }
});
test('arbitrary URLs, models, binary Groq input and invalid output limits are rejected',async()=>{
    const app=server();
    for(const body of [{...ask,parts:[{file_data:{file_uri:'http://169.254.169.254'}}]},
        {...ask,parts:[{inline_data:{mime_type:'image/png',data:'AAAA'}}]},
        {...ask,provider:'gemini',model:'../admin'}, {...ask,config:{maxOutputTokens:100000}}]) {
        assert.equal((await app.request(body)).status,400);
    }
    assert.equal(app.upstream.length,0);
});
test('Gemini uses server key header and accepts PDF while keeping storage metadata safe',async()=>{
    const app=server({credentials:{gemini:{id:'g',key:SECRET}},fetchImpl:async()=>json({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]})});
    const res=await app.request({...ask,provider:'gemini',model:'gemini-3.8-flash',parts:[{inline_data:{mime_type:'application/pdf',data:'AAAA'}}]});
    assert.equal(res.status,200);assert.equal(app.upstream[0][1].headers['x-goog-api-key'],SECRET);
    assert.ok(!(await res.text()).includes(SECRET));
});
test('OCR proxies a file and takes the OCR key only from server storage',async()=>{
    const app=server({credentials:{ocrspace:{id:'o',key:SECRET}},fetchImpl:async()=>json({ParsedResults:[{ParsedText:'Cản trước'}]})});
    const form=new FormData();form.append('file',new Blob(['file'],{type:'application/pdf'}),'quote.pdf');form.append('language','vnm');
    const res=await app.handler(new Request('https://test/functions/v1/kgpt-ai',{method:'POST',headers:{Authorization:'Bearer session-token',Origin:origin},body:form}));
    assert.equal(res.status,200);assert.equal(app.upstream[0][1].headers.apikey,SECRET);
    assert.equal((await res.json()).text,'Cản trước');
});

function browserStorage(initial={}) {
    const values=new Map(Object.entries(initial));
    return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
test('legacy migration preserves local keys on failed upload and never reads another account',async()=>{
    const storage=browserStorage({['tascoGroqKey__'+USER]:SECRET,['tascoGroqKey__'+OTHER]:'other-secret'});
    await assert.rejects(migrateLegacyKeys({storage,owner:USER,credentials:{},isCurrent:()=>true,save:async()=>{throw Error('offline');}}));
    assert.equal(storage.getItem('tascoGroqKey__'+USER),SECRET);
    let uploaded;
    await migrateLegacyKeys({storage,owner:USER,credentials:{},isCurrent:()=>true,save:async keys=>{uploaded=keys;return {credentials:{groq1:{id:'saved'}}};}});
    assert.deepEqual(uploaded,{groq1:SECRET});assert.equal(storage.getItem('tascoGroqKey__'+USER),null);assert.equal(storage.getItem('tascoGroqKey__'+OTHER),'other-secret');
});
test('migration preserves new edits and does not replace an existing server key',async()=>{
    const storage=browserStorage({['tascoGroqKey__'+USER]:SECRET,['tascoGroqKey2__'+USER]:'second-secret'});
    await migrateLegacyKeys({storage,owner:USER,credentials:{groq1:{id:'server'}},isCurrent:()=>true,save:async keys=>{
        assert.deepEqual(keys,{groq2:'second-secret'});storage.setItem('tascoGroqKey2__'+USER,'newer-edit');return {};
    }});
    assert.equal(storage.getItem('tascoGroqKey2__'+USER),'newer-edit');
});
test('client discards late responses from previous accounts and never calls a provider directly',async()=>{
    let owner=USER,captured;
    const client=createSecureAiClient({getOwner:()=>owner,supabase:{auth:{getSession:async()=>({data:{session:{user:{id:USER},access_token:'session-token'}}})},functions:{invoke:async(name,options)=>{
        captured={name,body:options.body};owner=OTHER;return {data:{output:'old account output'}};
    }}}});
    await assert.rejects(client.generate([{text:'query'}],{}, {provider:'groq'}),{name:'AbortError'});
    assert.equal(captured.name,'kgpt-ai');assert.equal(captured.body.action,'generate');assert.ok(!('apiKey' in captured.body));
    await assert.rejects(generateGroqContent([{text:'query'}],{},{apiKey:SECRET}),/backend Supabase/);
});
test('account change during token lookup cancels before network; requests pin the verified session token',async()=>{
    let owner=USER,calls=0;
    const client=createSecureAiClient({getOwner:()=>owner,supabase:{auth:{getSession:async()=>{owner=OTHER;return {data:{session:{user:{id:USER},access_token:'session-token'}}};}},functions:{invoke:async()=>{calls++;}}}});
    await assert.rejects(client.read(),{name:'AbortError'});assert.equal(calls,0);
    owner=USER;
    const pinned=createSecureAiClient({getOwner:()=>owner,supabase:{auth:{getSession:async()=>({data:{session:{user:{id:USER},access_token:'session-token'}}})},functions:{invoke:async(name,options)=>{
        assert.equal(options.headers.Authorization,'Bearer session-token');return {data:{settings:{},credentials:{}}};
    }}}});
    await pinned.read();
});
test('oversized uploads, missing stored keys and truncated outputs return safe errors',async()=>{
    let app=server();assert.equal((await app.request(ask,{'content-length':String(21*1024*1024)})).status,413);assert.equal(app.upstream.length,0);
    app=server({credentials:{}});assert.equal((await app.request()).status,409);assert.equal(app.upstream.length,0);
    app=server({fetchImpl:async()=>json({choices:[{message:{content:'{'},finish_reason:'length'}],usage:{total_tokens:100}})});
    let res=await app.request();assert.equal(res.status,502);let data=await res.json();assert.equal(data.code,'OUTPUT_TRUNCATED');assert.equal(data.attempts[0].usage.total_tokens,100);
    app=server({credentials:{groq1:{id:'one',key:SECRET},groq2:{id:'two',key:'second-secret'}},fetchImpl:async()=>json({error:{message:SECRET}},503)});
    res=await app.request();assert.equal(res.status,502);assert.equal(app.upstream.length,1);
});
test('settings keep newly entered keys in memory and blank inputs never delete saved credentials',()=>{
    const core=readFileSync(new URL('../assets/js/app-core.mjs',import.meta.url),'utf8');
    const a=core.indexOf('        const QUOTE_AI_STORAGE_KEYS ='),b=core.indexOf('        let QUOTE_SETTINGS_OPEN_REVISION =',a);
    const storage=browserStorage(),input={value:SECRET};
    const context=vm.createContext({auth:{currentUser:{uid:USER}},currentUserProfile:{role:'user'},localStorage:storage,
        OCRSPACE_DEFAULT_LANGUAGE:'vnm',OCRSPACE_DEFAULT_ENGINE:'2',document:{getElementById:id=>id==='quoteGroqKeyInput'?input:null},DOMException});
    context.window=context;
    vm.runInContext(core.slice(a,b),context);
    vm.runInContext('saveGroqKey();',context);
    assert.ok(![...storage.values.values()].includes(SECRET));
    vm.runInContext("QUOTE_USER_API_SETTINGS.credentials = {groq1:{id:'server-id',suffix:'1234'}};",context);
    input.value='';vm.runInContext('saveGroqKey();',context);
    assert.equal(vm.runInContext('getGroqKey()',context),'server-id');
    assert.equal(vm.runInContext('QUOTE_CLEAR_KEYS.size',context),0);
    vm.runInContext("clearSavedAiKey('groq1')",context);
    assert.equal(vm.runInContext("QUOTE_CLEAR_KEYS.has('groq1')",context),true);
});
test('failed legacy upload keeps server metadata usable and reports incomplete migration',async()=>{
    const core=readFileSync(new URL('../assets/js/app-core.mjs',import.meta.url),'utf8');
    const a=core.indexOf('        const QUOTE_AI_STORAGE_KEYS ='),b=core.indexOf('        let QUOTE_SETTINGS_OPEN_REVISION =',a);
    const storage=browserStorage({['tascoGroqKey__'+USER]:SECRET});
    const context=vm.createContext({auth:{currentUser:{uid:USER}},currentUserProfile:{role:'user'},localStorage:storage,
        OCRSPACE_DEFAULT_LANGUAGE:'vnm',OCRSPACE_DEFAULT_ENGINE:'2',DOMException,migrateLegacyKeys,
        secureAi:{read:async()=>({settings:{llmProvider:'gemini'},credentials:{gemini:{id:'saved-gemini'}},allowSelfEdit:true}),save:async()=>{throw Error('offline');}}});
    context.window=context;vm.runInContext(core.slice(a,b),context);
    await context.loadQuoteApiSettingsForCurrentUser();
    assert.equal(vm.runInContext('QUOTE_API_SETTINGS_ERROR',context),'');
    assert.equal(vm.runInContext('hasSelectedAiKey()',context),true);
    assert.ok(vm.runInContext('QUOTE_API_MIGRATION_NOTICE',context));
    assert.equal(storage.getItem('tascoGroqKey__'+USER),SECRET);
});
