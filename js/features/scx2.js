/* ============================================================
 * SCX2  —  scx2.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 28614–28824   (~211 dòng)
 * Global xuất ra : window.SCX2
 * Phase tách     : P5A
 * Phụ thuộc      : sync, scale
 * Khởi tạo (boot): SCX2.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Mở rộng cân (SCX2).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   SCX2.init()
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module SCX2 từ dòng 28614 đến 28824.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.SCX2).
 *   3) node --check scx2.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5A]: dán thân module SCX2 (V4-54 dòng 28614–28824) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 28614–28750 ===== */
const SCX2 = (function(){
  let _on = false;

  function _q(sel){ return document.querySelector(sel); }
  function _cell(innerId){
    const el = document.getElementById(innerId);
    return el ? el.closest('.sc-r4-cell') : null;
  }

  /* per-tank extras: opening-stock mini-row + INV action buttons */
  function _buildTankExtras(){
    [[1,'2100','3501'],[2,'2101','3502']].forEach(([n, sloc, tk])=>{
      const main = _q('#scTk'+n+'Card .sc-tkc-main');
      if(!main || document.getElementById('scx2Tkx'+n)) return;
      const box = document.createElement('div');
      box.className = 'scx2-tkx';
      box.id = 'scx2Tkx'+n;
      const stop = 'event.stopPropagation();';
      box.innerHTML =
        '<div class="scx2-tkx-open" id="scx2Open'+n+'"></div>'
      + '<div class="scx2-tkx-acts">'
      +   '<button onclick="'+stop+'INV.view(\''+sloc+'\');INV.openInit()"    title="Opening stock">📥</button>'
      +   '<button onclick="'+stop+'INV.view(\''+sloc+'\');INV.openWt()"      title="%wt C3 update">📐</button>'
      +   '<button onclick="'+stop+'INV.view(\''+sloc+'\');INV.openCavern()"  title="Cavern receive / return">⇄</button>'
      +   '<button onclick="'+stop+'INV.view(\''+sloc+'\');INV.openXfer()"    title="Inter-tank transfer">⇆</button>'
      +   '<button onclick="'+stop+'INV.view(\''+sloc+'\');INV.openHistory()" title="Stock history">📜</button>'
      +   '<button onclick="'+stop+'INV.view(\''+sloc+'\');INV.openExport()"  title="Export C3/C4 split">📤</button>'
      +   '<button onclick="'+stop+'TKV.open(\''+tk+'\')"                     title="Outgoing orders (TL viewer)">🛢</button>'
      + '</div>';
      main.appendChild(box);
    });
  }

  /* fill the opening-stock mini-rows from INV (RAM only) */
  function renderTankExtras(){
    if(!_on) return;
    if(typeof INV === 'undefined' || !INV.stockFor) return;
    [['2100',1],['2101',2]].forEach(([sloc, n])=>{
      const el = document.getElementById('scx2Open'+n);
      if(!el) return;
      let c = null;
      try{ c = INV.stockFor(sloc); }catch(_){}
      if(!c || !c.hasInit){
        el.innerHTML = '<span class="e">no opening stock</span>';
        return;
      }
      const f = v => Math.round(v||0).toLocaleString('en-US');
      el.innerHTML =
        '<span class="k">OPEN</span><b>'+f((c.c3Init||0)+(c.c4Init||0))+'</b>'
      + '<span class="k">C3</span><b>'+f(c.c3Init)+'</b>'
      + '<span class="k">C4</span><b>'+f(c.c4Init)+'</b>'
      + '<span class="k">%C3</span><b>'+(isFinite(c.wtC3) ? c.wtC3 : '—')+'</b>';
    });
  }

  function init(){
    try{
      const root   = document.getElementById('scx2Root');
      const pane   = document.getElementById('sub-scale');
      const tanks  = document.getElementById('scx2Tanks');
      const gridH  = document.getElementById('scx2GridHold');
      const infoH  = document.getElementById('scx2InfoRow');
      const dockH  = document.getElementById('scx2DockHold');
      const staffH = document.getElementById('scx2StaffHold');
      const iconH  = document.getElementById('scx2IconHold');
      const rptPop = document.getElementById('scx2RptPop');
      if(!root || !pane || !tanks || !gridH || !infoH || !dockH || !staffH || !iconH || !rptPop) return;

      /* anchors (all must exist before we touch anything) */
      const tkSplit  = _q('#scRow1 .sc-tk-split');
      const planCell = _q('#scRow1 .sc-r1-plan-merged');
      const rptCell  = _q('#scRow1 .sc-r1-rpt-cell');
      const staffRow = _q('#scRow1 .sc-staff-rowa');
      const engBtn   = document.getElementById('scNotifEngBtn');
      const saleBtn  = document.getElementById('scNotifSaleBtn');
      const ctrlGrid = document.getElementById('scCtrlGrid');
      const dock     = document.getElementById('scShortcutBar');
      const queueCell= _cell('scQueue');
      const certCell = _cell('scCertList');
      const certInp  = document.getElementById('scCertSearchInp');
      const certRes  = document.getElementById('scCertResults');
      const row1 = document.getElementById('scRow1');
      const row4 = document.getElementById('scRow4');
      if(!tkSplit || !planCell || !rptCell || !staffRow || !engBtn || !saleBtn ||
         !ctrlGrid || !dock || !queueCell || !certCell || !certInp || !certRes ||
         !row1 || !row4){
        console.warn('[SCX2] anchor missing — console layout skipped');
        return;
      }

      /* ── top strip ── */
      staffH.appendChild(staffRow);
      iconH.insertBefore(engBtn, iconH.firstChild);
      iconH.insertBefore(saleBtn, iconH.firstChild);
      iconH.appendChild(document.getElementById('scx2RptBtn'));
      rptPop.appendChild(rptCell);

      /* ── left: tank cards (+ per-tank INV extras) ── */
      tanks.appendChild(tkSplit);
      _buildTankExtras();

      /* ── yard: bays · info row · dock ── */
      gridH.appendChild(ctrlGrid);
      /* CERT CHECK merge: search input into the EXPIRED CERTS header,
         results as an absolute overlay inside the same card. */
      const certHdr = certCell.querySelector('.sc-r4-hdr');
      if(certHdr){
        const tog = certHdr.querySelector('.fc-mode-toggle');
        certInp.classList.add('scx2-certinp');
        certHdr.insertBefore(certInp, tog || null);
      }
      certRes.classList.add('scx2-certres');
      certCell.classList.add('scx2-certcell');
      certCell.appendChild(certRes);
      infoH.appendChild(planCell);
      infoH.appendChild(queueCell);
      infoH.appendChild(certCell);
      dockH.appendChild(dock);

      row1.style.display = 'none';   /* emptied shells (XFER + CERT CHECK     */
      row4.style.display = 'none';   /* leftovers stay hidden inside row 4)   */
      pane.classList.add('scx2-on');
      _on = true;
      renderTankExtras();
      console.log('[SCX2] Operations Console v2.1 layout active');
    }catch(e){
      console.warn('[SCX2] init failed — legacy layout kept', e);
    }
  }

  function toggleRpt(){
    const p = document.getElementById('scx2RptPop');
    if(p) p.classList.toggle('on');
  }

  return { init, renderTankExtras, toggleRpt };
})();
