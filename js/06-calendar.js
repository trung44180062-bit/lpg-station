/* ============================================================
   LICH CA — matrix desktop, the tuan / theo ngay mobile
   LPGT Cavern — Quan ly Cong Ca v4
   ============================================================ */
/* =================== LỊCH CA (MATRIX kiểu Excel) =================== */
const MONTHS_EN=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const TEAM_COLORS={'A':'#F8CBAD','B':'#FFE699','C':'#F4B183','D':'#C6E0B4','OFFICE':'#BDD7EE'};
const PALETTE=['#F8CBAD','#FFE699','#F4B183','#C6E0B4','#BDD7EE','#D9C3E8','#B4E0DA','#F5C6C6'];
function teamColor(tm){
  if(!tm)return '#E9EDF1';
  const k=tm.trim().toUpperCase();
  if(TEAM_COLORS[k])return TEAM_COLORS[k];
  let s=0;for(const ch of k)s+=ch.charCodeAt(0);
  return PALETTE[s%PALETTE.length];
}
// Pastel fills matched to the Excel WORKING SCHEDULE sheet
/* Nền pastel + chữ đậm màu tối — chữ trắng trên nền đậm bị chìm khi ô trùng
   với cột "hôm nay" (nền vàng nhạt ghi đè), nên mọi mã đều dùng chữ tối. */
const SCHEDBG={
  O:'#E3DBF5', D:'#BDD7EE', N:'#C6E0B4', R:'#FFFFFF',
  AL8:'#FBD9E4', AL4:'#FCE7EF', NP:'#FBD5D2', OFF:'#FDEBC8',
  OTD:'#CFEFDF', OTN:'#CFEFDF',
  SD:'#E6DAFB', SN:'#E6DAFB', SO:'#E6DAFB',
  OTL:'#CFEFDF', OT2:'#CFEFDF', OT3:'#CFEFDF',
  /* Ca kép — nền chia đôi: nửa ca chuẩn, nửa tăng ca */
  'O+N':'linear-gradient(108deg,#E3DBF5 0 50%,#CFEFDF 50% 100%)',
  'D+N':'linear-gradient(108deg,#BDD7EE 0 50%,#CFEFDF 50% 100%)'
};
const SCHEDTXT={
  O:'#000000', D:'#1F3B57', N:'#2E4B22', R:'#C00000',
  AL8:'#98123F', AL4:'#98123F', NP:'#A31B14', OFF:'#8A5A00',
  OTD:'#0B6244', OTN:'#0B6244',
  SD:'#4C1D95', SN:'#4C1D95', SO:'#4C1D95',
  OTL:'#0B6244', OT2:'#0B6244', OT3:'#0B6244',
  'O+N':'#000000', 'D+N':'#1F3B57'
};
function cellStyle(code){
  if(!code)return '';
  /* Ca kép: nền chia đôi chéo — nửa trái màu ca chuẩn, nửa phải màu tăng ca */
  const cb=(typeof comboOf==='function')&&comboOf(code);
  if(cb){
    const a=SCHEDBG[cb.work]||'#E2E8F0', b=SCHEDBG[cb.ot]||'#CFEFDF';
    return `background:linear-gradient(108deg,${a} 0 50%,${b} 50% 100%);color:${SCHEDTXT[cb.work]||'#334155'};font-weight:800;font-size:.82em;letter-spacing:-.3px`;
  }
  if(SCHEDBG[code])return `background:${SCHEDBG[code]};color:${SCHEDTXT[code]};font-weight:800`;
  const info=codeInfo(code);
  return `background:${info.col||'#64748B'};color:#fff;font-weight:800`;
}
function renderSched(){renderCal({mode:'std'});}
function renderReal(){renderCal({mode:'real'});}
function renderBoth(){renderCal();}
// Cấu hình bảng chuẩn (S.base, chỉ đọc) và thực tế (base+over, sửa được, tô khác biệt) — v4: dùng chung 1 bộ control + 1 box, chỉ khác cờ `real`
const STD ={real:false, box:'mtxBox', month:'calMonth', range:'calRange', grp:'calGroupFilter'};
const REAL={real:true,  box:'mtxBox', month:'calMonth', range:'calRange', grp:'calGroupFilter'};
/* ===== v4: renderCal() hợp nhất — điều phối desktop (matrix) và mobile (thẻ tuần / theo ngày) ===== */
/* ------------------------------------------------------------
   ĐIỆN THOẠI XEM LỊCH THEO TUẦN
   Ma trận cả kỳ thiết kế cho màn hình rộng; nhét vào điện thoại thì
   chữ li ti, cuộn ngang, nhìn rất rối. Trên điện thoại tab Lịch hiện
   LƯỚI NGƯỜI × 7 NGÀY của một tuần, mặc định đúng nhóm của người đăng
   nhập, có nút chuyển tuần và chip xem thêm nhóm khác — xem
   renderCalWeekGrid() ở cuối file. Máy tính giữ nguyên ma trận đầy đủ.
   ------------------------------------------------------------ */
/* Sub-tab của tab Lịch: 'sched' = bảng lịch ca · 'mp' = Nhân lực theo ngày
   (chuyển từ tab Báo cáo sang — quản lý xem quân số từng ngày ngay cạnh lịch). */
let calTab='sched';
function setCalTab(v){calTab=(v==='mp')?'mp':'sched';renderCal();}
function renderCal(opts){
  opts=opts||{};
  if(opts.mode)calMode=opts.mode;
  if(opts.view)calMobileView=opts.view;
  if(opts.date)calDate=opts.date;
  if(!calDate)calDate=todayIso();
  if(!$('calMonth').options.length)fillMonthSelects();
  if(typeof refreshMealBadge==='function')refreshMealBadge();
  document.querySelectorAll('#calTabSeg button').forEach(b=>b.classList.toggle('on',b.dataset.ct===calTab));
  document.querySelectorAll('#calSeg button').forEach(b=>b.classList.toggle('on',b.dataset.m===calMode));
  const real=calMode==='real';
  $('calDiffWrap').style.display=real?'':'none';
  const mob=isMobile();
  const show=(id,on)=>{const el=$(id);if(el)el.style.display=on?'':'none';};

  /* --- Sub-tab NHÂN LỰC: chỉ dựng panel nhân lực, ẩn mọi bố cục lịch.
     Thanh cal-bar chuyển sang chế độ gọn (class mp-on ẩn control của lịch). */
  const bar=$('calBar');
  if(bar)bar.classList.toggle('mp-on',calTab==='mp');
  if(calTab==='mp'){
    show('calWeekBox',false);show('calDayBox',false);show('calWkGrid',false);
    const sw=document.querySelector('#v-cal .sched-wrap');if(sw)sw.style.display='none';
    const p=$('calMpPanel');
    if(p){p.style.display='';p.innerHTML=(typeof repMpPanel==='function')?repMpPanel():'';}
    return;
  }
  {const p=$('calMpPanel');if(p)p.style.display='none';
   const sw=document.querySelector('#v-cal .sched-wrap');if(sw)sw.style.display='';}

  /* Lịch tuần trên ĐT có thanh điều hướng riêng (tuần + chip nhóm) nên các
     control chọn KỲ / khoảng ngày / nhóm của bố cục máy tính phải ẩn đi,
     để trên màn hình không có hai chỗ điều khiển đá nhau. */
  ['calMonth','calRange','calGroupFilter','calPrevBtn','calNextBtn']
    .forEach(id=>show(id,!mob));
  if(mob){
    /* Điện thoại: chỉ lưới lịch tuần, bỏ hẳn ma trận & thẻ tuần
       (không dựng luôn cho nhẹ máy, chứ không phải chỉ ẩn bằng CSS). */
    show('calWeekBox',false);show('calDayBox',false);show('calWkGrid',true);
    renderCalWeekGrid();
    return;
  }
  show('calWkGrid',false);
  const tgl=$('calViewToggle');if(tgl)tgl.textContent=calMobileView==='day'?'📅 Xem tuần':'👁 Theo ngày';
  renderMatrix(real?REAL:STD);
  if(calMobileView==='day'){show('calWeekBox',false);show('calDayBox',true);renderCalDayView();}
  else{show('calWeekBox',true);show('calDayBox',false);renderCalWeekCards();}
}
function setCalMode(m){calMode=m;renderCal();}
function toggleCalMobileView(){calMobileView=calMobileView==='week'?'day':'week';renderCal();}
function renderMatrix(C){
  fillGroupFilter(C.grp);
  const ym=$(C.month).value;
  if(!ym){$(C.box).innerHTML='<p style="padding:20px" class="muted">Chưa có lịch. Vào tab 🛠️ <b>Nhóm &amp; Lịch</b> để tạo nhóm và điền lịch.</p>';return;}
  const rg=$(C.range).value;
  let days=daysOfPeriod(ym);
  if(rg==='p1')days=days.filter(iso=>+iso.slice(8)>=21);
  else if(rg==='p2')days=days.filter(iso=>{const d=+iso.slice(8);return d>=1&&d<=10;});
  else if(rg==='p3')days=days.filter(iso=>{const d=+iso.slice(8);return d>=11&&d<=20;});
  const fGrp=$(C.grp).value;
  let emps=schedEmps();if(fGrp&&fGrp!=='__all')emps=emps.filter(e=>(e.team||'')===fGrp);
  const tIso=todayIso();
  const wkClass=iso=>{const dw=new Date(iso+'T00:00:00').getDay();return dw===0||dw===6?' wknd':'';};
  const diffOnly=C.real&&$('realDiffOnly')&&$('realDiffOnly').checked;
  // Lấy mã: chuẩn = base; thực tế = eff (base+over) kèm cờ ovr (khác chuẩn)
  const getCode=C.real ? (id,iso)=>eff(id,iso) : (id,iso)=>({code:(S.base[id]&&S.base[id][iso])||'',ovr:false});

  /* "Chỉ ô khác chuẩn": thu gọn bảng — chỉ giữ NGƯỜI và NGÀY có ít nhất
     một ô khác lịch chuẩn, nhìn phát biết ngay ai đổi gì hôm nào. */
  if(diffOnly){
    const empHasDiff=e=>days.some(iso=>getCode(e.id,iso).ovr);
    const empsDiff=emps.filter(empHasDiff);
    const daysDiff=days.filter(iso=>empsDiff.some(e=>getCode(e.id,iso).ovr));
    if(!empsDiff.length){
      $(C.box).innerHTML='<p style="padding:20px" class="muted">Kỳ này chưa có ô nào khác lịch chuẩn.</p>';
      return;
    }
    emps=empsDiff;days=daysDiff;
  }

  // ---- month bands ----
  const bands=[];days.forEach(iso=>{const mk=iso.slice(0,7);const mo=+iso.slice(5,7);if(bands.length&&bands[bands.length-1].mk===mk)bands[bands.length-1].n++;else bands.push({mk,mo,n:1});});

  // Khóa layout: cột thông tin cố định, ô ngày tự chia đều phần còn lại (min 26px/ô → cuộn ngang nếu hẹp)
  const minW=336+days.length*26;
  let h=`<table class="mtx" style="min-width:${minW}px">`;
  h+='<colgroup><col style="width:28px"><col style="width:24px"><col style="width:66px"><col style="width:132px"><col style="width:86px">';
  days.forEach(()=>{h+='<col>';});
  h+='</colgroup>';
  h+='<thead>';
  h+='<tr class="band"><th class="c0"></th><th class="c1"></th><th class="c2"></th><th class="c3"></th><th class="c4"></th>';
  bands.forEach(b=>{h+=`<th class="band" colspan="${b.n}">${MONTHS_EN[b.mo-1]}</th>`;});
  h+='</tr>';
  /* Ngày có sự kiện (nhập tàu, bảo dưỡng…) tô khác ngày thường — js/20-events.js */
  const evOn=typeof eventsOfDay==='function';
  const evCls=iso=>(evOn&&eventsOfDay(iso).length)?' evday':'';
  const evTit=iso=>(evOn&&eventsOfDay(iso).length)?` title="📌 ${esc(evTitleOfDay(iso))}"`:'';
  h+='<tr class="dnum"><th class="c0">No.</th><th class="c1">Tổ</th><th class="c2">ID</th><th class="c3">Họ tên</th><th class="c4">Vị trí</th>';
  days.forEach(iso=>{h+=`<th class="${iso===tIso?'today':wkClass(iso)}${evCls(iso)}"${evTit(iso)}>${+iso.slice(8)}</th>`;});
  h+='</tr>';
  h+='<tr class="dow"><th class="c0"></th><th class="c1"></th><th class="c2"></th><th class="c3"></th><th class="c4"></th>';
  /* Giữ nguyên chữ thứ (Mon/Tue…) — ngày sự kiện nhận diện bằng MÀU + tooltip,
     không thay chữ thứ, vì mất chữ thứ là mất thông tin đọc lịch quan trọng nhất. */
  days.forEach(iso=>{const dw=new Date(iso+'T00:00:00').getDay();h+=`<th class="${iso===tIso?'today ':wkClass(iso)+' '}${dw===0?'dowSun':dw===6?'dowSat':''}${evCls(iso)}"${evTit(iso)}>${DOW_EN[dw]}</th>`;});
  h+='</tr></thead><tbody>';

  const byTeam={};emps.forEach(e=>{const t=e.team||'';(byTeam[t]=byTeam[t]||[]).push(e);});
  const teamsInOrder=[];emps.forEach(e=>{const t=e.team||'';if(!teamsInOrder.includes(t))teamsInOrder.push(t);});
  teamsInOrder.forEach(tm=>{
    const mem=byTeam[tm];
    const col=teamColor(tm);
    h+=`<tr class="grp"><td class="c0" style="background:${col}"></td><td class="c1" style="background:${col}"></td><td class="c2" colspan="3" style="background:#E7EEF5;font-weight:800">${esc(tm?('Nhóm '+tm):'(Chưa phân nhóm)')}</td>`;
    days.forEach(iso=>{h+=`<td class="cell${iso===tIso?' today':''}"></td>`;});
    h+='</tr>';
    mem.forEach((e,i)=>{
      const roleLbl=e.role==='eng'?'Kỹ sư':e.role==='oper'?'Operator':(e.role==='other'?'':'');
      h+=`<tr>`+
        `<td class="c0">${i+1}</td>`+
        `<td class="c1" style="background:${col}">${esc(teamShort(tm))}</td>`+
        `<td class="c2">${esc(e.id)}</td>`+
        `<td class="c3">${esc(e.name||'(chưa đặt tên)')}</td>`+
        `<td class="c4">${esc(posLabel(posCode(e))||roleLbl)}</td>`;
      days.forEach(iso=>{
        const r=getCode(e.id,iso);
        const editable=C.real&&mgr;
        const style=(diffOnly&&!r.ovr)?'':cellStyle(r.code);
        h+=`<td class="cell${editable?' editable':''}${r.ovr?' ovr diff':''}${r.o&&r.o.prov?' prov':''}${iso===tIso?' today':''}" style="${style}" ${editable?`onclick="openCell('${e.id}','${iso}')"`:''}>${r.code||''}</td>`;
      });
      h+='</tr>';
    });
  });
  h+='</tbody><tfoot><tr><td class="lbl" colspan="5">Σ D / N / O</td>';
  days.forEach(iso=>{
    let cD=0,cN=0,cO=0;
    /* Ca kép đếm theo nửa CA CHUẨN (workCodeOf) — người trực O rồi tăng ca đêm
       vẫn là một đầu người của ca O hôm đó. */
    emps.forEach(e=>{const c=workCodeOf(getCode(e.id,iso).code);
      if(c==='D'||c==='SD'||c==='OTD')cD++;else if(c==='N'||c==='SN'||c==='OTN')cN++;else if(c==='O'||c==='SO')cO++;});
    const low=(cD<S.settings.minD||cN<S.settings.minN);
    h+=`<td class="${iso===tIso?'today':''}" style="${low?'color:#DC2626':''}">${cD}/${cN}/${cO}</td>`;
  });
  h+='</tr></tfoot></table>';
  $(C.box).innerHTML=h;
}
function renderLegend(elId){
  if(!$(elId))return;
  const L=[['O','Office (08–17h)'],['D','Day time (08–20h)'],['N','Night time (20–08h)'],['R','Rest']];
  let s=L.map(([c,d])=>`<span class="lg"><span class="box" style="${cellStyle(c)}">${c}</span>${d}</span>`).join('');
  s+=allCodes().filter(c=>c.cat==='leave'||c.cat==='ot'||c.cat==='combo').map(c=>(c.cat==='combo'
      ? `<span class="lg">${chip(c.c)}${c.l}</span>`                       /* ca kép vẽ chip 2 nửa */
      : `<span class="lg"><span class="box" style="background:${c.col};color:#fff">${c.c}</span>${c.l}</span>`)).join('');
  $(elId||'legend').innerHTML=s;
}
function fillGroupFilter(selId){
  selId=selId||'calGroupFilter';
  const el=$(selId);if(!el)return;
  const cur=el.value;
  const teams=teamList();
  el.innerHTML='<option value="__all">Tất cả nhóm</option>'+teams.map(t=>`<option value="${esc(t)}">Nhóm ${esc(t||'(chưa phân nhóm)')}</option>`).join('');
  el.value=(cur&&(cur==='__all'||teams.includes(cur)))?cur:'__all';
}
/* cell editing (manager) */
function openCell(empId,iso){
  if(!mgr)return;
  curCell={empId,iso};
  const e=empById(empId);
  $('cellTitle').innerHTML=`${esc(e.name||empId)} — ${fmtVNfull(iso)} (${dowOf(iso)})<br><span class="muted" style="font-weight:500">Ca chuẩn: ${S.base[empId]&&S.base[empId][iso]||'—'}</span>`;
  $('cellPick').innerHTML=allCodes().map(c=>`<button onclick="setCell('${c.c}')">${chip(c.c,1)}<span>${c.l}</span></button>`).join('')
   +`<button onclick="setCell('')" style="grid-column:span 2">⌫ Xoá ô (trống)</button>`;
  $('cellMask').classList.add('on');
}
function closeCell(){$('cellMask').classList.remove('on');curCell=null;}
/* ------------------------------------------------------------
   SỬA Ô LỊCH THỰC TẾ
   Đổi ca của người khác → gửi thông báo xác nhận. Nhưng nếu sau đó
   quản lý ĐỔI Ý và trả ô về đúng ca chuẩn, thông báo cũ phải được
   THU HỒI — trước đây nó nằm lại khiến nhân viên vẫn thấy "cần xác
   nhận" cho một thay đổi không còn tồn tại. Xem revokeSchedChange()
   ở js/13-portal.js: chưa xác nhận thì thu hồi lặng lẽ, đã xác nhận
   rồi thì báo lại cho nhân viên biết là thay đổi đã bị huỷ.
   ------------------------------------------------------------ */
function setCell(code){
  if(!curCell)return;
  const{empId,iso}=curCell;
  const oldCode=eff(empId,iso).code;              // ca trước khi sửa (để nhân viên đối chiếu)
  const stdCode=(S.base[empId]&&S.base[empId][iso])||'';   // ca chuẩn của ngày này
  if(code===null){if(S.over[empId])delete S.over[empId][iso];}
  else{S.over[empId]=S.over[empId]||{};S.over[empId][iso]={code:code,by:meId()||'manager',at:Date.now()};}
  const newCode=(code===null)?stdCode:code;       // ca sau khi sửa
  let revoked=0;
  if(newCode===stdCode){
    /* Đã trả về đúng lịch chuẩn → không còn gì để nhân viên xác nhận */
    if(typeof revokeSchedChange==='function')revoked=revokeSchedChange(empId,iso,stdCode);
  }else if(code&&code!==oldCode&&empId!==meId()&&typeof newNotif==='function'){
    // Đổi sang mã khác → gộp vào thông báo đang chờ cho cùng người + ngày (tránh spam)
    let ex=Object.values(S.notifs||{}).find(n=>n.kind==='schedChange'&&n.to===empId&&n.iso===iso&&n.status==='pending');
    if(ex){ex.newCode=code;ex.from=meId()||'manager';ex.createdAt=Date.now();}
    else newNotif({kind:'schedChange',to:empId,from:meId()||'manager',iso,oldCode:oldCode||'',newCode:code});
  }
  save();closeCell();renderReal();
  toast(revoked?t('Đã trả về ca chuẩn và thu hồi thông báo')
               :t('Đã cập nhật lịch thực tế'));
}

/* =================== v4: LỊCH — THẺ TUẦN (mobile) & NHÂN LỰC THEO NGÀY (mobile) =================== */
function calDaysForCurrentFilter(){
  const ym=$('calMonth').value;if(!ym)return[];
  let days=daysOfPeriod(ym);
  const rg=$('calRange').value;
  if(rg==='p1')days=days.filter(iso=>+iso.slice(8)>=21);
  else if(rg==='p2')days=days.filter(iso=>{const d=+iso.slice(8);return d>=1&&d<=10;});
  else if(rg==='p3')days=days.filter(iso=>{const d=+iso.slice(8);return d>=11&&d<=20;});
  return days;
}
function weeksFromDays(days){
  if(!days.length)return[];
  const start=new Date(days[0]+'T00:00:00'),end=new Date(days[days.length-1]+'T00:00:00');
  const wd=(start.getDay()+6)%7;const wkStart=new Date(start);wkStart.setDate(start.getDate()-wd);
  const weeks=[];let d=new Date(wkStart);
  while(d<=end){
    const wk=[];
    for(let i=0;i<7;i++){const iso=isoOf(d);wk.push({iso,inRange:iso>=days[0]&&iso<=days[days.length-1]});d.setDate(d.getDate()+1);}
    weeks.push(wk);
  }
  return weeks;
}
function isoWeekNum(iso){
  const d=new Date(iso+'T00:00:00');
  const onejan=new Date(d.getFullYear(),0,1);
  return Math.ceil((((d-onejan)/86400000)+onejan.getDay()+1)/7);
}
function toggleCalGroup(key){calCollapsed[key]=!calCollapsed[key];renderCalWeekCards();}
/* Ấn vào thanh tuần → ẩn / hiện cả tuần đó */
let calWkHidden={};
function toggleCalWeek(key){calWkHidden[key]=!calWkHidden[key];renderCalWeekCards();}
function calCollapseAll(){
  const keys=teamList().map(t=>t||'__none');
  const allCollapsed=keys.length&&keys.every(k=>calCollapsed[k]);
  keys.forEach(k=>{calCollapsed[k]=!allCollapsed;});
  renderCalWeekCards();
}
function renderCalWeekCards(){
  const box=$('calWeekBox');if(!box)return;
  const days=calDaysForCurrentFilter();
  if(!days.length){box.innerHTML='<p class="muted" style="padding:16px">Chưa có lịch. Vào 🛠️ Nhóm &amp; Lịch để tạo nhóm và điền lịch.</p>';return;}
  const fGrp=$('calGroupFilter').value;
  let emps=schedEmps();if(fGrp&&fGrp!=='__all')emps=emps.filter(e=>(e.team||'')===fGrp);
  const meIdCur=meId();
  const byTeam={};emps.forEach(e=>{const t=e.team||'';(byTeam[t]=byTeam[t]||[]).push(e);});
  const teams=[];emps.forEach(e=>{const t=e.team||'';if(!teams.includes(t))teams.push(t);});
  const real=calMode==='real';
  const diffOnly=real&&$('realDiffOnly').checked;
  const getCode=real?(id,iso)=>eff(id,iso):(id,iso)=>({code:(S.base[id]&&S.base[id][iso])||'',ovr:false});
  const weeks=weeksFromDays(days);
  const tIso=todayIso();
  let firstOpenIdx=-1;
  let h='';
  let nWkSkipped=0;
  weeks.forEach((wk,wi)=>{
    /* "Chỉ ô khác chuẩn": tuần không có ô nào khác lịch chuẩn thì bỏ hẳn */
    const wkDiffOf=e=>wk.some(w=>w.inRange&&getCode(e.id,w.iso).ovr);
    if(diffOnly&&!emps.some(wkDiffOf)){nWkSkipped++;return;}
    if(wk.some(w=>w.iso===tIso))firstOpenIdx=wi;
    const wkKey=wk[0].iso;
    const hidden=!!calWkHidden[wkKey];
    h+=`<div class="wk-card" id="wkc${wi}">
      <div class="wk-head clickable${hidden?' closed':''}" onclick="toggleCalWeek('${wkKey}')" title="Chạm để ${hidden?'mở':'ẩn'} tuần này">
        Tuần ${isoWeekNum(wk[0].iso)} · ${fmtVN(wk[0].iso)} – ${fmtVN(wk[6].iso)}
        <span class="chevS">${hidden?'▸':'▾'}</span></div>`;
    if(hidden){h+='</div>';return;}
    h+='<div class="wk-dow"><span></span>'+wk.map(w=>{const dw=new Date(w.iso+'T00:00:00').getDay();return `<span class="${w.iso===tIso?'today':''}">${dowOf(w.iso)} ${+w.iso.slice(8)}</span>`;}).join('')+'</div>';
    teams.forEach(tm=>{
      let mem=byTeam[tm];
      const key=tm||'__none';
      /* Thu gọn: chỉ giữ người có ô khác chuẩn trong tuần này */
      if(diffOnly){
        mem=mem.filter(wkDiffOf);
        if(!mem.length)return;
      }
      if(!(key in calCollapsed)){
        const defOpen=mgr?true:mem.some(e=>e.id===meIdCur);
        calCollapsed[key]=!defOpen;
      }
      const collapsed=diffOnly?false:calCollapsed[key];   // đang lọc khác chuẩn thì mở hết cho thấy ngay
      const sumTxt=wk.map(w=>{
        if(!w.inRange)return '';
        const cnt={};mem.forEach(e=>{const c=getCode(e.id,w.iso).code;if(c)cnt[c]=(cnt[c]||0)+1;});
        const parts=Object.entries(cnt).map(([c,n])=>n+c);
        return parts.length?parts.join('·'):'—';
      });
      h+=`<div class="wk-grp"><div class="wk-grp-head${collapsed?'':' open'}" onclick="toggleCalGroup('${esc(key)}')">
        <div class="nm">${esc(tm?('Nhóm '+tm):'(chưa phân nhóm)')}<span class="chevS">▾</span></div>`
        +sumTxt.map(s=>`<div class="sm">${s}</div>`).join('')+'</div>';
      if(!collapsed){
        mem.forEach(e=>{
          h+=`<div class="wk-row"><div class="nm">${esc(e.name||e.id)}</div>`;
          wk.forEach(w=>{
            if(!w.inRange){h+='<div class="cellc"></div>';return;}
            const r=getCode(e.id,w.iso);
            const editable=real&&mgr;
            const cls=['cellc'];
            if(w.iso===tIso)cls.push('wk-cell-today');
            if(r.ovr)cls.push('wk-cell-diff wk-cell-ovr');
            if(diffOnly&&!r.ovr){h+=`<div class="${cls.join(' ')} dim">${r.code?`<span class="mini">${r.code}</span>`:''}</div>`;return;}
            h+=`<div class="${cls.join(' ')}" ${editable?`onclick="openCell('${e.id}','${w.iso}')"`:''}>${r.code?chip(r.code):''}</div>`;
          });
          h+='</div>';
        });
      }
      h+='</div>';
    });
    h+='</div>';
  });
  if(diffOnly&&nWkSkipped&&!h)h='<p class="muted" style="padding:16px">Kỳ này chưa có ô nào khác lịch chuẩn.</p>';
  else if(diffOnly&&nWkSkipped)h+=`<p class="muted sm2" style="padding:4px 8px">Đã ẩn ${nWkSkipped} tuần không có thay đổi so với lịch chuẩn.</p>`;
  box.innerHTML=h;
  if(firstOpenIdx>=0&&!box._scrolled){
    box._scrolled=true;
    setTimeout(()=>{const el=$('wkc'+firstOpenIdx);if(el)el.scrollIntoView({block:'center',behavior:'smooth'});},80);
  }
}

/* ============================================================
   LỊCH TUẦN TRÊN ĐIỆN THOẠI — LƯỚI NGƯỜI × 7 NGÀY
   ------------------------------------------------------------
   Ma trận cả kỳ (30 cột) không thể nhét vừa màn hình điện thoại.
   Bố cục này cắt xuống ĐÚNG MỘT TUẦN: mỗi hàng là một người, mỗi
   cột là một ngày — nhìn ngang biết lịch của mình cả tuần, nhìn dọc
   biết hôm đó cả nhóm ai trực ca gì.

   · Mặc định mở đúng NHÓM của người đang đăng nhập (quản lý chưa có
     nhóm thì mở nhóm đầu tiên) — vào là thấy ngay việc của mình.
   · Nút ◀ ▶ đi tới tuần khác, nút "Tuần này" quay về hiện tại.
   · Hàng chip nhóm ở trên: chạm để xem thêm / bớt nhóm khác.
   · Ngày có SỰ KIỆN (js/20-events.js) tô màu riêng ở đầu cột.
   ============================================================ */
let calWkMon='';           // thứ Hai của tuần đang xem
let calWkTeams=null;       // nhóm nào đang hiện (null = chưa khởi tạo → lấy nhóm của mình)

function calWkMonday(){return calWkMon||(calWkMon=mondayOf(todayIso()));}
function calWkShift(d){calWkMon=addDaysIso(calWkMonday(),7*d);renderCalWeekGrid();}
function calWkToday(){calWkMon=mondayOf(todayIso());renderCalWeekGrid();}
/* Nhóm mặc định: nhóm của người đang đăng nhập; không có thì nhóm đầu danh sách */
function calWkDefaultTeams(){
  const me=empById(meId());
  const all=teamList();
  if(me&&all.includes(me.team||''))return [me.team||''];
  return all.length?[all[0]]:[];
}
function calWkToggleTeam(tm){
  if(!calWkTeams)calWkTeams=calWkDefaultTeams();
  const i=calWkTeams.indexOf(tm);
  if(i<0)calWkTeams.push(tm);
  else if(calWkTeams.length>1)calWkTeams.splice(i,1);   // luôn chừa lại ít nhất 1 nhóm
  else{toast(t('Phải giữ ít nhất một nhóm'));return;}
  renderCalWeekGrid();
}
function calWkAllTeams(){calWkTeams=teamList().slice();renderCalWeekGrid();}
function calWkMineOnly(){calWkTeams=calWkDefaultTeams();renderCalWeekGrid();}

function renderCalWeekGrid(){
  const box=$('calWkGrid');if(!box)return;
  const mon=calWkMonday();
  const days=Array.from({length:7},(_,i)=>addDaysIso(mon,i));
  const allTeams=teamList();
  if(!calWkTeams||!calWkTeams.length)calWkTeams=calWkDefaultTeams();
  const showTeams=calWkTeams.filter(tm=>allTeams.includes(tm));
  if(!showTeams.length&&allTeams.length)showTeams.push(allTeams[0]);

  const real=calMode==='real';
  const getCode=real?(id,iso)=>eff(id,iso):(id,iso)=>({code:(S.base[id]&&S.base[id][iso])||'',ovr:false});
  const tIso=todayIso(), meCur=meId();
  const evOn=typeof eventsOfDay==='function';

  /* --- thanh điều hướng tuần --- */
  let h=`<div class="cwg-nav">
    <button class="btn sec sm" onclick="calWkShift(-1)" title="${t('Tuần trước')}">◀</button>
    <div class="cwg-lbl"><b>${t('Tuần')} ${isoWeekNum(mon)}</b><i>${fmtVN(mon)} – ${fmtVN(days[6])}</i></div>
    <button class="btn sec sm" onclick="calWkShift(1)" title="${t('Tuần sau')}">▶</button>
    <button class="btn sec sm" onclick="calWkToday()">${t('Tuần này')}</button>
  </div>`;

  /* --- chip chọn nhóm: mặc định nhóm của mình, chạm để xem thêm nhóm khác --- */
  h+=`<div class="cwg-teams">
    ${allTeams.map(tm=>`<button type="button" class="tchip${showTeams.includes(tm)?' on':''}"
        style="--tc:${teamColor(tm)}" onclick="calWkToggleTeam('${esc(tm)}')">${
        esc(tm?t('Nhóm')+' '+tm:t('(chưa nhóm)'))}</button>`).join('')}
    <button type="button" class="tchip act" onclick="calWkAllTeams()">${t('Tất cả')}</button>
    <button type="button" class="tchip act" onclick="calWkMineOnly()">${t('Nhóm của tôi')}</button>
  </div>`;

  /* --- sự kiện trong tuần: dải nhắc ở trên đầu --- */
  if(typeof evBannerHtml==='function')h+=evBannerHtml(days);

  /* --- lưới --- */
  let body='';
  showTeams.forEach(tm=>{
    const mem=schedEmps().filter(e=>(e.team||'')===tm);
    if(!mem.length)return;
    body+=`<div class="cwg-grp" style="--tc:${teamColor(tm)}">${
      esc(tm?t('Nhóm')+' '+tm:t('(chưa phân nhóm)'))} <i>${mem.length} ${t('người')}</i></div>`;
    mem.forEach(e=>{
      body+=`<div class="cwg-row${e.id===meCur?' me':''}">
        <div class="nm" title="${esc(e.name||e.id)}">${esc(shortName(e.name)||e.id)}</div>`;
      days.forEach(iso=>{
        const r=getCode(e.id,iso);
        const editable=real&&mgr;
        const act=editable?`onclick="openCell('${e.id}','${iso}')"`
                          :(noSelf?'':`onclick="openDaySheet('${iso}')"`);
        body+=`<div class="c${iso===tIso?' today':''}${r.ovr?' ovr':''}${r.o&&r.o.prov?' prov':''}${
          evOn&&eventsOfDay(iso).length?' ev':''}" ${act}>${r.code?chip(r.code):'<i class="dash">—</i>'}</div>`;
      });
      body+='</div>';
    });
  });

  const hdr=`<div class="cwg-row hd"><div class="nm"></div>${days.map(iso=>{
      const dw=new Date(iso+'T00:00:00').getDay();
      const ev=evOn?eventsOfDay(iso):[];
      return `<div class="c${iso===tIso?' today':''}${dw===0||dw===6?' we':''}${ev.length?' ev':''}"
        ${ev.length?`title="📌 ${esc(evTitleOfDay(iso))}"`:''}>
        <b>${dowOf(iso)}</b><i>${+iso.slice(8)}</i>${ev.length?'<u class="evd">📌</u>':''}</div>`;
    }).join('')}</div>`;

  h+=body?`<div class="cwg">${hdr}${body}</div>`
        :`<div class="card"><p class="muted">${t('Nhóm này chưa có ai trong lịch ca.')}</p></div>`;
  h+=`<p class="muted sm2" style="padding:6px 4px">${
    (real&&mgr)?t('Chạm vào ô để sửa ca thực tế.')
               :(noSelf?'':t('Chạm vào ô để xem chi tiết ngày và gửi đơn.'))}</p>`;
  box.innerHTML=h;
}

/* Nhân lực theo ngày (mobile) */
function calDayShift(d){const dt=new Date((calDate||todayIso())+'T00:00:00');dt.setDate(dt.getDate()+d);calDate=isoOf(dt);renderCalDayView();}
function calDaySet(v){if(v){calDate=v;renderCalDayView();}}
function renderCalDayView(){
  const box=$('calDayBox');if(!box)return;
  const iso=calDate||todayIso();
  const B=mpBuckets(iso);
  const lowD=B.D.length<S.settings.minD,lowN=B.N.length<S.settings.minN;
  const dw=new Date(iso+'T00:00:00').getDay();
  const reqToday=Object.values(S.requests).filter(r=>r.status==='approved'&&reqHasDay(r,iso));
  const tagFor=id=>{const r=reqToday.find(x=>x.empId===id||x.withId===id);return r?` <span class="grp-tag">${(r.type||'').toUpperCase()}</span>`:'';};
  const grpText=arr=>{
    const g={};arr.forEach(e=>{const t=e.team||'(chưa phân nhóm)';(g[t]=g[t]||[]).push(e);});
    return Object.entries(g).map(([t,list])=>`<b>${esc(t)}</b>: `+list.map(e=>mgr
      ?`<a href="javascript:void(0)" onclick="openCell('${e.id}','${iso}')" style="color:var(--brand);font-weight:700;text-decoration:underline">${esc(e.name||e.id)}</a>${tagFor(e.id)}`
      :esc(e.name||e.id)+tagFor(e.id)).join(', ')).join(' · ')||'—';
  };
  let h=`<div class="dv-head">
    <div class="dv-nav">
      <button class="btn sec sm" onclick="calDayShift(-1)">◀ hôm qua</button>
      <input type="date" class="inp sm" style="width:auto" value="${iso}" onchange="calDaySet(this.value)">
      <button class="btn sec sm" onclick="calDayShift(1)">ngày mai ▶</button>
    </div>
    <div class="dv-sum">Ngày ${fmtVN(iso)} · ${dowOf(iso)}
      &nbsp;·&nbsp;D: <b class="${lowD?'low':''}">${B.D.length}</b>
      &nbsp;·&nbsp;N: <b class="${lowN?'low':''}">${B.N.length}</b>
      &nbsp;·&nbsp;O: ${B.O.length}
      &nbsp;·&nbsp;Nghỉ/Phép: ${B.R.length+B.leave.length}
      ${(lowD||lowN)?' <span style="color:#DC2626;font-weight:800">⚠ thiếu nhân lực</span>':''}
    </div>
  </div>`;
  h+=`<div class="dv-shift"><h4>${chip('D')} Ca ngày (${B.D.length})</h4><div class="grpline">${grpText(B.D)}</div></div>`;
  h+=`<div class="dv-shift"><h4>${chip('N')} Ca đêm (${B.N.length})</h4><div class="grpline">${grpText(B.N)}</div></div>`;
  h+=`<div class="dv-shift"><h4>${chip('O')} Văn phòng (${B.O.length})</h4><div class="grpline">${grpText(B.O)}</div></div>`;
  h+=`<div class="dv-shift"><h4>${chip('R')} Nghỉ ca (${B.R.length}) <span class="muted" style="font-weight:500">— có thể huy động tăng ca</span></h4><div class="grpline">${grpText(B.R)}</div></div>`;
  if(B.leave.length)h+=`<div class="dv-shift"><h4>${chip('AL8')} Nghỉ phép (${B.leave.length})</h4><div class="grpline">${B.leave.map(x=>esc(x.e.name||x.e.id)+' ('+x.c+')').join(', ')}</div></div>`;
  if(B.ot.length)h+=`<div class="dv-shift"><h4>${chip('OTD')} Tăng ca (${B.ot.length})</h4><div class="grpline">${B.ot.map(x=>esc(x.e.name||x.e.id)+' ('+x.c+')').join(', ')}</div></div>`;
  if(mgr)h+='<p class="muted">Chạm tên (gạch chân) để mở sheet chỉnh ca thực tế ngày này.</p>';
  box.innerHTML=h;
}
