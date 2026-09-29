(async () => {
"use strict";
const $ = id => document.getElementById(id);
const LS = "monyomi.v1";
async function loadDefaultQuestions() {
  const response = await fetch("data/questions.json");
  if (!response.ok) throw new Error(`問題データを読み込めませんでした (${response.status})`);
  const questions = await response.json();
  if (!Array.isArray(questions) || questions.length === 0) throw new Error("問題データが空です");
  return questions;
}
const SAMPLE = await loadDefaultQuestions();
const DEFAULT_SET = {rate:1.1,pitch:1,vol:1,mode:"hybrid",lead:true,turn:true,turnPause:320,post:1.03,fall:true,comma:false,paren:true,sound:true,voice:""};
const SAMPLE_VER = 4;
const sampleQs = () => SAMPLE.map((x,i)=>({
  id:x.id||"s2_"+i,
  q:x.question,
  a:x.answer,
  g:x.genre,
  d:x.difficulty||"",
  fix:{},
}));
/* 出題範囲：各モードで出す難易度 */
const LEVELS = {"":{name:"すべての難易度",ds:null}, C:{name:"Cモード",ds:["C"]}, B:{name:"Bモード",ds:["C","B"]}, A:{name:"Aモード",ds:["B","A"]}, S:{name:"Sモード",ds:["A","S"]}};
const normD = v => { const d=String(v||"").trim().toUpperCase(); return /^[CBAS]$/.test(d)?d:""; };
const inLevel = (q,lv=state.level) => { const L=LEVELS[lv]; return !L || !L.ds || L.ds.includes(q.d||""); };
let state = {questions:sampleQs(), idx:0, dict:{}, set:{...DEFAULT_SET}, results:{}, sampleVer:SAMPLE_VER, genre:"", level:"", order:null};
try{
  const raw = localStorage.getItem(LS);
  if(raw){ const s = JSON.parse(raw); if(s && Array.isArray(s.questions) && s.questions.length){
    const ver = s.sampleVer||1;
    state = {...state, ...s, set:{...DEFAULT_SET, ...(s.set||{})}};
    if(ver < 2){ const mine=s.questions.filter(q=>!/^s\d+$/.test(q.id)); state.questions = [...sampleQs(), ...mine.map(q=>({...q, g:q.g||"自作"}))]; state.idx=0; state.order=null; }
    else if(ver < SAMPLE_VER){ const have=new Set(state.questions.map(q=>q.id)); const add=sampleQs().filter(q=>!have.has(q.id)); state.questions=[...state.questions, ...add]; state.order=null; }
    if(ver < 4){ const sd=new Map(sampleQs().map(q=>[q.id,q.d])); state.questions.forEach(q=>{ if(!q.d && sd.has(q.id)) q.d=sd.get(q.id); }); }
    if(!(state.level in LEVELS)) state.level="";
    state.sampleVer=SAMPLE_VER;
  } }
}catch(e){}
function save(){ try{ localStorage.setItem(LS, JSON.stringify(state)); }catch(e){} }

/* ---------- text helpers ---------- */
const KANJI = /[㐀-鿿豈-﫿々〆ヵヶ]/;
const hira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0)-0x60));
const normalize = s => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/\r/g,"").replace(/\n+/g," ").trim();

/* ---------- numbers & counters ---------- */
const D = ["","いち","に","さん","よん","ご","ろく","なな","はち","きゅう"];
const DD = ["ぜろ","いち","に","さん","よん","ご","ろく","なな","はち","きゅう"];
function under(n){ // 1..9999 -> parts [{w,key}]
  const p=[]; const th=Math.floor(n/1000), hu=Math.floor(n/100)%10, te=Math.floor(n/10)%10, on=n%10;
  if(th) p.push({w: th===1?"せん":th===3?"さんぜん":th===8?"はっせん":D[th]+"せん", key:"1000"});
  if(hu) p.push({w: hu===1?"ひゃく":hu===3?"さんびゃく":hu===6?"ろっぴゃく":hu===8?"はっぴゃく":D[hu]+"ひゃく", key:"100"});
  if(te) p.push({w: te===1?"じゅう":D[te]+"じゅう", key:"10"});
  if(on) p.push({w: D[on], key:"d"+on});
  return p;
}
const soku = w => w.replace(/(ち|く|う)$/,"っ");
function numParts(n){
  if(n===0) return {head:"", last:"ぜろ", key:"0"};
  let head="", rem=n;
  for(const [u,v] of [["ちょう",1e12],["おく",1e8],["まん",1e4]]){
    const q=Math.floor(rem/v);
    if(q>0){
      rem = rem % v;
      let s = under(q).map(x=>x.w).join("");
      if(u==="ちょう") s = /(いち|はち|じゅう)$/.test(s) ? soku(s) : s;
      if(rem===0) return {head, last:s+u, key:"big"};
      head += s+u;
    }
  }
  const p = under(rem); const last = p.pop();
  return {head: head + p.map(x=>x.w).join(""), last:last.w, key:last.key};
}
const numReading = n => { const {head,last}=numParts(n); return head+last; };
function decReading(str){ const [i,f]=str.split("."); return numReading(parseInt(i,10)) + (f ? "てん"+[...f].map(d=>DD[+d]).join("") : ""); }

const CNT = {};
const add = (names, def) => names.split(" ").forEach(n => CNT[n]=def);
add("本",{t:"H",r:"ほん",p:"ぽん",b:"ぼん",three:"b"});
add("本目",{t:"H",r:"ほん",p:"ぽん",b:"ぼん",three:"b",suf:"め"});
add("匹",{t:"H",r:"ひき",p:"ぴき",b:"びき",three:"b"});
add("杯",{t:"H",r:"はい",p:"ぱい",b:"ばい",three:"b"});
add("票",{t:"H",r:"ひょう",p:"ぴょう",b:"びょう",three:"b"});
add("分",{t:"H",r:"ふん",p:"ぷん",b:"ぷん",three:"p",four:"p"});
add("分間",{t:"H",r:"ふん",p:"ぷん",b:"ぷん",three:"p",four:"p",suf:"かん"});
add("発",{t:"H",r:"はつ",p:"ぱつ",b:"ぱつ",three:"p"});
add("泊",{t:"H",r:"はく",p:"ぱく",b:"ぱく",three:"p",four:"p"});
add("編",{t:"H",r:"へん",p:"ぺん",b:"ぺん",three:"p"});
add("個",{t:"K",r:"こ"}); add("回",{t:"K",r:"かい"}); add("回目",{t:"K",r:"かい",suf:"め"}); add("曲",{t:"K",r:"きょく"}); add("件",{t:"K",r:"けん"});
add("階",{t:"K",r:"かい",three:"がい"}); add("軒",{t:"K",r:"けん",three:"げん"});
add("ヶ月 か月 カ月 ケ月 ヵ月 箇月",{t:"K",r:"かげつ"}); add("ヶ月間 か月間 カ月間",{t:"K",r:"かげつかん"});
add("か国 カ国 ヶ国 ケ国 ヵ国",{t:"K",r:"かこく"}); add("巻",{t:"K",r:"かん"}); add("景",{t:"K",r:"けい"}); add("鍵",{t:"K",r:"けん"}); add("種競技",{t:"S",r:"しゅきょうぎ"}); add("周年",{t:"S",r:"しゅうねん"}); add("塁打",{t:"S",r:"るいだ"}); add("投目",{t:"S",r:"とうめ"}); add("缶",{t:"K",r:"かん"}); add("画",{t:"K",r:"かく"});
add("冊",{t:"S",r:"さつ"}); add("才",{t:"S",r:"さい"}); add("世紀",{t:"S",r:"せいき"}); add("週",{t:"S",r:"しゅう"}); add("週間",{t:"S",r:"しゅうかん"});
add("周",{t:"S",r:"しゅう"}); add("章",{t:"S",r:"しょう"}); add("席",{t:"S",r:"せき"}); add("隻",{t:"S",r:"せき"}); add("種",{t:"S",r:"しゅ"}); add("種類",{t:"S",r:"しゅるい"});
add("足",{t:"S",r:"そく",three:"ぞく"}); add("首",{t:"S",r:"しゅ"});
add("頭",{t:"S",r:"とう"}); add("通",{t:"S",r:"つう"}); add("点",{t:"S",r:"てん"}); add("着",{t:"S",r:"ちゃく"}); add("等",{t:"S",r:"とう"}); add("丁目",{t:"S",r:"ちょうめ"}); add("棟",{t:"S",r:"とう"});
add("ページ",{t:"P",r:"ぺーじ"}); add("% ％ パーセント",{t:"P",r:"ぱーせんと"}); add("ポイント",{t:"P",r:"ぽいんと"});
{const NR={"番":"ばん","番目":"ばんめ","位":"い","枚":"まい","台":"だい","度":"ど","度目":"どめ","倍":"ばい","割":"わり","秒":"びょう","秒間":"びょうかん","名":"めい","代":"だい","条":"じょう","号":"ごう","部":"ぶ","行":"ぎょう","問":"もん","問目":"もんめ","音":"おん","路":"ろ","桁":"けた","文字":"もじ","マス":"ます","打":"だ","種":"しゅ","気圧":"きあつ","キロ":"きろ","メートル":"めーとる","センチ":"せんち","グラム":"ぐらむ","人前":"にんまえ","乗":"じょう"};
 for(const k in NR) add(k,{t:"N",r:NR[k]});}
add("人",{t:"X",x:"nin"}); add("人目",{t:"X",x:"nin",suf:"め"}); add("日",{t:"X",x:"day"}); add("日間",{t:"X",x:"day",suf:"かん"}); add("日目",{t:"X",x:"day",suf:"め"});
add("月",{t:"X",x:"gatsu"}); add("年",{t:"X",x:"nen"}); add("年間",{t:"X",x:"nen",suf:"かん"}); add("年目",{t:"X",x:"nen",suf:"め"}); add("年生",{t:"X",x:"nen",suf:"せい"});
add("時",{t:"X",x:"ji"}); add("時間",{t:"X",x:"ji",suf:"かん"}); add("円",{t:"X",x:"en"}); add("歳",{t:"X",x:"sai"}); add("つ",{t:"X",x:"tsu"});
const CNT_KEYS = Object.keys(CNT).sort((a,b)=>b.length-a.length);
const DAYS = {2:"ふつか",3:"みっか",4:"よっか",5:"いつか",6:"むいか",7:"なのか",8:"ようか",9:"ここのか",10:"とおか",14:"じゅうよっか",20:"はつか",24:"にじゅうよっか"};

function counterReading(n, name, prevWasMonth){
  const def = CNT[name]; if(!def) return null;
  const {head,last,key} = numParts(n);
  const suf = def.suf || "";
  const sk = (keys) => keys.includes(key);
  if(def.t==="H"){
    let body;
    if(sk(["d1","d6","d8","10","100"])) body = soku(last)+def.p;
    else if(key==="d3" || key==="1000") body = last + (def.three==="b"?def.b:def.p);
    else if(key==="d4") body = last + (def.four==="p"?def.p:def.r);
    else body = last + def.r;
    return head+body+suf;
  }
  if(def.t==="K"||def.t==="S"||def.t==="P"){
    const set = def.t==="S" ? ["d1","d8","10","100"] : ["d1","d6","d8","10","100"];
    if(sk(set)) return head+soku(last)+def.r+suf;
    if(key==="d3" && def.three) return head+last+def.three+suf;
    return head+last+def.r+suf;
  }
  if(def.t==="N") return numReading(n) + def.r;
  switch(def.x){
    case "nin":
      if(n===1 && !suf) return "ひとり"; if(n===2 && !suf) return "ふたり";
      if(key==="d4") return head+"よにん"+suf;
      return numReading(n)+"にん"+suf;
    case "day":
      if(n===1) return (prevWasMonth ? "ついたち" : "いちにち")+suf;
      if(DAYS[n]) return DAYS[n]+suf;
      if(key==="d7") return head+"しちにち"+suf;
      if(key==="d9") return head+"くにち"+suf;
      return numReading(n)+"にち"+suf;
    case "gatsu":
      if(key==="d4") return head+"しがつ"; if(key==="d7") return head+"しちがつ"; if(key==="d9") return head+"くがつ";
      return numReading(n)+"がつ";
    case "nen":
      if(key==="d4") return head+"よねん"+suf; if(key==="d7") return head+"しちねん"+suf;
      return numReading(n)+"ねん"+suf;
    case "ji":
      if(key==="d4") return head+"よじ"+suf; if(key==="d7") return head+"しちじ"+suf; if(key==="d9") return head+"くじ"+suf;
      return numReading(n)+"じ"+suf;
    case "en": if(key==="d4") return head+"よえん"; return numReading(n)+"えん";
    case "sai": if(n===20) return "はたち";
      if(sk(["d1","d8","10","100"])) return head+soku(last)+"さい"; return numReading(n)+"さい";
    case "tsu": { const T=["","ひとつ","ふたつ","みっつ","よっつ","いつつ","むっつ","ななつ","やっつ","ここのつ","とお"]; return T[n]||null; }
  }
  return null;
}
function nanCounter(name){
  const def=CNT[name]; if(!def) return null;
  if(def.t==="X"){ const m={nin:"なんにん",day:"なんにち",gatsu:"なんがつ",nen:"なんねん",ji:"なんじ",en:"なんえん",sai:"なんさい"}[def.x]; return m ? m+(def.suf||"") : null; }
  const r=counterReading(3,name,false); return r && r.startsWith("さん") ? "なん"+r.slice(2) : null;
}
function parseJaNum(s){
  const kd={"〇":0,"零":0,"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9};
  const sm={"十":10,"百":100,"千":1000}, bg={"万":1e4,"億":1e8,"兆":1e12};
  let total=0, sec=0, cur=null;
  for(const ch of s){
    if(/[0-9]/.test(ch)) cur=(cur||0)*10+(+ch);
    else if(ch in kd) cur=(cur||0)*10+kd[ch];
    else if(ch in sm){ sec += (cur===null?1:cur)*sm[ch]; cur=null; }
    else if(ch in bg){ sec += (cur||0); total += (sec||1)*bg[ch]; sec=0; cur=null; }
  }
  return total+sec+(cur||0);
}

/* ---------- words that need a human check ---------- */
const AMBIG = new Set(("今日 明日 昨日 一日 生物 人気 大家 上手 下手 最中 風車 見物 色紙 市場 工夫 分別 仮名 目下 利益 一時 心中 寒気 大事 開眼 追従 十分 足跡 金星 草原 "+
 "行う 行く 描く 間 後 方 上 下 中 一行 牧場 山陰 故郷 日向 一角 大分 家主 年月 自重 河岸 人事 床 注ぐ 表 空 辛い 抱く 被る 止める 開く 入る 臭い 他 空く 側 "+
 "下手 上手い 一目 一見 変化 造作 二分 三味線 素人 玄人 境内 相好 重複 早急 貼付 出生 大勢 名代 末期 最期 気質 生花 初日 今年 今朝 昨年 大人 頭 形 米 通る 汚れ 疾病 施行 遺言 礼拝 建立 発足 読経 殺生 神宮 経緯 御用 西方 東方 北方 南方 首都").split(" "));

/* ---------- tokenizer ---------- */
let TK = null;
function charClass(c){
  if(/[0-9]/.test(c)) return "num";
  if(KANJI.test(c)) return "kan";
  if(/[ぁ-ゖ]/.test(c)) return "hira";
  if(/[ァ-ヺー]/.test(c)) return "kata";
  if(/[A-Za-zＡ-Ｚａ-ｚ]/.test(c)) return "alpha";
  return "sym";
}
function fallbackTok(s){
  const out=[]; let i=0;
  while(i<s.length){
    const c=s[i], cls=charClass(c);
    if(cls==="num"){ let j=i; while(j<s.length && /[0-9]/.test(s[j])) j++; out.push({s:s.slice(i,j),r:null,pos1:"数"}); i=j;
      const k = CNT_KEYS.find(k=>s.startsWith(k,i)); if(k){ out.push({s:k,r:null,pos1:"接尾"}); i+=k.length; } continue; }
    let j=i+1; if(cls!=="sym") while(j<s.length && charClass(s[j])===cls) j++;
    const w=s.slice(i,j); out.push({s:w, r: cls==="hira"||cls==="kata" ? hira(w) : null, pos1: cls==="sym"?"記号":""}); i=j;
  }
  return out;
}
function tokenizeText(s){
  if(!s) return [];
  if(!TK) return fallbackTok(s);
  return TK.tokenize(s).map(t=>({s:t.surface_form, r: t.reading && t.reading!=="*" ? hira(t.reading) : (/^[ぁ-ゖァ-ヺー]+$/.test(t.surface_form)?hira(t.surface_form):null),
    pos:t.pos, pos1:t.pos_detail_1, base:t.basic_form, unk:t.word_type==="UNKNOWN"}));
}

/* ---------- analysis ---------- */
function parseRuby(text, paren){
  const re = paren
    ? /[｜|]([^｜|《》]+)《([^《》]+)》|([㐀-鿿々〆ヵヶ]+)《([^《》]+)》|([㐀-鿿々〆ヵヶ]+)[（(]([ぁ-ゖァ-ヺー・]+)[）)]/g
    : /[｜|]([^｜|《》]+)《([^《》]+)》|([㐀-鿿々〆ヵヶ]+)《([^《》]+)》/g;
  const out=[]; let last=0, m;
  while((m=re.exec(text))){
    if(m.index>last) out.push({t:"txt", s:text.slice(last,m.index)});
    const s=m[1]||m[3]||m[5], r=m[2]||m[4]||m[6];
    out.push({t:"fix", s, r:hira(r), src:"ruby"}); last=re.lastIndex;
  }
  if(last<text.length) out.push({t:"txt", s:text.slice(last)});
  return out;
}
function applyDict(pieces, map, src){
  const keys = Object.keys(map||{}).filter(Boolean).sort((a,b)=>b.length-a.length);
  if(!keys.length) return pieces;
  const out=[];
  for(const p of pieces){
    if(p.t!=="txt"){ out.push(p); continue; }
    let buf="", i=0; const s=p.s;
    while(i<s.length){
      const k = keys.find(k=>s.startsWith(k,i));
      if(k){ if(buf){out.push({t:"txt",s:buf}); buf="";} out.push({t:"fix",s:k,r:hira(map[k]),src}); i+=k.length; }
      else { buf+=s[i]; i++; }
    }
    if(buf) out.push({t:"txt",s:buf});
  }
  return out;
}
const isNumTok = t => t.src===undefined && /^[0-9〇一二三四五六七八九十百千万億兆]+$/.test(t.s) && (t.pos1==="数" || /^[0-9]+$/.test(t.s));

function analyze(text, qfix){
  const S = state.set;
  let pieces = parseRuby(normalize(text), S.paren);
  pieces = applyDict(pieces, qfix, "q");
  pieces = applyDict(pieces, state.dict, "dict");
  let raw = [];
  for(const p of pieces){
    if(p.t==="fix") raw.push({s:p.s, r:p.r, src:p.src});
    else raw.push(...tokenizeText(p.s));
  }
  // numbers + counters
  const toks=[];
  for(let i=0;i<raw.length;i++){
    const t=raw[i];
    if(isNumTok(t)){
      let j=i, str="";
      while(j<raw.length){
        const u=raw[j];
        if(isNumTok(u)){ str+=u.s; j++; continue; }
        if((u.s===","||u.s==="，") && /[0-9]$/.test(str) && raw[j+1] && /^[0-9]{3}/.test(raw[j+1].s)){ j++; continue; }
        if((u.s==="."||u.s==="．") && /^[0-9]+$/.test(str) && raw[j+1] && /^[0-9]+$/.test(raw[j+1].s)){ str+="."; j++; continue; }
        break;
      }
      const surf = raw.slice(i,j).map(x=>x.s).join("");
      const isArabic = /[0-9]/.test(str);
      // counter: one token, or several tokens that join into a known counter
      let cName=null, cEnd=j;
      for(let k=j; k<Math.min(raw.length,j+3); k++){
        const cand = raw.slice(j,k+1).map(x=>x.s).join("");
        if(CNT[cand] && raw[k].src===undefined) { cName=cand; cEnd=k+1; }
      }
      const prev = toks[toks.length-1];
      const prevMonth = !!(prev && prev.cnt==="月");
      const hasDec = str.includes(".");
      if(cName && !hasDec){
        const n = parseJaNum(str);
        const r = counterReading(n, cName, prevMonth);
        if(r && (isArabic || n<=100000)){ toks.push({s:surf+raw.slice(j,cEnd).map(x=>x.s).join(""), r, src:"num", cnt:cName}); i=cEnd-1; continue; }
      }
      if(isArabic || surf.length>1){
        const r = hasDec ? decReading(str) : numReading(parseJaNum(str));
        toks.push({s:surf, r, src:"num"}); i=j-1; continue;
      }
    }
    toks.push({...t, src: t.src||"auto"});
  }
  // rules and flags
  for(let i=0;i<toks.length;i++){
    const t=toks[i], nx=toks[i+1];
    if(t.src==="auto"){
      if(t.s==="何"){
        const nr = nx && nx.src==="auto" && CNT[nx.s] ? nanCounter(nx.s) : null;
        if(nr){ t.s+=nx.s; t.r=nr; t.src="rule"; toks.splice(i+1,1); continue; }
        if(nx && nx.s==="色"){ t.r="なに"; nx.r="いろ"; nx.src="rule"; }
        else if(nx && (/^(で|だ|と|の|ど|ね|な|日|年|月|時|回|人|本|度|番|曜|階|個|歳|枚|台|分|秒|点|倍|割|万|千|百|十|音|路|桁|鍵|か国|ヶ国|カ国|パーセント|グラム|キロ|メートル|角|乗|種類)/.test(nx.s) || CNT[nx.s] || nx.pos1==="接尾" || nx.pos1==="数")) t.r="なん";
        else t.r="なに";
        t.src="rule";
      }
      else if(/^日本/.test(t.s) && t.r && /^にっぽん/.test(t.r)){ t.r=t.r.replace(/^にっぽん/,"にほん"); t.src="rule"; }
      else if(KANJI.test(t.s)){
        if(AMBIG.has(t.s) || (t.base && AMBIG.has(t.base))) t.flag="読みが複数ある語";
        else if(t.pos1==="固有名詞") t.flag="固有名詞";
        else if(t.unk || !t.r) t.flag="辞書にない語";
      }
    }
  }
  // offsets
  let pos=0; for(const t of toks){ t.start=pos; pos+=t.s.length; t.end=pos; }
  return {toks, display: toks.map(t=>t.s).join("")};
}

/* ---------- spoken form & utterance plan ---------- */
function spoken(t, mode){
  if(t.src!=="auto" && t.r) return t.r;
  if(t.s==="・") return "、";
  if(!KANJI.test(t.s)) return t.s;
  if(!t.r) return t.s;
  if(mode==="kana" || (t.flag && t.flag!=="固有名詞")) return t.r;
  return t.s;
}
function moraOf(str){
  let m=0;
  for(const c of str){
    if(/[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]/.test(c)) continue;
    if(/[ぁ-ゖァ-ヺー]/.test(c)) m+=1;
    else if(KANJI.test(c)) m+=2;
    else if(/[A-Za-z]/.test(c)) m+=1.4;
    else if(/[0-9]/.test(c)) m+=2;
    else if(/[、，,]/.test(c)) m+=1.5;
  }
  return m;
}
function buildPlan(an){
  const S = state.set, toks = an.toks, utts=[];
  let cur=[], turnAt=-1;
  if(S.turn){
    for(let i=1;i<toks.length;i++){
      const t=toks[i], p=toks[i-1];
      if(t.s==="が" && (p.s==="です"||p.s==="でした") && (!t.pos1 || t.pos1==="接続助詞") && i<toks.length-2){ turnAt=i; break; }
      if(!TK && /(です|でした)が$/.test(t.s) && toks[i+1] && toks[i+1].s==="、"){ turnAt=i; break; }
    }
  }
  const push = (kind) => { if(!cur.length) return; utts.push({toks:cur, kind}); cur=[]; };
  for(let i=0;i<toks.length;i++){
    const t=toks[i]; cur.push(t);
    if(i===turnAt){ while(toks[i+1] && /^[、，,]$/.test(toks[i+1].s)){ cur.push(toks[++i]); } push("turn"); continue; }
    if(/^[。．！？!?]+$/.test(t.s)) { push("end"); continue; }
    if(S.comma && /^[、，,]$/.test(t.s)) { push("comma"); continue; }
  }
  push("end");
  let afterTurn=false;
  const plan = utts.map((u,ix)=>{
    let speak = u.toks.map(t=>spoken(t,S.mode)).join("");
    const isLast = ix===utts.length-1;
    if(S.fall && isLast) speak = speak.replace(/[？?]+$/,"。");
    const role = u.kind==="turn" ? "turn" : (turnAt<0 ? "plain" : (afterTurn ? "post" : "pre"));
    if(u.kind==="turn") afterTurn=true;
    let rate=S.rate, pitch=S.pitch, pause=0;
    if(role==="turn"){ rate*=0.97; pause=S.turnPause; }
    else if(role==="post"){ rate*=S.post; }
    if(u.kind==="comma") pause=140; else if(u.kind==="end" && !isLast) pause=260;
    let m=0; const marks=[]; // cumulative mora/speak length per token
    let sp=0;
    for(const t of u.toks){ const w=spoken(t,S.mode); const mm=moraOf(w); marks.push({t, m0:m, m1:m+mm, c0:sp, c1:sp+w.length}); m+=mm; sp+=w.length; }
    return {speak, role, rate:Math.min(2,rate), pitch:Math.min(2,pitch), pause, mora:Math.max(1,m), marks, start:u.toks[0].start, end:u.toks[u.toks.length-1].end};
  }).filter(u=>u.speak.replace(/[、。？！\s]/g,"").length);
  return plan;
}

/* ---------- voices ---------- */
let voices=[], voice=null;
const isNeural = v => /Natural|Neural|Online|Google|Premium|Enhanced|拡張|プレミアム|Siri/i.test(v.name);
function scoreVoice(v){
  const n=v.name; let s=0;
  if(/Natural|Neural/i.test(n)) s+=60; if(/Online/i.test(n)) s+=10; if(/Google/i.test(n)) s+=35;
  if(/Premium|プレミアム/i.test(n)) s+=45; if(/Enhanced|拡張|Siri/i.test(n)) s+=30;
  if(/Nanami/i.test(n)) s+=6; if(/Keita|Aoi|Daichi|Mayu|Naoki|Shiori/i.test(n)) s+=3;
  if(/Desktop|Haruka|Ayumi|Ichiro|Sayaka/i.test(n) && !/Natural/i.test(n)) s-=20;
  return s;
}
function voiceAdvice(v){
  if(!v) return "";
  if(/Natural|Neural/i.test(v.name)) return "ニューラル音声です。人の読み方に最も近い声です。";
  if(isNeural(v)) return "比較的自然な声です。さらに自然にしたいときは、Microsoft Edge で開くと「Nanami (Natural)」などのニューラル音声が選べます。";
  return "機械的に聞こえやすい旧型の音声です。Microsoft Edge で開くと「Nanami (Natural)」「Keita (Natural)」などのニューラル音声、Chrome では「Google 日本語」、Mac では「設定 › アクセシビリティ › 読み上げコンテンツ」から「Kyoko（拡張）」などを追加して使えます。";
}
function loadVoices(){
  if(!("speechSynthesis" in window)){ setChip("chipVoice","warn","このブラウザは音声合成に対応していません"); return; }
  voices = speechSynthesis.getVoices().filter(v=>/^ja/i.test(v.lang)).sort((a,b)=>scoreVoice(b)-scoreVoice(a));
  const sel=$("voiceSel"); sel.innerHTML="";
  if(!voices.length){
    sel.innerHTML='<option value="">日本語の音声が見つかりません</option>';
    setChip("chipVoice","warn","日本語の音声なし");
    $("voiceHint").textContent="Microsoft Edge の「Nanami (Natural)」、Chrome の「Google 日本語」、Mac の「Kyoko」などが使えます。OS の設定で日本語音声を追加してください。";
    return;
  }
  const groups=[["ニューラル音声（自然）",voices.filter(v=>/Natural|Neural/i.test(v.name))],["比較的自然な声",voices.filter(v=>!/Natural|Neural/i.test(v.name) && isNeural(v))],["標準の声",voices.filter(v=>!isNeural(v))]];
  for(const [label,list] of groups){ if(!list.length) continue; const g=document.createElement("optgroup"); g.label=label;
    for(const v of list){ const o=document.createElement("option"); o.value=v.voiceURI; o.textContent=v.name.replace(/^Microsoft /,"").replace(/ - Japanese \(Japan\)/,""); g.appendChild(o); } sel.appendChild(g); }
  voice = voices.find(v=>v.voiceURI===state.set.voice) || voices[0];
  sel.value = voice.voiceURI;
  updateVoiceUI();
}
function updateVoiceUI(){
  if(!voice) return;
  const good=isNeural(voice);
  setChip("chipVoice", good?"ok":"warn", voice.name.replace(/^Microsoft /,"").replace(/ - Japanese \(Japan\)/,"") + (good?"":"（旧型の声）"));
  $("voiceHint").textContent = voiceAdvice(voice);
  $("voiceWarn").hidden = good;
}
if("speechSynthesis" in window){ loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; setTimeout(loadVoices, 600); }
else loadVoices();

/* ---------- sounds ---------- */
let actx=null;
function beep(kind){
  if(!state.set.sound) return;
  try{
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    const tone=(f,t0,d,type="sine",g=0.18)=>{ const o=actx.createOscillator(), gn=actx.createGain(); o.type=type; o.frequency.value=f; o.connect(gn); gn.connect(actx.destination);
      const n=actx.currentTime+t0; gn.gain.setValueAtTime(0,n); gn.gain.linearRampToValueAtTime(g,n+0.01); gn.gain.exponentialRampToValueAtTime(0.001,n+d); o.start(n); o.stop(n+d+0.02); };
    if(kind==="buzz"){ tone(1318,0,0.12,"square",0.08); tone(1760,0.1,0.22,"square",0.08); }
    if(kind==="right"){ tone(1047,0,0.25); tone(1319,0.18,0.45); }
    if(kind==="wrong"){ tone(155,0,0.55,"sawtooth",0.12); tone(160,0,0.55,"square",0.06); }
    if(kind==="timeup"){ tone(880,0,0.12,"square",0.07); tone(880,0.2,0.12,"square",0.07); tone(880,0.4,0.3,"square",0.07); }
    if(kind==="win"){ [784,988,1175,1568].forEach((f,i)=>tone(f,i*0.11,0.35,"triangle",0.16)); }
    if(kind==="tick"){ tone(1200,0,0.05,"sine",0.06); }
  }catch(e){}
}

/* ================= game app ================= */
const COLORS = ["#E4572E","#2E86AB","#E0A21B","#2FA360","#7C62C4","#DB4B8E","#159A8C","#8C6D1F","#4F74C9","#C8374A","#5E8C3A","#A0522D","#6B7A8F","#B4499B","#2A9D8F","#D4782F"];
const HOST_CODES = new Set(["Space","Enter","NumpadEnter","KeyO","KeyX","KeyT","KeyR","KeyU","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Escape","Tab","Backspace"]);
const KEY_POOL = ["KeyA","KeyF","KeyJ","Semicolon","KeyS","KeyD","KeyK","KeyL","KeyG","KeyH","KeyC","KeyV","KeyB","KeyM","KeyZ","KeyN","Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","Digit9"];
const PRESETS = {
  "7o3x":{mode:"ox",win:7,lose:3,cp:1,wp:0,rest:0},
  "5o2x":{mode:"ox",win:5,lose:2,cp:1,wp:0,rest:0},
  "10o10x":{mode:"ox",win:10,lose:10,cp:1,wp:0,rest:0},
  "pts10":{mode:"pts",win:10,lose:0,cp:1,wp:-1,rest:0},
  "free":{mode:"pts",win:0,lose:0,cp:1,wp:0,rest:0}
};
const SOLO = {id:"solo", name:"あなた", color:-1, status:"", o:0, x:0, pts:0};

function keyLabel(code){
  if(!code) return "未設定";
  if(/^Key[A-Z]$/.test(code)) return code.slice(3);
  if(/^Digit\d$/.test(code)) return code.slice(5);
  if(/^Numpad\d$/.test(code)) return "テンキー"+code.slice(6);
  return ({Semicolon:";",Quote:"'",Comma:",",Period:".",Slash:"/",BracketLeft:"[",BracketRight:"]",Backslash:"\\",Minus:"-",Equal:"^",IntlRo:"\\",IntlYen:"¥",ShiftLeft:"左Shift",ShiftRight:"右Shift",ControlLeft:"左Ctrl",ControlRight:"右Ctrl",AltLeft:"左Alt",AltRight:"右Alt",CapsLock:"CapsLock"})[code] || code;
}
const G = () => state.game;
const R = () => state.game.rule;
const players = () => state.game.players;
function freeKey(){ const used=new Set(players().map(p=>p.key)); return KEY_POOL.find(k=>!used.has(k)) || null; }
function freeColor(){ const used=players().map(p=>p.color); for(let i=0;i<COLORS.length;i++) if(!used.includes(i)) return i; return players().length % COLORS.length; }
function mkPlayer(name, opts={}){
  return {id:"p"+Math.random().toString(36).slice(2,9), name, color: opts.color ?? freeColor(), key: opts.remote ? null : (opts.key ?? freeKey()), remote: !!opts.remote, online: true,
    o:0, x:0, pts:0, status:"", rank:0, rest:0, sit:false};
}
function defaultGame(){
  const g = {players:[], rule:{preset:"7o3x", ...PRESETS["7o3x"], ans:5, think:5, resume:true, autoWrong:false}, log:[], rankNext:1, qcount:0};
  state.game = g;
  for(let i=0;i<4;i++) g.players.push(mkPlayer(`プレイヤー${i+1}`));
  return g;
}
if(!state.game || !Array.isArray(state.game.players)) defaultGame();
state.played = state.played || {};
state.ui = {view:"game", tapBuzz:false, skipDone:true, dispAll:false, ...(state.ui||{})};
players().forEach(p=>{ if(p.remote) p.online=false; });

const getP = id => id==="solo" ? SOLO : players().find(p=>p.id===id);
const colorOf = p => (!p || p.color<0) ? "var(--accent)" : COLORS[p.color % COLORS.length];
const softOf = p => (!p || p.color<0) ? "var(--accent-soft)" : `color-mix(in srgb, ${COLORS[p.color % COLORS.length]} 18%, var(--panel))`;

/* ---------- per-question state ---------- */
let an=null, plan=[], ph="idle", runId=0, reveal=0, curU=null, msPerMora=138, raf=0, selTok=-1;
let qs = null;
function newQS(){ return {ep:(qs?qs.ep:0)+1, open:false, first:null, order:[], lock:new Set(), marks:[], buzzAt:-1, events:[], started:false}; }
qs = newQS();
let banner = null, tmr = null, undoStack = [], listening = null;
const Q = () => state.questions[state.idx];
const soloMode = () => players().length===0;
function eligible(p){ if(!p) return false; if(p.id==="solo") return !qs.lock.has("solo"); return p.status==="" && !p.sit && !qs.lock.has(p.id) && !(p.remote && p.online===false); }

/* ---------- speech ---------- */
function speakSeq(items, onDone){
  const id=++runId; let k=0;
  try{ speechSynthesis.cancel(); }catch(e){}
  if(state.set.lead && items.lead){ items=[{speak:"問題", rate:state.set.rate, pitch:state.set.pitch, pause:520, mora:3}, ...items]; }
  const next = () => {
    if(id!==runId) return;
    if(k>=items.length){ curU=null; onDone && onDone(); return; }
    const u=items[k++];
    const ut=new SpeechSynthesisUtterance(u.speak);
    ut.lang="ja-JP"; if(voice) ut.voice=voice; ut.rate=u.rate; ut.pitch=u.pitch; ut.volume=state.set.vol;
    const rec={u, ix:k-1, t0:0, bChar:-1};
    ut.onstart=()=>{ if(id!==runId) return; rec.t0=performance.now(); curU=rec; };
    ut.onboundary=e=>{ if(id===runId && typeof e.charIndex==="number") rec.bChar=e.charIndex; };
    let finished=false;
    const fin=(err)=>{
      if(finished || id!==runId) return; finished=true;
      if(!err && rec.t0 && u.mora>=4){ const per=(performance.now()-rec.t0)*u.rate/u.mora; if(per>40 && per<400) msPerMora = msPerMora*0.6 + per*0.4; }
      if(u.end!=null) reveal=Math.max(reveal,u.end);
      curU=null;
      setTimeout(next, u.pause||0);
    };
    ut.onend=()=>fin(false);
    ut.onerror=e=>{ if(e.error==="interrupted"||e.error==="canceled") return; fin(true); };
    window.__ut=ut;
    speechSynthesis.speak(ut);
  };
  next();
}
function posFromUtt(rec){
  const u=rec.u; if(!u.marks) return reveal;
  let pos=u.start;
  if(rec.bChar>=0){ const mk=u.marks.find(m=>rec.bChar>=m.c0 && rec.bChar<m.c1) || u.marks[u.marks.length-1]; pos=Math.max(pos, mk.t.end); }
  if(rec.t0){
    const el=performance.now()-rec.t0, est=u.mora*msPerMora/u.rate;
    const target=Math.min(0.985, el/est)*u.mora;
    const mk=u.marks.find(m=>target<m.m1) || u.marks[u.marks.length-1];
    const frac = mk.m1>mk.m0 ? Math.min(1,(target-mk.m0)/(mk.m1-mk.m0)) : 1;
    const tp = mk.t.start + Math.round(frac*(mk.t.end-mk.t.start));
    pos = rec.bChar>=0 ? Math.max(pos, Math.min(tp, pos + 6)) : Math.max(pos, tp);
  }
  return Math.min(pos, u.end);
}
function loop(){
  if(ph==="reading"){
    if(curU && curU.u.marks) reveal=Math.max(reveal, posFromUtt(curU));
    renderText();
    raf=requestAnimationFrame(loop);
  }
}
function stopSpeech(){ runId++; try{ speechSynthesis.cancel(); }catch(e){} cancelAnimationFrame(raf); curU=null; }
function readFrom(offset, lead){
  if(!("speechSynthesis" in window)){ toast("このブラウザでは読み上げができません"); }
  if(!voices.length) loadVoices();
  const toks = offset>0 ? an.toks.filter(t=>t.end>offset) : an.toks;
  if(!toks.length){ onReadEnd(); return; }
  reveal = offset>0 ? toks[0].start : 0;
  const items = buildPlan({toks, display:an.display}).slice(); items.lead = lead;
  speakSeq(items, onReadEnd);
  cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
}
function onReadEnd(){
  if(ph!=="reading") return;
  reveal=an.display.length; ph="think";
  startTimer("think", Math.max(1, R().think||5));
  render();
}

/* ---------- game flow ---------- */
function startQuestion(){
  if(!an || !an.display.trim()){ toast("問題文が空です"); return; }
  stopSpeech(); stopTimer();
  qs = newQS(); qs.started = true; banner = null;
  G().qcount++;
  for(const p of players()){ p.sit = p.rest>0; if(p.sit) p.rest--; }
  if(!soloMode() && !players().some(eligible)) toast("押せる参加者がいません");
  state.played[Q().id] = true; save();
  qs.open = true; ph = "reading";
  readFrom(0, true);
  render();
}
function buzzIn(pid){
  if(!(ph==="reading"||ph==="think"||ph==="answering")) return;
  const p=getP(pid); if(!p || !eligible(p)) return;
  if(ph==="answering"){
    if(qs.first!==pid && !qs.order.includes(pid)){ qs.order.push(pid); flashCard(pid); renderBoard(); renderBuzz(); broadcast(); }
    return;
  }
  if(!qs.open) return;
  const wasReading = ph==="reading";
  if(wasReading && curU && curU.u.marks) reveal=Math.max(reveal,posFromUtt(curU));
  stopSpeech();
  qs.buzzAt = wasReading ? Math.min(reveal, an.display.length) : an.display.length;
  qs.first=pid; qs.order=[pid]; qs.open=false; ph="answering";
  qs.marks.push({pos:qs.buzzAt, color:colorOf(p)});
  stopTimer(); if(R().ans>0 && pid!=="solo") startTimer("ans", R().ans);
  beep("buzz"); flashCard(pid);
  render();
}
function pushUndo(){
  undoStack.push(JSON.stringify({players:players(), log:G().log, rankNext:G().rankNext, results:state.results, first:qs.first, order:qs.order, lock:[...qs.lock], nev:qs.events.length, banner}));
  if(undoStack.length>30) undoStack.shift();
}
function undo(){
  const s=undoStack.pop(); if(!s){ toast("取り消せる判定がありません"); return; }
  const d=JSON.parse(s);
  G().players=d.players; G().log=d.log; G().rankNext=d.rankNext; state.results=d.results;
  stopSpeech(); stopTimer(); banner=d.banner||null;
  qs.events.length=Math.min(qs.events.length, d.nev); qs.lock=new Set(d.lock); qs.order=d.order||[]; qs.first=d.first;
  if(qs.first && qs.marks.length) { /* keep marks */ }
  ph = qs.first ? "answering" : "revealed"; qs.open=false;
  if(ph==="answering" && R().ans>0 && qs.first!=="solo") startTimer("ans", R().ans);
  save(); toast("直前の判定を取り消しました"); render();
}
function judge(ok){
  if(ph!=="answering") return;
  const p=getP(qs.first); if(!p) return;
  pushUndo(); stopTimer();
  const len=an.display.length;
  qs.events.push({pid:p.id, name:p.name, ok, pos:qs.buzzAt, len});
  if(p.id==="solo") state.results[Q().id]={ok, at:qs.buzzAt, len};
  if(ok){
    if(p.id!=="solo"){ p.o++; p.pts+=R().cp; }
    beep("right");
    checkWin(p);
    finishQuestion();
  } else {
    if(p.id!=="solo"){ p.x++; p.pts+=R().wp; if(R().rest>0) p.rest=R().rest; }
    qs.lock.add(p.id);
    beep("wrong");
    checkLose(p);
    const anyone = !soloMode() && players().some(eligible);
    if(R().resume && anyone){
      qs.first=null; qs.order=[]; qs.open=true; qs.ep++;
      if(qs.buzzAt>=len){ ph="think"; startTimer("think", Math.max(1,R().think||5)); }
      else { ph="reading"; setTimeout(()=>{ if(ph==="reading") readFrom(qs.buzzAt,false); }, 700); }
    } else finishQuestion();
  }
  save(); render();
}
function checkWin(p){
  const r=R(); if(p.id==="solo" || !r.win) return;
  const v = r.mode==="pts" ? p.pts : p.o;
  if(v>=r.win && p.status===""){ p.status="win"; p.rank=G().rankNext++; banner={kind:"win", text:`${p.name} ${p.rank}抜け！`}; setTimeout(()=>beep("win"),450); }
}
function checkLose(p){
  const r=R(); if(p.id==="solo" || !r.lose) return;
  if(p.x>=r.lose && p.status===""){ p.status="out"; banner={kind:"out", text:`${p.name} 失格`}; }
}
function finishQuestion(){
  stopSpeech(); stopTimer();
  ph="revealed"; qs.open=false;
  const g=G();
  g.log.push({n:g.qcount, qid:Q().id, a:analyze(Q().a,{}).display, ev:qs.events.map(e=>({name:e.name, ok:e.ok, pct: e.len? Math.round(e.pos/e.len*100):100}))});
  if(g.log.length>500) g.log.shift();
  save();
}
function through(){
  if(!(ph==="reading"||ph==="think")) return;
  pushUndo(); finishQuestion(); render();
}
function rereadFromStart(){
  if(ph==="answering") return;
  if(ph==="idle"){ startQuestion(); return; }
  if(ph==="reading"||ph==="think"){ stopSpeech(); stopTimer(); ph="reading"; qs.open=true; readFrom(0,false); render(); }
}
function nextQuestion(){ step(1); }
function step(d){
  const v=viewList(); if(!v.length) return;
  let p=v.indexOf(state.idx); if(p<0) p=0;
  const skip = state.ui.skipDone && d>0;
  for(let i=0;i<v.length;i++){
    p=(p+d+v.length)%v.length;
    if(!skip || !state.played[state.questions[v[p]].id]) break;
  }
  go(v[p]);
}
function go(i){
  stopSpeech(); stopTimer();
  if(qs.started && ph!=="revealed"){ G().qcount=Math.max(0,G().qcount-1); }
  state.idx=(i+state.questions.length)%state.questions.length; save();
  ph="idle"; qs=newQS(); banner=null; reveal=0; selTok=-1;
  refresh();
}
function viewList(){
  let ids = state.questions.map((q,i)=>i).filter(i=>(!state.genre || (state.questions[i].g||"自作")===state.genre) && inLevel(state.questions[i]));
  if(state.order){ const set=new Set(ids); const ord=state.order.filter(i=>set.has(i)); if(ord.length===ids.length) ids=ord; }
  return ids;
}

/* ---------- timers ---------- */
function startTimer(kind, sec){ tmr={kind, end:performance.now()+sec*1000, dur:sec*1000, last:Math.ceil(sec)}; requestAnimationFrame(tick); }
function stopTimer(){ tmr=null; }
function tick(){
  if(!tmr) return;
  const left=Math.max(0, tmr.end-performance.now()), frac=left/tmr.dur, secs=Math.ceil(left/1000);
  if(tmr.kind==="ans"){ $("ansBar").style.width=(frac*100)+"%"; $("ansSec").textContent=left>0?`${secs}秒`:"時間切れ"; }
  else { $("thinkFill").style.width=(frac*100)+"%"; $("thinkSec").textContent=`${secs}秒`; }
  if(secs<tmr.last && secs>0 && secs<=3 && tmr.kind==="ans") beep("tick");
  tmr.last=secs;
  if(left<=0){
    const k=tmr.kind; tmr=null;
    if(k==="ans"){ beep("timeup"); if(R().autoWrong) judge(false); else { $("ansSec").textContent="時間切れ"; } }
    else if(ph==="think"){ beep("timeup"); pushUndo(); finishQuestion(); render(); }
    return;
  }
  requestAnimationFrame(tick);
}

/* ---------- rendering: stage ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function renderText(){
  const el=$("qText"), d=an.display, L=d.length;
  const live=document.body.classList.contains("live");
  el.classList.toggle("dim", state.ui.dispAll && !live);
  let vis = ph==="idle" ? 0 : ph==="reading" ? reveal : ph==="think" ? L : ph==="answering" ? qs.buzzAt : L;
  vis=Math.max(0,Math.min(L,vis));
  const marks=qs.marks.filter(m=>m.pos<=vis).sort((a,b)=>a.pos-b.pos);
  let html="", cur=0;
  for(const m of marks){ html+=esc(d.slice(cur,m.pos)); html+=`<span class="slash" style="color:${m.color}">／</span>`; cur=m.pos; }
  html+=esc(d.slice(cur,vis));
  if(ph==="reading") html+=`<span class="cursor"></span>`;
  html+=`<span class="rest">${esc(d.slice(vis))}</span>`;
  if(ph==="idle" && !(state.ui.dispAll && !live)) html+=`<span class="idlehint">${soloMode()?"Space で読み上げ開始。読んでいる途中で Space を押すと早押しです":"Space で読み上げ開始。参加者は自分のキーやスマホで早押しします"}</span>`;
  el.innerHTML=html;
  $("prog").style.width=(L? vis/L*100 : 0)+"%";
}
function renderBuzz(){
  const bar=$("buzzBar");
  if(ph!=="answering" || !qs.first){ bar.hidden=true; return; }
  const p=getP(qs.first); bar.hidden=false;
  bar.style.setProperty("--pc", colorOf(p)); bar.style.setProperty("--pc-soft", softOf(p));
  $("buzzWho").textContent=p.name;
  const rest=qs.order.slice(1).map((id,i)=>{ const q=getP(id); return q?`${i+2}番手 <b>${esc(q.name)}</b>`:""; }).filter(Boolean);
  $("buzzOrd").innerHTML = rest.join("　");
  $("ansTimer").hidden = !(R().ans>0) || p.id==="solo";
}
function renderControls(){
  const c=$("controls"); const b=[];
  const btn=(act,label,cls="",kbd="",dis=false)=>`<button class="btn ${cls}" data-act="${act}" ${dis?"disabled":""}>${label}${kbd?` <kbd>${kbd}</kbd>`:""}</button>`;
  if(ph==="idle"){ b.push(btn("start","読み上げ開始","primary","Space")); }
  if(ph==="reading"){ if(soloMode()) b.push(btn("solobuzz","押す","bad","Space")); b.push(btn("through","スルー","","T")); b.push(btn("reread","最初から読む","","R")); }
  if(ph==="think"){ if(soloMode()) b.push(btn("solobuzz","押す","bad","Space")); b.push(btn("through","スルー（答えを出す）","","T")); }
  if(ph==="answering"){ b.push(btn("right","正解","good","O")); b.push(btn("wrong","誤答","bad","X")); }
  if(ph==="revealed"){ b.push(btn("next","次の問題へ","primary","Space")); b.push(btn("readans","答えを読む")); }
  b.push(`<span class="spacer"></span>`);
  if(undoStack.length) b.push(btn("undo","取り消し","ghost","U"));
  if(ph==="idle"||ph==="revealed"){ b.push(btn("prev","← 前","ghost")); b.push(btn("skip","次 →","ghost")); }
  c.innerHTML=b.join("");
}
function renderStage(){
  const q=Q(); const L=an.display.length;
  $("qNo").textContent = qs.started ? G().qcount : G().qcount+1;
  $("qOf").textContent = "問目";
  const pills={idle:["待機中",""],reading:["読み上げ中","live"],think:["読み終わり","live"],answering:["解答中","hot"],revealed:["正解発表","okp"]};
  const [pt,pc]=pills[ph]; const pp=$("phasePill"); pp.textContent=pt; pp.className="pill "+pc;
  $("genrePill").textContent=q.g||"自作";
  const lp=$("levelPill"); lp.hidden=!q.d; lp.textContent="難易度 "+(q.d||""); lp.className="pill lv-"+(q.d||"");
  renderText(); renderBuzz();
  $("thinkBar").hidden = ph!=="think";
  const bn=$("banner"); bn.hidden=!banner; if(banner){ bn.textContent=banner.text; bn.className="banner"+(banner.kind==="out"?" out":""); }
  const rv = ph==="revealed";
  $("ansBox").hidden=!rv;
  if(rv){
    $("ansVal").textContent=analyze(q.a,{}).display;
    const ev=qs.events;
    $("pressInfo").textContent = ev.length ? ev.map(e=>`${e.ok?"○":"×"} ${e.name}（${e.len?Math.round(e.pos/e.len*100):100}%）`).join("　") : "正解者なし（スルー）";
  }
  renderControls();
}

/* ---------- rendering: board & players ---------- */
function scoreText(p){ const r=R(); return r.mode==="pts" ? `${p.pts}点` : `${p.o}○${p.x}×`; }
function statusCode(p){ if(p.status) return p.status; if(p.sit) return "sit"; if(qs.lock.has(p.id)) return "lock"; return "ok"; }
function renderBoard(){
  const box=$("board"); const r=R();
  if(soloMode()){
    const res=Object.values(state.results); const ok=res.filter(x=>x.ok).length;
    box.innerHTML=`<div class="board-empty">参加者がいないので、ひとり練習モードです（Space で早押し）。正解 ${ok}・誤答 ${res.length-ok}。対戦するときは右の「参加者」から追加してください。</div>`;
    return;
  }
  box.innerHTML="";
  players().forEach(p=>{
    const el=document.createElement("button"); el.type="button";
    el.className="pcard"+(state.ui.tapBuzz?" tap":"");
    el.dataset.pid=p.id;
    el.style.setProperty("--pc", colorOf(p)); el.style.setProperty("--pc-soft", softOf(p));
    let tag="";
    const oi=qs.order.indexOf(p.id);
    if(ph==="answering" && oi===0){ el.classList.add("first"); tag="解答中"; }
    else if(ph==="answering" && oi>0){ el.classList.add("queued"); tag=`${oi+1}番手`; }
    else if(p.status==="win"){ el.classList.add("win"); tag=`${p.rank}抜け`; }
    else if(p.status==="out"){ el.classList.add("out"); tag="失格"; }
    else if(p.sit && qs.started){ el.classList.add("sit"); tag="休み"; }
    else if(qs.lock.has(p.id)){ el.classList.add("locked"); tag="誤答"; }
    else if(p.remote && p.online===false){ tag="未接続"; }
    const big = r.mode==="pts" ? `${p.pts}<small>点</small>` : `${p.o}<small>○</small>`;
    let xs="";
    if(r.mode==="pts") xs=`<span>○${p.o}　×${p.x}</span>`;
    else { xs = "<b>"+"×".repeat(p.x)+"</b>" + (r.lose>p.x ? `<span class="empty">${"・".repeat(Math.min(10,r.lose-p.x))}</span>` : ""); }
    const rest = p.rest>0 ? `　休み残り${p.rest}` : "";
    el.innerHTML=`${tag?`<span class="tag">${tag}</span>`:""}<span class="nm"><i></i><span></span></span><span class="sc">${big}</span><span class="xs">${xs}</span><span class="key">${p.remote?"スマホ":"キー "+esc(keyLabel(p.key))}${rest}</span>`;
    el.querySelector(".nm span").textContent=p.name;
    box.appendChild(el);
  });
}
function flashCard(pid){ const el=document.querySelector(`.pcard[data-pid="${pid}"]`); if(el){ el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } }
function renderPlayers(){
  const box=$("plist"); box.innerHTML="";
  players().forEach(p=>{
    const row=document.createElement("div"); row.className="prow";
    row.innerHTML=`<button class="sw" title="色を変える" aria-label="${esc(p.name)}の色を変える" style="background:${colorOf(p)}"></button>
      <input type="text" maxlength="12" aria-label="名前">
      ${p.remote?`<span class="src">${p.online===false?"スマホ（未接続）":"スマホ"}</span>`:`<button class="btn small kbtn ${listening===p.id?"listening":""}" title="押してから割り当てたいキーを押す">${listening===p.id?"キーを押す…":"キー "+esc(keyLabel(p.key))}</button>`}
      <button class="x" aria-label="${esc(p.name)}を外す" title="外す">×</button>`;
    const inp=row.querySelector("input"); inp.value=p.name;
    inp.addEventListener("input",()=>{ p.name=inp.value.trim()||"名無し"; save(); renderBoard(); broadcast(); });
    row.querySelector(".sw").onclick=()=>{ p.color=(p.color+1)%COLORS.length; save(); renderPlayers(); renderBoard(); broadcast(); };
    const kb=row.querySelector(".kbtn"); if(kb) kb.onclick=()=>{ listening = listening===p.id ? null : p.id; renderPlayers(); };
    row.querySelector(".x").onclick=()=>{ G().players=players().filter(x=>x!==p); save(); renderPlayers(); renderBoard(); broadcast(); };
    box.appendChild(row);
  });
  if(!players().length) box.innerHTML='<p class="hint">参加者がいません。ひとり練習モードになります。</p>';
}
function renderRules(){
  const r=R();
  $("preset").value=r.preset; $("rMode").value=r.mode; $("rWin").value=r.win; $("rLose").value=r.lose; $("rCp").value=r.cp; $("rWp").value=r.wp; $("rRest").value=r.rest;
  $("rAns").value=r.ans; $("rThink").value=r.think; $("rResume").checked=!!r.resume; $("rAutoWrong").checked=!!r.autoWrong;
  $("winHelp").textContent = r.mode==="pts" ? "得点（0 で勝ち抜けなし）" : "正解数（0 で勝ち抜けなし）";
}
function renderLog(){
  const ul=$("log"); const L=G().log;
  if(!L.length){ ul.innerHTML='<li><span class="n"></span><span class="hint">まだ記録はありません</span></li>'; return; }
  ul.innerHTML=L.slice().reverse().map(e=>`<li><span class="n">第${e.n}問</span><span class="ev">${e.ev.length?e.ev.map(v=>`<span class="${v.ok?"o":"x"}">${v.ok?"○":"×"} ${esc(v.name)}</span><span class="hint">${v.pct}%</span>`).join(""):'<span class="hint">スルー</span>'}<span class="hint">答：${esc(e.a)}</span></span></li>`).join("");
}
function render(){ renderStage(); renderBoard(); broadcast(); }

/* ---------- rendering: book ---------- */
function renderToks(){
  const box=$("toks"); box.innerHTML="";
  an.toks.forEach((t,i)=>{
    const b=document.createElement("button");
    const needs = KANJI.test(t.s) || t.src==="num" || t.src==="ruby" || t.src==="dict" || t.src==="q";
    b.className="tok";
    if(!needs){ b.classList.add("plain"); b.tabIndex=-1; }
    else if(t.src==="ruby"||t.src==="dict"||t.src==="q") b.classList.add("fixed");
    else if(t.src==="num") b.classList.add("num");
    else if(t.flag) b.classList.add("flag");
    else b.classList.add("k");
    if(i===selTok) b.classList.add("sel");
    b.innerHTML = `<span class="rt">${needs? esc(t.r|| "？") : ""}</span><span>${esc(t.s)}</span>`;
    if(needs){ b.title = t.flag==="固有名詞" && state.set.mode!=="kana" ? "固有名詞：漢字のまま音声に渡します。試聴して違えば読みを指定してください" : t.flag ? `要確認：${t.flag}` : t.src==="num"?"数詞ルールで決定": t.src==="auto"?"自動判定": "指定済み"; b.onclick=()=>openEditor(i); }
    box.appendChild(b);
  });
  $("editor").hidden = selTok<0;
  $("bookTitle").textContent = `${state.idx+1}番の問題`;
}
function renderPlan(){
  const roles={plain:"本文",pre:"前フリ",turn:"ですが",post:"後半"};
  $("plan").innerHTML = (state.set.lead?`<div class="utt"><span class="role">コール</span><span class="txt">問題</span><span class="prm">間 0.52秒</span></div>`:"") +
    plan.map(u=>`<div class="utt ${u.role==="turn"?"turn":""}"><span class="role">${roles[u.role]}</span><span class="txt">${esc(u.speak)}</span><span class="prm">速さ ${u.rate.toFixed(2)}${u.pause?`・間 ${(u.pause/1000).toFixed(2)}秒`:""}</span></div>`).join("");
}
function plainQ(q){ return normalize(q.q).replace(/《[^》]*》|[｜|]/g,""); }
function renderList(){
  const ul=$("qlist"); ul.innerHTML="";
  const ls=$("levelSel"); ls.innerHTML=Object.entries(LEVELS).map(([k,L])=>`<option value="${k}">${L.name}${L.ds?"（"+L.ds.join("・")+"）":""}：${state.questions.filter(q=>inLevel(q,k)).length}問</option>`).join("");
  ls.value=state.level||"";
  const inLv=state.questions.filter(q=>inLevel(q));
  const genres=[...new Set(state.questions.map(q=>q.g||"自作"))];
  const gs=$("genreSel"); gs.innerHTML=`<option value="">すべてのジャンル（${inLv.length}問）</option>`+genres.map(g=>`<option value="${esc(g)}">${esc(g)}（${inLv.filter(q=>(q.g||"自作")===g).length}問）</option>`).join("");
  gs.value=state.genre||"";
  $("shuffleBtn").setAttribute("aria-pressed", String(!!state.order));
  $("skipDone").checked=!!state.ui.skipDone;
  const frag=document.createDocumentFragment();
  viewList().forEach((i,n)=>{
    const q=state.questions[i];
    const li=document.createElement("li"), b=document.createElement("button");
    b.setAttribute("aria-current", String(i===state.idx));
    b.innerHTML=`<span class="n">${n+1}</span><span class="t">${q.d?`<span class="lv lv-${q.d}">${q.d}</span>`:""}${state.genre?"":`<span class="gn">${esc(q.g||"自作")}</span>`}${esc(plainQ(q))}${state.played[q.id]?'<span class="done">済</span>':""}</span>`;
    b.onclick=()=>go(i); li.appendChild(b); frag.appendChild(li);
  });
  ul.appendChild(frag);
  const cur=ul.querySelector('[aria-current="true"]'); if(cur && !$("viewBook").hidden) cur.scrollIntoView({block:"nearest"});
  $("edQ").value=Q().q; $("edA").value=Q().a; $("edG").value=Q().g||""; $("edD").value=Q().d||"";
}
function renderDict(){
  const box=$("dictList"); const keys=Object.keys(state.dict);
  box.innerHTML = keys.length ? "" : '<p class="hint">まだ登録はありません。「読みの確認」で語をクリックして登録することもできます。</p>';
  keys.sort().forEach(k=>{
    const d=document.createElement("div");
    d.innerHTML=`<span></span><span class="r"></span><button class="x" aria-label="削除">×</button>`;
    d.children[0].textContent=k; d.children[1].textContent=state.dict[k];
    d.querySelector("button").onclick=()=>{ delete state.dict[k]; save(); renderDict(); refresh(); };
    box.appendChild(d);
  });
}
function refresh(){
  an=analyze(Q().q, Q().fix); plan=buildPlan(an);
  renderToks(); renderPlan(); renderList(); renderStage(); renderBoard(); broadcast();
}

/* ---------- reading editor ---------- */
function openEditor(i){
  selTok=i; const t=an.toks[i];
  $("editor").hidden=false; $("edWord").textContent=t.s; $("edRead").value=t.r||"";
  $("edNote").textContent = t.flag ? `要確認（${t.flag}）。文脈に合う読みか確かめてください。` :
    t.src==="num" ? "数と助数詞の組み合わせから読みを決めています。" : t.src==="rule" ? "文脈のルールで読みを決めています。" :
    t.src==="q" ? "この問題だけの読みが指定されています。" : t.src==="dict" ? "辞書の読みを使っています。" : t.src==="ruby" ? "問題文のルビ指定を使っています。" : "形態素解析による自動判定です。";
  $("edReset").hidden = !(t.src==="q"||t.src==="dict");
  renderToks(); $("edRead").focus(); $("edRead").select();
}
const edVal = () => hira($("edRead").value.trim());
$("edThis").onclick=()=>{ const t=an.toks[selTok], v=edVal(); if(!t||!v) return; Q().fix=Q().fix||{}; Q().fix[t.s]=v; save(); refresh(); toast("この問題の読みを指定しました"); };
$("edDict").onclick=()=>{ const t=an.toks[selTok], v=edVal(); if(!t||!v) return; state.dict[t.s]=v; save(); renderDict(); refresh(); toast(`辞書に「${t.s}＝${v}」を登録しました`); };
$("edReset").onclick=()=>{ const t=an.toks[selTok]; if(!t) return; if(Q().fix) delete Q().fix[t.s]; if(t.src==="dict") delete state.dict[t.s]; save(); renderDict(); refresh(); };
$("edSay").onclick=()=>{ const v=edVal(); if(v) speakSeq([{speak:v, rate:state.set.rate, pitch:state.set.pitch, pause:0, mora:1}], null); };
$("edRead").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); $("edThis").click(); } });
$("bookPlay").onclick=()=>{ if(ph!=="idle"&&ph!=="revealed"){ toast("対戦中の問題は対戦画面で読み上げてください"); return; } const items=plan.map(x=>({...x,marks:null,end:null})); items.lead=true; speakSeq(items,null); };
$("bookStop").onclick=()=>{ runId++; try{ speechSynthesis.cancel(); }catch(e){} };

/* ---------- views ---------- */
function setView(v){
  if(v!=="game" && (ph==="reading"||ph==="think"||ph==="answering")){ go(state.idx); }
  state.ui.view=v; save();
  $("viewGame").hidden=v!=="game"; $("viewBook").hidden=v!=="book"; $("viewSet").hidden=v!=="set";
  $("navGame").setAttribute("aria-current", v==="game"?"page":"false");
  $("navBook").setAttribute("aria-current", v==="book"?"page":"false");
  $("navSet").setAttribute("aria-current", v==="set"?"page":"false");
  if(v==="book"){ renderList(); renderToks(); }
}
$("navGame").onclick=()=>setView("game"); $("navBook").onclick=()=>setView("book"); $("navSet").onclick=()=>setView("set");
function setLive(on){
  document.body.classList.toggle("live", on);
  $("liveBtn").textContent = on ? "本番表示を終える" : "本番表示";
  if(on){ setView("game"); try{ document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(()=>{}); }catch(e){} }
  else { try{ document.fullscreenElement && document.exitFullscreen().catch(()=>{}); }catch(e){} }
  renderText();
}
$("liveBtn").onclick=()=>setLive(!document.body.classList.contains("live"));
document.addEventListener("fullscreenchange",()=>{ if(!document.fullscreenElement && document.body.classList.contains("live")) setLive(false); });

// side tabs
const tabs=[["tabP","paneP"],["tabR","paneR"],["tabL","paneL"]];
tabs.forEach(([t])=>$(t).onclick=()=>{ tabs.forEach(([t2,p2])=>{ $(t2).setAttribute("aria-selected", String(t2===t)); $(p2).hidden = t2!==t; }); if(t==="tabL") renderLog(); });

/* ---------- controls ---------- */
$("controls").addEventListener("click",e=>{
  const b=e.target.closest("button[data-act]"); if(!b) return;
  const a=b.dataset.act; try{ b.blur(); }catch(err){}
  if(a==="start") startQuestion();
  else if(a==="solobuzz") buzzIn("solo");
  else if(a==="through") through();
  else if(a==="reread") rereadFromStart();
  else if(a==="right") judge(true);
  else if(a==="wrong") judge(false);
  else if(a==="next") nextQuestion();
  else if(a==="readans"){ const x=analyze(Q().a, Q().fix); const p=buildPlan(x); if(p.length) p[p.length-1].speak=p[p.length-1].speak.replace(/[。？?]*$/,"。"); speakSeq(p.map(v=>({...v,marks:null,end:null})),null); }
  else if(a==="undo") undo();
  else if(a==="prev") step(-1);
  else if(a==="skip") step(1);
});
$("board").addEventListener("pointerdown",e=>{
  if(!state.ui.tapBuzz) return;
  const c=e.target.closest(".pcard"); if(!c) return;
  e.preventDefault(); const p=getP(c.dataset.pid); if(p && !p.remote) buzzIn(p.id);
});
$("dispAll").checked=!!state.ui.dispAll;
$("dispAll").onchange=()=>{ state.ui.dispAll=$("dispAll").checked; save(); renderText(); };
$("tapBuzz").checked=!!state.ui.tapBuzz;
$("tapBuzz").onchange=()=>{ state.ui.tapBuzz=$("tapBuzz").checked; save(); renderBoard(); };
$("pAdd").onclick=()=>{ if(players().length>=16){ toast("参加者は16人までです"); return; } players().push(mkPlayer(`プレイヤー${players().length+1}`)); save(); renderPlayers(); renderBoard(); };

// rules
$("preset").onchange=()=>{ const v=$("preset").value; if(PRESETS[v]) Object.assign(R(), PRESETS[v]); R().preset=v; save(); renderRules(); renderBoard(); broadcast(); };
[["rMode","mode",String],["rWin","win",Number],["rLose","lose",Number],["rCp","cp",Number],["rWp","wp",Number],["rRest","rest",Number]].forEach(([id,k,f])=>{
  $(id).addEventListener("change",()=>{ let v=f($(id).value); if(f===Number && !isFinite(v)) v=0; R()[k]=v; R().preset="custom"; save(); renderRules(); renderBoard(); broadcast(); });
});
[["rAns","ans"],["rThink","think"]].forEach(([id,k])=>$(id).addEventListener("change",()=>{ R()[k]=Math.max(0,Number($(id).value)||0); save(); }));
$("rResume").onchange=()=>{ R().resume=$("rResume").checked; save(); };
$("rAutoWrong").onchange=()=>{ R().autoWrong=$("rAutoWrong").checked; save(); };
let resetArmed=0;
$("resetScores").onclick=()=>{
  const b=$("resetScores");
  if(Date.now()-resetArmed>3000){ resetArmed=Date.now(); b.textContent="もう一度押すとリセットします"; setTimeout(()=>{ b.textContent="得点をリセットして最初から"; },3000); return; }
  resetArmed=0; b.textContent="得点をリセットして最初から";
  players().forEach(p=>Object.assign(p,{o:0,x:0,pts:0,status:"",rank:0,rest:0,sit:false}));
  const g=G(); g.log=[]; g.rankNext=1; g.qcount=0; undoStack=[]; banner=null;
  stopSpeech(); stopTimer(); ph="idle"; qs=newQS(); save(); render(); renderLog(); toast("得点をリセットしました");
};
$("copyLog").onclick=()=>{
  const lines=[...players().map(p=>`${p.name}\t${scoreText(p)}${p.status==="win"?`\t${p.rank}抜け`:p.status==="out"?"\t失格":""}`), "", ...G().log.map(e=>`第${e.n}問\t${e.ev.map(v=>`${v.ok?"○":"×"}${v.name}(${v.pct}%)`).join(" ")||"スルー"}\t答:${e.a}`)];
  const text=lines.join("\n");
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(()=>toast("記録をコピーしました"),()=>toast("コピーできませんでした"));
};

/* ---------- keyboard ---------- */
document.addEventListener("keydown",e=>{
  if(document.body.classList.contains("buzzer")) return;
  if(listening){
    e.preventDefault();
    if(e.code==="Escape"){ listening=null; renderPlayers(); return; }
    if(HOST_CODES.has(e.code)){ toast(`${keyLabel(e.code)} は司会の操作に使うため割り当てられません`); return; }
    players().forEach(p=>{ if(p.key===e.code) p.key=null; });
    const p=getP(listening); if(p) p.key=e.code;
    listening=null; save(); renderPlayers(); renderBoard(); return;
  }
  if(e.target.closest("input,textarea,select")) return;
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  if(e.code==="Escape" && document.body.classList.contains("live")){ setLive(false); return; }
  if(state.ui.view!=="game") return;
  if(e.repeat) return;
  const pk=players().find(p=>!p.remote && p.key===e.code);
  if(pk){ e.preventDefault(); buzzIn(pk.id); return; }
  const c=e.code;
  if(c==="Space"){ e.preventDefault();
    if(ph==="idle") startQuestion();
    else if(ph==="revealed") nextQuestion();
    else if((ph==="reading"||ph==="think") && soloMode()) buzzIn("solo");
  }
  else if(c==="Enter"||c==="NumpadEnter"||c==="KeyO"){ if(e.target.closest("button") && c!=="KeyO") return; if(ph==="answering"){ e.preventDefault(); judge(true); } }
  else if(c==="KeyX"){ if(ph==="answering") judge(false); }
  else if(c==="KeyT"){ through(); }
  else if(c==="KeyR"){ rereadFromStart(); }
  else if(c==="KeyU"){ undo(); }
  else if(c==="ArrowRight"){ if(ph==="idle"||ph==="revealed") step(1); }
  else if(c==="ArrowLeft"){ if(ph==="idle"||ph==="revealed") step(-1); }
});

/* ---------- question book events ---------- */
let edTimer=0;
const onEdit=()=>{ clearTimeout(edTimer); edTimer=setTimeout(()=>{ Q().q=$("edQ").value; Q().a=$("edA").value; Q().g=$("edG").value.trim()||"自作"; save(); an=analyze(Q().q,Q().fix); plan=buildPlan(an); selTok=-1; renderToks(); renderPlan(); renderStage();
  const items=document.querySelectorAll("#qlist li button[aria-current='true'] .t"); if(items[0]) items[0].textContent=plainQ(Q()); },250); };
$("edD").onchange=()=>{ Q().d=normD($("edD").value); save(); renderList(); renderStage(); };
$("edQ").addEventListener("input",onEdit); $("edA").addEventListener("input",onEdit); $("edG").addEventListener("change",()=>{ onEdit(); setTimeout(renderList,300); });
$("qAdd").onclick=()=>{ state.questions.splice(state.idx+1,0,{id:"q"+Date.now(),q:"",a:"",g:"自作",d:"",fix:{}}); state.order=null; state.genre=""; state.level=""; go(state.idx+1); $("edQ").focus(); };
$("qDel").onclick=()=>{ if(state.questions.length<=1){ toast("最後の1問は削除できません"); return; } state.questions.splice(state.idx,1); state.order=null; go(Math.min(state.idx,state.questions.length-1)); toast("削除しました"); };
$("useQ").onclick=()=>{ go(state.idx); setView("game"); };
function applyFilter(){
  const v=viewList(); save();
  if(!v.length){ renderList(); toast("この条件に合う問題がありません"); return; }
  go(v.includes(state.idx)?state.idx:v[0]);
}
$("genreSel").onchange=()=>{ state.genre=$("genreSel").value; applyFilter(); };
$("levelSel").onchange=()=>{ state.level=$("levelSel").value; applyFilter(); };
$("shuffleBtn").onclick=()=>{
  if(state.order){ state.order=null; save(); renderList(); toast("元の順番に戻しました"); return; }
  const a=state.questions.map((q,i)=>i); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  state.order=a; save(); go(viewList()[0]); toast("出題順をシャッフルしました");
};
$("skipDone").onchange=()=>{ state.ui.skipDone=$("skipDone").checked; save(); };
$("clearDone").onclick=()=>{ state.played={}; save(); renderList(); toast("出題済みの印を消しました"); };
function parseBulk(txt){
  return txt.split(/\n/).map(l=>l.trim()).filter(Boolean).map((l,i)=>{
    let q=l, a="", g="自作", d="";
    if(l.includes("\t")){ const c=l.split("\t"); q=c[0]; a=c[1]||""; g=(c[2]||"").trim()||"自作"; d=normD(c[3]); } else if(l.includes("【答】")){ [q,a]=l.split("【答】"); }
    return {id:"b"+Date.now()+"_"+i, q:q.trim(), a:(a||"").trim(), g, d, fix:{}};
  });
}
function normQ(x,i,keepId){
  if(!x || typeof x!=="object") return null;
  const pick=(...ks)=>{ for(const k of ks){ if(x[k]!=null && x[k]!=="") return String(x[k]); } return ""; };
  const q=pick("q","question","問題","問題文").trim(); if(!q) return null;
  const a=pick("a","answer","答え","解答").trim(); const g=pick("g","genre","ジャンル").trim()||"自作"; const d=normD(pick("d","difficulty","level","難易度"));
  const fix = x.fix && typeof x.fix==="object" && !Array.isArray(x.fix) ? Object.fromEntries(Object.entries(x.fix).filter(([k,v])=>typeof v==="string").map(([k,v])=>[k,hira(v)])) : {};
  const id = keepId && typeof x.id==="string" && x.id ? x.id : "i"+Date.now().toString(36)+"_"+i+"_"+Math.random().toString(36).slice(2,6);
  return {id, q, a, g, d, fix};
}
function parseImport(txt, keepId){
  const t=txt.replace(/^﻿/,"").trim(); if(!t) return null;
  if(t[0]==="{" || t[0]==="["){
    let j; try{ j=JSON.parse(t); }catch(e){ return {error:"JSON の形式が正しくありません（"+e.message.slice(0,60)+"）"}; }
    const arr = Array.isArray(j) ? j : (j && Array.isArray(j.questions) ? j.questions : null);
    if(!arr) return {error:"JSON に questions の配列が見つかりません"};
    const questions=arr.map((x,i)=>normQ(x,i,keepId)).filter(Boolean);
    let dict=null;
    if(!Array.isArray(j) && j.dict && typeof j.dict==="object") dict=Object.fromEntries(Object.entries(j.dict).filter(([k,v])=>k && typeof v==="string").map(([k,v])=>[k,hira(v)]));
    return {questions, dict, json:true};
  }
  return {questions:parseBulk(t), dict:null};
}
const qKey = q => normalize(q.q).replace(/《[^》]*》|[｜|\s]/g,"")+"\u0000"+(q.a||"").trim();
function importAppend(txt){
  const r=parseImport(txt,false);
  if(!r) return false;
  if(r.error){ toast(r.error); return false; }
  const have=new Set(state.questions.map(qKey));
  const add=[]; let dup=0;
  for(const q of r.questions){ const k=qKey(q); if(have.has(k)){ dup++; continue; } have.add(k); add.push(q); }
  let dn=0;
  if(r.dict){ for(const [k,v] of Object.entries(r.dict)){ if(state.dict[k]!==v){ state.dict[k]=v; dn++; } } }
  if(!add.length && !dn){ toast(dup?`${dup}問はすでに登録済みでした`:"追加できる問題がありませんでした"); return false; }
  state.questions.push(...add); state.order=null; save(); renderList(); renderDict(); refresh();
  toast(`${add.length}問を追加しました`+(dup?`（重複${dup}問は飛ばしました）`:"")+(dn?`・辞書${dn}語`:""));
  return true;
}
function importReplace(txt){
  const r=parseImport(txt,true);
  if(!r) return false;
  if(r.error){ toast(r.error); return false; }
  if(!r.questions.length){ toast("問題が見つかりませんでした"); return false; }
  state.questions=r.questions; if(r.dict) state.dict=r.dict;
  state.results={}; state.played={}; state.order=null; state.genre=""; state.level=""; save(); renderDict(); go(0);
  toast(`${r.questions.length}問に置き換えました`); return true;
}
$("bulkAdd").onclick=()=>{ if(importAppend($("bulk").value)) $("bulk").value=""; };
let replArmed=0;
$("bulkReplace").onclick=()=>{
  if(!$("bulk").value.trim()) return;
  const b=$("bulkReplace");
  if(Date.now()-replArmed>3000){ replArmed=Date.now(); b.textContent="もう一度押すと置き換えます"; setTimeout(()=>{ b.textContent="置き換える"; },3000); return; }
  replArmed=0; b.textContent="置き換える";
  if(importReplace($("bulk").value)) $("bulk").value="";
};
$("fileAdd").onclick=()=>$("importFile").click();
$("importFile").addEventListener("change",async()=>{
  const files=[...$("importFile").files]; $("importFile").value="";
  for(const f of files){ try{ importAppend(await f.text()); }catch(e){ toast("ファイルを読めませんでした"); } }
});
const exportData=()=>JSON.stringify({app:"QuizRead", version:1, questions:state.questions.map(q=>({id:q.id,g:q.g||"自作",...(q.d?{d:q.d}:{}),q:q.q,a:q.a,...(q.fix&&Object.keys(q.fix).length?{fix:q.fix}:{})})), dict:state.dict}, null, 1);
$("exportBtn").onclick=()=>{
  const data=exportData();
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(data).then(()=>toast("JSON をコピーしました"), ()=>{ $("bulk").value=data; $("bulk").select(); toast("下の欄を選択しました。コピーしてください"); });
  else { $("bulk").value=data; $("bulk").select(); }
};
$("saveFile").onclick=()=>{
  const blob=new Blob([exportData()],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  const d=new Date(); a.download=`quizread-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}.json`;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
};
$("dAdd").onclick=()=>{ const w=$("dW").value.trim(), r=hira($("dR").value.trim()); if(!w||!r){ toast("表記と読みを入力してください"); return; } state.dict[w]=r; save(); $("dW").value=""; $("dR").value=""; renderDict(); refresh(); toast("登録しました"); };
$("dR").addEventListener("keydown",e=>{ if(e.key==="Enter") $("dAdd").click(); });

/* ---------- voice & reading settings ---------- */
function bindRange(id, key, out, fmt){ const el=$(id); el.value=state.set[key]; const show=()=>$(out).textContent=fmt(+el.value); show();
  el.addEventListener("input",()=>{ state.set[key]=+el.value; show(); save(); plan=buildPlan(an); renderPlan(); }); }
bindRange("sRate","rate","vRate",v=>v.toFixed(2)+"×"); bindRange("sPitch","pitch","vPitch",v=>v.toFixed(2)); bindRange("sVol","vol","vVol",v=>Math.round(v*100)+"%");
bindRange("sTurnPause","turnPause","vTurnPause",v=>(v/1000).toFixed(2)+"秒"); bindRange("sPost","post","vPost",v=>v.toFixed(2)+"×");
function bindChk(id,key,re){ const el=$(id); el.checked=!!state.set[key]; el.addEventListener("change",()=>{ state.set[key]=el.checked; save(); if(re) refresh(); else { plan=buildPlan(an); renderPlan(); } }); }
bindChk("cLead","lead"); bindChk("cTurn","turn"); bindChk("cFall","fall"); bindChk("cComma","comma"); bindChk("cParen","paren",true); bindChk("cSound","sound");
$("modeSel").value=state.set.mode; $("modeSel").onchange=()=>{ state.set.mode=$("modeSel").value; save(); plan=buildPlan(an); renderPlan(); };
$("voiceSel").onchange=()=>{ voice=voices.find(v=>v.voiceURI===$("voiceSel").value)||voice; state.set.voice=voice?voice.voiceURI:""; save(); updateVoiceUI(); };
$("voiceTry").onclick=()=>{ const a=analyze("日本で一番高い山は富士山ですが、二番目に高い山は何でしょう？",{}); const p=buildPlan(a); speakSeq(p.map(x=>({...x,marks:null,end:null})), null); };

/* ---------- smartphone buzzers (room) ---------- */
let roomNS=null, hostRoom=null, roomCode=null, bcTimer=0;
const seenPress=new Map();
const IS_CLAUDE = !!(window.claude && typeof window.claude.use==="function");
async function getRoom(){
  if(roomNS) return roomNS;
  const cl=window.claude; if(!cl || typeof cl.use!=="function") return null;
  try{ roomNS = await cl.use("room"); }catch(e){ roomNS=null; }
  return roomNS;
}
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=()=>rej({code:"load_failed"}); document.head.appendChild(s); }); }
async function peerJoin(code, role){
  if(!window.Peer) await loadScript("vendor/peerjs.min.js");
  const hostId="quizread-hayaoshi-"+code;
  const listeners=new Set(), connL=new Set(); let connected=false;
  const setConn=v=>{ connected=v; connL.forEach(f=>{ try{ f(v); }catch(e){} }); };
  const emit=ch=>listeners.forEach(f=>{ try{ f(ch); }catch(e){ console.error(e); } });
  if(role==="host"){
    const peer=new Peer(hostId);
    const conns=new Map(); let mine={};
    const snapshot=()=>[...conns.entries()].map(([id,v])=>({peer:id, presence:v.presence||{}}));
    await new Promise((res,rej)=>{ peer.on("open",()=>{ setConn(true); res(); }); peer.on("error",e=>{ if(!connected) rej({code:e.type||"error"}); }); });
    peer.on("disconnected",()=>{ setConn(false); setTimeout(()=>{ try{ if(!peer.destroyed) peer.reconnect(); }catch(e){} },1000); });
    peer.on("open",()=>setConn(true));
    peer.on("connection",conn=>{
      conn.on("open",()=>{ conns.set(conn.peer,{conn,presence:{}}); try{ conn.send({t:"p",p:mine}); }catch(e){} emit({peers:snapshot(),left:[]}); });
      conn.on("data",d=>{ if(d && d.t==="p" && d.p && typeof d.p==="object"){ const v=conns.get(conn.peer); if(v){ v.presence=d.p; emit({peers:snapshot(),left:[]}); } } });
      const drop=()=>{ if(conns.has(conn.peer)){ conns.delete(conn.peer); emit({peers:snapshot(),left:[{peer:conn.peer}]}); } };
      conn.on("close",drop); conn.on("error",drop);
    });
    return {
      presence(p){ mine={...mine}; for(const k in p){ if(p[k]===null) delete mine[k]; else mine[k]=p[k]; } for(const v of conns.values()){ try{ v.conn.send({t:"p",p:mine}); }catch(e){} } return Promise.resolve(); },
      peers:snapshot, onPeers(f){ listeners.add(f); return ()=>listeners.delete(f); },
      connected:()=>connected, onConnection(f){ connL.add(f); setTimeout(()=>f(connected)); return ()=>connL.delete(f); },
      leave(){ try{ peer.destroy(); }catch(e){} return Promise.resolve(); }
    };
  }
  const peer=new Peer();
  await new Promise((res,rej)=>{ peer.on("open",res); peer.on("error",e=>rej({code:e.type||"error"})); });
  let hostP=null, mine={};
  const conn=peer.connect(hostId,{reliable:true});
  await new Promise((res,rej)=>{
    const t=setTimeout(()=>{ try{ peer.destroy(); }catch(e){} rej({code:"host_not_found"}); },12000);
    conn.on("open",()=>{ clearTimeout(t); setConn(true); res(); });
    peer.on("error",e=>{ if(connected) return; clearTimeout(t); try{ peer.destroy(); }catch(err){} rej({code:e.type==="peer-unavailable"?"host_not_found":(e.type||"error")}); });
  });
  const snap=()=>hostP?[{peer:"host",presence:hostP}]:[];
  conn.on("data",d=>{ if(d && d.t==="p" && d.p && typeof d.p==="object"){ hostP=d.p; emit({peers:snap(),left:[]}); } });
  conn.on("close",()=>{ hostP=null; setConn(false); emit({peers:[],left:[{peer:"host"}]}); });
  return {
    presence(p){ for(const k in p){ if(p[k]===null) delete mine[k]; else mine[k]=p[k]; } try{ conn.send({t:"p",p:mine}); }catch(e){} return Promise.resolve(); },
    peers:snap, onPeers(f){ listeners.add(f); return ()=>listeners.delete(f); },
    connected:()=>connected, onConnection(f){ connL.add(f); return ()=>connL.delete(f); },
    leave(){ try{ peer.destroy(); }catch(e){} return Promise.resolve(); }
  };
}
async function joinRoom(code, role){
  if(IS_CLAUDE){ const room=await getRoom(); if(!room) throw {code:"unavailable"}; return room.join("hayaoshi-"+code); }
  if(!window.RTCPeerConnection) throw {code:"unsupported"};
  return peerJoin(code, role);
}
const ERRS={host_not_found:"その参加コードの司会が見つかりません。コードを確かめてください",unavailable:"この画面ではスマホ参加を使えません。claude.ai にサインインしてこのページを開いてください",unsupported:"このブラウザはスマホ参加に対応していません",load_failed:"接続用のプログラムを読み込めませんでした",network:"通信サーバーにつながりません。ネットワークを確かめてください","server-error":"通信サーバーにつながりません。しばらくしてから試してください"};
const errText=e=>ERRS[e&&e.code] || "接続できませんでした（"+(e&&e.code||"error")+"）";
function joinUrl(code){ return location.origin+location.pathname+"#buzzer-"+code; }
function setRoomChip(){
  const c=$("chipRoom");
  if(!hostRoom){ c.hidden=true; return; }
  const n=players().filter(p=>p.remote && p.online!==false).length;
  c.hidden=false; c.className="chip "+(hostRoom.connected()?"ok":"warn");
  c.querySelector("span").textContent=`スマホ受付中 ${roomCode}・${n}台`;
  $("roomInfo").textContent = IS_CLAUDE ? `接続中のスマホ ${n}台。部員はこのページを開き「スマホを早押しボタンにする」からコード ${roomCode} を入力します。` : `接続中のスマホ ${n}台。部員はスマホで QR コードを読み取るか、このページの「スマホを早押しボタンにする」からコード ${roomCode} を入力します。`;
}
$("roomStart").onclick=async()=>{
  const btn=$("roomStart"); btn.disabled=true; btn.textContent="準備しています…";
  let lastErr=null;
  for(let i=0;i<4 && !hostRoom;i++){
    roomCode=String(Math.floor(1000+Math.random()*9000));
    try{ hostRoom=await joinRoom(roomCode,"host"); }catch(e){ lastErr=e; hostRoom=null; if(!(e && e.code==="unavailable-id")) break; }
  }
  btn.disabled=false; btn.textContent="受付を始める";
  if(!hostRoom){ toast("受付を始められませんでした："+errText(lastErr)); return; }
  hostRoom.onPeers(onHostPeers, err=>{ toast("スマホとの接続が切れました（"+err.code+"）"); });
  hostRoom.onConnection(()=>setRoomChip());
  $("roomIdle").hidden=true; $("roomOn").hidden=false; $("roomCode").textContent=roomCode;
  const qr=$("roomQr");
  if(!IS_CLAUDE && window.qrcode){ try{ const q=qrcode(0,"M"); q.addData(joinUrl(roomCode)); q.make(); qr.innerHTML=q.createSvgTag({cellSize:4, margin:2, scalable:true}); qr.hidden=false; $("roomUrl").textContent=joinUrl(roomCode); $("roomUrl").hidden=false; }catch(e){ qr.hidden=true; } }
  setRoomChip(); broadcast();
};
$("roomStop").onclick=async()=>{
  if(hostRoom){ try{ await hostRoom.leave(); }catch(e){} }
  hostRoom=null; roomCode=null; players().forEach(p=>{ if(p.remote) p.online=false; });
  $("roomIdle").hidden=false; $("roomOn").hidden=true; setRoomChip(); renderPlayers(); renderBoard();
};
function onHostPeers(ch){
  let changed=false;
  for(const peer of ch.peers){
    const pr=peer.presence||{};
    if(pr.role!=="player" || typeof pr.pid!=="string") continue;
    const id="r_"+pr.pid.replace(/[^a-z0-9]/gi,"").slice(0,20);
    let p=players().find(x=>x.id===id);
    const nm=(typeof pr.name==="string" ? pr.name : "").replace(/[\u0000-\u001f]/g,"").trim().slice(0,12) || "スマホ";
    if(!p){
      if(players().length>=16) continue;
      p=mkPlayer(nm,{remote:true}); p.id=id; players().push(p); changed=true; toast(`${nm} が参加しました`);
    }
    if(p.online===false || p.peer!==peer.peer){ p.online=true; p.peer=peer.peer; changed=true; }
    if(p.name!==nm){ p.name=nm; changed=true; }
    if(pr.b===qs.ep && typeof pr.bn==="number"){
      const k=qs.ep+":"+pr.bn;
      if(seenPress.get(id)!==k){ seenPress.set(id,k); buzzIn(id); }
    }
  }
  for(const peer of ch.left){ const p=players().find(x=>x.remote && x.peer===peer.peer); if(p){ p.online=false; changed=true; } }
  if(changed){ save(); renderPlayers(); renderBoard(); broadcast(); }
  setRoomChip();
}
function broadcast(){
  if(!hostRoom) return;
  clearTimeout(bcTimer);
  bcTimer=setTimeout(()=>{
    if(!hostRoom) return;
    const pl={};
    players().filter(p=>p.remote).forEach(p=>{ pl[p.id]=[scoreText(p), statusCode(p), COLORS[p.color%COLORS.length]]; });
    const f=qs.first?getP(qs.first):null;
    hostRoom.presence({role:"host", ep:qs.ep, open: !!(qs.open && (ph==="reading"||ph==="think")), ph, first:(ph==="answering"&&qs.first)||null, fn: (ph==="answering"&&f)?f.name:"", ord:qs.order.slice(0,6), pl, q:qs.started?G().qcount:G().qcount+1}).catch(()=>{});
  },30);
}

/* ---------- phone buzzer view ---------- */
let bzRoom=null, bzPid=null, bzN=0, bzState=null;
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function openBuzzer(code){ document.body.classList.add("buzzer"); $("bzName").value=lsGet("monyomi.bzname")||""; if(code) $("bzCode").value=code; (code? $("bzName") : $("bzCode")).focus(); }
$("joinBtn").onclick=()=>openBuzzer();
$("bzLeave").onclick=async()=>{ if(bzRoom){ try{ await bzRoom.leave(); }catch(e){} } bzRoom=null; document.body.classList.remove("buzzer"); $("bzJoin").hidden=false; $("bzPlay").hidden=true; if(/^#buzzer/.test(location.hash)) history.replaceState(null,"",location.pathname+location.search); };
$("bzGo").onclick=async()=>{
  const code=$("bzCode").value.replace(/\D/g,""), name=$("bzName").value.trim().slice(0,12);
  if(code.length!==4){ $("bzErr").textContent="4桁のコードを入力してください"; return; }
  if(!name){ $("bzErr").textContent="名前を入力してください"; return; }
  lsSet("monyomi.bzname", name);
  $("bzErr").textContent="接続しています…";
  bzPid = lsGet("monyomi.bzpid") || Math.random().toString(36).slice(2,12); lsSet("monyomi.bzpid", bzPid);
  $("bzGo").disabled=true;
  try{ bzRoom = await joinRoom(code,"player"); }catch(e){ $("bzGo").disabled=false; $("bzErr").textContent=errText(e); return; }
  $("bzGo").disabled=false;
  bzRoom.onConnection(c=>{ if(!c) $("bzStat").textContent="接続が切れました。「戻る」から参加し直してください"; });
  await bzRoom.presence({role:"player", pid:bzPid, name, b:null, bn:0}).catch(()=>{});
  bzRoom.onPeers(()=>renderBz(), err=>{ $("bzStat").textContent="接続が切れました。戻ってもう一度参加してください"; });
  $("bzErr").textContent=""; $("bzJoin").hidden=true; $("bzPlay").hidden=false; $("bzMe").textContent=name;
  renderBz();
};
function renderBz(){
  if(!bzRoom) return;
  const host=bzRoom.peers().find(p=>p.presence && p.presence.role==="host");
  const btn=$("bzBtn"), st=$("bzStat");
  btn.classList.remove("mine");
  if(!host){ bzState=null; st.textContent="司会の画面を待っています（コードを確かめてください）"; btn.disabled=true; btn.textContent="押す"; return; }
  const s=host.presence; bzState=s;
  const myId="r_"+bzPid.replace(/[^a-z0-9]/gi,"").slice(0,20);
  const mine=s.pl && s.pl[myId];
  if(!mine){ st.textContent="参加を受け付けています…"; btn.disabled=true; return; }
  const [score, code, color] = mine;
  if(typeof color==="string" && /^#[0-9a-f]{6}$/i.test(color)) btn.style.setProperty("--pc", color);
  $("bzScore").textContent = (s.q?`第${s.q}問　`:"")+score;
  let text="", can=false;
  const ord = Array.isArray(s.ord) ? s.ord.indexOf(myId) : -1;
  if(code==="win") text="勝ち抜け！おめでとうございます";
  else if(code==="out") text="失格";
  else if(s.first===myId){ text="あなたが解答者です！"; btn.classList.add("mine"); }
  else if(ord>0) text=`${ord+1}番手で押しました`;
  else if(code==="sit") text="この問題はお休みです";
  else if(code==="lock") text="誤答のため、この問題は押せません";
  else if(s.ph==="answering") text=`${typeof s.fn==="string"?s.fn:""} が解答中`;
  else if(s.open){ text="押せます"; can=true; }
  else if(s.ph==="revealed") text="正解発表";
  else text="次の問題を待っています";
  st.textContent=text;
  btn.disabled = !(can || (s.ph==="answering" && code==="ok" && ord<0 && s.first!==myId));
  btn.textContent = s.first===myId ? "解答中" : "押す";
}
function bzPress(e){
  e.preventDefault();
  const btn=$("bzBtn"); if(btn.disabled || !bzRoom || !bzState) return;
  bzN++;
  bzRoom.presence({b:bzState.ep, bn:bzN}).catch(()=>{});
  btn.classList.add("pressed"); setTimeout(()=>btn.classList.remove("pressed"),150);
  try{ navigator.vibrate && navigator.vibrate(40); }catch(err){}
}
$("bzBtn").addEventListener("pointerdown", bzPress);
$("bzCode").addEventListener("keydown",e=>{ if(e.key==="Enter") $("bzName").focus(); });
$("bzName").addEventListener("keydown",e=>{ if(e.key==="Enter") $("bzGo").click(); });

/* ---------- chips / toast ---------- */
function setChip(id,cls,text){ const c=$(id); c.className="chip "+cls+(id!=="chipRoom"?" hostonly":""); c.querySelector("span").textContent=text; c.title=text; }
let tt=0; function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("on"); clearTimeout(tt); tt=setTimeout(()=>t.classList.remove("on"),2600); }

/* ---------- boot ---------- */
if(state.idx>=state.questions.length) state.idx=0;
renderPlayers(); renderRules(); renderDict(); renderLog();
refresh();
setView(state.ui.view||"game");
{ const m=location.hash.match(/^#buzzer(?:-(\d{4}))?$/); if(m) openBuzzer(m[1]); }
if(!IS_CLAUDE){ $("roomHint").textContent="部員がそれぞれのスマホでこのページを開き、QR コードを読み取るか「スマホを早押しボタンにする」からコードを入れると参加できます。"; }
else { $("saveFile").hidden=true; $("fileAdd").hidden=false; }
if(window.QuizTokenizer){
  QuizTokenizer.build("dict/").then(tk=>{ TK=tk; setChip("chipDict","ok","読み辞書：準備完了"); if(ph==="idle"||ph==="revealed") refresh(); })
  .catch(err=>{ console.error(err); setChip("chipDict","warn","読み辞書を読み込めませんでした（簡易モード）"); });
} else setChip("chipDict","warn","読み辞書なし（簡易モード）");

})().catch(error => {
  console.error(error);
  const chip = document.getElementById("chipDict");
  if (chip) {
    chip.className = "chip warn hostonly";
    const label = chip.querySelector("span");
    if (label) label.textContent = "問題データを読み込めませんでした";
  }
  const stage = document.getElementById("qText");
  if (stage) stage.textContent = "問題データを読み込めませんでした。HTTPサーバー経由で開いているか確認してください。";
});
