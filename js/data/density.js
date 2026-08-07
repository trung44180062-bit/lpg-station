/* ============================================================
 * DENS  —  density.js                                   (v4.85)
 * ------------------------------------------------------------
 * Global xuất ra : window.DENS
 * Phụ thuộc      : firebase (tuỳ chọn), toast/logAudit (tuỳ chọn)
 * Khởi tạo (boot): DENS.init()
 * ------------------------------------------------------------
 * BẢNG TRA KHỐI LƯỢNG RIÊNG C3 / C4 LỎNG (trạng thái BÃO HOÀ)
 *
 * NGUỒN GỐC
 *   File "LPG Stock (Cavern Process)_R8.xlsx" — sheet "C3 Property"
 *   và "C4 Property" (2 → 32 °C), do bộ phận vận hành cung cấp.
 *
 * ĐỐI CHIẾU (đã kiểm chứng bằng CoolProp / phương trình trạng thái
 * Helmholtz — cùng nguồn dữ liệu với NIST REFPROP):
 *
 *   • C3 — cột density khớp PROPANE TINH KHIẾT trong 0.05 %
 *     trên toàn dải 2–32 °C  ⇒ bảng ĐÚNG, giữ nguyên.
 *     ⚠ Dòng 9 °C trong file gốc bị COPY TRÙNG dòng 8 °C
 *       (6.312 / 517.5). Giá trị đúng: 6.494 / 516.1  → ĐÃ VÁ.
 *
 *   • C4 — cột density THẤP HƠN n-butan tinh khiết ~1.0–1.3 %.
 *     Đây KHÔNG phải lỗi: khớp gần như tuyệt đối với hỗn hợp
 *     butan thương phẩm 70 % n-C4 + 30 % i-C4 (mol):
 *        2 °C  592.4 (bảng 592.5) · 20 °C 572.0 (571.9)
 *       27 °C  563.8 (563.5)      · 32 °C 557.6 (557.4)
 *     ⇒ bảng phản ánh ĐÚNG dòng C4 thực tế của nhà máy → GIỮ NGUYÊN,
 *       TUYỆT ĐỐI KHÔNG thay bằng số n-butan tinh khiết.
 *
 *   • Cột áp suất là ÁP SUẤT HƠI BÃO HOÀ (kg/cm² TUYỆT ĐỐI) ứng với
 *     đúng nhiệt độ cùng dòng — KHÔNG phải trục tra thứ hai.
 *     Vì vậy DENS tra density THEO NHIỆT ĐỘ, còn áp suất chỉ dùng để
 *     ĐỐI CHIẾU chéo (xem crossCheck): nếu áp kế và nhiệt kế lệch
 *     nhau quá ngưỡng thì cảnh báo thiết bị đo, không tự ý sửa số.
 *
 *   • Dải bảng gốc 2–32 °C được NỚI ra −5…50 °C bằng chính mô hình
 *     vật lý ở trên, hiệu chỉnh khớp trơn tại biên. Giá trị nằm
 *     ngoài 2–32 °C luôn kèm cờ .ext = true để UI tô cảnh báo.
 *
 * SỬA DỮ LIỆU
 *   Bảng lưu trên Firebase /eng_density_table, mọi máy dùng chung.
 *   Chỉ sửa được qua modal (nút 🌡 BẢNG DENSITY ở tab Tank Mix) và
 *   bắt buộc gõ xác nhận — xem DENS.saveEdit().
 * ============================================================ */

const DENS = (function(){
  'use strict';

  const FB_PATH = 'eng_density_table';
  const LS_KEY  = 'lpg_v4_dens_table_v1';

  /* Áp suất khí quyển tiêu chuẩn — đổi kg/cm²G ↔ kg/cm²A */
  const PATM = 1.0332;
  /* Ngưỡng cảnh báo lệch nhiệt độ suy ra từ áp suất so với nhiệt kế */
  const DT_WARN = 2.0;   // °C — nhắc nhở
  const DT_BAD  = 4.0;   // °C — sai lệch nặng, nghi hỏng thiết bị đo

  /* Dải dữ liệu GỐC từ file Excel (ngoài dải này là ngoại suy) */
  const SRC_LO = 2, SRC_HI = 32;

  /* [ nhiệt độ °C , áp suất hơi bão hoà kg/cm²A , density kg/m³ ] */
  const SEED_C3 = [
    [-5,4.271,535.2],[-4,4.409,533.9],[-3,4.549,532.5],[-2,4.693,531.2],
    [-1,4.840,529.9],[0,4.991,528.5],[1,5.145,527.2],[2,5.303,525.8],
    [3,5.462,524.4],[4,5.625,523.1],[5,5.791,521.7],[6,5.961,520.3],
    [7,6.135,518.9],[8,6.312,517.5],[9,6.494,516.1],[10,6.679,514.6],
    [11,6.868,513.2],[12,7.061,511.7],[13,7.258,510.3],[14,7.459,508.8],
    [15,7.664,507.3],[16,7.874,505.9],[17,8.087,504.4],[18,8.305,502.9],
    [19,8.527,501.4],[20,8.754,499.9],[21,8.985,498.3],[22,9.221,496.8],
    [23,9.461,495.3],[24,9.705,493.7],[25,9.955,492.1],[26,10.209,490.6],
    [27,10.467,489.0],[28,10.731,487.4],[29,10.999,485.8],[30,11.273,484.1],
    [31,11.553,482.5],[32,11.833,480.9],[33,12.123,479.2],[34,12.418,477.6],
    [35,12.719,475.9],[36,13.024,474.2],[37,13.335,472.5],[38,13.652,470.7],
    [39,13.974,469.0],[40,14.301,467.2],[41,14.634,465.5],[42,14.973,463.7],
    [43,15.317,461.9],[44,15.667,460.0],[45,16.023,458.2],[46,16.385,456.3],
    [47,16.753,454.4],[48,17.127,452.5],[49,17.506,450.6],[50,17.892,448.7]
  ];
  const SEED_C4 = [
    [-5,1.034,600.1],[-4,1.074,599.0],[-3,1.115,598.0],[-2,1.158,596.9],
    [-1,1.202,595.8],[0,1.247,594.7],[1,1.294,593.6],[2,1.342,592.5],
    [3,1.390,591.4],[4,1.440,590.3],[5,1.492,589.2],[6,1.545,588.0],
    [7,1.599,586.9],[8,1.655,585.8],[9,1.712,584.6],[10,1.771,583.5],
    [11,1.832,582.4],[12,1.894,581.2],[13,1.957,580.1],[14,2.023,578.9],
    [15,2.089,577.7],[16,2.158,576.6],[17,2.228,575.4],[18,2.300,574.2],
    [19,2.374,573.1],[20,2.450,571.9],[21,2.527,570.7],[22,2.607,569.5],
    [23,2.688,568.3],[24,2.771,567.1],[25,2.856,565.9],[26,2.943,564.7],
    [27,3.033,563.5],[28,3.124,562.3],[29,3.217,561.1],[30,3.312,559.9],
    [31,3.410,558.7],[32,3.510,557.4],[33,3.612,556.2],[34,3.717,555.0],
    [35,3.823,553.7],[36,3.932,552.5],[37,4.044,551.3],[38,4.157,550.0],
    [39,4.274,548.8],[40,4.392,547.5],[41,4.513,546.2],[42,4.636,545.0],
    [43,4.762,543.7],[44,4.890,542.4],[45,5.021,541.1],[46,5.155,539.8],
    [47,5.291,538.6],[48,5.430,537.2],[49,5.572,535.9],[50,5.716,534.6]
  ];

  /* Bảng đang dùng — luôn sắp xếp tăng dần theo nhiệt độ */
  let TBL = { c3: SEED_C3.map(r=>r.slice()), c4: SEED_C4.map(r=>r.slice()) };
  let META = { by:'', ts:0, src:'seed' };
  let _fbRef = null, _attached = false;

  /* ---------- tiện ích ---------- */
  function _num(v){
    const x = parseFloat(String(v==null?'':v).replace(/,/g,'').trim());
    return isNaN(x) ? null : x;
  }
  function _say(msg, type){ try{ if(typeof toast==='function') toast(msg, type); }catch(_){} }
  function _esc(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _who(){
    try{
      const u = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER : null;
      const s = u ? (u.name || u.email || u.uid || '') : '';
      return String(s).split('@')[0].slice(0,24);
    }catch(_){ return ''; }
  }
  function _key(f){
    const s = String(f||'').toLowerCase();
    return (s.indexOf('4') >= 0 || s.indexOf('but') >= 0) ? 'c4' : 'c3';
  }
  function _sortClean(rows){
    const seen = Object.create(null), out = [];
    (rows||[]).forEach(r=>{
      if(!Array.isArray(r)) return;
      const t = _num(r[0]), p = _num(r[1]), d = _num(r[2]);
      if(t === null || d === null || d <= 0) return;
      const k = t.toFixed(3);
      if(seen[k]) return;                 // trùng nhiệt độ → giữ dòng đầu
      seen[k] = 1;
      out.push([t, p === null ? 0 : p, d]);
    });
    out.sort((a,b)=> a[0] - b[0]);
    return out;
  }

  /* ---------- TRA CỨU ----------
     lookup('c3', 11.5) → { rho, rhoT, pSat, ext, lo, hi }
       rho  : kg/m³      rhoT : ton/m³ (= kg/L)
       pSat : kg/cm² TUYỆT ĐỐI ứng với nhiệt độ đó
       ext  : true nếu phải NGOẠI SUY (nằm ngoài dải bảng) */
  function lookup(fluid, temp){
    const rows = TBL[_key(fluid)] || [];
    const t = _num(temp);
    if(t === null || !rows.length) return null;
    const n = rows.length;
    let i = -1;
    for(let k = 0; k < n - 1; k++){
      if(t >= rows[k][0] && t <= rows[k+1][0]){ i = k; break; }
    }
    let a, b, ext = false;
    if(i >= 0){ a = rows[i]; b = rows[i+1]; }
    else if(t < rows[0][0]){ a = rows[0]; b = rows[Math.min(1, n-1)]; ext = true; }
    else { a = rows[Math.max(0, n-2)]; b = rows[n-1]; ext = true; }
    const span = (b[0] - a[0]) || 1;
    const f = (t - a[0]) / span;
    const rho  = a[2] + (b[2] - a[2]) * f;
    const pSat = a[1] + (b[1] - a[1]) * f;
    /* ngoài dải DỮ LIỆU GỐC của file Excel cũng đánh dấu để UI nhắc */
    const outSrc = (t < SRC_LO || t > SRC_HI);
    /* ⚠ rhoT PHẢI giữ đủ số lẻ. Bản v4.85 làm tròn kg/m³ về số nguyên rồi
       mới chia 1000 (512.45 → 0.512) — mất 0.45 kg/m³, nhân với ~271 m³ là
       hụt 0.12 tấn mỗi mẻ và làm dòng diễn giải hiện sai so với bảng tra. */
    return {
      rho:  Math.round(rho * 100) / 100,
      rhoT: Math.round(rho * 100) / 100000,      // ton/m³, giữ tới 0.01 kg/m³
      pSat: Math.round(pSat * 1000) / 1000,
      ext: ext, outSrc: outSrc,
      lo: a[0], hi: b[0]
    };
  }

  /* Tra NGƯỢC: từ áp suất hơi (kg/cm² TUYỆT ĐỐI) suy ra nhiệt độ bão hoà */
  function tempFromPressure(fluid, pAbs){
    const rows = TBL[_key(fluid)] || [];
    const p = _num(pAbs);
    if(p === null || rows.length < 2) return null;
    const n = rows.length;
    for(let k = 0; k < n - 1; k++){
      const p0 = rows[k][1], p1 = rows[k+1][1];
      if(p1 <= p0) continue;
      if(p >= p0 && p <= p1){
        const f = (p - p0) / (p1 - p0);
        return { temp: Math.round((rows[k][0] + (rows[k+1][0] - rows[k][0]) * f) * 100) / 100, ext:false };
      }
    }
    /* ngoài dải → ngoại suy tuyến tính từ 2 dòng gần biên nhất */
    const a = (p < rows[0][1]) ? rows[0] : rows[n-2];
    const b = (p < rows[0][1]) ? rows[1] : rows[n-1];
    if(b[1] === a[1]) return null;
    const f = (p - a[1]) / (b[1] - a[1]);
    return { temp: Math.round((a[0] + (b[0] - a[0]) * f) * 100) / 100, ext:true };
  }

  /* ---------- ĐỐI CHIẾU NHIỆT ĐỘ ↔ ÁP SUẤT ----------
     temp    : °C đọc từ nhiệt kế
     pGauge  : kg/cm²G đọc từ áp kế (áp suất DƯ). Bỏ trống → bỏ qua đối chiếu.
     Trả về  : { ...lookup, pMeas, impliedT, dT, level, msg }
       level : 'none' | 'ok' | 'warn' | 'bad' */
  function crossCheck(fluid, temp, pGauge){
    const base = lookup(fluid, temp);
    if(!base) return null;
    const pg = _num(pGauge);
    const out = Object.assign({}, base, { pMeas:null, impliedT:null, dT:null, level:'none', msg:'' });
    const fl = _key(fluid).toUpperCase();
    if(base.ext){
      out.level = 'bad';
      out.msg = '⛔ ' + fl + ' ' + _num(temp) + '°C is OUTSIDE the table (' +
        TBL[_key(fluid)][0][0] + '…' + TBL[_key(fluid)][TBL[_key(fluid)].length-1][0] +
        '°C) — the value is EXTRAPOLATED, check the thermometer.';
      return out;
    }
    if(base.outSrc){
      out.level = 'warn';
      out.msg = '⚠ ' + fl + ' ' + _num(temp) + '°C is outside the source data range ' +
        SRC_LO + '–' + SRC_HI + '°C (calibrated extension in use).';
    }
    if(pg === null || pg === 0) return out;
    out.pMeas = Math.round((pg + PATM) * 1000) / 1000;
    const inv = tempFromPressure(fluid, out.pMeas);
    if(!inv) return out;
    out.impliedT = inv.temp;
    out.dT = Math.round((inv.temp - _num(temp)) * 100) / 100;
    const ad = Math.abs(out.dT);
    if(ad >= DT_BAD){
      out.level = 'bad';
      out.msg = '⛔ ' + fl + ': gauge ' + pg + ' kg/cm²G corresponds to ' + inv.temp +
        '°C but the thermometer reads ' + _num(temp) + '°C — off by ' + out.dT +
        '°C. Suspect a faulty instrument; CHECK before using this result.';
    } else if(ad >= DT_WARN){
      if(out.level !== 'bad'){
        out.level = 'warn';
        out.msg = '⚠ ' + fl + ': pressure implies ' + inv.temp +
          '°C, off by ' + out.dT + '°C from the thermometer. Density is still looked up by temperature.';
      }
    } else if(out.level === 'none'){
      out.level = 'ok';
      out.msg = '✓ ' + fl + ': pressure matches temperature (off by ' + out.dT + '°C).';
    }
    return out;
  }

  /* ---------- LƯU / ĐỌC ---------- */
  function _applyTable(obj, src){
    if(!obj) return false;
    const c3 = _sortClean(obj.c3), c4 = _sortClean(obj.c4);
    if(c3.length < 2 || c4.length < 2) return false;
    TBL = { c3: c3, c4: c4 };
    META = { by: String(obj._by||''), ts: parseInt(obj._ts)||0, src: src||'fb' };
    return true;
  }
  function _cacheLocal(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify({ c3:TBL.c3, c4:TBL.c4, _by:META.by, _ts:META.ts })); }catch(_){}
  }
  function _loadLocal(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw) return _applyTable(JSON.parse(raw), 'cache');
    }catch(_){}
    return false;
  }

  function init(){
    _loadLocal();
    if(_attached) return;
    try{
      if(typeof firebase === 'undefined' || !firebase.database){
        console.warn('[DENS] firebase not ready — using built-in table'); return;
      }
      _fbRef = firebase.database().ref(FB_PATH);
      _fbRef.on('value', snap=>{
        const v = snap.val();
        if(v && _applyTable(v, 'fb')){ _cacheLocal(); }
        else { META.src = 'seed'; }
        if(_isOpen()) renderEditor();
        try{ if(window.MC && MC.densRefresh) MC.densRefresh(); }catch(_){}
      }, e=>{
        if(typeof fbErr === 'function') fbErr(e, 'Tải bảng density');
        else console.warn('[DENS] listener', e);
      });
      _attached = true;
      console.log('[DENS] ✅ Init OK · path /' + FB_PATH);
    }catch(e){ console.warn('[DENS] init', e); }
  }

  /* ================= MODAL XEM / SỬA ================= */
  let DRAFT = null;          // bản nháp đang sửa {c3:[],c4:[]}
  let _tab = 'c3';
  let _dirty = false;

  function _isOpen(){
    const el = document.getElementById('dens-backdrop');
    return !!(el && el.classList.contains('on'));
  }
  function open(){
    DRAFT = { c3: TBL.c3.map(r=>r.slice()), c4: TBL.c4.map(r=>r.slice()) };
    _dirty = false; _tab = 'c3';
    const bg = document.getElementById('dens-backdrop');
    if(!bg){ _say('❌ The density-table dialog is missing from the page','er'); return; }
    bg.classList.add('on');
    renderEditor();
  }
  function close(){
    if(_dirty && !window.confirm('The density table has UNSAVED changes.\n\nOK = close and discard · Cancel = stay')) return;
    DRAFT = null; _dirty = false;
    document.getElementById('dens-backdrop')?.classList.remove('on');
  }
  function tab(k){ _tab = (k === 'c4') ? 'c4' : 'c3'; renderEditor(); }

  function renderEditor(){
    const host = document.getElementById('dens-body');
    if(!host) return;
    if(!DRAFT) DRAFT = { c3: TBL.c3.map(r=>r.slice()), c4: TBL.c4.map(r=>r.slice()) };
    const rows = DRAFT[_tab] || [];
    /* nút tab */
    ['c3','c4'].forEach(k=>{
      const b = document.getElementById('dens-tab-'+k);
      if(b) b.className = 'dens-tab' + (_tab === k ? ' on' : '');
    });
    const unit = _tab === 'c3' ? 'PROPANE (C3)' : 'COMMERCIAL BUTANE (C4)';
    let html =
      '<div class="dens-note">' +
        '<b>' + unit + '</b> — SATURATED LIQUID. Density is looked up by <b>TEMPERATURE</b>; ' +
        'the pressure column is the <b>absolute</b> saturated vapour pressure at that same temperature, ' +
        'used only to cross-check the gauge — never to look up density.' +
        '<br>Source data range from the operations file: <b>' + SRC_LO + '–' + SRC_HI + '°C</b>. ' +
        'Rows outside it are the calibrated extension (amber background).' +
      '</div>' +
      '<div class="dens-tblwrap"><table class="dens-tbl"><thead><tr>' +
        '<th style="width:34px"></th><th style="width:78px">Temp °C</th>' +
        '<th style="width:110px">Vapour pressure<br><span>kg/cm² (abs)</span></th>' +
        '<th style="width:110px">Density<br><span>kg/m³</span></th>' +
        '<th style="width:92px">ton/m³</th><th></th>' +
      '</tr></thead><tbody>';
    rows.forEach((r, i)=>{
      const ext = (r[0] < SRC_LO || r[0] > SRC_HI);
      html +=
        '<tr class="' + (ext ? 'dens-ext' : '') + '">' +
          '<td class="dens-del" title="Delete row" onclick="DENS.delRow(' + i + ')">✕</td>' +
          '<td><input class="dens-inp" value="' + _esc(r[0]) + '" data-i="' + i + '" data-f="0" oninput="DENS.edit(this)"></td>' +
          '<td><input class="dens-inp" value="' + _esc(r[1]) + '" data-i="' + i + '" data-f="1" oninput="DENS.edit(this)"></td>' +
          '<td><input class="dens-inp dens-inp-d" value="' + _esc(r[2]) + '" data-i="' + i + '" data-f="2" oninput="DENS.edit(this)"></td>' +
          '<td class="dens-ro">' + (r[2] / 1000).toFixed(4) + '</td>' +
          '<td class="dens-ro dens-src">' + (ext ? 'extension' : 'source file') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    host.innerHTML = html;
    const info = document.getElementById('dens-meta');
    if(info){
      const when = META.ts ? new Date(META.ts).toLocaleString('vi-VN') : '—';
      info.innerHTML = 'Source: <b>' +
        (META.src === 'fb' ? 'Firebase (shared)' : META.src === 'cache' ? 'local cache' : 'built-in defaults') +
        '</b> · last edited: ' + _esc(META.by || '—') + ' · ' + when +
        ' · <b>' + rows.length + '</b> rows' + (_dirty ? ' · <span class="dens-dirty">UNSAVED CHANGES</span>' : '');
    }
  }

  function edit(el){
    if(!DRAFT) return;
    const i = parseInt(el.dataset.i), f = parseInt(el.dataset.f);
    const rows = DRAFT[_tab];
    if(!rows || !rows[i]) return;
    const v = _num(el.value);
    rows[i][f] = (v === null) ? el.value : v;
    _dirty = true;
    const info = document.getElementById('dens-meta');
    if(info && info.innerHTML.indexOf('UNSAVED') < 0) renderEditor0Meta();
  }
  function renderEditor0Meta(){
    const info = document.getElementById('dens-meta');
    if(info) info.innerHTML += ' · <span class="dens-dirty">UNSAVED CHANGES</span>';
  }
  function addRow(){
    if(!DRAFT) return;
    const rows = DRAFT[_tab];
    const last = rows.length ? rows[rows.length-1] : [20, 0, 500];
    rows.push([_num(last[0]) + 1, _num(last[1]) || 0, _num(last[2]) || 0]);
    _dirty = true;
    renderEditor();
  }
  function delRow(i){
    if(!DRAFT) return;
    const rows = DRAFT[_tab];
    if(!rows || !rows[i]) return;
    if(!window.confirm('Delete the ' + rows[i][0] + '°C row from the ' + _tab.toUpperCase() + ' table?')) return;
    rows.splice(i, 1);
    _dirty = true;
    renderEditor();
  }
  function resetDraft(){
    if(!window.confirm('Reset the ' + _tab.toUpperCase() + ' table to the BUILT-IN DEFAULTS?\n\n(cross-checked against NIST/CoolProp — the 9°C row is corrected, range −5…50°C)')) return;
    DRAFT[_tab] = (_tab === 'c3' ? SEED_C3 : SEED_C4).map(r=>r.slice());
    _dirty = true;
    renderEditor();
  }

  /* Kiểm tra tính hợp lệ trước khi cho lưu */
  function _validate(rows, name){
    const errs = [], warns = [];
    const clean = _sortClean(rows);
    if(clean.length < 2){ errs.push(name + ': needs at least 2 valid rows'); return { errs, warns, clean }; }
    if(clean.length !== rows.length) warns.push(name + ': dropped ' + (rows.length - clean.length) + ' blank / duplicate-temperature rows');
    for(let i = 0; i < clean.length; i++){
      const d = clean[i][2];
      if(d < 300 || d > 800) errs.push(name + ' ' + clean[i][0] + '°C: density ' + d + ' kg/m³ is outside the plausible 300–800 range');
      if(i > 0){
        if(clean[i][2] >= clean[i-1][2])
          warns.push(name + ' ' + clean[i][0] + '°C: density does NOT fall as temperature rises — physically wrong, re-check');
        if(clean[i][1] && clean[i-1][1] && clean[i][1] <= clean[i-1][1])
          warns.push(name + ' ' + clean[i][0] + '°C: vapour pressure does not rise with temperature');
      }
    }
    return { errs, warns, clean };
  }

  /* LƯU — cảnh báo + bắt gõ xác nhận */
  function saveEdit(){
    if(!DRAFT){ close(); return; }
    if(typeof canWrite === 'function' && !canWrite('eng_tkmix')){
      _say('No permission to edit the density table','er'); return;
    }
    const v3 = _validate(DRAFT.c3, 'C3'), v4 = _validate(DRAFT.c4, 'C4');
    const errs = v3.errs.concat(v4.errs), warns = v3.warns.concat(v4.warns);
    if(errs.length){
      window.alert('❌ CANNOT SAVE — invalid data:\n\n' + errs.slice(0,12).map(s=>'• '+s).join('\n') +
        (errs.length > 12 ? '\n… and ' + (errs.length-12) + ' more' : ''));
      return;
    }
    /* đếm số ô thực sự đổi so với bảng đang chạy */
    let changed = 0;
    ['c3','c4'].forEach(k=>{
      const nw = (k === 'c3' ? v3.clean : v4.clean), od = TBL[k] || [];
      const map = Object.create(null);
      od.forEach(r=> map[r[0].toFixed(3)] = r);
      nw.forEach(r=>{
        const o = map[r[0].toFixed(3)];
        if(!o || o[1] !== r[1] || o[2] !== r[2]) changed++;
      });
      if(od.length !== nw.length) changed += Math.abs(od.length - nw.length);
    });
    if(!changed){ _say('Nothing to save','warn'); return; }

    const w = warns.length ? '\n\n⚠ WARNINGS:\n' + warns.slice(0,8).map(s=>'• '+s).join('\n') : '';
    if(!window.confirm(
      '⚠⚠ CHANGING THE C3/C4 DENSITY TABLE ⚠⚠\n\n' +
      'This table decides the C3/C4 MASS filled into the tank for EVERY batch calculated\n' +
      'with the density-table method. An error here flows straight into custody-transfer\n' +
      'and inventory figures.\n\n' +
      '• Cells / rows changed: ' + changed + '\n' +
      '• C3: ' + v3.clean.length + ' rows · C4: ' + v4.clean.length + ' rows\n' +
      '• Applies IMMEDIATELY on EVERY workstation\n' +
      '• Batches already saved are NOT recalculated — only future calculations change' + w + '\n\n' +
      'Are you sure you want to overwrite the shared table?'
    )) return;

    const phrase = 'CONFIRM';
    const typed = window.prompt(
      'Final confirmation.\n\nType exactly:  ' + phrase + '\n(then press OK to write the density table to Firebase)', '');
    if(String(typed||'').trim().toUpperCase() !== phrase){
      _say('Cancelled — the confirmation text did not match','warn'); return;
    }

    const payload = { c3: v3.clean, c4: v4.clean, _by: _who(), _ts: Date.now() };
    const done = ()=>{
      _applyTable(payload, 'fb'); _cacheLocal();
      _dirty = false; DRAFT = null;
      document.getElementById('dens-backdrop')?.classList.remove('on');
      _say('💾 Density table saved (' + changed + ' changes) — now live on every workstation','ok');
      try{ if(window.MC && MC.densRefresh) MC.densRefresh(); }catch(_){}
      try{ logAudit('eng:density_table:save', 'dens', 'table', '', String(changed)+' cells', 'sửa bảng density C3/C4'); }catch(_){}
    };
    if(!_fbRef){ done(); return; }
    _fbRef.set(payload)
      .then(done)
      .catch(e=>{
        if(typeof fbErr === 'function') fbErr(e, 'Lưu bảng density');
        _say('❌ Firebase write failed — the table was NOT saved','er');
      });
  }

  return {
    init, open, close, tab, addRow, delRow, edit, resetDraft, saveEdit,
    lookup, tempFromPressure, crossCheck,
    renderEditor,
    get PATM(){ return PATM; },
    get TABLE(){ return { c3: TBL.c3.map(r=>r.slice()), c4: TBL.c4.map(r=>r.slice()) }; },
    get META(){ return Object.assign({}, META); },
    get SEED(){ return { c3: SEED_C3.map(r=>r.slice()), c4: SEED_C4.map(r=>r.slice()) }; },
    get RANGE(){ return { lo: SRC_LO, hi: SRC_HI }; }
  };
})();
window.DENS = DENS;
