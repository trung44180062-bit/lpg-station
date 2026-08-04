/* ============================================================
   THONG KE (quan ly) + KHAI BAO GIO + EXPORT XLSX + CAI DAT
   LPGT Cavern — Quan ly Cong Ca v4
   ============================================================ */
/* =================== TAB THỐNG KÊ (quản lý) =================== */
/* stShift()/renderStats() đã chuyển sang js/15-report.js (tab Báo cáo).
   statRows() giữ lại ở đây vì cả tab Báo cáo lẫn Xuất Excel đều dùng. */
function statRows(ym,grp){
  const days=daysOfPeriod(ym);
  let emps=schedEmps();
  if(grp&&grp!=='__all')emps=emps.filter(e=>(e.team||'')===grp);
  return emps.map(e=>({e,s:calcStats(e.id,days)}));
}
function exportStats(){
  const ym=(typeof repYm!=='undefined'&&repYm)||curSchedMonth();
  if(!ym){toast(t('Chưa có kỳ nào'));return;}
  const p=periodFor(ym);
  const rows=statRows(ym,(typeof repGroup!=='undefined')?repGroup:'__all');
  /* Ca kép cộng vào đúng cột ca chuẩn của nó (O+N → cột Ca O, D+N → cột Ca D) */
  const cD=s=>cntShift(s.cnt,'D'),cN=s=>cntShift(s.cnt,'N'),cO=s=>cntShift(s.cnt,'O');
  const aoa=[['LPGT CAVERN — THỐNG KÊ CÔNG CA',p.label],[],
    ['Nhóm','Mã NV','Họ tên','Vị trí','Ca D','Ca N','Ca O','R','AL8','AL4','NP','OFF','Ca OT','Giờ công','Giờ OT','Giờ phép']];
  rows.forEach(({e,s})=>{
    aoa.push([e.team||'',e.id,e.name||'',posLabel(posCode(e)),cD(s),cN(s),cO(s),s.cnt.R||0,s.cnt.AL8||0,s.cnt.AL4||0,s.cnt.NP||0,s.cnt.OFF||0,otShifts(s),rnd1(s.hWork),rnd1(s.hOT),rnd1(s.hLeave)]);
  });
  aoa.push([]);
  aoa.push(['TỔNG','','','',
    rows.reduce((a,r)=>a+cD(r.s),0),rows.reduce((a,r)=>a+cN(r.s),0),rows.reduce((a,r)=>a+cO(r.s),0),
    rows.reduce((a,r)=>a+(r.s.cnt.R||0),0),rows.reduce((a,r)=>a+(r.s.cnt.AL8||0),0),rows.reduce((a,r)=>a+(r.s.cnt.AL4||0),0),
    rows.reduce((a,r)=>a+(r.s.cnt.NP||0),0),rows.reduce((a,r)=>a+(r.s.cnt.OFF||0),0),rows.reduce((a,r)=>a+otShifts(r.s),0),
    rnd1(rows.reduce((a,r)=>a+r.s.hWork,0)),rnd1(rows.reduce((a,r)=>a+r.s.hOT,0)),rnd1(rows.reduce((a,r)=>a+r.s.hLeave,0))]);
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:7},{wch:11},{wch:22},{wch:16}].concat(Array(12).fill({wch:8}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'ThongKe');
  XLSX.writeFile(wb,`LPGT_ThongKe_${ym}.xlsx`);
}

/* =================== KHAI BÁO GIỜ + TÀI KHOẢN (tab Dữ liệu) =================== */
function renderHoursTbl(){
  const tb=$('hoursTbl');if(!tb)return;
  const catName={work:'Ca làm việc',rest:'Nghỉ ca',leave:'Nghỉ phép',ot:'Tăng ca',swap:'Đổi ca',combo:'Ca kép',other:'Khác'};
  let h='<thead><tr><th>Mã</th><th>Diễn giải</th><th>Loại</th><th>Giờ/ngày</th><th></th></tr></thead><tbody>';
  allCodes().forEach(c=>{
    const cust=(S.settings.customCodes||[]).some(x=>x.c===c.c);
    h+=`<tr><td>${chip(c.c)}</td><td>${esc(c.l)}</td><td><span class="grp-tag">${catName[c.cat]||c.cat}</span></td>
      <td><input type="number" class="inp sm" style="width:72px" step="0.5" min="0" value="${getHours(c.c)}" onchange="setHour('${c.c}',this.value)"></td>
      <td>${cust?`<button class="btn warn sm" onclick="delCustomCode('${c.c}')">✕</button>`:''}</td></tr>`;
  });
  tb.innerHTML=h+'</tbody>';
}
function setHour(c,v){
  S.settings.hours=S.settings.hours||{};
  S.settings.hours[c]=+v||0;
  save();toast('Đã lưu: '+c+' = '+(+v||0)+'h/ngày');
}
function addCustomCode(){
  const c=(prompt(t('Mã ca mới (viết tắt, VD: XT, H8):'))||'').trim().toUpperCase();
  if(!c)return;
  if(allCodes().some(x=>x.c===c)){toast('Mã "'+c+'" đã tồn tại');return;}
  const l=(prompt(t('Diễn giải (VD: Tăng ca xuất tàu):'))||c).trim();
  let cat=(prompt(t('Loại — nhập 1 trong: work (ca làm việc) / ot (tăng ca) / leave (nghỉ phép) / rest (nghỉ ca):'),'ot')||'ot').trim().toLowerCase();
  if(!['work','ot','leave','rest','swap'].includes(cat))cat='other';
  const hrs=+(prompt(t('Số giờ / ngày:'),'12')||0)||0;
  const col={work:'var(--cD)',ot:'var(--cOT)',leave:'var(--cAL)',rest:'var(--cR)',swap:'var(--cSW)'}[cat]||'#64748B';
  S.settings.customCodes=S.settings.customCodes||[];
  S.settings.customCodes.push({c,l,col,cat});
  S.settings.hours=S.settings.hours||{};S.settings.hours[c]=hrs;
  save();renderHoursTbl();toast('Đã thêm mã '+c+' ('+hrs+'h)');
}
function delCustomCode(c){
  if(!confirm(t('Xóa mã "')+c+t('"? (các ô lịch đang dùng mã này vẫn giữ nguyên chữ)')))return;
  S.settings.customCodes=(S.settings.customCodes||[]).filter(x=>x.c!==c);
  save();renderHoursTbl();
}
/* ============================================================
   BẢNG TÀI KHOẢN — nơi DUY NHẤT quản lý người dùng
   Gồm: mã NV · họ tên · nhóm · vị trí · KIỂU CA · QUYỀN · mật khẩu.
   Cột Quyền đã chuyển hẳn về đây (trước nằm lẫn trong tab Nhóm & Lịch),
   để chỗ tạo lịch chỉ lo việc xếp ca.
   Chỉ QUẢN TRỊ mới sửa được; quản trị gốc thì không ai hạ quyền được.
   ============================================================ */
function renderAccTbl(){
  const tb=$('accTbl');if(!tb)return;
  if(!adm){
    tb.innerHTML='<tbody><tr><td class="muted" style="padding:12px">Cần quyền quản trị để xem và sửa tài khoản.</td></tr></tbody>';
    return;
  }
  const sel=(v,cur)=>v===cur?' selected':'';
  let h=`<thead><tr>
    <th>Mã NV</th><th>Họ tên</th><th>Nhóm</th><th>Vị trí</th>
    <th>Kiểu ca</th><th>Quyền</th><th>Mật khẩu</th><th></th></tr></thead><tbody>`;
  activeEmps().forEach(e=>{
    const acc=(S.accounts&&S.accounts[e.id])||{};
    const root=isRootAdmin(e.id), perm=permOf(e.id);
    const dflt=usingDefaultPw(e.id);
    h+=`<tr>
      <td><input class="inp sm" style="width:110px;font-family:var(--mono)" value="${esc(e.id)}" onchange="changeId('${e.id}',this.value)"></td>
      <td><input class="inp sm" style="min-width:150px" value="${esc(e.name||'')}" placeholder="Họ tên" onchange="updEmp('${e.id}','name',this.value)"></td>
      <td><input class="inp sm" style="width:70px" value="${esc(e.team||'')}" placeholder="A" onchange="updEmp('${e.id}','team',this.value,true)"></td>
      <td>${posSelectHtml(e,'min-width:150px')}</td>
      <td><select class="inp sm" style="min-width:150px" onchange="updType('${e.id}',this.value)">
        <option value="type1"${sel('type1',e.shiftType)}>Ca 8 ngày (OODDNNRR)</option>
        <option value="type2"${sel('type2',e.shiftType)}>Ca 6 ngày (DDNNRR)</option>
        <option value="admin"${sel('admin',e.shiftType)}>Hành chính T2–T6</option>
        <option value="office6"${sel('office6',e.shiftType)}>Hành chính T2–T7 (học việc)</option>
        <option value="none"${sel('none',e.shiftType)}>Không xếp lịch</option>
      </select></td>
      <td>${root
        ?'<span class="st approved" title="Quản trị gốc — không thể hạ quyền">Quản trị gốc</span>'
        :`<select class="inp sm" style="min-width:130px" onchange="updPerm('${e.id}',this.value)" title="${esc(PERM_HINT[perm]||'')}">
            ${PERM_VALUES.map(v=>`<option value="${v}"${sel(v,perm)}>${esc(PERM_LABEL[v])}</option>`).join('')}
          </select>`}</td>
      <td>${dflt?'<span class="st pending" title="Mật khẩu đang là mã số — nhắc nhân viên đổi">Mặc định</span>'
                :'<span class="st approved" title="'+esc(acc.at?fmtDateTime(acc.at):'')+'">Đã đặt riêng</span>'}</td>
      <td class="emp-act">
        <button class="btn sec sm ico" onclick="setPass('${e.id}')" title="${t('Đặt lại mật khẩu')}">🔑</button>
        ${dflt?'':`<button class="btn sec sm ico" onclick="resetToDefaultPw('${e.id}')" title="${t('Đưa về mật khẩu = mã số')}">↺</button>`}
        ${root?'':`<button class="btn warn sm ico" onclick="delEmp('${e.id}')" title="${t('Xoá khỏi danh sách')}">✕</button>`}
      </td></tr>`;
  });
  tb.innerHTML=h+'</tbody>';
}
/* Đổi quyền — chỉ quản trị, không hạ được quản trị gốc */
function updPerm(id,v){
  if(!adm){toast(t('Cần quyền quản trị'));renderAccTbl();return;}
  if(isRootAdmin(id)){renderAccTbl();return;}
  const e=empById(id);if(!e)return;
  e.perm=PERM_VALUES.includes(v)?v:'staff';
  save();
  if(id===meId()){applyPerm();applyRoleUI();refreshBadge();}
  renderAccTbl();
  toast(t('Đã đặt quyền')+' '+(PERM_LABEL[e.perm]||e.perm)+' '+t('cho')+' '+(e.name||id));
}
/* Đặt mật khẩu mới cho một người (băm PBKDF2, không lưu chữ gốc) */
async function setPass(id){
  if(!adm){toast(t('Cần quyền quản trị'));return;}
  const e=empById(id);
  const pw=prompt(t('Mật khẩu mới cho')+' '+(e&&e.name?e.name:id)+' '+t('(tối thiểu 6 ký tự):'));
  if(pw===null)return;
  const bad=pwProblem(id,pw);
  if(bad){toast(t(bad));return;}
  S.accounts=S.accounts||{};
  S.accounts[id]=Object.assign(await makePwRecord(id,pw.trim()),{at:Date.now(),by:meId()||'admin',init:false});
  save();renderAccTbl();
  toast(t('Đã đặt mật khẩu cho')+' '+(e&&e.name?e.name:id)+' ✔');
}
/* Đưa về mật khẩu mặc định = mã số (dùng khi nhân viên quên mật khẩu) */
function resetToDefaultPw(id){
  if(!adm){toast(t('Cần quyền quản trị'));return;}
  const e=empById(id);
  if(!confirm(t('Đưa mật khẩu của')+' '+(e&&e.name?e.name:id)+' '+t('về mặc định (= mã số)?')))return;
  S.accounts=S.accounts||{};
  S.accounts[id]={init:true,by:meId()||'admin',at:Date.now()};
  save();renderAccTbl();
  toast(t('Mật khẩu đã về mặc định')+' = '+loginKey(id));
}
/* Thêm người mới ngay trong bảng tài khoản */
function addAccountRow(){
  if(!adm){toast(t('Cần quyền quản trị'));return;}
  const id=prompt(t('Mã nhân viên mới (ví dụ vc44260099):'),newVc());
  if(!id)return;
  const nid=id.trim();
  if(empById(nid)){toast(t('Mã đã tồn tại'));return;}
  const name=(prompt(t('Họ tên:'))||'').trim();
  S.employees.push({id:nid,name,pos:'',role:'oper',team:'',empType:'shift',shiftType:'type1',
                    a1:'',a2:'',order:S.employees.length+1,active:true,perm:'staff'});
  ensureAccount(nid,true);
  save();renderAccTbl();if(typeof renderSetup==='function')renderSetup();
  toast(t('Đã thêm')+' '+(name||nid));
}
function delPass(id){resetToDefaultPw(id);}

/* =================== EXPORT XLSX =================== */
function exportXlsx(){
  const ym=$('expMonth').value;if(!ym){toast('Chưa có kỳ nào');return;}
  const what=$('expWhat').value;
  const p=periodFor(ym);
  const days=daysOfPeriod(ym);
  const aoa=[];
  aoa.push(['LPGT CAVERN — WORKING SCHEDULE','','','','',what==='eff'?'CA THỰC TẾ':'BẢNG CHUẨN',p.label]);
  aoa.push([]);
  const h1=['No.','Nhóm','Vai trò','Mã NV','Full Name','Position'];
  days.forEach(iso=>h1.push(+iso.slice(8)));
  aoa.push(h1);
  const h2=['','','','','',''];days.forEach(iso=>h2.push(dowOf(iso)));
  aoa.push(h2);
  activeEmps().forEach((e,i)=>{
    const role=e.role==='eng'?'Kỹ sư':e.role==='oper'?'Operator':'';
    const row=[i+1,e.team||'',role,e.id,e.name,posLabel(posCode(e))];
    days.forEach(iso=>{const c=what==='eff'?eff(e.id,iso).code:(S.base[e.id]&&S.base[e.id][iso]||'');row.push(c);});
    aoa.push(row);
  });
  aoa.push([]);
  const tD=['','','','','Σ Ca ngày (D)',''];const tN=['','','','','Σ Ca đêm (N)',''];const tO=['','','','','Σ Văn phòng (O)',''];
  days.forEach(iso=>{
    let cD=0,cN=0,cO=0;
    activeEmps().forEach(e=>{const c=workCodeOf(what==='eff'?eff(e.id,iso).code:(S.base[e.id]&&S.base[e.id][iso]||''));
      if(c==='D'||c==='SD'||c==='OTD')cD++;else if(c==='N'||c==='SN'||c==='OTN')cN++;else if(c==='O'||c==='SO')cO++;});
    tD.push(cD);tN.push(cN);tO.push(cO);
  });
  aoa.push(tD,tN,tO);
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:4},{wch:8},{wch:9},{wch:12},{wch:22},{wch:14}].concat(days.map(()=>({wch:4.5})));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'T'+(+ym.slice(5)));
  XLSX.writeFile(wb,`LPGT_ShiftSchedule_${ym}_${what==='eff'?'thucte':'chuan'}.xlsx`);
}

/* =================== DỮ LIỆU / SETTINGS =================== */
function renderData(){
  fillMonthSelects();
  $('setMinD').value=S.settings.minD;$('setMinN').value=S.settings.minN;
  $('setMinD').onchange=()=>{S.settings.minD=+$('setMinD').value||0;save();};
  $('setMinN').onchange=()=>{S.settings.minN=+$('setMinN').value||0;save();};
  if($('setOtLimit')){
    $('setOtLimit').value=S.settings.otLimit||40;
    $('setOtLimit').onchange=()=>{S.settings.otLimit=+$('setOtLimit').value||40;save();
      if(typeof asRender==='function')asRender();};
  }
  /* Ngưỡng của trợ lý duyệt đơn (js/18-advice.js) */
  if($('setMinO')){
    $('setMinO').value=(S.settings.minO===''||S.settings.minO==null)?1:S.settings.minO;
    $('setMinO').onchange=()=>{S.settings.minO=+$('setMinO').value||0;save();};
  }
  if($('setMaxOffTeam')){
    $('setMaxOffTeam').value=(S.settings.maxOffTeam===''||S.settings.maxOffTeam==null)?1:S.settings.maxOffTeam;
    $('setMaxOffTeam').onchange=()=>{S.settings.maxOffTeam=+$('setMaxOffTeam').value||0;save();};
  }
  $('setDeptDefault').value=S.settings.deptDefault||DEPT_DEFAULT_FALLBACK;
  $('setApprover1').value=S.settings.approver1||'';
  $('setApprover2').value=S.settings.approver2||'';
  if($('setMailTo'))$('setMailTo').value=S.settings.reportEmailTo||'';
  if($('setMailCc'))$('setMailCc').value=S.settings.reportEmailCc||'';
  const cfg=localStorage.getItem(LS+'_fb');if(cfg&&!$('fbCfg').value)$('fbCfg').value=cfg;
  renderHoursTbl();renderAccTbl();
}
