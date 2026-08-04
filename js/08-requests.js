/* ============================================================
   DANG KY + DUYET don
   LPGT Cavern — Quan ly Cong Ca v4
   ============================================================ */
/* =================== KHAI BÁO CHUNG =================== */
const WT_REASONS=[
  {v:'forgot_card',vn:'Quên thẻ',en:'Left the card at home'},
  {v:'forgot_scan',vn:'Quên quẹt thẻ',en:'Forgot to scan the card'},
  {v:'lost_card',vn:'Mất thẻ',en:'Lost the card'},
  {v:'damaged_card',vn:'Thẻ hỏng',en:'The card was damaged'},
  {v:'other',vn:'Lý do khác',en:'Others'}
];
const SHIFT_HOURS={D:['08:00','20:00'],N:['20:00','08:00'],O:['08:00','17:00']};
/* ------------------------------------------------------------
   MẶC ĐỊNH CHẾ ĐỘ IN THEO LOẠI ĐƠN
   Theo quy định nộp giấy tờ của công ty, chỉ hai loại đơn dưới đây bắt buộc
   in biểu mẫu nộp nhân sự nên mặc định vào hàng CHỜ IN; các loại còn lại
   mặc định "không cần in" (vẫn duyệt & ghi lịch bình thường).
   Người khai luôn đổi lại được ngay trong form, quản lý đổi được ở màn Duyệt.
   ------------------------------------------------------------ */
const REQ_MUST_PRINT=['wt','swap'];
function defaultNoPrint(type){return !REQ_MUST_PRINT.includes(type);}
function baseShiftOf(code){
  /* Ca kép lấy theo nửa CA CHUẨN — người trực O rồi tăng ca đêm thì
     buổi làm chính của họ hôm đó vẫn là ca O. */
  const cb=(typeof comboOf==='function')&&comboOf(code);
  if(cb)code=cb.work;
  if(code==='D'||code==='SD'||code==='OTD')return 'D';
  if(code==='N'||code==='SN'||code==='OTN')return 'N';
  if(code==='O'||code==='SO')return 'O';
  return null;
}
function shiftLabelOf(code){const b=baseShiftOf(code);return b==='D'?'Day':b==='N'?'Night':b==='O'?'Office':'—';}
/* ============================================================
   MỖI NGÀY 1 DÒNG
   Quy định công ty: đơn nghỉ phép / đổi ca / tăng ca … mỗi ngày là
   một dòng riêng. Đơn mới lưu danh sách dòng ở r.days:
       r.days = [{iso, code, timeIn, timeOut}, ...]
   Đơn cũ (chỉ có from → to) vẫn đọc được: suy ra dòng theo khoảng ngày.
   Riêng đơn "làm liên tục nhiều ngày" (multi) vẫn là 1 khoảng ngày.
   ============================================================ */
function reqDays(r){
  if(Array.isArray(r.days)&&r.days.length){
    return r.days.filter(d=>d&&(d.iso||typeof d==='string')).map(d=>
      typeof d==='string'
        ? {iso:d,code:r.code||'',timeIn:r.timeIn||'',timeOut:r.timeOut||''}
        : {iso:d.iso,code:d.code||r.code||'',timeIn:d.timeIn||r.timeIn||'',timeOut:d.timeOut||r.timeOut||'',
           isoEnd:d.isoEnd||'',hours:d.hours||0,preset:d.preset||''});
  }
  const out=[];
  for(const iso of dateRange(r.from,r.to||r.from))
    out.push({iso,code:r.code||'',timeIn:r.timeIn||'',timeOut:r.timeOut||''});
  return out;
}
/* Đơn có tác động tới ngày iso không (đơn nhiều dòng có thể bỏ trống ngày ở giữa) */
function reqHasDay(r,iso){
  if(r.type==='multi')return r.from<=iso&&iso<=(r.to||r.from);
  return reqDays(r).some(d=>d.iso===iso);
}
/* Tập ngày của đơn — dùng để soi trùng đơn */
function reqDaySet(r){
  if(r.type==='multi'){const s=new Set();for(const iso of dateRange(r.from,r.to||r.from))s.add(iso);return s;}
  return new Set(reqDays(r).map(d=>d.iso));
}
/* Người đứng đơn thực sự (đơn khai hộ: r.byId là người bấm gửi) */
function reqWriter(r){return r.byId&&r.byId!==r.empId?r.byId:r.empId;}

/* ============================================================
   NGƯỜI OT COVER (đơn nghỉ phép)
   Nhân viên xin nghỉ có thể chỉ luôn người ở lại tăng ca gánh ca cho mình.
   Lưu ở đơn: r.coverId (mã NV) + r.coverSt = pending | confirmed | declined.
   Người được chọn nhận thông báo kind='coverConfirm' có nút Đồng ý / Từ chối.
   Từ chối KHÔNG chặn duyệt — chỉ hiện cờ đỏ để người duyệt (hoặc người làm
   đơn) đổi sang người khác bằng reqSetCover().
   ============================================================ */
const COVER_ST={pending:{ic:'⏳',lb:'chờ xác nhận',cls:'pending'},
                confirmed:{ic:'✓',lb:'đã nhận cover',cls:'confirmed'},
                declined:{ic:'✕',lb:'từ chối cover',cls:'declined'}};
function reqCoverName(r){
  if(!r||!r.coverId)return '';
  const e=empById(r.coverId);
  return shortName((e&&e.name)||r.coverId);
}
/* Chip trạng thái cover — dùng cả ở màn Duyệt lẫn "Đơn của tôi" */
function reqCoverChip(r){
  if(!r||!r.coverId)return '';
  const s=COVER_ST[r.coverSt||'pending']||COVER_ST.pending;
  return `<span class="cvw ${s.cls}" title="${t('Người ở lại tăng ca gánh ca thay')}">🤝 ${t('Cover')}: ${esc(reqCoverName(r))} · ${s.ic} ${t(s.lb)}</span>`;
}
/* Ai được đổi người cover: người duyệt, hoặc chính người làm đơn */
function canSetCover(r,who){
  if(!r||r.type!=='leave')return false;
  if(REQ_DEAD(r.status))return false;
  if(typeof canAppr==='function'&&canAppr())return true;
  return r.empId===who||r.byId===who;
}
/* Đặt / đổi / gỡ người cover. newId rỗng = gỡ hẳn.
   Gỡ thông báo chờ của người cũ, báo cho người cũ biết, gửi yêu cầu cho người mới. */
function reqSetCover(rid,newId,byId){
  const r=S.requests[rid];if(!r)return false;
  const old=r.coverId||'';
  if(old===newId)return false;
  // dọn yêu cầu xác nhận đang chờ của người cũ
  if(S.notifs)for(const k in S.notifs){const n=S.notifs[k];
    if(n&&n.reqId===rid&&n.kind==='coverConfirm'&&n.status==='pending')delete S.notifs[k];}
  if(old&&typeof newNotif==='function')
    newNotif({kind:'info',to:old,from:byId||'',reqId:rid,zk:'coverRemoved',
      text:t2('đã gỡ bạn khỏi vai trò OT cover')+' · '+fmtVN(r.from)});
  if(newId){
    r.coverId=newId;r.coverSt='pending';
    if(typeof newNotif==='function')
      newNotif({kind:'coverConfirm',to:newId,from:byId||'',reqId:rid,iso:r.from});
  }else{delete r.coverId;delete r.coverSt;}
  return true;
}

/* ============================================================
   HUỶ / XOÁ ĐƠN
   Đơn đã duyệt đã ghi vào lịch thực tế (S.over[...] mang reqId).
   Huỷ đơn thì gỡ đúng những ô lịch do đơn đó sinh ra → lịch trả về
   ca chuẩn; đơn đổi ca gỡ cho CẢ HAI người.
   Huỷ đơn = XOÁ HẲN, không giữ bản ghi 'đã huỷ' — mỗi đơn nằm lại là
   thêm dữ liệu phải đồng bộ, mà gói Firebase Spark tính băng thông.
   ============================================================ */
const REQ_ST_LABEL={pending:'CHỜ DUYỆT',approved:'ĐÃ DUYỆT',rejected:'TỪ CHỐI'};
const REQ_DEAD=st=>st==='rejected';
/* Nhãn trạng thái có xét duyệt nhiều cấp: TẠM DUYỆT (chờ QL Hàn chốt),
   CHỜ <cấp kế> khi mới qua Field Engineer. */
function reqStatusLabel(r){
  if(!r)return '';
  if(r.status==='rejected')return t('TỪ CHỐI');
  if(r.status==='approved')return reqIsProvisional(r)?t('TẠM DUYỆT'):t('ĐÃ DUYỆT');
  const nx=typeof reqNextLevel==='function'?reqNextLevel(r):null;
  const someDone=r.appr&&Object.keys(r.appr).some(k=>r.appr[k]&&!r.appr[k].reject);
  if(nx&&someDone)return t('CHỜ')+' '+lvlLabel(nx);
  return t('CHỜ DUYỆT');
}
function reqStatusClass(r){
  if(!r)return '';
  if(r.status==='approved'&&reqIsProvisional(r))return 'prov';
  return r.status;
}
/* Dải các cấp trong chuỗi duyệt: ✓ đã duyệt (⤷ duyệt theo) · ⏳ đang chờ · ✕ từ chối */
function apprChainHtml(r){
  if(typeof reqChain!=='function')return '';
  const ch=reqChain(r),ap=r.appr||{};
  if(!ch.length)return '';
  const parts=ch.map(k=>{
    const a=ap[k];
    let cls='wait',ic='⏳';
    if(a&&a.reject){cls='rej';ic='✕';}
    else if(a){cls=a.cascade?'casc':'ok';ic=a.cascade?'⤷':'✓';}
    return `<span class="chn ${cls}" title="${a?(a.reject?t('từ chối'):(a.cascade?t('duyệt theo'):t('đã duyệt'))):t('đang chờ')}">${ic} ${esc(lvlLabel(k))}</span>`;
  });
  return `<div class="appr-chain">${parts.join('<span class="chn-sep">›</span>')}</div>`;
}

/* Gỡ mọi ô lịch do đơn này tạo ra. Trả về số ô đã hoàn tác. */
function revertReqSchedule(rid){
  let n=0;
  for(const empId in S.over){
    const m=S.over[empId]||{};
    for(const iso in m){
      if(m[iso]&&m[iso].reqId===rid){delete m[iso];n++;}
    }
  }
  return n;
}
/* Ai được huỷ đơn nào */
function canCancelReq(r,who){
  if(!r)return false;
  if(mgr)return true;                        // duyệt đơn / quản trị: huỷ được mọi đơn
  if(r.empId!==who&&r.byId!==who)return false;
  if(r.printedAt)return false;               // đã in nộp nhân sự → nhờ quản lý huỷ
  return r.status==='pending'||r.status==='approved';
}
/* HUỶ ĐƠN = XOÁ HẲN.
   Không giữ lại bản ghi "đã huỷ": mỗi đơn nằm lại là thêm dữ liệu phải đồng bộ
   qua Firebase, mà gói Spark tính băng thông — đơn đã huỷ thì không ai tra nữa.
   Nếu đơn đã duyệt thì gỡ luôn các ô lịch do nó tạo ra (đổi ca gỡ cho cả 2 người). */
function cancelReq(rid,notify){
  const r=S.requests[rid];if(!r)return null;
  const reverted=(r.status==='approved')?revertReqSchedule(rid):0;
  // Báo các bên liên quan TRƯỚC khi xoá (info notif không gắn dọn ở dưới)
  if(notify&&typeof notifyReqParties==='function')notifyReqParties(r,'cancelled',meId());
  delete S.requests[rid];
  // Dọn thông báo XÁC NHẬN (swapConfirm/schedChange) gắn đơn này — giữ lại info
  if(S.notifs)for(const k in S.notifs){const n=S.notifs[k];
    if(n.reqId===rid&&(n.kind==='swapConfirm'||n.kind==='schedChange'||n.kind==='coverConfirm'))delete S.notifs[k];}
  return{reverted};
}
/* Giữ tên cũ cho các chỗ đang gọi — nay cùng nghĩa với cancelReq */
function purgeReq(rid){const x=cancelReq(rid);return x?x.reverted:0;}
function codeChip(c){return c?chip(c):'<span class="muted" style="font-weight:700">—</span>';}
// Chi tiết theo từng ngày: hiện ca hiện tại → ca sau khi duyệt để người duyệt thấy rõ.
function wtReasonLabel(r){
  const def=WT_REASONS.find(x=>x.v===r.reasonCode);
  if(!def)return '';
  return def.v==='other'?('Khác: '+(r.reasonOther||'')):(def.vn+' / '+def.en);
}
function reqDetail(r){
  if(r.type==='multi'){
    return `<div class="reqdt"><div class="dt"><span class="dtd">${fmtVN(r.from)} → ${fmtVN(r.to)}</span>
      <span>${t('Giờ vào')}: ${esc(r.timeIn||'')}</span><span>${t('Giờ ra')}: ${esc(r.timeOut||'')}</span></div></div>`;
  }
  const days=reqDays(r);
  if(!days.length)return '';
  const beA=iso=>(r.before&&r.before[iso]!==undefined)?r.before[iso]:eff(r.empId,iso).code;
  const beB=iso=>(r.beforeW&&r.beforeW[iso]!==undefined)?r.beforeW[iso]:eff(r.withId,iso).code;
  let rows='';
  if(r.type==='wt'){
    const g=r.guarantorId?empById(r.guarantorId):null;
    rows=days.map(d=>`<div class="dt"><span class="dtd">${fmtVN(d.iso)} ${dowOf(d.iso)}</span>
      <span>${esc(d.timeIn||'')} → ${esc(d.timeOut||'')}</span></div>`).join('');
    rows+=`<div class="dt"><span>Lý do: <b>${esc(wtReasonLabel(r))}</b></span>
      ${g?`<span>Người bảo lãnh: <b>${esc(g.name)}</b></span>`:''}</div>`;
  }else if(r.type==='late'){
    const tn=r.subType==='leave_early'?'Về sớm':'Đi trễ';
    rows=days.map(d=>`<div class="dt"><span class="dtd">${fmtVN(d.iso)} ${dowOf(d.iso)}</span>
      <span><b>${tn}</b></span><span>${esc(d.timeIn||'')} → ${esc(d.timeOut||'')}</span></div>`).join('');
  }else if(r.type==='swap'){
    const a=empById(r.empId),b=empById(r.withId);
    rows=days.map(d=>{
      const ca=beA(d.iso), cb=beB(d.iso);
      return `<div class="dt"><span class="dtd">${fmtVN(d.iso)} ${dowOf(d.iso)}</span>
        <span><b>${esc(a?a.name:'')}</b>: ${codeChip(ca)} → ${codeChip(cb)}</span>
        <span><b>${esc(b?b.name:'')}</b>: ${codeChip(cb)} → ${codeChip(ca)}</span></div>`;
    }).join('');
  }else if(r.type==='ot'){
    rows=days.map(d=>{
      const hrs=d.hours||otHours(d.iso,d.timeIn,d.isoEnd,d.timeOut)||getHours(d.code||'OTD');
      const end=(d.isoEnd&&d.isoEnd!==d.iso)?(' '+fmtVN(d.isoEnd)):'';
      return `<div class="dt"><span class="dtd">${fmtVN(d.iso)} ${dowOf(d.iso)}</span>
        ${codeChip(d.code)}<span>${esc(d.timeIn||'')} → ${esc(d.timeOut||'')}${end}</span>
        <span><b>${rnd1(hrs)}h</b></span></div>`;
    }).join('');
  }else{
    rows=days.map(d=>{
      const cur=beA(d.iso);
      return `<div class="dt"><span class="dtd">${fmtVN(d.iso)} ${dowOf(d.iso)}</span>
        <span>${codeChip(cur)} → ${codeChip(d.code)}</span></div>`;
    }).join('');
  }
  if(r.coverId){
    const cv=empById(r.coverId), s=COVER_ST[r.coverSt||'pending']||COVER_ST.pending;
    rows+=`<div class="dt"><span>🤝 ${t('Người OT cover')}: <b>${esc((cv&&cv.name)||r.coverId)}</b>${
      cv&&cv.team?` <i class="muted">${t('Nhóm')} ${esc(cv.team)}</i>`:''}</span>
      <span class="cvw ${s.cls}">${s.ic} ${t(s.lb)}</span></div>`;
  }
  return `<div class="reqdt">${rows}</div>`;
}
function reqDesc(r){
  const e=empById(r.empId),w=r.withId?empById(r.withId):null;
  const nd=r.type==='multi'?0:reqDays(r).length;
  const range=r.type==='multi'
    ? fmtVNfull(r.from)+' → '+fmtVNfull(r.to)
    : (nd<=1?fmtVNfull(r.from):`${nd} ngày (${fmtVNfull(r.from)} → ${fmtVNfull(r.to)})`);
  const tn={leave:'Đăng ký nghỉ',swap:'Đổi ca',ot:'Tăng ca',change:'Đổi mã ca',wt:'Bổ sung công',late:'Đi trễ/Về sớm',multi:'Làm liên tục nhiều ngày'}[r.type]||r.type;
  let body=`<b>${tn}</b> · ${range}`;
  if(w)body+=` · với <b>${esc(w.name)}</b>`;
  if(r.byId&&r.byId!==r.empId){
    const by=empById(r.byId);
    body+=` <span class="src" style="background:#FEF3C7;color:#92400E">✍️ khai hộ bởi ${esc(by?by.name:r.byId)}</span>`;
  }
  body+=reqDetail(r);
  if(r.note)body+=`<div class="muted" style="margin-top:5px">Ghi chú: “${esc(r.note)}”</div>`;
  return {e,body};
}
/* Cảnh báo quân số khi duyệt — đếm TÁCH THEO KHỐI (sản xuất / văn phòng),
   vì hai khối không trực thay ca cho nhau được. Xem js/18-advice.js. */
function apprWarnLine(r){
  if(r.status!=='pending')return '';
  const catOf=c=>c==='D'||c==='SD'||c==='OTD'?'D':(c==='N'||c==='SN'||c==='OTN'?'N':null);
  const pool=poolOfId(r.empId);
  const warnings=[];
  for(const d of reqDays(r)){
    const iso=d.iso;
    const B=mpBuckets(iso,pool);let cD=B.D.length,cN=B.N.length;
    const applyDelta=(fromCode,toCode)=>{const fc=catOf(fromCode),tc=catOf(toCode);if(fc==='D')cD--;if(fc==='N')cN--;if(tc==='D')cD++;if(tc==='N')cN++;};
    const curA=eff(r.empId,iso).code;
    if(r.type==='swap'&&r.withId){const curB=eff(r.withId,iso).code;applyDelta(curA,curB);applyDelta(curB,curA);}
    else applyDelta(curA,d.code);
    if(cD<S.settings.minD||cN<S.settings.minN)warnings.push({iso,cD,cN});
  }
  if(!warnings.length)return '';
  const w=warnings[0],parts=[];
  if(w.cD<S.settings.minD)parts.push(`${t('ca D còn')} ${w.cD}/${S.settings.minD}`);
  if(w.cN<S.settings.minN)parts.push(`${t('ca N còn')} ${w.cN}/${S.settings.minN}`);
  return `<div class="hint" style="background:#FEF2F2;color:#991B1B;margin-top:6px">${t('⚠️ Nếu duyệt: ngày')} ${fmtVN(w.iso)} — ${t('khối')} ${t(POOL_LABEL[pool])} ${parts.join(', ')}${warnings.length>1?` (+${warnings.length-1} ${t('ngày khác)')}`:''}</div>`;
}
/* Nhãn khuyến nghị gọn hiện ngay trên dòng đơn (chưa cần bung chi tiết).
   Chỉ tính cho đơn CHỜ DUYỆT làm người đó vắng ca — các loại khác bỏ qua
   để danh sách 150 dòng không phải tính thừa. */
function apprAdviceBadge(r){
  if(!r||r.status!=='pending')return '';
  if(typeof leaveAdvice!=='function')return '';
  if(r.type!=='leave'&&r.type!=='change')return '';
  const days=reqDays(r)||[];
  if(!days.length)return '';
  let lv='ok';
  for(const d of days.slice(0,6)){
    if(r.type==='change'&&!advCodeLeavesShift(d.code))continue;
    const a=leaveAdvice(r.empId,d.iso,d.code||'AL8',r.id);
    if(a.level==='block'){lv='block';break;}
    if(a.level==='warn')lv='warn';
  }
  if(lv==='ok')return '';
  return advChip(lv,'appr');
}
/* ============================================================
   MÀN DUYỆT — danh sách gọn, lọc nhanh, bấm để mở chi tiết
   Trước đây mỗi đơn là một thẻ to kèm 5 nút → rối và khó kiểm soát.
   Nay: 1 đơn = 1 dòng (ai · loại · ngày · trạng thái) + 2 nút chính;
   bấm vào dòng mới bung chi tiết từng ngày và các nút phụ.
   ============================================================ */
let apprFilter={status:'pending',print:'__all',type:'__all',q:'',
  ym:(typeof curSchedMonth==='function'?curSchedMonth():'__all'),from:'',to:'',flag:''};
/* Mở/đóng khối bộ lọc nâng cao (mặc định gập cho gọn màn hình điện thoại) */
let apprAdvOpen=false;
/* Dời kỳ đang xem ở màn Duyệt (◀ ▶) */
function apprPeriodShift(delta){
  const base=/^\d{4}-\d{2}$/.test(apprFilter.ym)?apprFilter.ym:curSchedMonth();
  apprSetFilter('ym',schedYmShift(base,delta));
}
/* Tải thêm phạm vi: kỳ này + kỳ trước / cả năm / tất cả */
function apprScopeRecent(){
  const cur=curSchedMonth(),prev=schedYmShift(cur,-1);
  apprFilter.from=periodFor(prev).from;apprFilter.to=periodFor(cur).to;apprFilter.ym='__range';renderAppr();
}
function apprScopeYear(y){
  const r=yearRange(+y||new Date().getFullYear());
  apprFilter.from=r.from;apprFilter.to=r.to;apprFilter.ym='__range';renderAppr();
}
function apprScopeAll(){apprSetFilter('ym','__all');}
let apprOpen={};                       // id đơn đang bung chi tiết

function apprSetFilter(k,v){
  apprFilter[k]=v;
  if(k==='ym'&&v!=='__all'&&v!=='__range'){apprFilter.from='';apprFilter.to='';}
  if(k==='from'||k==='to')apprFilter.ym='__range';
  renderAppr();
}
function apprToggleRow(id){apprOpen[id]=!apprOpen[id];renderAppr();}
function apprResetFilter(){
  apprFilter={status:'pending',print:'__all',type:'__all',q:'',ym:curSchedMonth(),from:'',to:'',flag:''};
  renderAppr();
}
/* Khoảng ngày đang lọc — trả về [from,to] hoặc null nếu không lọc theo ngày */
function apprRange(){
  if(apprFilter.ym==='__range'){
    const f=apprFilter.from,tt=apprFilter.to;
    if(!f&&!tt)return null;
    return [f||'0000-01-01', tt||'9999-12-31'];
  }
  if(apprFilter.ym&&apprFilter.ym!=='__all'){
    const p=periodFor(apprFilter.ym);
    return [p.from,p.to];
  }
  return null;
}
/* Đơn có dính vào khoảng ngày không (xét mọi ngày trong đơn) */
function reqInRange(r,f,tt){
  if(r.to<f||r.from>tt)return false;
  if(r.type==='multi')return true;
  return reqDays(r).some(d=>d.iso>=f&&d.iso<=tt);
}
/* Đơn còn CHỜ chính người đang đăng nhập xử lý (theo cấp của họ) */
function reqNeedsMyAction(r){
  if(!r||r.status==='rejected')return false;
  if(typeof apprLevelOf!=='function')return r.status==='pending';
  const lvl=apprLevelOf(meId(),r);
  if(!lvl)return false;
  const ap=r.appr||{};
  if(ap[lvl]&&!ap[lvl].reject)return false;               // mình đã duyệt cấp này rồi
  if(r.status==='approved'&&!reqIsProvisional(r))return false; // đã chốt hẳn
  return true;
}
/* Đơn khớp bộ lọc hiện tại */
function apprMatch(r){
  // Field Engineer (không phải quản lý) chỉ thấy đơn mình duyệt được (nhóm mình)
  if(myFE&&!mgr&&!(typeof apprLevelOf==='function'&&apprLevelOf(meId(),r)==='fe'))return false;
  if(apprFilter.status!=='__all'&&r.status!==apprFilter.status)return false;
  if(apprFilter.print==='yes'&&!r.printedAt)return false;
  if(apprFilter.print==='no'&&(r.printedAt||r.noPrint))return false;   // chưa in = chưa in & vẫn cần in
  if(apprFilter.print==='none'&&!r.noPrint)return false;               // không cần in
  if(apprFilter.type!=='__all'&&r.type!==apprFilter.type)return false;
  // Lọc theo cờ cảnh báo của bảng Tổng quan (js/17-appr-sum.js)
  if(apprFilter.flag&&typeof asFlagMatch==='function'&&!asFlagMatch(r,apprFilter.flag))return false;
  const rg=apprRange();
  if(rg&&!reqInRange(r,rg[0],rg[1]))return false;
  const q=noAccent(apprFilter.q||'');
  if(q){
    const e=empById(r.empId),w=r.withId?empById(r.withId):null;
    const hay=noAccent([e&&e.name,r.empId,w&&w.name,r.note].filter(Boolean).join(' '));
    if(!hay.includes(q))return false;
  }
  return true;
}
/* ------------------------------------------------------------
   DÒNG TÓM TẮT NGAY TRÊN DÒNG ĐƠN (chỉ hiện trên PC)
   Màn hình rộng còn dư chỗ, nên đưa thẳng ra ngoài đúng những gì cần để
   BẤM DUYỆT ĐƯỢC LUÔN: từng ngày kèm ca cũ → ca mới, số giờ / số ngày phép,
   lý do nhân viên ghi và người OT cover. Bung chi tiết chỉ còn dành cho
   thông tin phụ (chuỗi duyệt, trợ lý duyệt đơn, mốc thời gian, nút phụ).
   ------------------------------------------------------------ */
const AQ_MAX_DAYS=4;                    // quá số ngày này thì gộp "+N ngày"
function apprDayBrief(r,d){
  const beA=iso=>(r.before&&r.before[iso]!==undefined)?r.before[iso]:eff(r.empId,iso).code;
  const beB=iso=>(r.beforeW&&r.beforeW[iso]!==undefined)?r.beforeW[iso]:eff(r.withId,iso).code;
  const dt=`<b>${fmtVN(d.iso)}</b><em>${dowOf(d.iso)}</em>`;
  if(r.type==='swap')
    return `<span class="aq-d">${dt}${codeChip(beA(d.iso))}<i>⇄</i>${codeChip(beB(d.iso))}</span>`;
  if(r.type==='ot'){
    const h=(typeof reqDayHours==='function')?reqDayHours(d):(d.hours||0);
    const over=(d.isoEnd&&d.isoEnd!==d.iso)?'<i class="ovn">+1</i>':'';
    return `<span class="aq-d">${dt}${codeChip(d.code)}<i>${esc(d.timeIn||'')}–${esc(d.timeOut||'')}${over}</i><u>${rnd1(h)}h</u></span>`;
  }
  if(r.type==='wt'||r.type==='late')
    return `<span class="aq-d">${dt}<i>${esc(d.timeIn||'')}–${esc(d.timeOut||'')}</i></span>`;
  return `<span class="aq-d">${dt}${codeChip(beA(d.iso))}<i>→</i>${codeChip(d.code)}</span>`;
}
/* Con số quyết định của đơn: giờ tăng ca / số ngày phép / số ngày khai */
function apprMetric(r){
  if(r.type==='leave'){
    const n=(typeof reqLeaveDays==='function')?reqLeaveDays(r):reqDays(r).length;
    return n?`<span class="aq-m lv">${rnd1(n)} ${t('ngày phép')}</span>`:'';
  }
  if(r.type==='ot'){
    const h=(typeof reqHours==='function')?reqHours(r):0;
    return h?`<span class="aq-m ot">${rnd1(h)}h ${t('tăng ca')}</span>`:'';
  }
  if(r.type==='multi')return '';
  const n=reqDays(r).length;
  return n>1?`<span class="aq-m">${n} ${t('ngày')}</span>`:'';
}
function apprQuickHtml(r){
  let days='';
  if(r.type==='multi'){
    days=`<span class="aq-d"><b>${fmtVN(r.from)} → ${fmtVN(r.to)}</b>
      <i>${esc(r.timeIn||'')}–${esc(r.timeOut||'')}</i></span>`;
  }else{
    const list=reqDays(r);
    days=list.slice(0,AQ_MAX_DAYS).map(d=>apprDayBrief(r,d)).join('');
    if(list.length>AQ_MAX_DAYS)days+=`<span class="aq-more">+${list.length-AQ_MAX_DAYS} ${t('ngày')}</span>`;
  }
  const bits=[];
  if(r.type==='wt'&&typeof wtReasonLabel==='function'){
    const wl=wtReasonLabel(r);
    if(wl)bits.push(`<span class="aq-note">${esc(wl)}</span>`);
    if(r.guarantorId){const g=empById(r.guarantorId);
      bits.push(`<span class="aq-note">${t('Bảo lãnh')}: ${esc(shortName((g&&g.name)||r.guarantorId))}</span>`);}
  }
  if(r.note)bits.push(`<span class="aq-note">“${esc(r.note)}”</span>`);
  if(r.reason)bits.push(`<span class="aq-note rej">${t('Lý do từ chối')}: ${esc(r.reason)}</span>`);
  return `<div class="ar-sum pc-only">
    <div class="aq-days">${days}</div>
    <div class="aq-side">${apprMetric(r)}${reqCoverChip(r)}${bits.join('')}</div>
  </div>`;
}
/* Một dòng đơn */
function apprRow(r){
  const e=empById(r.empId), w=r.withId?empById(r.withId):null;
  const open=!!apprOpen[r.id];
  const days=r.type==='multi'?0:reqDays(r).length;
  const when=r.type==='multi'
    ? fmtVN(r.from)+' → '+fmtVN(r.to)
    : (days<=1?fmtVNfull(r.from):`${fmtVN(r.from)} → ${fmtVN(r.to)} · ${days} ${t('ngày')}`);
  const sub=[when];
  if(w)sub.push(t('với')+' '+shortName(w.name||r.withId));
  if(r.byId&&r.byId!==r.empId)sub.push(t('khai hộ'));
  // Cờ xác nhận đổi ca của người B
  const cfBadge=(r.type==='swap'&&r.confirmW)
    ?`<span class="cfw ${r.confirmW}">${{pending:'⏳ '+t('chờ')+' '+shortName((w&&w.name)||r.withId)+' '+t('xác nhận'),
        confirmed:'✓ '+shortName((w&&w.name)||r.withId)+' '+t('đã xác nhận'),
        declined:'✕ '+shortName((w&&w.name)||r.withId)+' '+t('từ chối')}[r.confirmW]||''}</span>`
    :'';
  return `<div class="ar ${r.status}${open?' open':''}${r.printedAt?' printed':''}">
    <div class="ar-h">
      <label class="ar-ck"><input type="checkbox" class="rqChk" value="${r.id}" onchange="apprPickCount()"></label>
      <span class="ar-ic">${REQ_ICON[r.type]||'📄'}</span>
      <button type="button" class="ar-txt" onclick="apprToggleRow('${r.id}')">
        <span class="l1"><b>${esc(e?e.name:r.empId)}</b>
          <i class="typ">${esc(REQ_LABEL[r.type]||r.type)}</i>
          <span class="st ${reqStatusClass(r)}">${reqStatusLabel(r)}</span>
          <span class="prt ${r.printedAt?'yes':(r.noPrint?'none':'no')}">${r.printedAt?'🖨️ '+t('đã in'):(r.noPrint?'🚫 '+t('không in'):'○ '+t('chưa in'))}</span>${cfBadge}${
            r.coverId?`<span class="cvw ${(COVER_ST[r.coverSt||'pending']||COVER_ST.pending).cls} mob-only">🤝</span>`:''}${apprAdviceBadge(r)}</span>
        <span class="l2">${esc(sub.join(' · '))}</span>
      </button>
      <span class="ar-act">
        ${(r.status!=='rejected'&&!(r.status==='approved'&&!reqIsProvisional(r)))?`<button class="btn ok sm" onclick="decide('${r.id}',true)" title="Duyệt">✓</button>
        <button class="btn warn sm" onclick="decide('${r.id}',false)" title="Từ chối">✕</button>`:''}
        <button type="button" class="ar-more" onclick="apprToggleRow('${r.id}')" title="Chi tiết">▾</button>
      </span>
    </div>
    ${apprQuickHtml(r)}
    <div class="ar-d">
      ${apprChainHtml(r)}
      ${reqDetail(r)}
      ${r.status==='pending'?apprWarnLine(r):''}
      ${open&&typeof reqAdviceHtml==='function'?reqAdviceHtml(r):''}
      ${r.note?`<div class="muted sm2">Ghi chú: “${esc(r.note)}”</div>`:''}
      <div class="ar-meta">
        <span>Gửi: ${fmtDateTime(r.createdAt)}</span>
        ${r.decidedAt?`<span>Duyệt: ${fmtDateTime(r.decidedAt)}</span>`:''}
        ${r.printedAt?`<span>In: ${fmtDateTime(r.printedAt)}${r.printCount>1?' ×'+r.printCount:''}</span>`:''}
        ${r.reason?`<span>Lý do: ${esc(r.reason)}</span>`:''}
        <span class="src ${r.source}">${{zalo:'Zalo',app:'📱 App NV'}[r.source]||'Web'}</span>
      </div>
      <div class="ar-more-act">
        <button class="btn sec sm pc-only" onclick="printOne('${r.id}')">🖨️ In</button>
        <button class="btn sec sm" onclick="apprToggleNoPrint('${r.id}')">${r.noPrint?'🖨️ Đưa vào ds in':'🚫 Đánh dấu không cần in'}</button>
        ${canSetCover(r,meId())?`<button class="btn sec sm" onclick="openCoverPicker('${r.id}')">🤝 ${r.coverId?t('Đổi người OT cover'):t('Chỉ định người OT cover')}</button>`:''}
        ${r.status==='approved'?`<button class="btn warn sm" onclick="revokeApproval('${r.id}')">↩️ Huỷ duyệt</button>`:''}
        <button class="btn warn sm" onclick="cancelOneReq('${r.id}')">🚫 Huỷ đơn</button>
      </div>
    </div>
  </div>`;
}
function reqCard(r,withActs,pick){return apprRow(r);}
/* Quản lý bật/tắt "không cần in" cho một đơn ở màn Duyệt */
function apprToggleNoPrint(id){
  const r=S.requests[id];if(!r)return;
  r.noPrint=!r.noPrint;save();
  renderApprList();
  if(typeof refreshPrintBadge==='function')refreshPrintBadge();
  toast(r.noPrint?t('Đã đánh dấu không cần in'):t('Đã đưa vào danh sách chờ in'));
}

/* =================== DUYỆT =================== */
/* Tab Duyệt chia 3 sub-tab:
     'list'  = danh sách đơn (mặc định)
     'sum'   = bảng Tổng quan cho quản lý (js/17-appr-sum.js)
     'otlog' = Nhật ký tăng ca (chuyển từ tab Báo cáo sang, js/15-report.js)
   Nhật ký tăng ca vốn nằm ở tab Báo cáo nhưng bản chất là hồ sơ phê duyệt
   tăng ca, để chung với màn Duyệt thì người duyệt tra cứu liền tay hơn. */
const APPR_TABS=['list','otlog','sum','stats','chart'];
/* ------------------------------------------------------------
   SUB-TAB TẠM ẨN — HIỆN TẠI CHƯA SỬ DỤNG
   'sum'   = 📊 Tổng quan phê duyệt (js/17-appr-sum.js)
   'chart' = 📈 Biểu đồ (repChartPanel trong js/15-report.js)
   Nghiệp vụ chưa dùng tới hai màn này nên ẩn khỏi thanh sub-tab cho gọn.
   TOÀN BỘ CODE VẪN GIỮ NGUYÊN — muốn bật lại chỉ cần xoá tên khỏi mảng dưới
   đây, không phải sửa gì thêm. Bộ lọc theo cờ rủi ro (apprFilter.flag) và các
   hàm asFlagMatch/AS_FLAGS vẫn hoạt động bình thường.
   ------------------------------------------------------------ */
const APPR_TABS_OFF=['sum','chart'];
const apprTabOn=v=>APPR_TABS.includes(v)&&!APPR_TABS_OFF.includes(v);
let apprTab=(()=>{try{const v=localStorage.getItem(LS+'_apprtab');return apprTabOn(v)?v:'list';}catch(e){return 'list';}})();
function apprSetTab(v){
  apprTab=apprTabOn(v)?v:'list';
  try{localStorage.setItem(LS+'_apprtab',apprTab);}catch(e){}
  renderAppr();
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderApprTabs(){
  const box=$('apprTabs');if(!box)return;
  const feOnly=myFE&&!mgr;
  const nPend=feOnly
    ? Object.values(S.requests||{}).filter(reqNeedsMyAction).length
    : Object.values(S.requests||{}).filter(r=>r&&r.status==='pending').length;
  const tabs=(feOnly?[['list','📋 '+t('Danh sách đơn'),nPend]]
                   :[['list','📋 '+t('Danh sách đơn'),nPend],
                     ['otlog','🗂 '+t('Nhật ký tăng ca'),0],
                     ['sum','📊 '+t('Tổng quan'),0],
                     ['stats','🧾 '+t('Bảng công tổng hợp'),0],
                     ['chart','📈 '+t('Biểu đồ'),0]])
    .filter(([k])=>!APPR_TABS_OFF.includes(k));
  box.innerHTML=tabs
    .map(([k,l,n])=>`<button class="aptab${apprTab===k?' on':''}" onclick="apprSetTab('${k}')">${l}${n?`<i>${n}</i>`:''}</button>`).join('')
    +(feOnly?'':`<span class="aptab-off" title="${t('Đã ẩn khỏi thanh sub-tab, code vẫn giữ để bật lại khi cần')}">📊 ${t('Tổng quan')} · 📈 ${t('Biểu đồ')}: ${t('hiện tại chưa sử dụng')}</span>`);
  const set=(id,on)=>{const el=$(id);if(el)el.style.display=on?'':'none';};
  set('apprSum',   apprTab==='sum');
  set('apprStats', apprTab==='stats');
  set('apprChart', apprTab==='chart');
  set('apprOtlog', apprTab==='otlog');
  set('apprListWrap', apprTab==='list');
}
function renderAppr(){
  const lock=$('apprLock'),body=$('apprBody');
  if(!lock||!body)return;
  const ok=canAppr();
  lock.style.display=ok?'none':'';
  body.style.display=ok?'':'none';
  if(!ok)return;
  // Field Engineer (không phải quản lý) chỉ có Danh sách đơn của nhóm mình
  if(myFE&&!mgr)apprTab='list';
  if(!apprTabOn(apprTab))apprTab='list';        // sub-tab đã tắt (xem APPR_TABS_OFF)
  renderApprTabs();
  // Chỉ dựng đúng sub-tab đang mở — khỏi tính thừa
  if(apprTab==='sum'){if(typeof asRender==='function')asRender();return;}
  if(apprTab==='stats'){
    const box=$('apprStats');
    if(box&&typeof repStatsPanel==='function')box.innerHTML=repStatsPanel();
    return;
  }
  if(apprTab==='chart'){
    const box=$('apprChart');
    if(box&&typeof repChartPanel==='function')box.innerHTML=repChartPanel();
    return;
  }
  if(apprTab==='otlog'){
    const box=$('apprOtlog');
    if(box&&typeof repOtLog==='function')box.innerHTML=repOtLog();
    return;
  }
  const all=Object.values(S.requests).sort((a,b)=>b.createdAt-a.createdAt);
  /* Đếm theo từng chip: giữ nguyên các bộ lọc khác để con số phản ánh đúng */
  const countWith=(k,v)=>{
    const save=apprFilter[k];apprFilter[k]=v;
    const n=all.filter(apprMatch).length;apprFilter[k]=save;return n;
  };
  const stChips=[['pending','⏳ Chờ duyệt'],['approved','✅ Đã duyệt'],['rejected','❌ Từ chối'],['__all','Tất cả']];
  const prChips=[['__all','Mọi đơn'],['no','○ Chờ in'],['none','🚫 Không in'],['yes','🖨️ Đã in']];
  const ms=monthsAvailable();
  const isRange=apprFilter.ym==='__range';
  const curYm=curSchedMonth();

  // Đang lọc theo một cảnh báo của bảng Tổng quan → nói rõ, kèm nút gỡ
  const fl=apprFilter.flag&&typeof AS_FLAGS!=='undefined'
    ? AS_FLAGS.find(f=>f[0]===apprFilter.flag):null;

  $('apprBar').innerHTML=`
    ${fl?`<div class="ab-flag">🔎 ${t('Đang xem riêng nhóm')}: <b>${fl[1]} ${t(fl[2])}</b>
        <button class="btn sec sm" onclick="apprSetFilter('flag','')">✕ ${t('Bỏ lọc này')}</button></div>`:''}
    <div class="ab-period">
      <button class="btn sec sm" onclick="apprPeriodShift(-1)" title="${t('Kỳ trước')}">◀</button>
      <select class="inp sm ab-per-sel" onchange="apprSetFilter('ym',this.value)" title="${t('Kỳ công đang xem')}">
        ${ms.map(m=>`<option value="${m}"${apprFilter.ym===m?' selected':''}>${periodFor(m).label}</option>`).join('')}
        <option value="__all"${apprFilter.ym==='__all'?' selected':''}>${t('Tất cả các kỳ')}</option>
        <option value="__range"${isRange?' selected':''}>${t('Khoảng ngày tự chọn…')}</option>
      </select>
      <button class="btn sec sm" onclick="apprPeriodShift(1)" title="${t('Kỳ sau')}">▶</button>
      <span class="ab-scope">
        ${apprFilter.ym!==curYm?`<button class="fchip" onclick="apprSetFilter('ym','${curYm}')">${t('Kỳ hiện tại')}</button>`:''}
        <button class="fchip" onclick="apprScopeRecent()">${t('Kỳ này + kỳ trước')}</button>
        <button class="fchip" onclick="apprScopeYear()">${t('Cả năm nay')}</button>
      </span>
    </div>
    ${isRange?`<div class="ab-tools ab-range">
      <label class="fl2">${t('Từ')}</label><input type="date" class="inp sm" value="${apprFilter.from}" onchange="apprSetFilter('from',this.value)">
      <label class="fl2">${t('Đến')}</label><input type="date" class="inp sm" value="${apprFilter.to}" onchange="apprSetFilter('to',this.value)">
    </div>`:''}
    <div class="ab-chips">${stChips.map(([k,l])=>
      `<button class="abc${apprFilter.status===k?' on':''}" onclick="apprSetFilter('status','${k}')">${l}<i>${countWith('status',k)}</i></button>`).join('')}
    </div>
    <div class="ab-chips">${prChips.map(([k,l])=>
      `<button class="abc sm${apprFilter.print===k?' on':''}" onclick="apprSetFilter('print','${k}')">${l}<i>${countWith('print',k)}</i></button>`).join('')}
    </div>
    <div class="ab-tools">
      <input class="inp sm" id="apprSearchBox" placeholder="Tìm theo tên nhân viên…" value="${esc(apprFilter.q)}"
             oninput="apprFilter.q=this.value;clearTimeout(window._abT);window._abT=setTimeout(renderApprList,200)">
      <select class="inp sm" onchange="apprSetFilter('type',this.value)">
        <option value="__all">${t('Mọi loại đơn')}</option>
        ${Object.keys(REQ_LABEL).map(k=>`<option value="${k}"${apprFilter.type===k?' selected':''}>${esc(REQ_LABEL[k])}</option>`).join('')}
      </select>
      ${(apprFilter.status!=='pending'||apprFilter.print!=='__all'||apprFilter.type!=='__all'||apprFilter.q||apprFilter.flag||apprFilter.ym!==curYm)
        ?`<button class="btn sec sm" onclick="apprResetFilter()">↺ ${t('Bỏ lọc')}</button>`:''}
      <span class="sp"></span>
      <button class="btn sec sm admin-only${apprAdvOpen?' on-adv':''}" onclick="apprAdvOpen=!apprAdvOpen;renderAppr()">⚙ ${t('Công cụ dữ liệu')}</button>
      <button class="btn sm pc-only" style="position:relative" onclick="openPrintBulk()">🖨️ In đơn<span class="bdg" id="printBdgAppr" style="display:none;position:static;margin-left:6px">0</span></button>
    </div>
    <div class="ab-adv" style="${apprAdvOpen?'':'display:none'}">
      <p class="muted sm2">${t('Sao lưu & dọn đơn cũ — luôn xuất Excel trước khi xoá.')}</p>
      <div class="ab-tools">
        <button class="btn sec sm admin-only" onclick="exportRequests(Object.values(S.requests).filter(apprMatch),'LPGT_SaoLuuDon_'+todayIso()+'.xlsx')" title="${t('Chỉ xuất Excel, không xoá')}">⬇️ ${t('Xuất Excel đơn đang lọc')}</button>
        <button class="btn warn sm admin-only" onclick="apprPurgeFiltered()" title="${t('Xuất Excel sao lưu rồi xoá')}">🗑️ ${t('Xuất Excel & xoá (đang lọc)')}</button>
        <button class="btn warn sm admin-only" onclick="apprPurgeYear()" title="${t('Xuất Excel sao lưu rồi xoá')}">🗑️ ${t('Xoá theo năm…')}</button>
      </div>
    </div>`;

  renderApprList();
  refreshPrintBadge();
  if(typeof applyRoleUI==='function')applyRoleUI();
}
/* Chỉ vẽ lại DANH SÁCH đơn (không đụng thanh lọc) — để gõ tìm tên không mất
   con trỏ và không nhảy focus sau mỗi ký tự. Cũng cập nhật số đếm ở các chip. */
function renderApprList(){
  const box=$('apprList');if(!box)return;
  const all=Object.values(S.requests).sort((a,b)=>b.createdAt-a.createdAt);
  const list=all.filter(apprMatch);
  box.innerHTML=list.length
    ? `<div class="ar-list">${list.slice(0,150).map(apprRow).join('')}</div>`
      +(list.length>150?`<p class="muted sm2" style="margin-top:8px">Đang hiện 150 đơn mới nhất trong ${list.length} đơn khớp bộ lọc.</p>`:'')
    : `<div class="card"><p class="muted">Không có đơn nào khớp bộ lọc.</p></div>`;
  apprPickCount();
}

/* ---- SAO LƯU EXCEL rồi mới XOÁ ----
   Trước khi xoá đơn (theo kỳ / nhiều kỳ / năm) BẮT BUỘC xuất file Excel sao lưu.
   Giữ dung lượng Firebase gói Spark thấp mà vẫn còn hồ sơ tra cứu offline. */
function reqExcelRow(r){
  const e=empById(r.empId),w=r.withId?empById(r.withId):null;
  const days=(r.type==='multi')
    ? fmtVNfull(r.from)+'→'+fmtVNfull(r.to)
    : reqDays(r).map(d=>fmtVN(d.iso)+(d.code?'('+d.code+')':'')).join('; ');
  const hrs=(typeof reqHours==='function')?rnd1(reqHours(r)):'';
  return [schedMonthOf(r.from),(e&&e.name)||r.empId,r.empId,(e&&e.team)||'',
    REQ_LABEL[r.type]||r.type,days,w?w.name:'',hrs,
    (reqStatusLabel(r)||'').replace(/<[^>]*>/g,''),r.decidedBy||'',
    r.createdAt?fmtDateTime(r.createdAt):'',r.decidedAt?fmtDateTime(r.decidedAt):'',
    r.printedAt?fmtDateTime(r.printedAt):'',r.reason||'',r.note||''];
}
function exportRequests(list,fname){
  if(typeof XLSX==='undefined'){toast(t('Thiếu thư viện Excel'));return false;}
  const head=['Kỳ công','Họ tên','Mã NV','Nhóm','Loại đơn','Ngày (mã)','Đổi ca với','Giờ',
              'Trạng thái','Người duyệt','Gửi lúc','Duyệt lúc','In lúc','Lý do','Ghi chú'];
  const aoa=[['LPGT CAVERN — SAO LƯU ĐƠN',new Date().toLocaleString('vi-VN')],[],head];
  list.slice().sort((a,b)=>(a.from<b.from?-1:1)).forEach(r=>aoa.push(reqExcelRow(r)));
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:9},{wch:20},{wch:11},{wch:7},{wch:14},{wch:34},{wch:16},{wch:7},{wch:12},{wch:12},{wch:18},{wch:18},{wch:18},{wch:20},{wch:20}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Don');
  XLSX.writeFile(wb,fname||('LPGT_SaoLuuDon_'+todayIso()+'.xlsx'));
  return true;
}
function exportThenPurgeReqs(list,label){
  if(!adm){toast(t('Cần quyền quản trị'));return;}
  list=(list||[]).filter(Boolean);
  if(!list.length){toast(t('Không có đơn nào trong phạm vi này.'));return;}
  const pend=list.filter(r=>r.status==='pending').length;
  if(!confirm(t('Sẽ XUẤT EXCEL sao lưu')+' '+list.length+' '+t('đơn')+' ('+label+') '+t('rồi XOÁ hẳn.')
     +(pend?'\n⚠️ '+t('Trong đó có')+' '+pend+' '+t('đơn đang chờ duyệt.'):'')
     +'\n'+t('Đơn đã duyệt sẽ được hoàn tác khỏi lịch thực tế. Không tra lại được.')))return;
  const okX=exportRequests(list,'LPGT_SaoLuuDon_'+String(label).replace(/[^\w-]/g,'')+'_'+todayIso()+'.xlsx');
  if(!okX&&!confirm(t('Không xuất được Excel. Vẫn tiếp tục xoá?')))return;
  let rev=0;list.forEach(r=>{rev+=purgeReq(r.id);});
  apprAfterChange(t('Đã sao lưu Excel & xoá')+' '+list.length+' '+t('đơn')+(rev?' · '+t('hoàn tác')+' '+rev+' '+t('ô lịch'):''));
}
/* Xoá theo đúng bộ lọc đang xem (kỳ / nhiều kỳ / khoảng ngày) — xuất Excel trước */
function apprPurgeFiltered(){
  const list=Object.values(S.requests).filter(apprMatch);
  const label=apprFilter.ym==='__all'?'MoiKy'
    :apprFilter.ym==='__range'?((apprFilter.from||'')+'-'+(apprFilter.to||''))
    :apprFilter.ym;
  exportThenPurgeReqs(list,label);
}
/* Xoá theo NĂM DƯƠNG — nhập năm, xuất Excel trước */
function apprPurgeYear(){
  if(!adm){toast(t('Cần quyền quản trị'));return;}
  const y=prompt(t('Xoá đơn theo NĂM (xuất Excel trước) — nhập năm, VD 2025:'),String(new Date().getFullYear()-1));
  if(!y)return;
  const r=yearRange(+y);
  const list=Object.values(S.requests).filter(rq=>reqInRange(rq,r.from,r.to));
  exportThenPurgeReqs(list,'Nam'+y);
}

/* ---- Chọn nhiều đơn để duyệt / từ chối / xoá hàng loạt (màn Duyệt) ---- */
function apprPicked(){return [...document.querySelectorAll('.rqChk:checked')].map(c=>c.value).filter(id=>S.requests[id]);}
function apprPickAll(on){document.querySelectorAll('.rqChk').forEach(c=>{c.checked=!!on;});apprPickCount();}
function apprPickCount(){
  const n=apprPicked().length, box=$('apprBulk');
  if(!box)return;
  if(!n){box.className='appr-bulk';box.innerHTML='';return;}
  box.className='appr-bulk on';
  box.innerHTML=`<b>${n} ${t('đơn đã chọn')}</b>
    <button class="btn ok sm" onclick="decidePickedReqs(true)">✓ ${t('Duyệt')}</button>
    <button class="btn warn sm" onclick="decidePickedReqs(false)">✕ ${t('Từ chối')}</button>
    <button class="btn sec sm pc-only" onclick="printPickedReqs()">🖨️ ${t('In')}</button>
    <button class="btn warn sm" onclick="cancelPickedReqs()">🗑️ ${t('Xoá đơn')}</button>
    <span class="sp"></span>
    <button class="btn sec sm" onclick="apprPickAll(true)">${t('Chọn hết')}</button>
    <button class="btn sec sm" onclick="apprPickAll(false)">${t('Bỏ chọn')}</button>`;
  if(typeof applyRoleUI==='function')applyRoleUI();
}
function apprAfterChange(msg){
  save();renderAppr();
  if(typeof renderCal==='function'&&curView==='cal')renderCal();
  if(typeof renderMe==='function')renderMe(true);
  refreshBadge();
  if(typeof refreshPrintBadge==='function')refreshPrintBadge();
  toast(msg);
}
/* Duyệt / từ chối hàng loạt */
function decidePickedReqs(ok){
  const all=apprPicked().map(id=>S.requests[id]).filter(Boolean);
  // Duyệt: bỏ qua đơn đã chốt hẳn (approved & không phải tạm duyệt). Từ chối: mọi đơn chưa bị từ chối.
  const ids=all.filter(r=>ok
      ?(r.status!=='rejected'&&!(r.status==='approved'&&!reqIsProvisional(r)))
      :(r.status!=='rejected')).map(r=>r.id);
  if(!ids.length){toast(t('Không có đơn phù hợp trong danh sách đã chọn'));return;}
  if(!confirm((ok?t('Duyệt'):t('Từ chối'))+' '+ids.length+' '+t('đơn đã chọn?')))return;
  let reason='';
  if(!ok)reason=prompt(t('Lý do từ chối (tuỳ chọn):'))||'';
  ids.forEach(id=>decide(id,ok,true,reason));
  apprAfterChange((ok?t('Đã xử lý duyệt'):t('Đã từ chối'))+' '+ids.length+' '+t('đơn'));
}
/* Câu xác nhận trước khi xoá */
function cancelWarnText(list){
  const approved=list.filter(r=>r.status==='approved').length;
  const printed =list.filter(r=>r.printedAt).length;
  let m=t('Xoá hẳn')+' '+list.length+' '+t('đơn đã chọn?');
  if(approved)m+='\n• '+approved+' '+t('đơn đã duyệt — lịch thực tế sẽ trả về ca chuẩn.');
  if(printed) m+='\n• ⚠️ '+printed+' '+t('đơn đã in nộp nhân sự — nhớ báo lại phòng nhân sự.');
  m+='\n'+t('Đơn xoá rồi không tra lại được.');
  return m;
}
function cancelOneReq(rid){
  const r=S.requests[rid];if(!r)return;
  if(!confirm(cancelWarnText([r])))return;
  const x=cancelReq(rid,true);
  apprAfterChange(t('Đã xoá đơn')+(x&&x.reverted?' · '+t('hoàn tác')+' '+x.reverted+' '+t('ô lịch'):''));
}
function purgeOneReq(rid){cancelOneReq(rid);}
function cancelPickedReqs(){
  const ids=apprPicked();
  if(!ids.length){toast(t('Chưa chọn đơn nào'));return;}
  const list=ids.map(id=>S.requests[id]).filter(Boolean);
  if(!confirm(cancelWarnText(list)))return;
  let rev=0;list.forEach(r=>{const x=cancelReq(r.id);if(x)rev+=x.reverted;});
  apprAfterChange(t('Đã xoá')+' '+list.length+' '+t('đơn')+(rev?' · '+t('hoàn tác')+' '+rev+' '+t('ô lịch'):''));
}
function purgePickedReqs(){cancelPickedReqs();}
/* In ngay các đơn đang chọn */
function printPickedReqs(){
  const ids=apprPicked();
  if(!ids.length){toast(t('Chưa chọn đơn nào'));return;}
  printRequests(ids.map(id=>S.requests[id]).filter(Boolean),'a5');
}
function* dateRange(f,t){let d=new Date(f+'T00:00:00');const e=new Date(t+'T00:00:00');let g=0;while(d<=e&&g++<62){yield isoOf(d);d.setDate(d.getDate()+1);}}
/* Ghi kết quả duyệt vào LỊCH THỰC TẾ (S.over). prov=true → ô lịch đánh dấu
   "tạm duyệt" (chờ cấp cuối chốt). Chỉ gọi MỘT lần khi đơn lần đầu đạt cấp
   Trung; khi chốt cấp cuối thì gọi markReqScheduleFinal() để bỏ cờ tạm. */
function writeReqToSchedule(r,prov){
  const id=r.id;
  const stamp=()=>({reqId:id,by:'approve',at:Date.now(),prov:!!prov});
  if(r.type==='swap'){
    for(const d of reqDays(r)){
      const iso=d.iso;
      const a=eff(r.empId,iso).code,b=eff(r.withId,iso).code;
      S.over[r.empId]=S.over[r.empId]||{};S.over[r.withId]=S.over[r.withId]||{};
      S.over[r.empId][iso]=Object.assign({code:b||''},stamp());
      S.over[r.withId][iso]=Object.assign({code:a||''},stamp());
    }
  }else if(r.type==='wt'||r.type==='late'||r.type==='multi'){
    // Đơn giấy tờ thuần — KHÔNG ghi đè lịch ca
  }else if(r.type==='ot'){
    const byDay={};
    reqDays(r).forEach(d=>{
      if(!d.code)return;
      const h=d.hours||otHours(d.iso,d.timeIn,d.isoEnd,d.timeOut)||getHours(d.code);
      const g=byDay[d.iso]||(byDay[d.iso]={hours:0,code:d.code,best:0});
      g.hours+=h;if(h>g.best){g.best=h;g.code=d.code;}
    });
    S.over[r.empId]=S.over[r.empId]||{};
    for(const iso in byDay)
      S.over[r.empId][iso]=Object.assign({code:byDay[iso].code,hours:Math.round(byDay[iso].hours*10)/10},stamp());
  }else{
    for(const d of reqDays(r)){
      if(!d.code)continue;
      S.over[r.empId]=S.over[r.empId]||{};
      S.over[r.empId][d.iso]=Object.assign({code:d.code},stamp());
    }
  }
}
/* Bỏ cờ tạm ở mọi ô lịch do đơn này sinh ra (đã được cấp cuối chốt) */
function markReqScheduleFinal(id){
  for(const empId in S.over){const m=S.over[empId]||{};
    for(const iso in m)if(m[iso]&&m[iso].reqId===id)m[iso].prov=false;}
}
/* Các bên liên quan tới một đơn — để gửi thông báo */
function apprPartyIds(r){
  const s=new Set();
  if(r.empId)s.add(r.empId);
  if(r.byId)s.add(r.byId);
  if(r.withId)s.add(r.withId);
  return [...s];
}
function notifyReqParties(r,kind,byId,lvl,extra){
  if(typeof newNotif!=='function')return;
  const label={leave:'nghỉ phép',swap:'đổi ca',ot:'tăng ca',change:'đổi mã ca',
               wt:'bổ sung công',late:'đi trễ/về sớm',multi:'làm liên tục'}[r.type]||r.type;
  const head={
    approved:'✅ Đơn '+label+' đã được DUYỆT chính thức',
    provapproved:'🕒 Đơn '+label+' đã được '+lvlLabel('trung')+' TẠM DUYỆT (chờ Quản lý người Hàn chốt)',
    fe:'☑️ Đơn '+label+' đã được Field Engineer duyệt (chờ cấp trên)',
    rejected:'❌ Đơn '+label+' bị TỪ CHỐI',
    revoked:'↩️ Đơn '+label+' đã bị HUỶ DUYỆT',
    cancelled:'🗑️ Đơn '+label+' đã bị HUỶ'
  }[kind]||('Cập nhật đơn '+label);
  const txt=head+' · '+fmtVN(r.from)+(extra?(' · '+extra):'');
  apprPartyIds(r).forEach(pid=>{
    if(pid===byId)return;
    /* zk = khoá cho ma trận Zalo (js/21-zalo.js). Trong app không dùng tới,
       chỉ để 21-zalo.js phân biệt được approved/rejected/fe/… vì mọi tin
       nhóm B đều mang chung kind:'info'. */
    newNotif({kind:'info',to:pid,from:byId||'',reqId:r.id,text:txt,zk:kind});
  });
}

/* ============================================================
   DUYỆT NHIỀU CẤP
   Xem chuỗi cấp ở js/01-core.js (reqChain / apprLevelOf / LVL_*).
   - Cấp cao duyệt → cấp dưới tự "duyệt theo" (cascade).
   - Đạt cấp Trung (Hoàng Trung) → TẠM ghi lịch (provisional).
   - Đạt cấp cuối (Quản lý người Hàn) → CHỐT lịch chính thức.
   - Từ chối ở bất kỳ cấp nào → cả đơn bị từ chối, gỡ ô lịch tạm nếu có.
   Đơn CŨ không có chuỗi vẫn chạy: reqChain suy ra động, apprLevelOf mặc
   định coi admin/appr là cấp Trung nên hành xử như trước.
   ============================================================ */
function decide(id,ok,bulk,reasonArg){
  const r=S.requests[id];if(!r)return;
  if(r.status==='rejected'){if(!bulk)toast(t('Đơn đã bị từ chối'));return;}
  const me=meId();
  const lvl=apprLevelOf(me,r);
  if(!lvl){if(!bulk)toast(t('Bạn không có quyền duyệt đơn này'));return;}
  const chain=reqChain(r);
  r.appr=r.appr||{};

  if(!ok){
    const reason=bulk?(reasonArg||''):(prompt(t('Lý do từ chối (tuỳ chọn):'))||'');
    if(r.status==='approved')revertReqSchedule(id);        // gỡ ô lịch tạm/đã ghi
    r.status='rejected';r.reason=reason;r.decidedAt=Date.now();r.decidedBy=me||'manager';
    r.provisional=false;r.appr[lvl]={by:me,at:Date.now(),reject:true};
    notifyReqParties(r,'rejected',me,lvl,reason);
    if(!bulk){save();renderAppr();if(typeof renderReal==='function')renderReal();
      if(typeof renderMe==='function')renderMe(true);if(typeof refreshBadge==='function')refreshBadge();
      toast(t('Đã từ chối'));}
    return;
  }

  // DUYỆT ở cấp lvl — cascade các cấp thấp hơn thành "duyệt theo"
  const ord=LVL_ORD[lvl];
  chain.forEach(k=>{if(LVL_ORD[k]<ord&&(!r.appr[k]||r.appr[k].reject))r.appr[k]={by:me,at:Date.now(),cascade:true};});
  r.appr[lvl]={by:me,at:Date.now()};

  const hasFinal=!!r.appr[LVL_FINAL]&&!r.appr[LVL_FINAL].reject;
  const hasProv =!!r.appr[LVL_PROV]&&!r.appr[LVL_PROV].reject;
  const wasApproved=r.status==='approved';

  let kind='fe';
  if(hasFinal||hasProv){
    if(!wasApproved)writeReqToSchedule(r,!hasFinal);
    else if(hasFinal)markReqScheduleFinal(id);
    r.status='approved';r.decidedAt=Date.now();r.decidedBy=me||'manager';
    r.provisional=!hasFinal;
    kind=hasFinal?'approved':'provapproved';
  }else{
    r.status='pending';r.provisional=false;kind='fe';
  }
  notifyReqParties(r,kind,me,lvl);
  if(bulk)return;
  save();renderAppr();
  if(typeof renderReal==='function')renderReal();
  if(typeof renderMe==='function')renderMe(true);
  if(typeof refreshBadge==='function')refreshBadge();
  toast(hasFinal?t('Đã duyệt & chốt lịch thực tế')
       :hasProv?t('Đã tạm duyệt — chờ Quản lý người Hàn chốt')
               :t('Đã duyệt cấp Field Engineer — chờ cấp trên'));
}
/* Huỷ DUYỆT một đơn đã duyệt (đưa về chờ duyệt), gỡ ô lịch, báo các bên.
   Cho phép: admin / kmgr / người làm đơn. Khác với Huỷ đơn (xoá hẳn). */
function revokeApproval(id){
  const r=S.requests[id];if(!r)return;
  const me=meId();
  const canRevoke=adm||(apprLevelOf(me,r))||r.empId===me||r.byId===me;
  if(!canRevoke){toast(t('Bạn không huỷ duyệt được đơn này'));return;}
  if(r.status!=='approved'){toast(t('Đơn chưa ở trạng thái đã duyệt'));return;}
  if(r.printedAt&&!adm){toast(t('Đơn đã in nộp nhân sự — nhờ quản lý xử lý'));return;}
  if(!confirm(t('Huỷ duyệt đơn này? Lịch thực tế sẽ trả về ca chuẩn, đơn quay lại trạng thái chờ duyệt.')))return;
  const rev=revertReqSchedule(id);
  r.status='pending';r.provisional=false;r.appr={};
  r.decidedAt=0;r.decidedBy='';
  notifyReqParties(r,'revoked',me);
  save();renderAppr();
  if(typeof renderReal==='function')renderReal();
  if(typeof renderMe==='function')renderMe(true);
  if(typeof refreshBadge==='function')refreshBadge();
  toast(t('Đã huỷ duyệt')+(rev?' · '+t('hoàn tác')+' '+rev+' '+t('ô lịch'):''));
}
