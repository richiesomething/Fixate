(async()=>{
'use strict';
/* Built-in books. Each book's text and annotations live in books/<id>.json and are fetched only when
   that book is opened. A single-file build (tools/build-single.mjs) embeds them as
   <script type="application/json" data-book="<id>"> instead, and those are used when present. */
const CATALOG=[
  {id:'trial',title:'The Trial',author:'Franz Kafka',note:'tr. David Wyllie',words:83878},
  {id:'ss',title:'Sense and Sensibility',author:'Jane Austen',note:'1811',words:119490,audio:'books/ss.audio.json'},
  {id:'w80',title:'Around the World in Eighty Days',author:'Jules Verne',note:'tr. George M. Towle',words:62384},
  {id:'tl',title:'Twenty Thousand Leagues under the Sea',author:'Jules Verne',note:'1870',words:104181}
];
const LIB=CATALOG.map(b=>({...b}));
const embedded=sel=>document.querySelector(sel);
async function fetchText(url){const r=await fetch(url);if(!r.ok)throw new Error(url+' '+r.status);return r.text()}
const bookLoads={};
function loadBook(id){
  const lib=LIB.find(b=>b.id===id);
  if(!lib||lib.data)return Promise.resolve(lib);
  return bookLoads[id]||(bookLoads[id]=(async()=>{
    const el=embedded(`script[data-book="${id}"]`);
    lib.data=JSON.parse(el?el.textContent:await fetchText(`books/${id}.json`));
    return lib;
  })().catch(e=>{delete bookLoads[id];throw e}));
}
const colorOf=s=>`var(--s${s%8})`;
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ================= text model (per book) ================= */
let normDirty=true,unitPerWord=1,GUIDE=null;
let SL,DICT,PRE,MAP,FIRST,BOOKID,META,BOOK,SPK,CAST,W,F,chStart,sentStart,paraStart,WT,BD,S,G,U,PS,N,SCENES,sceneStart,CS,CL,curC=-1;
const ABBR=/^(Mr|Mrs|Dr|St|Ms)\.$/;
const cache={};
function buildModel(id){
  if(cache[id])return cache[id];
  const lib=LIB.find(b=>b.id===id)||LIB[0];
  const DATA=lib.data;
  const m={quotes:[],id:lib.id,meta:lib,book:DATA.chs,spk:DATA.spk,cast:DATA.cast||{},W:[],F:[],chStart:[],sentStart:[],paraStart:[]};
  const wt=[],bd=[],s=[],g=[],u=[],ps=[];
  m.book.forEach((c,ci)=>{
    m.chStart.push(m.W.length); m.paraStart.push([]);
    c.p.forEach((p,pi)=>{
      const ws=p.split(' '), base=m.W.length, wq=c.w[pi], bq=c.b[pi];
      m.paraStart[ci].push(base);
      let newSent=true;
      ws.forEach((w,k)=>{
        if(newSent){m.sentStart.push(m.W.length);newSent=false}
        let f=0;
        if(/[.!?…]["'”’)\]]*$/.test(w)&&!ABBR.test(w)&&w!=='K.'){f|=1;newSent=true}
        else if(/[,;:—)]["'”’]*$/.test(w)) f|=4;
        m.W.push(w);m.F.push(f);s.push(-1);g.push(0);u.push(0);ps.push(k===0?1:0);
        wt.push(0.3+(wq.charCodeAt(k)-48)*0.05); bd.push(+bq[k]);
      });
      m.F[m.F.length-1]|=2;
      (c.r[pi]||[]).forEach(([a,b,sp,gg])=>{for(let i=a;i<=b;i++){s[base+i]=sp;g[base+i]=gg}u[base+a]=1;(m.quotes[ci]=m.quotes[ci]||[]).push([base+a,base+b,pi])});
    });
    m.F[m.F.length-1]|=8;
  });
  m.WT=Float32Array.from(wt); m.BD=Uint8Array.from(bd); m.S=Int16Array.from(s); m.G=Uint8Array.from(g); m.U=Uint8Array.from(u); m.PS=Uint8Array.from(ps);
  m.N=m.W.length;
  m.SL=new Uint16Array(m.N);
  for(let k=0;k<m.sentStart.length;k++){const a=m.sentStart[k],b=(m.sentStart[k+1]??m.N);for(let j=a;j<b;j++)m.SL[j]=Math.min(65535,b-a)}
  m.SCENES=DATA.scenes.map(([ci,pi,wi,l,sub],k)=>({i:m.paraStart[ci][pi]+wi,l,s:sub,k,ci}));
  m.guide=DATA.guide||null;
  m.sceneStart=new Map(m.SCENES.map(x=>[x.i,x]));
  m.CS=new Int32Array(m.N); m.CL=new Uint8Array(m.N);
  m.dict=DATA.dict||(lib.uploaded?genDict():{}); m.pre=(DATA.pre||[]).map((lst,ci)=>lst.map(([pi,wi,f])=>({i:m.paraStart[ci][pi]+wi,f})));
  const gi=([ci,pi,wi])=>m.paraStart[ci][pi]+wi;
  m.map=DATA.map?{nodes:DATA.map.nodes.map(([id,label,x,y,a,ii])=>({id,label,x,y,i:a?gi(a):ii})),edges:DATA.map.edges.map(([a,b,label,at,ii])=>({a,b,label,i:at?gi(at):ii}))}:{nodes:[],edges:[]};
  m.first={};
  for(let i=0;i<m.N;i++)if(m.U[i]&&m.S[i]>=0){const n=m.spk[m.S[i]];if(!(n in m.first))m.first[n]=i}
  for(const n of m.map.nodes)m.first[n.id]=Math.min(m.first[n.id]??Infinity,n.i);
  cache[id]=m;
  applyStoredAISpeakers(m);
  clearLetterSpeakers(m);
  return m;
}
function useModel(m){
  ({id:BOOKID,meta:META,book:BOOK,spk:SPK,cast:CAST,W,F,chStart,sentStart,paraStart,WT,BD,S,G,U,PS,N,SCENES,sceneStart,CS,CL,SL,dict:DICT,pre:PRE,map:MAP,first:FIRST,guide:GUIDE}=m);
  normDirty=true;
  curC=-1;
}
const chapterOf=i=>{let c=0;for(let k=0;k<chStart.length;k++)if(chStart[k]<=i)c=k;return c};
const chapterEndOf=c=>(c+1<chStart.length?chStart[c+1]:N)-1;
const sentIdx=i=>{let lo=0,hi=sentStart.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(sentStart[m]<=i)lo=m;else hi=m-1}return lo};
const sceneAt=i=>{let r=null;for(const s of SCENES){if(s.i<=i)r=s;else break}return r};

/* ================= settings & storage ================= */
const DEF={
  view:'flash', widthMode:'auto', width:14, adapt:'0.6', pause:'1', resume:'sentence', chapStop:true,
  theme:'system', font:'serif', size:1, focus:'red', focal:'classic', dim:true,
  voices:true, audio:false, aiSpeakers:true, claude:true, before:true, recall:true, coach:true, checks:'choose'
};
const KEY='fixate-trial-v4';
const FOCAL_KEYS=['classic','mid','center'];
let store={i:0,w:300,set:{...DEF},sessions:[],answers:[],book:null,pos:{},seen:false,max:{},words:{},taught:{},qbank:[],preds:[],last:{},sums:{},previews:{},shelf:{}};
try{
  const old=JSON.parse(localStorage.getItem('fixate-trial')||'null');
  const s=JSON.parse(localStorage.getItem(KEY)||'null');
  if(s)store={...store,...s,set:{...DEF,...s.set}};
  else if(old){store.i=old.i||0;store.w=old.w||300;if(old.set)store.set={...DEF,...old.set}}
}catch(e){}
const set=store.set;
if(set.focus==='accent'||set.focus==='teal'||set.focus==='off')set.focus='red';
if(set.focal==='center')set.focal='mid';
if(typeof set.coach!=='boolean')set.coach=set.coach!=='off';
if(typeof set.before!=='boolean')set.before=set.before!=='off'&&set.preteach!==false;
if(set.quiz==='off')set.checks='off';else if(set.checkStyle&&set.checks==null)set.checks=set.checkStyle==='recap'?'choose':set.checkStyle;
delete store.bonus;delete store.preds;
for(const k of['program','ladderPeak','ladderStep','sprintPct','sprintSec','restSec','grow','tones','haptic','slates','predict','sessRecap','recap','preteach','quiz','checkStyle','cueFlash','cueFlashMs','cueFlashMode','cueTint','cueTicks','cueLabel','guesses','italic','coach_old'])delete set[k];
if(!FOCAL_KEYS.includes(set.focal))set.focal='classic';
for(const k of['pos','max','words','taught','last','sums','previews','shelf','place'])if(!store[k])store[k]={};for(const k of['qbank','preds'])if(!store[k])store[k]=[];
if(store.book==null&&store.i)store.pos.trial=store.i; // migrate earlier single-book position
const pendingBook=store.book;
const startId=LIB.find(b=>b.id===store.book)?store.book:LIB[0].id;
for(let attempt=0;;attempt++){
  try{await loadBook(startId);break}
  catch(e){
    $('hint').textContent='Could not load the book. Check your connection.';
    await new Promise(r=>{const b=document.createElement('button');b.className='btn tonal';b.textContent='Try again';b.onclick=r;$('hint').append(' ',b)});
    $('hint').textContent='Loading your book…';
  }
}
useModel(buildModel(startId));
let idx=clamp(store.pos[BOOKID]|0,0,N-1), wpm=store.w||300;
let saveT=0;
function save(now){
  store.pos[BOOKID]=idx;store.book=BOOKID;store.w=wpm;store.max[BOOKID]=Math.max(store.max[BOOKID]||0,idx);
  const run=()=>{try{localStorage.setItem(KEY,JSON.stringify(store))}catch(e){}};
  clearTimeout(saveT); if(now)run(); else saveT=setTimeout(run,400);
}

/* ================= chunking ================= */
// Bond after each word: 0 must break, 1 weak, 2 normal, 3 strong (inside a phrase).
const PEN=[0,0,.32,.85];
function chunkEnd(i,C){
  if(C<=0)return i;
  let best=i,bestScore=-9,chars=W[i].length,j=i;
  for(;;){
    const b=BD[j], fill=chars<=C?chars/C:1-(chars-C)/C*1.2;
    const score=fill-PEN[b]+(b===0?.12:0);
    if(score>bestScore){bestScore=score;best=j}
    if(b===0||j>=N-1)break;
    const nc=chars+1+W[j+1].length;
    // allow a chunk to run a little long rather than split a tight phrase ("into the | next room")
    if(nc>C&&!(j===i&&W[i].length<=3)&&!(b===3&&nc<=C*1.4))break;
    j++;chars=nc;
  }
  return best;
}
function buildChunks(C){
  if(C===curC)return false;
  curC=C;let i=0;
  while(i<N){const e=chunkEnd(i,C);const n=e-i+1;for(let k=i;k<=e;k++)CS[k]=i;CL[i]=n;i=e+1}
  return true;
}
function autoWidth(w){return w<240?0:clamp(Math.round(10+(w-250)*0.045),8,36)}
function targetWidth(){
  if(set.widthMode==='manual')return +set.width;
  const base=autoWidth(curWpm());
  return base;
}
function syncChunks(){if(buildChunks(targetWidth())){idx=CS[idx];normDirty=true;return true}return false}
const unitStart=i=>CS[i];
const unitLen=i=>CL[CS[i]];
const nextUnit=i=>Math.min(N-1,CS[i]+CL[CS[i]]);
const prevUnit=i=>CS[i]>0?CS[CS[i]-1]:0;

/* ================= pace ================= */
const curWpm=()=>wpm;

/* ================= DOM refs ================= */
const app=$('app'),stage=$('stage'),wordEl=$('word'),whoEl=$('who'),ctx=$('context'),pageEl=$('page'),quizEl=$('quiz');
const scrub=$('scrub'),speed=$('speed'),hint=$('hint');

/* ================= flash rendering ================= */
const showSpk=i=>S[i]>=0;
/* Focal point: a fixed proportion of each chunk, snapped to the nearest letter, so the split
   between text before and after the highlighted letter is always the same. Single words use the
   classic optimal-recognition-point table. */
const FOCAL={classic:{phrase:.30,word:0,stage:.36},mid:{phrase:.38,word:.38,stage:.40},center:{phrase:.46,word:.45,stage:.45}};
function orp(w){
  const m=w.match(/[\p{L}\p{N}]/u); const start=m?m.index:0;
  let len=0;for(const ch of w.slice(start)){if(/[\p{L}\p{N}'’-]/u.test(ch))len++;else break}
  const o=len<=1?0:len<=5?1:len<=9?2:len<=13?3:4;
  return Math.min(start+o,w.length-1);
}
function phrasePivot(s){
  const f=FOCAL[set.focal]||FOCAL.classic;
  if(s.indexOf(' ')<0){
    if(!f.word)return orp(s);
    const m=s.match(/[\p{L}\p{N}]/u),st=m?m.index:0;let len=0;for(const ch of s.slice(st)){if(/[\p{L}\p{N}'’-]/u.test(ch))len++;else break}
    return Math.min(s.length-1,st+Math.round((len-1)*f.word));
  }
  const t=Math.round(s.length*f.phrase);
  for(let d=0;d<s.length;d++)for(const k of[t-d,t+d])if(k>=0&&k<s.length&&/[\p{L}\p{N}]/u.test(s[k]))return k;
  return 0;
}
let pivotX=0,baseSize=48,lastWho=null,stageW=0;
function layout(){
  stageW=stage.clientWidth||340;
  pivotX=Math.round(stageW*(FOCAL[set.focal]||FOCAL.classic).stage);
  $('tickT').style.left=$('tickB').style.left=pivotX+'px';
  whoEl.style.left=pivotX+'px';
  baseSize=Math.max(28,Math.min(58,stageW*0.1))*(+set.size)*(curC>0?0.88:1);
  pageEl.style.fontSize=(19*(+set.size))+'px';
  render(true);
}
function renderFlash(){
  const n=unitLen(idx), txt=W.slice(idx,idx+n).join(' '), p=phrasePivot(txt);
  wordEl.innerHTML=`<span>${esc(txt.slice(0,p))}</span><span class="pv">${esc(txt[p])}</span><span>${esc(txt.slice(p+1))}</span>`;
  const sp=set.voices&&showSpk(idx);
  wordEl.style.color=sp?`color-mix(in srgb, ${colorOf(S[idx])} ${G[idx]?55:75}%, var(--word))`:'';
  wordEl.style.fontSize=baseSize+'px';
  const [pre,pv,post]=wordEl.children;
  let lw=pre.offsetWidth+pv.offsetWidth/2;const rw=post.offsetWidth+pv.offsetWidth/2;
  const s=Math.min(1,(pivotX-4)/lw,(stageW-pivotX-4)/rw);
  if(s<1){wordEl.style.fontSize=Math.max(16,baseSize*s)+'px';lw=pre.offsetWidth+pv.offsetWidth/2}
  wordEl.style.left=(pivotX-lw)+'px';
}
function renderWho(){
  const on=set.voices&&S[idx]>=0, s=S[idx], vis=on&&showSpk(idx);
  stage.classList.toggle('speech',on);
  stage.classList.toggle('ticks',on&&vis);
  stage.style.setProperty('--voice',on?(vis?colorOf(s):'var(--mute)'):'var(--rule)');
  stage.style.setProperty('--voiceText',vis?colorOf(s):'var(--mute)');
  const key=vis?s+':'+G[idx]:(on?'?':'');
  if(key!==lastWho){lastWho=key;whoEl.innerHTML=vis?`<span class="q">“</span>${esc(SPK[s])}${G[idx]?'<span class="g">?</span>':''}`:(on?'<span class="q">“</span>…':'')}
}
let lastPlace='';
function renderPlace(){
  const sc=sceneAt(idx), h=sc?` · ${esc(sc.l)}${sc.s?` <i>· ${esc(sc.s)}</i>`:''}`:'';
  if(h!==lastPlace){lastPlace=h;$('place').innerHTML=h}
}

/* ================= letters =================
   Letters quoted in full (guide.letters: first and last word) are set on paper in Page view and the
   guide, and the reading spot takes on a paper tint while a letter is being read. In the source text
   each new line of a letter starts with an opening quote mark; here that becomes a line break. */
const letterAt=i=>(GUIDE&&GUIDE.letters||[]).find(L=>i>=L.a&&i<=L.b)||null;
function letterWord(i,L){
  let w=W[i],br=false;
  if(/^[“"]/.test(w)){w=w.slice(1);br=!PS[i]&&i!==L.a}
  if(i===L.b||F[i]&2)w=w.replace(/[”"]$/,'');
  return{w,br};
}
const paraEnd=i=>{while(i<N-1&&!(F[i]&2))i++;return i};
// short opening (address and date) and closing (signature) paragraphs sit on the right, as in a letter
const letterPara=(i,L)=>{const e=paraEnd(i),n=e-i+1;return(i===L.a&&n<=4)||(e>=L.b&&n<=12)?' class="lr"':''};
function letterHTML(L){
  let h='',open=false;
  for(let i=L.a;i<=L.b;i++){
    if(PS[i]||!open){if(open)h+='</p>';h+=`<p${letterPara(i,L)}>`;open=true}
    const{w,br}=letterWord(i,L);h+=(br?'<br>':'')+esc(w)+' ';
  }
  return h+'</p>';
}
const ltag=document.createElement('div');ltag.className='ltag';ltag.setAttribute('aria-hidden','true');stage.appendChild(ltag);
let lastLetter='';
function renderLetter(){
  const L=set.view==='page'?null:letterAt(idx),k=L?BOOKID+L.a:'';
  if(k===lastLetter)return;lastLetter=k;
  stage.classList.toggle('in-letter',!!L);ltag.textContent=L?`Letter · ${L.from} to ${L.to}`:'';
}

/* ================= page (pacer) rendering ================= */
let pgFrom=-1,pgTo=-1,pgSpans=null,pgHL=[];
function buildPage(){
  const c=chapterOf(idx), cs=chStart[c], ce=chapterEndOf(c);
  let a=Math.max(cs,idx-250); a=Math.max(cs,sentStart[sentIdx(a)]);
  // start at paragraph start when it's close
  for(let j=a;j>=Math.max(cs,a-120);j--)if(PS[j]){a=j;break}
  const b=Math.min(ce,idx+700);
  let h=a===cs?`<h3>${esc(BOOK[c].t)}</h3>`:'';
  let open=false,LT=null;
  for(let i=a;i<=b;i++){
    if(PS[i]||!open){
      if(open)h+='</p>';
      if(LT&&i>LT.b){h+='</div>';LT=null}
      const L=!LT&&letterAt(i);if(L){LT=L;h+=`<div class="letter"><div class="lt-h">${esc(L.from)} to ${esc(L.to)}</div>`}
      h+=LT?`<p${letterPara(i,LT)}>`:'<p>';open=true}
    const sc=sceneStart.get(i); if(sc)h+=`<span class="sc">${esc(sc.l)}${sc.s?' · '+esc(sc.s):''}</span>`;
    const sp=set.voices&&showSpk(i);
    if(sp&&U[i])h+=`<span class="tag${G[i]?' g':''}" style="--c:${colorOf(S[i])}">${esc(SPK[S[i]])}${G[i]?'?':''}</span>`;
    const lw=LT?letterWord(i,LT):{w:W[i],br:false};
    h+=`${lw.br?'<br>':''}<span data-i="${i}"${sp?` class="sp" style="--c:${colorOf(S[i])}"`:''}>${esc(lw.w)}</span> `;
  }
  if(open)h+='</p>';if(LT)h+='</div>';
  pageEl.innerHTML=h;
  pgFrom=a;pgTo=b;pgSpans=new Map();
  pageEl.querySelectorAll('span[data-i]').forEach(el=>pgSpans.set(+el.dataset.i,el));
  pgHL=[];pgLastTop=-1;
}
let pgLastTop=-1;
function renderPage(force){
  pageEl.classList.toggle('dim',!!set.dim);
  if(force||idx<pgFrom||idx>pgTo-80||chapterOf(idx)!==chapterOf(pgFrom))buildPage();
  for(const el of pgHL)el.classList.remove('hl');
  pgHL=[];
  const n=unitLen(idx);
  for(let k=idx;k<idx+n;k++){const el=pgSpans.get(k);if(el){el.classList.add('hl');pgHL.push(el)}}
  const el=pgHL[0];
  if(el){
    const top=el.offsetTop;
    if(top!==pgLastTop){
      const target=top-pageEl.clientHeight*0.36;
      const smooth=Math.abs(pageEl.scrollTop-target)<pageEl.clientHeight*0.6&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
      pageEl.scrollTo({top:target,behavior:smooth?'smooth':'auto'});
      pgLastTop=top;
    }
  }
}
pageEl.addEventListener('click',e=>{const t=e.target.closest('span[data-i]');if(t){if(playing)pause();openPop(+t.dataset.i,t)}});

/* ================= shared render ================= */
let metaT=0;
function render(force){
  idx=unitStart(idx);
  if(set.view==='page')renderPage(force);else{renderFlash();renderWho()}
  renderLetter();
  renderPlace();
  const now=performance.now();
  if(!playing||now-metaT>500){metaT=now;meta()}
  if(!playing){if(set.view!=='page')drawContext();drawHint()}
}
function drawHint(){
  if(chapterEnd){
    const c=chapterOf(idx);
    hint.innerHTML=c+1<BOOK.length?`End of ${esc(BOOK[c].t)}. <button class="btn tonal" id="nextCh">Continue to ${esc(BOOK[c+1].t)}</button>`:'The end.';
    const b=$('nextCh');if(b)b.onclick=e=>{e.stopPropagation();chapterEnd=false;go(chStart[c+1]);play()};
    if(set.view==='page')toast(c+1<BOOK.length?`End of ${BOOK[c].t}.`:'The end.',c+1<BOOK.length?[{t:'Continue',pri:true,f:()=>{chapterEnd=false;go(chStart[c+1]);play()}}]:[],8000);
  } else if(set.view==='page')hint.textContent='';
  else if(GUIDE&&idx>0){hint.innerHTML='<button class="btn tonal" id="wgo"><svg class="i"><use href="#i-compass"/></svg>What\'s going on?</button>';$('wgo').onclick=e=>{e.stopPropagation();openSheet('guide')}}
  else hint.textContent='Tap to read · drag sideways to scrub';
}
function meta(){
  scrub.value=idx;
  const c=chapterOf(idx);
  $('hCh').textContent=BOOK[c].t;fill(scrub);
  const sess=curSession(), m=sess&&sess.ms>20000?Math.round(sess.w/(sess.ms/60000)):0;
  const rate=m||curWpm(), mins=(chapterEndOf(c)-idx)/rate;
  $('pos').textContent=m?`Reading at ${m} wpm`:(idx/(N-1)*100).toFixed(1)+'% of book';
  $('left').textContent=mins<1?'Under a minute left in chapter':Math.round(mins)+' min left in chapter';
}
function drawContext(){
  const s=sentIdx(idx);
  let a=sentStart[Math.max(0,s-1)],b=(sentStart[Math.min(sentStart.length-1,s+2)]??N)-1;
  if(idx-a>45)a=idx-45; if(b-idx>60)b=idx+60; b=Math.min(b,N-1);
  const n=unitLen(idx);let h='';
  for(let i=a;i<=b;i++){
    const sc=sceneStart.get(i); if(sc&&i!==a)h+=`<span class="sc">${esc(sc.l)}</span>`;
    const sp=set.voices&&showSpk(i);
    if(sp&&(U[i]||i===a))h+=`<span class="tag${G[i]?' g':''}" style="--c:${colorOf(S[i])}">${esc(SPK[S[i]])}${G[i]?'?':''}</span>`;
    const cur=i>=idx&&i<idx+n;
    h+=`<span data-i="${i}" class="${sp?'sp':''}${cur?' cur':''}${letterAt(i)?' inl':''}"${sp?` style="--c:${colorOf(S[i])}"`:''}>${esc(W[i])}</span>`+((F[i]&2)&&i<b?'<br><br>':' ');
  }
  ctx.innerHTML=h;
  const cur=ctx.querySelector('.cur');if(cur)cur.scrollIntoView({block:'nearest'});
}
ctx.addEventListener('click',e=>{const t=e.target.closest('span[data-i]');if(t)openPop(+t.dataset.i,t)});

function prevSpeaker(i){for(let j=i-1;j>=Math.max(0,i-400);j--)if(U[j])return S[j];return -2}

/* ================= sessions & stats ================= */
const DAY=d=>{const x=new Date(d);return x.getFullYear()+'-'+(x.getMonth()+1)+'-'+x.getDate()};
let sessOpen=null;
function curSession(){return sessOpen}
function openSession(){
  const last=store.sessions[store.sessions.length-1], now=Date.now();
  if(last&&now-last.end<10*60000&&DAY(last.end)===DAY(now)&&(last.book||'trial')===BOOKID){sessOpen=last;return}
  sessOpen={start:now,end:now,w:0,ms:0,tw:0,rw:0,qc:0,qt:0,grown:false,book:BOOKID};
  const dw=dueWords().length;if(dw)setTimeout(()=>toast(`${dw} saved ${dw===1?'word is':'words are'} ready for review.`,[{t:'Later',f:()=>{}},{t:'Review',pri:true,f:()=>startReview()}],8000),1500);
  store.sessions.push(sessOpen);
  if(store.sessions.length>200)store.sessions.splice(0,store.sessions.length-200);
}

/* ================= playback ================= */
let lastAutoSave=0,playing=false,timer=0,ramp=0,movedSincePause=true,chapterEnd=false,lastT=0;
/* ---- timing model ----
   Each chunk's time is computed in "average word" units from:
   - per-word processing cost, precomputed offline from word length, word frequency, how predictable the
     word is in context (language-model surprisal), first appearance of names, numbers and spillover from a
     hard previous word; short function words cost about half, as readers often skip them
   - a fixed cost per flash (recognising a new image), so larger chunks are cheaper per word
   - words after the first in a chunk are processed partly in parallel
   - extra time when a chunk is visually wide
   - wrap-up pauses at commas, sentence ends (longer after long sentences), paragraphs and chapters
   Everything is then scaled so the book as a whole runs at exactly the speed you set. */
const FLASH=.35,PAR=.85;
function chunkUnits(i){
  const n=CL[i],a=+set.adapt,k=+set.pause;
  let u=FLASH,chars=-1;
  for(let j=i;j<i+n;j++){u+=(1+a*(WT[j]-1))*(j===i?1:PAR);chars+=W[j].length+1}
  if(chars>14)u+=(chars-14)*.03;
  const f=F[i+n-1];let e=0;
  if(f&8)e=2.5;else if(f&2)e=1.3;else if(f&1)e=.9+Math.min(.4,Math.max(0,(SL[i+n-1]-15)*.012));else if(f&4)e=.45;
  return u+e*k;
}
function recalcNorm(){
  let Un=0,i=0;
  while(i<N){
    Un+=chunkUnits(i);
    if(set.voices&&U[i]&&S[i]>=0)Un+=.35+(prevSpeaker(i)!==S[i]?.35:0);
    i+=CL[i];
  }
  const U_=Un;
  unitPerWord=U_/N;normDirty=false;
}
function delay(i){
  if(normDirty)recalcNorm();
  const base=60000/curWpm();
  let ms=chunkUnits(i)*base/unitPerWord;
  if(set.voices&&U[i]){ms+=base*.35;if(prevSpeaker(i)!==S[i])ms+=base*.35}
  if(ramp>0){ms*=1+ramp*.12;ramp--}
  return Math.max(base*.4,ms);
}
function tickClock(){
  const now=performance.now(), dt=Math.min(4000,now-lastT); lastT=now;

  if(sessOpen){sessOpen.ms+=dt;sessOpen.end=Date.now()}
}
function step(){
  tickClock();
  const n=unitLen(idx), last=idx+n-1;
  if(sessOpen){sessOpen.w+=n;sessOpen.tw+=n*curWpm()}
  if(last>=N-1){chapterEnd=true;pause();return}
  store.max[BOOKID]=Math.max(store.max[BOOKID]||0,last);
  checkFinished(last);
  if(set.chapStop&&(F[last]&8)){chapterEnd=true;pause();chapterCheckpoint();return}
  if(set.widthMode==='auto'&&syncChunks())layout();
  idx=Math.min(N-1,last+1);
  store.place[BOOKID]=idx;
  if(performance.now()-lastAutoSave>5000){lastAutoSave=performance.now();save(true)}
  if(set.aiSpeakers&&AI()){const c=chapterOf(idx);if(idx-chStart[c]>(chapterEndOf(c)-chStart[c])*.7)refineSpeakers(c+1<BOOK.length?c+1:-1)}
  render();
  if(set.coach&&Date.now()-lastRewindAt>8*60000&&sessOpen&&sessOpen.ms>8*60000&&wpm<1000)suggestSpeed(25,'Eight minutes without going back.');
  timer=setTimeout(step,delay(idx));
}
function play(skipCards){
  if(playing||app.classList.contains('quizzing'))return;
  if(!skipCards&&preStartCards())return;
  refineSpeakers(chapterOf(idx));
  if(GUIDE&&GUIDE.gen)buildUploadGuide(chapterOf(idx));
  openSession();store.last[BOOKID]=Date.now();onStartReading();
  if(chapterEnd){chapterEnd=false;idx=nextUnit(idx);if(idx>=N-1)idx=0;hideToast()}
  else if(set.resume==='sentence'&&!movedSincePause){const s=sentStart[sentIdx(idx)];if(idx-s>0)idx=s}
  playing=true;ramp=4;lastT=performance.now();app.classList.add('playing');setIcon();keepAwake(true);
  syncChunks();render();
  if(audioWanted())startAudio();else timer=setTimeout(step,delay(idx));
}
function pause(){
  const wasPlaying=playing;
  if(playing){tickClock();lastPauseAt=Date.now()}
  playing=false;clearTimeout(timer);stopAudio();stage.classList.remove('slating');movedSincePause=false;app.classList.remove('playing');setIcon();keepAwake(false);render();save(true);
}
const toggle=()=>playing?pause():play();
function setIcon(){
  $('playIcon').innerHTML=playing?'<use href="#i-pause"/>':'<use href="#i-play"/>';
  $('play').setAttribute('aria-label',playing?'Pause':'Play');
}
function go(i,keepPlaying,rw){
  idx=unitStart(clamp(i,0,N-1));chapterEnd=false;movedSincePause=true;
  if(rw)noteRewind();
  if(playing&&keepPlaying){clearTimeout(timer);stage.classList.remove('slating');ramp=3;lastT=performance.now();render();if(audioOn())startAudio();else timer=setTimeout(step,delay(idx))}
  else{if(playing)pause();else render();save()}
  primeAudio();offerReturn();
}
/* Auto-bookmark: store.place is the last spot you were actually reading. If you jump well away from it
   (scrubbing, a chapter, a tapped word) a prompt offers to take you straight back. */
let offerT=0;
function offerReturn(){
  clearTimeout(offerT);
  offerT=setTimeout(()=>{
    const p=store.place[BOOKID];
    if(p==null||playing||Math.abs(idx-p)<250||app.classList.contains('quizzing'))return;
    toast(`Your place: ${BOOK[chapterOf(p)].t}, ${Math.round(p/(N-1)*100)}% in.`,[{t:'Go back',pri:true,f:()=>go(p)}],10000);
  },700);
}
function sentence(dir){
  const s=sentIdx(idx);
  if(dir<0)go(idx-sentStart[s]>1?sentStart[s]:sentStart[Math.max(0,s-1)],true,true);
  else go(sentStart[Math.min(sentStart.length-1,s+1)],true);
}
function chapter(dir){const c=chapterOf(idx)+dir;if(c>=0&&c<chStart.length)go(chStart[c])}
function setWpm(v,quiet){
  wpm=clamp(Math.round(v/25)*25,100,audioOn()?AUD.maxWpm:1000);normDirty=true;
  if(audioOn())audioEl.playbackRate=audioRate();speed.value=wpm;fill(speed);$('wpmVal').textContent=wpm;
  if(set.widthMode==='auto'&&syncChunks())layout();
  meta();save();audioLabel();
}

/* ================= read-along audio =================
   Books with an audiobook have a word-level time map (books/<id>.audio.json): for every word in every
   chapter, the moment the narrator starts saying it, made by aligning the LibriVox recording with this
   exact text. While read-along is on, the narration is the clock: each flash appears as the narrator
   reaches its first word, and the reading speed sets the playback rate. */
const audioEl=new Audio();audioEl.preload='auto';audioEl.preservesPitch=true;
let AUD=null,audCh=-1,audRAF=0,audSeek=null,audioLoads={};
const AUD_MIN=0.5,AUD_MAX=3;
const hasAudio=()=>!!(META&&META.audio);
const audioOn=()=>!!(set.audio&&AUD&&AUD.id===BOOKID);
const audioWanted=()=>{if(set.audio&&hasAudio()&&!audioOn())loadAudio(BOOKID);return audioOn()};
const audioRate=()=>clamp(wpm/AUD.wpm,AUD_MIN,AUD_MAX);
function loadAudio(id){
  const lib=LIB.find(b=>b.id===id);if(!lib||!lib.audio)return Promise.resolve(null);
  return audioLoads[id]||(audioLoads[id]=(async()=>{
    const el=embedded(`script[data-audio="${id}"]`);
    const d=JSON.parse(el?el.textContent:await fetchText(lib.audio));
    // per chapter: start time of each word, stored as differences in hundredths of a second
    const ch=d.chapters.map(c=>{if(!c)return null;let t=c.t0;const st=new Float64Array(c.d.length);c.d.forEach((x,k)=>{t+=x/100;st[k]=t});return{t:st,end:c.end,file:c.file}});
    const words=ch.reduce((a,c)=>a+(c?c.t.length:0),0),secs=ch.reduce((a,c)=>a+(c?c.end-c.t[0]:0),0);
    const a={id,reader:d.reader,source:d.source,page:d.page,base:d.base,ch,wpm:words/secs*60};
    a.maxWpm=Math.floor(a.wpm*AUD_MAX/25)*25;
    if(id===BOOKID){AUD=a;applyAudioUI();if(playing&&set.audio){clearTimeout(timer);startAudio()}else primeAudio()}
    return a;
  })().catch(e=>{delete audioLoads[id];throw e}));
}
function seekAudio(i){
  const c=chapterOf(i),j=i-chStart[c],ch=AUD.ch[c],t=Math.max(0,ch.t[Math.min(j,ch.t.length-1)]-0.05);
  if(audCh!==c){audCh=c;audSeek=t;audioEl.src=AUD.base+ch.file+'#t='+t.toFixed(2)}
  else audioEl.currentTime=t;
}
function startAudio(){
  cancelAnimationFrame(audRAF);
  // a chapter without a time map reads as usual, without audio
  if(!AUD.ch[chapterOf(idx)]){if(!audioEl.paused)audioEl.pause();clearTimeout(timer);timer=setTimeout(step,delay(idx));return}
  seekAudio(idx);
  audioEl.playbackRate=audioRate();
  const p=audioEl.play();
  if(p)p.catch(e=>{if(!playing)return;if(e&&e.name==='NotAllowedError'){pause();toast('Tap play to start the audio.')}else audioFailed()});
  mediaInfo();
  audRAF=requestAnimationFrame(audioLoop);
}
function stopAudio(){cancelAnimationFrame(audRAF);if(!audioEl.paused)audioEl.pause()}
function audioLoop(){if(!playing||!audioOn())return;audioSync();audRAF=requestAnimationFrame(audioLoop)}
function audioFailed(){
  if(!audioOn())return;
  set.audio=false;applyAudioUI();save();
  toast('The audiobook could not be played. Reading continues without audio.',[],6000);
  if(playing){stopAudio();timer=setTimeout(step,delay(idx))}
}
audioEl.addEventListener('loadedmetadata',()=>{if(audSeek!=null&&Math.abs(audioEl.currentTime-audSeek)>0.3)audioEl.currentTime=audSeek;audSeek=null});
audioEl.addEventListener('timeupdate',()=>{if(document.hidden)audioSync()});
audioEl.addEventListener('error',()=>{if(playing)audioFailed()});
// dim the word while the narration is buffering, so a slow connection doesn't look like a freeze
audioEl.addEventListener('waiting',()=>{if(playing&&audioOn())stage.classList.add('buffering')});
for(const ev of['playing','pause','seeked'])audioEl.addEventListener(ev,()=>stage.classList.remove('buffering'));
// while paused, have the current spot loaded so play starts at once
function primeAudio(){if(audioOn()&&!playing&&AUD.ch[chapterOf(idx)])seekAudio(idx)}
// move the reader to whatever word the narrator is on
function audioSync(){
  if(!playing||!audioOn()||audCh<0||audioEl.seeking||audSeek!=null)return;
  const c=audCh,ch=AUD.ch[c],t=audioEl.currentTime;
  if(t>=ch.end||audioEl.ended){
    advanceTo(chapterEndOf(c));
    if(c+1>=BOOK.length){chapterEnd=true;pause();return}
    if(set.chapStop){chapterEnd=true;pause();chapterCheckpoint();return}
    idx=chStart[c+1];render();startAudio();return;
  }
  let lo=0,hi=ch.t.length-1;
  if(t<ch.t[0])return;
  while(lo<hi){const m=(lo+hi+1)>>1;if(ch.t[m]<=t+0.03)lo=m;else hi=m-1}
  const g=chStart[c]+lo;
  if(unitStart(g)!==idx&&g>idx)advanceTo(g);
}
function advanceTo(g){
  const n=g-idx;
  if(n>0&&sessOpen){sessOpen.w+=n;sessOpen.tw+=n*curWpm()}
  tickClock();
  store.max[BOOKID]=Math.max(store.max[BOOKID]||0,g);checkFinished(g);
  idx=unitStart(g);store.place[BOOKID]=idx;
  if(set.widthMode==='auto'&&syncChunks())layout();
  render();
  if(performance.now()-lastAutoSave>5000){lastAutoSave=performance.now();save(true)}
}
// lock-screen and headphone controls
function mediaInfo(){
  if(!('mediaSession' in navigator)||!AUD)return;
  try{
    navigator.mediaSession.metadata=new MediaMetadata({title:`${META.title} · ${BOOK[chapterOf(idx)].t}`,artist:META.author,album:`Read by ${AUD.reader} (${AUD.source})`,artwork:[{src:'icons/icon-512.png',sizes:'512x512',type:'image/png'}]});
    navigator.mediaSession.setActionHandler('play',()=>play(true));
    navigator.mediaSession.setActionHandler('pause',()=>pause());
    navigator.mediaSession.setActionHandler('previoustrack',()=>sentence(-1));
    navigator.mediaSession.setActionHandler('nexttrack',()=>sentence(1));
  }catch(e){}
}
function audioLabel(){
  const on=audioOn();
  $('wpmVal').nextElementSibling.textContent=on?`wpm · ${audioRate().toFixed(1)}×`:'wpm';
}
function applyAudioUI(){
  const show=hasAudio(),on=audioOn(),b=$('listenBtn');
  stage.classList.toggle('has-audio',show);
  b.hidden=!show;b.setAttribute('aria-pressed',String(!!set.audio&&show));
  b.querySelector('span').textContent=set.audio&&show?(on?'Listening':'Loading audio…'):'Listen';
  speed.max=on?AUD.maxWpm:1000;fill(speed);
  if(on&&wpm>AUD.maxWpm)setWpm(AUD.maxWpm);
  audioLabel();
}
function toggleAudio(){setAudio(!set.audio)}
function setAudio(on){
  set.audio=on;save();
  const wasPlaying=playing;if(wasPlaying)pause();
  if(set.audio){
    applyAudioUI();
    loadAudio(BOOKID).then(a=>{
      if(!a)return;
      toast(`Read-along audio, read by ${a.reader} (${a.source}). The narration follows your reading speed, up to ${a.maxWpm} wpm.`,[],6000);
      if(wasPlaying)play(true);
    }).catch(()=>{set.audio=false;applyAudioUI();toast('The audiobook could not be loaded. Check your connection.')});
  }else{applyAudioUI();if(wasPlaying)play(true)}
}

/* ================= rewind coach ================= */
let rewinds=[],lastPauseAt=0,coachCool=0,lastRewindAt=Date.now();
function noteRewind(){
  const now=Date.now();
  if(!(playing||now-lastPauseAt<12000))return;
  rewinds.push(now);lastRewindAt=now;
  if(sessOpen)sessOpen.rw++;
  rewinds=rewinds.filter(t=>now-t<3*60000);
  if(rewinds.length>=4){rewinds=[];suggestSpeed(-25,'You have gone back 4 times in 3 minutes.')}
}
// the single coaching nudge: triggered by frequent rewinds or missed questions (slower), or a long clean stretch (faster)
function suggestSpeed(delta,why){
  const now=Date.now();if(!set.coach||now<coachCool)return;
  coachCool=now+3*60000;const to=clamp(wpm+delta,100,1000);if(to===wpm)return;
  toast(`${why} Try ${to} wpm?`,[{t:'Not now',f:()=>{}},{t:delta<0?'Slow down':'Speed up',pri:true,f:()=>setWpm(to)}],9000);
}

/* ================= toast ================= */
let toastT=0;
function toast(msg,acts=[],ms=5000){
  $('toastMsg').textContent=msg;
  const box=$('toastActs');box.innerHTML='';
  acts.forEach(a=>{const b=document.createElement('button');b.className='btn'+(a.pri?' pri':'');b.textContent=a.t;b.onclick=e=>{e.stopPropagation();hideToast();a.f()};box.appendChild(b)});
  $('toast').classList.add('on');clearTimeout(toastT);toastT=setTimeout(hideToast,ms);
}
function hideToast(){$('toast').classList.remove('on')}

/* ================= comprehension quiz ================= */
let sampleFn=null,quizOK=false,quizBusy=null,lastQuizIdx=0;
const AI=()=>set.claude?sampleFn:null;
(async()=>{
  try{if(window.claude&&claude.use){sampleFn=await claude.use('sample');quizOK=!!sampleFn;if(sheet.open)showTab(curTab)}}catch(e){}
})();
function quizPassage(){
  const end=idx+unitLen(idx)-1;
  let a=Math.max(chStart[chapterOf(end)],end-1400,lastQuizIdx);
  if(end-a<300)a=Math.max(0,end-300);
  return W.slice(a,end+1).join(' ');
}
function closeQuiz(){app.classList.remove('quizzing');quizEl.innerHTML='';if(quizBusy){quizBusy.abort();quizBusy=null}render(true)}
const QTYPES={
  detail:['Detail question','Ask about a concrete event, action or detail that is stated plainly in the second half of the passage.'],
  inference:['Inference question','Ask a "why" or "what does this suggest" question whose answer is not stated word for word but follows clearly from the passage, such as a character\'s motive or feeling. Only one answer should be defensible.'],
  vocab:['Vocabulary in context','Pick a less common word or phrase from the passage and ask what it means as used there. Quote the short phrase it appears in.'],
  speaker:['Who said it','Quote a short line of dialogue from the passage and ask which character said it. Use character names as the choices.']
};
let qTurn=0;
async function openQuiz(reason){
  if(!AI()){toast('Comprehension questions need Claude, which is not available in this view.');return}
  if(playing)pause();
  app.classList.add('quizzing');
  const passage=quizPassage();
  const types=['detail','inference','vocab'];if(/[“"]/.test(passage))types.push('speaker');
  const type=types[qTurn++%types.length];
  const k=(reason==='chapter'?'End of chapter · ':reason==='timed'?'Quick check · ':'')+QTYPES[type][0];
  quizEl.innerHTML=`<div class="k">${k}</div><div class="qq" style="color:var(--mute)">Writing a question about what you just read…</div><div class="skel"><i></i><i></i><i></i><i></i></div><div class="acts"><button class="btn" id="qSkip">Skip</button></div>`;
  $('qSkip').onclick=()=>{closeQuiz()};
  const ctl=new AbortController();quizBusy=ctl;
  const prompt=`You write one multiple-choice reading-comprehension question for someone who just read the passage below (from ${META.title} by ${META.author}) in a speed-reading app.
${QTYPES[type][1]}
Never ask about anything that happens after the passage ends.
Return only JSON, with no other text, in this shape:
{"question": string, "choices": [string, string, string, string], "answer": 0-3, "explain": string}
Keep each choice under 14 words. Exactly one choice is correct and the wrong ones are plausible. "explain" is one short sentence pointing to the part of the passage that answers it.

Passage:
"""${passage}"""`;
  try{
    const q=await AI().json(prompt,{modelTier:'quick',signal:ctl.signal,cache:false});
    quizBusy=null;
    if(!q||typeof q.question!=='string'||!Array.isArray(q.choices)||q.choices.length<2||!(q.answer>=0&&q.answer<q.choices.length))throw{code:'bad_shape'};
    q.type=type;q.book=BOOKID;q.ch=chapterOf(idx);
    showQuestion(q,k);
  }catch(e){quizError(e,k)}
}
function quizError(e,k){
  quizBusy=null;
  if(e&&e.name==='AbortError')return;
  const code=e&&e.code;
  let msg='That could not be done this time.';
  if(code==='not_granted'){quizOK=false;msg='This needs permission to use your Claude account. You can turn Claude features off in Settings.'}
  else if(code==='rate_limited')msg='Too many requests right now. Try again in a minute.';
  quizEl.innerHTML=`<div class="k">${k}</div><div class="res">${esc(msg)}</div><div class="acts"><button class="btn pri" id="qBack">Back to reading</button></div>`;
  $('qBack').onclick=closeQuiz;
}
function showQuestion(q,k){
  quizEl.innerHTML=`<div class="k">${k}</div><div class="qq">${esc(q.question)}</div><div class="ch">${q.choices.map((c,i)=>`<button data-c="${i}"><span class="n">${i+1}</span><span>${esc(c)}</span></button>`).join('')}</div><div class="res" id="qRes"></div><div class="acts" id="qActs"><button class="btn" id="qSkip2">Skip</button></div>`;
  $('qSkip2').onclick=()=>{closeQuiz()};
  quizEl.querySelector('.ch').onclick=e=>{const b=e.target.closest('button[data-c]');if(b)answer(q,+b.dataset.c)};
  quizEl.querySelector('.ch button').focus();
}
function answer(q,c){
  const ok=c===q.answer;
  quizEl.querySelectorAll('.ch button').forEach((b,i)=>{b.disabled=true;if(i===q.answer)b.classList.add('right');else if(i===c)b.classList.add('wrong')});
  store.answers.push(ok?1:0);if(store.answers.length>100)store.answers.shift();
  if(sessOpen){sessOpen.qt++;if(ok)sessOpen.qc++}
  if(!q.recall){store.qbank.push({q:q.question,c:q.choices,a:q.answer,e:q.explain||'',t:q.type,book:q.book||BOOKID,ch:q.ch??chapterOf(idx),due:Date.now()+86400000,stage:0});if(store.qbank.length>150)store.qbank.shift()}
  lastQuizIdx=idx;save(true);
  $('qRes').innerHTML=`<b>${ok?'Correct.':'Not quite.'}</b> ${esc(q.explain||'')}`;
  const recent=store.answers.slice(-5),rate=recent.reduce((a,b)=>a+b,0)/recent.length;
  if(recent.length>=3&&rate<0.6)setTimeout(()=>suggestSpeed(-50,'Several questions missed recently.'),400);
  $('qActs').innerHTML=`<button class="btn pri" id="qGo">Continue reading</button>`;
  $('qGo').onclick=()=>{closeQuiz();if(q.recall)play(true)};$('qGo').focus();
}

/* ================= reading-skills module ================= */
const DAYMS=86400000;
const maxRead=()=>Math.max(store.max[BOOKID]||0,idx);
function sentenceAround(i,limit=40){
  const s=sentStart[sentIdx(i)],e=Math.min(N-1,(sentStart[sentIdx(i)+1]??N)-1);
  let a=s,b=e;if(b-a>limit){a=Math.max(s,i-Math.floor(limit/2));b=Math.min(e,a+limit)}
  return {a,b,text:W.slice(a,b+1).join(' ')};
}
function markWord(text,form){
  const re=new RegExp('\\b('+form.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')\\b','i');
  return esc(text).replace(re,'<mark>$1</mark>');
}
function cardShell(k,body,acts){
  app.classList.add('quizzing');
  quizEl.innerHTML=`<div class="k">${k}</div>${body}<div class="acts" id="cActs">${acts||''}</div>`;
  quizEl.scrollTop=0;
}
function continueReading(){closeQuiz();play(true)}

/* ---- before-reading card: chapter preview and words, or one recall question ---- */
let recallShownThisSession=false;
function preStartCards(){
  // at most one card before reading: the chapter card at a chapter start, otherwise one recall question
  const now=Date.now(),c=chapterOf(idx),key=BOOKID+':'+c;
  const hasGuide=GUIDE&&GUIDE.chapters[c]&&GUIDE.chapters[c].pre;
  if(set.before&&!store.taught[key]&&idx-chStart[c]<60&&((PRE[c]&&PRE[c].length)||hasGuide||(AI()&&GUIDE&&GUIDE.gen))){store.taught[key]=1;save();showBefore(c);return true}
  if(set.recall&&!recallShownThisSession){
    const due=store.qbank.find(q=>q.book===BOOKID&&q.due<=now&&q.stage<3&&q.ch<c+1);
    if(due){recallShownThisSession=true;showRecall(due);return true}
  }
  return false;
}
function showRecall(q){
  const k=`From ${BOOK[q.ch]?BOOK[q.ch].t:'earlier'} · remembering what you read`;
  quizEl.innerHTML='';
  showQuestion({question:q.q,choices:q.c,answer:q.a,explain:q.e,recall:q},k);
  // grade spaced recall separately
  quizEl.querySelector('.ch').onclick=e=>{const b=e.target.closest('button[data-c]');if(!b)return;
    const ok=+b.dataset.c===q.a;q.stage=ok?q.stage+1:0;q.due=Date.now()+(ok?[7,30,90][Math.min(2,q.stage-1)]:1)*DAYMS;
    answer({question:q.q,choices:q.c,answer:q.a,explain:q.e,recall:true},+b.dataset.c)};
}
/* ================= speaker refinement with Claude =================
   The built-in speaker model (a probabilistic conversation tracker run offline) is right most of the time.
   When Claude is available, each chapter's dialogue is also read by Claude once, in the background, and
   the result is kept, so every quote gets a confident speaker. */
const aiBusy=new Set();
function applyAI(m,ci,names){
  const qs=m.quotes[ci]||[];
  names.forEach((n,k)=>{
    const q=qs[k];if(!q||!n)return;
    let s=-1;
    if(n!=='unknown'){s=m.spk.indexOf(n);if(s<0){m.spk.push(n);s=m.spk.length-1}}
    for(let i=q[0];i<=q[1];i++){m.S[i]=s;m.G[i]=0}
  });
  clearLetterSpeakers(m);
}
// letters are quoted text but not speech: no speaker colour, tag or pause inside them
function clearLetterSpeakers(m){for(const L of (m.guide&&m.guide.letters)||[])for(let i=L.a;i<=L.b;i++){m.S[i]=-1;m.G[i]=0;m.U[i]=0}}
function applyStoredAISpeakers(m){
  if(!store.aispk)return;
  for(const k in store.aispk){const [b,ci]=k.split(':');if(b===m.id)applyAI(m,+ci,store.aispk[k])}
}
async function refineSpeakers(ci){
  if(!set.aiSpeakers||!AI()||ci<0)return;
  store.aispk=store.aispk||{};
  const key=BOOKID+':'+ci;if(store.aispk[key]||aiBusy.has(key))return;
  const m=cache[BOOKID],qs=m.quotes[ci]||[];if(!qs.length)return;
  aiBusy.add(key);
  try{
    const names=new Array(qs.length).fill(null);
    // batches of paragraphs, about 3,000 words each, with the previous paragraph for context
    const paras=[...new Set(qs.map(q=>q[2]))];
    let bi=0;
    while(bi<paras.length){
      let words=0,batch=[];
      while(bi<paras.length&&(words<3000||!batch.length)){batch.push(paras[bi]);words+=BOOK[ci].p[paras[bi]].split(' ').length;bi++}
      const first=batch[0],ctx=first>0?BOOK[ci].p[first-1]:'';
      let text=ctx?`(Context) ${ctx}\n\n`:'',ids=[];
      for(const pi of batch){
        const base=paraStart[ci][pi],ws=BOOK[ci].p[pi].split(' ');
        const inPara=qs.map((q,k)=>[q,k]).filter(([q])=>q[2]===pi);
        let out='',pos=0;
        for(const [q,k] of inPara){out+=ws.slice(pos,q[0]-base).join(' ')+` [Q${k+1}]`+ws.slice(q[0]-base,q[1]-base+1).join(' ')+' ';pos=q[1]-base+1;ids.push(k)}
        out+=ws.slice(pos).join(' ');text+=out.trim()+'\n\n';
      }
      const r=await AI().json(`Below is part of a chapter of ${META.title} by ${META.author}. Each quotation is marked with an ID like [Q3] placed immediately before it.
For every ID, decide who speaks that quotation. Use exactly one of these names: ${SPK.filter(n=>!n.startsWith('?')).join('; ')}. If the speaker is someone else, give a short description in the same style (for example "The waiter"). Use "unknown" only if it truly cannot be worked out.
Consider who is present, turn-taking, pronouns such as "she said", people addressed by name (the person addressed is usually not the speaker), and speeches interrupted by narration that continue afterwards.
Return only a JSON object mapping each ID to a name, like {"Q1": "...", "Q2": "..."}.

${text}`,{modelTier:'quick',cache:true});
      for(const k of ids){const v=r&&r['Q'+(k+1)];if(typeof v==='string')names[k]=v.trim()}
    }
    store.aispk[key]=names;save(true);
    applyAI(m,ci,names);lastWho=null;if(!playing)render();
  }catch(e){if(e&&e.code==='not_granted')set.aiSpeakers=false}
  finally{aiBusy.delete(key)}
}

/* ================= reading guide (precomputed, works offline) ================= */
const curChapter=()=>chapterOf(idx);
function personHTML(n){
  if(!GUIDE||!GUIDE.people[n])return'';
  const p=GUIDE.people[n],c=chapterOf(maxRead());
  const about=(p.about||[]).filter(([ch])=>ch<=c);
  return`<div class="pcard">${p.look?`<div><span class="plabel">Appearance</span> ${esc(p.look)}</div>`:''}${about.length?`<div><span class="plabel">So far</span> ${about.map(([,t])=>esc(t)).join(' ')}</div>`:''}</div>`;
}
function journeyHTML(){
  const m=GUIDE.map;if(!m)return'';
  const c=curChapter();
  let reached=0;m.route.forEach((r,k)=>{if(r[3]<=c)reached=k});
  const pts=m.route.map(r=>r[1]+','+r[2]);
  const done=pts.slice(0,reached+1).join(' '),todo=pts.slice(reached).join(' ');
  const [nm,x,y]=m.route[reached];
  return`<section class="gsec"><h4>The journey</h4><div class="journey"><svg viewBox="0 6 ${m.w} ${m.h-6}" role="img" aria-label="Map of the route; currently at ${esc(nm)}">
    <path d="${m.land}" fill="var(--surface2)"/><path d="${m.land}" fill="var(--surface2)" transform="translate(360,0)"/>
    <polyline points="${todo}" fill="none" stroke="var(--mute)" stroke-width=".6" stroke-dasharray="2 2"/>
    <polyline points="${done}" fill="none" stroke="var(--focal)" stroke-width="1.1" stroke-linejoin="round"/>
    ${m.route.slice(0,reached+1).map(r=>`<circle cx="${r[1]}" cy="${r[2]}" r="1.1" fill="var(--focal)"/>`).join('')}
    <circle cx="${x}" cy="${y}" r="3" fill="var(--focal)" opacity=".25"/><circle cx="${x}" cy="${y}" r="1.7" fill="var(--focal)"/>
    <text x="${Math.min(x+3,m.w-40)}" y="${y-3}" font-size="5.5" fill="var(--ink)" font-family="var(--serif)">${esc(nm)}</text></svg>
    <div class="st">${reached+1} of ${m.route.length} stops reached. The dashed line is the planned route announced in Chapter 3.</div></div></section>`;
}
/* ---- Sense and Sensibility: England map, money ledger, family tree ----
   All three are drawn only up to the reader's furthest point (maxRead): each fact carries the index of
   the word after which the book has revealed it. */
/* ---- Twenty Thousand Leagues: the voyage, the depths and the Nautilus ---- */
function voyageHTML(){
  const g=GUIDE.voyage,m=maxRead(),stops=g.route.filter(r=>r[3]<=m);
  if(!stops.length)return'';
  const cur=stops[stops.length-1];
  // split a leg into runs, wrapping across the map edge when the short way round is over the side
  const runs=a=>{const out=[[]];a.forEach((r,k)=>{const p=a[k-1];if(p&&Math.abs(r[1]-p[1])>g.w/2){const d=r[1]>p[1]?-g.w:g.w,t=(d<0?p[1]:g.w-p[1])/Math.abs(r[1]+d-p[1]),y=(p[2]+(r[2]-p[2])*t).toFixed(1);out[out.length-1].push([0,d<0?0:g.w,y]);out.push([[0,d<0?g.w:0,y]])}out[out.length-1].push(r)});return out.filter(x=>x.length>1).map(x=>x.map(r=>r[1]+','+r[2]).join(' '))};
  const ship=stops.filter(r=>r[4]==='ship'),sub=stops.filter(r=>r[4]==='nautilus');
  const lg=(g.leagues||[]).filter(x=>x[0]<=m),last=lg[lg.length-1];
  const land=`<path d="${g.land}" fill="var(--surface2)" stroke="var(--rule)" stroke-width=".3"/>`;
  return`<section class="gsec"><h4>The voyage</h4><div class="journey voy"><svg viewBox="0 0 ${g.w} ${g.h}" role="img" aria-label="World map of the voyage so far; now at ${esc(cur[0])}">
    ${land}<g transform="translate(360,0)">${land}</g>
    ${runs(ship).map(p=>`<polyline points="${p}" fill="none" stroke="var(--mute)" stroke-width=".8" stroke-dasharray="2 2"/>`).join('')}
    ${runs(sub).map(p=>`<polyline points="${p}" fill="none" stroke="var(--focal)" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
    ${stops.slice(0,-1).map(r=>`<circle cx="${r[1]}" cy="${r[2]}" r="1.3" fill="${r[4]==='ship'?'var(--mute)':'var(--focal)'}"/>`).join('')}
    <circle cx="${cur[1]}" cy="${cur[2]}" r="5" fill="var(--focal)" opacity=".22"/><circle cx="${cur[1]}" cy="${cur[2]}" r="2.4" fill="var(--focal)"/>
    <text x="${cur[1]>g.w-70?cur[1]-5:cur[1]+5}" y="${cur[2]<12?cur[2]+11:cur[2]-5}" text-anchor="${cur[1]>g.w-70?'end':'start'}" class="now">${esc(cur[0])}</text>
  </svg>
  ${last?`<div class="leagues"><div class="lh"><b>${last[1].toLocaleString('en-GB')} leagues</b><span>of 20,000</span></div><div class="bar"><i style="width:${Math.min(100,last[1]/200)}%"></i></div><div class="st">“${esc(last[2])}”</div></div>`:''}
  <div class="gcard"><div class="gtitle">${esc(cur[0])}</div><div class="sumtext">${esc(cur[5])}</div>${cur[6]?`<div class="ctxnote">“${esc(cur[6])}”</div>`:''}
    <details><summary>Places so far (${stops.length})</summary><ol class="wl">${stops.map(r=>`<li><b>${esc(r[0])}</b> ${esc(r[5])}</li>`).join('')}</ol></details>
    <p class="st">Dashed line: the frigate’s search. Red line: the Nautilus.</p></div></div></section>`;
}
function depthsHTML(){
  const m=maxRead(),ds=GUIDE.depths.filter(x=>x[0]<=m);
  if(!ds.length)return'';
  const top=Math.max(...ds.map(x=>x[1]));
  return`<section class="gsec"><h4>How deep they have been</h4><div class="gcard">
    <div class="sumtext">Each depth the book gives, converted to metres from the text’s yards, feet and fathoms.</div>
    <div class="bars" role="list">${ds.map(x=>`<div class="barrow" role="listitem" aria-label="${esc(x[4])}: ${x[1].toLocaleString('en-GB')} metres"><span class="bl">${esc(x[4])}</span><span class="bt"><i style="width:${(x[1]/top*100).toFixed(1)}%;min-width:8px"></i></span><span class="bv">${x[1].toLocaleString('en-GB')} m</span></div>`).join('')}</div>
    <details><summary>What the book says</summary><ul class="wl">${ds.map(x=>`<li><b>${esc(x[4])}</b> “${esc(x[2])}” <i>${esc(x[3])}</i></li>`).join('')}</ul></details>
  </div></section>`;
}
function vesselHTML(){
  const m=maxRead(),vs=GUIDE.vessel.filter(x=>x[0]<=m);
  if(!vs.length)return'';
  const has=l=>vs.some(x=>x[1]===l),later=GUIDE.vessel.length-vs.length;
  return`<section class="gsec"><h4>The Nautilus</h4><div class="gcard">
    <svg class="sub" viewBox="0 0 320 96" role="img" aria-label="Side view of the Nautilus">
      <path d="M22 50C60 26 252 26 292 50 252 74 60 74 22 50Z" fill="var(--surface2)" stroke="var(--ink)" stroke-width="1.2"/>
      <path d="M292 50l20-1.5-20 3" fill="var(--ink)" stroke="var(--ink)" stroke-width="1" stroke-linejoin="round"/>
      <path d="M14 42v16M22 46l-8-4M22 54l-8 4" stroke="var(--ink)" stroke-width="1.1" fill="none" stroke-linecap="round"/>
      <rect x="132" y="28" width="56" height="7" rx="3" fill="var(--surface2)" stroke="var(--ink)" stroke-width="1"/>
      <path d="M232 33l9-7h9l-3 8" fill="var(--surface2)" stroke="var(--ink)" stroke-width="1" stroke-linejoin="round"/>
      ${[120,140,160,180,200].map(x=>`<circle cx="${x}" cy="50" r="3.2" fill="var(--focal)" opacity=".55"/>`).join('')}
      ${has('Length')?`<path d="M22 84H292M22 80v8M292 80v8" stroke="var(--mute)" stroke-width=".8"/><text x="157" y="81" class="dim">232 feet</text>`:''}
      ${has('Breadth')?`<path d="M304 32V68M300 32h8M300 68h8" stroke="var(--mute)" stroke-width=".8"/><text x="300" y="20" class="dim">26 ft</text>`:''}
    </svg>
    <dl class="facts">${vs.map(x=>`<div><dt>${esc(x[1])}</dt><dd>${esc(x[2])}${x[3]?`<span class="st"> · ${esc(x[3])}</span>`:''}</dd></div>`).join('')}</dl>
    ${later?`<p class="st">Captain Nemo reveals more about his ship later in the book.</p>`:''}
  </div></section>`;
}
function englandHTML(){
  const g=GUIDE.england,m=maxRead();
  const stops=g.route.filter(r=>r[3]<=m);if(!stops.length)return'';
  const cur=stops[stops.length-1],here=cur[6];
  const pts=stops.map(r=>r[1]+','+r[2]).join(' ');
  const placed=new Set(stops.map(r=>r[6]));
  const sites=g.sites.filter(s=>s[3]<=m&&!placed.has(s[0]));
  const label=(x,y,t,cls)=>{const[dx,dy,an]=g.lab[t]||[4,-4,'start'];return`<text x="${x+dx}" y="${y+dy}" text-anchor="${an}" class="${cls}">${esc(t)}</text>`};
  const legs=stops.slice(1).map((r,k)=>`<li><b>${esc(stops[k][6])} → ${esc(r[6])}</b> “${esc(r[5])}”</li>`).join('');
  return`<section class="gsec"><h4>Where the Dashwoods are</h4><div class="journey eng"><svg viewBox="0 0 ${g.w} ${g.h}" role="img" aria-label="Map of southern England; the Dashwoods are now at ${esc(here)}">
    <path d="${g.land}" fill="var(--surface2)" stroke="var(--rule)" stroke-width=".5"/>
    ${g.counties.map(([n,x,y])=>`<text x="${x}" y="${y}" class="cty">${esc(n)}</text>`).join('')}
    ${sites.map(s=>`<circle cx="${s[1]}" cy="${s[2]}" r="1.8" fill="var(--mute)"/>${label(s[1],s[2],s[0],'site')}`).join('')}
    ${stops.length>1?`<polyline points="${pts}" fill="none" stroke="var(--focal)" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/>`:''}
    ${stops.slice(0,-1).map(r=>`<circle cx="${r[1]}" cy="${r[2]}" r="1.8" fill="var(--focal)"/>`).join('')}
    ${[...new Map(stops.slice(0,-1).map(r=>[r[6],r])).values()].filter(r=>r[6]!==here).map(r=>label(r[1],r[2],r[6],'stop')).join('')}
    <circle cx="${cur[1]}" cy="${cur[2]}" r="5" fill="var(--focal)" opacity=".22"/><circle cx="${cur[1]}" cy="${cur[2]}" r="2.6" fill="var(--focal)"/>
    ${label(cur[1],cur[2],here,'now')}
  </svg>
  <div class="gcard"><div class="gtitle">${esc(cur[0].replace(' again',''))}</div><div class="sumtext">${esc(cur[4])}</div><div class="ctxnote">“${esc(cur[5])}”</div>
  ${legs?`<details><summary>Journeys so far (${stops.length-1})</summary><ul class="wl">${legs}</ul></details>`:''}
  ${sites.length?`<details><summary>Other places mentioned (${sites.length})</summary><ul class="wl">${sites.map(s=>`<li><b>${esc(s[0])}</b> ${esc(s[4])}</li>`).join('')}</ul></details>`:''}</div></div></section>`;
}
const money=v=>'£'+Math.round(v).toLocaleString('en-GB');
function ledgerHTML(){
  const m=maxRead(),items=GUIDE.ledger.items.filter(x=>x.i<=m);
  if(!items.length)return'';
  const later=GUIDE.ledger.items.length-items.length;
  const bars=items.map((x,k)=>({...x,k})).filter(x=>x.yearly).sort((a,b)=>b.yearly-a.yearly);
  const top=bars.length?bars[0].yearly:1;
  return`<section class="gsec" id="ledger"><h4>Money</h4><div class="gcard">
    <div class="sumtext">Every sum in the book, as it comes up. Money was invested to earn about 5% a year, so a fortune of £10,000 meant an income of about £500 a year.</div>
    ${bars.length>1?`<div class="fb"><span>Yearly incomes so far (a fortune counts as the income it brings)</span><div class="bars" role="list">${bars.map(b=>`<button class="barrow" role="listitem" data-led="${b.k}" aria-label="${esc(b.who)}: ${esc(b.amount)}"><span class="bl">${esc(b.who)}</span><span class="bt"><i style="width:${Math.max(1.5,b.yearly/top*100).toFixed(1)}%"></i></span><span class="bv">${money(b.yearly)}</span></button>`).join('')}</div></div>`:''}
    <ol class="ledger">${items.map((x,k)=>`<li id="led${k}"><div class="lh"><b>${esc(x.who)}</b><span>${esc(x.amount)}</span></div><div class="ctxnote">“${esc(x.quote)}”</div><div class="st">${esc(x.note)}</div></li>`).join('')}</ol>
    ${later?`<p class="st">${later} more ${later===1?'sum comes':'sums come'} up later in the book.</p>`:''}
  </div></section>`;
}
function lettersHTML(){
  const m=maxRead(),Ls=GUIDE.letters.filter(L=>L.b<=m),later=GUIDE.letters.length-Ls.length;
  if(!Ls.length)return'';
  return`<section class="gsec"><h4>Letters</h4><div class="gcard">
    <div class="sumtext">The letters you have read so far, to read again.</div>
    ${Ls.map(L=>`<details><summary><span><b>${esc(L.title)}</b><span class="st"> · ${esc(BOOK[chapterOf(L.a)].t)}</span></span></summary>
      <div class="ctxnote">${esc(L.intro)}</div>
      <div class="letter"><div class="lt-h">${esc(L.from)} to ${esc(L.to)}</div>${letterHTML(L)}</div>
      <button class="btn tonal" data-goto="${L.a}">Read it in the book</button></details>`).join('')}
    ${later?`<p class="st">${later} more ${later===1?'letter comes':'letters come'} later in the book.</p>`:''}
  </div></section>`;
}
function bindLedger(box){
  box.querySelectorAll('[data-led]').forEach(b=>b.onclick=()=>{
    const li=$('led'+b.dataset.led);if(!li)return;
    li.scrollIntoView({block:'center',behavior:'smooth'});li.classList.remove('flash');void li.offsetWidth;li.classList.add('flash');
  });
}
function treeHTML(m){
  const T=GUIDE.tree,P=Object.fromEntries(T.people.map(p=>[p.id,p]));
  const shown=T.people.filter(p=>p.i<=m),ids=new Set(shown.map(p=>p.id));
  if(!shown.length)return`<p class="empty" style="padding:0 14px">The family tree fills in as you meet people.</p>`;
  const lab=l=>{let t='';for(const[i,x]of l.labels)if(i<=m)t=x;return t};
  const links=T.links.filter(l=>l.labels[0][0]<=m&&ids.has(l.a)&&ids.has(l.b)).map(l=>({...l,text:lab(l),ended:l.end!=null&&l.end<=m}));
  const sel=mapSel&&ids.has(mapSel)?mapSel:null;
  const touches=l=>sel&&(l.a===sel||l.b===sel);
  const spouse=id=>{const l=links.find(l=>l.kind==='marriage'&&(l.a===id||l.b===id)&&P[l.a].y===P[l.b].y&&Math.abs(P[l.a].x-P[l.b].x)<100);return l?P[l.a===id?l.b:l.a]:null};
  const W2=p=>Math.max(42,p.label.length*6+18);
  let lines='';
  for(const l of links){
    if(!l.draw)continue;
    const a=P[l.a],b=P[l.b],on=touches(l),dim=sel&&!on?' opacity=".25"':'';
    if(l.kind==='child'){
      const sp=spouse(a),x0=sp&&sp.y===a.y?(a.x+sp.x)/2:a.x,y0=a.y+11,ym=(a.y+b.y)/2;
      lines+=`<path d="M${x0},${y0}V${ym}H${b.x}V${b.y-11}" fill="none" stroke="${on?'var(--ink)':'var(--mute)'}" stroke-width="${on?1.6:1}"${dim}/>`;
    }else{
      const far=a.y===b.y&&Math.abs(a.x-b.x)>100,dash=l.kind==='marriage'?'':' stroke-dasharray="3 3"';
      const col=l.ended?'var(--rule)':l.kind==='engaged'?'var(--pivot)':l.kind==='marriage'?'var(--focal)':'var(--mute)';
      const x1=a.x+(a.y===b.y?Math.sign(b.x-a.x)*W2(a)/2:0),x2=b.x-(a.y===b.y?Math.sign(b.x-a.x)*W2(b)/2:0);
      const y1=a.y+(a.y===b.y?0:Math.sign(b.y-a.y)*11),y2=b.y-(a.y===b.y?0:Math.sign(b.y-a.y)*11);
      const lift=far?Math.min(70,20+Math.abs(a.x-b.x)*.12):0;
      const d=far?`M${a.x},${a.y+11}C${a.x},${a.y+11+lift} ${b.x},${b.y+11+lift} ${b.x},${b.y+11}`:`M${x1},${y1}L${x2},${y2}`;
      lines+=`<path d="${d}" fill="none" stroke="${on?'var(--ink)':col}" stroke-width="${on?2:l.kind==='marriage'?1.8:1.2}"${dash}${dim}/>`;
      if(far&&l.text)lines+=`<text x="${(a.x+b.x)/2}" y="${a.y+11+lift*.78}" class="tl"${dim}>${esc(l.ended?'engagement broken off':l.text)}</text>`;
    }
  }
  const nodes=shown.map(p=>{const w=W2(p),k=[p.full,p.label].map(n=>SPK.indexOf(n)).find(x=>x>=0),c=k!=null?colorOf(k):'var(--mute)';
    const rel=sel&&(sel===p.id||links.some(l=>touches(l)&&(l.a===p.id||l.b===p.id)));
    return`<g class="mn" data-n="${p.id}" tabindex="0" role="button" aria-label="${esc(p.full)}"${sel&&!rel?' opacity=".3"':''}><rect x="${p.x-w/2}" y="${p.y-11}" width="${w}" height="22" rx="11" fill="var(--surface)" stroke="${sel===p.id?'var(--ink)':'var(--rule)'}" stroke-width="${sel===p.id?1.6:1}"/><circle cx="${p.x-w/2+10}" cy="${p.y}" r="3.5" fill="${c}"/><text x="${p.x+5}" y="${p.y+4}" text-anchor="middle" class="tn">${esc(p.label)}</text></g>`}).join('');
  let info='<p class="note">Solid red lines are marriages, dashed lines are other ties. Tap a person to see how they are connected. Swipe sideways to see the whole tree.</p>';
  if(sel){
    const rel=links.filter(l=>l.a===sel||l.b===sel).map(l=>{const o=P[l.a===sel?l.b:l.a];const t=l.ended?'engagement broken off':l.kind==='child'?(l.a===sel?'child':'parent'):l.text||l.kind;return`<li><b>${esc(o.full)}</b> · ${esc(t)}</li>`}).join('');
    info=`<div class="minfo"><div class="tt">${esc(P[sel].full)}</div>${rel?`<ul>${rel}</ul>`:''}</div>`;
  }
  const hidden=T.people.length-shown.length;
  return`<div class="treebox"><svg viewBox="0 0 ${T.w} ${T.h}" width="${T.w*0.84}" role="img" aria-label="Family tree">${lines}${nodes}</svg></div>${info}${hidden?`<p class="note">${hidden} more ${hidden===1?'person joins':'people join'} the tree as you read. Nothing past your furthest point is shown.</p>`:''}`;
}
function renderGuide(){
  const box=$('guidePanel');
  if(!GUIDE){box.innerHTML='<p class="empty">A reading guide is not available for this book yet.</p>';return}
  const c=curChapter(),ch=GUIDE.chapters[c],sc=sceneAt(idx),done=chapterDone(c);
  if(GUIDE.gen)return renderUploadGuide(box,c,ch,done);
  const scenesHere=SCENES.filter(x=>x.ci===c);
  const past=scenesHere.filter(x=>sc&&x.k<sc.k);
  const place=sc&&GUIDE.places[sc.l];
  const met=new Set(Object.keys(FIRST).filter(n=>FIRST[n]<=maxRead()));
  const here=new Set();for(let i=chStart[c];i<=chapterEndOf(c);i++)if(U[i]&&S[i]>=0)here.add(SPK[S[i]]);
  const people=[...here].filter(n=>met.has(n)&&GUIDE.people[n]);
  const notes=GUIDE.context.filter(([k])=>k<=c);
  const words=(PRE[c]||[]).map(({f})=>DICT[f]).filter(Boolean);
  const story=GUIDE.chapters.map((x,k)=>({k,x})).filter(({k})=>k<c||(k===c&&done));
  const places=[];const seenP=new Set();SCENES.filter(x=>x.i<=maxRead()).forEach(x=>{const k=x.l.trim();if(!seenP.has(k)&&GUIDE.places[x.l]){seenP.add(k);places.push(x)}});
  box.innerHTML=`
  ${GUIDE.map?journeyHTML():''}${GUIDE.england?englandHTML():''}${GUIDE.voyage?voyageHTML():''}
  <section class="gsec now"><h4>Right now</h4>
    <div class="gcard">
      <div class="gtitle">${esc(BOOK[c].t)}${sc?` · ${esc(sc.l)}`:''}</div>
      ${place?`<div class="sumtext">${esc(place.desc)}</div>`:''}
      ${past.length||sc?`<div class="fb"><span>${past.length?'What has happened in this chapter so far':'Where things stand'}</span><ul class="tl2">${past.map(x=>`<li>${esc(GUIDE.scenes[x.k].sum)}</li>`).join('')}${sc?`<li class="nowli"><b>Now:</b> ${esc(GUIDE.scenes[sc.k].set)}</li>`:''}</ul></div>`:''}
      ${place&&place.ctx?`<div class="ctxnote"><span class="plabel">Background</span> ${esc(place.ctx)}</div>`:''}
    </div></section>
  <section class="gsec"><h4>This chapter</h4><div class="gcard">
    <div class="sumtext">${esc(ch.pre)}</div>
    ${people.length?`<div class="fb"><span>People in this chapter</span><div class="chips">${people.map(n=>`<button class="chip" data-person="${esc(n)}"><i style="background:${colorOf(SPK.indexOf(n))}"></i>${esc(n)}</button>`).join('')}</div><div id="gPerson"></div></div>`:''}
    ${words.length?`<div class="fb"><span>Words to know</span><ul class="wl">${words.map(d=>`<li><b>${esc(d[0])}</b> <i>${esc(d[1])}</i> · ${esc(d[2])}</li>`).join('')}</ul></div>`:''}
    <div class="fb"><span>Chapter summary</span>${done?`<div class="sumtext">${esc(ch.sum)}</div>`:`<div><button class="btn out" id="gReveal">Reveal full summary (spoilers)</button><div class="sumtext" id="gSum" hidden>${esc(ch.sum)}</div></div>`}</div>
  </div></section>
  ${(()=>{const st=story.filter(({k})=>k!==c);if(!st.length)return'';const recent=st.slice(-3),older=st.slice(0,-3);
    const li=({k,x})=>`<li value="${k+1}"><b>${esc(BOOK[k].t)}</b> ${esc(x.sum)}</li>`;
    return`<section class="gsec"><h4>The story so far</h4><div class="gcard">${older.length?`<details><summary>Earlier chapters (${older.length})</summary><ol class="story">${older.map(li).join('')}</ol></details>`:''}<ol class="story">${recent.map(li).join('')}</ol></div></section>`})()}
  ${GUIDE.ledger?ledgerHTML():''}${GUIDE.letters?lettersHTML():''}${GUIDE.depths?depthsHTML():''}${GUIDE.vessel?vesselHTML():''}
  ${notes.length?`<section class="gsec"><h4>Background and context</h4><div class="gcard">${notes.map(([k,t,x])=>`<details${k===c?' open':''}><summary>${esc(t)}</summary><div class="sumtext">${esc(x)}</div></details>`).join('')}</div></section>`:''}
  ${places.length?`<section class="gsec"><h4>Places so far</h4><div class="gcard">${places.map(x=>`<details><summary>${esc(x.l)}</summary><div class="sumtext">${esc(GUIDE.places[x.l].desc)}</div>${GUIDE.places[x.l].ctx?`<div class="ctxnote">${esc(GUIDE.places[x.l].ctx)}</div>`:''}</details>`).join('')}</div></section>`:''}
  <p class="note">Everything here covers only what you have read, except the chapter summary when you choose to reveal it.</p>`;
  bindLedger(box);
  box.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{closeSheet();go(+b.dataset.goto)});
  const rv=$('gReveal');if(rv)rv.onclick=()=>{$('gSum').hidden=false;rv.remove()};
  box.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{const n=b.dataset.person;box.querySelectorAll('[data-person]').forEach(x=>x.classList.toggle('on',x===b));$('gPerson').innerHTML=`<div class="tt" style="margin-top:8px">${esc(n)}</div><div class="st">${esc(CAST[n]||'')}</div>${personHTML(n)}`});
}

function renderUploadGuide(box,c,ch,done){
  const met=new Set(Object.keys(FIRST).filter(n=>FIRST[n]<=maxRead()));
  const people=Object.entries(GUIDE.people).filter(([n,p])=>p.about.some(([k])=>k===c)&&p.about.some(([k])=>k<=chapterOf(maxRead())));
  const places=Object.entries(GUIDE.places).filter(([,p])=>p.ch<=chapterOf(maxRead()));
  const words=(PRE[c]||[]).map(({f})=>DICT[f]).filter(Boolean);
  const notes=GUIDE.context.filter(([k])=>k<=c);
  const story=GUIDE.chapters.map((x,k)=>({k,x})).filter(({k,x})=>x&&(k<c||(k===c&&done)));
  const busy=guideBusy.has(c);
  box.innerHTML=`
  <section class="gsec"><h4>This chapter</h4><div class="gcard">
    <div class="gtitle">${esc(BOOK[c].t)}${BOOK[c].s?` · ${esc(BOOK[c].s)}`:''}</div>
    ${ch?`<div class="sumtext">${esc(ch.pre)}</div>`:AI()?`<div class="res">${busy?'<span class="spinner"></span>Claude is preparing this chapter\'s guide…':'This chapter\'s guide has not been created yet.'}</div>${busy?'':'<div><button class="btn tonal" id="gMake"><svg class="i"><use href="#i-spark"/></svg>Create the guide with Claude</button></div>'}`:'<div class="res">Chapter guides for your own PDFs are written by Claude, which is not available in this view.</div>'}
    ${people.length?`<div class="fb"><span>People in this chapter</span><div class="chips">${people.map(([n])=>`<button class="chip" data-person="${esc(n)}"><i style="background:${SPK.includes(n)?colorOf(SPK.indexOf(n)):'var(--mute)'}"></i>${esc(n)}</button>`).join('')}</div><div id="gPerson"></div></div>`:''}
    ${words.length?`<div class="fb"><span>Words to know</span><ul class="wl">${words.map(d=>`<li><b>${esc(d[0])}</b> <i>${esc(d[1])}</i> · ${esc(d[2])}</li>`).join('')}</ul></div>`:''}
    ${ch?`<div class="fb"><span>Chapter summary</span>${done?`<div class="sumtext">${esc(ch.sum)}</div>`:`<div><button class="btn out" id="gReveal">Reveal full summary (spoilers)</button><div class="sumtext" id="gSum" hidden>${esc(ch.sum)}</div></div>`}</div>`:''}
  </div></section>
  ${story.filter(({k})=>k!==c).length?`<section class="gsec"><h4>The story so far</h4><div class="gcard"><ol class="story">${story.filter(({k})=>k!==c).map(({k,x})=>`<li value="${k+1}"><b>${esc(BOOK[k].t)}</b> ${esc(x.sum)}</li>`).join('')}</ol></div></section>`:''}
  ${notes.length?`<section class="gsec"><h4>Background and context</h4><div class="gcard">${notes.map(([k,t,x])=>`<details${k===c?' open':''}><summary>${esc(t)}</summary><div class="sumtext">${esc(x)}</div></details>`).join('')}</div></section>`:''}
  ${places.length?`<section class="gsec"><h4>Places so far</h4><div class="gcard">${places.map(([n,p])=>`<details><summary>${esc(n)}</summary><div class="sumtext">${esc(p.desc)}</div></details>`).join('')}</div></section>`:''}
  <p class="note">Guides for your own PDFs are written by Claude one chapter at a time, as you reach each chapter, and saved on this device.</p>`;
  const mk=$('gMake');if(mk)mk.onclick=()=>{buildUploadGuide(c);renderGuide()};
  const rv=$('gReveal');if(rv)rv.onclick=()=>{$('gSum').hidden=false;rv.remove()};
  box.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{const n=b.dataset.person;box.querySelectorAll('[data-person]').forEach(x=>x.classList.toggle('on',x===b));$('gPerson').innerHTML=`<div class="tt" style="margin-top:8px">${esc(n)}</div>${personHTML(n)}`});
}

/* ================= summaries & comprehension ================= */
const ckey=c=>BOOKID+':'+c;
const chapterDone=c=>maxRead()>=chapterEndOf(c)-5;
function chapterText(c,cap=14000){
  let w=W.slice(chStart[c],chapterEndOf(c)+1);
  if(w.length>cap)w=w.slice(0,Math.round(cap*.4)).concat(['[…middle of chapter omitted…]'],w.slice(-Math.round(cap*.6)));
  return w.join(' ');
}
const metBefore=i=>Object.keys(FIRST).filter(n=>FIRST[n]<i);
const li=a=>(a||[]).map(x=>`<li>${esc(x)}</li>`).join('');
// Chapter summary, generated once and kept. Only for chapters the reader has finished.
async function chapterSummary(c){
  const k=ckey(c);
  if(GUIDE&&GUIDE.chapters[c]&&GUIDE.chapters[c].sum)return{summary:GUIDE.chapters[c].sum,points:[]};
  if(store.sums[k])return store.sums[k];
  if(!AI())throw{code:'unavailable'};
  const r=await AI().json(`Summarise this chapter of ${META.title} by ${META.author} for a reader who has just finished it.
Return only JSON: {"summary": "4 to 6 plain sentences: what happens, who is involved and why it matters", "points": ["3 to 5 short key moments, in order"]}
Use only this chapter. Do not mention anything that happens later in the book.

Chapter (${BOOK[c].t}):
"""${chapterText(c)}"""`,{modelTier:'quick',cache:true});
  if(!r||typeof r.summary!=='string')throw{code:'bad_shape'};
  store.sums[k]={summary:r.summary,points:Array.isArray(r.points)?r.points.slice(0,5):[]};save(true);
  return store.sums[k];
}
function summaryHTML(sm){return`<div class="sumtext">${esc(sm.summary)}</div>${sm.points&&sm.points.length?`<div class="fb"><span>Key moments</span><ul>${li(sm.points)}</ul></div>`:''}`}

/* ---- before a chapter: where we are, questions to read for, words to know ---- */
function showBefore(c){
  const wantWords=PRE[c]&&PRE[c].length;
  const prev=c>0?(GUIDE&&GUIDE.chapters[c-1]?{summary:GUIDE.chapters[c-1].sum}:store.sums[ckey(c-1)]):null;
  const gpre=GUIDE&&GUIDE.chapters[c]?GUIDE.chapters[c].pre:'';
  const wantPreview=!gpre&&AI();
  const items=wantWords?PRE[c].map(({i,f})=>{const d=DICT[f];const s=sentenceAround(i,26);return {f,i,lemma:d[0],pos:d[1],def:d[2],ctx:s.text}}):[];
  const pv=store.previews[ckey(c)];
  cardShell(`Before ${esc(BOOK[c].t)}`,
    `${prev?`<section class="cs"><h5>Previously</h5><div class="sumtext">${esc(prev.summary.split(/(?<=[.!?])\s+/).slice(0,2).join(' '))}</div></section>`:''}
    ${gpre?`<section class="cs"><h5>What's coming</h5><div class="sumtext">${esc(gpre)}</div></section>`:''}
    ${wantPreview?`<section class="cs"><h5>Read with these in mind</h5><div id="pvBody">${pv?previewHTML2(pv):'<div class="skel sm"><i></i><i></i></div>'}</div></section>`:''}
    ${items.length?`<section class="cs"><h5>Words you'll meet</h5><div class="words">${items.map(x=>`<div class="wd"><div class="wh"><b>${esc(x.lemma)}</b> <i>${esc(x.pos)}</i></div><div class="wdef">${esc(x.def)}</div><div class="wctx">${markWord(x.ctx,x.f)}</div></div>`).join('')}</div></section>`:''}`,
    `${GUIDE?'<button class="btn" id="ptGuide">Chapter guide</button>':''}${items.length?'<button class="btn" id="ptSave">Save words</button>':''}<button class="btn pri" id="ptGo">Start reading</button>`);
  const pg=$('ptGuide');if(pg)pg.onclick=()=>{closeQuiz();openSheet('guide')};
  const sv=$('ptSave');if(sv)sv.onclick=()=>{items.forEach(x=>saveWord(x.f,x.i,true));sv.textContent='Saved';sv.disabled=true;updateBadge()};
  $('ptGo').onclick=continueReading;
  if(wantPreview&&!pv)chapterPreview(c).then(p=>{const b=$('pvBody');if(b)b.innerHTML=previewHTML2(p)}).catch(e=>{const b=$('pvBody');if(b)b.closest('.cs').remove()});
}
function previewHTML2(p){return`${p.setting?`<div class="sumtext">${esc(p.setting)}</div>`:''}<ul class="qs">${li(p.questions)}</ul>`}
async function chapterPreview(c){
  const k=ckey(c);if(store.previews[k])return store.previews[k];
  const names=metBefore(chStart[c]).join(', ')||'none yet';
  const r=await AI().json(`You prepare a reader to read the next chapter of ${META.title} by ${META.author} actively, without spoiling it.
Return only JSON: {"setting": "one sentence on where and when the chapter opens, based only on its first paragraph", "questions": ["2 or 3 short open questions to keep in mind while reading"]}
Strict rules: the questions must not reveal or hint at what happens, who appears, or how anything turns out. Ask about motives, feelings, choices or details to notice ("What does K. want from this visit?", "Notice how Elinor responds to praise"). Only mention these characters, whom the reader has already met: ${names}.

Chapter (${BOOK[c].t}):
"""${chapterText(c,9000)}"""`,{modelTier:'quick',cache:true});
  if(!r||!Array.isArray(r.questions))throw{code:'bad_shape'};
  store.previews[k]={setting:r.setting||'',questions:r.questions.slice(0,3)};save(true);
  return store.previews[k];
}

/* ---- after a chapter ---- */
function chapterCheckpoint(){
  if(set.checks==='off'||!quizOK||!AI())return;
  const st=set.checks;
  if(st==='question')return openQuiz('chapter');
  if(st==='summary')return showSummary();
  const c=chapterOf(idx),pv=store.previews[ckey(c)];
  cardShell(`End of ${esc(BOOK[c].t)}`,`<div class="qq">How would you like to wrap up this chapter?</div>
    <div class="ch">
      <button data-o="write"><span class="n">1</span><span><b>Summarise it yourself</b><br><span class="hintline">Best for remembering. Claude then shows what you caught and missed.</span></span></button>
      <button data-o="q"><span class="n">2</span><span><b>Answer one question</b><br><span class="hintline">Quick check, about a minute.</span></span></button>
    </div>${pv?`<div class="res">Before this chapter you were asked to keep in mind: <i>${esc(pv.questions[0])}</i></div>`:''}`,
    `<button class="btn" id="ckSkip">Skip</button>`);
  $('ckSkip').onclick=closeQuiz;
  quizEl.querySelector('.ch').onclick=e=>{const b=e.target.closest('[data-o]');if(!b)return;({write:showSummary,q:()=>openQuiz('chapter')})[b.dataset.o]()};
}
function showChapterRecap(c){
  const pv=store.previews[ckey(c)];
  cardShell(`${esc(BOOK[c].t)} · summary`,`<div id="crBody"><div class="skel sm"><i></i><i></i><i></i></div></div>${pv?`<section class="cs"><h5>Could you answer these now?</h5><ul class="qs">${li(pv.questions)}</ul></section>`:''}`,`<button class="btn pri" id="crGo">Continue</button>`);
  $('crGo').onclick=closeQuiz;
  chapterSummary(c).then(sm=>{const b=$('crBody');if(b)b.innerHTML=summaryHTML(sm)}).catch(e=>quizError(e,'Summary'));
}
function showSummary(){
  const c=chapterOf(idx),pv=store.previews[ckey(c)];
  cardShell(`Summarise ${esc(BOOK[c].t)}`,`<div class="qq">In two or three sentences, what happened in this chapter?</div>${pv?`<div class="res">It may help to answer the questions you read with: <i>${esc(pv.questions.join(' '))}</i></div>`:''}<textarea id="sumText" rows="5" placeholder="Who was involved, what happened, and why it matters…" aria-label="Your summary"></textarea><div class="res" id="sumRes"></div>`,
    `<button class="btn" id="sumSkip">Skip</button><button class="btn pri" id="sumGo">Get feedback</button>`);
  const ta=$('sumText');ta.focus();
  ta.addEventListener('focus',()=>setTimeout(()=>ta.scrollIntoView({block:'center',behavior:'smooth'}),350));
  $('sumSkip').onclick=closeQuiz;
  $('sumGo').onclick=async()=>{
    const text=ta.value.trim();if(text.split(/\s+/).length<6){$('sumRes').textContent='Write at least a sentence or two first.';return}
    $('sumGo').disabled=true;ta.disabled=true;$('sumRes').innerHTML='<div class="skel sm"><i></i><i></i></div>';
    const prompt=`You are a supportive reading tutor. A reader just finished this chapter of ${META.title} by ${META.author} and summarised it in their own words. Compare their summary with the chapter.
Return only JSON, no other text:
{"rating": "strong" | "partial" | "missed", "got": [up to 3 short strings: key points they captured], "missed": [up to 3 short strings: important points they left out or got wrong], "tip": "one short, encouraging sentence on how to read for this next time", "summary": "your own 4 to 6 sentence summary of the chapter", "points": ["3 to 5 short key moments, in order"]}
Base everything only on the chapter text. Do not mention later events.

Reader's summary:
"""${text}"""

Chapter:
"""${chapterText(c)}"""`;
    try{
      const r=await AI().json(prompt,{modelTier:'quick',cache:false});
      const score={strong:1,partial:.5,missed:0}[r.rating]??.5;
      store.answers.push(score);if(store.answers.length>100)store.answers.shift();
      if(sessOpen){sessOpen.qt++;sessOpen.qc+=score}
      if(typeof r.summary==='string'&&!store.sums[ckey(c)])store.sums[ckey(c)]={summary:r.summary,points:Array.isArray(r.points)?r.points.slice(0,5):[]};
      store.userSums=store.userSums||{};store.userSums[ckey(c)]=text;
      save(true);
      $('sumRes').innerHTML=`<b>${r.rating==='strong'?'Strong summary.':r.rating==='partial'?'Good start.':'Some key points are missing.'}</b>${r.got&&r.got.length?`<div class="fb"><span>You captured</span><ul>${li(r.got)}</ul></div>`:''}${r.missed&&r.missed.length?`<div class="fb"><span>Worth noticing</span><ul>${li(r.missed)}</ul></div>`:''}${r.tip?`<div>${esc(r.tip)}</div>`:''}`;
      $('cActs').innerHTML=`${store.sums[ckey(c)]?'<button class="btn" id="sumCmp">Compare with full summary</button>':''}<button class="btn pri" id="sumDone">Continue</button>`;
      $('sumDone').onclick=closeQuiz;const cm=$('sumCmp');if(cm)cm.onclick=()=>showChapterRecap(c);
    }catch(e){quizError(e,'Summary')}
  };
}

/* ---- character story so far (from what has been read only) ---- */
async function characterSoFar(name,label,box){
  const m=maxRead(),first=label.split(',')[0].replace(/^The /,'').trim();
  const keys=[...new Set([first,name.replace(/^The /,'').split(' ').pop()])].filter(x=>x.length>2);
  const re=new RegExp('\\b('+keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','i');
  const snippets=[];let total=0;
  for(let si=0;si<sentStart.length&&sentStart[si]<=m;si++){
    const a=sentStart[si],b=Math.min(m,(sentStart[si+1]??N)-1);const t=W.slice(a,b+1).join(' ');
    if(re.test(t)){snippets.push(t);total+=b-a+1;if(total>3500)break}
  }
  if(!snippets.length){box.textContent='Not much is known yet.';return}
  box.innerHTML='<div class="skel sm"><i></i><i></i></div>';
  try{await AI()(`From these passages of ${META.title} (all from the part the reader has already read), write what we know so far about ${label}: who they are, how they relate to others and what they have done. 3 or 4 plain sentences, no preamble, nothing beyond these passages.\n\n${snippets.join('\n')}`,{modelTier:'quick',cache:true,onText:({text})=>{box.textContent=text}})}
  catch(e){box.textContent='Could not write this right now.'}
}

/* ---- word popover ---- */
const pop=document.createElement('div');pop.className='pop';pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Word details');document.body.appendChild(pop);
let popIdx=-1;
function wordForm(i){return W[i].replace(/^[^\p{L}]+|[^\p{L}]+$/gu,'').toLowerCase()}
function openPop(i,el){
  popIdx=i;const f=wordForm(i),d=DICT[f]||(f.endsWith('s')?DICT[f.slice(0,-1)]:null);
  const saved=d&&store.words[d[0]];
  pop.innerHTML=`<div class="ph"><b>${esc(d?d[0]:f||W[i])}</b>${d?` <i>${esc(d[1])}</i>`:''}</div>
    <div class="pdef" id="popDef">${d?esc(d[2]):`<span class="st">No quick definition for this word.</span>`}</div>
    <div class="pacts">${AI()&&f?'<button class="btn" id="popCtx">Meaning here</button>':''}${d?`<button class="btn" id="popSave" ${saved?'disabled':''}>${saved?'Saved':'Save word'}</button>`:''}<button class="btn pri" id="popGo">Read from here</button></div>`;
  pop.classList.add('on');
  const r=el.getBoundingClientRect(),pw=Math.min(320,innerWidth-24);
  pop.style.width=pw+'px';
  const left=clamp(r.left+r.width/2-pw/2,12,innerWidth-pw-12);
  pop.style.left=left+'px';
  const h=pop.offsetHeight;
  pop.style.top=(r.bottom+h+12<innerHeight?r.bottom+8:Math.max(8,r.top-h-8))+'px';
  $('popGo').onclick=()=>{closePop();go(i)};
  const sv=$('popSave');if(sv)sv.onclick=()=>{saveWord(f,i);sv.textContent='Saved';sv.disabled=true;updateBadge()};
  const cx=$('popCtx');if(cx)cx.onclick=async()=>{
    cx.disabled=true;const box=$('popDef');const sent=sentenceAround(i,50).text;box.innerHTML='<span class="spinner"></span>';
    try{await AI()(`In this sentence from ${META.title} (${META.author}), what does "${W[i].replace(/[^\p{L}'’-]/gu,'')}" mean as used here? Answer in one or two plain sentences for a modern reader, no preamble.\n\nSentence: "${sent}"`,{modelTier:'quick',onText:({text})=>{box.textContent=text}})}
    catch(e){box.textContent=d?d[2]:'Could not look that up right now.'}
  };
}
function closePop(){pop.classList.remove('on');popIdx=-1}
document.addEventListener('pointerdown',e=>{if(pop.classList.contains('on')&&!pop.contains(e.target)&&!e.target.closest('span[data-i]'))closePop()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePop()});

/* ---- word bank & spaced review ---- */
const BOX=[0,1,3,7,16,35];
function saveWord(f,i,quiet){
  const d=DICT[f]||DICT[f.replace(/s$/,'')];if(!d)return;
  if(!store.words[d[0]])store.words[d[0]]={w:f,def:d[2],pos:d[1],ctx:sentenceAround(i,30).text,book:BOOKID,box:0,due:Date.now()+DAYMS,added:Date.now()};
  save();if(!quiet)toast(`Saved “${d[0]}” to your word bank.`,[],2500);
}
const dueWords=()=>Object.entries(store.words).filter(([,v])=>v.due<=Date.now());
function updateBadge(){$('menuBtn').classList.toggle('badge',dueWords().length>0)}
function renderWords(){
  const all=Object.entries(store.words).sort((a,b)=>b[1].added-a[1].added),due=dueWords();
  const box=$('wordsPanel');
  if(!all.length){box.innerHTML=`<p class="empty"><svg class="i"><use href="#i-book"/></svg>Words you save show up here for quick review over the following days, timed so they stick. Tap any word in the paused text or in Page view to look it up and save it. Each chapter also starts with a few words worth knowing.</p>`;return}
  box.innerHTML=`<div class="cards"><div class="card"><div class="v">${all.length}</div><div class="c">words saved</div></div><div class="card"><div class="v">${due.length}</div><div class="c">due for review</div></div></div>
  <div><button class="btn pri" id="revGo" style="width:100%" ${due.length?'':'disabled'}>${due.length?`Review ${Math.min(10,due.length)} words`:'Nothing due right now'}</button></div>
  <ul class="list">${all.map(([l,v])=>`<li><div><span style="flex:1"><div class="tt">${esc(l)} <span class="st" style="display:inline">${esc(v.pos)} · ${['new','learning','learning','familiar','strong','known'][v.box]||'known'}</span></div><div class="st">${esc(v.def)}</div></span><button class="btn x2" data-del="${esc(l)}" aria-label="Remove ${esc(l)}">×</button></div></li>`).join('')}</ul>`;
  const rg=$('revGo');if(rg)rg.onclick=()=>{closeSheet();startReview()};
  box.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{delete store.words[b.dataset.del];save();renderWords();updateBadge()});
}
function startReview(){
  if(playing)pause();
  const q=dueWords().sort(()=>Math.random()-.5).slice(0,10);let n=0,right=0;
  const pool=Object.values(DICT).filter(d=>!/[A-Z0-9]/.test(d[2])&&d[2].length<70);
  const next=()=>{
    if(n>=q.length){cardShell('Word review',`<div class="qq">${right} of ${q.length} right.</div><div class="res">Words you knew come back less often. Missed ones return tomorrow.</div>`,'<button class="btn pri" id="rvDone">Back to reading</button>');$('rvDone').onclick=closeQuiz;updateBadge();return}
    const [lemma,v]=q[n];
    const sameBook=v.book===BOOKID;
    const same=pool.filter(d=>d[1]===v.pos),src=same.length>20?same:pool;const opts=[v.def];let g=0;while(opts.length<4&&g++<200){const d=src[Math.floor(Math.random()*src.length)];if(d&&!opts.includes(d[2]))opts.push(d[2])}
    opts.sort(()=>Math.random()-.5);const ans=opts.indexOf(v.def);
    cardShell(`Word review · ${n+1} of ${q.length}`,`<div class="qq">What does <b>${esc(lemma)}</b> mean?</div><div class="wctx">${markWord(v.ctx,v.w)}</div><div class="ch">${opts.map((o,i)=>`<button data-c="${i}"><span class="n">${i+1}</span><span>${esc(o)}</span></button>`).join('')}</div>`,'');
    quizEl.querySelector('.ch').onclick=e=>{const b=e.target.closest('button[data-c]');if(!b)return;const ok=+b.dataset.c===ans;
      quizEl.querySelectorAll('.ch button').forEach((x,i)=>{x.disabled=true;if(i===ans)x.classList.add('right');else if(x===b)x.classList.add('wrong')});
      v.box=ok?Math.min(5,v.box+1):0;v.due=Date.now()+BOX[Math.max(1,v.box)]*DAYMS;if(ok)right++;save();
      $('cActs').innerHTML='<button class="btn pri" id="rvNext">Next</button>';$('rvNext').onclick=()=>{n++;next()};$('rvNext').focus()};
  };
  next();
}

/* ---- cast list & character map (spoiler-safe) ---- */
let castView='list',mapSel=null;
function metNames(){const m=maxRead();return Object.keys(FIRST).filter(n=>FIRST[n]<=m)}
function drawCast(focus){
  const m=maxRead();
  const sw=`<div class="seg cast-sw" id="castSw"><button data-v="list" aria-pressed="${castView==='list'}">List</button><button data-v="map" aria-pressed="${castView==='map'}">Map</button>${GUIDE&&GUIDE.tree?`<button data-v="tree" aria-pressed="${castView==='tree'}">Family</button>`:''}</div>`;
  const met=SPK.map((n,i)=>({n,i})).filter(x=>(FIRST[x.n]??Infinity)<=m);
  const later=SPK.length-met.length;
  let body='';
  if(castView==='list'){
    body=`<p class="note">Only characters you have met so far. Each speaker keeps one colour throughout, and a faded question mark means the speaker was guessed.</p>
    <ul class="list">${met.map(({n,i})=>`<li><div class="${i===focus?'on':''}" data-s="${i}"><span class="dot" style="--c:${colorOf(i)}" aria-hidden="true"></span><span><div class="tt">${esc(n)}</div><div class="st">${esc(CAST[n]||'Referred to this way in the text.')}</div>${personHTML(n)}</span></div></li>`).join('')}</ul>
    ${later?`<p class="note">${later} more ${later===1?'character appears':'characters appear'} later in the book.</p>`:''}`;
  } else if(castView==='tree'&&GUIDE&&GUIDE.tree)body=treeHTML(m);
  else body=mapHTML(m);
  const tb=$('castList').querySelector('.treebox'),sl=tb?tb.scrollLeft:null;
  $('castList').innerHTML=sw+body;
  const nb=$('castList').querySelector('.treebox');if(nb&&sl!=null)nb.scrollLeft=sl;
  $('castSw').onclick=e=>{const b=e.target.closest('button');if(!b)return;castView=b.dataset.v;drawCast(focus)};
  if(castView==='map'||castView==='tree')bindMap();
  if(focus!=null&&castView==='list'){const el=$('castList').querySelector(`[data-s="${focus}"]`);if(el)setTimeout(()=>el.scrollIntoView({block:'center'}),30)}
}
function mapHTML(m){
  const nodes=MAP.nodes.filter(n=>n.i<=m),ids=new Set(nodes.map(n=>n.id));
  const edges=MAP.edges.filter(e=>e.i<=m&&ids.has(e.a)&&ids.has(e.b));
  if(!nodes.length)return`<p class="empty" style="padding:0 14px">The map fills in as you meet characters.</p>`;
  const Wd=320,Ht=360,X=x=>44+x/100*(Wd-88),Y=y=>14+y/100*(Ht-38);
  const pos=Object.fromEntries(nodes.map(n=>[n.id,[X(n.x),Y(n.y)]]));
  const col=id=>{const s=SPK.indexOf(id);return s>=0?colorOf(s):'var(--mute)'};
  const sel=mapSel&&ids.has(mapSel)?mapSel:null;
  const lines=edges.map(e=>{const[a,b]=[pos[e.a],pos[e.b]];const on=sel&&(e.a===sel||e.b===sel);return`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${on?'var(--ink)':'var(--rule)'}" stroke-width="${on?1.6:1}"${sel&&!on?' opacity=".35"':''}/>`}).join('');
  const dots=nodes.map(n=>{const[x,y]=pos[n.id];const big=n.id===MAP.nodes[0].id;const dim=sel&&sel!==n.id&&!edges.some(e=>(e.a===sel&&e.b===n.id)||(e.b===sel&&e.a===n.id));
    return`<g class="mn" data-n="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.label)}"${dim?' opacity=".35"':''}><circle cx="${x}" cy="${y}" r="16" fill="transparent"/><circle cx="${x}" cy="${y}" r="${big?8:6}" fill="${col(n.id)}"${sel===n.id?' stroke="var(--ink)" stroke-width="2"':''}/><text x="${x}" y="${y+(big?20:17)}" text-anchor="middle" font-size="${big?13:11}" fill="var(--ink)">${esc(n.label)}</text></g>`}).join('');
  const hidden=MAP.nodes.length-nodes.length;
  let info='<p class="note">Tap a character to see how they are connected.</p>';
  if(sel){
    const n=MAP.nodes.find(x=>x.id===sel);
    const rel=edges.filter(e=>e.a===sel||e.b===sel).map(e=>{const o=e.a===sel?e.b:e.a;const on=MAP.nodes.find(x=>x.id===o);return`<li><b>${esc(on?on.label:o)}</b> · ${esc(e.label)}</li>`}).join('');
    info=`<div class="minfo"><div class="tt">${esc(n.label)}</div><div class="st">${esc(CAST[sel]||'')} First appears in ${esc(BOOK[chapterOf(FIRST[sel]??n.i)].t)}.</div>${rel?`<ul>${rel}</ul>`:''}${personHTML(sel)||(AI()?`<div class="sofar" id="soFar"><button class="btn tonal" id="soFarBtn" data-n="${esc(sel)}" data-l="${esc(n.label)}">What we know so far</button></div>`:'')}</div>`;
  }
  return`<div class="mapbox"><svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Character map">${lines}${dots}</svg></div>${info}${hidden?`<p class="note">${hidden} more ${hidden===1?'character joins':'characters join'} the map as you read. Nothing past your furthest point is shown.</p>`:''}`;
}
function bindMap(){
  const sf=$('soFarBtn');if(sf)sf.onclick=()=>characterSoFar(sf.dataset.n,sf.dataset.l,$('soFar'));
  $('castList').querySelectorAll('.mn').forEach(g=>{const f=()=>{mapSel=mapSel===g.dataset.n?null:g.dataset.n;drawCast()};g.onclick=f;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f()}}});
}

/* ================= your own PDFs =================
   PDFs are parsed in the browser with pdf.js, turned into chapters and paragraphs, and given the same
   annotations as the built-in books: phrase bonds for chunking, difficulty weights for timing, speakers for
   dialogue, chapter words and a growing guide. Everything is stored in this browser (IndexedDB). */
/* The word-frequency list and general dictionary are only needed for PDFs, so they are fetched then.
   gendict.json already includes the built-in books' dictionaries. */
let FREQ=null,GENDICT=null,lexiconLoad=null;
function loadLexicon(){
  return lexiconLoad||(lexiconLoad=(async()=>{
    const f=embedded('#freqdata'),g=embedded('#gendict');
    const [ft,gt]=await Promise.all([f?f.textContent:fetchText('data/freq.txt'),g?g.textContent:fetchText('data/gendict.json')]);
    FREQ=new Map();ft.split(';').forEach(b=>{const[z,ws]=b.split('|');ws.split(' ').forEach(w=>FREQ.set(w,+z))});
    GENDICT=JSON.parse(gt);
  })().catch(e=>{lexiconLoad=null;throw e}));
}
const zipfOf=w=>FREQ.get(w)??2.0;
function genDict(){return GENDICT||{}}
const idb={db:null,
  open(){return new Promise((res,rej)=>{if(this.db)return res(this.db);if(!window.indexedDB)return rej(new Error('no idb'));const r=indexedDB.open('fixate',1);r.onupgradeneeded=()=>r.result.createObjectStore('books',{keyPath:'id'});r.onsuccess=()=>{this.db=r.result;res(this.db)};r.onerror=()=>rej(r.error)})},
  async tx(mode,fn){const db=await this.open();return new Promise((res,rej)=>{const t=db.transaction('books',mode),st=t.objectStore('books');const r=fn(st);t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error)})},
  put(o){return this.tx('readwrite',st=>st.put(o))},
  all(){return this.tx('readonly',st=>st.getAll())},
  del(id){return this.tx('readwrite',st=>st.delete(id))}
};
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('load'));document.head.appendChild(s)})}
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
async function loadPdfJs(){
  if(window.pdfjsLib&&window.pdfjsWorker)return;
  await loadScript(PDFJS+'pdf.min.js');await loadScript(PDFJS+'pdf.worker.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+'pdf.worker.min.js';
}
/* ---- 1. text extraction with layout ---- */
async function extractPdf(buf,progress){
  await loadPdfJs();
  const pdf=await pdfjsLib.getDocument({data:buf,isEvalSupported:false}).promise;
  let meta={};try{meta=(await pdf.getMetadata()).info||{}}catch(e){}
  const pages=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p),tc=await page.getTextContent();
    const rows=new Map();
    for(const it of tc.items){
      if(!it.str)continue;
      const y=Math.round(it.transform[5]*2)/2,size=Math.hypot(it.transform[2],it.transform[3])||it.height||10;
      let key=null;for(const k of rows.keys())if(Math.abs(k-y)<size*.4){key=k;break}
      if(key==null){key=y;rows.set(key,[])}
      rows.get(key).push({x:it.transform[4],w:it.width,s:it.str,size});
    }
    const lines=[...rows.entries()].sort((a,b)=>b[0]-a[0]).map(([y,its])=>{
      its.sort((a,b)=>a.x-b.x);let t='',end=null,sz=0,n=0;
      for(const it of its){if(end!=null&&it.x-end>it.size*.18&&!t.endsWith(' ')&&!it.s.startsWith(' '))t+=' ';t+=it.s;end=it.x+it.w;sz+=it.size*it.s.length;n+=it.s.length}
      return{y,x:its[0].x,end,t:t.replace(/\s+/g,' ').trim(),size:n?sz/n:10};
    }).filter(l=>l.t);
    pages.push(lines);page.cleanup();
    if(p%5===0||p===pdf.numPages)progress(`Reading page ${p} of ${pdf.numPages}`,p/pdf.numPages*.6);
    await new Promise(r=>setTimeout(r,0));
  }
  return{pages,meta,numPages:pdf.numPages};
}
/* ---- 2. structure: headers, paragraphs, chapters ---- */
const NUMW='one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|the first|the second|the last';
const CHAP_RE=new RegExp('^(chapter|book|part|section|letter|canto|act)\\s+([0-9]+|[ivxlcdm]+|'+NUMW+')\\b[.:]?','i');
const ROMAN_RE=/^[IVXLC]+\.?$/;
function structure(pages){
  const norm=t=>t.toLowerCase().replace(/\d+/g,'#').replace(/\s+/g,' ').trim();
  const edge=new Map();
  pages.forEach(ls=>{const cand=[...ls.slice(0,2),...ls.slice(-2)];new Set(cand.map(l=>norm(l.t))).forEach(k=>edge.set(k,(edge.get(k)||0)+1))});
  const minRep=Math.max(3,pages.length*.25);
  const isJunk=(l,i,ls)=>{const k=norm(l.t);if((i<2||i>=ls.length-2)&&((edge.get(k)||0)>=minRep||/^[#ivxlc\s.\-–—]{1,8}$/i.test(k)))return true;return false};
  const all=[];pages.forEach((ls,pi)=>ls.forEach((l,i)=>{if(!isJunk(l,i,ls))all.push({...l,page:pi})}));
  if(!all.length)return[];
  const sizes=all.flatMap(l=>Array(Math.min(80,l.t.length)).fill(Math.round(l.size*2)/2)).sort((a,b)=>a-b);
  const body=sizes[Math.floor(sizes.length/2)]||10;
  const gaps=[];for(let i=1;i<all.length;i++)if(all[i].page===all[i-1].page){const g=all[i-1].y-all[i].y;if(g>0&&g<body*4)gaps.push(g)}
  gaps.sort((a,b)=>a-b);const lineGap=gaps[Math.floor(gaps.length/2)]||body*1.2;
  const lefts=all.map(l=>Math.round(l.x)).sort((a,b)=>a-b);const left=lefts[Math.floor(lefts.length*.2)]||0;
  const widths=all.map(l=>l.end-l.x).sort((a,b)=>a-b);const fullW=widths[Math.floor(widths.length*.8)]||400;
  const blocks=[];let cur=null,prev=null;
  for(const l of all){
    const heading=(l.size>=body*1.25&&l.t.length<90)||(CHAP_RE.test(l.t)&&l.t.length<80)||(ROMAN_RE.test(l.t)&&l.t.length<8);
    const newPara=!prev||heading||(prev.page===l.page&&prev.y-l.y>lineGap*1.45)||(l.x-left>body*.9&&l.x-left<body*6)||(prev&&/[.!?:”"’]$/.test(prev.t)&&prev.end-prev.x<fullW*.72)||(prev&&prev.heading);
    if(heading&&prev&&prev.heading&&prev.page===l.page&&Math.abs(prev.size-l.size)<.6&&!CHAP_RE.test(l.t)&&cur){cur.t+=' '+l.t}
    else if(newPara){cur={t:l.t,heading,size:l.size};blocks.push(cur)}
    else{cur.t=/[A-Za-z]-$/.test(cur.t)&&/^[a-z]/.test(l.t)?cur.t.slice(0,-1)+l.t:cur.t+' '+l.t}
    prev={...l,heading};
  }
  return blocks;
}
function toChapters(blocks,title){
  const clean=t=>t.replace(/\s+/g,' ').replace(/\s*--\s*/g,'— ').replace(/\s*—\s*/g,'— ').replace(/\s+([,.;:!?])/g,'$1').trim();
  const chs=[];let cur=null,pendingTitle=null;
  const start=(t)=>{cur={t,s:'',p:[]};chs.push(cur)};
  for(let i=0;i<blocks.length;i++){
    const b=blocks[i];const t=clean(b.t);if(!t)continue;
    if(b.heading){
      const strong=CHAP_RE.test(t)||ROMAN_RE.test(t);
      if(strong||!cur||cur.p.length>3){start(t.length>60?t.slice(0,57)+'…':t);if(blocks[i+1]&&blocks[i+1].heading&&!CHAP_RE.test(blocks[i+1].t)){cur.s=clean(blocks[i+1].t).slice(0,120);i++}}
      else if(cur&&!cur.s)cur.s=t.slice(0,120);
      continue;
    }
    if(!cur)start('Opening');
    cur.p.push(t);
  }
  let out=chs.filter(c=>c.p.join(' ').split(' ').length>=60);
  if(out.length&&out[0].t==='Opening'&&out[0].p.join(' ').split(' ').length<400&&out.length>1)out=out.slice(1);
  if(out.length<2){ // no usable chapter headings: split into sections of about 3,500 words
    const paras=out.flatMap(c=>c.p);out=[];let sec=null,n=0;
    for(const p of paras){if(!sec||n>3500){sec={t:`Section ${out.length+1}`,s:'',p:[]};out.push(sec);n=0}sec.p.push(p);n+=p.split(' ').length}
  }
  // tidy chapter labels like "CHAPTER I." -> "Chapter 1"
  const rom=s=>{const v={i:1,v:5,x:10,l:50,c:100,d:500,m:1000};let n=0;s=s.toLowerCase();for(let k=0;k<s.length;k++){const a=v[s[k]],b=v[s[k+1]]||0;n+=a<b?-a:a}return n};
  out.forEach((c,k)=>{const m=c.t.match(CHAP_RE);if(m){const num=/^[ivxlcdm]+$/i.test(m[2])?rom(m[2]):m[2];const rest=c.t.slice(m[0].length).replace(/^[\s.:—-]+/,'');c.t=m[1][0].toUpperCase()+m[1].slice(1).toLowerCase()+' '+num;if(rest&&!c.s)c.s=rest}
    else if(ROMAN_RE.test(c.t))c.t='Chapter '+rom(c.t.replace('.',''));
    if(c.s&&c.s===c.s.toUpperCase()&&/[A-Z]{3}/.test(c.s))c.s=c.s.toLowerCase().replace(/(^|[\s-])([a-z])/g,(m,a,b)=>a+b.toUpperCase()).replace(/\b(Of|In|The|And|A|An|To|On|At|For)\b/g,(m,w,o)=>o?w.toLowerCase():w);
    c.p=c.p.map(p=>p.split(' ').filter(Boolean).join(' ')).filter(Boolean)});
  return out;
}
/* ---- 3. annotations ---- */
const FW={det:new Set('a an the this that these those my your his her its our their some any no every each either neither'.split(' ')),
  prep:new Set('of in on at to for with by from into onto upon over under about after before between through during without within against among toward towards across behind beyond near off out up down around'.split(' ')),
  aux:new Set("is are was were be been being am have has had do does did will would shall should can could may might must not".split(' ')),
  conj:new Set('and or but nor so yet that which who whom whose when while if because although though as than'.split(' ')),
  pron:new Set('i you he she it we they'.split(' '))};
const NOTNAME=new Set('The A An He She It But And Then When I You We They This That There What Oh Yes No Well Now So If As At In On Why How Where Who His Her Their My Your Our Its Not Nor Or All One Some Here Perhaps Still Yet Even Only Just Ah Sir Madam'.split(' '));
const SV='said|says|asked|replied|answered|cried|exclaimed|shouted|whispered|added|continued|returned|observed|remarked|muttered|murmured|called|began|went on|repeated|insisted|declared|demanded|suggested|laughed|sighed|retorted|snapped|explained';
const NP="(?:(?:Mr|Mrs|Ms|Dr|St)\\.\\s|(?:Miss|Sir|Lady|Lord|Captain|Colonel|Aunt|Uncle|Professor|Father|Mother)\\s)?[A-Z][a-zA-Z’'\\-]+(?:\\s[A-Z][a-zA-Z’'\\-]+)?";
const A1=new RegExp(`^\\s*,?\\s*(?:${SV})\\s+(${NP}|the [a-z]+|he|she|I)\\b`),A2=new RegExp(`^\\s*,?\\s*(${NP}|[Hh]e|[Ss]he|I|[Tt]he [a-z]+)\\s+(?:\\w+\\s+)?(?:${SV})\\b`),B1=new RegExp(`(${NP}|[Hh]e|[Ss]he|I|[Tt]he [a-z]+)\\s+(?:\\w+\\s+)?(?:${SV})[^.!?“”"]*$`),B2=new RegExp(`(?:${SV})\\s+(${NP}|the [a-z]+|I)[^.!?“”"]*$`);
const validName=n=>{if(!n)return null;n=n.trim();if(n==='I')return'I';if(/^(he|she)$/i.test(n))return n.toLowerCase();const first=n.split(' ')[0];if(NOTNAME.has(first)&&!/^(Sir|Lady)$/.test(first))return null;if(/^the /i.test(n))return'The '+n.slice(4);return n};
function annotate(chs,progress){
  const counts=new Map(),pending=[];
  chs.forEach((c,ci)=>{
    c.r=[];
    c.p.forEach((p,pi)=>{
      const words=p.split(' ');const offs=[];let o=0;for(const w of words){offs.push(o);o+=w.length+1}
      const spans=[];let st=null,straight=false;
      for(let i=0;i<p.length;i++){const ch=p[i];if(ch==='“'){if(st==null){st=i;straight=false}}else if(ch==='”'){if(st!=null&&!straight){spans.push([st,i]);st=null}}else if(ch==='"'){if(st==null){st=i;straight=true}else if(straight){spans.push([st,i]);st=null}}}
      if(st!=null)spans.push([st,p.length-1]);
      const runs=[];
      spans.forEach(([a,b],k)=>{
        const nb=k?spans[k-1][1]+1:0,na=k+1<spans.length?spans[k+1][0]:p.length;
        const after=p.slice(b+1,na),before=p.slice(nb,a);
        let m=after.match(A1)||after.match(A2),who=m?validName(m[1]):null;
        if(!who){const bc=before.split(/[.!?](?=\s|$)/).pop();m=bc.match(B2)||bc.match(B1);who=m?validName(m[1]):null}
        const ws=offs.findLastIndex(x=>x<=a),we=offs.findLastIndex(x=>x<=Math.max(a,b-1));
        const lower=k>0&&/^[a-z]/.test(p.slice(a+1,a+3).trim());
        runs.push({ws,we,who,lower,pi,newPara:k===0&&before.trim().length<3,narr:p.slice(0,a).replace(/[“"][^”"]*[”"]/g,' '),q:p.slice(a+1,b)});
        if(who&&who!=='he'&&who!=='she'&&who!=='I')counts.set(who,(counts.get(who)||0)+1);
      });
      pending.push({ci,runs});
    });
  });
  // merge "Mr. Fogg" / "Fogg" etc. to the most frequent full form
  const names=[...counts.keys()].filter(n=>counts.get(n)>=2||n.split(' ').length>1);
  const canon=n=>{if(!n)return null;const last=n.split(' ').pop();let best=n,bc=counts.get(n)||0;for(const m of names)if(m!==n&&m.split(' ').pop()===last&&(counts.get(m)||0)>bc){best=m;bc=counts.get(m)}return best};
  const total=new Map();
  progress('Working out who is speaking',.75);
  let ci0=-1,recent=[];const known=names.slice().sort((a,b)=>(counts.get(b)||0)-(counts.get(a)||0)).slice(0,40);
  for(const {ci,runs} of pending){
    if(ci!==ci0){recent=[];ci0=ci}
    for(const r of runs){
      let name=null,g=1;
      const voc=new Set(known.filter(n=>new RegExp('(^|[,!?;—]\\s*|dear\\s+)'+n.split(' ').pop().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*[,!?.]').test(r.q)));
      const seq=[];for(let k=recent.length-1;k>=0&&seq.length<3;k--)if(!seq.includes(recent[k]))seq.push(recent[k]);
      const notVoc=x=>x&&![...voc].some(v=>v.split(' ').pop()===x.split(' ').pop());
      if(r.who==='I'){name='Narrator';g=0}
      else if(r.who&&r.who!=='he'&&r.who!=='she'){name=canon(r.who);g=0}
      else if(r.lower&&recent.length)name=recent[recent.length-1];
      else if(r.who==='he'||r.who==='she'){
        let ment=null;for(const n of known){const i=r.narr.lastIndexOf(n.split(' ').pop());if(i>=0&&(ment==null||i>ment[1]))ment=[n,i]}
        name=ment&&notVoc(ment[0])?canon(ment[0]):(seq.find(x=>x!=='Narrator'&&x!==seq[0]&&notVoc(x))||seq.find(x=>x!=='Narrator'&&notVoc(x))||null);
      }
      else{name=r.newPara?(seq.slice(1).find(notVoc)||null):(seq.find(notVoc)||null);
        if(!name&&voc.size)name=seq.find(notVoc)||null;
        if(!name&&seq.length)name=known.find(x=>x!==seq[0]&&notVoc(x))||null}
      r.name=name;r.g=g;if(name){recent.push(name);if(recent.length>12)recent.shift();total.set(name,(total.get(name)||0)+1)}
    }
  }
  const spk=[...total.entries()].sort((a,b)=>b[1]-a[1]).map(([n])=>n);
  for(const {ci,runs} of pending)for(const r of runs){const s=r.name?spk.indexOf(r.name):-1;(chs[ci].r[r.pi]=chs[ci].r[r.pi]||[]).push([r.ws,r.we,s,s<0?0:r.g])}
  chs.forEach(c=>{for(let pi=0;pi<c.p.length;pi++)c.r[pi]=c.r[pi]||[]});
  progress('Preparing timing and phrases',.85);
  const seen=new Set();
  const core=w=>w.replace(/[^\p{L}\p{N}'’-]/gu,'');
  const ABB=/^(Mr|Mrs|Ms|Dr|St)\.$/;
  chs.forEach(c=>{
    c.w=[];c.b=[];
    c.p.forEach((p,pi)=>{
      const words=p.split(' '),run=new Array(words.length).fill(-1);
      c.r[pi].forEach(([a,b],k)=>{for(let i=a;i<=b;i++)run[i]=k});
      let wq='',bq='',spill=0;
      words.forEach((w,i)=>{
        const cw=core(w),lw=cw.toLowerCase().replace(/[’']s$/,''),L=cw.length,z=zipfOf(lw);
        let v=1+Math.max(-.15,Math.min(.5,(L-5)*.045))+Math.max(-.15,Math.min(.45,(5-z)*.09));
        const fn=FW.det.has(lw)||FW.prep.has(lw)||FW.aux.has(lw)||FW.conj.has(lw)||FW.pron.has(lw);
        if(/^[A-Z]/.test(cw)&&i>0&&!/[.!?”"]$/.test(words[i-1])&&!seen.has(lw)&&z<4){v+=.35;seen.add(lw)}
        if(/\d/.test(cw))v+=.3;
        if(fn&&L<=4)v*=.55;
        v+=.25*spill;spill=Math.max(0,v-1.15);v=Math.max(.3,Math.min(2.45,v));
        wq+=String.fromCharCode(48+Math.round((v-.3)/.05));
        let bond=1;const nx=words[i+1];
        if(nx==null||(/[,;:.!?…—)"”’\]]$/.test(w)&&!ABB.test(w))||/^["“(—]/.test(nx)||run[i]!==run[i+1])bond=0;
        else if(FW.det.has(lw)||FW.prep.has(lw)||FW.aux.has(lw)||lw==='to')bond=3;
        else if(FW.conj.has(lw)||FW.pron.has(lw))bond=2;
        bq+=bond;
      });
      c.w.push(wq);c.b.push(bq);
    });
  });
  // a few harder words to know for each chapter
  const D=genDict(),taught=new Set();
  const pre=chs.map(c=>{
    const best=new Map();
    c.p.forEach((p,pi)=>p.split(' ').forEach((w,wi)=>{const f=core(w).toLowerCase();if(f.length<5||/^[A-Z]/.test(core(w)))return;const d=D[f];if(!d||taught.has(d[0]))return;const z=zipfOf(f);if(z>3.6)return;if(!best.has(d[0])||z<best.get(d[0])[3])best.set(d[0],[pi,wi,f,z])}));
    const pick=[...best.values()].sort((a,b)=>a[3]-b[3]).slice(0,4);pick.forEach(x=>taught.add(D[x[2]][0]));
    return pick.map(([pi,wi,f])=>[pi,wi,f]);
  });
  return{spk,pre};
}
/* ---- 4. the upload flow ---- */
const fileInput=document.createElement('input');fileInput.type='file';fileInput.accept='application/pdf,.pdf';fileInput.hidden=true;document.body.appendChild(fileInput);
function pickPdf(){fileInput.value='';fileInput.click()}
fileInput.onchange=()=>{const f=fileInput.files&&fileInput.files[0];if(f)importPdf(f)};
async function importPdf(file){
  if(playing)pause();if(sheet.open)closeSheet();
  if(file.size>60*1024*1024){toast('That PDF is over 60 MB. Try a smaller file.');return}
  const progress=(msg,f)=>{cardShell('Adding your PDF',`<div class="qq">${esc(file.name.replace(/\.pdf$/i,''))}</div><div class="res">${esc(msg)}</div><div class="bar"><i style="width:${Math.round(f*100)}%"></i></div>`,'')};
  progress('Opening the file',.02);
  try{
    const buf=await file.arrayBuffer();
    const {pages,meta}=await extractPdf(buf,progress);
    progress('Finding chapters and paragraphs',.65);await new Promise(r=>setTimeout(r,30));
    const blocks=structure(pages);
    const title=(meta.Title&&meta.Title.trim().length>2&&!/^untitled|^microsoft/i.test(meta.Title))?meta.Title.trim():file.name.replace(/\.pdf$/i,'').replace(/[_-]+/g,' ');
    const chs=toChapters(blocks,title);
    const words=chs.reduce((a,c)=>a+c.p.reduce((x,p)=>x+p.split(' ').length,0),0);
    if(words<200){cardShell('Adding your PDF','<div class="qq">No readable text found.</div><div class="res">This PDF looks like scanned images rather than text, so there is nothing to read. A PDF with selectable text will work.</div>','<button class="btn pri" id="upBack">Back</button>');$('upBack').onclick=closeQuiz;return}
    progress('Loading the dictionary',.7);await loadLexicon();
    const {spk,pre}=annotate(chs,progress);
    const id='u'+Date.now().toString(36);
    const data={chs,spk,scenes:[],cast:{},pre,map:{nodes:[],edges:[]},guide:{gen:true,chapters:[],scenes:[],people:{},places:{},context:[],relations:[]}};
    const rec={id,title,author:(meta.Author||'').trim()||'Your PDF',note:`${words.toLocaleString()} words`,words,added:Date.now(),data};
    try{await idb.put(rec)}catch(e){toast('This browser could not save the book, so it will be gone after you leave the page.',[],7000)}
    LIB.push({...rec,uploaded:true});
    const named=chs.reduce((a,c)=>a+c.r.flat().filter(r=>r[2]>=0&&!r[3]).length,0);
    cardShell('Ready to read',`<div class="qq">${esc(title)}</div>
      <div class="cards"><div class="card"><div class="v">${chs.length}</div><div class="c">${chs[0].t.startsWith('Section')?'sections':'chapters'}</div></div><div class="card"><div class="v">${words.toLocaleString()}</div><div class="c">words</div></div><div class="card"><div class="v">${spk.length}</div><div class="c">speakers found</div></div><div class="card"><div class="v">${Math.round(words/250)} min</div><div class="c">at 250 wpm</div></div></div>
      <div class="res">Chunking, timing, speaker cues, word help, the word bank, training and stats all work as with the built-in books.${AI()?' Claude will also refine speakers and build a guide for each chapter as you read it.':' Speaker detection is simpler than for the built-in books, and chapter guides need Claude.'}</div>`,
      `<button class="btn" id="upLater">Not now</button><button class="btn pri" id="upGo">Start reading</button>`);
    $('upLater').onclick=()=>{closeQuiz();drawChapters()};
    $('upGo').onclick=()=>{store.seen=true;closeQuiz();switchBook(id)};
  }catch(e){
    console.error(e);
    cardShell('Adding your PDF','<div class="qq">That PDF could not be opened.</div><div class="res">It may be damaged, password-protected, or need a newer reader. Try another file.</div>','<button class="btn pri" id="upBack">Back</button>');$('upBack').onclick=closeQuiz;
  }
}
async function removeBook(id){
  const b=LIB.find(x=>x.id===id);if(!b||!b.uploaded)return;
  if(!confirm(`Remove “${b.title}” from this device? Your place and saved notes for it will be lost.`))return;
  try{await idb.del(id)}catch(e){}
  LIB.splice(LIB.indexOf(b),1);delete cache[id];delete store.pos[id];delete store.place[id];delete store.max[id];delete store.shelf[id];
  if(BOOKID===id)switchBook(LIB[0].id);else drawChapters();
  save(true);
}
async function persistUpload(){
  const b=LIB.find(x=>x.id===BOOKID);if(!b||!b.uploaded)return;
  b.data.guide=GUIDE;b.data.map={nodes:MAP.nodes.map(n=>[n.id,n.label,n.x,n.y,null,n.i]),edges:MAP.edges.map(e=>[e.a,e.b,e.label,null,e.i])};
  try{await idb.put({id:b.id,title:b.title,author:b.author,note:b.note,words:b.words,added:b.added,data:b.data})}catch(e){}
}
const uploadsReady=(async()=>{
  try{const recs=await idb.all();recs.sort((a,b)=>a.added-b.added).forEach(r=>{if(!LIB.find(x=>x.id===r.id))LIB.push({...r,uploaded:true})})}catch(e){}
})();
/* ---- 5. chapter guides for uploaded books, written by Claude and kept ---- */
const guideBusy=new Set();
async function buildUploadGuide(c){
  if(!GUIDE||!GUIDE.gen||GUIDE.chapters[c]||!AI()||guideBusy.has(c))return;
  guideBusy.add(c);
  try{
    const known=Object.keys(GUIDE.people).join(', ')||'none yet';
    const r=await AI().json(`You are preparing a reading guide for one chapter of "${META.title}". Use only the chapter text below.
Return only JSON:
{"pre": "1 or 2 sentences orienting the reader before they start: where it opens, who is involved and what to watch for, without revealing outcomes",
 "sum": "a 3 to 5 sentence summary of what happens",
 "people": [{"name": "as the text names them", "look": "physical appearance if described, else empty", "about": "one sentence on their role in this chapter"}],
 "places": [{"name": "short place name", "desc": "one sentence describing it from the text"}],
 "context": [{"title": "short title", "text": "1 or 2 sentences of historical, cultural or background context a modern reader would need, only if genuinely useful"}],
 "relations": [{"a": "name", "b": "name", "label": "how they are connected, a few words"}]}
Keep lists short (at most 8 people, 4 places, 2 context notes, 8 relations). People already in the guide: ${known}; reuse those exact names when they appear.

Chapter (${BOOK[c].t}):
"""${chapterText(c,9000)}"""`,{modelTier:'quick',cache:true});
    if(!r||typeof r.sum!=='string')throw{code:'bad_shape'};
    GUIDE.chapters[c]={pre:r.pre||'',sum:r.sum};
    (r.people||[]).forEach(p=>{if(!p||!p.name)return;const e=GUIDE.people[p.name]||(GUIDE.people[p.name]={look:'',about:[]});if(!e.look&&p.look)e.look=p.look;if(p.about)e.about.push([c,p.about])});
    (r.places||[]).forEach(p=>{if(p&&p.name&&!GUIDE.places[p.name])GUIDE.places[p.name]={desc:p.desc||'',ctx:'',ch:c}});
    (r.context||[]).forEach(x=>{if(x&&x.title)GUIDE.context.push([c,x.title,x.text||''])});
    (r.relations||[]).forEach(x=>{if(x&&x.a&&x.b)addRelation(x.a,x.b,x.label||'',c)});
    await persistUpload();
    if(sheet.open&&curTab==='guide')renderGuide();
  }catch(e){if(e&&e.code==='not_granted')toast('Chapter guides need permission to use your Claude account.')}
  finally{guideBusy.delete(c)}
}
function addRelation(a,b,label,c){
  const at=chStart[c];
  for(const n of[a,b])if(!MAP.nodes.find(x=>x.id===n)){MAP.nodes.push({id:n,label:n,x:50,y:50,i:at});FIRST[n]=Math.min(FIRST[n]??Infinity,at)}
  MAP.edges.push({a,b,label,i:at});
  // simple radial layout: the most connected person in the middle
  const deg=new Map();MAP.edges.forEach(e=>{deg.set(e.a,(deg.get(e.a)||0)+1);deg.set(e.b,(deg.get(e.b)||0)+1)});
  const order=[...MAP.nodes].sort((x,y)=>(deg.get(y.id)||0)-(deg.get(x.id)||0));
  order.forEach((n,k)=>{if(k===0){n.x=50;n.y=46;return}const ring=k<=10?1:2,pos=ring===1?k-1:k-11,cnt=ring===1?Math.min(10,order.length-1):order.length-11;const ang=pos/Math.max(1,cnt)*Math.PI*2-Math.PI/2,rad=ring===1?34:46;n.x=50+Math.cos(ang)*rad;n.y=48+Math.sin(ang)*rad*.92});
  if(order[0]&&MAP.nodes[0]!==order[0]){MAP.nodes.splice(MAP.nodes.indexOf(order[0]),1);MAP.nodes.unshift(order[0])}
}

/* ================= bookshelf =================
   Every book sits on one of three shelves: Reading now, Want to read and Finished. Status follows your
   reading automatically (starting a book moves it to Reading, reaching the end moves it to Finished),
   and you can move books yourself. Spines are drawn from each book's title and length. */
const SPINE_COLORS=['#2F3A56','#6E2A2F','#2F5446','#7A5A22','#5A3460','#245E63','#6B4A34','#41474F','#8A3B2B','#33506E'];
const SPINE_FIXED={trial:'#2B303B',ss:'#6E2A35',w80:'#2F5A44',tl:'#1D4650'};
const SHELVES=[['reading','Reading now'],['want','Want to read'],['finished','Finished']];
function strHash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h}
function bookWords(b){return (cache[b.id]&&cache[b.id].N)||b.words||60000}
/* Cloth-bound look: every book gets a cloth colour, a foil colour and a repeating foil pattern, drawn
   here from scratch (no artwork is downloaded). The built-in books have a pattern drawn for their
   story; other books get one of the generic patterns, chosen from the title. */
const FOIL_FIXED={trial:'#D9C48E',ss:'#EBD6B4',w80:'#E4C96F',tl:'#CFDCC8'};
const FOILS=['#D9C48E','#EBD6B4','#CFDCC8','#E3BC8C'];
const MOTIF_FIXED={trial:'keys',ss:'leaves',w80:'clocks',tl:'waves'};
const MOTIFS=['lattice','scales','stars','dots'];
function tileSVG(kind,f){
  const open=(w,h)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  const st=`fill="none" stroke="${f}" stroke-linecap="round"`;
  const key=(x,y)=>`<circle cx="${x}" cy="${y-2}" r="3.1"/><path d="M${x-1.5} ${y}h3l1.4 6.6h-5.8z"/>`;
  switch(kind){
    case 'keys': // keyholes, for The Trial
      return open(24,32)+`<g fill="${f}">${key(12,12)}${key(0,28)}${key(0,-4)}${key(24,28)}${key(24,-4)}</g><g fill="${f}" opacity=".6"><circle cx="0" cy="6" r=".9"/><circle cx="24" cy="6" r=".9"/><circle cx="12" cy="26" r=".9"/></g></svg>`;
    case 'leaves': // paired sprigs and berries, for Sense and Sensibility
      return open(28,30)+`<g ${st} stroke-width="1.2"><path d="M14 26C7 20 7 10 14 4c7 6 7 16 0 22z"/><path d="M14 26V8" stroke-width=".8"/><path d="M14 17q-4-1-6-5M14 17q4-1 6-5" stroke-width=".8"/></g><g fill="${f}"><circle cx="0" cy="0" r="2"/><circle cx="28" cy="0" r="2"/><circle cx="0" cy="30" r="2"/><circle cx="28" cy="30" r="2"/><circle cx="14" cy="1" r="1"/></g></svg>`;
    case 'clocks': // dials showing different times, for Around the World in Eighty Days
      return open(30,30)+`<g ${st}><circle cx="15" cy="15" r="9.5" stroke-width="1.2"/><path d="M15 6.5v2M15 21.5v2M6.5 15h2M21.5 15h2M15 15V9.5M15 15l4.4 2.6" stroke-width="1.3"/></g><circle cx="15" cy="15" r="1.1" fill="${f}"/>${[[0,0],[30,0],[0,30],[30,30]].map(([x,y],k)=>`<g transform="translate(${x} ${y}) rotate(${k*70})" ${st} stroke-width=".9"><circle r="3.6"/><path d="M0 0v-2.5M0 0l1.8.8"/></g>`).join('')}</svg>`;
    case 'waves': // rolling waves with a small spiral shell, for Twenty Thousand Leagues under the Sea
      return open(28,24)+`<g ${st} stroke-width="1.2"><path d="M-2 8q5-6 10 0t10 0 10 0 10 0M-2 20q5-6 10 0t10 0 10 0 10 0" stroke-width="1"/></g><g ${st} stroke-width=".9"><path d="M14 14.6a1.4 1.4 0 1 1 1.6-1.4 2.6 2.6 0 1 1-3.2 2.6"/></g></svg>`;
    case 'lattice':
      return open(20,20)+`<path d="M10 0L20 10 10 20 0 10z" ${st} stroke-width="1"/><circle cx="10" cy="10" r="1.4" fill="${f}"/><circle cx="0" cy="0" r="1" fill="${f}"/><circle cx="20" cy="0" r="1" fill="${f}"/><circle cx="0" cy="20" r="1" fill="${f}"/><circle cx="20" cy="20" r="1" fill="${f}"/></svg>`;
    case 'scales':
      return open(20,12)+`<path d="M0 12A10 10 0 0 1 20 12M-10 6A10 10 0 0 1 10 6M10 6A10 10 0 0 1 30 6" ${st} stroke-width="1"/></svg>`;
    case 'stars':
      return open(22,22)+`<path d="M11 3l1.8 6.2L19 11l-6.2 1.8L11 19l-1.8-6.2L3 11l6.2-1.8z" fill="${f}"/><circle cx="0" cy="0" r="1.2" fill="${f}"/><circle cx="22" cy="0" r="1.2" fill="${f}"/><circle cx="0" cy="22" r="1.2" fill="${f}"/><circle cx="22" cy="22" r="1.2" fill="${f}"/></svg>`;
    default: // dots
      return open(16,16)+`<circle cx="8" cy="8" r="2.6" ${st} stroke-width="1"/><circle cx="0" cy="0" r="1" fill="${f}"/><circle cx="16" cy="0" r="1" fill="${f}"/><circle cx="0" cy="16" r="1" fill="${f}"/><circle cx="16" cy="16" r="1" fill="${f}"/></svg>`;
  }
}
const tileURL=(kind,f)=>`url('data:image/svg+xml,${encodeURIComponent(tileSVG(kind,f)).replace(/'/g,'%27').replace(/\(/g,'%28').replace(/\)/g,'%29')}')`;
function spineLook(b){
  const h=strHash(b.id+b.title),w=bookWords(b);
  const foil=FOIL_FIXED[b.id]||FOILS[(h>>>3)%FOILS.length],motif=MOTIF_FIXED[b.id]||MOTIFS[(h>>>7)%MOTIFS.length];
  return{color:SPINE_FIXED[b.id]||SPINE_COLORS[h%SPINE_COLORS.length],foil,tile:tileURL(motif,foil),height:214+(h>>>5)%34,width:Math.round(34+Math.min(22,Math.max(0,Math.log2(w/15000)*8)))};
}
const clothStyle=L=>`--sc:${L.color};--foil:${L.foil};--tile:${L.tile}`;
function shelfOf(id){const e=store.shelf[id];if(e&&e.status)return e.status;return (store.pos[id]|0)>0?'reading':'want'}
function setShelf(id,status){
  const e=store.shelf[id]||{};e.status=status;e.at=Date.now();
  if(status==='finished'&&!e.finishedAt)e.finishedAt=Date.now();
  if(status!=='finished')delete e.finishedAt;
  store.shelf[id]=e;save(true);
}
function pctOf(b){const p=store.pos[b.id]|0;if(shelfOf(b.id)==='finished')return 100;return Math.min(99,Math.round(p/Math.max(1,bookWords(b)-1)*100))}
function lastName(a){if(!a||a==='Your PDF')return'';const parts=a.replace(/\(.*?\)/g,'').trim().split(/\s+/);return parts[parts.length-1]}
function spineHTML(b,small){
  const L=spineLook(b),st=shelfOf(b.id),pct=pctOf(b);
  const s=small?.66:1;
  return`<button class="spine${b.id===BOOKID?' cur':''}" data-spine="${esc(b.id)}" style="${clothStyle(L)};height:${Math.round(L.height*s)}px;width:${Math.round(L.width*s)}px" aria-label="${esc(b.title)}${b.author?' by '+esc(b.author):''}, ${st==='finished'?'finished':pct?pct+'% read':'not started'}">
    <span class="band t"></span><span class="splate"><span class="stitle">${esc(b.title)}</span>${small||b.title.length>18?'':`<span class="sauth">${esc(lastName(b.author))}</span>`}</span><span class="band b"></span>
    ${st==='reading'&&pct>0?`<span class="ribbon" title="${pct}% read"></span>`:''}</button>`;
}
function shelfRow(books,small,empty){
  return`<div class="shelf${small?' small':''}"><div class="row" role="list">${books.length?books.map(b=>spineHTML(b,small)).join(''):`<div class="shelf-empty">${empty}</div>`}</div><div class="plank" aria-hidden="true"></div></div>`;
}
// compact shelf at the top of the Book tab
function drawLibrary(){
  const order=b=>({reading:0,want:1,finished:2})[shelfOf(b.id)];
  const books=[...LIB].sort((a,b)=>order(a)-order(b));
  $('library').innerHTML=`<div class="sub shelfhead"><span>Your bookshelf</span><button class="btn" id="openShelf">Open</button></div>${shelfRow(books,true,'')}
    <div class="catch"><button class="btn out" id="addPdf"><svg class="i"><use href="#i-plus"/></svg>Add your own PDF</button></div><div class="sub">Chapters · ${esc(META.title)}</div>`;
  $('addPdf').onclick=pickPdf;$('openShelf').onclick=()=>{closeSheet();openShelf()};
}
$('library').addEventListener('click',e=>{const b=e.target.closest('[data-spine]');if(b)openBookCard(b.dataset.spine)});
// full bookshelf view
const shelfEl=document.createElement('div');shelfEl.className='shelfview';shelfEl.setAttribute('role','dialog');shelfEl.setAttribute('aria-label','Your bookshelf');shelfEl.hidden=true;document.body.appendChild(shelfEl);
function openShelf(){
  if(playing)pause();
  const groups=Object.fromEntries(SHELVES.map(([k])=>[k,[]]));
  LIB.forEach(b=>groups[shelfOf(b.id)].push(b));
  groups.finished.sort((a,b)=>(store.shelf[b.id].finishedAt||0)-(store.shelf[a.id].finishedAt||0));
  const words=groups.finished.reduce((a,b)=>a+bookWords(b),0);
  shelfEl.innerHTML=`<div class="shelfwrap">
    <header class="shelftop"><button class="hbtn" id="shelfClose" aria-label="Close bookshelf"><svg class="i"><use href="#i-prev"/></svg></button><h2>Your bookshelf</h2><button class="hbtn" id="shelfAdd" aria-label="Add your own PDF" title="Add your own PDF"><svg class="i"><use href="#i-plus"/></svg></button></header>
    ${groups.finished.length?`<p class="shelfsum">${groups.finished.length} ${groups.finished.length===1?'book':'books'} finished · ${words.toLocaleString()} words read</p>`:''}
    ${SHELVES.map(([k,label])=>`<section class="shelfsec"><h3>${label} <span>${groups[k].length}</span></h3>${shelfRow(groups[k],false,{reading:'Books you start appear here.',want:'Books you want to read appear here.',finished:'Finish a book and it takes its place here.'}[k])}</section>`).join('')}
  </div>`;
  if(shelfEl.hidden)history.pushState({shelf:1},'');
  shelfEl.hidden=false;requestAnimationFrame(()=>shelfEl.classList.add('on'));
  $('shelfClose').onclick=()=>closeShelf();$('shelfAdd').onclick=()=>{closeShelf();pickPdf()};
  shelfEl.querySelectorAll('[data-spine]').forEach(b=>b.onclick=()=>openBookCard(b.dataset.spine));
  $('shelfClose').focus();
}
function closeShelf(fromHistory){
  if(shelfEl.hidden)return;
  if(!fromHistory&&history.state&&history.state.shelf)history.back();
  shelfEl.classList.remove('on');setTimeout(()=>{shelfEl.hidden=true},220);
}
addEventListener('popstate',()=>{if(!shelfEl.hidden){if(bookDlg.open)bookDlg.close();closeShelf(true)}});
shelfEl.addEventListener('keydown',e=>{if(e.key==='Escape'&&!bookDlg.open)closeShelf()});
// book card: cover, progress, shelf choice, actions
const bookDlg=document.createElement('dialog');bookDlg.className='bookdlg';bookDlg.setAttribute('aria-label','Book');document.body.appendChild(bookDlg);
bookDlg.addEventListener('click',e=>{if(e.target===bookDlg)bookDlg.close()});
function openBookCard(id){
  const b=LIB.find(x=>x.id===id);if(!b)return;
  const L=spineLook(b),st=shelfOf(id),pct=pctOf(b),e=store.shelf[id]||{};
  const ss=store.sessions.filter(s=>(s.book||'trial')===id&&s.w>50),ms=ss.reduce((a,s)=>a+s.ms,0),w=ss.reduce((a,s)=>a+s.w,0);
  const mins=Math.round(ms/60000);
  bookDlg.innerHTML=`<div class="bookcard">
    <div class="cover" style="${clothStyle(L)}"><div class="cvpat"></div><div class="cvplate"><div class="cvtitle${b.title.length>28?' long':''}">${esc(b.title)}</div><div class="cvrule"></div><div class="cvauthor">${esc(b.author||'')}</div></div><div class="cvmark"><svg class="i"><use href="#i-eye"/></svg></div></div>
    <div class="bcbody">
      <div class="tt">${esc(b.title)}</div><div class="st">${esc(b.author||'')}${b.note?' · '+esc(b.note):''}</div>${b.audio?'<div class="st">Read-along audiobook available</div>':''}
      <div class="bcprog"><div class="bar"><i style="width:${pct}%"></i></div><span>${st==='finished'?`Finished${e.finishedAt?' '+new Date(e.finishedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):''}`:pct?pct+'% read':'Not started'}</span></div>
      ${mins?`<div class="st">${mins<60?mins+' min':Math.floor(mins/60)+' h '+mins%60+' min'} reading${ms>60000?` · about ${Math.round(w/(ms/60000))} wpm`:''}</div>`:''}
      <div class="seg" id="bcShelf" role="group" aria-label="Shelf">${SHELVES.map(([k,label])=>`<button data-v="${k}" aria-pressed="${k===st}">${label.replace(' now','')}</button>`).join('')}</div>
      <div class="acts">${b.uploaded?`<button class="btn" id="bcRemove">Remove</button>`:''}<button class="btn" id="bcClose">Close</button><button class="btn pri" id="bcRead">${st==='finished'?'Read again':pct?'Continue reading':'Start reading'}</button></div>
    </div></div>`;
  if(!bookDlg.open)bookDlg.showModal();
  $('bcClose').onclick=()=>bookDlg.close();
  $('bcShelf').onclick=ev=>{const x=ev.target.closest('button');if(!x)return;setShelf(id,x.dataset.v);openBookCard(id);refreshShelves()};
  $('bcRead').onclick=()=>{
    if(st==='finished'){store.pos[id]=0;delete store.place[id];setShelf(id,'reading')}
    bookDlg.close();closeShelf();if(sheet.open)closeSheet();
    if(id!==BOOKID)switchBook(id);else if(st==='finished'){go(0)}
  };
  const rm=$('bcRemove');if(rm)rm.onclick=()=>{bookDlg.close();removeBook(id).then(refreshShelves)};
}
function refreshShelves(){if(!shelfEl.hidden)openShelf();if(sheet.open&&curTab==='chapters')drawChapters()}
// status follows reading
function onStartReading(){if(shelfOf(BOOKID)==='want')setShelf(BOOKID,'reading')}
function checkFinished(last){
  if(last<chapterEndOf(BOOK.length-1)-2||shelfOf(BOOKID)==='finished')return;
  setShelf(BOOKID,'finished');
  setTimeout(()=>toast(`You finished ${META.title}. It now sits on your Finished shelf.`,[{t:'See shelf',pri:true,f:()=>openShelf()}],9000),600);
}

/* ================= controls ================= */
function holdable(el,fn){
  let t1,t2;const stop=()=>{clearTimeout(t1);clearInterval(t2)};
  el.addEventListener('pointerdown',e=>{e.preventDefault();fn();t1=setTimeout(()=>t2=setInterval(fn,110),380)});
  ['pointerup','pointerleave','pointercancel'].forEach(ev=>el.addEventListener(ev,stop));
  el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();fn()}});
}
holdable($('stepBack'),()=>go(prevUnit(idx),false,true));
holdable($('stepFwd'),()=>go(nextUnit(idx)));
$('sentBack').onclick=()=>sentence(-1);
$('sentFwd').onclick=()=>sentence(1);
$('play').onclick=toggle;
$('slower').onclick=()=>setWpm(wpm-25);
$('faster').onclick=()=>setWpm(wpm+25);
speed.oninput=()=>setWpm(+speed.value);
scrub.oninput=()=>go(+scrub.value);
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{set.view=b.dataset.view;applySettings();save()});

let drag=null;
stage.addEventListener('pointerdown',e=>{if(e.target.closest('button,.who'))return;drag={x:e.clientX,i:idx,moved:false,last:0};stage.setPointerCapture(e.pointerId)});
stage.addEventListener('pointermove',e=>{
  if(!drag)return;const dx=e.clientX-drag.x;
  if(!drag.moved&&Math.abs(dx)>8){drag.moved=true;if(playing)pause()}
  if(drag.moved){
    const steps=Math.round(-dx/18);
    if(steps!==drag.last){let i=drag.i;for(let k=0;k<Math.abs(steps);k++)i=steps>0?nextUnit(i):prevUnit(i);drag.last=steps;idx=i;movedSincePause=true;chapterEnd=false;render();if(e.pointerType==='touch'&&navigator.vibrate)navigator.vibrate(3)}
  }
});
stage.addEventListener('pointerup',()=>{if(drag&&!drag.moved)toggle();else if(drag){if(drag.last<0)noteRewind();save();offerReturn()}drag=null});
stage.addEventListener('pointercancel',()=>drag=null);
stage.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();toggle()}});

/* ================= sheet ================= */
const sheet=$('sheet');
function closeSheet(){
  if(!sheet.open||sheet.classList.contains('closing'))return;
  sheet.classList.add('closing');sheet.style.transform='';
  const done=()=>{sheet.classList.remove('closing');sheet.close()};
  matchMedia('(prefers-reduced-motion: reduce)').matches?done():setTimeout(done,200);
}
sheet.addEventListener('cancel',e=>{e.preventDefault();closeSheet()});
{ // drag down to dismiss
  let y0=null,dy=0;
  const start=e=>{if(e.target.closest('button')&&e.currentTarget.id!=='grab')return;y0=e.clientY;dy=0;sheet.style.transition='none'};
  const move=e=>{if(y0==null)return;dy=Math.max(0,e.clientY-y0);if(dy>4)sheet.style.transform=`translateY(${dy}px)`};
  const end=()=>{if(y0==null)return;y0=null;sheet.style.transition='';if(dy>110)closeSheet();else sheet.style.transform=''};
  for(const el of[$('grab'),$('tabs')]){el.addEventListener('pointerdown',start);}
  addEventListener('pointermove',move);addEventListener('pointerup',end);addEventListener('pointercancel',end);
}
$('tabs').addEventListener('keydown',e=>{
  const tabs=[...sheet.querySelectorAll('[role=tab]')],i=tabs.indexOf(document.activeElement);
  if(i<0)return;let j=i;
  if(e.key==='ArrowRight')j=(i+1)%tabs.length;else if(e.key==='ArrowLeft')j=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')j=0;else if(e.key==='End')j=tabs.length-1;else return;
  e.preventDefault();tabs[j].focus();showTab(tabs[j].dataset.tab);
});
function drawChapters(){
  const cur=chapterOf(idx),placeCh=store.place[BOOKID]!=null?chapterOf(store.place[BOOKID]):-1;
  $('chapList').innerHTML=BOOK.map((c,i)=>{const done=chapterDone(i),sm=store.sums[ckey(i)];
    return`<li class="chrow${done?'':' unread'}"><button data-c="${i}" class="${i===cur?'on':''}"><span class="n">${i+1}</span><span style="flex:1"><div class="tt">${esc(c.t)}</div><div class="st">${esc(c.s)}${i===placeCh&&placeCh!==cur?' · your place':''}${i===cur&&!done?' · in progress':done?' · read':''}</div></span></button>${done&&(AI()||sm)?`<button class="btn chsum" data-sum="${i}" aria-expanded="false">${sm?'Summary':'Summarise'}</button>`:''}<div class="chbody" id="chb${i}" hidden></div></li>`}).join('');
  drawLibrary();
}
function bookProgress(id){
  const m=cache[id];const p=store.pos[id]|0;
  if(!m)return p?'In progress':'Not started';
  return p?Math.round(p/(m.N-1)*100)+'% read':'Not started';
}
function setHeader(){
  $('hTitle').textContent=META.title;
  $('bookBtn').setAttribute('aria-label',`${META.title} by ${META.author}. Open library and contents`);
  document.title='Fixate — '+META.title;
}
async function switchBook(id){
  if(id===BOOKID)return;
  if(playing)pause();
  store.pos[BOOKID]=idx;
  const lib=LIB.find(b=>b.id===id);
  if(lib&&!lib.data&&!lib.uploaded){
    const t=setTimeout(()=>toast(`Opening ${lib.title}…`,[],20000),250);
    try{await loadBook(id)}catch(e){clearTimeout(t);toast(`Could not open ${lib.title}. Check your connection and try again.`);return}
    clearTimeout(t);hideToast();
  }
  if(lib&&lib.uploaded&&!GENDICT)try{await loadLexicon()}catch(e){}
  if(id===BOOKID)return;
  useModel(buildModel(id));
  idx=clamp(store.pos[id]|0,0,N-1);
  if(store.place[id]==null&&idx>0)store.place[id]=idx;
  scrub.max=N-1;pgFrom=-1;pgTo=-1;lastWho=null;lastLetter=null;lastPlace=null;chapterEnd=false;lastQuizIdx=0;rewinds=[];
  sessOpen=null;
  stopAudio();audCh=-1;AUD=null;if(set.audio&&hasAudio())loadAudio(id);applyAudioUI();
  setHeader();drawChapters();syncChunks();layout();save(true);
  if(idx>0&&idx<N-1)toast(`Picking up in ${BOOK[chapterOf(idx)].t}, ${Math.round(idx/(N-1)*100)}% in.`,[],4000);
}
$('bookBtn').onclick=()=>openSheet('chapters');
function showWelcome(){
  app.classList.add('quizzing');
  quizEl.innerHTML=`<div class="hero"><div class="logo"><svg class="i"><use href="#i-eye"/></svg></div><div class="wm">Fixate</div></div>
  <div class="qq">Read faster, and understand more of what you read.</div>
  <div class="feat">
    <div><svg class="i"><use href="#i-eye"/></svg><span><b>One phrase at a time.</b> Keep your eyes still while the text comes to you. Tap the reader to start, drag it to go back.</span></div>
    <div><svg class="i"><use href="#i-chat"/></svg><span><b>Always know who is talking.</b> Each character's words take on their own colour.</span></div>
    <div><svg class="i"><use href="#i-spark"/></svg><span><b>Help when you need it.</b> A reading guide, word meanings, quick checks and progress tracking.</span></div>
  </div>
  <div class="k">Choose a book to start</div>
  <div class="ch">${LIB.map((b,k)=>`<button data-book="${b.id}"><span class="bk cl" style="${clothStyle(spineLook(b))}" aria-hidden="true"><span>${esc(b.title[0])}</span></span><span><span style="font-family:var(--serif);font-size:17px">${esc(b.title)}</span><br><span style="font:13px var(--ui);color:var(--mute)">${esc(b.author)}${b.note?' · '+esc(b.note):''}</span></span></button>`).join('')}</div>`;
  quizEl.insertAdjacentHTML('beforeend','<div class="acts" style="justify-content:center"><button class="btn out" id="wPdf"><svg class="i"><use href="#i-plus"/></svg>Or add your own PDF</button></div>');
  $('wPdf').onclick=()=>{store.seen=true;pickPdf()};
  quizEl.querySelector('.ch').onclick=e=>{const b=e.target.closest('button[data-book]');if(!b)return;store.seen=true;switchBook(b.dataset.book);save(true);closeQuiz()};
}
let curTab='chapters',castFocus=null;
function showTab(t){
  curTab=t;
  sheet.querySelectorAll('[role=tab]').forEach(b=>{const on=b.dataset.tab===t;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;if(on)b.scrollIntoView({block:'nearest',inline:'nearest'})});
  sheet.querySelectorAll('.panel').forEach(p=>p.hidden=p.dataset.panel!==t);
  if(t==='chapters')drawChapters();if(t==='guide')renderGuide();if(t==='stats')renderStats();if(t==='words')renderWords();if(t==='cast')drawCast(castFocus);if(t==='settings')renderSettings();
}
function openSheet(tab,focus){
  if(playing)pause();
  const c=chapterOf(idx);
  castFocus=focus??null;showTab(tab);
  if(!sheet.open)sheet.showModal();
}
sheet.querySelectorAll('[role=tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
$('closeSheet').onclick=()=>closeSheet();
$('guideBtn').onclick=()=>openSheet('guide');
$('menuBtn').onclick=()=>openSheet(curTab==='chapters'?'settings':curTab);
$('chapList').onclick=e=>{
  const sb=e.target.closest('[data-sum]');
  if(sb){const c=+sb.dataset.sum,box=$('chb'+c),open=box.hidden;box.hidden=!open;sb.setAttribute('aria-expanded',String(open));
    if(open&&!box.dataset.ok){box.innerHTML='<div class="skel sm"><i></i><i></i><i></i></div>';
      chapterSummary(c).then(sm=>{box.innerHTML=summaryHTML(sm)+(store.userSums&&store.userSums[ckey(c)]?`<div class="fb"><span>Your summary</span><div class="sumtext">${esc(store.userSums[ckey(c)])}</div></div>`:'');box.dataset.ok=1;sb.textContent='Summary'}).catch(()=>{box.textContent='A summary could not be written right now.'})}
    return}
  const b=e.target.closest('button[data-c]');if(b){go(chStart[+b.dataset.c]);closeSheet()}};
sheet.addEventListener('click',e=>{if(e.target===sheet)closeSheet()});

/* ---- declarative controls ---- */
function control(c){
  const v=set[c.k];
  if(c.type==='seg')return`<div class="row" ${c.show&&!c.show()?'hidden':''}><span class="lbl">${c.label}</span><div class="seg" data-k="${c.k}">${c.opts.map(([val,t])=>`<button data-v="${val}" aria-pressed="${String(v)===String(val)}">${t}</button>`).join('')}</div>${c.desc?`<div class="st">${c.desc}</div>`:''}</div>`;
  if(c.type==='toggle')return`<label class="sw" ${c.show&&!c.show()?'hidden':''}><span><span class="tt">${c.label}</span>${c.desc?`<div class="st">${c.desc}</div>`:''}</span><input type="checkbox" class="switch" role="switch" data-k="${c.k}" ${v?'checked':''} aria-label="${esc(c.label)}"></label>`;
  if(c.type==='range')return`<div class="row" ${c.show&&!c.show()?'hidden':''}><span class="lbl">${c.label}<output data-o="${c.k}">${c.fmt(v)}</output></span><input type="range" data-k="${c.k}" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" aria-label="${c.label}">${c.desc?`<div class="st">${c.desc}</div>`:''}</div>`;
  if(c.type==='html')return c.html();
  if(c.type==='grp')return`</div></section><section class="sec"><h4>${c.label}</h4><div class="secbody">`;
  return'';
}
function bindControls(root,specs,rerender){
  const byK=Object.fromEntries(specs.filter(s=>s.k).map(s=>[s.k,s]));
  root.querySelectorAll('.seg[data-k]').forEach(g=>g.onclick=e=>{const b=e.target.closest('button');if(!b)return;set[g.dataset.k]=b.dataset.v;changed(g.dataset.k);rerender()});
  root.querySelectorAll('input[type=checkbox][data-k]').forEach(i=>i.onchange=()=>{set[i.dataset.k]=i.checked;changed(i.dataset.k);rerender()});
  root.querySelectorAll('input[type=range][data-k]').forEach(i=>{
    i.oninput=()=>{fill(i);const k=i.dataset.k;set[k]=+i.value;const o=root.querySelector(`[data-o="${k}"]`);if(o)o.textContent=byK[k].fmt(+i.value);changed(k);if(byK[k].live)byK[k].live()};
  });
}
function changed(k){
  if(k==='audio')return setAudio(set.audio);
  applySettings();save();
}
const wFmt=v=>+v===0?'One word':`${v} characters`;
function previewHTML(){
  const C=targetWidth();
  const s=sentStart[sentIdx(idx)],e=Math.min(N-1,(sentStart[sentIdx(idx)+1]??N)-1,s+40);
  let h='',i=s;
  while(i<=e){const j=chunkEnd(i,C),t=W.slice(i,j+1).join(' '),p=phrasePivot(t);h+=`<span>${esc(t.slice(0,p))}<b class="pv">${esc(t[p])}</b>${esc(t.slice(p+1))}</span>`;i=j+1}
  return`<div class="row"><span class="lbl">Preview<output>${wFmt(C)}${set.widthMode==='auto'&&C>0?' at '+curWpm()+' wpm':''}</output></span><div class="preview" id="preview">${h}</div></div>`;
}
const SETTINGS=[
  {type:'grp',label:'Reading'},
  {k:'widthMode',type:'seg',label:'Chunk size',opts:[['auto','Auto'],['manual','Custom']],desc:'Auto widens chunks as you speed up, so faster reading means fewer, larger flashes instead of a strobe of single words.'},
  {k:'width',type:'range',label:'Chunk width',min:0,max:36,step:1,fmt:wFmt,show:()=>set.widthMode==='manual',live:()=>{const p=$('preview');if(p)p.parentElement.outerHTML=previewHTML()}},
  {type:'html',html:previewHTML},
  {k:'adapt',type:'seg',label:'Adaptive timing',opts:[['0','Off'],['0.6','Gentle'],['1','Full']],desc:'Gives hard passages more time and easy ones less, while the book as a whole runs at your set speed.'},
  {k:'audio',type:'toggle',label:'Read-along audio',desc:'Hear the audiobook while the words flash, in step with the narrator. The narration speeds up or slows down with your reading speed.',show:()=>hasAudio()},
  {k:'voices',type:'toggle',label:'Speaker cues',desc:'Each character\'s words take on their own colour, with a short pause when someone new starts talking.'},
  {k:'checks',type:'seg',label:'After each chapter',opts:[['off','Off'],['choose','Ask me'],['summary','Summary'],['question','Question']],desc:'Summarise the chapter in your own words or answer one question. Writing your own summary first builds the strongest memory.',show:()=>!!AI()},
  {type:'grp',label:'Look'},
  {k:'theme',type:'seg',label:'Theme',opts:[['system','Auto'],['light','Day'],['dark','Dusk'],['night','Night']],desc:'Night uses warm, dim colours with little blue light.'},
  {k:'size',type:'range',label:'Text size',min:0.8,max:1.4,step:0.05,fmt:v=>Math.round(v*100)+'%'},
  {type:'grp',label:'Claude'},
  {k:'claude',type:'toggle',label:'Claude features',desc:'Chapter checks, sharper speaker detection, word meanings in context and guides for your own PDFs. Uses your Claude account.',show:()=>!!sampleFn},
  {type:'html',html:()=>sampleFn?'':'<p class="st">Claude features are available when this page is opened in Claude.</p>'},
  {type:'html',html:advancedHTML}
];
const ADVANCED=[
  {k:'font',type:'seg',label:'Typeface',opts:[['serif','Literata'],['sans','Atkinson Hyperlegible']]},
  {k:'focus',type:'seg',label:'Focal letter',opts:[['red','Red'],['indigo','Indigo']]},
  {k:'focal',type:'seg',label:'Focal point',opts:[['classic','Classic'],['mid','Further in']]},
  {k:'pause',type:'seg',label:'Pauses at punctuation',opts:[['0.5','Short'],['1','Normal'],['1.6','Long']]},
  {k:'resume',type:'seg',label:'When you resume',opts:[['here','Continue here'],['sentence','Sentence start']]},
  {k:'chapStop',type:'toggle',label:'Pause at chapter ends'},
  {k:'before',type:'toggle',label:'Card before each chapter',desc:'A preview of the chapter and the harder words in it.'},
  {k:'recall',type:'toggle',label:'Recall questions',desc:'Questions you answered come back days later to help you remember.',show:()=>!!AI()},
  {k:'coach',type:'toggle',label:'Speed suggestions',desc:'Suggests a slower speed when you rewind often or miss questions, and a faster one after a long clean stretch.'},
  {k:'dim',type:'toggle',label:'Dim surrounding text in Page view'},
  {k:'aiSpeakers',type:'toggle',label:'Sharper speaker detection',desc:'Claude reads each chapter\'s dialogue once in the background and the result is saved.',show:()=>!!AI()},
  {type:'html',html:()=>`<div class="shortcuts"><kbd>Space</kbd> play or pause &nbsp; <kbd>←</kbd><kbd>→</kbd> step &nbsp; <kbd>Shift</kbd>+<kbd>←</kbd><kbd>→</kbd> sentence<br><kbd>↑</kbd><kbd>↓</kbd> speed &nbsp; <kbd>[</kbd><kbd>]</kbd> chapter &nbsp; <kbd>P</kbd> switch view &nbsp; <kbd>1</kbd>–<kbd>4</kbd> answer</div>`}
];
let advOpen=false;
function advancedHTML(){return`</div></section><details class="adv" id="adv"${advOpen?' open':''}><summary>Advanced</summary><div class="secbody">${ADVANCED.map(control).join('')}</div></details><section class="sec" hidden><div class="secbody">`}
function specsHTML(specs){return(`<section class="sec" hidden><div class="secbody">`+specs.map(control).join('')+'</div></section>').replace(/<section class="sec" hidden><div class="secbody"><\/div><\/section>/g,'')}
function renderSettings(){const r=$('setSet');const st=r.parentElement.scrollTop;r.innerHTML=specsHTML(SETTINGS);fillAll(r);bindControls(r,[...SETTINGS,...ADVANCED],renderSettings);
  const ad=$('adv');if(ad)ad.ontoggle=()=>{advOpen=ad.open};r.parentElement.scrollTop=st}

/* ---- stats ---- */
function renderStats(){
  const ss=store.sessions.filter(s=>s.w>50);
  const box=$('stats');
  if(!ss.length){box.innerHTML=`<p class="empty"><svg class="i"><use href="#i-chart"/></svg>Your progress shows up here after your first few minutes of reading: measured speed, comprehension, time read and streaks.</p>`;return}
  const tw=ss.reduce((a,s)=>a+s.w,0),tm=ss.reduce((a,s)=>a+s.ms,0);
  const days=new Set(ss.map(s=>DAY(s.end)));let streak=0;const d=new Date();
  if(!days.has(DAY(d)))d.setDate(d.getDate()-1);
  while(days.has(DAY(d))){streak++;d.setDate(d.getDate()-1)}
  const meas=s=>s.ms>0?s.w/(s.ms/60000):0;
  const ans=store.answers.slice(-10),comp=ans.length?ans.reduce((a,b)=>a+b,0)/ans.length:null;
  const recent=ss.slice(-5),first=ss.slice(0,Math.min(5,ss.length));
  const avg=a=>a.reduce((x,s)=>x+meas(s),0)/a.length;
  const nowW=avg(recent),gain=ss.length>=6?Math.round((nowW/avg(first)-1)*100):null;
  const rwRate=(recent.reduce((a,s)=>a+s.rw,0)/Math.max(1,recent.reduce((a,s)=>a+s.w,0)))*1000;
  const eff=comp!=null?Math.round(nowW*comp):null;
  const fmtMin=ms=>{const m=Math.round(ms/60000);return m<60?`${m} min`:`${Math.floor(m/60)} h ${m%60} min`};
  // chart
  const pts=ss.slice(-24),Wc=320,H=130,pad=24;
  const ys=pts.flatMap(s=>[meas(s),s.w?s.tw/s.w:0]);const lo=Math.max(0,Math.min(...ys)*0.85),hi=Math.max(...ys)*1.08||1;
  const X=i=>pad+(pts.length<2?(Wc-pad*2)/2:i*(Wc-pad*1.4)/(pts.length-1)),Y=v=>clamp(H-18-(v-lo)/(hi-lo)*(H-30),6,H-12);
  const line=f=>pts.map((s,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(f(s)).toFixed(1)}`).join('');
  const sesComp=s=>s.qt?s.qc/s.qt:null;
  const effPts=pts.map((s,i)=>sesComp(s)!=null?`<circle cx="${X(i).toFixed(1)}" cy="${Y(meas(s)*sesComp(s)).toFixed(1)}" r="3" fill="var(--pivot)"/>`:'').join('');
  const ticks=[lo,(lo+hi)/2,hi].map(v=>`<text x="0" y="${(Y(v)+4).toFixed(1)}" font-size="9" fill="var(--mute)">${Math.round(v)}</text>`).join('');
  box.innerHTML=`
  <div class="cards">
    <div class="card"><div class="v">${Math.round(nowW)}</div><div class="c">wpm measured, last 5 sessions${gain!=null?` · ${gain>=0?'+':''}${gain}% since you started`:''}</div></div>
    <div class="card"><div class="v">${comp!=null?Math.round(comp*100)+'%':'—'}</div><div class="c">${comp!=null?`comprehension, last ${ans.length} questions`:'comprehension · turn on chapter checks in Settings'}</div></div>
    <div class="card"><div class="v">${eff!=null?eff:'—'}</div><div class="c">effective wpm (speed × comprehension)</div></div>
    <div class="card"><div class="v">${rwRate.toFixed(1)}</div><div class="c">rewinds per 1,000 words, recent</div></div>
    <div class="card"><div class="v">${fmtMin(tm)}</div><div class="c">${tw.toLocaleString()} words read</div></div>
    <div class="card"><div class="v">${streak} ${streak===1?'day':'days'}</div><div class="c">reading streak</div></div>
  </div>
  <div class="chart"><svg viewBox="0 0 ${Wc} ${H}" role="img" aria-label="Speed by session">
    ${ticks}
    <path d="${line(s=>s.w?s.tw/s.w:0)}" fill="none" stroke="var(--mute)" stroke-width="1.2" stroke-dasharray="3 3"/>
    <path d="${line(meas)}" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-linejoin="round"/>
    ${effPts}
  </svg>
  <div class="legend"><span style="color:var(--ink)"><i></i>Measured speed</span><span style="color:var(--mute)"><i style="background:none;border-top:1.5px dashed"></i>Target speed</span><span style="color:var(--pivot)"><i style="width:6px;height:6px;border-radius:50%"></i>Effective speed</span></div></div>
  ${quizOK&&AI()?'<div><button class="btn out" id="quizNow">Quiz me on what I just read</button></div>':''}
  <p class="st">Measured speed includes pauses and rewinds, so it is usually below your target. Effective speed only appears for sessions with comprehension checks.</p>
  <div style="text-align:center"><button class="btn" id="resetStats">Reset progress</button></div>`;
  const qn=$('quizNow');if(qn)qn.onclick=()=>{closeSheet();openQuiz('manual')};
  $('resetStats').onclick=()=>{if(confirm('Clear all sessions and quiz results?')){store.sessions=[];store.answers=[];sessOpen=null;save(true);renderStats()}};
}

function fill(el){if(!el)return;const p=(el.value-el.min)/(el.max-el.min)*100;el.style.setProperty('--p',p+'%')}
function fillAll(r){r.querySelectorAll('input[type=range]').forEach(fill)}
/* ================= apply settings ================= */
function applySettings(){
  const root=document.documentElement;
  if(set.theme==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',set.theme);
  root.setAttribute('data-font',set.font);
  app.classList.toggle('pageview',set.view==='page');
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===set.view)));
  document.documentElement.style.setProperty('--focus',{red:'var(--focal)',indigo:'var(--pivot)',teal:'var(--s0)',off:'var(--word)'}[set.focus]||'var(--focal)');
  document.documentElement.toggleAttribute('data-nofocal',set.focus==='off');
  lastWho=null;syncChunks();normDirty=true;idx=unitStart(idx);
  requestAnimationFrame(()=>{const m=document.querySelector('meta[name=theme-color]');if(m)m.content=getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()});
  requestAnimationFrame(()=>layout());
}

/* ================= keyboard ================= */
document.addEventListener('keydown',e=>{
  if(sheet.open||bookDlg.open||!shelfEl.hidden||e.target.tagName==='INPUT')return;
  if(app.classList.contains('quizzing')){
    const n=parseInt(e.key,10);const b=quizEl.querySelector(`.ch button[data-c="${n-1}"]:not(:disabled)`);if(b){b.click();e.preventDefault()}
    return;
  }
  const k=e.key;
  if(k===' '){e.preventDefault();toggle()}
  else if(k==='ArrowLeft'){e.preventDefault();e.shiftKey||e.altKey?sentence(-1):go(prevUnit(idx),false,true)}
  else if(k==='ArrowRight'){e.preventDefault();e.shiftKey||e.altKey?sentence(1):go(nextUnit(idx))}
  else if(k==='ArrowUp'){e.preventDefault();setWpm(wpm+25)}
  else if(k==='ArrowDown'){e.preventDefault();setWpm(wpm-25)}
  else if(k==='[')chapter(-1);else if(k===']')chapter(1);
  else if(k==='p'||k==='P'){set.view=set.view==='page'?'flash':'page';applySettings();save()}
});
// with read-along audio, the book keeps playing in the background like an audiobook
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(playing&&!audioOn())pause();else save(true)}else if(playing){keepAwake(true);render()}});
// phones may discard a background tab without warning, so write progress out whenever the page goes away
addEventListener('pagehide',()=>save(true));

/* ================= phone & app integration ================= */
// keep the screen on while words are flashing
let wakeLock=null,wakeWanted=false;
async function keepAwake(on){
  wakeWanted=on;
  if(!('wakeLock' in navigator))return;
  try{
    if(on&&!wakeLock){
      const l=await navigator.wakeLock.request('screen');
      if(!wakeWanted){l.release();return}
      wakeLock=l;l.addEventListener('release',()=>{if(wakeLock===l)wakeLock=null});
    }else if(!on&&wakeLock){const l=wakeLock;wakeLock=null;await l.release()}
  }catch(e){}
}
// ask the browser not to clear progress, saved words and added PDFs when space runs low
if(navigator.storage&&navigator.storage.persist)navigator.storage.persisted().then(p=>{if(!p)navigator.storage.persist()}).catch(()=>{});
// offline support and installability
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){const reg=()=>navigator.serviceWorker.register('sw.js').catch(()=>{});document.readyState==='complete'?reg():addEventListener('load',reg)}
window.addEventListener('resize',()=>{pgLastTop=-1;layout()});

scrub.max=N-1;setHeader();drawChapters();updateBadge();
speed.value=wpm;fill(speed);$('wpmVal').textContent=wpm;
$('listenBtn').onclick=e=>{e.stopPropagation();toggleAudio()};
if(set.audio&&hasAudio())loadAudio(BOOKID).catch(()=>{});
applyAudioUI();
applySettings();
if(store.place[BOOKID]==null&&idx>0)store.place[BOOKID]=idx;
if(!store.seen)showWelcome();
else if(idx>0&&idx<N-1)setTimeout(()=>{if(!playing&&!app.classList.contains('quizzing'))toast(`Welcome back. Picking up in ${BOOK[chapterOf(idx)].t}, ${Math.round(idx/(N-1)*100)}% in.`,[],4500)},600);
uploadsReady.then(()=>{if(pendingBook&&pendingBook!==BOOKID&&LIB.find(b=>b.id===pendingBook))switchBook(pendingBook);if(sheet.open&&curTab==='chapters')drawChapters()});
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>layout());
})();
