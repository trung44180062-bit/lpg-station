/* ============================================================
   ĐẶT CƠM TĂNG CA
   LPGT Cavern — Quản lý Công Ca v5.6
   ------------------------------------------------------------
   Công ty nấu 4 bữa cố định trong ngày:
        06:00 sáng · 12:00 trưa · 18:00 tối · 22:00 khuya
   Người có LỊCH CA đã được nhà bếp book cơm sẵn theo ca:
        ca D 08–20 → trưa + tối
        ca N 20–08 → khuya + sáng (bữa sáng rơi sang NGÀY HÔM SAU)
        ca O 08–17 → trưa
        R / nghỉ phép → không có suất nào
   Vấn đề: khi phát sinh TĂNG CA, người đó ăn thêm bữa mà bếp
   chưa biết. Module này tính đúng phần PHÁT SINH THÊM đó —
   lấy các mốc bữa ăn nằm trong khung giờ tăng ca, TRỪ đi những
   bữa mà ca chuẩn hôm đó (và ca đêm hôm trước vắt sang) đã book.

   Chỉ TÍNH và XEM — KHÔNG ghi lên Firebase, không đổi schema.
   Con số cộng/trừ tay chỉ sống trong phiên làm việc (mealAdj),
   đóng app là mất; mục đích là để chốt số rồi copy / xuất Excel
   gửi cho nhà bếp.
   ============================================================ */

/* ---------- 1. Định nghĩa bữa ăn ---------- */
const MEAL_DEFS=[
  {v:'bf', l:'Ăn sáng',  short:'Sáng',  time:'06:00', min:360,  ic:'🌅', col:'#F59E0B'},
  {v:'ln', l:'Ăn trưa',  short:'Trưa',  time:'12:00', min:720,  ic:'🍚', col:'#16A34A'},
  {v:'dn', l:'Ăn tối',   short:'Tối',   time:'18:00', min:1080, ic:'🌆', col:'#2563EB'},
  {v:'ng', l:'Ăn khuya', short:'Khuya', time:'22:00', min:1320, ic:'🌙', col:'#7C3AED'}
];
const MEAL_KEYS=MEAL_DEFS.map(m=>m.v);
function mealDef(v){return MEAL_DEFS.find(m=>m.v===v)||{v,l:v,short:v,time:'',min:0,ic:'🍽️',col:'#64748B'};}

/* ---------- 2. Khung giờ ca & khung giờ tăng ca ----------
   Đơn vị: PHÚT tính từ 00:00 của ngày ô lịch. Ca đêm kết thúc
   08:00 hôm sau = 1920 phút (24h × 60 + 480). */
const SHIFT_WIN={D:[480,1200], N:[1200,1920], O:[480,1020]};
/* Mã tăng ca không kèm mốc giờ (quản lý điền tay vào ô lịch) thì suy theo mẫu */
const OT_CODE_WIN={OTL:[720,780], OT2:[1080,1200], OT3:[1020,1200], OTD:[480,1200], OTN:[1200,1920]};

function hm2min(s){
  const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||'').trim());
  return m?(+m[1])*60+(+m[2]):null;
}
function isoDiffDays(a,b){
  if(!a||!b)return 0;
  return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);
}
/* Khung giờ ca CHUẨN của một mã ca (chỉ ca làm việc / ca đổi, OT tính riêng) */
function baseShiftWin(code){
  if(!code)return null;
  /* Ca kép: phần CA CHUẨN cho khung giờ ca, phần tăng ca do otBlocksOf lo */
  const cb=(typeof comboOf==='function')&&comboOf(code);
  if(cb)code=cb.work;
  else{
    const cat=codeInfo(code).cat;
    if(cat!=='work'&&cat!=='swap')return null;
  }
  const b=baseShiftOf(code);
  return (b&&SHIFT_WIN[b])?SHIFT_WIN[b].slice():null;
}
/* Các mốc bữa ăn nằm trong một khung giờ.
   Mốc ĐÚNG BẰNG giờ bắt đầu vẫn tính (tăng ca 18:00–20:00 thì ăn bữa tối). */
function mealsInWin(iso,win){
  const out=[];
  if(!win||!iso)return out;
  MEAL_DEFS.forEach(m=>{
    for(let d=0;d<=1;d++){
      const abs=m.min+d*1440;
      if(abs>=win[0]&&abs<win[1])out.push({iso:addDaysIso(iso,d),v:m.v,at:abs});
    }
  });
  return out;
}
/* Khung giờ của MỘT DÒNG tăng ca trong đơn */
function otWinFromRow(d){
  const s=hm2min(d.timeIn), e=hm2min(d.timeOut);
  if(s!=null&&e!=null){
    let end=e;
    const gap=(d.isoEnd&&d.isoEnd>d.iso)?isoDiffDays(d.iso,d.isoEnd):0;
    if(gap>0)end=e+1440*gap;
    else if(end<=s)end+=1440;          // bỏ trống ngày kết thúc → hiểu là qua nửa đêm
    return (end>s&&end-s<=1440*3)?[s,end]:null;
  }
  return OT_CODE_WIN[d.code]?OT_CODE_WIN[d.code].slice():null;
}
function winLabel(win){
  if(!win)return '';
  const f=n=>String(Math.floor((n%1440)/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  return f(win[0])+'–'+f(win[1])+(win[1]>1440?' (+1)':'');
}

/* ---------- 3. Các lần tăng ca của một người trong một ngày ----------
   Nguồn DUY NHẤT có mốc giờ là ĐƠN tăng ca (r.days[].timeIn/timeOut) —
   ô lịch thực tế chỉ lưu mã ca + tổng số giờ. Không có đơn nào khớp thì
   mới suy khung giờ từ mã ca trong ô lịch. */
/* Quét toàn bộ S.requests cho TỪNG người TỪNG ngày thì rất tốn (badge vẽ lại
   sau mỗi lần render). Nên đánh chỉ mục một lần theo khoá "mã NV|ngày",
   nhớ theo S.rev — hễ dữ liệu đổi là S.rev tăng, chỉ mục tự dựng lại. */
let _otIdx=null, _otIdxRev=-1;
function mealResetCache(){_otIdx=null;_otIdxRev=-1;}
function otIndex(){
  if(_otIdx&&_otIdxRev===S.rev)return _otIdx;
  const idx={}, R=S.requests||{};
  for(const id in R){
    const r=R[id];
    if(!r||r.type!=='ot'||r.status==='rejected')continue;
    reqDays(r).forEach(d=>{
      const w=otWinFromRow(d);
      if(!w)return;
      const k=r.empId+'|'+d.iso;
      (idx[k]=idx[k]||[]).push({win:w,st:r.status||'pending',code:d.code||'',
        reqId:r.id,src:'req',hours:d.hours||otHours(d.iso,d.timeIn,d.isoEnd,d.timeOut)||0});
    });
  }
  _otIdx=idx;_otIdxRev=S.rev;
  return idx;
}
function otBlocksOf(empId,iso,inclPending){
  const hit=otIndex()[empId+'|'+iso]||[];
  let out=inclPending?hit:hit.filter(b=>b.st!=='pending');
  /* Chỉ suy từ ô lịch khi KHÔNG có đơn nào — có đơn mà người dùng chọn lọc bỏ
     đơn chờ duyệt thì phải ra 0 suất, không được rơi xuống nhánh dưới. */
  if(!hit.length){
    out=[];
    const c=eff(empId,iso).code;
    /* Ca kép: lấy khung giờ của nửa TĂNG CA (O+N → khung ca đêm) */
    const oc=c?otCodeOf(c):'';
    if(oc&&OT_CODE_WIN[oc]){
      const sp=comboSplitHours(c,effHours(empId,iso));
      out.push({win:OT_CODE_WIN[oc].slice(),st:'approved',code:oc,reqId:'',src:'cell',
                hours:(sp?sp.ot:effHours(empId,iso))||0});
    }
  }
  return out;
}

/* ============================================================
   4. SO LỊCH CHUẨN ↔ LỊCH THỰC TẾ
   ------------------------------------------------------------
   Bếp đặt cơm MỘT LẦN từ đầu kỳ theo BẢNG LỊCH CHUẨN (S.base).
   Trong kỳ mới phát sinh: tăng ca, đổi ca, nghỉ phép đột xuất,
   quản lý sửa tay ô lịch… → LỊCH THỰC TẾ (base + over + đơn đã
   duyệt) khác lịch chuẩn. Chênh lệch giữa hai bên chính là phần
   phải báo bếp:
        thực tế CÓ mà chuẩn KHÔNG  → đặt THÊM suất
        chuẩn CÓ mà thực tế KHÔNG  → BỚT suất (bếp khỏi nấu)
   Ví dụ: chuẩn ca D (trưa+tối) mà xin nghỉ phép cả ngày → bớt 2
   suất; chuẩn ca R mà vào trực thay ca D → thêm 2 suất; đang ca O
   mà tăng ca 17–20 → thêm 1 suất tối.
   ============================================================ */

/* Suất bếp ĐÃ ĐẶT từ đầu kỳ — theo lịch chuẩn */
function plannedMealsOf(empId,iso){
  return mealsInWin(iso,baseShiftWin((S.base[empId]||{})[iso]||''));
}
/* Suất THỰC SỰ phải ăn — theo lịch thực tế + các lần tăng ca */
function actualMealsOf(empId,iso,inclPending){
  const out={}, push=(x,info)=>{const k=x.iso+'|'+x.v;if(!out[k])out[k]=Object.assign({iso:x.iso,v:x.v},info);};
  /* Ca thực tế hôm đó. Ô lịch bị mã tăng ca ghi đè thì ca nền vẫn là ca chuẩn. */
  let code=eff(empId,iso).code;
  if(code&&codeInfo(code).cat==='ot')code=(S.base[empId]||{})[iso]||'';
  else if(code)code=workCodeOf(code);      // ca kép → lấy nửa ca chuẩn
  mealsInWin(iso,baseShiftWin(code)).forEach(x=>push(x,{why:'shift',code,st:'approved'}));
  otBlocksOf(empId,iso,inclPending).forEach(b=>{
    mealsInWin(iso,b.win).forEach(x=>push(x,{why:'ot',code:b.code,win:b.win,st:b.st,reqId:b.reqId,src:b.src}));
  });
  return Object.keys(out).map(k=>out[k]);
}
/* Chênh lệch của MỘT NGƯỜI trên một dải ngày nguồn.
   Trả về mảng {iso, v, d:+1|-1, why, code, win, st, planCode, realCode, dayIso}
   — `iso` là NGÀY ĂN thật (ca đêm thì bữa sáng rơi sang hôm sau). */
function mealDiffOf(empId,srcDays,inclPending){
  const plan={}, act={}, src={};
  srcDays.forEach(iso=>{
    plannedMealsOf(empId,iso).forEach(x=>{plan[x.iso+'|'+x.v]=iso;});
    actualMealsOf(empId,iso,inclPending).forEach(x=>{
      const k=x.iso+'|'+x.v;
      /* Cùng một bữa mà vừa do ca vừa do tăng ca thì ghi nhận theo ca (nguồn chính) */
      if(!act[k]||act[k].why==='ot')act[k]=x;
      src[k]=iso;
    });
  });
  const out=[];
  const keys=new Set([...Object.keys(plan),...Object.keys(act)]);
  keys.forEach(k=>{
    const hasP=!!plan[k], hasA=!!act[k];
    if(hasP===hasA)return;                       // không đổi → bếp khỏi làm gì
    const [iso,v]=k.split('|');
    const dayIso=hasA?src[k]:plan[k];
    const a=act[k]||{};
    out.push({iso,v,d:hasA?1:-1,why:a.why||'shift',code:a.code||'',win:a.win||null,
      st:a.st||'approved',dayIso,
      planCode:(S.base[empId]||{})[dayIso]||'',
      realCode:eff(empId,dayIso).code||''});
  });
  return out;
}

/* ---------- 5. Tổng hợp cả tổ trong một khoảng ngày ---------- */
/* opt = {from, to, team, onlyMe, inclPending}
   Ngày NGUỒN quét thêm hôm trước `from` để bắt ca đêm vắt sang, và hiện thêm
   ngày sau `to` nếu có suất rơi vào đó. */
function mealPlan(opt){
  opt=opt||{};
  const inclPending=opt.inclPending!==false;
  const meCur=meId();
  let emps=schedEmps();
  if(opt.onlyMe)emps=emps.filter(e=>e.id===meCur);
  else if(opt.team&&opt.team!=='__all')emps=emps.filter(e=>String(e.team||'')===opt.team);

  const days=[], srcDays=[];
  let d=new Date(opt.from+'T00:00:00');
  const end=new Date(opt.to+'T00:00:00');
  let guard=0;
  while(d<=end&&guard++<120){days.push(isoOf(d));d.setDate(d.getDate()+1);}
  if(!days.length)return {days:[],byDay:{},rows:[],add:0,cut:0,total:0,nPend:0,emps:emps.length};
  srcDays.push(addDaysIso(days[0],-1),...days);          // ca đêm hôm trước vắt sang
  const tail=addDaysIso(days[days.length-1],1);          // tăng ca ngày cuối vắt sang

  const byDay={}, rows=[];
  let add=0, cut=0, nPend=0;
  const mk=()=>({bf:[],ln:[],dn:[],ng:[]});
  days.concat([tail]).forEach(iso=>{byDay[iso]=mk();});
  emps.forEach(e=>{
    mealDiffOf(e.id,srcDays,inclPending).forEach(x=>{
      const cell=byDay[x.iso];
      if(!cell)return;                                   // rơi ra ngoài khoảng đang xem
      const rec={empId:e.id,name:e.name||e.id,team:e.team||'',posg:posGroupOf(e),
        iso:x.iso,v:x.v,d:x.d,why:x.why,code:x.code,win:x.win,st:x.st,
        dayIso:x.dayIso,planCode:x.planCode,realCode:x.realCode};
      cell[x.v].push(rec);rows.push(rec);
      if(x.d>0){add++;if(x.st==='pending')nPend++;}else cut++;
    });
  });
  /* Ngày đuôi chỉ hiện khi thực sự có suất rơi vào */
  if(MEAL_KEYS.every(v=>!byDay[tail][v].length))delete byDay[tail];
  else days.push(tail);
  return {days,byDay,rows,add,cut,total:add,nPend,emps:emps.length};
}
/* Đếm suất của một ô (ngày × bữa): thêm / bớt */
function mealCell(P,iso,v){
  const list=(P.byDay[iso]&&P.byDay[iso][v])||[];
  let add=0,cut=0,pend=0;
  list.forEach(r=>{if(r.d>0){add++;if(r.st==='pending')pend++;}else cut++;});
  return {list,add,cut,pend};
}

/* ============================================================
   POPUP CƠM PHÁT SINH
   Mở từ nút 🍚 trên thanh tab Lịch. Ai cũng xem được.
   ============================================================ */
let mealFrom='', mealTo='', mealTeam='__all', mealOnlyMe=false, mealPend=true;
let mealOpenDay='';                 // ngày đang bung chi tiết
let mealAdj={};                     // mealAdj[iso][v] = số suất cộng/trừ tay (chỉ trong phiên)

function mealAdjGet(iso,v){return (mealAdj[iso]&&mealAdj[iso][v])||0;}
function mealAdjSet(iso,v,n){
  mealAdj[iso]=mealAdj[iso]||{};
  mealAdj[iso][v]=n;
  if(!n)delete mealAdj[iso][v];
  renderMealBox();
}
function mealAdjBump(iso,v,d){
  const cur=mealAdjGet(iso,v);
  const auto=mealPlanCache?mealCell(mealPlanCache,iso,v).add:0;
  mealAdjSet(iso,v,Math.max(-auto,cur+d));
}
/* Số suất cần ĐẶT THÊM của một ô, đã tính cả phần sửa tay */
function mealAddOf(P,iso,v){return Math.max(0,mealCell(P,iso,v).add+mealAdjGet(iso,v));}
let mealPlanCache=null;

/* Khoảng mặc định: TỪ HÔM NAY tới hết kỳ công hiện tại (tối đa 21 ngày).
   Yêu cầu nghiệp vụ là "ngày hiện tại và các ngày sau đó" nên không lùi
   về quá khứ — cơm hôm qua thì đặt cũng không kịp. */
function mealDefaults(){
  const today=todayIso();
  if(!mealFrom||mealFrom<today)mealFrom=today;
  if(!mealTo||mealTo<mealFrom){
    const per=daysOfPeriod(curSchedMonth());
    const last=per[per.length-1]||addDaysIso(today,13);
    mealTo=(last>addDaysIso(today,20))?addDaysIso(today,20):(last<today?addDaysIso(today,6):last);
  }
}
function openMealPlan(){
  mealDefaults();
  const mask=$('mealMask');if(!mask)return;
  mask.classList.add('on');
  renderMealBox();
}
function closeMealPlan(){const m=$('mealMask');if(m)m.classList.remove('on');}
function mealSet(k,v){
  if(k==='from'){mealFrom=v;if(mealTo<mealFrom)mealTo=mealFrom;}
  else if(k==='to'){mealTo=v;}
  else if(k==='team'){mealTeam=v;}
  else if(k==='me'){mealOnlyMe=!!v;}
  else if(k==='pend'){mealPend=!!v;}
  renderMealBox();
}
function mealQuick(n){
  mealFrom=todayIso();
  mealTo=addDaysIso(mealFrom,n-1);
  renderMealBox();
}
function mealPeriodRest(){
  const today=todayIso();
  const per=daysOfPeriod(curSchedMonth());
  mealFrom=today;
  mealTo=per[per.length-1]||addDaysIso(today,13);
  if(mealTo<mealFrom)mealTo=addDaysIso(mealFrom,6);
  renderMealBox();
}
function mealToggleDay(iso){mealOpenDay=(mealOpenDay===iso)?'':iso;renderMealBox();}

/* Danh sách nhóm cho ô lọc */
function mealTeamOptions(){
  const set=[...new Set(schedEmps().map(e=>String(e.team||'')).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  return `<option value="__all">Tất cả nhóm</option>`
    +set.map(x=>`<option value="${esc(x)}"${mealTeam===x?' selected':''}>${esc(x)}</option>`).join('');
}

function renderMealBox(){
  const box=$('mealBody');if(!box)return;
  mealDefaults();
  const P=mealPlan({from:mealFrom,to:mealTo,team:mealTeam,onlyMe:mealOnlyMe,inclPending:mealPend});
  mealPlanCache=P;

  /* ---- Tổng theo bữa cho cả khoảng ---- */
  const sumMeal={}, cutMeal={};MEAL_KEYS.forEach(v=>{sumMeal[v]=0;cutMeal[v]=0;});
  let grand=0, grandCut=0;
  P.days.forEach(iso=>MEAL_KEYS.forEach(v=>{
    const n=mealAddOf(P,iso,v), c=mealCell(P,iso,v).cut;
    sumMeal[v]+=n;grand+=n;cutMeal[v]+=c;grandCut+=c;
  }));

  /* ---- Thanh điều khiển ---- */
  const ctl=`<div class="meal-ctl">
    <label class="fl2">Từ</label><input type="date" class="inp sm" value="${mealFrom}" min="${todayIso()}" onchange="mealSet('from',this.value)">
    <label class="fl2">Đến</label><input type="date" class="inp sm" value="${mealTo}" min="${mealFrom}" onchange="mealSet('to',this.value)">
    <button class="btn sec sm" onclick="mealQuick(1)">Hôm nay</button>
    <button class="btn sec sm" onclick="mealQuick(7)">7 ngày</button>
    <button class="btn sec sm" onclick="mealPeriodRest()">Hết kỳ</button>
    <span class="sp"></span>
    <select class="inp sm" style="max-width:150px" onchange="mealSet('team',this.value)" ${mealOnlyMe?'disabled':''}>${mealTeamOptions()}</select>
    <label class="cal-chk"><input type="checkbox" ${mealOnlyMe?'checked':''} onchange="mealSet('me',this.checked)"> Chỉ mình tôi</label>
    <label class="cal-chk"><input type="checkbox" ${mealPend?'checked':''} onchange="mealSet('pend',this.checked)"> Tính cả đơn chờ duyệt</label>
  </div>`;

  /* ---- Thẻ tổng ---- */
  const cards=`<div class="meal-sum">
    ${MEAL_DEFS.map(m=>`<div class="meal-card${(sumMeal[m.v]||cutMeal[m.v])?'':' zero'}" style="--mc:${m.col}">
        <span class="mc-ic">${m.ic}</span>
        <b>${sumMeal[m.v]?'+'+sumMeal[m.v]:'0'}</b>
        ${cutMeal[m.v]?`<s class="mc-cut">−${cutMeal[m.v]}</s>`:''}
        <i>${t(m.l)}<u>${m.time}</u></i>
      </div>`).join('')}
    <div class="meal-card total"><span class="mc-ic">🍽️</span>
      <b>${grand?'+'+grand:'0'}</b>${grandCut?`<s class="mc-cut">−${grandCut}</s>`:''}
      <i>${t('Đặt thêm / Bớt')}</i></div>
  </div>`;

  /* ---- Bảng ngày × bữa ---- */
  let body='';
  P.days.forEach(iso=>{
    const dw=new Date(iso+'T00:00:00').getDay();
    const cells=MEAL_KEYS.map(v=>{
      const C=mealCell(P,iso,v);
      const adj=mealAdjGet(iso,v);
      const n=mealAddOf(P,iso,v);
      return `<td class="${(n||C.cut)?'has':'z'}">
        <span class="mn">${n?'+'+n:'0'}</span>
        ${C.cut?`<em class="mcut" title="${esc(t('suất bếp đã đặt nhưng nay không ăn'))}">−${C.cut}</em>`:''}
        ${C.pend?`<em class="mpd" title="${esc(t('đơn chờ duyệt'))}">${C.pend}?</em>`:''}
        ${adj?`<em class="madj">${adj>0?'+':''}${adj}</em>`:''}
        <span class="mbtn">
          <button type="button" onclick="mealAdjBump('${iso}','${v}',-1)" title="Bớt 1 suất">−</button>
          <button type="button" onclick="mealAdjBump('${iso}','${v}',1)" title="Thêm 1 suất">＋</button>
        </span></td>`;
    }).join('');
    const rowAdd=MEAL_KEYS.reduce((s,v)=>s+mealAddOf(P,iso,v),0);
    const rowCut=MEAL_KEYS.reduce((s,v)=>s+mealCell(P,iso,v).cut,0);
    const open=mealOpenDay===iso;
    body+=`<tr class="${iso===todayIso()?'today':''}${(rowAdd||rowCut)?'':' empty'}${open?' open':''}">
      <th><button type="button" class="meal-d" onclick="mealToggleDay('${iso}')">
        <b>${+iso.slice(8)}/${+iso.slice(5,7)}</b>
        <i class="${dw===0?'dowSun':dw===6?'dowSat':''}">${dowOf(iso)}</i>
        ${iso===todayIso()?`<em class="tdy">${t('hôm nay')}</em>`:''}
        <span class="cv">${open?'▴':'▾'}</span></button></th>
      ${cells}
      <td class="mtot">${rowAdd?'+'+rowAdd:''}${rowCut?`<s class="mc-cut">−${rowCut}</s>`:''}</td></tr>`;
    if(open)body+=`<tr class="meal-det"><td colspan="6">${mealDayDetail(P,iso)}</td></tr>`;
  });

  const tbl=`<div class="meal-tbl-wrap"><table class="meal-tbl">
    <thead><tr><th>${t('Ngày')}</th>
      ${MEAL_DEFS.map(m=>`<th style="--mc:${m.col}">${m.ic} ${t(m.short)}<u>${m.time}</u></th>`).join('')}
      <th>${t('Σ')}</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;

  const note=`<details class="xp"><summary>${t('Giải thích')}</summary>
    <div class="hint">
      Nhà bếp đặt cơm <b>một lần từ đầu kỳ theo LỊCH CHUẨN</b>: ca D 08–20 có <b>trưa + tối</b>,
      ca N 20–08 có <b>khuya + sáng hôm sau</b>, ca O 08–17 có <b>trưa</b>, ngày nghỉ không có suất.<br>
      Trong kỳ mới phát sinh tăng ca, đổi ca, nghỉ phép đột xuất… làm <b>LỊCH THỰC TẾ</b> khác lịch chuẩn.
      Bảng này là <b>chênh lệch giữa hai bên</b>:<br>
      • Số <b class="mn">+</b> xanh = thực tế có mà bếp chưa đặt → <b>đặt thêm</b>.
      Ví dụ đang ca O 08–17 mà tăng ca 17:00–20:00 → thêm <b>1 suất tối</b>; chuẩn nghỉ ca R mà vào trực thay ca D → thêm <b>2 suất</b>.<br>
      • Số <b>−</b> đỏ = bếp đã đặt mà nay không ai ăn → <b>báo bớt</b>.
      Ví dụ chuẩn ca D mà xin nghỉ phép cả ngày → bớt <b>2 suất</b>.<br>
      Số có dấu <b>?</b> là suất của đơn <b>chưa duyệt</b> — bỏ tích "Tính cả đơn chờ duyệt" để loại ra.<br>
      Nút <b>＋ −</b> để cộng/trừ tay khi thực tế khác dự tính. <b>Con số sửa tay chỉ giữ trong phiên này, đóng app là mất</b> —
      chốt xong hãy bấm Copy hoặc Xuất Excel gửi nhà bếp.
    </div></details>`;

  const acts=`<div class="meal-acts">
    <button class="btn sec sm" onclick="mealCopy()">📋 Copy tóm tắt</button>
    <button class="btn ok sm" onclick="mealExport()">📤 Xuất Excel</button>
    <button class="btn sec sm pc-only" onclick="window.print()">🖨️ In</button>
    <span class="sp"></span>
    ${Object.keys(mealAdj).length?`<button class="btn warn sm" onclick="mealAdj={};renderMealBox()">↺ Bỏ sửa tay</button>`:''}
    <button class="btn sm" onclick="closeMealPlan()">Đóng</button>
  </div>`;

  box.innerHTML=`<div class="meal-hd"><h3>🍚 Cơm phát sinh</h3>
      <span class="muted sm2">${t('Chênh lệch giữa lịch chuẩn (bếp đã đặt) và lịch thực tế')}</span>
      <button class="x" onclick="closeMealPlan()">✕</button></div>
    ${ctl}${cards}${(grand||grandCut)?tbl:`<div class="card"><p class="muted">${
      t('Khoảng ngày này lịch thực tế trùng lịch chuẩn — không phải báo bếp gì thêm.')}</p></div>`}
    ${note}${acts}`;
  if(typeof i18nApply==='function')i18nApply();
}

/* Chi tiết một ngày: ai ăn thêm bữa nào, vì tăng ca khung giờ nào */
function mealDayDetail(P,iso){
  const byEmp={};
  MEAL_KEYS.forEach(v=>(P.byDay[iso][v]||[]).forEach(r=>{
    (byEmp[r.empId]=byEmp[r.empId]||{name:r.name,team:r.team,posg:r.posg,items:[]}).items.push(r);
  }));
  const ids=Object.keys(byEmp);
  if(!ids.length)return `<span class="muted">${t('Không có chênh lệch trong ngày này.')}</span>`;
  return `<div class="meal-who">`+ids.map(id=>{
    const e=byEmp[id];
    const meals=e.items.map(r=>{
      const m=mealDef(r.v);
      return `<span class="mw-m ${r.d>0?'add':'cut'}${r.st==='pending'?' pend':''}" style="--mc:${
        r.d>0?m.col:'#DC2626'}" title="${esc(mealWhyText(r))}">${r.d>0?'+':'−'} ${m.ic} ${t(m.short)}</span>`;
    }).join('');
    return `<div class="mw-r">
      <span class="mw-n">${POSG_ICON[e.posg]||''} ${esc(shortName(e.name)||id)}${e.team?`<em>${esc(teamShort(e.team))}</em>`:''}</span>
      <span class="mw-ms">${meals}</span>
      <span class="mw-t">${esc(mealShiftText(e.items[0]))}</span></div>`;
  }).join('')+`</div>`;
}
/* "chuẩn D → thực tế AL8" — cho biết vì sao lệch */
function mealShiftText(r){
  if(!r)return '';
  const p=r.planCode||'—', a=r.realCode||'—';
  return p===a?p:(p+' → '+a);
}
function mealWhyText(r){
  const m=mealDef(r.v);
  if(r.d<0)return t('Bếp đã đặt theo ca chuẩn')+' '+(r.planCode||'')+' · '+t('nay không ăn')
    +' ('+mealShiftText(r)+')';
  const base=r.why==='ot'
    ? t('Tăng ca')+' '+winLabel(r.win)
    : t('Ca thực tế')+' '+(r.realCode||'');
  return base+' · '+t(m.l)+' '+m.time+(r.st==='pending'?' · '+t('chờ duyệt'):'');
}

/* ---------- Xuất ra ngoài ---------- */
function mealSummaryText(){
  const P=mealPlanCache;if(!P)return '';
  const L=[];
  L.push('COM PHAT SINH / MEAL ADJUSTMENT — LPGT Cavern');
  L.push((mealOnlyMe?'Ca nhan: '+((empById(meId())||{}).name||meId()):'Nhom: '+(mealTeam==='__all'?'Tat ca':mealTeam))
    +'  |  '+fmtVN(mealFrom)+' → '+fmtVN(mealTo));
  L.push('(so lich chuan bep da dat voi lich thuc te)');
  let gAdd=0,gCut=0;
  const sec=(title,pick,sign)=>{
    const lines=[];let tot=0;
    P.days.forEach(iso=>{
      const parts=[];let n=0;
      MEAL_KEYS.forEach(v=>{const c=pick(iso,v);if(c){parts.push(mealDef(v).short+' '+c);n+=c;}});
      if(n){tot+=n;lines.push('  '+fmtVN(iso)+' ('+dowOf(iso)+'): '+parts.join(' · ')+'  = '+sign+n);}
    });
    if(!lines.length)return 0;
    L.push('');L.push(title);L.push(...lines);
    L.push('  --- Cong: '+sign+tot+' suat');
    MEAL_KEYS.forEach(v=>{
      const s=P.days.reduce((a,iso)=>a+pick(iso,v),0);
      if(s)L.push('      '+mealDef(v).short+' ('+mealDef(v).time+'): '+sign+s);
    });
    return tot;
  };
  gAdd=sec('>> CAN DAT THEM:',(iso,v)=>mealAddOf(P,iso,v),'+');
  gCut=sec('>> CAN BOT (bep khoi nau):',(iso,v)=>mealCell(P,iso,v).cut,'-');
  if(!gAdd&&!gCut){L.push('');L.push('Khong co chenh lech — giu nguyen so suat da dat.');}
  return L.join('\n');
}
function mealCopy(){
  const txt=mealSummaryText();
  if(!txt){toast(t('Chưa có gì để copy'));return;}
  const done=()=>toast(t('Đã copy tóm tắt — dán vào tin nhắn gửi nhà bếp'));
  if(navigator.clipboard&&navigator.clipboard.writeText)
    navigator.clipboard.writeText(txt).then(done,()=>mealCopyFallback(txt,done));
  else mealCopyFallback(txt,done);
}
function mealCopyFallback(txt,done){
  const ta=document.createElement('textarea');
  ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';
  document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');done();}catch(e){alert(txt);}
  document.body.removeChild(ta);
}
function mealExport(){
  const P=mealPlanCache;
  if(!P||typeof XLSX==='undefined'){toast(t('Chưa có dữ liệu để xuất'));return;}
  /* Sheet 1: tổng theo ngày × bữa — mỗi ngày 2 dòng ĐẶT THÊM / BỚT */
  const a1=[['NGÀY','THỨ','ĐIỀU CHỈNH',...MEAL_DEFS.map(m=>m.l+' '+m.time),'TỔNG']];
  P.days.forEach(iso=>{
    const ad=MEAL_KEYS.map(v=>mealAddOf(P,iso,v)), ct=MEAL_KEYS.map(v=>mealCell(P,iso,v).cut);
    const sa=ad.reduce((a,b)=>a+b,0), sc=ct.reduce((a,b)=>a+b,0);
    if(sa)a1.push([fmtVN(iso),dowOf(iso),'Đặt thêm',...ad,sa]);
    if(sc)a1.push([fmtVN(iso),dowOf(iso),'Bớt',...ct.map(n=>n?-n:0),-sc]);
  });
  const fA=MEAL_KEYS.map(v=>P.days.reduce((a,iso)=>a+mealAddOf(P,iso,v),0));
  const fC=MEAL_KEYS.map(v=>P.days.reduce((a,iso)=>a+mealCell(P,iso,v).cut,0));
  a1.push([]);
  a1.push(['TỔNG CỘNG','','Đặt thêm',...fA,fA.reduce((a,b)=>a+b,0)]);
  a1.push(['TỔNG CỘNG','','Bớt',...fC.map(n=>n?-n:0),-fC.reduce((a,b)=>a+b,0)]);
  /* Sheet 2: chi tiết từng người */
  const a2=[['NGÀY ĂN','BỮA','GIỜ','ĐIỀU CHỈNH','MÃ NV','HỌ TÊN','NHÓM','VỊ TRÍ',
             'NGÀY PHÁT SINH','CA CHUẨN','CA THỰC TẾ','LÝ DO','KHUNG GIỜ TĂNG CA','TRẠNG THÁI']];
  P.rows.slice().sort((x,y)=>x.iso.localeCompare(y.iso)||MEAL_KEYS.indexOf(x.v)-MEAL_KEYS.indexOf(y.v)||y.d-x.d)
    .forEach(r=>a2.push([fmtVN(r.iso),mealDef(r.v).l,mealDef(r.v).time,r.d>0?'Đặt thêm':'Bớt',
      r.empId,r.name,r.team,POSG_LABEL[r.posg]||'',fmtVN(r.dayIso),
      r.planCode||'',r.realCode||'',
      r.d<0?'Ca chuẩn có, thực tế không':(r.why==='ot'?'Tăng ca':'Ca thực tế khác chuẩn'),
      winLabel(r.win),r.st==='approved'?'Đã duyệt':'Chờ duyệt']));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(a1),'Tong hop');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(a2),'Chi tiet');
  XLSX.writeFile(wb,'ComPhatSinh_'+mealFrom+'_'+mealTo+'.xlsx');
  toast(t('Đã xuất file Excel'));
}

/* Badge trên nút: tổng chênh lệch (thêm + bớt) từ hôm nay tới hết kỳ */
function mealBadgeCount(){
  try{
    const today=todayIso();
    const per=daysOfPeriod(curSchedMonth());
    let last=per[per.length-1]||addDaysIso(today,13);
    if(last<today)last=addDaysIso(today,13);
    const P=mealPlan({from:today,to:last,inclPending:true});
    return P.add+P.cut;
  }catch(e){return 0;}
}
function refreshMealBadge(){
  const el=$('mealBdg');if(!el)return;
  const n=mealBadgeCount();
  el.textContent=n;
  el.style.display=n?'':'none';
}
