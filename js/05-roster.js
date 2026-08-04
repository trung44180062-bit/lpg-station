/* ============================================================
   NHOM & DANH SACH NHAN SU (tab Nhom)
   LPGT Cavern — Quan ly Cong Ca v4
   ============================================================ */
/* =================== SETUP / ROSTER =================== */
function teamList(){
  const seen=[];activeEmps().forEach(e=>{const t=e.team||'';if(!seen.includes(t))seen.push(t);});
  return seen.sort((a,b)=>{if(a==='')return 1;if(b==='')return -1;return a.localeCompare(b,'vi',{numeric:true});});
}
function renderSetup(){
  if(!$('setFrom').value||!$('setTo').value){
    const p=periodFor(S.meta.schedFrom?schedMonthOf(S.meta.schedFrom):curSchedMonth());
    $('setFrom').value=S.meta.schedFrom||p.from;$('setTo').value=S.meta.schedTo||p.to;
  }
  fillPeriodSel();
  const teams=teamList();
  if(!activeEmps().length){
    $('setupBody').innerHTML='<div class="card"><p class="muted">Chưa có nhân sự. Bấm <b>＋ Thêm nhóm</b> để tạo nhóm gồm 2 kỹ sư + 2 operator, rồi sửa tên / mã số.</p></div>';
    return;
  }
  let h='';
  teams.forEach(tm=>{
    const mem=activeEmps().filter(e=>(e.team||'')===tm);
    const eng=mem.filter(e=>e.role==='eng').length,oper=mem.filter(e=>e.role==='oper').length;
    h+=`<div class="card"><h3>👥 Nhóm ${esc(tm||'(chưa phân nhóm)')}
      <span class="muted" style="font-weight:600">${eng} kỹ sư · ${oper} oper</span>
      <span style="flex:1"></span>
      <button class="btn sec sm" onclick="addMember('${esc(tm)}')">＋ Người</button>
      ${tm?`<button class="btn sec sm" onclick="renameGroup('${esc(tm)}')">✎ Tên nhóm</button>
        <button class="btn warn sm" onclick="delGroup('${esc(tm)}')">✕ Nhóm</button>`:''}</h3>
      <div style="overflow:auto"><table class="tbl setup"><thead><tr>
        <th>Vai trò</th><th>Vị trí</th><th>Mã NV</th><th>Họ tên</th><th>Kiểu ca</th><th>Ngày vào làm</th><th>Mốc 1</th><th>Mốc 2</th><th></th>
      </tr></thead><tbody>`;
    mem.forEach(e=>h+=memberRow(e));
    h+=`</tbody></table></div></div>`;
  });
  $('setupBody').innerHTML=h;
}
function memberRow(e){
  const isAdmin=e.empType==='admin'||e.shiftType==='admin';
  const dis=isAdmin?'disabled':'';
  const sel=(v,cur)=>v===cur?' selected':'';
  return `<tr>
   <td><select class="inp sm" onchange="updEmp('${e.id}','role',this.value,true)">
     <option value="eng"${sel('eng',e.role)}>Kỹ sư</option>
     <option value="oper"${sel('oper',e.role)}>Operator</option>
     <option value="other"${sel('other',e.role)}>Khác</option></select></td>
   <td>${posSelectHtml(e,'min-width:150px')}</td>
   <td><input class="inp sm" value="${esc(e.id)}" style="width:100px;font-family:var(--mono)" onchange="changeId('${e.id}',this.value)"></td>
   <td><input class="inp sm" value="${esc(e.name)}" style="min-width:140px" placeholder="Họ tên" onchange="updEmp('${e.id}','name',this.value)"></td>
   <td><select class="inp sm" onchange="updType('${e.id}',this.value)">
     <option value="type1"${sel('type1',e.shiftType)}>Ca 8 ngày (OODDNNRR)</option>
     <option value="type2"${sel('type2',e.shiftType)}>Ca 6 ngày (DDNNRR)</option>
     <option value="admin"${sel('admin',e.shiftType)}>Hành chính T2–T6</option>
     <option value="office6"${sel('office6',e.shiftType)}>Hành chính T2–T7 (học việc)</option>
     <option value="none"${sel('none',e.shiftType)}>Không xếp lịch</option></select></td>
   <td><input type="date" class="inp sm" value="${e.joinAt||''}" title="Nhân viên vào giữa kỳ: chỉ điền lịch từ ngày này trở đi" onchange="updEmp('${e.id}','joinAt',this.value)"></td>
   <td><input type="date" class="inp sm" value="${e.a1||''}" ${dis} title="Ngày đầu của cặp Office / ca đầu" onchange="updEmp('${e.id}','a1',this.value)"></td>
   <td><input type="date" class="inp sm" value="${e.a2||''}" ${dis} title="Cặp kế tiếp (để đo chu kỳ)" onchange="updEmp('${e.id}','a2',this.value)"></td>
   <td><button class="btn warn sm" onclick="delEmp('${e.id}')">✕</button></td>
  </tr>`;
}
function updEmp(id,f,v,rerender){
  const e=empById(id);if(!e)return;
  e[f]=(f==='name'||f==='pos'||f==='team')?v.trim():v;
  save();
  if(rerender){renderSetup();renderBoth();}
  if(typeof renderAccTbl==='function')renderAccTbl();
}
function updType(id,v){const e=empById(id);if(!e)return;e.shiftType=v;e.empType=(v==='admin')?'admin':'shift';save();renderSetup();}
function changeId(oldId,val){
  const e=empById(oldId);if(!e)return;
  const nid=(val||'').trim();
  if(!nid){toast('Mã không được trống');renderSetup();return;}
  if(nid===oldId)return;
  if(S.employees.some(x=>x.id===nid)){toast('Mã đã tồn tại');renderSetup();return;}
  if(S.base[oldId]){S.base[nid]=S.base[oldId];delete S.base[oldId];}
  if(S.over[oldId]){S.over[nid]=S.over[oldId];delete S.over[oldId];}
  // Đơn đã gửi vẫn phải trỏ đúng người sau khi đổi mã
  Object.values(S.requests||{}).forEach(r=>{
    if(r.empId===oldId)r.empId=nid;
    if(r.withId===oldId)r.withId=nid;
    if(r.guarantorId===oldId)r.guarantorId=nid;
  });
  // Tài khoản: hash gắn với mã NV nên phải cấp lại, mật khẩu = mã NV mới
  if(S.accounts&&S.accounts[oldId])delete S.accounts[oldId];
  e.id=nid;
  ensureAccount(nid,true);
  save();renderSetup();renderBoth();
  toast(isRealEmpId(nid)?('Đã đổi mã NV — đăng nhập '+loginKey(nid)+', mật khẩu = '+loginKey(nid)):'Đã đổi mã NV');
}
function addMember(team){
  S.employees.push({id:newVc(),name:'',pos:'',role:'oper',team:team||'',empType:'shift',shiftType:'type1',a1:'',a2:'',order:S.employees.length+1,active:true});
  save();renderSetup();
}
function addGroup(){
  const name=prompt(t('Tên nhóm (VD: A, B, C, D):'));if(!name)return;
  const tm=name.trim();
  const tpl=[['eng','Field Engineer'],['eng','DCS Boardman'],['oper','Operator'],['oper','Operator']];
  tpl.forEach(([role,pos])=>{
    S.employees.push({id:newVc(),name:'',pos,role,team:tm,empType:'shift',shiftType:'type1',a1:'',a2:'',order:S.employees.length+1,active:true});
  });
  save();renderSetup();toast('Đã tạo nhóm '+tm);
}
function renameGroup(team){
  const nn=prompt(t('Đổi tên nhóm:'),team);if(nn===null)return;
  const nt=nn.trim();S.employees.forEach(e=>{if((e.team||'')===team)e.team=nt;});
  save();renderSetup();renderBoth();
}
function delGroup(team){
  if(!confirm(t('Xóa nhóm "')+team+t('" và toàn bộ người trong nhóm?')))return;
  S.employees.filter(e=>(e.team||'')===team).forEach(e=>{delete S.base[e.id];delete S.over[e.id];});
  S.employees=S.employees.filter(e=>(e.team||'')!==team);
  save();renderSetup();renderBoth();toast('Đã xóa nhóm');
}
function delEmp(id){
  const e=empById(id);if(!e)return;
  if(!confirm(t('Xóa "')+(e.name||id)+t('" khỏi danh sách?')))return;
  S.employees=S.employees.filter(x=>x.id!==id);delete S.base[id];delete S.over[id];
  if(S.accounts)delete S.accounts[id];      // xoá luôn tài khoản đăng nhập
  save();renderSetup();renderBoth();
}
