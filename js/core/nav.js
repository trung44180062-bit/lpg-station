/* ============================================================
 * nav.js — App shell: version + điều hướng trang (CORE)
 * ------------------------------------------------------------
 * Nguồn V4-54: APP_VERSION (5729) + document.title (8715) +
 *   PAGES/navGo/navStub/rptSwitchTab/cavToggle (8716–8789).
 * Global: APP_VERSION, APP_BUILD_ID, PAGES, navGo, navStub,
 *         rptSwitchTab, cavToggle (gọi từ markup onclick).
 * Nạp: CORE, sau auth, trước data. (Lịch sử phiên bản → docs/VERSION-HISTORY.md)
 * ============================================================ */
const APP_VERSION='v4.55.4', APP_BUILD_ID='p31.5-plan-table-paste-order';


/* ---------- main nav (Fleet active; others stubs) ---------- */
const PAGES=[
  {id:'sales',label:'LPG SALES',ico:'📊'},{id:'report',label:'REPORTS',ico:'📋'},
  {id:'fleet',label:'FLEET CERTS',ico:'🚛'},{id:'print',label:'PRINT FORMS',ico:'🖨️'},
  {id:'engineer',label:'ENGINEER',ico:'🔧'},{id:'staff',label:'STAFF',ico:'👥'},
  {id:'fly',label:'FLY BOARD',ico:'🖥️'}
];
document.getElementById('navTabs').innerHTML=PAGES.map(p=>
  `<button class="nb ${p.id==='sales'?'on':''}" onclick="navGo('${p.id}')">
   <span class="ico">${p.ico}</span>${p.label}</button>`).join('');
/* Real navigation: fleet + sales + print + engineer + report + staff are wired, others are stubs */
function navGo(id){
  if(id==='fleet' || id==='sales' || id==='print' || id==='engineer' || id==='report' || id==='staff'){
    document.querySelectorAll('#navTabs .nb').forEach(b=>{
      b.classList.toggle('on', b.textContent.includes(PAGES.find(p=>p.id===id).label));
    });
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
    document.getElementById('page-'+id).classList.add('on');
    /* lazy-init plan tables the first time we visit Sales */
    if(id==='sales' && !TP.table){ TP.buildTable(); }
    if(id==='sales' && !TMR.table){ TMR.buildTable(); }
    /* render Scale if its subtab is active */
    if(id==='sales'){
      const activeTab = document.querySelector('#salesSubs .stab.on');
      if(activeTab && activeTab.dataset.sub==='scale') scRenderCtrl();
    }
    /* keep Fleet table reflowed when coming back */
    if(id==='fleet' && table){ setTimeout(()=>{ try{ table.redraw(true); }catch(_){ } }, 50); }
    /* render Engineer Tank Log when opening Engineer page */
    if(id==='engineer'){ try{ ENG.render(); }catch(_){} }
    /* default Report date on first visit to Report or Sales (Sales now hosts
       the compact Report shortcut card; RPT.init seeds both date inputs) */
    if(id==='report' || id==='sales'){ try{ RPT.init(); }catch(_){} }
    /* v4.28.1 — Row 1b relocator retired; .rpt-shell stays at #page-report
       and the Scale Row 1 shortcut mirrors state via RPT.updateUI /
       RPT.setDate / scRptSyncDate. window.move* are kept as no-op shims. */
    /* render Staff table when opening Staff page */
    if(id==='staff'){ try{ STAFF.render(); }catch(_){} }
  } else {
    toast('"'+PAGES.find(p=>p.id===id).label+'" comes in a later phase','er');
  }
}
/* legacy alias (old call sites) */
function navStub(id){ navGo(id); }

/* Report page sub-tab switcher: Daily Stock (rpt-shell) ↔ Cavern Daily/SAP-WMS */
function rptSwitchTab(sub){
  document.querySelectorAll('#rptSubs .stab').forEach(b=>{
    b.classList.toggle('on', b.dataset.rptSub === sub);
  });
  const shell = document.querySelector('#page-report .rpt-shell');
  const cav   = document.getElementById('rpt-pg-cavern');
  const mthr  = document.getElementById('rpt-pg-monthly');
  if(shell) shell.style.display = (sub==='daily') ? '' : 'none';
  if(cav)   cav.style.display   = (sub==='cavern') ? 'flex' : 'none';
  if(mthr)  mthr.style.display  = (sub==='monthly') ? 'flex' : 'none';
  if(sub==='cavern'){ try{ CAV.render(); }catch(_){} try{ CAV.showDefaults(); }catch(_){} }
  if(sub==='monthly'){ try{ MTHR.onTabEnter(); }catch(_){} }
}
window.rptSwitchTab = rptSwitchTab;

/* Collapse/expand a Cavern data area (input / export / table / log) */
function cavToggle(id, btn){
  const el=document.getElementById(id); if(!el) return;
  const hidden = getComputedStyle(el).display==='none';
  el.style.display = hidden ? '' : 'none';
  const car = btn && btn.querySelector('.cav-caret');
  if(car) car.textContent = hidden ? '▼' : '▶';
}
window.cavToggle = cavToggle;

/* ============================================================
   CURRENT USER — quản lý hoàn toàn trong js/core/auth.js.
   CURRENT_USER được nạp từ firebase.auth().currentUser + /users_whitelist
   (vai trò admin/editor/viewer). KHÔNG có chế độ dev / tài khoản mặc định.
   ============================================================ */
