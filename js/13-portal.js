/* ============================================================
   TRANG CHINH NHAN VIEN (tab "Trang chinh" — id v-me)
   Lich ca ca nhan + bam vao ngay de gui don (moi ngay 1 dong).
   LPGT Cavern — Quan ly Cong Ca v4
   ============================================================ */

/* =================== THAM SỐ =================== */
/* Quỹ phép năm mặc định (ngày/năm). Có thể đặt riêng từng người: e.alQuota */
const AL_QUOTA_DEFAULT=12;
/* Số ngày làm liên tục vượt ngưỡng thì cảnh báo */
const STREAK_WARN=7;
/* Tối đa số dòng (ngày) trong 1 đơn — biểu mẫu in có 10 dòng */
const DS_MAX_ROWS=10;

/* =================== TRẠNG THÁI MÀN HÌNH =================== */
let pvMode='month';          // 'week' | 'month'
let pvAnchor=null;           // ngày mốc đang xem (iso)
let pvSheetDate=null;        // ngày đang mở trong sheet
let pvSheetForm=null;        // loại đơn đang mở trong sheet

/* Trạng thái form đơn nhiều dòng */
let dsRows=[];               // [{iso, code, timeIn, timeOut}]
let dsOwnerId='';            // người đứng đơn (đổi ca cho phép khai hộ người khác)
let dsWithId='';             // người đổi ca cùng
let dsGuarId='';             // người bảo lãnh (đơn bổ sung công)
let dsCoverId='';            // người ở lại tăng ca gánh ca thay (đơn nghỉ phép)
let dsNoteVal='';            // ghi chú (giữ trong state để không mất khi vẽ lại)
let dsReasonCode='forgot_card', dsReasonOther='';   // đơn bổ sung công
let dsLateType='come_late';                         // đơn đi trễ / về sớm
let dsNoPrint=false;                                // true = đơn không cần in (chỉ lưu, không vào hàng chờ in)
let dsMultiFrom='', dsMultiTo='', dsMultiIn='08:00', dsMultiOut='17:00';

/* =================== TIỆN ÍCH =================== */
const SEEN=()=>LS+'_seen';
function lastSeen(id){try{return +(localStorage.getItem(SEEN()+'_'+id)||0);}catch(e){return 0;}}
function markSeen(id){try{localStorage.setItem(SEEN()+'_'+id,String(Date.now()));}catch(e){}}

function addDaysIso(iso,n){const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return isoOf(d);}
function mondayOf(iso){const d=new Date(iso+'T00:00:00');const wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);return isoOf(d);}
function pvAnchorIso(){return pvAnchor||todayIso();}
function togglePw(id,btn){
  const el=$(id);if(!el)return;
  const show=el.type==='password';
  el.type=show?'text':'password';
  if(btn)btn.textContent=show?'🙈':'👁';
}

/* Ẩn/hiện các nút theo quyền của người đang đăng nhập */
function applyRoleUI(){
  applyPerm();
  document.querySelectorAll('.mgr-only').forEach(el=>{el.style.display=(mgr||myFE)?'':'none';});
  document.querySelectorAll('.admin-only').forEach(el=>{el.style.display=adm?'':'none';});
  /* Tab Báo cáo giờ chỉ dành cho nhân viên (số liệu/biểu đồ CỦA MÌNH);
     quản lý xem Nhân lực ở tab Lịch, Bảng công tổng hợp + Biểu đồ ở tab Duyệt */
  document.querySelectorAll('.rep-tab').forEach(el=>{el.style.display=mgr?'none':'';});
  /* .self-only = mục chỉ có nghĩa với người đang được chấm công
     (Trang chính, Gửi đơn, Tăng ca của tôi, Đơn của tôi) */
  document.querySelectorAll('.self-only').forEach(el=>{el.style.display=noSelf?'none':'';});
  document.querySelectorAll('.noself-only').forEach(el=>{el.style.display=noSelf?'':'none';});
  /* Đang đứng ở Trang chính mà người dùng không thuộc diện chấm công → đẩy
     sang Lịch thực tế (VD quản trị đổi quyền của chính mình lúc đang mở) */
  if(noSelf&&curView==='me'&&typeof go==='function')go('real');
}

/* Tên rút gọn 2 chữ cuối: "Nguyễn Hoàng Trung" → "Hoàng Trung" */
function shortName(n){
  const w=String(n||'').trim().split(/\s+/).filter(Boolean);
  return w.slice(-2).join(' ')||String(n||'');
}

/* ---- Đơn liên quan tới 1 ngày của 1 người ---- */
function reqsOfDay(id,iso){
  return Object.values(S.requests||{}).filter(r=>
    (r.empId===id||r.withId===id) && reqHasDay(r,iso));
}
function myReqs(id){
  return Object.values(S.requests||{})
    .filter(r=>r.empId===id||r.withId===id||r.byId===id)
    .sort((a,b)=>b.createdAt-a.createdAt);
}
/* Đơn đã có quyết định mà nhân viên chưa xem */
function unseenDecisions(id){
  const t=lastSeen(id);
  return myReqs(id).filter(r=>(r.decidedAt||0)>t);
}
/* Toàn bộ đơn đã có quyết định — mới nhất lên đầu (cho chuông thông báo) */
function decidedList(id){
  return myReqs(id).filter(r=>r.decidedAt)
    .sort((a,b)=>(b.decidedAt||0)-(a.decidedAt||0));
}

/* ============================================================
   THÔNG BÁO & XÁC NHẬN (S.notifs)
   - schedChange: quản lý/thư ký đổi lịch thực tế của nhân viên → nhân viên
     xác nhận (nhảy qua form đơn điền sẵn) hoặc huỷ (trả lịch + báo người sửa).
   - swapConfirm: A làm đơn đổi ca với B → B xác nhận; chưa xác nhận thì đơn
     duyệt hiện cảnh báo cho quản trị.
   - info: thông báo một chiều (VD nhân viên đã huỷ thay đổi của bạn).
   ============================================================ */
function newNotif(o){
  const id=uid();
  S.notifs[id]=Object.assign({id,status:'pending',createdAt:Date.now()},o);
  /* Đẩy kèm sang hàng đợi Zalo (js/21-zalo.js). Hàm đó tự quyết định tin nào
     đáng bắn theo MA-TRAN-THONG-BAO và tự nuốt mọi lỗi — Zalo hỏng thì
     thông báo trong app vẫn chạy nguyên vẹn. */
  if(typeof zaloEnqueue==='function')zaloEnqueue(S.notifs[id]);
  return id;
}
/* Chỉ GIỮ thông báo trong ~2 kỳ ca gần đây để nhẹ Firebase (gói Spark).
   Việc đang CHỜ xác nhận (pending) luôn giữ lại dù cũ. Trả về số đã dọn. */
const NOTIF_KEEP_DAYS=62;                 // ~2 kỳ công (mỗi kỳ ~1 tháng)
function pruneOldNotifs(){
  if(!S.notifs)return 0;
  const cutoff=Date.now()-NOTIF_KEEP_DAYS*86400000;let n=0;
  for(const k in S.notifs){const x=S.notifs[k];
    if(x&&x.status!=='pending'&&(x.createdAt||0)<cutoff){delete S.notifs[k];n++;}}
  return n;
}
/* Việc chờ nhân viên xác nhận */
const CONFIRM_KINDS=['schedChange','swapConfirm','coverConfirm'];
function pendingConfirms(id){
  return Object.values(S.notifs||{})
    .filter(n=>n.to===id&&n.status==='pending'&&CONFIRM_KINDS.includes(n.kind))
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
/* Toàn bộ thông báo gửi tới id (cho tab Thông báo) */
function myNotifs(id){
  return Object.values(S.notifs||{})
    .filter(n=>n.to===id)
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
/* Thông báo một chiều chưa xem: tin nhắn info + sự kiện trên lịch */
const SEEN_KINDS=['info','event'];
function notifUnseenCount(id){
  return pendingConfirms(id).length
    + unseenDecisions(id).length
    + myNotifs(id).filter(n=>SEEN_KINDS.includes(n.kind)&&!n.seen).length;
}

/* ---- Suy ra loại đơn + số dòng từ một thay đổi lịch ----
   Quy tắc (theo yêu cầu): SD/SN/SO → đổi mã ca; OT* → tăng ca;
   đang có ca làm mà bị thêm OT ở BUỔI KHÁC (≈ làm 24h) → bổ sung công 2 dòng. */
function inferReqFromChange(empId,iso,oldCode,newCode){
  const oldCat=codeInfo(oldCode).cat, newCat=codeInfo(newCode).cat;
  const oldBase=baseShiftOf(oldCode), newBase=baseShiftOf(newCode);
  /* CA KÉP (O+N, D+N): đã ghi sẵn "trực ca này + tăng ca ca kia" nên suy
     thẳng ra đơn BỔ SUNG CÔNG 2 dòng — không cần đoán như trường hợp ô
     chỉ có mã OT đơn lẻ bên dưới. */
  const cb=comboOf(newCode);
  if(cb){
    const t1=SHIFT_HOURS[cb.work]||['08:00','17:00'];
    const t2h=SHIFT_HOURS[baseShiftOf(cb.ot)||'N']||['20:00','08:00'];
    return{type:'wt',rows:[
      {iso,timeIn:t1[0],timeOut:t1[1]},
      {iso,timeIn:t2h[0],timeOut:t2h[1]}
    ],note:t2('Trực ca')+' '+cb.work+' '+t2('và tăng ca')+' '+cb.ot+' — '+t2('bổ sung công')};
  }
  // Mã đổi ca SD/SN/SO → đơn Đổi mã ca sang ca tương ứng
  if(newCat==='swap'){
    const to={SD:'D',SN:'N',SO:'O'}[newCode]||newCode;
    return{type:'change',rows:[{iso,code:to}],
      note:t2('Xác nhận đổi ca')+' '+(oldCode||'—')+' → '+to};
  }
  // Mã tăng ca
  if(newCat==='ot'){
    // Đang làm ca (D/N/O) mà OT ở buổi KHÁC → làm liên tục ≈24h → BỔ SUNG CÔNG 2 dòng
    if(oldCat==='work'&&oldBase&&newBase&&newBase!==oldBase){
      const t1=SHIFT_HOURS[oldBase]||['08:00','20:00'];
      const t2h=SHIFT_HOURS[newBase]||['20:00','08:00'];
      return{type:'wt',rows:[
        {iso,timeIn:t1[0],timeOut:t1[1]},
        {iso,timeIn:t2h[0],timeOut:t2h[1]}
      ],note:t2('Làm liên tục')+' '+oldBase+'+'+newBase+' ('+t2('khoảng 24h')+') — '+t2('bổ sung công')};
    }
    // Tăng ca thường: 1 dòng theo mẫu của mã
    const preset=['OTL','OT2','OT3','OTD','OTN'].includes(newCode)?newCode:'';
    const p=otPreset(preset);
    return{type:'ot',rows:[{iso,preset,code:newCode,
      timeIn:p.from||'',timeOut:p.to||'',isoEnd:p.overnight?addDaysIso(iso,1):''}],
      note:t2('Xác nhận tăng ca')+' '+newCode};
  }
  // Đổi sang ca làm khác → Đổi mã ca
  return{type:'change',rows:[{iso,code:newCode}],
    note:t2('Xác nhận đổi ca')+' '+(oldCode||'—')+' → '+(newCode||'—')};
}
/* Mở form đơn đã điền sẵn theo suy luận */
function openPrefilledReq(iso,inf){
  if(!meId()){toast(t('Phiên đăng nhập đã hết'));renderGate();return;}
  pvSheetDate=iso;
  renderDaySheet();
  $('daySheetMask').classList.add('on');
  dsForm(inf.type);                 // đặt pvSheetForm + state mặc định
  dsOwnerId=meId();
  if(inf.note)dsNoteVal=inf.note;
  dsRows=inf.rows.map(r=>Object.assign(dsNewRow(inf.type,r.iso||iso),r));
  dsRenderForm();
}

/* ============================================================
   THU HỒI THÔNG BÁO ĐỔI LỊCH
   ------------------------------------------------------------
   Quản lý đổi lịch của một người → nhân viên nhận thông báo xác nhận.
   Nếu quản lý đổi ý và TRẢ Ô VỀ CA CHUẨN thì thông báo đó đã vô nghĩa,
   phải gỡ đi — để lại chỉ khiến nhân viên xác nhận nhầm một thay đổi
   không còn tồn tại.

   Hai trường hợp khác nhau (theo yêu cầu nghiệp vụ):
     · CHƯA xác nhận → thu hồi lặng lẽ, không làm phiền ai.
     · ĐÃ xác nhận  → vẫn thu hồi, nhưng phải BÁO LẠI cho nhân viên, vì
       họ có thể đã gửi đơn theo thay đổi đó và cần biết mà huỷ đơn.
   Trả về số thông báo đã thu hồi. KHÔNG gọi save() — nơi gọi tự lưu.
   ============================================================ */
function revokeSchedChange(empId,iso,stdCode){
  if(!S.notifs)return 0;
  const by=meId()||'manager';
  let n=0, hadConfirmed=false;
  for(const k in S.notifs){
    const x=S.notifs[k];
    if(!x||x.kind!=='schedChange'||x.to!==empId||x.iso!==iso)continue;
    if(x.status==='pending'){delete S.notifs[k];n++;continue;}
    if(x.status==='confirmed'){
      x.status='revoked';x.revokedAt=Date.now();x.revokedBy=by;
      hadConfirmed=true;n++;
    }
  }
  /* Đã xác nhận rồi mới bị thu hồi → phải báo, kèm nhắc kiểm tra đơn đã gửi */
  if(hadConfirmed&&typeof newNotif==='function'){
    newNotif({kind:'info',to:empId,from:by,iso,zk:'schedRevoke',
      text:t2('đã THU HỒI thay đổi lịch')+' '+fmtVN(iso)+' — '
        +t2('lịch trả về ca chuẩn')+' '+(stdCode||'—')+'. '
        +t2('Nếu bạn đã gửi đơn theo thay đổi này, hãy vào Đơn của tôi để huỷ.')});
  }
  return n;
}

/* Nhân viên XÁC NHẬN thay đổi lịch → mở đơn điền sẵn để gửi */
function confirmSchedChange(nid){
  const n=S.notifs[nid];if(!n||n.to!==meId())return;
  n.status='confirmed';n.decidedAt=Date.now();save();
  closeMyPanel();go('me');
  const inf=inferReqFromChange(n.to,n.iso,n.oldCode,n.newCode);
  openPrefilledReq(n.iso,inf);
  toast(t('Đã điền sẵn đơn — kiểm tra rồi bấm Gửi'));
}
/* Nhân viên HUỶ thay đổi → trả ô lịch về cũ + báo người đã sửa */
function declineSchedChange(nid){
  const n=S.notifs[nid];if(!n||n.to!==meId())return;
  if(!confirm(t('Huỷ thay đổi lịch này? Ô lịch sẽ trả về trạng thái trước đó và người sửa sẽ được báo.')))return;
  // gỡ ô over nếu vẫn đang là mã mới do người kia gán
  const ov=S.over[n.to]&&S.over[n.to][n.iso];
  if(ov&&ov.code===n.newCode)delete S.over[n.to][n.iso];
  n.status='cancelled';n.decidedAt=Date.now();
  newNotif({kind:'info',to:n.from,from:n.to,zk:'schedDecline',
    text:t2('đã HUỶ thay đổi lịch bạn tạo')+': '+fmtVN(n.iso)+' '+(n.oldCode||'—')+' → '+(n.newCode||'—')});
  save();renderMyPanel();renderMe(true);
  if(typeof renderCal==='function'&&curView==='cal')renderCal();
  toast(t('Đã huỷ thay đổi và báo lại người sửa'));
}
/* B XÁC NHẬN / TỪ CHỐI đơn đổi ca của A */
function confirmSwap(nid){
  const n=S.notifs[nid];if(!n||n.to!==meId())return;
  const r=S.requests[n.reqId];
  n.status='confirmed';n.decidedAt=Date.now();
  if(r){r.confirmW='confirmed';
    newNotif({kind:'info',to:r.byId||r.empId,from:meId(),zk:'swapOk',
      text:t2('đã XÁC NHẬN đổi ca với bạn')+': '+fmtVN(r.from)});}
  save();renderMyPanel();renderMe(true);
  if(typeof renderApprList==='function'&&mgr)renderApprList();
  toast(t('Đã xác nhận đổi ca'));
}
function declineSwap(nid){
  const n=S.notifs[nid];if(!n||n.to!==meId())return;
  if(!confirm(t('Từ chối đổi ca này? Đơn vẫn còn nhưng quản trị sẽ thấy bạn đã từ chối.')))return;
  const r=S.requests[n.reqId];
  n.status='cancelled';n.decidedAt=Date.now();
  if(r){r.confirmW='declined';
    newNotif({kind:'info',to:r.byId||r.empId,from:meId(),zk:'swapNo',
      text:t2('đã TỪ CHỐI đổi ca với bạn')+': '+fmtVN(r.from)});}
  save();renderMyPanel();renderMe(true);
  if(typeof renderApprList==='function'&&mgr)renderApprList();
  toast(t('Đã từ chối đổi ca'));
}
/* ---- Người được nhờ OT COVER: đồng ý / từ chối ----
   Kết quả chỉ là CỜ trên đơn nghỉ phép, không tự sinh đơn tăng ca và không
   chặn duyệt. Người cover muốn được tính giờ thì gửi đơn tăng ca như thường. */
function confirmCover(nid){
  const n=S.notifs[nid];if(!n||n.to!==meId())return;
  const r=S.requests[n.reqId];
  n.status='confirmed';n.decidedAt=Date.now();
  if(r){
    r.coverSt='confirmed';
    newNotif({kind:'info',to:r.byId||r.empId,from:meId(),reqId:r.id,zk:'coverOk',
      text:t2('đã NHẬN OT cover cho bạn')+': '+fmtVN(r.from)});
  }
  save();renderMyPanel();renderMe(true);
  if(typeof renderApprList==='function'&&(mgr||myFE))renderApprList();
  toast(t('Đã nhận OT cover — nhớ gửi đơn tăng ca để được tính giờ'));
}
function declineCover(nid){
  const n=S.notifs[nid];if(!n||n.to!==meId())return;
  if(!confirm(t('Từ chối OT cover ngày này? Người làm đơn và người duyệt sẽ thấy để chọn người khác.')))return;
  const r=S.requests[n.reqId];
  n.status='cancelled';n.decidedAt=Date.now();
  if(r){
    r.coverSt='declined';
    newNotif({kind:'info',to:r.byId||r.empId,from:meId(),reqId:r.id,zk:'coverNo',
      text:t2('đã TỪ CHỐI OT cover')+': '+fmtVN(r.from)+' — '+t2('hãy chọn người khác')});
  }
  save();renderMyPanel();renderMe(true);
  if(typeof renderApprList==='function'&&(mgr||myFE))renderApprList();
  toast(t('Đã từ chối OT cover'));
}

/* ---- Đổi người OT cover (người làm đơn hoặc người duyệt) ----
   Mở hộp chọn người cùng khối; chọn xong thì người cũ được báo đã gỡ vai trò,
   người mới nhận yêu cầu xác nhận. */
let _cvRid='';
function openCoverPicker(rid){
  const r=S.requests[rid];if(!r){toast(t('Không tìm thấy đơn'));return;}
  if(!canSetCover(r,meId())){toast(t('Bạn không đổi được người OT cover của đơn này'));return;}
  _cvRid=rid;
  const m=$('coverMask');if(!m)return;
  m.classList.add('on');
  renderCoverPicker();
  setTimeout(()=>{const q=$('cvQ');if(q)q.focus();},60);
}
function closeCoverPicker(){const m=$('coverMask');if(m)m.classList.remove('on');_cvRid='';}
function renderCoverPicker(){
  const box=$('coverBody'),r=S.requests[_cvRid];
  if(!box||!r)return;
  const iso=(reqDays(r)[0]||{}).iso||r.from;
  const own=r.empId, myPool=poolOfId(own);
  const q=noAccent($('cvQ')?$('cvQ').value:'');
  let list=activeEmps().filter(e=>e.id!==own&&poolOf(e)===myPool);
  if(q)list=list.filter(e=>noAccent(e.name).includes(q)||noAccent(e.id).includes(q));
  const restRank=e=>codeInfo(eff(e.id,iso).code||'').cat==='rest'?0:1;
  list.sort((a,b)=>restRank(a)-restRank(b)||String(a.name||'').localeCompare(String(b.name||''),'vi'));
  const items=list.slice(0,60).map(e=>{
    const c=eff(e.id,iso).code, rest=codeInfo(c||'').cat==='rest';
    return `<button type="button" class="pk-item${rest?' free':''}${e.id===r.coverId?' on':''}" onclick="coverPickSet('${e.id}')">
      <span class="n">${rest?'🟢 ':''}${esc(e.name||e.id)}</span>
      <span class="m">${e.team?t('Nhóm')+' '+esc(e.team)+' · ':''}${esc(e.id)}</span>
      ${c?`<span class="cc" style="background:${codeInfo(c).col}">${esc(c)}</span>`:'<span class="cc" style="background:#94A3B8">—</span>'}
    </button>`;}).join('');
  box.innerHTML=`
    <h3>🤝 ${t('Người OT cover')}</h3>
    <p class="muted sm2">${esc((empById(own)||{}).name||own)} · ${esc(REQ_LABEL[r.type]||r.type)} · ${fmtVN(r.from)}${
      r.to&&r.to!==r.from?' → '+fmtVN(r.to):''}</p>
    ${r.coverId?`<div class="pv-alert info sm">${t('Hiện tại')}: <b>${esc(reqCoverName(r))}</b> · ${
      t((COVER_ST[r.coverSt||'pending']||COVER_ST.pending).lb)}</div>`:''}
    <input class="inp" id="cvQ" placeholder="${t('Gõ tên hoặc mã NV… (không cần dấu)')}" autocomplete="off"
           value="${esc($('cvQ')?$('cvQ').value:'')}" oninput="renderCoverPicker()">
    <p class="muted sm2" style="margin:6px 0 2px">${t('Chỉ hiện người CÙNG KHỐI; 🟢 là người đang nghỉ ca R ngày')} ${fmtVN(iso)}.</p>
    <div class="pick-list" style="max-height:46vh">${items||`<p class="muted" style="padding:8px 4px">${t('Không tìm thấy ai khớp.')}</p>`}</div>
    <div class="row" style="gap:8px;margin-top:10px">
      ${r.coverId?`<button class="btn warn" style="flex:1" onclick="coverPickSet('')">✕ ${t('Bỏ người cover')}</button>`:''}
      <button class="btn sec" style="flex:1" onclick="closeCoverPicker()">${t('Đóng')}</button>
    </div>`;
}
function coverPickSet(id){
  const rid=_cvRid,r=S.requests[rid];if(!r)return;
  if(!canSetCover(r,meId())){toast(t('Bạn không đổi được người OT cover của đơn này'));return;}
  if(!reqSetCover(rid,id,meId())){closeCoverPicker();return;}
  save();closeCoverPicker();
  if(typeof renderApprList==='function'&&(mgr||myFE))renderApprList();
  if(typeof renderMyPanel==='function')renderMyPanel();
  if(typeof renderMe==='function')renderMe(true);
  if(typeof refreshBadge==='function')refreshBadge();
  toast(id?t('Đã gửi yêu cầu OT cover tới')+' '+shortName((empById(id)||{}).name||id)
          :t('Đã bỏ người OT cover'));
}
function markNotifSeen(id){
  Object.values(S.notifs||{}).forEach(n=>{if(n.to===id&&SEEN_KINDS.includes(n.kind)&&!n.seen)n.seen=Date.now();});
  save();
}
/* Trùng đơn: đã có đơn pending/approved nào phủ lên các ngày đang khai chưa */
function conflictReqs(id,isoList,type){
  const want=new Set(isoList);
  return Object.values(S.requests||{}).filter(r=>{
    if(r.empId!==id||REQ_DEAD(r.status))return false;
    if(type&&r.type!==type&&r.status!=='approved')return false;
    for(const iso of reqDaySet(r))if(want.has(iso))return true;
    return false;
  });
}

/* ---- Nhân sự trong ngày, gom theo nhóm ca (O / D / N / OT / R / nghỉ) ----
   Hiện LỊCH THỰC TẾ (base + điều chỉnh + đơn đã duyệt). Ai có ca thực tế khác
   lịch chuẩn thì đánh dấu và hiện luôn "chuẩn → thực tế" để người sắp làm đơn
   biết ngay hôm đó ai nghỉ, ai đã đổi ca. */
const CREW_SHOW=c=>{const k=codeInfo(c).cat;return k==='work'||k==='swap'||k==='ot'||k==='rest'||k==='leave'||k==='combo';};
const CREW_ORDER=['O','OVP','D','N','OTD','OTN','R','LEAVE'];
/* Nhóm hiển thị của một mã ca */
function crewGroupOf(c){
  const cat=codeInfo(c).cat;
  if(cat==='leave')return 'LEAVE';
  if(cat==='rest') return 'R';
  return baseShiftOf(c)||c;
}
/* Ca O của khối văn phòng tách thành cột riêng: ký hiệu in ra vẫn là "O"
   theo quy định công ty, nhưng đứng riêng vì hai khối không cover cho nhau. */
function crewGroupOfEmp(e,c){
  const g=crewGroupOf(c);
  return (g==='O'&&poolOf(e)===POOL_OFF)?'OVP':g;
}
/* Nhãn + màu của cột nhóm */
function crewGroupInfo(g){
  if(g==='LEAVE')return{code:'AL',label:'Nghỉ phép / vắng mặt',col:'var(--cAL)',rest:true};
  if(g==='OVP') return{code:'O', label:'Office — khối văn phòng',col:'var(--cSW)',rest:false};
  const i=codeInfo(g);
  return{code:g,label:g==='O'?'Office — khối sản xuất':i.l,col:i.col,rest:i.cat==='rest'};
}
function crewOfDay(iso){
  const g={};
  schedEmps().forEach(e=>{
    const r=eff(e.id,iso), c=r.code;
    if(!c||!CREW_SHOW(c))return;
    const std=(S.base[e.id]||{})[iso]||'';
    const key=crewGroupOfEmp(e,c);
    (g[key]=g[key]||[]).push({
      e,code:c,std,
      ovr:!!(std&&std!==c)          // ca thực tế khác lịch chuẩn
    });
  });
  return Object.keys(g)
    .sort((a,b)=>{
      const ia=CREW_ORDER.indexOf(a),ib=CREW_ORDER.indexOf(b);
      return (ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b);
    })
    .map(k=>[k,g[k].sort((x,y)=>
      (y.ovr-x.ovr)||                                    // người có biến động lên trước
      String(x.e.team||'').localeCompare(String(y.e.team||''),'vi',{numeric:true}))]);
}
/* ============================================================
   AI ĐỔI CA ĐƯỢC VỚI AI
   Chỉ đổi ca giữa hai người đang có CA THẬT trong ngày đó: ca làm việc
   (O / D / N và các mã ca tự khai) hoặc ngày nghỉ ca R.
   Người đang NGHỈ PHÉP (AL8 / AL4 / NP / OFF) hay đang TĂNG CA (OTD /
   OTN / X) thì không đổi ca được — nghỉ phép rồi thì lấy ca đâu mà đổi.
   ============================================================ */
const SWAP_OK_CATS={work:1,rest:1,swap:1};
const SWAPPABLE=c=>!!(c&&SWAP_OK_CATS[codeInfo(c).cat]);
/* Trả về lý do KHÔNG đổi ca được ('' nghĩa là đổi được) */
function swapBlockReason(id,iso){
  const c=eff(id,iso).code;
  if(!c)return 'chưa xếp ca';
  if(SWAPPABLE(c))return '';
  const cat=codeInfo(c).cat;
  if(cat==='leave')return 'đang nghỉ phép';
  if(cat==='ot')   return 'đang tăng ca';
  return 'ca '+c+' không đổi được';
}
/* Kiểm tra cả hai người trên toàn bộ các ngày của đơn.
   Thêm một chốt chặn nữa: KHÁC KHỐI thì không đổi ca được. Nhóm Office làm
   hành chính, nhóm A/B/C/D trực vận hành — ca O của hai bên khác hẳn tính
   chất nên không ai trực thay ai, dù ký hiệu in ra đều là "O". */
function swapBlockList(aId,bId,isoList){
  const out=[];
  const nm=id=>shortName((empById(id)||{}).name||id);
  if(aId&&bId&&!samePool(aId,bId)){
    out.push(`${nm(aId)} (${t(POOL_LABEL[poolOfId(aId)])}) ⇄ ${nm(bId)} (${t(POOL_LABEL[poolOfId(bId)])}): `
      +t('khác khối nhân lực, không trực thay ca cho nhau được'));
    return out;
  }
  isoList.forEach(iso=>{
    [aId,bId].forEach(id=>{
      if(!id)return;
      const why=swapBlockReason(id,iso);
      if(why)out.push(`${fmtVN(iso)}: ${nm(id)} ${t(why)}`);
    });
  });
  return out;
}

/* ---- Người đang nghỉ (R) ngày đó → ưu tiên gợi ý đổi ca ---- */
function swapCandidates(id,iso){
  const me=empById(id);
  const list=schedEmps().filter(e=>e.id!==id);
  const score=e=>{
    const c=eff(e.id,iso).code;
    let s=0;
    if(codeInfo(c).cat==='rest')s-=100;                 // đang nghỉ → gợi ý đầu tiên
    if(me&&e.team===me.team)s-=10;                      // cùng nhóm
    if(me&&e.role===me.role)s-=5;                       // cùng vai trò
    return s;
  };
  return list.sort((a,b)=>score(a)-score(b));
}

/* ---- Chuỗi ngày đã làm liên tục tính đến hôm nay ---- */
function workStreak(id){
  let n=0;
  for(let i=0;i<40;i++){
    const c=eff(id,addDaysIso(todayIso(),-i)).code;
    const cat=codeInfo(c).cat;
    if(c&&(cat==='work'||cat==='swap'||cat==='ot'||cat==='combo'))n++;else break;
  }
  return n;
}

/* ============================================================
   PHÉP NĂM
   Phần mềm đưa vào dùng giữa năm nên số phép đã dùng trước đó
   không có trong hệ thống. Nhân viên khai số phép CÒN LẠI tại
   một mốc ngày (e.alLeftBase / e.alLeftAt); app trừ dần từ mốc.
   Chưa khai mốc thì tính theo quỹ phép năm như cũ.
   ============================================================ */
function alDayValue(c){
  if(!c)return 0;
  if(c==='AL8')return 1;
  if(c==='AL4')return 0.5;
  if(codeInfo(c).cat==='leave'&&/^AL/.test(c))return 1;
  return 0;
}
/* Đếm ngày phép năm đã dùng trong năm dương lịch */
function alUsed(id,year){
  let used=0;const seen=new Set();
  [S.base[id],S.over[id]].forEach(o=>{for(const iso in (o||{})){
    if(seen.has(iso)||iso.slice(0,4)!==String(year))continue;
    seen.add(iso);used+=alDayValue(eff(id,iso).code);
  }});
  return used;
}
/* Đếm ngày phép năm đã dùng KỂ TỪ một mốc ngày (tính cả ngày mốc) */
function alUsedSince(id,fromIso){
  let used=0;const seen=new Set();
  [S.base[id],S.over[id]].forEach(o=>{for(const iso in (o||{})){
    if(seen.has(iso)||iso<fromIso)continue;
    seen.add(iso);used+=alDayValue(eff(id,iso).code);
  }});
  return used;
}
function alQuota(id){const e=empById(id);return (e&&+e.alQuota)||+(S.settings.alQuota)||AL_QUOTA_DEFAULT;}
function alHasBase(id){
  const e=empById(id)||{};
  return !!(e.alLeftAt&&e.alLeftBase!==''&&e.alLeftBase!==undefined&&e.alLeftBase!==null);
}
/* Số phép năm còn lại hiện tại */
function alLeft(id){
  const e=empById(id)||{};
  if(alHasBase(id))return +e.alLeftBase-alUsedSince(id,e.alLeftAt);
  return alQuota(id)-alUsed(id,new Date().getFullYear());
}
/* Số ngày phép đang chờ duyệt (chưa trừ vào lịch) */
function alPending(id){
  let n=0;
  Object.values(S.requests||{}).forEach(r=>{
    if(r.empId!==id||r.type!=='leave'||r.status!=='pending')return;
    reqDays(r).forEach(d=>{n+=alDayValue(d.code);});
  });
  return n;
}

/* Giờ tăng ca: đã duyệt (đã vào lịch) vs đang chờ duyệt (còn trong đơn) */
function otSummary(id,ym){
  const days=daysOfPeriod(ym);
  let approved=0,pending=0;
  days.forEach(iso=>{
    const c=eff(id,iso).code;if(!c)return;
    const sp=comboSplitHours(c,effHours(id,iso));
    if(sp)approved+=sp.ot;                       // ca kép chỉ tính phần tăng ca
    else if(codeInfo(c).cat==='ot')approved+=effHours(id,iso);
  });
  Object.values(S.requests||{}).forEach(r=>{
    if(r.empId!==id||r.type!=='ot'||r.status!=='pending')return;
    reqDays(r).forEach(d=>{if(days.includes(d.iso))pending+=(d.hours||getHours(d.code||'OTD'));});
  });
  return{approved,pending};
}

/* =================== RENDER TRANG CHÍNH =================== */
function renderMe(force){
  const id=meId();
  applyRoleUI();
  const login=$('meLogin'),body=$('meBody');
  if(!login||!body)return;
  login.style.display=id?'none':'';
  body.style.display=id?'':'none';
  if(!id)return;
  // Thư ký / quản lý người Hàn không có trang chính cá nhân
  if(noSelf){body.style.display='none';body.innerHTML='';return;}
  // đang gõ trong sheet thì không vẽ lại (tránh mất chữ khi Firebase đẩy dữ liệu về)
  if(!force&&document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;

  const e=empById(id);
  const ym=schedMonthOf(pvAnchorIso());     // kỳ công chứa ngày đang xem
  const per=periodFor(ym);
  const allDays=daysOfPeriod(ym);
  // Giờ công = tổng các ngày ĐÃ QUA (đã làm, tính cả hôm nay); ngày chưa tới không tính
  const pastDays=allDays.filter(iso=>iso<=todayIso());
  const st=calcStats(id,pastDays);
  const stFull=calcStats(id,allDays);
  const ot=otSummary(id,ym);
  const initials=(e.name||id).trim().split(/\s+/).map(w=>w[0]).slice(-2).join('').toUpperCase();
  const streak=workStreak(id);
  const news=unseenDecisions(id);
  const confirms=pendingConfirms(id);
  const bellN=notifUnseenCount(id);
  const pendingMine=myReqs(id).filter(r=>r.status==='pending').length;
  // Nghỉ phép trong kỳ (số ngày, tính cả ngày phép đã duyệt sắp tới)
  const nLeave=Object.entries(stFull.cnt)
    .filter(([c])=>codeInfo(c).cat==='leave')
    .reduce((a,[c,n])=>a+(alDayValue(c)||1)*n,0);

  body.innerHTML=`
  <div class="pv-top">
    <div class="av">${esc(initials)}</div>
    <div class="who">
      <div class="nm">${esc(shortName(e.name)||id)}</div>
      <div class="ps">${e.team?'Nhóm '+esc(e.team)+' · ':''}${esc(e.id)}</div>
    </div>
    <button class="pv-icon pv-bell" onclick="openMyPanel('ntf')" title="Thông báo">🔔${bellN?`<span class="bell-bdg">${bellN>9?'9+':bellN}</span>`:''}</button>
    <button class="pv-icon" onclick="openMyPanel('sum')" title="Bảng công (thống kê theo ngày/giờ)">📊</button>
    <button class="pv-icon" onclick="openMyPanel('acc')" title="Tài khoản">🔑</button>
    <button class="pv-icon" onclick="doLogout()" title="Đăng xuất">↪</button>
  </div>

  ${confirms.length?`<div class="pv-confirm">
    <div class="pv-confirm-h">⚠️ ${confirms.length} việc cần bạn xác nhận</div>
    ${confirms.map(n=>n.kind==='schedChange'
      ?`<div class="pv-cf-item">
         <div class="tx"><b>Lịch ${fmtVN(n.iso)} ${dowOf(n.iso)}</b> vừa được ${esc(shortName((empById(n.from)||{}).name||n.from))} đổi
           ${chip(n.oldCode||'—')} <span class="ar">→</span> ${chip(n.newCode||'—')}.
           <i>Xác nhận để gửi đơn tương ứng, hoặc huỷ để trả lịch về cũ.</i></div>
         <div class="acts"><button class="btn ok sm" onclick="confirmSchedChange('${n.id}')">✓ Xác nhận & làm đơn</button>
           <button class="btn warn sm" onclick="declineSchedChange('${n.id}')">✕ Huỷ thay đổi</button></div>
       </div>`
      :`<div class="pv-cf-item">
         <div class="tx"><b>Đổi ca ${fmtVN(n.iso||(S.requests[n.reqId]||{}).from)}</b> — ${esc(shortName((empById(n.from)||{}).name||n.from))} muốn đổi ca với bạn.
           <i>Xác nhận nếu bạn đồng ý đổi ca.</i></div>
         <div class="acts"><button class="btn ok sm" onclick="confirmSwap('${n.id}')">✓ Đồng ý đổi ca</button>
           <button class="btn warn sm" onclick="declineSwap('${n.id}')">✕ Từ chối</button></div>
       </div>`).join('')}
  </div>`:''}

  ${(typeof evBannerHtml==='function')?evBannerHtml(allDays.filter(iso=>iso>=todayIso())):''}

  <div class="card pv-cal-card">
    <div class="pv-cal-head">
      <button class="nav" onclick="pvShift(-1)">◀</button>
      <div class="pv-range" id="pvRange"></div>
      <button class="nav" onclick="pvShift(1)">▶</button>
      <div class="seg">
        <button class="${pvMode==='week'?'on':''}" onclick="pvSetMode('week')">Tuần</button>
        <button class="${pvMode==='month'?'on':''}" onclick="pvSetMode('month')">Tháng</button>
      </div>
      <button class="btn sec sm" onclick="pvToday()">Hôm nay</button>
    </div>
    <div id="pvCal"></div>
    <div class="pv-foot">
      <span class="tipdot"><i class="d-ovr"></i> ca điều chỉnh</span>
      <span class="tipdot"><i class="d-pend"></i> đơn chờ</span>
      <span class="tipdot"><i class="d-ok"></i> đơn duyệt</span>
      <span style="flex:1"></span>
      <button class="btn sec sm" onclick="openLegendSheet()">Chú giải</button>
    </div>
  </div>

  ${streak>=STREAK_WARN?`<div class="pv-alert warn">⚠️ Bạn đã làm <b>${streak} ngày liên tục</b>. Cân nhắc xin nghỉ bù.</div>`:''}

  <div class="pv-stats">
    <button class="sbox" onclick="repMode='stats';go('rep')"><div class="v">${rnd1(st.hWork)}<i>h</i></div><div class="k">Giờ công đã làm · ${esc(per.short)}</div></button>
    <button class="sbox ot" onclick="openMyPanel('ot')"><div class="v">${rnd1(ot.approved)}<i>h</i></div>
      <div class="k">Tăng ca đã duyệt${ot.pending?` <span class="pd">+${rnd1(ot.pending)}h chờ</span>`:''}</div></button>
    <button class="sbox al" onclick="openMyPanel('al')"><div class="v">${rnd1(nLeave)}<i>ngày</i></div>
      <div class="k">Nghỉ phép · ${esc(per.short)}</div></button>
    <button class="sbox rq" onclick="openMyPanel('req')"><div class="v">${pendingMine}</div><div class="k">Đơn đang chờ duyệt</div></button>
  </div>`;

  renderPvCal();
}

/* =================== LỊCH TUẦN / THÁNG =================== */
function pvSetMode(m){pvMode=m;renderMe(true);}
function pvShift(d){
  if(pvMode==='week'){pvAnchor=addDaysIso(pvAnchorIso(),7*d);renderMe(true);return;}
  // Chế độ tháng = kỳ công 21 → 20: nhảy sang kỳ trước / kỳ sau
  const[y,m]=schedMonthOf(pvAnchorIso()).split('-').map(Number);
  const a=new Date(y,m-1+d,1);
  pvAnchor=periodFor(a.getFullYear()+'-'+pad(a.getMonth()+1)).from;
  renderMe(true);
}
function pvToday(){pvAnchor=todayIso();renderMe(true);}

function pvDays(){
  const a=pvAnchorIso();
  if(pvMode==='week'){
    const mon=mondayOf(a);
    return{days:Array.from({length:7},(_,i)=>addDaysIso(mon,i)),lead:0,
      label:t('Tuần')+' '+fmtVN(mon)+' – '+fmtVN(addDaysIso(mon,6))};
  }
  /* Chế độ "tháng" = KỲ CÔNG của công ty: 21 tháng trước → 20 tháng này */
  const ym=schedMonthOf(a), p=periodFor(ym);
  const days=daysOfPeriod(ym);
  return{days,
    lead:(new Date(p.from+'T00:00:00').getDay()+6)%7,
    label:p.label};
}

/* Dấu hiệu đơn trên ô ngày */
function pvDayFlags(id,iso){
  const rs=reqsOfDay(id,iso);
  return{pend:rs.some(r=>r.status==='pending'),ok:rs.some(r=>r.status==='approved'),n:rs.length};
}

function renderPvCal(){
  const id=meId();if(!id)return;
  const box=$('pvCal');if(!box)return;
  const{days,lead,label}=pvDays();
  const rg=$('pvRange');if(rg)rg.textContent=label;
  const t=todayIso();
  let h=`<div class="pv-cal ${pvMode}">`;
  for(let i=0;i<7;i++)h+=`<div class="hd${i>4?' we':''}">${dowShort(i)}</div>`;
  for(let k=0;k<lead;k++)h+='<div class="pd"></div>';
  const evOn=typeof eventsOfDay==='function';
  days.forEach(iso=>{
    const r=eff(id,iso), f=pvDayFlags(id,iso);
    const dw=new Date(iso+'T00:00:00').getDay();
    const info=r.code?codeInfo(r.code):null;
    const dd=+iso.slice(8), mm=+iso.slice(5,7);
    // Kỳ công vắt qua 2 tháng: ngày ≥21 là của tháng đầu kỳ → tô nhạt cho dễ phân biệt
    const head=pvMode==='month'&&dd>=21;
    /* Ngày có sự kiện (nhập tàu, bảo dưỡng…) đổi màu — js/20-events.js */
    const ev=evOn?eventsOfDay(iso):[];
    h+=`<button class="pv-d${iso===t?' today':''}${r.code?'':' empty'}${dw===0||dw===6?' we':''}${head?' pmo':''}${ev.length?' evday':''}"
        onclick="openDaySheet('${iso}')" title="${fmtVNfull(iso)} ${dowOf(iso)}${info?' — '+esc(info.l):''}${ev.length?' · 📌 '+esc(evTitleOfDay(iso)):''}">
      <span class="dn">${dd}${dd===1?`<i class="mo">/${mm}</i>`:''}</span>
      ${pvMode==='week'?`<span class="dw">${dowOf(iso)}</span>`:''}
      <span class="cbox">${r.code?chip(r.code):'<span class="dash">—</span>'}</span>
      ${pvMode==='week'&&info?`<span class="clbl">${esc(info.l)}</span>`:''}
      ${ev.length?`<span class="evtag">📌 ${esc(ev[0].title||t('Sự kiện'))}</span>`:''}
      <span class="flags">
        ${r.ovr?'<i class="d-ovr"></i>':''}
        ${f.pend?'<i class="d-pend"></i>':''}
        ${f.ok?'<i class="d-ok"></i>':''}
      </span>
    </button>`;
  });
  box.innerHTML=h+'</div>';
}

/* ============================================================
   SHEET THAO TÁC THEO NGÀY
   Bấm 1 ngày trên lịch → xem chi tiết ngày đó + gửi đơn ngay.
   ============================================================ */
const REQ_LABEL={leave:'Nghỉ phép',swap:'Đổi ca',ot:'Tăng ca',change:'Đổi mã ca',
                 wt:'Bổ sung công',late:'Đi trễ / Về sớm',multi:'Làm liên tục nhiều ngày'};
const REQ_ICON ={leave:'🏖',swap:'🔄',ot:'⚡',change:'✏️',wt:'🪪',late:'⏰',multi:'🔁'};
/* Đơn khai theo dòng (mỗi ngày 1 dòng); riêng "multi" khai theo khoảng ngày liên tục */
const REQ_RANGE_TYPES=['multi'];
const isRangeForm=t=>REQ_RANGE_TYPES.includes(t);

function openDaySheet(iso,form){
  if(!meId()){toast('Phiên đăng nhập đã hết');renderGate();return;}
  pvSheetDate=iso;pvSheetForm=null;
  renderDaySheet();
  $('daySheetMask').classList.add('on');
  if(form)dsForm(form);
}
function closeDaySheet(){$('daySheetMask').classList.remove('on');pvSheetForm=null;}

/* Mở / đóng 1 loại đơn → khởi tạo lại state form */
function dsForm(t){
  if(pvSheetForm===t){pvSheetForm=null;renderDaySheet();return;}
  pvSheetForm=t;
  const me=meId();
  dsOwnerId=me;dsWithId='';dsGuarId='';dsCoverId='';dsNoteVal='';
  /* Chế độ in mặc định theo loại đơn (xem REQ_MUST_PRINT ở js/08-requests.js):
     bổ sung công + đổi ca vào hàng chờ in, các loại còn lại không cần in. */
  dsNoPrint=defaultNoPrint(t);
  dsReasonCode='forgot_card';dsReasonOther='';dsLateType='come_late';
  dsMultiFrom=pvSheetDate;dsMultiTo=pvSheetDate;dsMultiIn='08:00';dsMultiOut='17:00';
  dsRows=isRangeForm(t)?[]:[dsNewRow(t,pvSheetDate)];
  renderDaySheet();
}

/* ---- Dòng đơn ---- */
function dsCodesFor(t){
  if(t==='leave')return allCodes().filter(c=>c.cat==='leave');
  if(t==='ot')   return allCodes().filter(c=>c.cat==='ot');
  // Đổi mã ca: chỉ mã ca làm việc + nghỉ ca. KHÔNG có SD/SN/SO —
  // đó là mã sinh ra khi DUYỆT đơn đổi ca, không phải mã tự chọn.
  return allCodes().filter(c=>c.cat==='work'||c.cat==='rest');
}
function dsDefaultCode(t,iso){
  const id=dsOwnerId||meId();
  const cur=eff(id,iso).code;
  if(t==='leave')return 'AL8';
  if(t==='ot')   return baseShiftOf(cur)==='N'?'OTN':'OTD';
  if(t==='change')return (dsCodesFor(t)[0]||{}).c||'';
  return '';
}
function dsDefaultTimes(iso){
  const id=dsOwnerId||meId();
  const b=baseShiftOf(eff(id,iso).code);
  return b?SHIFT_HOURS[b]:['08:00','17:00'];
}
function dsNewRow(t,iso){
  const hrs=dsDefaultTimes(iso);
  if(t==='ot'){
    // Mặc định gợi ý mẫu theo ca đang làm hôm đó cho đỡ phải chọn
    const cur=baseShiftOf(eff(dsOwnerId||meId(),iso).code);
    const pv=cur==='N'?'OTN':(cur==='D'?'OTD':'OT3');
    const p=otPreset(pv);
    return{iso,isoEnd:'',preset:pv,code:p.code,timeIn:p.from,timeOut:p.to};
  }
  return{iso,code:dsDefaultCode(t,iso),
    timeIn:(t==='wt'||t==='late')?hrs[0]:'',
    timeOut:(t==='wt'||t==='late')?hrs[1]:''};
}
/* Chọn mẫu OT → tự điền giờ; "Tự điền giờ" thì để người khai tự nhập */
function dsSetPreset(i,v){
  const r=dsRows[i];if(!r)return;
  const p=otPreset(v);
  r.preset=v;r.code=p.code;
  if(p.from){r.timeIn=p.from;r.timeOut=p.to;r.isoEnd=p.overnight?addDaysIso(r.iso,1):'';}
  dsRenderForm();
}
/* Số giờ của một dòng OT */
function dsRowOtHours(r){return otHours(r.iso,r.timeIn,r.isoEnd,r.timeOut);}
function dsAddRow(){
  const t=pvSheetForm;if(!t)return;
  if(dsRows.length>=DS_MAX_ROWS){toast(t2('Một đơn tối đa')+' '+DS_MAX_ROWS+' '+t2('dòng — gửi thêm đơn mới'));return;}
  const last=dsRows[dsRows.length-1];
  /* Tăng ca: một ngày có thể có nhiều lần OT (VD 12:00–13:00 và 18:00–20:00)
     nên dòng mới GIỮ NGUYÊN ngày. Các loại đơn khác mỗi ngày một dòng nên
     nhảy sang ngày kế tiếp cho tiện khai liên tiếp. */
  const iso=last?(t==='ot'?last.iso:addDaysIso(last.iso,1)):pvSheetDate;
  dsRows.push(dsNewRow(t,iso));
  dsRenderForm();
}
function dsDelRow(i){
  if(dsRows.length<=1){toast('Đơn phải có ít nhất 1 ngày');return;}
  dsRows.splice(i,1);dsRenderForm();
}
function dsSetRow(i,k,v){
  const row=dsRows[i];if(!row)return;
  // Chọn "Loại nghỉ khác…" → bật ô tự ghi rồi vẽ lại form
  if(k==='code'&&v==='__other'){row.isCustom=true;row.code='__other';dsRenderForm();return;}
  if(k==='code'){row.isCustom=false;row.code=v;}
  else row[k]=v;                       // gồm 'custom' — không vẽ lại để giữ con trỏ
  if(k==='iso'){
    const cell=$('dsCur'+i);
    if(cell)cell.innerHTML=dsRowCurHtml(pvSheetForm,row);
  }
  dsFormUI();
}
/* Ô chọn mã cho đơn nghỉ phép / đổi mã ca. Riêng đơn nghỉ có thêm lựa chọn
   "Loại nghỉ khác…" cho phép nhân viên tự đánh loại nghỉ ngoài danh sách. */
function dsCodeCellHtml(t,row,i,codes){
  if(t!=='leave'){
    return `<select class="inp" onchange="dsSetRow(${i},'code',this.value)">
      ${codes.map(c=>`<option value="${c.c}"${c.c===row.code?' selected':''}>${c.c} — ${esc(c.l)}</option>`).join('')}
    </select>`;
  }
  const known=codes.some(c=>c.c===row.code);
  const isOther=!!row.isCustom||(!!row.code&&row.code!=='__other'&&!known);
  return `<select class="inp" onchange="dsSetRow(${i},'code',this.value)">
      ${codes.map(c=>`<option value="${c.c}"${(!isOther&&c.c===row.code)?' selected':''}>${c.c} — ${esc(c.l)}</option>`).join('')}
      <option value="__other"${isOther?' selected':''}>✎ Loại nghỉ khác…</option>
    </select>${isOther?`
    <input class="inp" style="margin-top:4px" placeholder="Tự ghi loại nghỉ (VD: Khám thai)"
       value="${esc(row.custom||(row.code!=='__other'?row.code:'')||'')}" oninput="dsSetRow(${i},'custom',this.value)">`:''}`;
}
/* Chuẩn hoá loại nghỉ tự khai → mã ngắn + đăng ký vào customCodes để nơi khác nhận diện */
function normCustomLeave(txt){
  const raw=(txt||'').trim();if(!raw)return '';
  let code=noAccent(raw).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)||'LK';
  S.settings=S.settings||{};S.settings.customCodes=S.settings.customCodes||[];
  if(!allCodes().some(c=>c.c===code))
    S.settings.customCodes.push({c:code,l:raw,col:'var(--cNP)',cat:'leave'});
  return code;
}
/* Ca hiện tại của (các) người liên quan trong ngày của dòng */
function dsRowCurHtml(t,row){
  const own=dsOwnerId||meId();
  const ca=eff(own,row.iso).code;
  if(t==='swap'&&dsWithId){
    const cb=eff(dsWithId,row.iso).code;
    return `${ca?chip(ca):'<span class="muted">—</span>'} <span class="ar">⇄</span> ${cb?chip(cb):'<span class="muted">—</span>'}`;
  }
  return ca?chip(ca):'<span class="muted">—</span>';
}

/* ---- Chọn người: ô tìm theo tên (bỏ dấu vẫn khớp) ---- */
function dsPersonPicker(key,label,curId,hint){
  const e=curId?empById(curId):null;
  return `<div class="fg pick">
    <label class="fl">${label}</label>
    <div class="pick-cur">
      ${e?`<span class="pc-n"><b>${esc(e.name||e.id)}</b><i>${e.team?'Nhóm '+esc(e.team)+' · ':''}${esc(e.id)}</i></span>`
         :'<span class="pc-n muted">Chưa chọn ai</span>'}
      <button type="button" class="btn sec sm" onclick="dsPickToggle('${key}')">${e?'Đổi':'Chọn'}</button>
    </div>
    <div class="pick-box" id="pkBox_${key}" style="display:none">
      <input class="inp" id="pkQ_${key}" placeholder="Gõ tên hoặc mã NV… (không cần dấu)"
             autocomplete="off" oninput="dsPickFilter('${key}')">
      <div class="pick-list" id="pkList_${key}"></div>
    </div>
    ${hint?`<p class="muted" style="margin-top:4px">${hint}</p>`:''}
  </div>`;
}
function dsPickToggle(key){
  const box=$('pkBox_'+key);if(!box)return;
  const show=box.style.display==='none';
  box.style.display=show?'':'none';
  if(show){const q=$('pkQ_'+key);if(q){q.value='';}dsPickFilter(key);if(q)q.focus();}
}
function dsPickFilter(key){
  const box=$('pkList_'+key);if(!box)return;
  const q=noAccent($('pkQ_'+key)?$('pkQ_'+key).value:'');
  const iso=(dsRows[0]&&dsRows[0].iso)||pvSheetDate;
  const own=dsOwnerId||meId();
  let list;
  if(key==='with')list=swapCandidates(own,iso);          // người nghỉ R lên đầu
  else list=activeEmps().slice();
  if(key==='with')list=list.filter(e=>e.id!==own);
  if(key==='owner')list=list.filter(e=>e.id!==dsWithId);
  if(key==='guar') list=list.filter(e=>e.id!==own);
  /* Người OT cover: chỉ trong CÙNG KHỐI (sản xuất ⇄ văn phòng không gánh ca
     cho nhau), ai đang nghỉ ca R hôm đó xếp lên đầu vì họ rảnh để tăng ca. */
  if(key==='cover'){
    const myPool=poolOfId(own);
    list=list.filter(e=>e.id!==own&&poolOf(e)===myPool);
    const restRank=e=>codeInfo(eff(e.id,iso).code||'').cat==='rest'?0:1;
    list.sort((a,b)=>restRank(a)-restRank(b)
      ||String(a.name||'').localeCompare(String(b.name||''),'vi'));
  }
  if(q)list=list.filter(e=>noAccent(e.name).includes(q)||noAccent(e.id).includes(q));
  list=list.slice(0,60);

  /* Đơn đổi ca: tách người đổi được / không đổi được (nghỉ phép, tăng ca…) */
  // ô "Đổi ca với" chỉ có ở đơn đổi ca; ô "Người đứng đơn" cũng phải kiểm khi đang khai đổi ca
  const checkSwap=(key==='with')||(key==='owner'&&pvSheetForm==='swap');
  const row=(e,why)=>{
    const c=eff(e.id,iso).code, rest=codeInfo(c).cat==='rest';
    const dis=!!why;
    return `<button type="button" class="pk-item${rest&&!dis?' free':''}${dis?' off':''}"
      ${dis?`disabled title="${esc(t('Không đổi ca được'))}: ${esc(t(why))}"`:`onclick="dsPickSet('${key}','${e.id}')"`}>
      <span class="n">${rest&&!dis?'🟢 ':''}${esc(e.name||e.id)}</span>
      <span class="m">${dis?esc(t(why)):(e.team?'Nhóm '+esc(e.team)+' · ':'')+esc(e.id)}</span>
      ${c?`<span class="cc" style="background:${codeInfo(c).col}">${c}</span>`:'<span class="cc" style="background:#94A3B8">—</span>'}
    </button>`;
  };
  let html='';
  if(checkSwap){
    const ok=[],no=[];
    /* Khác khối (sản xuất ⇄ văn phòng) thì loại thẳng, kèm lý do rõ ràng */
    const myPool=poolOfId(own);
    list.forEach(e=>{
      const why=(key==='with'&&poolOf(e)!==myPool)
        ? t('khác khối')+' — '+t(POOL_LABEL[poolOf(e)])
        : swapBlockReason(e.id,iso);
      (why?no:ok).push([e,why]);
    });
    html=ok.map(([e])=>row(e,'')).join('');
    if(!ok.length)html='<p class="muted" style="padding:8px 4px">Ngày này không có ai đổi ca được.</p>';
    if(no.length)html+=`<div class="pk-sep">Không đổi ca được ngày ${fmtVN(iso)}</div>`+no.map(([e,w])=>row(e,w)).join('');
  }else{
    html=list.map(e=>row(e,'')).join('');
  }
  box.innerHTML=html||'<p class="muted" style="padding:8px 4px">Không tìm thấy ai khớp.</p>';
}
function dsPickSet(key,id){
  if(key==='owner'){dsOwnerId=id;if(dsWithId===id)dsWithId='';}
  else if(key==='with')dsWithId=id;
  else if(key==='cover')dsCoverId=(dsCoverId===id)?'':id;   // bấm lại = bỏ chọn
  else dsGuarId=id;
  dsRenderForm();
}

function renderDaySheet(){
  const id=meId(),iso=pvSheetDate;
  const box=$('daySheetBody');if(!box||!id||!iso)return;
  const r=eff(id,iso), std=(S.base[id]||{})[iso]||'';
  const info=r.code?codeInfo(r.code):null;
  const rs=reqsOfDay(id,iso);
  const crew=crewOfDay(iso);
  const totalCrew=crew.reduce((a,[,l])=>a+l.length,0);
  const nChanged=crew.reduce((a,[,l])=>a+l.filter(m=>m.ovr).length,0);

  box.innerHTML=`
   <div class="ds-head">
     <div>
       <div class="ds-date">${dowOf(iso)}, ${fmtVNfull(iso)}${iso===todayIso()?' <span class="tag">hôm nay</span>':''}</div>
       <div class="ds-shift">${info?`${chip(r.code,1)} <b>${esc(info.l)}</b>`:'<span class="muted">Chưa xếp ca</span>'}</div>
       ${r.ovr&&std&&std!==r.code?`<div class="ds-note">Lịch chuẩn là ${chip(std)} — đã điều chỉnh</div>`:''}
     </div>
     <button class="ds-x" onclick="closeDaySheet()">✕</button>
   </div>

   ${(typeof evBannerHtml==='function')?evBannerHtml([iso]):''}

   ${rs.length?`<div class="ds-block">
     <h4>📋 Đơn của ngày này</h4>
     ${rs.map(x=>`<div class="ds-req ${x.status}">
        <span class="ic">${REQ_ICON[x.type]||'📄'}</span>
        <span class="tx"><b>${esc(REQ_LABEL[x.type]||x.type)}</b>${x.code?' · '+esc(x.code):''}
          ${reqDays(x).length>1?`<i>(${reqDays(x).length} ngày)</i>`:''}
          ${x.withId?`<i>với ${esc((empById(x.withId)||{}).name||x.withId)}</i>`:''}
          ${x.coverId?`<i>${reqCoverChip(x)}</i>`:''}
          ${x.reason?`<i>Lý do từ chối: ${esc(x.reason)}</i>`:''}</span>
        <span class="st ${reqStatusClass(x)}">${{pending:'CHỜ',approved:reqIsProvisional(x)?'TẠM DUYỆT':'DUYỆT',rejected:'TỪ CHỐI'}[x.status]||''}</span>
        ${canCancelReq(x,id)?`<button class="btn warn sm" onclick="cancelMyReq('${x.id}')">${x.status==='approved'?'Huỷ đơn đã duyệt':'Huỷ'}</button>`:''}
      </div>`).join('')}
   </div>`:''}

   ${crew.length?`<div class="ds-block">
     <h4>👥 Nhân sự ngày ${fmtVN(iso)} <span class="h4n">${totalCrew} người</span>${
        nChanged?`<span class="h4c">${nChanged} khác lịch chuẩn</span>`:''}</h4>
     <div class="crew-grid">
       ${crew.map(([b,list])=>{
          const gi=crewGroupInfo(b);
          return `<div class="crew-col${gi.rest?' rest':''}">
          <div class="crew-h"><span class="cc" style="background:${gi.col}">${esc(gi.code)}</span><b>${esc(gi.label)}</b><i>${list.length}</i></div>
          <div class="crew-n">${list.map(m=>`<span class="mate${m.e.id===id?' me':''}${m.ovr?' ovr':''}"${
              m.ovr?` title="${esc(t('Lịch chuẩn')+': '+m.std+' → '+t('thực tế')+': '+m.code)}"`:''}>
              <b class="nm">${esc(shortName(m.e.name)||m.e.id)}</b>
              ${m.e.team?`<i class="tm">${esc(teamShort(m.e.team))}</i>`:''}
              ${m.code!==gi.code?`<em class="now">${chip(m.code)}</em>`:''}
              ${m.ovr?`<em class="chg" title="${esc(t('Chuyển từ ca')+' '+m.std)}">⇄${esc(m.std)}</em>`:''}
            </span>`).join('')}</div>
        </div>`;}).join('')}
     </div>
     <details class="xp"><summary>${t('Giải thích')}</summary><div class="xp-b">
       <p class="crew-note">Xếp theo <b>ca thực tế</b> — ai đổi ca đã nằm sẵn ở nhóm mình đi làm hôm đó.</p>
       <p class="crew-note">${nChanged
        ?'Ô viền cam là người khác lịch chuẩn; dấu ⇄ ghi ca chuẩn cũ của họ.'
        :'Ngày này chưa có ai đổi so với lịch chuẩn.'}</p></div></details>
   </div>`:''}

   <div class="ds-block">
     <h4>✍️ Gửi đơn</h4>
     <div class="ds-acts">
       ${Object.keys(REQ_LABEL).map(t=>`<button class="da${pvSheetForm===t?' on':''}" onclick="dsForm('${t}')">
          <span class="ic">${REQ_ICON[t]}</span>${esc(REQ_LABEL[t])}</button>`).join('')}
     </div>
     <div id="dsForm">${pvSheetForm?dsFormHtml(pvSheetForm):''}</div>
   </div>`;
  if(pvSheetForm)dsFormUI();
}

/* Vẽ lại riêng phần form (không đụng tới phần trên của sheet) */
function dsRenderForm(){
  const el=$('dsForm');if(!el)return;
  el.innerHTML=pvSheetForm?dsFormHtml(pvSheetForm):'';
  dsFormUI();
}

/* ---- HTML của form theo loại đơn ---- */
function dsFormHtml(t){
  const own=dsOwnerId||meId();
  const codes=dsCodesFor(t);
  const needCode=(t==='leave'||t==='change');   // đơn tăng ca có bảng riêng bên dưới
  const needTime=(t==='wt'||t==='late');

  /* --- Đơn làm liên tục nhiều ngày: chọn theo KHOẢNG ngày --- */
  if(isRangeForm(t)){
    return `
    <div class="ds-form">
      <div class="pv-alert info sm">Loại đơn này khai theo <b>khoảng ngày liên tục</b> (một lần vào – một lần ra).</div>
      <div class="grid2">
        <div class="fg"><label class="fl">Từ ngày</label>
          <input type="date" class="inp" value="${dsMultiFrom}" onchange="dsMultiFrom=this.value;dsFormUI()"></div>
        <div class="fg"><label class="fl">Đến ngày</label>
          <input type="date" class="inp" value="${dsMultiTo}" onchange="dsMultiTo=this.value;dsFormUI()"></div>
      </div>
      <div class="grid2">
        <div class="fg"><label class="fl">Giờ vào (ngày đầu)</label>
          <input type="time" class="inp" value="${dsMultiIn}" onchange="dsMultiIn=this.value;dsFormUI()"></div>
        <div class="fg"><label class="fl">Giờ ra (ngày cuối)</label>
          <input type="time" class="inp" value="${dsMultiOut}" onchange="dsMultiOut=this.value;dsFormUI()"></div>
      </div>
      ${dsNoteHtml()}
      <div id="dsWarn"></div>
      <button class="btn ds-submit" onclick="dsSubmit('${t}')">Gửi đơn ${esc(REQ_LABEL[t])}</button>
    </div>`;
  }

  /* --- Các đơn còn lại: MỖI NGÀY 1 DÒNG --- */
  let h='<div class="ds-form">';

  if(t==='swap'){
    h+=`<div class="pv-alert info sm">Đơn đổi ca ghi nhận cho <b>cả hai người</b> — khi in ra mỗi ngày có 2 dòng thể hiện hai bên đổi ca cho nhau. Bạn có thể <b>khai hộ</b> đồng nghiệp.</div>`;
    h+=dsPersonPicker('owner','Người đứng đơn',own,
        own===meId()?'Mặc định là bạn. Đổi sang người khác nếu bạn khai hộ.':'⚠️ Bạn đang khai hộ người này.');
    h+=dsPersonPicker('with','Đổi ca với',dsWithId,
        'Người đang <b>nghỉ ca R</b> ngày đó được xếp lên đầu danh sách. '
       +'Chỉ đổi ca giữa hai người đang có ca O / D / N / R — ai đang nghỉ phép hoặc tăng ca thì không đổi ca được.');
  }

  /* --- Đơn tăng ca: mỗi dòng là một lần OT, khai được mốc giờ và ngày --- */
  if(t==='ot'){
    h+=`<div class="fg"><label class="fl">Các lần tăng ca — mỗi lần một dòng</label>
      <div class="ds-rows ot">
        <div class="ds-row hd ot">
          <span class="c2">Mẫu tăng ca</span>
          <span class="c1">Từ ngày</span><span class="c2">Giờ bắt đầu</span>
          <span class="c1">Đến ngày</span><span class="c2">Giờ kết thúc</span>
          <span class="c3">Số giờ</span><span class="c4"></span>
        </div>
        ${dsRows.map((row,i)=>{
          const hrs=dsRowOtHours(row);
          const over=row.isoEnd&&row.isoEnd!==row.iso;
          return `<div class="ds-row ot">
          <span class="c2"><select class="inp" onchange="dsSetPreset(${i},this.value)">
            ${OT_PRESETS.map(p=>`<option value="${p.v}"${p.v===(row.preset||'')?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select></span>
          <span class="c1"><input type="date" class="inp" value="${row.iso}" onchange="dsSetRow(${i},'iso',this.value)"></span>
          <span class="c2"><input type="time" class="inp" value="${row.timeIn||''}" onchange="dsSetRow(${i},'timeIn',this.value)"></span>
          <span class="c1"><input type="date" class="inp" value="${row.isoEnd||''}" placeholder="cùng ngày"
                 title="Bỏ trống nếu tăng ca trong cùng ngày" onchange="dsSetRow(${i},'isoEnd',this.value)"></span>
          <span class="c2"><input type="time" class="inp" value="${row.timeOut||''}" onchange="dsSetRow(${i},'timeOut',this.value)"></span>
          <span class="c3 othr">${hrs?rnd1(hrs)+'h':'—'}${over?' <i class="ovn">qua đêm</i>':''}</span>
          <span class="c4"><button type="button" class="rowx" onclick="dsDelRow(${i})" title="Xoá dòng">✕</button></span>
        </div>`;}).join('')}
      </div>
      <button type="button" class="btn sec sm addrow" onclick="dsAddRow()">＋ Thêm lần tăng ca</button>
      <p class="muted" style="margin-top:4px">Chọn mẫu là tự điền giờ. Tăng ca vắt qua nửa đêm thì điền <b>Đến ngày</b> là hôm sau — để trống nghĩa là trong cùng ngày. Tối đa ${DS_MAX_ROWS} dòng / đơn.</p>
    </div>`;
    h+=dsNoteHtml();
    h+=`<div id="dsWarn"></div>
      <button class="btn ds-submit" onclick="dsSubmit('${t}')">Gửi đơn ${esc(REQ_LABEL[t])}</button>
    </div>`;
    return h;
  }

  /* Bảng dòng */

  h+=`<div class="fg"><label class="fl">Các ngày xin ${esc((REQ_LABEL[t]||'').toLowerCase())} — mỗi ngày một dòng</label>
    <div class="ds-rows">
      <div class="ds-row hd${needTime?' wt':''}">
        <span class="c1">Ngày</span>
        ${needCode?'<span class="c2">Mã áp dụng</span>':''}
        ${needTime?'<span class="c2">Giờ vào</span><span class="c2">Giờ ra</span>':''}
        <span class="c3">${t==='swap'?'Ca hai bên':'Ca hiện tại'}</span>
        <span class="c4"></span>
      </div>
      ${dsRows.map((row,i)=>`<div class="ds-row${needTime?' wt':''}">
        <span class="c1"><input type="date" class="inp" value="${row.iso}" onchange="dsSetRow(${i},'iso',this.value)"></span>
        ${needCode?`<span class="c2">${dsCodeCellHtml(t,row,i,codes)}</span>`:''}
        ${needTime?`<span class="c2"><input type="time" class="inp" value="${row.timeIn||''}" onchange="dsSetRow(${i},'timeIn',this.value)"></span>
        <span class="c2"><input type="time" class="inp" value="${row.timeOut||''}" onchange="dsSetRow(${i},'timeOut',this.value)"></span>`:''}
        <span class="c3" id="dsCur${i}">${dsRowCurHtml(t,row)}</span>
        <span class="c4"><button type="button" class="rowx" onclick="dsDelRow(${i})" title="Xoá dòng">✕</button></span>
      </div>`).join('')}
    </div>
    <button type="button" class="btn sec sm addrow" onclick="dsAddRow()">＋ Thêm ngày</button>
    <p class="muted" style="margin-top:4px">Nghỉ nhiều ngày rời rạc thì bấm <b>Thêm ngày</b> cho từng ngày. Tối đa ${DS_MAX_ROWS} dòng / đơn.</p>
  </div>`;

  if(t==='leave')h+=dsCoverHtml();
  if(t==='wt'){
    h+=`<div class="fg"><label class="fl">Lý do</label>
      <select class="inp" onchange="dsReasonCode=this.value;dsWtReasonUI()" id="dsWtReason">
        ${WT_REASONS.map(x=>`<option value="${x.v}"${x.v===dsReasonCode?' selected':''}>${esc(x.vn)} / ${esc(x.en)}</option>`).join('')}
      </select>
      <input class="inp" id="dsWtOther" style="margin-top:6px;display:${dsReasonCode==='other'?'':'none'}"
             placeholder="Ghi rõ lý do khác..." value="${esc(dsReasonOther)}" oninput="dsReasonOther=this.value">
    </div>`;
    h+=dsPersonPicker('guar','Người bảo lãnh (không bắt buộc)',dsGuarId,'');
  }
  if(t==='late'){
    h+=`<div class="fg"><label class="fl">Loại đơn</label>
      <select class="inp" onchange="dsLateType=this.value">
        <option value="come_late"${dsLateType==='come_late'?' selected':''}>Đi trễ / Come late</option>
        <option value="leave_early"${dsLateType==='leave_early'?' selected':''}>Về sớm / Leave early</option>
      </select></div>`;
  }

  h+=dsNoteHtml();
  h+=`<div id="dsWarn"></div>
    <button class="btn ds-submit" onclick="dsSubmit('${t}')">Gửi đơn ${esc(REQ_LABEL[t])}</button>
  </div>`;
  return h;
}
/* ---- Người OT cover cho đơn nghỉ phép ----
   Nghỉ là ca trống một chỗ, nên nhân viên chỉ luôn được ai ở lại tăng ca gánh
   giúp thì người duyệt đỡ phải đi hỏi. Không bắt buộc. Người được chọn nhận
   thông báo có nút Đồng ý / Từ chối; từ chối cũng không chặn duyệt, chỉ hiện
   cờ để đổi sang người khác. */
function dsCoverHtml(){
  const own=dsOwnerId||meId();
  const iso=(dsRows[0]&&dsRows[0].iso)||pvSheetDate;
  /* Gợi ý nhanh: người CÙNG KHỐI đang nghỉ ca R đúng ngày đó (js/18-advice.js) */
  let sug=[];
  if(typeof leaveAdvice==='function'&&iso){
    try{sug=(leaveAdvice(own,iso,'AL8').cover||[]).filter(e=>e.id!==own).slice(0,6);}catch(e){sug=[];}
  }
  return dsPersonPicker('cover','🤝 Người OT cover (không bắt buộc)',dsCoverId,
      'Người ở lại <b>tăng ca gánh ca</b> thay bạn ngày đó. Người được chọn sẽ nhận thông báo để '
     +'<b>đồng ý hoặc từ chối</b>; người duyệt nhìn đơn là thấy luôn ai cover.')
   + (sug.length?`<div class="cv-sug"><span class="lb">${t('Đang nghỉ ca R ngày')} ${fmtVN(iso)} — ${t('gợi ý')}:</span>
      ${sug.map(e=>`<button type="button" class="cv-s${dsCoverId===e.id?' on':''}"
         onclick="dsPickSet('cover','${e.id}')">${esc(shortName(e.name)||e.id)}${
         e.team?`<em>${esc(teamShort(e.team))}</em>`:''}</button>`).join('')}
      ${dsCoverId?`<button type="button" class="cv-s clr" onclick="dsPickSet('cover','')">✕ ${t('Bỏ chọn')}</button>`:''}
     </div>`:'');
}
function dsNoteHtml(){
  return `<div class="fg"><label class="fl">Lý do / ghi chú</label>
    <textarea class="inp" rows="2" placeholder="VD: việc gia đình, khám bệnh..."
      oninput="dsNoteVal=this.value">${esc(dsNoteVal)}</textarea></div>
    ${dsPrintToggleHtml()}`;
}
/* Chọn đưa đơn vào hàng chờ in hay không cần in.
   Không in = đơn vẫn được lưu & duyệt bình thường, chỉ không hiện trong danh sách in. */
function dsPrintToggleHtml(){
  return `<div class="fg"><label class="fl">In đơn</label>
    <div class="seg print-seg">
      <button type="button" class="${dsNoPrint?'':'on'}" onclick="dsNoPrint=false;dsRenderForm()">🖨️ Cần in — đưa vào hàng chờ in</button>
      <button type="button" class="${dsNoPrint?'on':''}" onclick="dsNoPrint=true;dsRenderForm()">🚫 Không cần in</button>
    </div>
    <p class="muted" style="margin-top:4px">${dsNoPrint
      ?'Đơn này sẽ <b>không</b> xuất hiện trong danh sách chờ in. Có thể đổi lại sau ở màn Duyệt.'
      :'Đơn sau khi duyệt sẽ nằm trong danh sách <b>chờ in</b> để nhân sự in ra ký.'}</p>
    <p class="muted sm2">Mặc định: đơn <b>bổ sung công</b> và <b>đổi ca</b> phải in nộp nhân sự, các loại còn lại không cần in.</p>
  </div>`;
}
function dsWtReasonUI(){const o=$('dsWtOther');if(o)o.style.display=dsReasonCode==='other'?'':'none';}

/* ---- Cảnh báo động trong form ---- */
function dsFormUI(){
  const t=pvSheetForm;if(!t)return;
  const own=dsOwnerId||meId();
  const w=$('dsWarn');if(!w)return;
  let h='';

  if(isRangeForm(t)){
    if(dsMultiFrom&&dsMultiTo&&dsMultiTo<dsMultiFrom)h+=`<div class="pv-alert warn sm">⚠️ Ngày kết thúc nhỏ hơn ngày bắt đầu.</div>`;
    w.innerHTML=h;return;
  }

  const isos=dsRows.map(r=>r.iso).filter(Boolean);
  if(t!=='ot'){   // tăng ca cùng ngày nhiều lần là bình thường, không cảnh báo
    const dup=isos.filter((x,i)=>isos.indexOf(x)!==i);
    if(dup.length)h+=`<div class="pv-alert warn sm">⚠️ Có ngày bị khai trùng: ${[...new Set(dup)].map(fmtVN).join(', ')}.</div>`;
  }

  if(t==='swap'&&!dsWithId)h+=`<div class="pv-alert warn sm">⚠️ Chưa chọn người đổi ca.</div>`;
  if(t==='swap'&&dsWithId===own)h+=`<div class="pv-alert warn sm">⚠️ Không thể đổi ca với chính mình.</div>`;
  if(t==='swap'){
    const bad=swapBlockList(own,dsWithId,isos);
    if(bad.length)h+=`<div class="pv-alert warn sm">⚠️ Không đổi ca được: ${bad.map(esc).join(' · ')}.
      Chỉ đổi ca giữa hai người đang có ca O / D / N / R — nghỉ phép hay tăng ca thì không đổi ca được.</div>`;
  }

  const cf=conflictReqs(own,isos,t);
  if(cf.length)h+=`<div class="pv-alert warn sm">⚠️ Đã có ${cf.length} đơn khác phủ lên ngày đang khai
     (${cf.slice(0,3).map(r=>esc(REQ_LABEL[r.type]||r.type)+' '+fmtVN(r.from)).join(', ')}). Gửi tiếp có thể bị trùng.</div>`;

  if(t==='ot'){
    const bad=dsRows.filter(r=>!dsRowOtHours(r));
    if(bad.length)h+=`<div class="pv-alert warn sm">⚠️ Có ${bad.length} dòng chưa điền đủ giờ bắt đầu / kết thúc.</div>`;
    const tot=dsRows.reduce((a,r)=>a+dsRowOtHours(r),0);
    if(tot)h+=`<div class="pv-alert info sm">Tổng giờ tăng ca của đơn: <b>${rnd1(tot)}h</b>.</div>`;
  }
  if(t==='leave'){
    const want=dsRows.reduce((a,r)=>a+alDayValue(r.code),0);
    const left=alLeft(own), pend=alPending(own);
    if(want>0){
      const after=left-pend-want;
      h+=`<div class="pv-alert ${after<0?'warn':'info'} sm">
        Phép năm: còn <b>${rnd1(left)}</b> ngày${pend?` (đang chờ duyệt ${rnd1(pend)})`:''} · đơn này <b>${rnd1(want)}</b> ngày
        → còn lại <b>${rnd1(after)}</b> ngày.${after<0?' ⚠️ Vượt quá số phép còn lại.':''}</div>`;
    }
  }
  if(isos.length>1)h+=`<div class="pv-alert info sm">Đơn gồm <b>${isos.length} dòng</b> — khi in ra mỗi ngày là một dòng riêng${t==='swap'?' cho mỗi người':''}.</div>`;

  /* Nhắc nhở bối cảnh: hôm đó ai đã nghỉ, đơn của họ đang ở trạng thái nào,
     và đơn này có khả năng bị vướng không. Chạy hoàn toàn bằng logic trên
     dữ liệu đã tải sẵn — xem js/18-advice.js. */
  if(typeof advForFormHtml==='function')h+=advForFormHtml(own,dsRows,t);

  w.innerHTML=h;
}

/* ---- Gửi đơn ---- */
function dsSubmit(t){
  const me=meId();
  if(!me){toast('Phiên đăng nhập đã hết — đăng nhập lại');renderGate();return;}
  const empId=(t==='swap')?(dsOwnerId||me):me;
  if(!empById(empId)){toast('Người đứng đơn không hợp lệ');return;}

  const r={id:uid(),empId,type:t,byId:me,
    note:(dsNoteVal||'').trim(),status:'pending',source:'app',createdAt:Date.now(),
    noPrint:!!dsNoPrint};

  if(isRangeForm(t)){
    if(!dsMultiFrom){toast('Chọn ngày bắt đầu');return;}
    const to=dsMultiTo||dsMultiFrom;
    if(to<dsMultiFrom){toast('Ngày kết thúc nhỏ hơn ngày bắt đầu');return;}
    r.from=dsMultiFrom;r.to=to;r.code='';r.withId='';
    r.timeIn=dsMultiIn||'08:00';r.timeOut=dsMultiOut||'17:00';
  }else{
    /* Gom dòng, sắp theo ngày. Đơn tăng ca giữ NGUYÊN mọi dòng vì một ngày có
       thể tăng ca nhiều lần; các loại khác thì mỗi ngày chỉ một dòng. */
    const seen=new Set(),days=[];
    dsRows.slice().sort((a,b)=>a.iso<b.iso?-1:1).forEach(row=>{
      if(!row.iso)return;
      if(t!=='ot'){ if(seen.has(row.iso))return; seen.add(row.iso); }
      const d={iso:row.iso};
      if(t==='leave'){
        let cd=row.isCustom?normCustomLeave(row.custom):row.code;
        if(!cd||cd==='__other')cd=dsDefaultCode(t,row.iso);
        d.code=cd;
      }else if(t==='change')d.code=row.code||dsDefaultCode(t,row.iso);
      if(t==='ot'){
        const p=otPreset(row.preset||'');
        d.code=row.code||p.code||'OTD';
        d.preset=row.preset||'';
        d.timeIn=row.timeIn||p.from||'';
        d.timeOut=row.timeOut||p.to||'';
        if(row.isoEnd&&row.isoEnd!==row.iso)d.isoEnd=row.isoEnd;
        d.hours=otHours(d.iso,d.timeIn,d.isoEnd,d.timeOut);
      }
      if(t==='wt'||t==='late'){
        const hrs=dsDefaultTimes(row.iso);
        d.timeIn=row.timeIn||hrs[0];d.timeOut=row.timeOut||hrs[1];
      }
      days.push(d);
    });
    if(!days.length){toast('Thêm ít nhất 1 ngày cho đơn');return;}
    if(t==='swap'){
      if(!dsWithId||dsWithId===empId){toast(t2('Chọn người đổi ca hợp lệ'));return;}
      // Chỉ đổi ca giữa hai người đang có ca thật (O/D/N/R).
      // Nghỉ phép rồi thì không còn ca nào để đổi; tăng ca cũng không phải ca chính.
      const bad=swapBlockList(empId,dsWithId,days.map(d=>d.iso));
      if(bad.length){
        alert(t2('Không đổi ca được:')+'\n• '+bad.join('\n• ')+'\n\n'
             +t2('Chỉ đổi ca giữa hai người đang có ca O / D / N / R.'));
        return;
      }
      r.withId=dsWithId;
    }else r.withId='';
    r.days=days;
    r.from=days[0].iso;r.to=days[days.length-1].iso;
    r.code=days[0].code||'';           // giữ tương thích chỗ hiển thị cũ
    if(t==='wt'){
      r.reasonCode=dsReasonCode||'forgot_card';
      r.reasonOther=dsReasonCode==='other'?(dsReasonOther||'').trim():'';
      r.guarantorId=dsGuarId||'';
      r.timeIn=days[0].timeIn;r.timeOut=days[0].timeOut;
    }
    if(t==='late'){
      r.subType=dsLateType||'come_late';
      r.timeFrom=days[0].timeIn;r.timeTo=days[0].timeOut;
    }
  }

  // Chụp lại ca hiện tại trước khi duyệt để chi tiết đơn ổn định về sau
  r.before={};if(t==='swap')r.beforeW={};
  reqDays(r).forEach(d=>{
    r.before[d.iso]=eff(empId,d.iso).code||'';
    if(t==='swap')r.beforeW[d.iso]=eff(r.withId,d.iso).code||'';
  });

  // Đơn đổi ca: gửi thông báo cho người B để xác nhận. Chưa xác nhận thì đơn
  // vẫn vào hàng duyệt nhưng gắn cờ confirmW='pending' để quản trị nắm.
  if(t==='swap'&&r.withId&&r.withId!==me){
    r.confirmW='pending';
    newNotif({kind:'swapConfirm',to:r.withId,from:me,reqId:r.id,iso:r.from});
  }

  /* Đơn nghỉ phép có chỉ định người OT cover: ghi vào đơn để người duyệt thấy
     và gửi thông báo cho người đó bấm Đồng ý / Từ chối. Từ chối không chặn
     duyệt — người làm đơn hoặc người duyệt đổi sang người khác được. */
  if(t==='leave'&&dsCoverId&&dsCoverId!==empId){
    r.coverId=dsCoverId;r.coverSt='pending';
    newNotif({kind:'coverConfirm',to:r.coverId,from:me,reqId:r.id,iso:r.from});
  }

  S.requests[r.id]=r;
  save();
  pvSheetForm=null;
  closeDaySheet();
  renderMe(true);
  const who=empId!==me?(' '+t2('cho')+' '+shortName((empById(empId)||{}).name||empId)):'';
  toastWithPrint(t2('Đã gửi đơn')+' '+t2(REQ_LABEL[t]||t)+who+' '+t2('— chờ duyệt ✔'),r.id);
}

/* Nhân viên tự huỷ đơn của mình (kể cả đơn đã duyệt — lịch sẽ trả về ca chuẩn).
   Đơn đã in nộp nhân sự thì phải nhờ quản lý huỷ để còn báo lại giấy tờ. */
function cancelMyReq(rid){
  const id=meId(),r=S.requests[rid];
  if(!r){toast(t('Không tìm thấy đơn'));return;}
  if(!canCancelReq(r,id)){
    toast(r.printedAt?t('Đơn đã in nộp nhân sự — nhờ quản lý huỷ giúp')
                     :t('Bạn không huỷ được đơn này'));
    return;
  }
  let msg=t('Huỷ đơn này? Đơn sẽ bị xoá hẳn.');
  if(r.status==='approved')msg+='\n'+t('Đơn đã duyệt — lịch thực tế sẽ trả về ca chuẩn.');
  if(!confirm(msg))return;
  const x=cancelReq(rid,true);
  save();
  renderDaySheet();renderMe(true);
  if(typeof renderAppr==='function')renderAppr();
  if(typeof refreshBadge==='function')refreshBadge();
  toast(t('Đã huỷ đơn')+(x&&x.reverted?' · '+t('hoàn tác')+' '+x.reverted+' '+t('ô lịch'):''));
}

/* ============================================================
   BẢNG PHỤ: Tăng ca của tôi · Đơn của tôi · Phép năm · Tài khoản
   ============================================================ */
let myPanelTab='ot';
function openMyPanel(tab){
  if(!meId()){toast('Đăng nhập để xem');renderGate();return;}
  myPanelTab=noSelf?'acc':(tab||'ot');   // thư ký / sếp Hàn chỉ có mục Tài khoản
  renderMyPanel();
  $('myPanelMask').classList.add('on');
  if(myPanelTab==='req'||myPanelTab==='ntf'){markSeen(meId());renderMe(true);}
}
function closeMyPanel(){$('myPanelMask').classList.remove('on');}
function myPanelGo(t){myPanelTab=t;renderMyPanel();if(t==='req'||t==='ntf'){markSeen(meId());renderMe(true);}}

/* ---- 📊 Bảng công: thống kê theo ngày / theo giờ của chính người đăng nhập ----
   Giúp người lao động rà soát bảng công cuối tháng: mỗi ngày một dòng kèm mã ca,
   loại (ca làm / tăng ca / nghỉ phép) và số giờ; có tổng giờ công / OT / phép. */
let myStatYm=null;
function myStatPeriod(){return myStatYm||curSchedMonth();}
function myStatShift(delta){
  const ym=myStatPeriod();let a=ym.split('-').map(Number),y=a[0],m=a[1];
  m+=delta;while(m<1){m+=12;y--;}while(m>12){m-=12;y++;}
  myStatYm=y+'-'+pad(m);renderMyPanel();
}
function myPanelSum(id){
  const ym=myStatPeriod(),per=periodFor(ym),days=daysOfPeriod(ym),today=todayIso();
  const st=calcStats(id,days);
  const leaveDays=Object.entries(st.cnt).filter(([c])=>codeInfo(c).cat==='leave')
    .reduce((a,[c,n])=>a+(alDayValue(c)||1)*n,0);
  const otShiftN=otShifts(st);
  const catTxt={work:'Ca làm',swap:'Đổi ca',rest:'Nghỉ ca',ot:'Tăng ca',leave:'Nghỉ phép',combo:'Ca kép (trực + tăng ca)',other:'Khác'};
  const rows=days.map(iso=>{
    const r=eff(id,iso),c=r.code;if(!c)return '';
    const ci=codeInfo(c),h=effHours(id,iso);
    const sp=comboSplitHours(c,h);
    const hw=sp?sp.work:((ci.cat==='work'||ci.cat==='swap')?h:0),
          ho=sp?sp.ot:(ci.cat==='ot'?h:0),
          hl=sp?0:(ci.cat==='leave'?h:0);
    const prov=r.o&&r.o.prov;
    return `<tr class="${iso<=today?'':'fut'}" title="${esc(t(catTxt[ci.cat]||ci.cat))}">
      <td>${fmtVN(iso)} <span class="muted">${dowOf(iso)}</span></td>
      <td>${chip(c)}${prov?' <span class="mini-prov" title="Tạm duyệt, chờ Quản lý người Hàn chốt">~</span>':''}</td>
      <td class="num">${hw?rnd1(hw):''}</td>
      <td class="num ot">${ho?rnd1(ho):''}</td>
      <td class="num lv">${hl?rnd1(hl):''}</td></tr>`;
  }).filter(Boolean).join('');
  return `<div class="mp-sum">
    <div class="mp-sum-head">
      <button class="btn sec sm" onclick="myStatShift(-1)">◀</button>
      <b>${esc(per.label)}</b>
      <button class="btn sec sm" onclick="myStatShift(1)">▶</button>
      <span style="flex:1"></span>
      <button class="btn sec sm" onclick="myStatYm=null;renderMyPanel()">${t('Kỳ hiện tại')}</button>
    </div>
    <p class="muted sm2">${t('Bảng công của bạn trong kỳ — rà soát trước khi chốt cuối tháng.')}</p>
    <div class="mp-sum-kpi">
      <div class="k"><div class="v">${rnd1(st.hWork)}<i>h</i></div><span>${t('Giờ công')}</span></div>
      <div class="k ot"><div class="v">${rnd1(st.hOT)}<i>h</i></div><span>${t('Giờ tăng ca')} (${otShiftN})</span></div>
      <div class="k lv"><div class="v">${rnd1(leaveDays)}<i>${t('ngày')}</i></div><span>${t('Nghỉ phép')}</span></div>
    </div>
    <table class="tbl mp-sum-tbl">
      <colgroup><col><col style="width:52px"><col style="width:19%"><col style="width:17%"><col style="width:19%"></colgroup>
      <thead><tr>
      <th>${t('Ngày')}</th><th>${t('Mã')}</th><th class="num">${t('Công')}</th><th class="num">OT</th><th class="num">${t('Phép')}</th>
    </tr></thead><tbody>${rows||`<tr><td colspan="5" class="muted">${t('Kỳ này chưa có dữ liệu.')}</td></tr>`}
      <tr class="sum-total"><td colspan="2">${t('Tổng')}</td><td class="num">${rnd1(st.hWork)}</td><td class="num ot">${rnd1(st.hOT)}</td><td class="num lv">${rnd1(st.hLeave)}</td></tr>
    </tbody></table>
  </div>`;
}

function renderMyPanel(){
  const id=meId();const box=$('myPanelBody');if(!id||!box)return;
  const tabs=noSelf?[['acc','🔑 Tài khoản']]
                   :[['ot','⚡ Tăng ca'],['req','📋 Đơn của tôi'],['sum','📊 Bảng công'],['al','🏖 Phép năm'],['acc','🔑 Tài khoản']];
  let h=`<div class="mp-tabs">${tabs.map(([k,l])=>
    `<button class="${myPanelTab===k?'on':''}" onclick="myPanelGo('${k}')">${l}</button>`).join('')}
    <button class="ds-x" onclick="closeMyPanel()">✕</button></div>`;

  if(myPanelTab==='ot')      h+=myPanelOt(id);
  else if(myPanelTab==='req')h+=myPanelReq(id);
  else if(myPanelTab==='ntf')h+=myPanelNtf(id);
  else if(myPanelTab==='sum')h+=myPanelSum(id);
  else if(myPanelTab==='al') h+=myPanelAl(id);
  else                       h+=myPanelAcc(id);
  box.innerHTML=h;
}

/* ---- 🔔 Thông báo: việc cần xác nhận + thông báo + đơn đã quyết định ---- */
function myPanelNtf(id){
  const seenAt=lastSeen(id);
  const list=decidedList(id);
  const confirms=pendingConfirms(id);
  const infos=myNotifs(id).filter(n=>n.kind==='info');
  const cfItem=n=>{
    if(n.kind==='schedChange')
      return `<div class="ntf-item schedChange fresh">
         <span class="ic">🗓️</span>
         <span class="tx"><b>Đổi lịch ${fmtVN(n.iso)}</b> bởi ${esc(shortName((empById(n.from)||{}).name||n.from))}
           <i>${chip(n.oldCode||'—')} → ${chip(n.newCode||'—')}</i>
           <span class="ntf-acts"><button class="btn ok sm" onclick="confirmSchedChange('${n.id}')">✓ Xác nhận & làm đơn</button>
             <button class="btn warn sm" onclick="declineSchedChange('${n.id}')">✕ Huỷ</button></span></span>
       </div>`;
    if(n.kind==='coverConfirm'){
      const r=S.requests[n.reqId]||{};
      const dl=reqDays(r).map(d=>fmtVN(d.iso)).join(', ')||fmtVN(n.iso||r.from||'');
      return `<div class="ntf-item coverConfirm fresh">
         <span class="ic">🤝</span>
         <span class="tx"><b>${esc(shortName((empById(n.from)||{}).name||n.from))} nhờ bạn OT cover</b>
           <i>Ngày ${esc(dl)}${r.note?' · “'+esc(r.note)+'”':''}</i>
           <i class="muted">Đồng ý nghĩa là bạn nhận tăng ca gánh ca giúp — nhớ gửi đơn tăng ca riêng để được tính giờ.</i>
           <span class="ntf-acts"><button class="btn ok sm" onclick="confirmCover('${n.id}')">✓ Đồng ý</button>
             <button class="btn warn sm" onclick="declineCover('${n.id}')">✕ Từ chối</button></span></span>
       </div>`;
    }
    return `<div class="ntf-item swapConfirm fresh">
         <span class="ic">🔄</span>
         <span class="tx"><b>Đổi ca với ${esc(shortName((empById(n.from)||{}).name||n.from))}</b>
           <i>Ngày ${fmtVN(n.iso||(S.requests[n.reqId]||{}).from)}</i>
           <span class="ntf-acts"><button class="btn ok sm" onclick="confirmSwap('${n.id}')">✓ Đồng ý</button>
             <button class="btn warn sm" onclick="declineSwap('${n.id}')">✕ Từ chối</button></span></span>
       </div>`;
  };
  const cfBlock=confirms.length?`<div class="ds-block"><h4>⚠️ Cần bạn xác nhận (${confirms.length})</h4>
    ${confirms.map(cfItem).join('')}</div>`:'';
  /* Sự kiện trên lịch (nhập tàu, bảo dưỡng…) — bấm vào mở luôn ngày đó */
  const evs=myNotifs(id).filter(n=>n.kind==='event');
  const evBlock=evs.length?`<div class="ds-block"><h4>📌 ${t('Sự kiện')} (${evs.length})</h4>
    ${evs.slice(0,15).map(n=>`<div class="ntf-item event${n.seen?'':' fresh'}"${
       n.iso?` onclick="closeMyPanel();openDaySheet('${n.iso}')"`:''}>
       <span class="ic">📌</span>
       <span class="tx">${esc(n.text||'')}
         <i class="tm">${fmtDateTime(n.createdAt)}</i></span></div>`).join('')}</div>`:'';
  const infoBlock=infos.length?`<div class="ds-block"><h4>📣 Thông báo (${infos.length})</h4>
    ${infos.slice(0,15).map(n=>`<div class="ntf-item info${n.seen?'':' fresh'}">
       <span class="ic">📣</span>
       <span class="tx">${esc(shortName((empById(n.from)||{}).name||n.from))} ${esc(n.text||'')}
         <i class="tm">${fmtDateTime(n.createdAt)}</i></span></div>`).join('')}</div>`:'';
  const item=r=>{
    const fresh=(r.decidedAt||0)>seenAt;
    const stTxt=r.status==='approved'?(reqIsProvisional(r)?'🕒 Tạm duyệt (chờ QL Hàn)':'✅ Đã duyệt')
               :r.status==='rejected'?'❌ Bị từ chối':r.status;
    return `<div class="ntf-item ${r.status}${fresh?' fresh':''}" onclick="closeMyPanel();openDaySheet('${r.from}')">
      <span class="ic">${REQ_ICON[r.type]||'📄'}</span>
      <span class="tx"><b>${stTxt}</b> · ${esc(REQ_LABEL[r.type]||r.type)}
        <i>${r.type==='multi'?fmtVN(r.from)+' → '+fmtVN(r.to)
            :reqDays(r).map(d=>fmtVN(d.iso)).join(', ')}</i>
        ${r.reason?`<i>Lý do: ${esc(r.reason)}</i>`:''}
        <i class="tm">${fmtDateTime(r.decidedAt)}</i></span>
      ${fresh?'<span class="st pending">MỚI</span>':''}
    </div>`;
  };
  // mở tab này coi như đã xem các thông báo một chiều
  setTimeout(()=>markNotifSeen(id),0);
  return `
  <h3 style="margin:4px 0 10px">🔔 Thông báo</h3>
  ${cfBlock}${evBlock}${infoBlock}
  <div class="ds-block"><h4>📋 Kết quả đơn (${list.length})</h4>
  ${list.length?`<div class="ntf-list">${list.map(item).join('')}</div>`
    :'<p class="muted">Chưa có đơn nào được duyệt hay từ chối.</p>'}</div>
  <p class="muted sm2" style="margin-top:8px">Việc cần xác nhận nằm trên cùng. Đơn kết quả xếp theo thời điểm quyết định — mới nhất trước.</p>`;
}

/* ---- Tăng ca: đã duyệt / chờ duyệt / tổng giờ theo kỳ ---- */
function myPanelOt(id){
  const ms=monthsAvailable();
  const ym=schedMonthOf(pvAnchorIso());
  const per=periodFor(ym), days=daysOfPeriod(ym);

  const done=[];
  days.forEach(iso=>{
    const c=eff(id,iso).code;if(!c)return;
    const sp=comboSplitHours(c,effHours(id,iso));
    if(sp)done.push({iso,code:c,h:sp.ot});        // ca kép: chỉ phần tăng ca
    else if(codeInfo(c).cat==='ot')done.push({iso,code:c,h:effHours(id,iso)});
  });
  const wait=Object.values(S.requests||{}).filter(r=>r.empId===id&&r.type==='ot'&&r.status==='pending');
  const rej =Object.values(S.requests||{}).filter(r=>r.empId===id&&r.type==='ot'&&r.status==='rejected').slice(0,5);
  const tNow=todayIso();
  const donePast=done.filter(x=>x.iso<=tNow), doneNext=done.filter(x=>x.iso>tNow);
  const hPast=donePast.reduce((a,x)=>a+x.h,0), hNext=doneNext.reduce((a,x)=>a+x.h,0);
  let hWait=0;wait.forEach(r=>reqDays(r).forEach(d=>{hWait+=(d.hours||getHours(d.code||'OTD'));}));

  // tổng cả năm — chỉ tính ngày ĐÃ LÀM (không cộng trước ca tương lai)
  let hYear=0;const yr=String(new Date().getFullYear());
  ms.forEach(m=>daysOfPeriod(m).forEach(iso=>{
    if(iso.slice(0,4)!==yr||iso>tNow)return;
    const c=eff(id,iso).code;if(!c)return;
    const sp=comboSplitHours(c,effHours(id,iso));
    if(sp)hYear+=sp.ot;
    else if(codeInfo(c).cat==='ot')hYear+=effHours(id,iso);
  }));

  return `
  <h3 style="margin:4px 0 10px">⚡ Tăng ca — ${esc(per.label)}</h3>
  <div class="pv-stats in-panel">
    <div class="sbox"><div class="v">${rnd1(hPast)}<i>h</i></div><div class="k">Đã làm (kỳ này)${hNext?` <span class="pd">+${rnd1(hNext)}h sắp tới</span>`:''}</div></div>
    <div class="sbox ot"><div class="v">${rnd1(hWait)}<i>h</i></div><div class="k">Chờ duyệt</div></div>
    <div class="sbox al"><div class="v">${done.length}</div><div class="k">Lần tăng ca đã duyệt (kỳ này)</div></div>
    <div class="sbox rq"><div class="v">${rnd1(hYear)}<i>h</i></div><div class="k">Đã làm cả năm ${yr}</div></div>
  </div>

  <div class="ds-block"><h4>✅ Đã duyệt & vào lịch (${done.length})</h4>
    ${done.length?`<div class="ot-list">${done.map(x=>`<div class="ot-row">
        <span class="d">${dowOf(x.iso)} ${fmtVNfull(x.iso)}${x.iso>tNow?' <i class="ovn">sắp tới</i>':''}</span>
        ${chip(x.code)}<span class="h">${rnd1(x.h)}h</span></div>`).join('')}</div>`
      :'<p class="muted">Kỳ này chưa có ca tăng ca nào được duyệt.</p>'}
  </div>

  <div class="ds-block"><h4>⏳ Đang chờ duyệt (${wait.length})</h4>
    ${wait.length?wait.map(r=>`<div class="ds-req pending">
        <span class="ic">⚡</span>
        <span class="tx"><b>${esc(r.code||'OT')}</b> ${reqDays(r).map(d=>fmtVN(d.iso)).join(', ')}
          ${r.note?`<i>${esc(r.note)}</i>`:''}</span>
        <span class="st pending">CHỜ</span>
        <button class="btn warn sm" onclick="cancelMyReq('${r.id}');renderMyPanel()">Huỷ</button>
      </div>`).join(''):'<p class="muted">Không có đơn tăng ca nào đang chờ.</p>'}
  </div>

  ${rej.length?`<div class="ds-block"><h4>❌ Bị từ chối gần đây</h4>
    ${rej.map(r=>`<div class="ds-req rejected"><span class="ic">⚡</span>
      <span class="tx"><b>${esc(r.code||'OT')}</b> ${fmtVN(r.from)}${r.reason?`<i>${esc(r.reason)}</i>`:''}</span>
      <span class="st rejected">TỪ CHỐI</span></div>`).join('')}</div>`:''}

  <button class="btn" style="width:100%" onclick="closeMyPanel();openDaySheet(todayIso(),'ot')">＋ Đăng ký tăng ca mới</button>`;
}

/* ---- Đơn của tôi ---- */
let myReqFilter='all';           // all | pending | approved | rejected
function myReqSetFilter(f){myReqFilter=f;renderMyPanel();}
function myPanelReq(id){
  const all=myReqs(id);
  const grp={pending:[],approved:[],rejected:[]};
  all.forEach(r=>{if(grp[r.status])grp[r.status].push(r);});
  // Tổng hiển thị = đúng tổng các nhóm bên dưới (không lệch số như trước)
  const total=grp.pending.length+grp.approved.length+grp.rejected.length;
  const row=r=>`<div class="ds-req ${r.status}">
      <span class="ic">${REQ_ICON[r.type]||'📄'}</span>
      <span class="tx"><b>${esc(REQ_LABEL[r.type]||r.type)}</b>${r.code?' · '+esc(r.code):''}
        <i>${r.type==='multi'
             ? fmtVNfull(r.from)+' → '+fmtVNfull(r.to)
             : reqDays(r).map(d=>fmtVN(d.iso)+(d.code?' ('+d.code+')':'')).join(' · ')}</i>
        ${r.withId?`<i>Đổi ca với ${esc((empById(r.withId)||{}).name||r.withId)}</i>`:''}
        ${r.byId&&r.byId!==r.empId?`<i>✍️ ${r.byId===id?'Bạn khai hộ '+esc((empById(r.empId)||{}).name||r.empId):'Khai hộ bởi '+esc((empById(r.byId)||{}).name||r.byId)}</i>`:''}
        ${r.coverId?`<i>${reqCoverChip(r)}</i>`:''}
        ${r.note?`<i>${esc(r.note)}</i>`:''}${r.reason?`<i>Lý do: ${esc(r.reason)}</i>`:''}</span>
      <span class="st ${reqStatusClass(r)}">${{pending:'CHỜ',approved:reqIsProvisional(r)?'TẠM DUYỆT':'DUYỆT',rejected:'TỪ CHỐI'}[r.status]||esc(r.status)}</span>
      <span class="act">
        ${canSetCover(r,id)?`<button class="btn sec sm" onclick="openCoverPicker('${r.id}')" title="${t('Người OT cover')}">🤝</button>`:''}
        ${canCancelReq(r,id)?`<button class="btn warn sm" onclick="cancelMyReq('${r.id}');renderMyPanel()">${r.status==='approved'?'Huỷ đơn':'Huỷ'}</button>`:''}
        ${r.status==='approved'?`<button class="btn sec sm" onclick="printOne('${r.id}')">🖨️</button>`:''}
      </span>
    </div>`;
  const chips=[
    ['all','Tất cả',total],
    ['pending','⏳ Chờ duyệt',grp.pending.length],
    ['approved','✅ Đã duyệt',grp.approved.length],
    ['rejected','❌ Từ chối',grp.rejected.length]
  ];
  if(!chips.some(([k])=>k===myReqFilter))myReqFilter='all';
  const shown=myReqFilter==='all'
    ? all.filter(r=>grp[r.status])
    : (grp[myReqFilter]||[]);
  const sec=(key,ttl,list)=>list.length?`<div class="ds-block"><h4>${ttl} (${list.length})</h4>${list.map(row).join('')}</div>`:'';
  let body='';
  if(myReqFilter==='all'){
    body=sec('pending','⏳ Đang chờ duyệt',grp.pending)
        +sec('approved','✅ Đã duyệt',grp.approved)
        +sec('rejected','❌ Bị từ chối',grp.rejected);
    if(!total)body='<p class="muted">Bạn chưa có đơn nào.</p>';
  }else{
    body=shown.length?`<div class="ds-block">${shown.map(row).join('')}</div>`
      :'<p class="muted">Không có đơn nào ở mục này.</p>';
  }
  return `
  <h3 style="margin:4px 0 10px">📋 Đơn của tôi (${total})</h3>
  <div class="req-flt">${chips.map(([k,l,n])=>
    `<button class="fchip${myReqFilter===k?' on':''}" onclick="myReqSetFilter('${k}')">${l}<i>${n}</i></button>`).join('')}</div>
  ${body}`;
}

/* ---- Phép năm (cho phép tự khai số còn lại) ---- */
function myPanelAl(id){
  const e=empById(id)||{};
  const yr=new Date().getFullYear();
  const quota=alQuota(id);
  const hasBase=alHasBase(id);
  const left=alLeft(id), pend=alPending(id);
  const usedSince=hasBase?alUsedSince(id,e.alLeftAt):alUsed(id,yr);
  const total=hasBase?(+e.alLeftBase):quota;
  const pct=total>0?Math.max(0,Math.min(100,Math.round(usedSince/total*100))):0;

  // liệt kê ngày phép đã dùng trong năm
  const list=[];const seen=new Set();
  [S.base[id],S.over[id]].forEach(o=>{for(const iso in (o||{})){
    if(seen.has(iso)||iso.slice(0,4)!==String(yr))continue;seen.add(iso);
    const c=eff(id,iso).code;
    if(c&&codeInfo(c).cat==='leave')list.push({iso,code:c});
  }});
  list.sort((a,b)=>a.iso<b.iso?-1:1);

  return `
  <h3 style="margin:4px 0 10px">🏖 Phép năm ${yr}</h3>

  ${hasBase?'':`<div class="pv-alert warn sm">Phần mềm mới đưa vào dùng giữa năm nên chưa có số phép bạn đã nghỉ trước đó.
     Hãy nhập <b>số phép còn lại</b> theo bảng công của công ty ở ô bên dưới — từ mốc đó hệ thống tự trừ dần.</div>`}

  <div class="al-bar"><div class="fill" style="width:${pct}%"></div>
    <span>${rnd1(usedSince)} / ${rnd1(total)} ngày đã dùng${hasBase?' (từ '+fmtVNfull(e.alLeftAt)+')':''}</span></div>
  <div class="pv-stats in-panel">
    <div class="sbox al"><div class="v">${rnd1(left)}<i>ngày</i></div><div class="k">Còn lại</div></div>
    <div class="sbox"><div class="v">${rnd1(usedSince)}<i>ngày</i></div><div class="k">Đã dùng${hasBase?' từ mốc':''}</div></div>
    <div class="sbox ot"><div class="v">${rnd1(pend)}<i>ngày</i></div><div class="k">Đơn nghỉ chờ duyệt</div></div>
  </div>

  <div class="ds-block"><h4>✏️ Khai số phép còn lại</h4>
    <p class="muted" style="margin-bottom:8px">Nhập số ngày phép <b>còn lại</b> tại một mốc ngày (lấy theo bảng công / phòng nhân sự).
      Hệ thống sẽ trừ dần các ngày nghỉ phép <b>kể từ mốc đó</b> trở đi.</p>
    <div class="grid2">
      <div class="fg"><label class="fl">Số phép còn lại (ngày)</label>
        <input type="number" step="0.5" min="0" class="inp" id="alBaseVal" value="${hasBase?esc(e.alLeftBase):''}" placeholder="VD 7.5"></div>
      <div class="fg"><label class="fl">Tính từ ngày</label>
        <input type="date" class="inp" id="alBaseAt" value="${hasBase?esc(e.alLeftAt):todayIso()}"></div>
    </div>
    <div class="row" style="gap:8px">
      <button class="btn" style="flex:1" onclick="saveMyAl()">💾 Lưu</button>
      ${hasBase?`<button class="btn sec" style="flex:1" onclick="clearMyAl()">Bỏ mốc (dùng quỹ ${quota} ngày)</button>`:''}
    </div>
    ${e.alLeftUpdAt?`<p class="muted" style="margin-top:6px">Cập nhật lần cuối: ${fmtDateTime(e.alLeftUpdAt)}${e.alLeftBy&&e.alLeftBy!==id?' bởi '+esc(e.alLeftBy):''}</p>`:''}
  </div>

  <div class="ds-block"><h4>Các ngày nghỉ trong năm (${list.length})</h4>
    ${list.length?`<div class="ot-list">${list.map(x=>`<div class="ot-row${hasBase&&x.iso<e.alLeftAt?' pre':''}">
      <span class="d">${dowOf(x.iso)} ${fmtVNfull(x.iso)}</span>${chip(x.code)}
      <span class="h">${esc(codeInfo(x.code).l)}</span></div>`).join('')}</div>`
      :'<p class="muted">Chưa dùng ngày nghỉ nào trong năm.</p>'}
    ${hasBase?'<p class="muted" style="margin-top:6px">Dòng mờ là ngày <b>trước mốc</b> — không trừ lần nữa vì đã nằm trong số bạn khai.</p>':''}
  </div>

  <button class="btn" style="width:100%" onclick="closeMyPanel();openDaySheet(todayIso(),'leave')">＋ Đăng ký nghỉ phép</button>`;
}
function saveMyAl(){
  const id=meId(),e=empById(id);if(!e)return;
  const v=$('alBaseVal')?$('alBaseVal').value:'', at=$('alBaseAt')?$('alBaseAt').value:'';
  if(v===''||at===''){toast(t('Nhập đủ số ngày và mốc ngày'));return;}
  if(isNaN(+v)||+v<0){toast(t('Số ngày phép không hợp lệ'));return;}
  e.alLeftBase=+v;e.alLeftAt=at;e.alLeftBy=id;e.alLeftUpdAt=Date.now();
  save();renderMyPanel();renderMe(true);
  toast(t('Đã lưu — còn')+' '+rnd1(alLeft(id))+' '+t('ngày phép'));
}
function clearMyAl(){
  const id=meId(),e=empById(id);if(!e)return;
  if(!confirm(t('Bỏ mốc đã khai và quay lại tính theo quỹ phép năm?')))return;
  delete e.alLeftBase;delete e.alLeftAt;delete e.alLeftBy;delete e.alLeftUpdAt;
  save();renderMyPanel();renderMe(true);toast(t('Đã bỏ mốc'));
}

/* ---- Tài khoản ---- */
function myPanelAcc(id){
  const e=empById(id),acc=S.accounts[id]||{};
  return `
  <h3 style="margin:4px 0 10px">🔑 Tài khoản của tôi</h3>
  <div class="acc-info">
    <div><span>Họ tên</span><b>${esc(e.name||'—')}</b></div>
    <div><span>Tên đăng nhập</span><b style="font-family:var(--mono)">${esc(loginKey(id))}</b></div>
    ${loginKey(id)!==id?`<div><span>Mã NV trên hồ sơ</span><b style="font-family:var(--mono)">${esc(id)}</b></div>`:''}
    <div><span>Vị trí</span><b>${esc(posLabel(posCode(e))||'—')}</b></div>
    <div><span>Nhóm</span><b>${esc(e.team||'—')}</b></div>
    <div><span>Mật khẩu</span><b>${usingDefaultPw(id)?'<span class="st pending">Đang dùng mặc định (= '+esc(loginKey(id))+')</span>':'<span class="st approved">Đã đổi</span>'}</b></div>
    ${acc.at?`<div><span>Cập nhật lần cuối</span><b>${fmtDateTime(acc.at)}</b></div>`:''}
  </div>
  ${usingDefaultPw(id)?`<div class="pv-alert warn sm">Mật khẩu của bạn đang bằng mã NV — ai biết mã cũng đăng nhập được. Nên đổi ngay.</div>`:''}
  <div class="ds-block"><h4>Đổi mật khẩu</h4>
    <div class="fg"><label class="fl">Mật khẩu hiện tại</label>
      <div class="pw-wrap"><input type="password" class="inp" id="mePwCur">
      <button type="button" class="pw-eye" onclick="togglePw('mePwCur',this)">👁</button></div></div>
    <div class="grid2">
      <div class="fg"><label class="fl">Mật khẩu mới (≥ 4 ký tự)</label><input type="password" class="inp" id="mePwNew"></div>
      <div class="fg"><label class="fl">Nhập lại mật khẩu mới</label><input type="password" class="inp" id="mePwNew2"
        onkeydown="if(event.key==='Enter')changeMyPass()"></div>
    </div>
    <button class="btn" style="width:100%" onclick="changeMyPass()">Đổi mật khẩu</button>
  </div>
  <button class="btn sec" style="width:100%" onclick="closeMyPanel();doLogout()">↪ Đăng xuất khỏi thiết bị này</button>`;
}
