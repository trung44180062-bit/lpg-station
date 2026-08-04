/* ============================================================
   BAO CAO — gop "Nhan luc" + "Thong ke" + "Bieu do" vao 1 tab
   LPGT Cavern — Quan ly Cong Ca v4

   Phan quyen xem:
     · Quan tri / Quan ly nguoi Han / Duyet don  → xem TOAN BO nhan su
     · Nhan vien thuong                          → chi xem so lieu CUA MINH
   Bieu do ve bang SVG thuan, khong dung thu vien ngoai → chay offline,
   in ra giay van dep.
   ============================================================ */

/* Ai được xem số liệu của cả tổ */
function repSeeAll(){return !!secr;}

/* =================== TRẠNG THÁI MÀN HÌNH =================== */
let repMode='';                 // 'mp' | 'stats' | 'chart'
let repYm='';                   // kỳ công đang xem (thống kê / biểu đồ)
let repGroup='__all';
let repFrom='', repTo='';       // khoảng ngày của bảng nhân lực
let repOnlyLow=false;

/* Nhật ký tăng ca ('otlog') đã CHUYỂN sang làm sub-tab của tab Duyệt
   (xem renderApprTabs trong js/08-requests.js). Các hàm otlog* vẫn nằm
   ở cuối file này và được màn Duyệt gọi lại nguyên vẹn. */
function repModes(){return repSeeAll()?['mp','stats','chart']:['stats','chart'];}
const REP_LABEL={mp:'👥 Nhân lực',stats:'📊 Thống kê',chart:'📈 Biểu đồ',otlog:'🗂 Nhật ký tăng ca'};
const REP_LABEL_ME={stats:'📊 Số liệu của tôi',chart:'📈 Biểu đồ của tôi',otlog:'🗂 Nhật ký tăng ca'};

function repDefaults(){
  const ms=repModes();
  if(!ms.includes(repMode))repMode=ms[0];   // quản lý vào là thấy Nhân lực trước
  if(!repYm)repYm=curSchedMonth();
  if(!repFrom)repFrom=todayIso();
  if(!repTo){const d=new Date();d.setDate(d.getDate()+6);repTo=isoOf(d);}
}
function repSetMode(m){repMode=m;renderReport();}
/* Nhân lực / Thống kê / Biểu đồ nay được nhúng ở nhiều tab (Lịch, Duyệt,
   Báo cáo cá nhân) → đổi bộ lọc phải vẽ lại ĐÚNG tab đang mở. */
function repRefresh(){
  if(curView==='appr'&&typeof renderAppr==='function')renderAppr();
  else if(curView==='cal'&&typeof renderCal==='function')renderCal();
  else renderReport();
}
function repSet(k,v){
  if(k==='ym')repYm=v; else if(k==='group')repGroup=v;
  else if(k==='from')repFrom=v; else if(k==='to')repTo=v;
  else if(k==='low')repOnlyLow=!!v;
  repRefresh();
}
function repShiftYm(d){
  const ms=monthsAvailable();
  let i=ms.indexOf(repYm);
  if(i<0){const[y,m]=repYm.split('-').map(Number);const a=new Date(y,m-1+d,1);repYm=a.getFullYear()+'-'+pad(a.getMonth()+1);}
  else if(i+d>=0&&i+d<ms.length)repYm=ms[i+d];
  repRefresh();
}
/* ---- Panel đóng gói (bộ lọc + thân) để nhúng vào tab khác ----
   repMpPanel   → sub-tab "Nhân lực" của tab LỊCH
   repStatsPanel→ sub-tab "Bảng công tổng hợp" của tab DUYỆT
   repChartPanel→ sub-tab "Biểu đồ" của tab DUYỆT */
function repMpPanel(){repDefaults();return `<div class="card rep-bar">${repCtlHtml('mp')}</div>`+repManpower();}
function repStatsPanel(){repDefaults();return `<div class="card rep-bar">${repCtlHtml('stats')}</div>`+(repSeeAll()?repStatsAll():repStatsMe());}
function repChartPanel(){repDefaults();return repCharts();}

/* =================== KHUNG =================== */
function renderReport(){
  const bar=$('repBar'),body=$('repBody');
  if(!bar||!body)return;
  repDefaults();
  const ms=repModes(),lbl=repSeeAll()?REP_LABEL:REP_LABEL_ME;
  bar.innerHTML=`
    <div class="seg rep-seg">${ms.map(m=>
      `<button class="${repMode===m?'on':''}" onclick="repSetMode('${m}')">${lbl[m]||REP_LABEL[m]}</button>`).join('')}</div>
    ${repCtlHtml()}`;
  if(repMode==='mp')        body.innerHTML=repManpower();
  else if(repMode==='stats')body.innerHTML=repSeeAll()?repStatsAll():repStatsMe();
  else if(repMode==='otlog')body.innerHTML=repOtLog();
  else                      body.innerHTML=repCharts();
}

/* Thanh điều khiển đổi theo chế độ đang xem (mode truyền vào khi nhúng ở tab khác) */
function repCtlHtml(mode){
  const repModeCur=mode||repMode;
  const grpSel=()=>{
    const teams=teamList();
    return `<select class="inp sm" onchange="repSet('group',this.value)">
      <option value="__all">Tất cả nhóm</option>
      ${teams.map(t=>`<option value="${esc(t)}"${repGroup===t?' selected':''}>Nhóm ${esc(t||'(chưa phân nhóm)')}</option>`).join('')}
    </select>`;
  };
  const ymSel=()=>{
    const ms=monthsAvailable();
    if(!ms.includes(repYm))ms.push(repYm),ms.sort();
    return `<button class="btn sec sm" onclick="repShiftYm(-1)">◀</button>
      <select class="inp sm" style="font-weight:700" onchange="repSet('ym',this.value)">
        ${ms.map(m=>`<option value="${m}"${m===repYm?' selected':''}>${periodFor(m).label}</option>`).join('')}
      </select>
      <button class="btn sec sm" onclick="repShiftYm(1)">▶</button>`;
  };
  if(repModeCur==='mp'){
    return `<div class="rep-ctl">
      <label class="fl2">Từ</label><input type="date" class="inp sm" value="${repFrom}" onchange="repSet('from',this.value)">
      <label class="fl2">Đến</label><input type="date" class="inp sm" value="${repTo}" onchange="repSet('to',this.value)">
      <label class="cal-chk"><input type="checkbox" ${repOnlyLow?'checked':''} onchange="repSet('low',this.checked)"> Chỉ ngày thiếu người</label>
      <span class="sp"></span>
      <span class="muted sm2">Định mức: D ≥ <b>${S.settings.minD}</b> · N ≥ <b>${S.settings.minN}</b></span>
    </div>`;
  }
  if(repModeCur==='otlog'){
    // Nhật ký tăng ca có bộ lọc riêng ngay trong thân bảng
    return '';
  }
  if(repModeCur==='stats'&&repSeeAll()){
    return `<div class="rep-ctl">${ymSel()}${grpSel()}
      <span class="sp"></span>
      <button class="btn sm" onclick="openMailReport()">✉️ Gửi email báo cáo</button>
      <button class="btn ok sm" onclick="exportStats()">📤 Xuất Excel</button></div>`;
  }
  // Biểu đồ dùng bộ chọn phạm vi riêng bên trong (tháng/quý/năm) nên không cần thanh kỳ ở đây
  if(repModeCur==='chart')return '';
  return `<div class="rep-ctl">${ymSel()}</div>`;
}

/* =================== 1. NHÂN LỰC THEO NGÀY =================== */
function repDayList(){
  const out=[];
  if(!repFrom||!repTo||repTo<repFrom)return out;
  let d=new Date(repFrom+'T00:00:00');const end=new Date(repTo+'T00:00:00');
  let g=0;
  while(d<=end&&g++<93){out.push(isoOf(d));d.setDate(d.getDate()+1);}
  return out;
}
function repManpower(){
  const days=repDayList();
  if(!days.length)return '<div class="card"><p class="muted">Chọn khoảng ngày hợp lệ.</p></div>';
  /* Pill có thêm DÒNG TÁCH VỊ TRÍ: một ca đủ đầu người vẫn có thể thiếu kỹ sư,
     nên ngay trên đầu dòng đã thấy "KS x · OP y" mà không cần bung chi tiết. */
  const eoTag=arr=>{
    const g=splitEO(arr||[]);
    if(!arr||!arr.length)return '';
    return `<em class="mpp-eo" title="${esc(t2('Kỹ sư (Field + DCS Boardman)'))} / ${esc(t2('Operator'))}">`
      +`<b class="${g.eng.length?'':'z'}">${POSG_ICON.eng}${g.eng.length}</b>`
      +`<b class="${g.oper.length?'':'z'}">${POSG_ICON.oper}${g.oper.length}</b>`
      +(g.other.length?`<b>${POSG_ICON.other}${g.other.length}</b>`:'')+`</em>`;
  };
  const pill=(n,lbl,col,low,arr)=>`<span class="mpp${low?' low':''}${n?'':' zero'}" style="background:${col}">${n}<small>${lbl}</small>${arr?eoTag(arr):''}</span>`;
  let rows='',nLow=0,shown=0;
  days.forEach(iso=>{
    /* Đếm TÁCH KHỐI: nhóm sản xuất A/B/C/D trực ca, nhóm Office làm hành chính.
       Hai khối không cover cho nhau nên định mức chỉ áp cho khối sản xuất. */
    const P=mpBucketsByPool(iso), B=P.prod, V=P.office;
    const lowD=B.D.length<minOfShift('D'), lowN=B.N.length<minOfShift('N'), low=lowD||lowN;
    if(low)nLow++;
    if(repOnlyLow&&!low)return;
    shown++;
    const dw=new Date(iso+'T00:00:00').getDay();
    const nm=x=>esc((x&&x.name)||(x&&x.id)||'');
    const line=(code,arr,tip)=>`<div class="mp-line">${chip(code)}<span class="who"${tip?` title="${esc(tip)}"`:''}>${
      arr.length?arr.map(nm).join(', '):'—'}</span></div>`;
    /* Dòng ca có tách vị trí: tên người xếp thành 2 hàng con Kỹ sư / Operator */
    const lineEO=(code,arr,tip)=>{
      const g=splitEO(arr);
      const sub=(k)=>g[k].length?`<div class="mp-eo-sub ${k}"><i>${POSG_ICON[k]} ${t2(POSG_LABEL[k])} <b>${g[k].length}</b></i><span>${g[k].map(nm).join(', ')}</span></div>`:'';
      if(!arr.length)return line(code,arr,tip);
      return `<div class="mp-line eo">${chip(code)}<span class="who"${tip?` title="${esc(tip)}"`:''}>
        ${sub('eng')}${sub('oper')}${sub('other')}</span></div>`;
    };
    const lvOt=(arr,code)=>arr.length?`<div class="mp-line">${chip(code)}<span class="who">${
      arr.map(x=>nm(x.e)+' ('+x.c+')').join(', ')}</span></div>`:'';
    const nLeave=B.leave.length+V.leave.length, nOt=B.ot.length+V.ot.length;
    rows+=`<div class="mp2-row${iso===todayIso()?' today':''}${low?' low':''}">
      <div class="mp2-main" onclick="this.parentElement.classList.toggle('open')">
        <div class="dt"><div class="d1">${fmtVN(iso)}</div>
          <div class="d2 ${dw===0?'dowSun':dw===6?'dowSat':''}">${dowOf(iso)}${iso===todayIso()?' · '+t2('Hôm nay'):''}</div></div>
        <div class="pillrow">
          ${pill(B.D.length,t2('NGÀY'),'var(--cD)',lowD,B.D)}
          ${pill(B.N.length,t2('ĐÊM'),'var(--cN)',lowN,B.N)}
          ${pill(B.O.length,t2('O SX'),'var(--cO)',false,B.O)}
          ${pill(V.O.length,t2('O VP'),'var(--cSW)',false)}
          ${pill(B.R.length,t2('NGHỈ CA'),'var(--cR)',false)}
          ${pill(nLeave,t2('PHÉP'),'var(--cAL)',false)}
          ${pill(nOt,t2('TĂNG CA'),'var(--cOT)',false)}
        </div>
        ${low?'<span class="st rejected">⚠</span>':''}
        <span class="chev">▼</span>
      </div>
      <div class="mp2-det">
        <div class="mp-pool">${poolChip(POOL_PROD)} ${t2('Khối sản xuất')}</div>
        ${lineEO('D',B.D)}${lineEO('N',B.N)}${lineEO('O',B.O)}
        ${lineEO('R',B.R,'Có thể huy động tăng ca')}
        ${lvOt(B.leave,'AL8')}${lvOt(B.ot,'OTD')}
        <div class="mp-pool">${poolChip(POOL_OFF)} ${t2('Khối văn phòng')}</div>
        ${line('O',V.O)}
        ${lvOt(V.leave,'AL8')}${lvOt(V.ot,'OTD')}
      </div>
    </div>`;
  });
  const head=`<div class="card rep-head">
    <b>${days.length} ngày</b>
    <span class="st ${nLow?'rejected':'approved'}">${nLow?('⚠ '+nLow+' ngày thiếu nhân lực'):'✓ Đủ nhân lực toàn khoảng'}</span>
    <span class="muted sm2">Chạm vào từng ngày để xem danh sách tên · định mức chỉ tính khối sản xuất</span>
    <span class="muted sm2">${POSG_ICON.eng} ${t2('Kỹ sư')} = Field Engineer + DCS Boardman · ${POSG_ICON.oper} ${t2('Operator')}</span></div>`;
  return shown?head+`<div class="mp2">${rows}</div>`
              :head+'<div class="card"><p class="muted">Không có ngày nào khớp bộ lọc.</p></div>';
}

/* =================== 2. THỐNG KÊ ===================
   Bảng nhiều cột số rất khó dò bằng mắt, nên tô màu theo NGHĨA của cột:
   - Ô đếm mã ca dùng đúng nền pastel của mã đó trong bảng lịch (SCHEDBG);
   - Số 0 làm mờ hẳn để mắt bỏ qua, chỉ còn số có ý nghĩa nổi lên;
   - 3 cột giờ: giờ công xanh lá, tăng ca cam, phép xanh dương;
   - Cột Nhóm là chip màu riêng từng nhóm.
   ==================================================== */
/* Ô đếm mã ca: 0 → mờ; >0 → nền pastel đúng màu mã ca */
function stCnt(code,n){
  n=+n||0;
  if(!n)return '<td class="z">0</td>';
  const bg=(typeof SCHEDBG!=='undefined'&&SCHEDBG[code])||'#E2E8F0';
  const tx=(typeof SCHEDTXT!=='undefined'&&SCHEDTXT[code])||'#334155';
  return `<td class="cc" style="background:${bg};color:${tx}">${n}</td>`;
}
/* Ô giờ: 0 → mờ; >0 → giữ nền của lớp (hl / hl-ot / hl-lv) */
function stHr(cls,v){
  v=rnd1(+v||0);
  return v?`<td class="${cls}">${v}</td>`:`<td class="${cls} z0">0</td>`;
}
/* Màu chip cho từng nhóm — cùng tên nhóm luôn ra cùng màu */
const TEAM_TONE=[['#DBEAFE','#1D4ED8'],['#DCFCE7','#15803D'],['#FEF3C7','#B45309'],
                 ['#FCE7F3','#BE185D'],['#E0E7FF','#4338CA'],['#CCFBF1','#0F766E']];
function teamChip(tm){
  const name=String(tm||'').trim();
  if(!name)return '<span class="team-chip" style="background:#F1F5F9;color:#64748B">—</span>';
  let s=0;for(let i=0;i<name.length;i++)s=(s*31+name.charCodeAt(i))>>>0;
  const[bg,fg]=TEAM_TONE[s%TEAM_TONE.length];
  return `<span class="team-chip" style="background:${bg};color:${fg}">${esc(name)}</span>`;
}
function repStatsAll(){
  const rows=statRows(repYm,repGroup);
  if(!rows.length)return '<div class="card"><p class="muted">Chưa có nhân sự / lịch trong kỳ này.</p></div>';
  const sum=f=>rnd1(rows.reduce((a,r)=>a+f(r.s),0));
  const cD=s=>cntShift(s.cnt,'D'),cN=s=>cntShift(s.cnt,'N'),cO=s=>cntShift(s.cnt,'O');
  let h=`<div class="me-stats rep-sum">
    <div class="stat-box"><div class="v">${sum(s=>s.hWork)}</div><div class="k">TỔNG GIỜ CÔNG</div></div>
    <div class="stat-box"><div class="v">${sum(s=>s.hOT)}</div><div class="k">TỔNG GIỜ TĂNG CA</div></div>
    <div class="stat-box"><div class="v">${sum(s=>s.hLeave)}</div><div class="k">TỔNG GIỜ PHÉP</div></div>
    <div class="stat-box"><div class="v">${rows.length}</div><div class="k">NHÂN SỰ</div></div>
  </div>`;
  /* ĐIỆN THOẠI: bảng 15 cột không nhét vừa màn hình → mỗi người MỘT THẺ:
     3 số giờ to (Công/OT/Phép) + dải chip đếm ca (chỉ mã có số > 0). */
  if(isMobile()){
    const cards=rows.map(({e,s})=>{
      const cnts=[['D',cD(s)],['N',cN(s)],['O',cO(s)],['R',s.cnt.R||0],
        ['AL8',s.cnt.AL8||0],['AL4',s.cnt.AL4||0],['NP',s.cnt.NP||0],['OFF',s.cnt.OFF||0],['COM',s.cnt.COM||0]]
        .filter(([,n])=>n>0)
        .map(([c,n])=>`<span class="cnt" style="background:${(typeof SCHEDBG!=='undefined'&&SCHEDBG[c])||'#E2E8F0'};color:${(typeof SCHEDTXT!=='undefined'&&SCHEDTXT[c])||'#334155'}">${c}×${n}</span>`).join('');
      const ot=otShifts(s);
      return `<div class="st-card">
        <div class="h">${teamChip(e.team)}<button type="button" class="st-nm" onclick="openEmpSum('${e.id}')">${esc(e.name||e.id)}</button><i>${esc(posLabel(posCode(e)))}</i></div>
        <div class="nums">
          <span class="n hl">${rnd1(s.hWork)}<small>h ${t('công')}</small></span>
          <span class="n hl-ot">${rnd1(s.hOT)}<small>h OT${ot?' ('+ot+')':''}</small></span>
          <span class="n hl-lv">${rnd1(s.hLeave)}<small>h ${t('phép')}</small></span>
        </div>
        ${cnts?`<div class="cnts">${cnts}</div>`:''}
      </div>`;
    }).join('');
    h+=`<div class="st-cards">${cards}</div>
      <p class="muted sm2" style="margin-top:8px">${t('Tính theo lịch thực tế (chuẩn + điều chỉnh + đơn đã duyệt). Số giờ mỗi mã ca khai ở tab Dữ liệu.')}</p>`;
    return h;
  }
  /* ============================================================
     BẢNG CỘT KHOÁ CỨNG — tiêu đề và thân sinh từ CÙNG một mảng ST_COLS,
     colgroup + table-layout:fixed ép mọi hàng đúng độ rộng từng cột.
     Trình duyệt không thể tự co giãn làm số lệch khỏi tiêu đề.
     ============================================================ */
  const ST_COLS=[
    {l:'Nhóm',    w:64, cls:'l',   get:({e})=>teamChip(e.team)},
    /* Bấm vào tên → bảng tổng hợp cả kỳ của riêng người đó (openEmpSum) */
    {l:'Họ tên',  w:170,cls:'l',   get:({e})=>`<button type="button" class="st-nm" onclick="openEmpSum('${e.id}')" title="${t('Xem tổng hợp cả kỳ của người này')}">${esc(e.name||e.id)}</button>`},
    {l:'Vị trí',  w:135,cls:'l pos',get:({e})=>esc(posLabel(posCode(e))),
                  tot:()=>'TỔNG CỘNG'},
    {l:'D',   w:46,hd:'g-sh',get:({s})=>stCnt('D',cD(s)),  tot:()=>rows.reduce((a,r)=>a+cD(r.s),0)},
    {l:'N',   w:46,hd:'g-sh',get:({s})=>stCnt('N',cN(s)),  tot:()=>rows.reduce((a,r)=>a+cN(r.s),0)},
    {l:'O',   w:46,hd:'g-sh',get:({s})=>stCnt('O',cO(s)),  tot:()=>rows.reduce((a,r)=>a+cO(r.s),0)},
    {l:'R',   w:46,hd:'g-sh',get:({s})=>stCnt('R',s.cnt.R),tot:()=>rows.reduce((a,r)=>a+(r.s.cnt.R||0),0)},
    {l:'AL8', w:46,hd:'g-lv',get:({s})=>stCnt('AL8',s.cnt.AL8),tot:()=>rows.reduce((a,r)=>a+(r.s.cnt.AL8||0),0)},
    {l:'AL4', w:46,hd:'g-lv',get:({s})=>stCnt('AL4',s.cnt.AL4),tot:()=>rows.reduce((a,r)=>a+(r.s.cnt.AL4||0),0)},
    {l:'NP',  w:46,hd:'g-lv',get:({s})=>stCnt('NP',s.cnt.NP),  tot:()=>rows.reduce((a,r)=>a+(r.s.cnt.NP||0),0)},
    {l:'OFF', w:46,hd:'g-lv',get:({s})=>stCnt('OFF',s.cnt.OFF),tot:()=>rows.reduce((a,r)=>a+(r.s.cnt.OFF||0),0)},
    {l:'Ca OT',w:52,hd:'g-ot',get:({s})=>stCnt('OTD',otShifts(s)),tot:()=>rows.reduce((a,r)=>a+otShifts(r.s),0)},
    {l:'Giờ công',w:74,hd:'hl',   get:({s})=>stHr('hl',s.hWork),    tot:()=>`<td class="hl">${sum(s=>s.hWork)}</td>`,raw:true},
    {l:'Giờ OT', w:64,hd:'hl-ot', get:({s})=>stHr('hl-ot',s.hOT),   tot:()=>`<td class="hl-ot">${sum(s=>s.hOT)}</td>`,raw:true},
    {l:'Giờ phép',w:70,hd:'hl-lv',get:({s})=>stHr('hl-lv',s.hLeave),tot:()=>`<td class="hl-lv">${sum(s=>s.hLeave)}</td>`,raw:true}
  ];
  /* stCnt/stHr trả sẵn <td>…</td>; cột chữ thì bọc ở đây — mỗi hàng LUÔN đúng ST_COLS.length ô */
  const cellOf=(c,row)=>{const v=c.get(row);return v.startsWith('<td')?v:`<td class="${c.cls||''}">${v}</td>`;};
  h+='<div class="card stbl stbl-fix"><table>'
    +'<colgroup>'+ST_COLS.map(c=>`<col style="width:${c.w}px">`).join('')+'</colgroup>'
    +'<thead><tr>'+ST_COLS.map(c=>`<th class="${c.hd||c.cls||''}">${c.l}</th>`).join('')+'</tr></thead><tbody>';
  rows.forEach(row=>{h+='<tr>'+ST_COLS.map(c=>cellOf(c,row)).join('')+'</tr>';});
  h+='</tbody><tfoot><tr>'+ST_COLS.map((c,i)=>{
    if(i<2)return '<td class="l"></td>';
    if(!c.tot)return '<td></td>';
    const v=c.tot();
    return (c.raw)?v:`<td class="${c.cls||''}">${v}</td>`;
  }).join('')+'</tr></tfoot></table></div>';
  h+=`<div class="stbl-key"><span class="lbl">Chú giải màu:</span>
    ${['D','N','O','R'].map(c=>`<span class="k-it" style="background:${SCHEDBG[c]};color:${SCHEDTXT[c]}">${c}</span>`).join('')}
    <span class="k-sep"></span>
    ${['AL8','AL4','NP','OFF'].map(c=>`<span class="k-it" style="background:${SCHEDBG[c]};color:${SCHEDTXT[c]}">${c}</span>`).join('')}
    <span class="k-sep"></span>
    <span class="k-it" style="background:${SCHEDBG.OTD};color:${SCHEDTXT.OTD}">OT</span>
    <span class="k-sep"></span>
    <span class="k-it hl">Giờ công</span><span class="k-it hl-ot">Giờ OT</span><span class="k-it hl-lv">Giờ phép</span></div>`;
  h+=`<p class="muted sm2" style="margin-top:8px">Tính theo lịch thực tế (chuẩn + điều chỉnh + đơn đã duyệt). Số giờ mỗi mã ca khai ở tab Dữ liệu.</p>`;
  return h;
}
/* ============================================================
   BẢNG TỔNG HỢP CẢ KỲ CỦA MỘT NGƯỜI  (bấm vào tên ở Bảng công tổng hợp)
   Gộp mọi thứ người duyệt cần biết về một nhân viên trong kỳ vào một chỗ:
   số giờ · đếm ca · từng ngày · các lần tăng ca · đơn đã gửi trong kỳ.
   Tất cả tính từ dữ liệu đã có sẵn trong bộ nhớ (eff/calcStats/S.requests) —
   KHÔNG tải thêm gì từ Firebase.
   ============================================================ */
let esId='', esYm='';
function esPeriod(){return esYm||repYm||curSchedMonth();}
function openEmpSum(id){
  if(!id)return;
  esId=id;esYm=repYm||curSchedMonth();
  const m=$('empSumMask');if(!m)return;
  m.classList.add('on');
  renderEmpSum();
}
function closeEmpSum(){const m=$('empSumMask');if(m)m.classList.remove('on');esId='';}
function esShiftYm(delta){
  const ym=esPeriod();let a=ym.split('-').map(Number),y=a[0],mo=a[1]+delta;
  while(mo<1){mo+=12;y--;}while(mo>12){mo-=12;y++;}
  esYm=y+'-'+pad(mo);renderEmpSum();
}
/* Nhảy sang danh sách đơn của đúng người này */
function esGoRequests(){
  const e=empById(esId);
  closeEmpSum();
  if(typeof apprFilter==='undefined'||typeof apprSetTab!=='function')return;
  Object.assign(apprFilter,{status:'__all',type:'__all',print:'__all',flag:'',
    q:(e&&e.name)||esId,ym:esPeriod(),from:'',to:''});
  apprSetTab('list');
  if(typeof go==='function')go('appr');
}
function renderEmpSum(){
  const box=$('empSumBody'),id=esId;if(!box||!id)return;
  const e=empById(id)||{id,name:id};
  const ym=esPeriod(),per=periodFor(ym),days=daysOfPeriod(ym),today=todayIso();
  const s=calcStats(id,days);
  const cD=cntShift(s.cnt,'D'),cN=cntShift(s.cnt,'N'),cO=cntShift(s.cnt,'O');
  const ot=(typeof otSummary==='function')?otSummary(id,ym):{approved:s.hOT,pending:0};
  const left=(typeof alLeft==='function')?alLeft(id):0;
  const leaveDays=Object.entries(s.cnt).filter(([c])=>codeInfo(c).cat==='leave')
    .reduce((a,[c,n])=>a+((typeof alDayValue==='function'?alDayValue(c):1)||1)*n,0);

  /* --- đếm theo mã ca --- */
  const cnts=Object.entries(s.cnt).sort((a,b)=>b[1]-a[1])
    .map(([c,n])=>`<span class="cnt" style="background:${(typeof SCHEDBG!=='undefined'&&SCHEDBG[c])||'#E2E8F0'};color:${(typeof SCHEDTXT!=='undefined'&&SCHEDTXT[c])||'#334155'}">${esc(c)}×${n}</span>`).join('');

  /* --- từng ngày --- */
  const rows=days.map(iso=>{
    const r=eff(id,iso),c=r.code;if(!c)return '';
    const ci=codeInfo(c),h=effHours(id,iso);
    const sp=comboSplitHours(c,h);
    const hw=sp?sp.work:((ci.cat==='work'||ci.cat==='swap')?h:0),
          ho=sp?sp.ot:(ci.cat==='ot'?h:0),
          hl=sp?0:(ci.cat==='leave'?h:0);
    const std=(S.base[id]||{})[iso]||'';
    const prov=r.o&&r.o.prov;
    return `<tr class="${iso<=today?'':'fut'}">
      <td>${fmtVN(iso)} <span class="muted">${dowOf(iso)}</span></td>
      <td>${chip(c)}${prov?' <span class="mini-prov" title="'+t('Tạm duyệt, chờ Quản lý người Hàn chốt')+'">~</span>':''}
        ${std&&std!==c?`<em class="chg" title="${t('Lịch chuẩn')}: ${esc(std)}">⇄${esc(std)}</em>`:''}</td>
      <td class="num">${hw?rnd1(hw):''}</td>
      <td class="num ot">${ho?rnd1(ho):''}</td>
      <td class="num lv">${hl?rnd1(hl):''}</td></tr>`;
  }).filter(Boolean).join('');

  /* --- các lần tăng ca trong kỳ --- */
  const otRows=days.map(iso=>{
    const c=eff(id,iso).code;if(!c)return null;
    const sp=comboSplitHours(c,effHours(id,iso));
    if(sp)return {iso,code:c,h:sp.ot};           // ca kép: chỉ tính phần tăng ca
    if(codeInfo(c).cat!=='ot')return null;
    return {iso,code:c,h:effHours(id,iso)};
  }).filter(Boolean);

  /* --- đơn đã gửi trong kỳ (mọi loại, mọi trạng thái) --- */
  const reqs=Object.values(S.requests||{})
    .filter(r=>r&&(r.empId===id||r.withId===id)&&reqInRange(r,per.from,per.to))
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const reqRows=reqs.map(r=>`<div class="ds-req ${r.status}">
      <span class="ic">${REQ_ICON[r.type]||'📄'}</span>
      <span class="tx"><b>${esc(REQ_LABEL[r.type]||r.type)}</b>
        <i>${r.type==='multi'?fmtVN(r.from)+' → '+fmtVN(r.to)
             :reqDays(r).map(d=>fmtVN(d.iso)+(d.code?' ('+d.code+')':'')).join(' · ')}</i>
        ${r.withId?`<i>${t('với')} ${esc(shortName((empById(r.withId)||{}).name||r.withId))}</i>`:''}
        ${r.coverId&&typeof reqCoverChip==='function'?`<i>${reqCoverChip(r)}</i>`:''}
        ${r.note?`<i>“${esc(r.note)}”</i>`:''}</span>
      <span class="st ${reqStatusClass(r)}">${reqStatusLabel(r)}</span>
    </div>`).join('');

  box.innerHTML=`
    <div class="es-head">
      <div class="es-who">
        <div class="es-nm">${teamChip(e.team)}<b>${esc(e.name||id)}</b></div>
        <div class="es-sub">${esc(posLabel(posCode(e)))} · ${t('Mã NV')} ${esc(id)}${
          e.joinAt?' · '+t('vào làm')+' '+fmtVN(e.joinAt):''}</div>
      </div>
      <button class="ds-x" onclick="closeEmpSum()">✕</button>
    </div>
    <div class="es-nav">
      <button class="btn sec sm" onclick="esShiftYm(-1)">◀</button>
      <b>${esc(per.label)}</b>
      <button class="btn sec sm" onclick="esShiftYm(1)">▶</button>
      <span class="sp"></span>
      <button class="btn sec sm" onclick="esYm='';renderEmpSum()">${t('Kỳ hiện tại')}</button>
    </div>

    <div class="mp-sum-kpi es-kpi">
      <div class="k"><div class="v">${rnd1(s.hWork)}<i>h</i></div><span>${t('Giờ công')}</span></div>
      <div class="k ot"><div class="v">${rnd1(s.hOT)}<i>h</i></div><span>${t('Giờ tăng ca')} (${otRows.length})</span></div>
      <div class="k lv"><div class="v">${rnd1(leaveDays)}<i>${t('ngày')}</i></div><span>${t('Nghỉ phép')}</span></div>
      <div class="k al"><div class="v">${rnd1(left)}<i>${t('ngày')}</i></div><span>${t('Phép năm còn lại')}</span></div>
    </div>

    <div class="stbl stbl-col es-cnt"><table><thead><tr>
      <th class="g-sh">D</th><th class="g-sh">N</th><th class="g-sh">O</th><th class="g-sh">R</th>
      <th class="g-lv">AL8</th><th class="g-lv">AL4</th><th class="g-lv">NP</th><th class="g-lv">OFF</th><th class="g-ot">${t('Ca OT')}</th>
    </tr></thead><tbody><tr>
      ${stCnt('D',cD)}${stCnt('N',cN)}${stCnt('O',cO)}${stCnt('R',s.cnt.R)}
      ${stCnt('AL8',s.cnt.AL8)}${stCnt('AL4',s.cnt.AL4)}${stCnt('NP',s.cnt.NP)}${stCnt('OFF',s.cnt.OFF)}
      ${stCnt('OTD',otShifts(s))}</tr></tbody></table></div>
    ${cnts?`<div class="es-chips">${cnts}</div>`:''}
    ${ot.pending?`<p class="pv-alert info sm">${t('Còn')} ${rnd1(ot.pending)}h ${t('tăng ca đang chờ duyệt.')}</p>`:''}

    <div class="ds-block"><h4>⚡ ${t('Các lần tăng ca')} (${otRows.length} · ${rnd1(s.hOT)}h)</h4>
      ${otRows.length?`<div class="ot-list">${otRows.map(x=>`<div class="ot-row">
          <span class="d">${dowOf(x.iso)} ${fmtVNfull(x.iso)}</span>${chip(x.code)}<span class="h">${rnd1(x.h)}h</span>
        </div>`).join('')}</div>`
        :`<p class="muted">${t('Kỳ này chưa có ca tăng ca nào được duyệt.')}</p>`}
    </div>

    <div class="ds-block"><h4>📋 ${t('Đơn trong kỳ')} (${reqs.length})</h4>
      ${reqRows||`<p class="muted">${t('Kỳ này người này chưa gửi đơn nào.')}</p>`}
      ${reqs.length&&typeof canAppr==='function'&&canAppr()
        ?`<button class="btn sec sm" style="margin-top:8px" onclick="esGoRequests()">${t('Mở trong Danh sách đơn')} ›</button>`:''}
    </div>

    <div class="ds-block"><h4>🗓 ${t('Chi tiết từng ngày')}</h4>
      <table class="tbl mp-sum-tbl">
        <colgroup><col><col style="width:96px"><col style="width:17%"><col style="width:15%"><col style="width:17%"></colgroup>
        <thead><tr><th>${t('Ngày')}</th><th>${t('Mã')}</th><th class="num">${t('Công')}</th>
          <th class="num">OT</th><th class="num">${t('Phép')}</th></tr></thead>
        <tbody>${rows||`<tr><td colspan="5" class="muted">${t('Kỳ này chưa có dữ liệu.')}</td></tr>`}
          <tr class="sum-total"><td colspan="2">${t('Tổng')}</td><td class="num">${rnd1(s.hWork)}</td>
            <td class="num ot">${rnd1(s.hOT)}</td><td class="num lv">${rnd1(s.hLeave)}</td></tr>
        </tbody></table>
      <p class="muted sm2" style="margin-top:6px">${t('Tính theo lịch thực tế (chuẩn + điều chỉnh + đơn đã duyệt). Ô có ⇄ là ngày khác lịch chuẩn.')}</p>
    </div>`;
}

/* Nhân viên thường: chỉ số liệu của chính mình */
function repStatsMe(){
  const id=meId();if(!id)return '<div class="card"><p class="muted">Đăng nhập để xem.</p></div>';
  const e=empById(id)||{};
  const days=daysOfPeriod(repYm), s=calcStats(id,days);
  const ot=otSummary(id,repYm);
  const cD=cntShift(s.cnt,'D'),cN=cntShift(s.cnt,'N'),cO=cntShift(s.cnt,'O');
  const left=alLeft(id);
  return `<div class="me-stats rep-sum">
      <div class="stat-box"><div class="v">${rnd1(s.hWork)}</div><div class="k">GIỜ CÔNG</div></div>
      <div class="stat-box"><div class="v">${rnd1(s.hOT)}</div><div class="k">GIỜ TĂNG CA</div></div>
      <div class="stat-box"><div class="v">${rnd1(s.hLeave)}</div><div class="k">GIỜ PHÉP</div></div>
      <div class="stat-box"><div class="v">${rnd1(left)}</div><div class="k">PHÉP NĂM CÒN LẠI</div></div>
    </div>
    <div class="card"><h3 class="rep-h3">${esc(e.name||id)} · ${esc(periodFor(repYm).label)}</h3>
      <div class="stbl stbl-col"><table><thead><tr><th class="g-sh">Ca ngày D</th><th class="g-sh">Ca đêm N</th><th class="g-sh">Văn phòng O</th><th class="g-sh">Nghỉ ca R</th>
        <th class="g-lv">AL8</th><th class="g-lv">AL4</th><th class="g-lv">NP</th><th class="g-lv">OFF</th><th class="g-ot">Ca OT</th></tr></thead>
        <tbody><tr>${stCnt('D',cD)}${stCnt('N',cN)}${stCnt('O',cO)}${stCnt('R',s.cnt.R)}
        ${stCnt('AL8',s.cnt.AL8)}${stCnt('AL4',s.cnt.AL4)}${stCnt('NP',s.cnt.NP)}${stCnt('OFF',s.cnt.OFF)}
        ${stCnt('OTD',otShifts(s))}</tr></tbody></table></div>
      ${ot.pending?`<p class="muted sm2" style="margin-top:8px">Còn ${rnd1(ot.pending)}h tăng ca đang chờ duyệt.</p>`:''}
    </div>
    <p class="muted sm2">Bạn chỉ xem được số liệu của mình. Số liệu cả tổ do quản lý xem.</p>`;
}

/* =================== 3. BIỂU ĐỒ (đã gộp làm MỘT) ===================
   Trước đây tab Biểu đồ có 2 khối tách rời: khối biểu đồ cố định của cả kỳ
   và khối "Tổng hợp cá nhân / nhóm". Nay gộp thành MỘT bảng duy nhất:
   chọn phạm vi (tháng/quý/năm) + nhóm/cá nhân, rồi TÍCH CHỌN các biểu đồ
   muốn xem (nhiều loại cùng lúc). Nhân viên thường chỉ xem của mình. */
function repCharts(){return repPersonal();}

/* ============================================================
   TỔNG HỢP CÁ NHÂN / NHÓM — bảng biểu đồ hợp nhất
   ============================================================ */
let repPMode='month';           // 'month' | 'quarter' | 'year'
let repPSel='';                 // 'YYYY-MM' | 'YYYY-Qn' | 'YYYY'
let repPTeams=[];               // các nhóm đã tích
let repPIds=[];                 // các cá nhân đã tích
let repPQuery='';               // ô tìm tên
/* Các biểu đồ được tích để hiển thị (chọn nhiều) */
const REPP_VIEWS=[
  ['hours','📊 Giờ công theo người'],
  ['mix','🍩 Cơ cấu ca'],
  ['otTeam','⚡ Tăng ca theo nhóm'],
  ['trend','📈 Diễn biến theo kỳ']
];
let repPViews={hours:true,mix:true,otTeam:true,trend:true};
function repPToggleView(k){repPViews[k]=!repPViews[k];renderReport();}

function repPSetMode(m){repPMode=m;repPSel='';renderReport();}
function repPSetSel(v){repPSel=v;renderReport();}
function repPToggleTeam(tm){
  const i=repPTeams.indexOf(tm);
  if(i<0)repPTeams.push(tm);else repPTeams.splice(i,1);
  renderReport();
}
function repPToggleId(id){
  const i=repPIds.indexOf(id);
  if(i<0)repPIds.push(id);else repPIds.splice(i,1);
  renderReport();
}
function repPClear(){repPTeams=[];repPIds=[];repPQuery='';renderReport();}
/* Gõ tìm tên: chỉ vẽ lại danh sách kết quả, không vẽ cả trang (giữ con trỏ gõ) */
function repPFilter(v){
  repPQuery=v||'';
  const box=$('repPList');if(box)box.innerHTML=repPListHtml();
}
function repPListHtml(){
  const q=noAccent(repPQuery);
  if(!q)return '';
  const list=schedEmps().filter(e=>noAccent(e.name||'').includes(q)||noAccent(e.id).includes(q)).slice(0,20);
  if(!list.length)return '<p class="muted sm2" style="padding:4px 2px">Không tìm thấy ai khớp.</p>';
  return list.map(e=>`<button type="button" class="fchip${repPIds.includes(e.id)?' on':''}" onclick="repPToggleId('${e.id}')">
    ${esc(shortName(e.name)||e.id)}<i>${esc(teamShort(e.team||'')||'—')}</i></button>`).join('');
}

/* Các lựa chọn kỳ theo chế độ */
function repPOptions(){
  const ms=monthsAvailable();
  if(repPMode==='month')return ms.map(m=>({v:m,label:periodFor(m).label}));
  if(repPMode==='quarter'){
    const set=[];
    ms.forEach(m=>{const[y,mo]=m.split('-').map(Number);const q=Math.ceil(mo/3);const v=y+'-Q'+q;
      if(!set.some(x=>x.v===v))set.push({v,label:'Quý '+q+'/'+y});});
    return set;
  }
  const ys=[...new Set(ms.map(m=>m.slice(0,4)))];
  return ys.map(y=>({v:y,label:'Năm '+y}));
}
/* Danh sách kỳ công (ym) nằm trong lựa chọn hiện tại */
function repPMonths(){
  const ms=monthsAvailable();
  if(repPMode==='month')return repPSel?[repPSel]:[];
  if(repPMode==='quarter'){
    if(!repPSel)return [];
    const[y,q]=repPSel.split('-Q');
    return ms.filter(m=>{const[yy,mo]=m.split('-').map(Number);return String(yy)===y&&Math.ceil(mo/3)===+q;});
  }
  return repPSel?ms.filter(m=>m.slice(0,4)===repPSel):[];
}
function repPEmps(){
  if(!repSeeAll()){const e=empById(meId());return e?[e]:[];}
  let out=[];
  if(repPTeams.length)out=schedEmps().filter(e=>repPTeams.includes(e.team||''));
  repPIds.forEach(id=>{if(!out.some(e=>e.id===id)){const e=empById(id);if(e)out.push(e);}});
  if(!out.length)out=schedEmps();
  return out;
}

function repPersonal(){
  const opts=repPOptions();
  if(!repPSel||!opts.some(o=>o.v===repPSel))repPSel=opts.length?opts[opts.length-1].v:'';
  const months=repPMonths();
  const emps=repPEmps();
  const seeAll=repSeeAll();
  const selLbl=(opts.find(o=>o.v===repPSel)||{}).label||'';

  /* --- thanh điều khiển --- */
  let h=`<div class="card repp"><h3 class="rep-h3">📌 Tổng hợp ${seeAll?'cá nhân / nhóm':'của tôi'} theo tháng · quý · năm</h3>
  <div class="rep-ctl" style="margin-bottom:10px">
    <div class="seg">
      <button class="${repPMode==='month'?'on':''}" onclick="repPSetMode('month')">Tháng</button>
      <button class="${repPMode==='quarter'?'on':''}" onclick="repPSetMode('quarter')">Quý</button>
      <button class="${repPMode==='year'?'on':''}" onclick="repPSetMode('year')">Năm</button>
    </div>
    <select class="inp sm" style="font-weight:700" onchange="repPSetSel(this.value)">
      ${opts.map(o=>`<option value="${o.v}"${o.v===repPSel?' selected':''}>${esc(o.label)}</option>`).join('')}
    </select>
  </div>`;
  if(seeAll){
    const teams=teamList();
    h+=`<div class="repp-pick">
      <div class="repp-row"><span class="lbl">Nhóm:</span>
        ${teams.map(tm=>`<button type="button" class="fchip${repPTeams.includes(tm)?' on':''}" onclick="repPToggleTeam('${esc(tm)}')">Nhóm ${esc(tm||'(chưa phân)')}</button>`).join('')||'<span class="muted sm2">Chưa có nhóm.</span>'}
      </div>
      <div class="repp-row"><span class="lbl">Cá nhân:</span>
        <input class="inp sm" style="min-width:170px" placeholder="Gõ tên để tìm… (không dấu cũng được)"
          value="${esc(repPQuery)}" oninput="repPFilter(this.value)">
        ${(repPTeams.length||repPIds.length)?`<button type="button" class="btn sec sm" onclick="repPClear()">✕ Bỏ chọn hết</button>`:''}
      </div>
      <div class="repp-row wrap" id="repPList">${repPListHtml()}</div>
      ${repPIds.length?`<div class="repp-row wrap"><span class="lbl">Đã chọn:</span>
        ${repPIds.map(id=>{const e=empById(id)||{};return `<button type="button" class="fchip on" onclick="repPToggleId('${id}')">${esc(shortName(e.name)||id)} ✕</button>`;}).join('')}
      </div>`:''}
      <details class="xp"><summary>${t('Giải thích')}</summary><div class="xp-b">Không tích gì = xem cả tổ. Tích nhóm và / hoặc từng người để gộp số liệu đúng phạm vi cần xem.</div></details>
    </div>`;
  }

  /* --- Chọn biểu đồ muốn xem (tích nhiều loại cùng lúc) --- */
  h+=`<div class="repp-row wrap" style="margin-bottom:4px"><span class="lbl">Biểu đồ:</span>
    ${REPP_VIEWS.map(([k,l])=>`<button type="button" class="fchip${repPViews[k]?' on':''}" onclick="repPToggleView('${k}')">${repPViews[k]?'✓ ':''}${esc(l)}</button>`).join('')}
  </div></div>`;   // đóng .card repp phần điều khiển

  if(!months.length){return h+`<div class="card">${chEmpty('Chưa có dữ liệu lịch cho lựa chọn này.')}</div>`;}

  /* --- số liệu gộp --- */
  const allDays=[].concat(...months.map(m=>daysOfPeriod(m)));
  const ids=emps.map(e=>e.id);
  let hW=0,hO=0,hL=0;
  const perRows=emps.map(e=>{const s=calcStats(e.id,allDays);hW+=s.hWork;hO+=s.hOT;hL+=s.hLeave;return{e,s};});
  h+=`<div class="card"><div class="me-stats rep-sum" style="margin-bottom:0">
    <div class="stat-box"><div class="v">${rnd1(hW)}</div><div class="k">GIỜ CÔNG · ${esc(selLbl)}</div></div>
    <div class="stat-box"><div class="v">${rnd1(hO)}</div><div class="k">GIỜ TĂNG CA</div></div>
    <div class="stat-box"><div class="v">${rnd1(hL)}</div><div class="k">GIỜ PHÉP</div></div>
    <div class="stat-box"><div class="v">${emps.length}</div><div class="k">NHÂN SỰ</div></div>
  </div></div>`;

  const anyView=REPP_VIEWS.some(([k])=>repPViews[k]);
  if(!anyView)return h+`<div class="card">${chEmpty('Chưa chọn biểu đồ nào — tích ít nhất một loại ở trên.')}</div>`;

  /* --- Giờ công theo người (hoặc bảng chi tiết khi chỉ 1 người) --- */
  if(repPViews.hours){
    if(emps.length>1){
      h+=`<div class="card"><h3 class="rep-h3">Giờ công theo người · ${esc(selLbl)}</h3>${chartHoursByEmp(emps,allDays)}</div>`;
    }else if(emps.length===1){
      const s=perRows[0].s;
      const cD=cntShift(s.cnt,'D'),cN=cntShift(s.cnt,'N'),cO=cntShift(s.cnt,'O');
      h+=`<div class="card"><h3 class="rep-h3">Chi tiết ${esc(shortName(perRows[0].e.name)||perRows[0].e.id)} · ${esc(selLbl)}</h3>
        <div class="stbl"><table><thead>
        <tr><th>Ca ngày D</th><th>Ca đêm N</th><th>Văn phòng O</th><th>Nghỉ ca R</th><th>Nghỉ phép</th><th>Ca OT</th></tr></thead>
        <tbody><tr><td>${cD}</td><td>${cN}</td><td>${cO}</td><td>${s.cnt.R||0}</td>
        <td>${Object.entries(s.cnt).filter(([c])=>codeInfo(c).cat==='leave').reduce((a,[,n])=>a+n,0)}</td>
        <td>${otShifts(s)}</td></tr></tbody></table></div></div>`;
    }
  }

  /* --- Cơ cấu ca + Tăng ca theo nhóm: xếp cạnh nhau nếu cùng bật --- */
  const mixCard=repPViews.mix?`<div class="card"><h3 class="rep-h3">Cơ cấu ca · ${esc(selLbl)}</h3>${chartMix(ids,allDays)}</div>`:'';
  const otCard=repPViews.otTeam?`<div class="card"><h3 class="rep-h3">Giờ tăng ca theo nhóm · ${esc(selLbl)}</h3>${chartOtByTeam(emps,allDays)}</div>`:'';
  if(mixCard&&otCard)h+=`<div class="grid2 rep-grid2">${mixCard}${otCard}</div>`;
  else h+=mixCard+otCard;

  /* --- Diễn biến theo kỳ --- */
  if(repPViews.trend){
    let mm=months;
    // Ở chế độ "tháng" chỉ có 1 kỳ → cho xem xu hướng 6 kỳ gần nhất cho có ý nghĩa
    if(mm.length<2)mm=monthsAvailable().slice(-6);
    if(mm.length>1){
      const w=[],o=[],l=[];
      mm.forEach(m=>{
        const ds=daysOfPeriod(m);let a=0,b=0,c=0;
        ids.forEach(id=>{const s=calcStats(id,ds);a+=s.hWork;b+=s.hOT;c+=s.hLeave;});
        w.push(rnd1(a));o.push(rnd1(b));l.push(rnd1(c));
      });
      h+=`<div class="card"><h3 class="rep-h3">Diễn biến theo kỳ công</h3>`+chartStacked(
        mm.map(m=>{const p=periodFor(m);return 'T'+p.m+'/'+String(p.y).slice(2);}),
        [{name:'Giờ công',color:'#0B3B5C',data:w},
         {name:'Giờ tăng ca',color:'#D9534F',data:o},
         {name:'Giờ phép',color:'#C77DBB',data:l}],{h:190})+`</div>`;
    }
  }
  return h;
}

/* ============================================================
   BỘ VẼ BIỂU ĐỒ BẰNG SVG THUẦN
   Không dùng thư viện ngoài → mở offline vẫn chạy, in ra vẫn nét.
   ============================================================ */
const CH={pad:{l:34,r:8,t:10,b:26},font:10};
function chEsc(s){return esc(s);}
function chLegend(items){
  return `<div class="ch-legend">${items.map(i=>
    `<span><i style="background:${i.color}"></i>${chEsc(t(i.name))}</span>`).join('')}</div>`;
}
function chEmpty(msg){return `<p class="muted sm2" style="padding:10px 2px">${chEsc(msg||'Chưa có số liệu.')}</p>`;}

/* Cột chồng theo ngày + đường định mức */
function chartStacked(labels,series,opt){
  opt=opt||{};
  const n=labels.length;if(!n)return chEmpty();
  const W=Math.max(560,n*22+CH.pad.l+CH.pad.r), H=opt.h||210;
  const iw=W-CH.pad.l-CH.pad.r, ih=H-CH.pad.t-CH.pad.b;
  let max=0;
  for(let i=0;i<n;i++){let s=0;series.forEach(se=>s+=(se.data[i]||0));if(s>max)max=s;}
  (opt.ref||[]).forEach(r=>{if(r.v>max)max=r.v;});
  max=Math.max(1,Math.ceil(max*1.15));
  const bw=Math.max(6,Math.min(22,iw/n*0.68));
  const x=i=>CH.pad.l+iw*(i+0.5)/n;
  const y=v=>CH.pad.t+ih-(v/max)*ih;
  let g='';
  // lưới ngang
  const step=Math.max(1,Math.ceil(max/4));
  for(let v=0;v<=max;v+=step){
    g+=`<line x1="${CH.pad.l}" y1="${y(v)}" x2="${W-CH.pad.r}" y2="${y(v)}" stroke="#E8EDF3"/>`
      +`<text x="${CH.pad.l-5}" y="${y(v)+3}" text-anchor="end" font-size="${CH.font-1}" fill="#94A3B8">${v}</text>`;
  }
  // cột chồng
  for(let i=0;i<n;i++){
    let acc=0;
    series.forEach(se=>{
      const v=se.data[i]||0;if(!v)return;
      const y1=y(acc+v),y2=y(acc);
      g+=`<rect x="${(x(i)-bw/2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5,y2-y1).toFixed(1)}" fill="${se.color}"><title>${chEsc(labels[i]+' · '+t(se.name)+': '+v)}</title></rect>`;
      acc+=v;
    });
  }
  // đường định mức
  (opt.ref||[]).forEach(r=>{
    g+=`<line x1="${CH.pad.l}" y1="${y(r.v)}" x2="${W-CH.pad.r}" y2="${y(r.v)}" stroke="${r.color}" stroke-width="1.2" stroke-dasharray="5 3"/>`
      +`<text x="${W-CH.pad.r-2}" y="${y(r.v)-3}" text-anchor="end" font-size="${CH.font-1}" fill="${r.color}" font-weight="700">${chEsc(r.label)}</text>`;
  });
  // nhãn trục X (thưa bớt nếu nhiều ngày)
  const every=n>24?3:(n>14?2:1);
  for(let i=0;i<n;i++){
    if(i%every)continue;
    g+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle" font-size="${CH.font-1}" fill="#64748B">${chEsc(labels[i])}</text>`;
  }
  return `<div class="ch-scroll"><svg viewBox="0 0 ${W} ${H}" style="width:${W>640?W+'px':'100%'};max-width:none;height:${H}px" role="img">${g}</svg></div>`
    +chLegend(series.concat((opt.ref||[]).map(r=>({name:r.label,color:r.color}))));
}

/* Thanh ngang NỐI TIẾP: mỗi người một thanh duy nhất, các loại giờ xếp liền
   nhau trong cùng thanh — gọn hơn nhiều so với tách mỗi loại một thanh. */
function chartStackedH(rows,series,opt){
  opt=opt||{};
  const n=rows.length;if(!n)return chEmpty();
  const barH=opt.barH||18, rowH=barH+11;
  const lw=opt.labelW||150, valW=58, W=940;
  let max=0;rows.forEach(r=>{let s=0;series.forEach(x=>s+=(x.get(r)||0));if(s>max)max=s;});
  max=Math.max(1,max);
  const iw=W-lw-valW-10, H=n*rowH+12;
  let g='';
  // vạch lưới dọc
  const pw=Math.pow(10,Math.floor(Math.log10(max)));
  const step=pw*(max/pw>5?2:1);
  for(let v=step;v<=max;v+=step){
    const x=lw+(v/max)*iw;
    g+=`<line x1="${x.toFixed(1)}" y1="2" x2="${x.toFixed(1)}" y2="${H-8}" stroke="#EDF1F5"/>`
      +`<text x="${x.toFixed(1)}" y="${H-1}" text-anchor="middle" font-size="9.5" fill="#B6C2CE">${v}</text>`;
  }
  rows.forEach((r,i)=>{
    const y0=i*rowH+5;
    if(i%2===0)g+=`<rect x="0" y="${y0-4}" width="${W}" height="${rowH}" fill="#FAFCFE"/>`;
    g+=`<text x="${lw-8}" y="${y0+barH/2+4}" text-anchor="end" font-size="12" font-weight="600" fill="#0F172A">${chEsc(opt.label(r))}</text>`;
    let acc=0,tot=0;
    series.forEach(sr=>{
      const v=sr.get(r)||0;if(v<=0)return;
      const x=lw+(acc/max)*iw, w=Math.max(1.5,(v/max)*iw);
      g+=`<rect x="${x.toFixed(1)}" y="${y0}" width="${w.toFixed(1)}" height="${barH}" fill="${sr.color}"><title>${
        chEsc(opt.label(r)+' · '+t(sr.name)+': '+rnd1(v))}</title></rect>`;
      // ghi số ngay trong đoạn nếu đủ rộng
      if(w>26)g+=`<text x="${(x+w/2).toFixed(1)}" y="${y0+barH/2+4}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">${rnd1(v)}</text>`;
      acc+=v;tot+=v;
    });
    g+=`<text x="${(lw+(acc/max)*iw+6).toFixed(1)}" y="${y0+barH/2+4}" font-size="11.5" font-weight="800" fill="#0F172A">${rnd1(tot)}</text>`;
  });
  return `<div class="ch-scroll"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:620px;height:${H}px" preserveAspectRatio="xMinYMin meet" role="img">${g}</svg></div>`
    +chLegend(series.concat([{name:'Tổng',color:'#0F172A'}]));
}
/* Thanh ngang đơn giản (một chỉ số) — dùng cho biểu đồ tăng ca theo nhóm */
function chartGroupedH(rows,series,opt){
  if(series.length===1){
    opt=Object.assign({},opt,{barH:opt&&opt.barH||16});
    return chartStackedH(rows,series,opt);
  }
  return chartStackedH(rows,series,opt);
}

/* Vành khuyên cơ cấu ca */
function chartDonut(slices){
  const tot=slices.reduce((a,s)=>a+s.value,0);
  if(!tot)return chEmpty();
  const S=170,cx=S/2,cy=S/2,R=72,r=44;
  let a0=-Math.PI/2,g='';
  slices.forEach(s=>{
    if(!s.value)return;
    const a1=a0+2*Math.PI*s.value/tot;
    const big=(a1-a0)>Math.PI?1:0;
    const p=(rad,a)=>[(cx+rad*Math.cos(a)).toFixed(2),(cy+rad*Math.sin(a)).toFixed(2)];
    const[x1,y1]=p(R,a0),[x2,y2]=p(R,a1),[x3,y3]=p(r,a1),[x4,y4]=p(r,a0);
    g+=`<path d="M${x1} ${y1}A${R} ${R} 0 ${big} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${big} 0 ${x4} ${y4}Z" fill="${s.color}"><title>${chEsc(t(s.label)+': '+s.value+' ('+Math.round(s.value/tot*100)+'%)')}</title></path>`;
    a0=a1;
  });
  g+=`<text x="${cx}" y="${cy-2}" text-anchor="middle" font-size="19" font-weight="700" fill="#0F172A">${tot}</text>`
    +`<text x="${cx}" y="${cy+13}" text-anchor="middle" font-size="9" fill="#94A3B8">ca</text>`;
  return `<svg viewBox="0 0 ${S} ${S}" style="width:170px;height:170px;display:block;margin:0 auto" role="img">${g}</svg>`
    +chLegend(slices.map(s=>({name:t(s.label)+' ('+s.value+')',color:s.color})));
}

/* ---- Các biểu đồ cụ thể ---- */
/* Giờ công theo người — dạng bảng + thanh: cột số tách riêng nên dễ so sánh,
   thanh chỉ gồm giờ LÀM (công + tăng ca); giờ phép để riêng một cột,
   không cộng lẫn vào thanh gây hiểu nhầm như bản cũ. */
function chartHoursByEmp(emps,days){
  if(!emps.length)return chEmpty();
  const rows=emps.map(e=>({e,s:calcStats(e.id,days)}))
                 .map(r=>Object.assign(r,{tot:r.s.hWork+r.s.hOT}))
                 .sort((a,b)=>b.tot-a.tot||b.s.hWork-a.s.hWork);
  const max=Math.max(1,...rows.map(r=>r.tot));
  const seg=(v,col)=>v>0?`<i style="width:${(v/max*100).toFixed(2)}%;background:${col}"></i>`:'';
  let h=`<div class="hb-tbl">
    <div class="hb-row hd">
      <span class="nm"></span><span class="bar"></span>
      <span class="num">Công</span><span class="num">OT</span><span class="num">Phép</span><span class="num tot">Σ Làm</span>
    </div>`;
  rows.forEach(r=>{
    h+=`<div class="hb-row">
      <span class="nm" title="${chEsc((r.e.name||r.e.id)+(r.e.team?' · Nhóm '+r.e.team:''))}">${chEsc(shortName(r.e.name||r.e.id))}</span>
      <span class="bar" title="${chEsc('Công '+rnd1(r.s.hWork)+'h · OT '+rnd1(r.s.hOT)+'h')}">${seg(r.s.hWork,'#0B3B5C')}${seg(r.s.hOT,'#D9534F')}</span>
      <span class="num">${rnd1(r.s.hWork)}</span>
      <span class="num ot">${r.s.hOT?rnd1(r.s.hOT):'·'}</span>
      <span class="num al">${r.s.hLeave?rnd1(r.s.hLeave):'·'}</span>
      <span class="num tot">${rnd1(r.tot)}</span>
    </div>`;
  });
  h+='</div>'+chLegend([{name:'Giờ công',color:'#0B3B5C'},{name:'Giờ tăng ca',color:'#D9534F'}])
    +`<p class="muted sm2" style="margin-top:4px">Thanh = giờ làm thực (công + tăng ca), xếp từ cao xuống thấp. Giờ phép ghi ở cột riêng, không cộng vào thanh.</p>`;
  return h;
}
function chartMix(ids,days){
  const cnt={};
  ids.forEach(id=>days.forEach(iso=>{
    const c=eff(id,iso).code;if(!c)return;
    const k=(codeInfo(c).cat==='leave')?'AL':(baseShiftOf(c)||c);
    cnt[k]=(cnt[k]||0)+1;
  }));
  const def=[['D','Ca ngày','#4C6BC0'],['N','Ca đêm','#3E8E5A'],['O','Văn phòng','#7C6BD6'],
             ['R','Nghỉ ca','#CBD5E1'],['AL','Nghỉ phép','#C77DBB']];
  const slices=def.filter(([k])=>cnt[k]).map(([k,l,c])=>({label:l,value:cnt[k],color:c}));
  Object.keys(cnt).forEach(k=>{if(!def.some(d=>d[0]===k))slices.push({label:k,value:cnt[k],color:'#94A3B8'});});
  return chartDonut(slices);
}
function chartOtByTeam(emps,days){
  const by={};
  emps.forEach(e=>{
    const k=e.team||'(chưa phân nhóm)';
    by[k]=(by[k]||0)+calcStats(e.id,days).hOT;
  });
  const rows=Object.keys(by).sort().map(k=>({k,v:by[k]}));
  if(!rows.some(r=>r.v))return chEmpty('Kỳ này chưa có giờ tăng ca nào.');
  return chartStackedH(rows,[{name:'Giờ tăng ca',color:'#D9534F',get:r=>r.v}],
    {label:r=>'Nhóm '+teamShort(r.k),labelW:120,barH:16});
}
/* Xu hướng giờ công của một người qua 6 kỳ gần nhất */
function chartTrend(id){
  const ms=monthsAvailable().slice(-6);
  if(!ms.length)return chEmpty();
  const w=[],o=[],l=[];
  ms.forEach(m=>{const s=calcStats(id,daysOfPeriod(m));w.push(rnd1(s.hWork));o.push(rnd1(s.hOT));l.push(rnd1(s.hLeave));});
  return chartStacked(ms.map(m=>{const p=periodFor(m);return 'T'+p.m+'/'+String(p.y).slice(2);}),[
    {name:'Giờ công',color:'#0B3B5C',data:w},
    {name:'Giờ tăng ca',color:'#D9534F',data:o},
    {name:'Giờ phép',color:'#C77DBB',data:l}
  ],{h:200});
}

/* ============================================================
   NHẬT KÝ TĂNG CA — dữ liệu lịch sử nhập từ file Excel quản lý jan-up
   (window.OTLOG_DATA). Lọc theo kỳ công + tìm tên, có tổng giờ.
   Nhân viên thường chỉ xem dòng của chính mình.
   ============================================================ */
/* Kỳ công đang được "tải" để tổng hợp. MẶC ĐỊNH chỉ kỳ hiện tại —
   không nạp toàn bộ cho nhẹ; có nút tải thêm từng kỳ hoặc toàn bộ. */
let otlogSel=null;              // mảng các kỳ 'YYYY-MM' đang xem
let otlogQuery='';
/* Chuẩn hoá tên để so khớp (bỏ dấu, viết thường) */
function otNorm(s){return noAccent(String(s||'')).replace(/\s+/g,' ').trim();}

/* Các kỳ có trong dữ liệu Excel đã nhập */
function otlogImportedPeriods(){
  const set=new Set();
  (window.OTLOG_DATA||[]).forEach(r=>set.add(schedMonthOf(r.d)));
  return set;
}
/* Tất cả kỳ có thể xem = kỳ từ Excel ∪ kỳ có trong phần mềm (lịch/đơn) */
function otlogAllPeriods(){
  const set=otlogImportedPeriods();
  monthsAvailable().forEach(m=>set.add(m));
  return [...set].sort();
}
function otlogInit(){
  if(otlogSel)return;
  const cur=curSchedMonth();
  otlogSel=otlogAllPeriods().includes(cur)?[cur]:otlogAllPeriods().slice(-1);
}
function otlogTogglePeriod(m){
  otlogInit();
  const i=otlogSel.indexOf(m);
  if(i<0)otlogSel.push(m);else if(otlogSel.length>1)otlogSel.splice(i,1);
  otlogRefresh();
}
function otlogLoadAll(){otlogSel=otlogAllPeriods();otlogRefresh();}
function otlogLoadCurrent(){const c=curSchedMonth();otlogSel=[otlogAllPeriods().includes(c)?c:otlogAllPeriods().slice(-1)[0]];otlogRefresh();}

/* ---------- Chọn kỳ công: dropdown có ô gõ để tìm ----------
   Trước đây liệt kê hết các kỳ thành một rừng chip chiếm nửa màn hình.
   Nay gói vào một nút xổ xuống: gõ để lọc, tích nhiều kỳ, bấm ra ngoài là đóng. */
let otlogPerQ='';
function otlogDDOpen(){const p=$('otlogDDPan');return !!p&&p.style.display!=='none';}
function otlogDDToggle(force){
  const p=$('otlogDDPan');if(!p)return;
  const open=(force===undefined)?!otlogDDOpen():!!force;
  p.style.display=open?'':'none';
  const b=$('otlogDDBtn');if(b)b.classList.toggle('on',open);
  if(open){const q=$('otlogPerQ');if(q)setTimeout(()=>q.focus(),0);}
}
function otlogPerFilter(v){otlogPerQ=v||'';otlogRenderPerList();}
function otlogPerListHtml(){
  otlogInit();
  const imported=otlogImportedPeriods();
  const q=otNorm(otlogPerQ);
  const list=otlogAllPeriods().slice().reverse()
    .filter(m=>!q||otNorm(periodFor(m).label).includes(q)||m.includes(q));
  if(!list.length)return `<p class="muted sm2" style="padding:8px 10px">${t('Không có kỳ nào khớp.')}</p>`;
  return list.map(m=>`<label class="dd-it${otlogSel.includes(m)?' on':''}">
      <input type="checkbox" ${otlogSel.includes(m)?'checked':''} onchange="otlogTogglePeriod('${m}')">
      <span>${esc(periodFor(m).label)}</span>
      ${imported.has(m)?'':`<i class="dd-dot" title="${t('Kỳ tổng hợp từ phần mềm (chưa có trong Excel)')}">•</i>`}
    </label>`).join('');
}
function otlogDDLabel(){
  otlogInit();
  const first=periodFor(otlogSel.slice().sort().slice(-1)[0]||curSchedMonth()).label;
  const more=otlogSel.length-1;
  return `${esc(first)}${more>0?` <b class="dd-n">+${more}</b>`:''} <i class="dd-ar">▾</i>`;
}
function otlogRenderPerList(){const b=$('otlogPerList');if(b)b.innerHTML=otlogPerListHtml();}
/* Cập nhật tại chỗ để dropdown không bị đóng khi tích chọn */
function otlogRefresh(){
  const b=$('otlogDDBtn');if(b)b.innerHTML=otlogDDLabel();
  otlogRenderPerList();
  const box=$('otlogBox');if(box)box.innerHTML=otlogTableHtml();
  if(typeof i18nSchedule==='function')i18nSchedule();
}
/* Bấm ra ngoài thì đóng dropdown.
   Lưu ý: tích một kỳ sẽ vẽ lại danh sách, ô tích vừa bấm bị gỡ khỏi DOM nên
   dd.contains() trả về false — phải bỏ qua những phần tử đã rời khỏi trang,
   nếu không dropdown tự đóng ngay khi vừa tích. */
document.addEventListener('click',e=>{
  const dd=$('otlogDD');
  if(!dd||!otlogDDOpen())return;
  const tg=e.target;
  if(!tg||(tg.isConnected===false))return;
  if(!dd.contains(tg))otlogDDToggle(false);
});
function otlogFilterName(v){
  otlogQuery=v||'';
  const box=$('otlogBox');if(box)box.innerHTML=otlogTableHtml();
}

/* Dòng tăng ca của MỘT kỳ: ưu tiên dữ liệu Excel đã nhập; kỳ nào Excel chưa có
   thì TỔNG HỢP TỪ PHẦN MỀM (đơn tăng ca đã duyệt + ô lịch thực tế mã OT). */
function otlogRowsForPeriod(m){
  const imported=(window.OTLOG_DATA||[]).filter(r=>schedMonthOf(r.d)===m);
  if(imported.length)return imported.map(r=>Object.assign({src:'excel'},r));
  // Suy từ phần mềm
  const days=daysOfPeriod(m), out=[], seen=new Set();
  Object.values(S.requests||{}).forEach(r=>{
    if(r.type!=='ot'||r.status!=='approved')return;
    reqDays(r).forEach(d=>{
      if(!days.includes(d.iso))return;
      const e=empById(r.empId)||{};
      out.push({src:'app',d:d.iso,n:e.name||r.empId,s:d.timeIn||'',e:d.timeOut||'',
        h:d.hours||otHours(d.iso,d.timeIn,d.isoEnd,d.timeOut)||getHours(d.code||'OTD'),
        r:r.note||'',st:'app'});
      seen.add(r.empId+'|'+d.iso);
    });
  });
  // Ô lịch thực tế mang mã OT nhưng không gắn đơn (quản lý gán tay)
  days.forEach(iso=>{
    schedEmps().forEach(e=>{
      const rr=eff(e.id,iso);if(!rr.code)return;
      const sp=comboSplitHours(rr.code,effHours(e.id,iso));
      if(!sp&&codeInfo(rr.code).cat!=='ot')return;
      if(seen.has(e.id+'|'+iso))return;
      out.push({src:'app',d:iso,n:e.name||e.id,s:'',e:'',
        h:sp?sp.ot:effHours(e.id,iso),r:sp?t('Ca kép')+' '+rr.code:'',st:'app'});
    });
  });
  return out;
}
function otlogRows(){
  otlogInit();
  let rows=[];
  otlogSel.forEach(m=>{rows=rows.concat(otlogRowsForPeriod(m));});
  if(!repSeeAll()){
    const me=empById(meId());
    const key=me?otNorm(me.name):'';
    rows=rows.filter(r=>key&&otNorm(r.n)===key);
  }
  const q=otNorm(otlogQuery);
  if(q)rows=rows.filter(r=>otNorm(r.n).includes(q)||otNorm(r.r).includes(q));
  rows.sort((a,b)=>a.d<b.d?1:a.d>b.d?-1:0);   // mới nhất trước
  return rows;
}
function otlogTableHtml(){
  const rows=otlogRows();
  if(!rows.length)return `<div class="card"><p class="muted">${t('Không có dòng tăng ca nào khớp.')}</p></div>`;
  const totH=rows.reduce((a,r)=>a+(+r.h||0),0);
  const byName={};rows.forEach(r=>{byName[r.n]=(byName[r.n]||0)+(+r.h||0);});
  const nNames=Object.keys(byName).length;
  const top=Object.entries(byName).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([n,h])=>`${esc(shortName(n))} ${rnd1(h)}h`).join(' · ');
  let h=`<div class="card rep-head">
    <b>${rows.length} ${t('lượt tăng ca')}</b>
    <span class="st approved">Σ ${rnd1(totH)} ${t('giờ')}</span>
    <span class="muted sm2">${nNames} ${t('người')}${top?' · '+t('nhiều nhất')+': '+top:''}</span></div>
  <div class="card stbl otlog-tbl"><table><thead><tr>
    <th class="l">${t('Ngày')}</th><th class="l">${t('Họ tên')}</th><th>${t('Bắt đầu')}</th><th>${t('Kết thúc')}</th><th>${t('Giờ')}</th><th class="l">${t('Lý do')}</th><th>${t('Nguồn')}</th>
  </tr></thead><tbody>`;
  rows.slice(0,500).forEach(r=>{
    const srcTag=r.src==='excel'
      ?'<span class="st approved">Excel</span>'
      :'<span class="st pending">'+t('Phần mềm')+'</span>';
    h+=`<tr>
      <td class="l">${esc(fmtVN(r.d))}</td>
      <td class="l"><b>${esc(shortName(r.n)||r.n)}</b></td>
      <td>${esc(r.s||'')}</td><td>${esc(r.e||'')}</td>
      <td class="hl">${rnd1(+r.h||0)}</td>
      <td class="l" style="font-size:11px">${esc(r.r||'')}</td>
      <td>${srcTag}</td>
    </tr>`;
  });
  h+=`</tbody></table></div>`;
  if(rows.length>500)h+=`<p class="muted sm2" style="margin-top:6px">${t('Đang hiện 500 dòng mới nhất trong')} ${rows.length} ${t('dòng khớp.')}</p>`;
  return h;
}
function repOtLog(){
  otlogInit();
  const all=otlogAllPeriods();
  const imported=otlogImportedPeriods();
  const allOn=otlogSel.length>=all.length;
  return `<div class="card repp">
    <h3 class="rep-h3">🗂 ${t('Nhật ký tăng ca')} ${repSeeAll()?t('(toàn bộ)'):t('của tôi')}</h3>
    <div class="repp-row wrap"><span class="lbl">${t('Kỳ công')}:</span>
      <div class="dd" id="otlogDD">
        <button type="button" class="dd-btn" id="otlogDDBtn" onclick="otlogDDToggle()">${otlogDDLabel()}</button>
        <div class="dd-pan" id="otlogDDPan" style="display:none">
          <input class="inp sm dd-q" id="otlogPerQ" placeholder="${t('Gõ để tìm kỳ…')}" value="${esc(otlogPerQ)}" oninput="otlogPerFilter(this.value)">
          <div class="dd-list" id="otlogPerList">${otlogPerListHtml()}</div>
          <div class="dd-foot">
            <button type="button" class="btn sec sm" onclick="otlogLoadCurrent()">${t('Chỉ kỳ hiện tại')}</button>
            <button type="button" class="btn ${allOn?'sec':''} sm" onclick="otlogLoadAll()">${allOn?'✓ ':''}${t('Tải toàn bộ')} (${all.length} ${t('kỳ')})</button>
          </div>
        </div>
      </div>
      ${repSeeAll()?`<input class="inp sm" style="min-width:180px;margin-left:auto" placeholder="${t('Tìm tên / lý do…')}"
        value="${esc(otlogQuery)}" oninput="otlogFilterName(this.value)">`:''}
    </div>
    <details class="xp"><summary>${t('Giải thích')}</summary><div class="xp-b">${t('Kỳ có sẵn từ Excel hiện dữ liệu gốc; kỳ mới tổng hợp thẳng từ đơn tăng ca đã duyệt trong phần mềm. Mặc định chỉ tải kỳ hiện tại cho nhẹ — bấm chọn thêm kỳ hoặc tải toàn bộ.')} ${t('Dấu • là kỳ tổng hợp từ phần mềm (chưa có trong Excel).')}</div></details>
  </div>
  <div id="otlogBox">${otlogTableHtml()}</div>`;
}

/* ============================================================
   GỬI EMAIL BÁO CÁO QUA OUTLOOK (mailto)
   App chạy trong trình duyệt nên không thể tự đăng nhập gửi hộ; thay vào đó
   dựng sẵn một email (người nhận + tiêu đề + nội dung tóm tắt) rồi mở ứng dụng
   thư mặc định trên máy — thường là Outlook — để người dùng bấm Gửi.
   Địa chỉ nhận lưu trong phần mềm: S.settings.reportEmailTo / ...Cc.
   ============================================================ */
function buildReportSummary(ym){
  const p=periodFor(ym);
  const reqs=Object.values(S.requests||{}).filter(r=>reqInRange
    ?reqInRange(r,p.from,p.to):true);
  const cnt={pending:0,approved:0,rejected:0};
  const byType={};
  reqs.forEach(r=>{
    if(cnt[r.status]!==undefined)cnt[r.status]++;
    byType[r.type]=(byType[r.type]||0)+1;
  });
  const rows=statRows(ym,'__all');
  const sum=f=>rnd1(rows.reduce((a,r)=>a+f(r.s),0));
  const L=[];
  L.push('BÁO CÁO CÔNG CA — '+p.label);
  L.push('LPGT Cavern · xuất '+fmtDateTime(Date.now()));
  L.push('');
  L.push('ĐƠN TỪ TRONG KỲ');
  L.push('  • Chờ duyệt: '+cnt.pending);
  L.push('  • Đã duyệt: '+cnt.approved);
  L.push('  • Từ chối: '+cnt.rejected);
  const typeLine=Object.entries(byType).map(([k,n])=>(REQ_LABEL[k]||k)+': '+n).join(' · ');
  if(typeLine)L.push('  • Theo loại: '+typeLine);
  L.push('');
  L.push('TỔNG HỢP GIỜ (cả tổ, '+rows.length+' người)');
  L.push('  • Giờ công: '+sum(s=>s.hWork));
  L.push('  • Giờ tăng ca: '+sum(s=>s.hOT));
  L.push('  • Giờ phép: '+sum(s=>s.hLeave));
  L.push('');
  L.push('— Email tạo tự động từ phần mềm Quản lý Công Ca. Bảng chi tiết vui lòng xem file Excel đính kèm (Xuất Excel trong tab Thống kê).');
  return{subject:'[LPGT Cavern] Báo cáo công ca '+p.label,body:L.join('\n')};
}
function openMailReport(){
  const ym=repYm||curSchedMonth();
  const to=(S.settings.reportEmailTo||'').trim();
  const cc=(S.settings.reportEmailCc||'').trim();
  const{subject,body}=buildReportSummary(ym);
  // Modal xem trước + chỉnh người nhận trước khi mở Outlook
  const box=$('mailMask'), b=$('mailBody');
  if(!box||!b){ // chưa có modal → gửi thẳng
    sendReportEmail(to,cc,subject,body);return;
  }
  b.innerHTML=`
    <h3>✉️ Gửi email báo cáo</h3>
    <p class="muted sm2" style="margin-bottom:8px">Bấm Gửi sẽ mở ứng dụng thư mặc định trên máy (Outlook) với nội dung đã soạn sẵn — bạn kiểm tra rồi bấm gửi trong Outlook. Địa chỉ nhận được lưu lại cho lần sau.</p>
    <div class="fg"><label class="fl">Người nhận (To) — cách nhau bằng dấu ;</label>
      <input class="inp" id="mailTo" value="${esc(to)}" placeholder="ten@congty.com; sep@congty.com"></div>
    <div class="fg"><label class="fl">CC (không bắt buộc)</label>
      <input class="inp" id="mailCc" value="${esc(cc)}" placeholder="quanly@congty.com"></div>
    <div class="fg"><label class="fl">Tiêu đề</label>
      <input class="inp" id="mailSubject" value="${esc(subject)}"></div>
    <div class="fg"><label class="fl">Nội dung</label>
      <textarea class="inp" id="mailBodyTxt" rows="10" style="font-family:var(--mono);font-size:12px">${esc(body)}</textarea></div>
    <div class="row" style="margin-top:12px">
      <button class="btn" style="flex:1" onclick="sendReportEmailFromModal()">✉️ Mở Outlook &amp; gửi</button>
      <button class="btn sec" style="flex:1" onclick="closeMailReport()">Đóng</button>
    </div>`;
  box.classList.add('on');
}
function closeMailReport(){const m=$('mailMask');if(m)m.classList.remove('on');}
function sendReportEmailFromModal(){
  const to=($('mailTo').value||'').trim(), cc=($('mailCc').value||'').trim();
  const subject=($('mailSubject').value||'').trim(), body=$('mailBodyTxt').value||'';
  // lưu lại địa chỉ cho lần sau
  S.settings.reportEmailTo=to;S.settings.reportEmailCc=cc;save();
  sendReportEmail(to,cc,subject,body);
  closeMailReport();
}
function sendReportEmail(to,cc,subject,body){
  if(!to){toast(t('Nhập ít nhất một địa chỉ người nhận'));return;}
  const q=[];
  if(cc)q.push('cc='+encodeURIComponent(cc));
  q.push('subject='+encodeURIComponent(subject));
  q.push('body='+encodeURIComponent(body));
  const href='mailto:'+encodeURIComponent(to).replace(/%3B/gi,';')+'?'+q.join('&');
  window.location.href=href;
  toast(t('Đang mở ứng dụng thư trên máy…'));
}
