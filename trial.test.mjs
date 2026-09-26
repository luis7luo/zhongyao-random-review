import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(process.env.TRIAL_HTML || new URL('./index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('    const herbs ='),html.indexOf('</script>'));
function app(raw, extra={}) {
  const nodes=new Map();
  const node=id=>{
    if(!nodes.has(id)) nodes.set(id,{value:'',textContent:'',hidden:true,disabled:false,
      classList:{toggle(){},add(){},remove(){}},appendChild(){},focus(){},
      addEventListener(k,f){this[k]=f;}});
    return nodes.get(id);
  };
  node('mode').value='all'; node('direction').value='name'; node('categoryFilter').value='all';
  const store=new Map(Object.entries({'unrelated':'keep',...extra}));
  if(raw!==undefined)store.set('zhongyao-trial-v1:review-state',raw);
  const doc={getElementById:node,createElement:()=>({}),activeElement:null,
    addEventListener(k,f){this[k]=f;},querySelector:()=>({scrollIntoView(){}})};
  const ctx=vm.createContext({document:doc,localStorage:{getItem:k=>{assert.equal(k,'zhongyao-trial-v1:review-state');return store.get(k)??null;},setItem:(k,v)=>{assert.equal(k,'zhongyao-trial-v1:review-state');store.set(k,v);}},
    setTimeout(){},alert(){},confirm:()=>true});
  vm.runInContext(code,ctx);
  return {node,doc,store,run:s=>vm.runInContext(s,ctx)};
}
test('forward/reverse review and known/unknown marking',()=>{
  const a=app(); assert.equal(a.node('herbName').textContent,a.run('current.name'));
  a.node('showBtn').click(); assert.equal(a.run('revealed'),true);
  a.node('missBtn').click(); assert.equal(a.run('state.done'),1);assert.equal(a.run('state.miss.length'),1);
  a.node('mode').value='miss';a.node('mode').change();a.node('knowBtn').click();
  assert.equal(a.run('state.know'),1);assert.equal(a.run('state.miss.length'),0);
  a.node('mode').value='all';a.node('direction').value='effect';a.node('direction').change();
  assert.equal(a.node('herbName').textContent,a.run('answerFor(current)'));
});
for(const kind of ['miss','category'])test(`empty ${kind} pool never falls back`,()=>{
  const a=app();if(kind==='miss')a.node('mode').value='miss';else a.node('categoryFilter').value='nonexistent';
  a.run('pick()');assert.equal(a.run('current'),null);assert.match(a.node('herbName').textContent,/暂无/);
  a.run('mark(true);mark(false);reveal();pick()');assert.equal(a.run('state.done'),0);assert.equal(a.run('current'),null);
});
for(const context of ['input','textarea','editable','select','button','form','modal'])
for(const key of ['1','2',' '])test(`${context} ignores shortcut ${JSON.stringify(key)}`,()=>{
  const a=app();const target={isContentEditable:context==='editable',closest:()=>['input','textarea','select','button','form'].includes(context)?{}:null};
  if(context==='modal')a.node('customModal').hidden=false;
  a.doc.activeElement=target;
  a.doc.keydown({key,target,preventDefault(){throw Error('must not consume typing');}});
  assert.equal(a.run('state.done'),0);assert.equal(a.run('revealed'),false);
});
for(const raw of ['{','null','[]','42','"text"',JSON.stringify({customEffects:{'侧柏叶':{}},miss:[null,2],done:-1})])
test(`invalid storage ${raw} starts safely`,()=>{const a=app(raw);assert.ok(a.run('current'));assert.equal(a.store.get('unrelated'),'keep');});
test('valid stored fields survive invalid neighboring fields',()=>{
  const a=app(JSON.stringify({miss:['桂枝',null],mastered:['荆芥'],done:12,know:7,customEffects:{'桂枝':'自定义',bad:{}},extra:'keep'}));
  assert.equal(a.run('state.done'),12);assert.equal(a.run('state.know'),7);
  assert.equal(a.run('state.miss.join()'),'桂枝');assert.equal(a.run('state.mastered.join()'),'荆芥');
  assert.equal(a.run('state.customEffects["桂枝"]'),'自定义');assert.equal(a.run('state.extra'),'keep');
});
test('edit and restore refresh active reverse prompt without picking another herb',()=>{
  const a=app();a.node('direction').value='effect';a.run('pick()');const name=a.run('current.name');const original=a.run('current.answer');
  a.node('editEffectBtn').click();a.node('customText').value='修改后的功效';a.node('customSaveBtn').click();
  assert.equal(a.node('herbName').textContent,'修改后的功效');assert.equal(a.run('current.name'),name);
  a.node('restoreEffectBtn').click();assert.equal(a.node('herbName').textContent,original);assert.equal(a.run('current.name'),name);
});
test('ordinary shortcuts still reveal and mark',()=>{
  const a=app();const event=key=>({key,target:{},preventDefault(){}});
  a.doc.keydown(event(' '));assert.equal(a.run('revealed'),true);
  a.doc.keydown(event('1'));a.doc.keydown(event('2'));assert.equal(a.run('state.done'),2);
});
test('invalid numeric objects cannot crash initialization',()=>{
  const a=app(JSON.stringify({done:{valueOf:1,toString:2},know:{},mastered:['桂枝']}));
  assert.equal(a.run('state.done'),0);assert.equal(a.run('state.know'),0);assert.equal(a.run('state.mastered[0]'),'桂枝');
});
test('reset while reviewing missed herbs clears the active card',()=>{
  const a=app(JSON.stringify({miss:['桂枝']}));a.node('mode').value='miss';a.run('pick()');a.node('resetBtn').click();
  assert.equal(a.run('current'),null);
});
test('import refreshes active reverse prompt',()=>{
  const a=app();a.node('direction').value='effect';a.run('pick()');const name=a.run('current.name');
  a.node('importCustomBtn').click();a.node('customText').value=JSON.stringify({customEffects:{[name]:'导入功效'}});
  a.node('customSaveBtn').click();assert.equal(a.node('herbName').textContent,'导入功效');
});

test('trial scope and approved correction',()=>{
 const a=app();assert.equal(a.run('herbs.length'),47);assert.equal(a.run('new Set(herbs.map(h=>h.name)).size'),47);assert.equal(a.run('categories.length'),5);
 for(const field of ['answer','formalEffect'])assert.equal(a.run('herbs.find(h=>h.name==="荆芥")')[field],'解表散风、透疹消疮；炒炭收敛止血');
 assert.ok(!html.includes('licenseGate'));assert.ok(!code.includes('"herb-review-state"'));
});
test('trial never reads or writes paid storage; persists its own progress',()=>{
 const paid=JSON.stringify({done:999,know:999,miss:['桂枝'],customEffects:{桂枝:'PAID'}});
 const a=app(undefined,{'herb-review-state':paid});
 assert.equal(a.run('state.done'),0);assert.equal(a.run('state.customEffects["桂枝"]'),undefined);
 a.node('missBtn').click();const saved=a.store.get('zhongyao-trial-v1:review-state');
 assert.equal(app(saved).run('state.done'),1);
 a.node('resetBtn').click();assert.equal(a.store.get('herb-review-state'),paid);
});
test('search finds corrected herb and reports no matches',()=>{
 const a=app();a.node('search').value='荆芥';a.node('searchBtn').click();
 assert.match(a.node('resultSummary').textContent,/1 条/);assert.match(a.node('rows').innerHTML,/炒炭收敛止血/);
 a.node('search').value='NOT_A_HERB';a.node('search').input();assert.match(a.node('resultSummary').textContent,/0 条/);
});
