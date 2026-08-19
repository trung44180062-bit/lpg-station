/* ============================================================
 * sap-dailystock-parity.test.js  —  node tests/sap-dailystock-parity.test.js
 * ------------------------------------------------------------
 * CHỐT: tách batch SLoc 1100 KHÔNG được làm lệch Daily Stock.
 * cav.js _srcSAP cộng theo sloc|KÝ-TỰ-batch|mat, không đếm số dòng ⇒ tách
 * bao nhiêu dòng cũng phải ra đúng con số cũ. Test này dựng lại y hệt phép
 * cộng đó rồi so cách GỘP CŨ với cách TÁCH hiện tại trên 3 bản SAP thật.
 * Chạy lại mỗi khi đụng vào parseSapSheet().
 * ============================================================ */
/* Chứng minh Daily Stock KHÔNG đổi: dựng lại đúng cách gộp của cav.js _srcSAP
   (sloc|batch|mat) trên (a) cách GỘP CŨ và (b) cách TÁCH v4.98 — phải trùng khít. */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
global.window=global; global.CURRENT_USER={name:'t'}; global.FB_DB=null;
global.localStorage={getItem:()=>null,setItem:()=>{}};
global.document={getElementById:()=>({addEventListener:()=>{},textContent:'',innerHTML:'',value:'',style:{},classList:{add(){},remove(){},toggle(){}}}),querySelector:()=>null,querySelectorAll:()=>[]};
global.toast=()=>{}; global.canWrite=()=>true; global.escapeHtml=s=>String(s==null?'':s);
global.Tabulator=function(){return{on:()=>{},replaceData:()=>{},destroy:()=>{}};};
const SP=eval(fs.readFileSync(path.join(ROOT,'js','data','sp.js'),'utf8').split('/* SAP shims */')[0]+'\n;SP');

const F=JSON.parse(fs.readFileSync(path.join(ROOT,'tests','knq.fixtures.json'),'utf8'));
const pad=rs=>rs.map(r=>{const a=[];for(let i=0;i<22;i++)a.push(r[i]==null?'':String(r[i]));return a;});

function srcSAP(rows,date){                    // == cav.js _srcSAP
  const end={},gr={},gi={},init={};
  const key=(sl,b,m)=>sl+'|'+b+'|'+m;
  rows.forEach(r=>{ if(r.date!==date) return;
    const k=key(r.sloc,r.batch,r.mat);
    end[k]=(end[k]||0)+r.end; gr[k]=(gr[k]||0)+r.gr;
    gi[k]=(gi[k]||0)+r.gi;   init[k]=(init[k]||0)+r.init; });
  return {end,gr,gi,init};
}
/* cách GỘP CŨ (trước v4.89): cộng thẳng từ TSV, không phân biệt mã batch */
function oldWay(tsv){
  const MAT={'20008511':'C3','20008512':'C4'}, OK={'1100':1,'2100':1,'2101':1,'B100':1};
  const a={};
  tsv.forEach(c=>{
    const m=MAT[c[2]]; if(!m) return;
    const sl=c[4]; if(!OK[sl]) return;
    const d=String(c[6]).slice(0,10); if(d.length<10) return;
    let b=String(c[7]||'').trim().toUpperCase();
    if(b.length>=7&&'DEPX'.includes(b[6])) b=b[6];
    else if(b.length===1&&'DEPX'.includes(b)) {}
    else if(b && 'DEPX'.includes(b[b.length-1])) b=b[b.length-1];
    else return;
    const k=d+'|'+sl+'|'+m+'|'+b;
    if(!a[k]) a[k]={date:d,sloc:sl,mat:m,batch:b,init:0,gr:0,gi:0,trs:0,end:0};
    const N=v=>parseFloat(String(v||0).replace(/,/g,''))||0;
    a[k].init+=N(c[8]); a[k].gr+=N(c[11]); a[k].gi+=N(c[13]); a[k].trs+=N(c[15]); a[k].end+=N(c[17]);
  });
  return Object.values(a).map(r=>{['init','gr','gi','trs','end'].forEach(f=>r[f]=Math.round(r[f]));return r;});
}
let bad=0;
[['bản 19/08 (chỉ 1100)','sapRaw1100_0819'],
 ['bản 17/08 (chỉ 1100)','sapRaw1100'],
 ['bản 01–02/08 (đủ mọi SLoc)','sapRawMulti']].forEach(([name,key])=>{
  const tsv=pad(F[key]);
  const nw=SP._parseSap(tsv).rows, ow=oldWay(tsv);
  const dates=[...new Set(nw.map(r=>r.date))].sort();
  dates.forEach(d=>{
    const A=srcSAP(ow,d), B=srcSAP(nw,d);
    const keys=[...new Set([...Object.keys(A.end),...Object.keys(B.end)])].sort();
    keys.forEach(k=>{
      ['end','gr','gi','init'].forEach(f=>{
        if((A[f][k]||0)!==(B[f][k]||0)){ bad++; console.log('  ✗',name,d,k,f,A[f][k],'→',B[f][k]); }
      });
    });
    console.log((bad?'  ':'  ✅ ')+name+' · '+d+' — '+keys.length+' khoá sloc|batch|mat trùng khít '+
      '(1100: '+nw.filter(r=>r.date===d&&r.sloc==='1100').length+' dòng tách ↔ '+
      ow.filter(r=>r.date===d&&r.sloc==='1100').length+' dòng gộp cũ)');
  });
});
console.log(bad? ('\n❌ '+bad+' sai lệch') : '\n✅ Daily Stock đọc ra SỐ Y HỆT — không ảnh hưởng gì');
process.exit(bad?1:0);
