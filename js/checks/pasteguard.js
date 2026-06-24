/* ============================================================
 * PASTEGUARD — pasteguard.js
 * ------------------------------------------------------------
 * Global xuất ra : window.PASTEGUARD
 * Phase tách     : P4 (checks) — module mới (v4.56)
 * Phụ thuộc      : không (self-contained, tự tạo modal + style)
 * Khởi tạo (boot): không cần init — chỉ gọi runtime khi user paste
 * ------------------------------------------------------------
 * MÔ TẢ: Chống paste nhầm tab.
 *  (A) detectKind/check — quét dữ liệu TSV, phân biệt WMS GI / WMS ST / SAP
 *      dựa trên đặc trưng cột riêng của từng bảng. Nếu dữ liệu rõ ràng thuộc
 *      MỘT tab khác với tab hiện tại ⇒ CHẶN + cảnh báo (showBlock).
 *  (B) confirmFirst — buộc user xác nhận thêm 1 lần khi paste vào các tab
 *      hiếm khi nạp tay (TL Data / Cust / Price / Fleet) để nhìn kỹ đúng tab.
 *
 * ĐẶC TRƯNG CỘT (cơ sở phân biệt — xem docs/PROGRESS.md mục 11):
 *   SAP (ZMMFR022): cột C (idx2) = MÃ VẬT TƯ 8 số trần "20008511"/"20008512",
 *                   cột E (idx4) = SLoc 1100/2100/2101/B100.
 *   WMS ST        : có ô product dạng "[20008511]{2ea, 139623.0kg}" (8 số + 'kg'
 *                   trong CÙNG ô); job-id ở cột A; from/to là SLoc.
 *   WMS GI        : cột B (idx1) = Delivery ID (số ≥6 chữ số HOẶC tiền tố chữ
 *                   như KNH26061101); KHÔNG có mã vật tư 8 số.
 * ------------------------------------------------------------
 * API: PASTEGUARD.detectKind(tsvRows) → {kind, votes, total}
 *      PASTEGUARD.check(tsvRows, expectedKind) → {block, detected, expected, votes}
 *      PASTEGUARD.guard(tsvRows, expectedKind) → true nếu OK (không chặn); false + hiện modal nếu chặn
 *      PASTEGUARD.confirmFirst(label, key, cb) → true nếu đã xác nhận; false (hiện modal) nếu chưa
 * ============================================================ */

window.PASTEGUARD = (function(){
  'use strict';

  var MAT  = { '20008511':1, '20008512':1 };           /* SAP material codes */
  var SLOC = { '1100':1, '2100':1, '2101':1, 'B100':1 };/* storage locations  */
  var LABEL = { wg:'WMS GI', ws:'WMS ST', sap:'SAP' };

  /* ---- normalize: trim cells, drop fully-empty rows, cap scan to 500 ---- */
  function _clean(rows){
    var out = [];
    var src = rows || [];
    for(var i=0; i<src.length && out.length<500; i++){
      var r = src[i] || [];
      var c = [];
      var any = false;
      for(var j=0;j<r.length;j++){ var v = String(r[j]==null?'':r[j]).trim(); c.push(v); if(v) any=true; }
      if(any) out.push(c);
    }
    return out;
  }
  function _isDeliv(s){ return /^\d{6,}$/.test(s) || /^[A-Za-z]{2,4}\d{6,}$/.test(s); }
  function _isJobLike(s){ return /^[A-Za-z]{2,}-?\d{3,}/.test(s); }   /* SIT-2606220006, LO123… */

  /* Vote each row to exactly one kind (priority + early-out → no double count). */
  function detectKind(rows){
    var data = _clean(rows);
    var votes = { sap:0, ws:0, wg:0 };
    var total = 0;
    for(var i=0;i<data.length;i++){
      var c = data[i];
      /* 1) SAP — col C is a BARE 8-digit material code */
      if(MAT[(c[2]||'').replace(/[^\d]/g,'')] && /^\d{8}$/.test((c[2]||'').trim())){ votes.sap++; total++; continue; }
      /* 2) WMS ST — any cell holds an 8-digit code AND 'kg' together (product str) */
      var prodCell = false;
      for(var j=0;j<c.length;j++){ if(/\d{8}/.test(c[j]) && /kg/i.test(c[j])){ prodCell = true; break; } }
      if(prodCell){ votes.ws++; total++; continue; }
      /* 3) WMS GI — Delivery ID in col B (and not matched above) */
      if(_isDeliv((c[1]||'').replace(/,/g,''))){ votes.wg++; total++; continue; }
      /* 4) weaker WMS ST — job-id in col A + from/to are storage locations */
      if(_isJobLike(c[0]||'') && (SLOC[(c[3]||'').trim()] || SLOC[(c[4]||'').trim()])){ votes.ws++; total++; continue; }
    }
    var kind = '', best = 0;
    ['sap','ws','wg'].forEach(function(k){ if(votes[k]>best){ best=votes[k]; kind=k; } });
    return { kind:(best>0?kind:''), votes:votes, total:total };
  }

  /* Decide whether `rows` clearly belong to a DIFFERENT tab than `expected`.
     Conservative: only block when the current tab gets ZERO votes but another
     known tab gets a clear majority (≥2 rows and ≥60%). Otherwise let the
     tab's own parser handle it (avoids false blocks on sparse/mixed pastes). */
  function check(rows, expected){
    var d = detectKind(rows);
    var ev = d.votes[expected] || 0;
    var other = '', ov = 0;
    ['sap','ws','wg'].forEach(function(k){ if(k!==expected && d.votes[k]>ov){ ov=d.votes[k]; other=k; } });
    if(ev===0 && ov>=2 && (ov/Math.max(1,d.total))>=0.6){
      return { block:true, detected:other, expected:expected, votes:d.votes };
    }
    return { block:false, detected:(ev>0?expected:other), votes:d.votes };
  }
  /* Convenience: returns true if OK to proceed; false + shows block modal if not. */
  function guard(rows, expected){
    var r = check(rows, expected);
    if(r.block){ showBlock(r); return false; }
    return true;
  }

  /* ============ shared modal infrastructure (self-contained) ============ */
  function _ensureStyle(){
    if(document.getElementById('pgStyle')) return;
    var s = document.createElement('style'); s.id='pgStyle';
    s.textContent =
      '.pg-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;z-index:99999;font-family:inherit}'
     +'.pg-ov.on{display:flex}'
     +'.pg-box{background:#fff;max-width:440px;width:calc(100% - 40px);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;animation:pgpop .12s ease-out}'
     +'@keyframes pgpop{from{transform:scale(.96);opacity:.4}to{transform:scale(1);opacity:1}}'
     +'.pg-hd{padding:16px 20px;font-size:16px;font-weight:800;color:#fff}'
     +'.pg-hd.block{background:#dc2626}.pg-hd.warn{background:#ea580c}'
     +'.pg-bd{padding:18px 20px;font-size:13.5px;line-height:1.55;color:#1f2937}'
     +'.pg-bd b{color:#0f172a}'
     +'.pg-ft{padding:12px 20px 18px;display:flex;gap:10px;justify-content:flex-end}'
     +'.pg-btn{padding:9px 16px;border-radius:8px;border:1px solid #d1d5db;background:#f3f4f6;font-size:13px;font-weight:700;cursor:pointer;color:#374151}'
     +'.pg-btn:hover{background:#e5e7eb}'
     +'.pg-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.pg-btn.primary:hover{background:#1d4ed8}'
     +'.pg-btn.danger{background:#dc2626;border-color:#dc2626;color:#fff}.pg-btn.danger:hover{background:#b91c1c}';
    document.head.appendChild(s);
  }
  function _ensureOverlay(){
    _ensureStyle();
    var ov = document.getElementById('pgOverlay');
    if(ov) return ov;
    ov = document.createElement('div'); ov.id='pgOverlay'; ov.className='pg-ov';
    ov.innerHTML = '<div class="pg-box"><div class="pg-hd" id="pgHd"></div><div class="pg-bd" id="pgBd"></div><div class="pg-ft" id="pgFt"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) _close(); });
    return ov;
  }
  function _close(){ var ov=document.getElementById('pgOverlay'); if(ov) ov.classList.remove('on'); }
  function _esc(s){ return String(s==null?'':s).replace(/[&<>]/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]; }); }

  /* ----- (A) block modal ----- */
  function showBlock(info){
    var ov = _ensureOverlay();
    var det = LABEL[info.detected] || info.detected || '?';
    var exp = LABEL[info.expected] || info.expected || '?';
    document.getElementById('pgHd').className = 'pg-hd block';
    document.getElementById('pgHd').textContent = '⛔ Chặn paste sai tab';
    document.getElementById('pgBd').innerHTML =
      'Dữ liệu bạn vừa dán giống cấu trúc của tab <b>'+_esc(det)+'</b>, '
     +'nhưng bạn đang ở tab <b>'+_esc(exp)+'</b>.<br><br>'
     +'Đã <b>chặn</b> để tránh nhập nhầm dữ liệu. Vui lòng kiểm tra lại bạn đang dán đúng tab, '
     +'hoặc mở đúng tab <b>'+_esc(det)+'</b> rồi dán lại.';
    var ft = document.getElementById('pgFt');
    ft.innerHTML = '<button class="pg-btn danger" id="pgOk">Đã hiểu</button>';
    document.getElementById('pgOk').onclick = _close;
    ov.classList.add('on');
    try{ if(typeof toast==='function') toast('⛔ Paste bị chặn: dữ liệu giống tab '+det+', không phải '+exp,'er'); }catch(_){}
  }

  /* ----- (B) one-shot confirm gate ----- */
  var _ok = {};
  function confirmFirst(label, key, cb){
    if(_ok[key]){ _ok[key] = false; return true; }   /* already confirmed → let it through once */
    var ov = _ensureOverlay();
    document.getElementById('pgHd').className = 'pg-hd warn';
    document.getElementById('pgHd').textContent = '⚠ Xác nhận paste vào ' + label;
    document.getElementById('pgBd').innerHTML =
      'Bạn đang chuẩn bị dán dữ liệu vào tab <b>'+_esc(label)+'</b>.<br><br>'
     +'Tab này thường chỉ nạp dữ liệu <b>lần đầu</b> để chạy phần mềm — dữ liệu hằng ngày '
     +'hầu hết do phần mềm tự tạo. Hãy nhìn kỹ thêm một lần nữa: '
     +'bạn có chắc đang dán đúng vào tab <b>'+_esc(label)+'</b> không?';
    var ft = document.getElementById('pgFt');
    ft.innerHTML = '<button class="pg-btn" id="pgCancel">Huỷ</button>'
                 + '<button class="pg-btn primary" id="pgGo">Đúng, tiếp tục</button>';
    document.getElementById('pgCancel').onclick = _close;
    document.getElementById('pgGo').onclick = function(){ _ok[key] = true; _close(); try{ cb && cb(); }catch(e){ console.warn('[PASTEGUARD] cb', e); } };
    ov.classList.add('on');
    return false;
  }

  document.addEventListener('keydown', function(e){ if(e.key==='Escape') _close(); });

  return { detectKind:detectKind, check:check, guard:guard, showBlock:showBlock, confirmFirst:confirmFirst, LABEL:LABEL };
})();
