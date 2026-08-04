/* ============================================================
   HỆ ICON SVG (kiểu Lucide) — thay toàn bộ emoji trong giao diện
   LPGT Cavern — Quản lý Công Ca v4

   Cách hoạt động (giống i18n):
   - Template / i18n VẪN viết emoji như cũ — KHÔNG phải sửa code cũ.
   - icApply() quét các text node, gặp emoji đã khai trong IC_MAP thì
     thay bằng <span class="ici"><svg>…</svg></span> nét mảnh, màu theo
     currentColor nên tự khớp màu chữ xung quanh.
   - MutationObserver chạy lại mỗi khi giao diện vẽ lại.
   - BỎ QUA: #printRoot (biểu mẫu in giữ nguyên), script/style/input,
     và mọi phần tử có data-noic.
   - Nạp NGAY SAU js/14-i18n.js.
   ============================================================ */

/* ---- Bộ icon: name → ruột SVG (viewBox 24×24, stroke currentColor) ---- */
const IC_SVG={
  home:'<path d="M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22v-8h6v8"/>',
  calendar:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  'check-circle':'<path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10-3-3"/>',
  chart:'<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 14v3M12 9v8M17 5v12"/>',
  trend:'<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  pen:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  pencil:'<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  zap:'<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  clipboard:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  sliders:'<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3"/><path d="M14 2v4M8 10v4M16 18v4"/>',
  printer:'<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':'<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="m1 1 22 22"/>',
  help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  cloud:'<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  umbrella:'<path d="M22 12a10 10 0 0 0-20 0Z"/><path d="M12 12v7a2 2 0 0 0 4 0"/><path d="M12 2v2"/>',
  repeat:'<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  swap:'<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  idcard:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5.5 16c.5-1.5 1.5-2 2.5-2s2 .5 2.5 2"/><path d="M14 9h5M14 13h5"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8"/>',
  warn:'<path d="m10.29 3.86-8.47 14.14a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3l-8.47-14.14a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  'x-circle':'<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  'check-square':'<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  square:'<rect x="4" y="4" width="16" height="16" rx="2"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  hourglass:'<path d="M5 22h14M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  ban:'<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  'chev-l':'<path d="m15 18-6-6 6-6"/>',
  'chev-r':'<path d="m9 18 6-6-6-6"/>',
  'chev-d':'<path d="m6 9 6 6 6-6"/>',
  'chev-u':'<path d="m18 15-6-6-6 6"/>',
  folder:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  bell:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  pin:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  megaphone:'<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  phone:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'arrow-r':'<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  sparkles:'<path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z"/>',
  pie:'<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  dot:'<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
  circle:'<circle cx="12" cy="12" r="8"/>',
  'thumbs-up':'<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  factory:'<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>',
  building:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>',
  hand:'<path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  calc:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h8"/>',
  fuel:'<path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  compass:'<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
  /* v5.6 — bốn bữa ăn trong ngày (đặt cơm tăng ca) */
  sunrise:'<path d="M12 2v6M4.93 10.93 6.34 12.34M2 18h2M20 18h2M17.66 12.34l1.41-1.41M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  sunset:'<path d="M12 10V2M4.93 10.93 6.34 12.34M2 18h2M20 18h2M17.66 12.34l1.41-1.41M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  utensils:'<path d="M3 2v7a3 3 0 0 0 3 3 3 3 0 0 0 3-3V2"/><path d="M6 12v10M18 2v20"/><path d="M18 12c2 0 3-1.5 3-4V4c0-1.5-1-2-3-2"/>',
  bowl:'<path d="M3 11h18a9 9 0 0 1-9 9 9 9 0 0 1-9-9Z"/><path d="M8 8c0-1.5 1-2 2-2s2-.5 2-2M14 8c0-1 .7-1.5 1.5-1.5"/>',
};

/* ---- emoji → tên icon (kèm lớp màu tuỳ chọn) ---- */
const IC_MAP={
  '⛽':'fuel','🏠':'home','📅':'calendar','🗓':'calendar','📆':'calendar',
  '✅':'check-circle ok','☑':'check-square','📊':'chart','📈':'trend','☰':'menu',
  '📝':'pen','✍':'pen','⚡':'zap','📋':'clipboard','🔑':'key','🛠':'wrench','⚙':'sliders',
  '🖨':'printer','↪':'logout','↩':'undo','👁':'eye','🙈':'eye-off','❔':'help','❓':'help',
  '👥':'users','👤':'user','📤':'upload','☁':'cloud','⏱':'clock','⏰':'clock','🕒':'clock',
  '✉':'mail','🏖':'umbrella','🌂':'umbrella','🔄':'repeat','🔁':'repeat','🔃':'repeat',
  '⇄':'swap','⇌':'swap','✏':'pencil','✎':'pencil','🪪':'idcard','📄':'file','🧾':'file',
  '⚠':'warn wr','🚨':'warn rd','✕':'x','✗':'x','❌':'x-circle rd','✓':'check','✔':'check',
  '🗑':'trash','⏳':'hourglass','⌛':'hourglass','🚫':'ban',
  '◀':'chev-l','▶':'chev-r','▾':'chev-d','▼':'chev-d','▴':'chev-u','▲':'chev-u','▸':'chev-r',
  '🗂':'folder','🔔':'bell','📌':'pin','📍':'pin','📣':'megaphone','📱':'phone','💾':'save',
  '🔐':'lock','🔒':'lock','➡':'arrow-r','🆕':'sparkles','🍩':'pie','🔎':'search','🔍':'search',
  '🟢':'dot gr','🔴':'dot rd','🟡':'dot yl','●':'dot','○':'circle','☐':'square',
  '👍':'thumbs-up','🚩':'flag','🏭':'factory','🏢':'building','👋':'hand','✋':'hand','🧮':'calc',
  '⬇':'download','↺':'undo','⤷':'chev-r','🧭':'compass',
  /* v5.4 — người OT cover: bắt tay = hai người, từ chối = bàn tay chặn */
  '🤝':'users','🙅':'hand',
  /* v5.6 — đặt cơm tăng ca: 4 mốc bữa ăn + bát cơm */
  '🌅':'sunrise','🍚':'bowl','🌆':'sunset','🌙':'moon','🍽':'utensils',
};

/* ---- dựng markup ---- */
function icHtml(name){
  const parts=String(name).split(' ');
  const svg=IC_SVG[parts[0]];
  if(!svg)return null;
  const cls=['ici','ici-'+parts[0]].concat(parts.slice(1).map(c=>'ici--'+c)).join(' ');
  return `<span class="${cls}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></span>`;
}

/* ---- regex khớp emoji (dài trước, nuốt cả variation selector) ---- */
const IC_RE=(()=>{
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const keys=Object.keys(IC_MAP).sort((a,b)=>b.length-a.length).map(esc);
  return new RegExp('(?:'+keys.join('|')+')[\\uFE0E\\uFE0F]?','g');
})();

const IC_SKIP={SCRIPT:1,STYLE:1,TEXTAREA:1,INPUT:1,SELECT:1,OPTION:1,TITLE:1,SVG:1,NOSCRIPT:1};

function icSkipEl(el){
  for(let n=el;n&&n.nodeType===1;n=n.parentNode){
    if(IC_SKIP[String(n.tagName).toUpperCase()]||n.id==='printRoot'||n.hasAttribute('data-noic'))return true;
    if(n.classList&&n.classList.contains('ici'))return true;
  }
  return false;
}

/* ---- thay emoji trong 1 text node ---- */
function icFixText(node){
  const s=node.nodeValue;
  if(!s)return;
  IC_RE.lastIndex=0;
  if(!IC_RE.test(s))return;
  if(!node.parentNode||icSkipEl(node.parentNode))return;
  IC_RE.lastIndex=0;
  const frag=document.createDocumentFragment();
  let last=0,m;
  while((m=IC_RE.exec(s))){
    if(m.index>last)frag.appendChild(document.createTextNode(s.slice(last,m.index)));
    const name=IC_MAP[m[0].replace(/[\uFE0E\uFE0F]/g,'')];
    const html=name&&icHtml(name);
    if(html){
      const tpl=document.createElement('template');
      tpl.innerHTML=html;
      frag.appendChild(tpl.content);
    }else{
      frag.appendChild(document.createTextNode(m[0]));
    }
    last=m.index+m[0].length;
  }
  if(last<s.length)frag.appendChild(document.createTextNode(s.slice(last)));
  node.parentNode.replaceChild(frag,node);
}

/* ---- quét một gốc ---- */
function icApply(root){
  root=root||document.body;
  if(!root)return;
  if(root.nodeType===3){icFixText(root);return;}
  if(root.nodeType!==1&&root.nodeType!==11)return;
  if(root.nodeType===1&&icSkipEl(root))return;
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
  const list=[];
  let n;while((n=w.nextNode()))list.push(n);
  for(const tn of list)icFixText(tn);
}

/* ---- i18n: đăng ký thêm khoá đã lược emoji (để dịch được sau khi tách) ---- */
function icPatchI18n(){
  try{
    if(typeof i18nMap!=='function'||typeof I18N_EN==='undefined')return;
    const m=i18nMap();
    const strip=s=>String(s).replace(IC_RE,'').replace(/\s+/g,' ').trim();
    for(const k in I18N_EN){
      const k2=strip(k);
      if(k2&&k2!==i18nKey(k)&&m[k2]===undefined)m[k2]=strip(I18N_EN[k]);
    }
  }catch(e){}
}

/* ---- khởi động: quét lần đầu + theo dõi DOM ---- */
(function(){
  let queued=false;
  const pending=new Set();
  function flush(){
    queued=false;
    const items=[...pending];pending.clear();
    for(const it of items)icApply(it);
  }
  function queue(target){
    pending.add(target);
    if(!queued){queued=true;requestAnimationFrame(flush);}
  }
  function start(){
    icPatchI18n();
    icApply(document.body);
    new MutationObserver(muts=>{
      for(const mu of muts){
        if(mu.type==='characterData'){queue(mu.target);continue;}
        for(const nd of mu.addedNodes){
          if(nd.nodeType===1||nd.nodeType===3)queue(nd);
        }
      }
    }).observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();
