/* ============================================================
   TỔNG QUAN PHÊ DUYỆT — sub-tab trong tab Duyệt
   LPGT Cavern — Quản lý Công Ca v4.6

   Tab Duyệt có 2 sub-tab: 📋 Danh sách đơn · 📊 Tổng quan.
   Sub-tab Tổng quan dành cho giám đốc nhà máy, trả lời 3 câu hỏi:
     1. Kỳ này có bao nhiêu đơn mỗi loại và tương ứng BAO NHIÊU GIỜ?
        → dải thẻ theo loại đơn + ma trận Loại đơn × Trạng thái (kèm cột giờ).
     2. Việc gì đang kẹt? → dải TỒN ĐỌNG & RỦI RO.
     3. Tăng ca dồn vào ai, ai vượt trần? → BẢNG THEO NHÂN VIÊN.

   Quy ước:
   - Sub-tab này có KỲ CÔNG RIÊNG (`asYm`), mặc định luôn là KỲ HIỆN TẠI,
     không dính vào bộ lọc của danh sách đơn.
   - Bấm bất kỳ con số nào → nhảy sang sub-tab Danh sách đơn với đúng bộ lọc
     đã sinh ra con số đó (kể cả kỳ công).
   ============================================================ */

const AS_TYPES=['leave','ot','swap','change','wt','late','multi'];
const AS_STATUS=[['pending','⏳ Chờ duyệt'],['approved','✅ Đã duyệt'],['rejected','❌ Từ chối']];
const AS_STALE_DAYS=3;            // chờ quá bao nhiêu ngày thì coi là tồn đọng

let asYm='';                      // kỳ công của riêng bảng tổng quan (đặt khi vẽ lần đầu)
let asEmpAll=false;               // bảng nhân viên: xem đủ hay chỉ top 8
let asEmpSort='ot';               // ot | tot | pending | leave | hours | name
let asEmpDir=-1;                  // -1 giảm dần, 1 tăng dần
let asShowEmptyRows=false;        // ma trận: hiện cả loại đơn không có đơn nào

/* Trần giờ tăng ca một kỳ — khai ở tab Dữ liệu, mặc định 40h/tháng
   (mức trần của Bộ luật Lao động Việt Nam). */
function asOtLimit(){const v=+(S.settings&&S.settings.otLimit);return v>0?v:40;}
/* Kỳ đang xem — chưa đặt thì lấy kỳ hiện tại */
function asPeriod(){return asYm||(asYm=curSchedMonth());}

/* ---------- PHẠM VI ---------- */
/* Đơn thuộc kỳ đang xem (xét mọi ngày khai trong đơn) */
function asScopeReqs(){
  const p=periodFor(asPeriod());
  return Object.values(S.requests||{}).filter(r=>r&&reqInRange(r,p.from,p.to));
}
function asScopeLabel(){return periodFor(asPeriod()).label;}

/* ---------- SỐ GIỜ / SỐ NGÀY CỦA MỘT ĐƠN ---------- */
/* Số giờ thật của MỘT DÒNG ngày trong đơn: ưu tiên số giờ nhân viên đã khai,
   không có mới suy từ mốc giờ vào/ra, cuối cùng mới lấy giờ mặc định của mã ca.
   Nhờ vậy tăng ca 14:00–19:30 tính đúng 5.5h chứ không phải 12h. */
function reqDayHours(d){
  return (+d.hours>0?+d.hours:0)
      || otHours(d.iso,d.timeIn,d.isoEnd,d.timeOut)
      || getHours(d.code)||0;
}
/* Tổng giờ của cả đơn — dùng cho MỌI loại đơn, không riêng tăng ca */
function reqHours(r){
  if(!r)return 0;
  let h=0;reqDays(r).forEach(d=>{h+=reqDayHours(d);});
  return rnd1(h);
}
/* Riêng giờ tăng ca (chỉ đơn loại ot) */
function reqOtHours(r){return (r&&r.type==='ot')?reqHours(r):0;}
/* Số ngày nghỉ phép quy đổi (AL4 = nửa ngày) */
function reqLeaveDays(r){
  if(!r||r.type!=='leave')return 0;
  let n=0;reqDays(r).forEach(d=>{n+=(d.code==='AL4')?0.5:1;});
  return rnd1(n);
}
/* Ngày làm đầu tiên của đơn — dùng để soi đơn đã quá ngày mà chưa duyệt */
function reqFirstDay(r){
  const ds=reqDays(r);
  return ds.length?ds.map(d=>d.iso).sort()[0]:(r.from||'');
}

/* ---------- CỜ RỦI RO ---------- */
/* Dùng chung cho cả dải chip cảnh báo lẫn bộ lọc danh sách đơn
   (apprMatch trong 08-requests.js gọi ngược lại hàm này). */
function asFlagMatch(r,f){
  if(!f||!r)return true;
  const D=86400000;
  switch(f){
    case 'stale':     return r.status==='pending'&&(Date.now()-(r.createdAt||0))>AS_STALE_DAYS*D;
    case 'overdue':   return r.status==='pending'&&reqFirstDay(r)&&reqFirstDay(r)<todayIso();
    case 'unprinted': return r.status==='approved'&&!r.printedAt&&!r.noPrint;
    case 'cfw':       return r.type==='swap'&&r.confirmW==='pending';
    case 'cfwno':     return r.type==='swap'&&r.confirmW==='declined';
    case 'cvw':       return r.type==='leave'&&r.coverId&&(r.coverSt||'pending')==='pending';
    case 'cvno':      return r.type==='leave'&&r.coverSt==='declined';
    case 'proxy':     return !!(r.byId&&r.byId!==r.empId);
    default: return true;
  }
}
const AS_FLAGS=[
  ['stale',    '⌛',  'Chờ quá '+AS_STALE_DAYS+' ngày', 'Đơn gửi lâu mà chưa ai quyết định — nhân viên đang phải chờ.','warn'],
  ['overdue',  '🚩',  'Quá ngày làm',                   'Ngày làm việc trong đơn đã trôi qua nhưng đơn vẫn chờ duyệt — duyệt lúc này là duyệt hồi tố.','bad'],
  ['unprinted','🖨️', 'Duyệt rồi chưa in',              'Đã duyệt nhưng chưa in biểu mẫu nộp nhân sự.','info'],
  ['cfw',      '🔄',  'Đổi ca chờ xác nhận',            'Người nhận ca chưa bấm xác nhận — duyệt vội dễ thành xếp nhầm ca.','warn'],
  ['cfwno',    '✋',  'Đổi ca bị từ chối',              'Người kia đã từ chối đổi ca, đơn này nên trả lại.','bad'],
  ['cvw',      '🤝',  'Cover chờ xác nhận',             'Đơn nghỉ có chỉ định người OT cover nhưng người đó chưa bấm đồng ý.','warn'],
  ['cvno',     '🙅',  'Cover đã từ chối',               'Người được nhờ OT cover đã từ chối — nên đổi sang người khác trước khi duyệt.','bad'],
  ['proxy',    '👥',  'Khai hộ',                        'Đơn do người khác đứng ra khai thay — nên soát kỹ hơn.','info']
];

/* ---------- BẤM SỐ → NHẢY SANG DANH SÁCH ĐƠN ---------- */
/* Bộ lọc của danh sách luôn được đặt về đúng kỳ đang xem ở bảng tổng quan,
   để con số bấm vào và danh sách hiện ra khớp nhau tuyệt đối. */
function asApply(f){
  Object.assign(apprFilter,{status:'__all',type:'__all',print:'__all',flag:'',q:'',
                            ym:asPeriod(),from:'',to:''},f||{});
  apprSetTab('list');
}
function asPick(type,status){asApply({type:type||'__all',status:status||'__all'});}
function asSetFlag(f){asApply({flag:f});}
function asPickEmp(name){asApply({q:name||''});}
function asSetYm(v){asYm=v;asRender();}
function asSetSort(k){
  if(asEmpSort===k)asEmpDir=-asEmpDir;else{asEmpSort=k;asEmpDir=(k==='name')?1:-1;}
  asRender();
}
function asToggleEmpAll(){asEmpAll=!asEmpAll;asRender();}
function asToggleEmptyRows(){asShowEmptyRows=!asShowEmptyRows;asRender();}

/* ---------- GOM SỐ LIỆU ---------- */
function asAggregate(reqs){
  const mx={};   // mx[type] = {pending,approved,rejected,tot,days,hAppr,hPend}
  AS_TYPES.forEach(k=>mx[k]={pending:0,approved:0,rejected:0,tot:0,days:0,hAppr:0,hPend:0});
  const emp={};
  const flags={};AS_FLAGS.forEach(([k])=>flags[k]=0);
  let otH=0,leaveD=0,allH=0,tot=0,pend=0,appr=0,rej=0,days=0;
  const otBy={};

  reqs.forEach(r=>{
    const ty=mx[r.type]?r.type:null;
    const h=reqHours(r), nd=reqDays(r).length;
    tot++;days+=nd;
    if(r.status==='pending')pend++;else if(r.status==='approved')appr++;else if(r.status==='rejected')rej++;
    if(ty){
      const m=mx[ty];m.tot++;m.days+=nd;
      if(m[r.status]!==undefined)m[r.status]++;
      if(r.status==='approved')m.hAppr=rnd1(m.hAppr+h);
      else if(r.status==='pending')m.hPend=rnd1(m.hPend+h);
    }
    AS_FLAGS.forEach(([k])=>{if(asFlagMatch(r,k))flags[k]++;});

    const id=r.empId,e=empById(id);
    const row=emp[id]||(emp[id]={id,name:(e&&e.name)||id,team:(e&&e.team)||'',pos:(e&&e.pos)||'',
                                 tot:0,pending:0,approved:0,rejected:0,ot:0,leave:0,hours:0,ty:{}});
    row.tot++;
    if(row[r.status]!==undefined)row[r.status]++;
    row.ty[r.type]=(row.ty[r.type]||0)+1;
    if(r.status==='approved'){
      row.hours=rnd1(row.hours+h);allH=rnd1(allH+h);
      const o=reqOtHours(r);if(o){row.ot=rnd1(row.ot+o);otH=rnd1(otH+o);otBy[id]=rnd1((otBy[id]||0)+o);}
      const d=reqLeaveDays(r);if(d){row.leave=rnd1(row.leave+d);leaveD=rnd1(leaveD+d);}
    }
  });
  const lim=asOtLimit();
  return {mx,emp,flags,tot,pend,appr,rej,otH,leaveD,allH,days,otBy,
          over:Object.keys(otBy).filter(id=>otBy[id]>lim).length};
}

/* ---------- CÁC MẢNH GIAO DIỆN ---------- */
/* Sáu thẻ chỉ số — đã bỏ "tỉ lệ duyệt", thay bằng tổng giờ đã duyệt,
   vì cái giám đốc cần là KHỐI LƯỢNG (bao nhiêu giờ phải trả), không phải
   tỉ lệ gật/lắc của chính mình. */
function asKpi(a){
  const lim=asOtLimit();
  const box=(v,k,sub,cls,on)=>`<button class="as-kpi ${cls||''}" ${on?`onclick="${on}"`:'disabled'}>
      <div class="v">${v}</div><div class="k">${k}</div>${sub?`<div class="s">${sub}</div>`:''}</button>`;
  return `<div class="as-kpis">
    ${box(a.tot,t('TỔNG SỐ ĐƠN'),`${a.days} ${t('dòng ngày đã khai')}`,'','asPick(\'__all\',\'__all\')')}
    ${box(a.pend,t('ĐANG CHỜ DUYỆT'),
        a.flags.overdue?`🚩 ${a.flags.overdue} ${t('đơn đã quá ngày làm')}`
        :(a.flags.stale?`⌛ ${a.flags.stale} ${t('đơn chờ quá')} ${AS_STALE_DAYS} ${t('ngày')}`:t('không có đơn tồn')),
        a.pend?'hot':'','asPick(\'__all\',\'pending\')')}
    ${box(a.allH+'h',t('TỔNG GIỜ ĐÃ DUYỆT'),t('cộng mọi loại đơn'),'ok','asPick(\'__all\',\'approved\')')}
    ${box(a.otH+'h',t('GIỜ TĂNG CA ĐÃ DUYỆT'),
        a.over?`🚨 ${a.over} ${t('người vượt trần')} ${lim}h`:`${t('trần')} ${lim}h/${t('người/kỳ')}`,
        a.over?'hot':'ot','asPick(\'ot\',\'approved\')')}
    ${box(a.leaveD,t('NGÀY PHÉP ĐÃ DUYỆT'),t('AL4 tính nửa ngày'),'lv','asPick(\'leave\',\'approved\')')}
    ${box(a.flags.unprinted,t('DUYỆT RỒI CHƯA IN'),t('cần in nộp nhân sự'),a.flags.unprinted?'warn':'','asSetFlag(\'unprinted\')')}
  </div>`;
}

/* Dải thẻ theo LOẠI ĐƠN: mỗi loại một thẻ — số đơn lớn, số giờ ngay dưới.
   Đây là chỗ nhìn nhanh "kỳ này tốn bao nhiêu giờ vào việc gì". */
function asTypeCards(a){
  const rows=AS_TYPES.filter(k=>a.mx[k].tot>0);
  if(!rows.length)return '';
  const maxH=Math.max(1,...rows.map(k=>a.mx[k].hAppr));
  return `<div class="as-types">${rows.map(k=>{
    const m=a.mx[k];
    return `<button class="as-tcard" onclick="asPick('${k}','__all')" title="${esc(t('Xem đơn')+' '+(REQ_LABEL[k]||k))}">
      <div class="hd"><span class="ic">${REQ_ICON[k]||'📄'}</span><span class="nm">${esc(REQ_LABEL[k]||k)}</span></div>
      <div class="bd"><b>${m.tot}</b><span>${t('đơn')}</span><em>${m.hAppr}h</em></div>
      <div class="bar"><i style="width:${(m.hAppr/maxH*100).toFixed(1)}%"></i></div>
      <div class="ft">${m.days} ${t('ngày')}${m.pending?` · <s>${m.pending} ${t('chờ')}</s>`:''}${m.hPend?` (${m.hPend}h)`:''}</div>
    </button>`;}).join('')}</div>`;
}

/* Ma trận Loại đơn × Trạng thái. Cột cuối là THỐNG KÊ GIỜ & SỐ ĐƠN
   (trước đây là tỉ lệ duyệt — bỏ vì không phục vụ việc điều hành). */
function asMatrix(a){
  const rows=AS_TYPES.filter(k=>asShowEmptyRows||a.mx[k].tot>0);
  if(!rows.length)return `<p class="muted sm2" style="padding:6px 2px">${t('Chưa có đơn nào trong kỳ này.')}</p>`;
  const maxH=Math.max(1,...rows.map(k=>a.mx[k].hAppr+a.mx[k].hPend));
  const cell=(ty,st,n)=>n
    ? `<td class="as-n ${st}"><button onclick="asPick('${ty}','${st}')" title="${t('Xem')} ${n} ${t('đơn')}">${n}</button></td>`
    : '<td class="as-n z">0</td>';
  let h=`<div class="as-tblwrap"><table class="as-mx">
    <thead><tr><th class="l">${t('Loại đơn')}</th>
      ${AS_STATUS.map(([k,l])=>`<th class="${k}">${l}</th>`).join('')}
      <th>${t('Tổng đơn')}</th><th>${t('Số ngày')}</th>
      <th class="g-ot">${t('Giờ đã duyệt')}</th><th>${t('Giờ đang chờ')}</th>
      <th class="l" style="min-width:150px">${t('So sánh giờ')}</th></tr></thead><tbody>`;
  rows.forEach(k=>{
    const m=a.mx[k];
    const seg=(v,c,lb)=>v?`<i style="width:${(v/maxH*100).toFixed(1)}%;background:${c}" title="${lb}: ${v}h"></i>`:'';
    h+=`<tr>
      <td class="l"><button class="as-ty" onclick="asPick('${k}','__all')">
          <span class="ic">${REQ_ICON[k]||'📄'}</span><b>${esc(REQ_LABEL[k]||k)}</b></button></td>
      ${cell(k,'pending',m.pending)}${cell(k,'approved',m.approved)}${cell(k,'rejected',m.rejected)}
      <td class="as-tot"><button onclick="asPick('${k}','__all')">${m.tot}</button></td>
      <td class="as-d${m.days?'':' z'}">${m.days}</td>
      <td class="hl-ot${m.hAppr?'':' z0'}">${m.hAppr}h</td>
      <td class="as-hp${m.hPend?'':' z'}">${m.hPend}h</td>
      <td class="l"><div class="as-bar">${seg(m.hAppr,'#0E9F6E',t('đã duyệt'))}${seg(m.hPend,'#EAB308',t('đang chờ'))}</div></td>
    </tr>`;
  });
  const T=AS_STATUS.map(([k])=>rows.reduce((s,ty)=>s+a.mx[ty][k],0));
  const tD=rows.reduce((s,k)=>s+a.mx[k].days,0);
  const tA=rnd1(rows.reduce((s,k)=>s+a.mx[k].hAppr,0));
  const tP=rnd1(rows.reduce((s,k)=>s+a.mx[k].hPend,0));
  h+=`</tbody><tfoot><tr><td class="l">${t('TỔNG CỘNG')}</td>
      <td>${T[0]}</td><td>${T[1]}</td><td>${T[2]}</td><td>${a.tot}</td><td>${tD}</td>
      <td>${tA}h</td><td>${tP}h</td><td class="l">${tA+tP}h</td></tr></tfoot></table></div>`;
  return h;
}

/* Dải chip tồn đọng & rủi ro — chỉ hiện những cờ đang có số > 0 */
function asRisk(a){
  const on=AS_FLAGS.filter(([k])=>a.flags[k]>0);
  if(!on.length)return `<div class="as-risk"><span class="as-clean">✅ ${t('Không có tồn đọng hay cảnh báo nào trong kỳ này.')}</span></div>`;
  return `<div class="as-risk">${on.map(([k,ic,l,tip,cls])=>
    `<button class="as-flag ${cls}" onclick="asSetFlag('${k}')" title="${esc(t(tip))}">
       <span class="ic">${ic}</span><span class="l">${t(l)}</span><i>${a.flags[k]}</i></button>`).join('')}</div>`;
}

/* Bảng theo nhân viên */
function asEmpTable(a){
  let list=Object.values(a.emp);
  if(!list.length)return '';
  const lim=asOtLimit();
  const key={ot:r=>r.ot,tot:r=>r.tot,pending:r=>r.pending,leave:r=>r.leave,hours:r=>r.hours,name:r=>r.name};
  const kf=key[asEmpSort]||key.ot;
  /* asEmpDir = -1 → giảm dần (mặc định cho cột số), 1 → tăng dần */
  list.sort((x,y)=>{
    const vx=kf(x),vy=kf(y);
    if(asEmpSort==='name')return (asEmpDir<0?-1:1)*String(vx).localeCompare(String(vy),'vi');
    return asEmpDir<0?(vy-vx)||x.name.localeCompare(y.name,'vi')
                     :(vx-vy)||x.name.localeCompare(y.name,'vi');
  });
  const full=list.length;
  const shown=asEmpAll?list:list.slice(0,8);
  const maxOt=Math.max(1,...list.map(r=>r.ot));
  const th=(k,l,cls)=>`<th class="${cls||''} srt${asEmpSort===k?' on':''}"><button onclick="asSetSort('${k}')">${l}${asEmpSort===k?(asEmpDir<0?' ▾':' ▴'):''}</button></th>`;
  let h=`<div class="as-tblwrap"><table class="as-emp">
    <thead><tr><th class="l">${t('Nhóm')}</th>${th('name',t('Họ tên'),'l')}
      ${th('tot',t('Đơn'))}${th('pending',t('Chờ'))}<th>${t('Duyệt')}</th><th>${t('Từ chối')}</th>
      <th class="l">${t('Loại đơn đã gửi')}</th>${th('hours',t('Tổng giờ'))}${th('leave',t('Ngày phép'),'g-lv')}
      ${th('ot',t('Giờ tăng ca đã duyệt'),'g-ot')}</tr></thead><tbody>`;
  shown.forEach(r=>{
    const overLim=r.ot>lim;
    const nm=esc(r.name).replace(/'/g,"\\'");
    const tyChips=AS_TYPES.filter(k=>r.ty[k]).map(k=>
      `<span class="as-tyc" title="${esc(t(REQ_LABEL[k]||k))}">${REQ_ICON[k]||'📄'}${r.ty[k]>1?'<i>'+r.ty[k]+'</i>':''}</span>`).join('');
    h+=`<tr class="${overLim?'over':''}">
      <td class="l">${teamChip(r.team)}</td>
      <td class="l"><button class="as-nm" onclick="asPickEmp('${nm}')">
          <b>${esc(r.name)}</b><span class="muted">${esc(r.pos||'')}</span></button></td>
      <td class="as-n"><button onclick="asPickEmp('${nm}')">${r.tot}</button></td>
      <td class="as-n ${r.pending?'pending':'z'}">${r.pending||0}</td>
      <td class="as-n ${r.approved?'approved':'z'}">${r.approved||0}</td>
      <td class="as-n ${r.rejected?'rejected':'z'}">${r.rejected||0}</td>
      <td class="l"><div class="as-tys">${tyChips||'<span class="muted">—</span>'}</div></td>
      <td class="as-h${r.hours?'':' z'}">${r.hours||0}h</td>
      <td class="hl-lv${r.leave?'':' z0'}">${r.leave||0}</td>
      <td class="as-ot">
        <div class="as-otbar"><i style="width:${(r.ot/maxOt*100).toFixed(1)}%" class="${overLim?'over':''}"></i></div>
        <b class="${overLim?'over':''}">${r.ot||0}h${overLim?' 🚨':''}</b>
      </td></tr>`;
  });
  h+='</tbody></table></div>';
  if(full>8)h+=`<button class="btn sec sm" style="margin-top:8px" onclick="asToggleEmpAll()">${asEmpAll?t('▴ Thu gọn'):'▾ '+t('Xem tất cả')+' '+full+' '+t('người')}</button>`;
  h+=`<p class="muted sm2" style="margin-top:6px">${t('Đỏ = vượt trần tăng ca')} ${lim}h ${t('mỗi kỳ')}. ${t('Bấm tên để lọc riêng đơn của người đó.')}</p>`;
  return h;
}

/* ---------- VẼ PANEL ---------- */
function asRender(){
  const box=$('apprSum');if(!box)return;
  if(!mgr){box.innerHTML='';return;}
  const cur=curSchedMonth(),ym=asPeriod();
  // Kỳ đang xem có thể do nút ◀ ▶ nhảy tới, chưa có dữ liệu nên không nằm
  // trong monthsAvailable() — vẫn phải có trong danh sách chọn.
  const ms=[...new Set(((typeof monthsAvailable==='function')?monthsAvailable():[]).concat([cur,ym]))].sort();
  const a=asAggregate(asScopeReqs());
  box.innerHTML=`
    <div class="as-head">
      <div class="as-ti"><b>📊 ${t('Tổng quan phê duyệt')}</b>
        <span class="muted">${esc(asScopeLabel())}</span></div>
      <button class="as-nav" onclick="asShiftYm(-1)" title="${t('Kỳ trước')}">◀</button>
      <select class="inp sm" onchange="asSetYm(this.value)">
        ${ms.slice().reverse().map(m=>`<option value="${m}"${ym===m?' selected':''}>${esc(periodFor(m).label)}</option>`).join('')}
      </select>
      <button class="as-nav" onclick="asShiftYm(1)" title="${t('Kỳ sau')}">▶</button>
      ${ym!==cur?`<button class="btn sec sm" onclick="asSetYm('${cur}')">${t('Về kỳ hiện tại')}</button>`:''}
    </div>`
    +asKpi(a)
    +asRisk(a)
    +`<div class="as-sec"><h4>🧾 ${t('Tổng hợp theo loại đơn')}</h4>${asTypeCards(a)
       ||`<p class="muted sm2">${t('Chưa có đơn nào trong kỳ này.')}</p>`}</div>`
    +`<div class="as-sec"><h4>🧮 ${t('Chi tiết theo loại đơn và trạng thái')}
        <button class="as-lnk" onclick="asToggleEmptyRows()">${asShowEmptyRows?t('ẩn loại không có đơn'):t('hiện đủ 7 loại đơn')}</button></h4>
      ${asMatrix(a)}</div>`
    +`<div class="as-sec"><h4>👤 ${t('Theo nhân viên')}</h4>${asEmpTable(a)
       ||`<p class="muted sm2">${t('Chưa có đơn nào trong kỳ này.')}</p>`}</div>`;
  if(typeof applyRoleUI==='function')applyRoleUI();
}
/* Lùi / tiến một kỳ công */
function asShiftYm(d){
  let[y,m]=asPeriod().split('-').map(Number);
  m+=d;if(m>12){m=1;y++;}if(m<1){m=12;y--;}
  asSetYm(`${y}-${pad(m)}`);
}
