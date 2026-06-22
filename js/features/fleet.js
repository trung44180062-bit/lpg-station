/* ============================================================
 * FBA  —  fleet.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 9364–9950   (~587 dòng)
 * Global xuất ra : window.FBA
 * Phase tách     : P5B
 * Phụ thuộc      : sync, fcheck, Tabulator
 * Khởi tạo (boot): FBA.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Trang FLEET CERTS (page-fleet): quản lý cert xe/tài xế bằng Tabulator. buildColumns() ~9578. CHÚ Ý: vùng này còn chứa MN (9510) → tách MN về config khi bóc.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   FBA.init(), FBA.buildColumns(), FBA.render()
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module FBA từ dòng 9364 đến 9950.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.FBA).
 *   3) node --check fleet.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5B]: dán thân module FBA (V4-54 dòng 9364–9950) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 9364–9462 ===== */
const FBA = (function(){
  const C = { r:0, w:0, rBytes:0, wBytes:0, byArea:{} };
  let flashTimer = null;
  let renderTimer = null;
  let lastActivityAt = 0;

  function _bump(kind, area, bytes){
    bytes = bytes || 0;
    C[kind]++;
    C[kind+'Bytes'] += bytes;
    if(!C.byArea[area]) C.byArea[area] = { r:0, w:0, rBytes:0, wBytes:0 };
    C.byArea[area][kind]++;
    C.byArea[area][kind+'Bytes'] += bytes;
    lastActivityAt = Date.now();
    _flash(kind);
    _scheduleRender();
  }

  function _flash(kind){
    const led = document.getElementById('fbLed');
    if(!led) return;
    const cls = kind === 'r' ? 'fb-led-read' : 'fb-led-write';
    led.classList.add(cls);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(()=>{
      led.classList.remove('fb-led-read','fb-led-write');
    }, 220);
  }

  function _scheduleRender(){
    /* coalesce burst updates into a single render every ~150 ms */
    if(renderTimer) return;
    renderTimer = setTimeout(()=>{
      renderTimer = null;
      _render();
    }, 150);
  }

  function _render(){
    const el = document.getElementById('fbCounts');
    if(el){
      el.textContent = `↓${C.r} ↑${C.w}`;
    }
    /* update tooltip with per-area breakdown */
    const wrap = document.getElementById('fbStatus');
    if(wrap){
      const lines = [
        'FIREBASE ACTIVITY (this session)',
        '─────────────────────────────────',
        `↓ Reads:  ${C.r}  (${_fmtBytes(C.rBytes)})`,
        `↑ Writes: ${C.w}  (${_fmtBytes(C.wBytes)})`,
        ''
      ];
      const areas = Object.keys(C.byArea).sort();
      if(areas.length){
        lines.push('By area:');
        areas.forEach(a => {
          const c = C.byArea[a];
          lines.push(`  ${a.padEnd(14)} ↓${String(c.r).padStart(3)} ↑${String(c.w).padStart(3)}   ${_fmtBytes(c.rBytes+c.wBytes)}`);
        });
      } else {
        lines.push('(no activity yet)');
      }
      lines.push('');
      lines.push('Console: FBA.stats() / FBA.reset()');
      wrap.title = lines.join('\n');
    }
  }

  function _fmtBytes(n){
    if(n < 1024) return n + ' B';
    if(n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
    return (n/1024/1024).toFixed(2) + ' MB';
  }

  return {
    /* Public API — instrumentation hooks called by each module */
    read:  function(area, payload){
      _bump('r', area || '_', payload ? (typeof payload === 'string' ? payload.length : JSON.stringify(payload).length) : 0);
    },
    write: function(area, payload){
      _bump('w', area || '_', payload ? (typeof payload === 'string' ? payload.length : JSON.stringify(payload).length) : 0);
    },
    stats: function(){
      console.table(C.byArea);
      console.log(`Total: ↓${C.r} reads (${_fmtBytes(C.rBytes)})  ↑${C.w} writes (${_fmtBytes(C.wBytes)})`);
      console.log(`Last activity: ${lastActivityAt ? Math.round((Date.now()-lastActivityAt)/1000)+'s ago' : 'never'}`);
      return JSON.parse(JSON.stringify(C));
    },
    reset: function(){
      C.r=0; C.w=0; C.rBytes=0; C.wBytes=0;
      Object.keys(C.byArea).forEach(k => delete C.byArea[k]);
      _render();
      console.log('[FBA] counters reset');
    },
    /* expose internal for debugging */
    _C: C
  };
})();
