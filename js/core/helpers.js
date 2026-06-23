/* ============================================================
 * (globals)  —  helpers.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 8803–8878   (~76 dòng)
 * Global xuất ra : window.(globals)
 * Phase tách     : P2
 * Phụ thuộc      : —
 * Khởi tạo (boot): (thuần, hoisted – không init)
 * ------------------------------------------------------------
 * MÔ TẢ: Hàm thuần toàn cục: isTempOid (8808), multi-DO (_mdNormDO/isMultiDO/splitDOs/dosOverlap/doMatch 8825–8856), cùng các tiện ích rải rác: isoToday/isoLabel/parseDate, escapeHtml, toast, cavToggle (8782).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   isTempOid(), isMultiDO(), splitDOs(), dosOverlap(), doMatch(), escapeHtml(), toast(), isoToday()...
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module (globals) từ dòng 8803 đến 8878.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.(globals)).
 *   3) node --check helpers.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P2]: dán thân module (globals) (V4-54 dòng 8803–8878) vào đây. */

/* Recognise a temporary-DO identifier (the _oid / DO column value for an order
   that has no real DO yet). Accepts BOTH:
     • legacy  : TMP-YYYYMMDD-NNN   (pre-existing data in Firebase)
     • new     : ABC + YYMMDD + seq (3-letter customer prefix, e.g. KNH26060201)
   A real DO is 7+ pure digits, which never matches either branch. */
function isTempOid(v){
  v = String(v||'').trim().toUpperCase();        // case-insensitive: hand-typed temp DOs may be lower/mixed case
  if(!v) return false;
  if(/^TMP-\d{8}-\d{3}$/.test(v)) return true;   // legacy
  return /^[A-Z]{3}\d{7,}$/.test(v);             // new: 3 letters + yymmdd(6) + seq(1+)
}

/* ============================================================
   MULTI-DO HELPERS — ported from V406 (p12.x multi-DO port)
   A "multi-DO" load = one truck (plate) carrying several DOs in a
   single visit. V406 represents the merged order as ONE plan/station
   row whose doNum holds space-separated real DOs, plus:
     _multiDO:true  and  _linkedRows:[{doNum,customer,qty,type,note}…]
   These helpers are PURE and GLOBAL (function-declaration hoisted).
   Self-contained — no dependency on the module-scoped normDO().
   ============================================================ */
/* internal: normalise a single DO token (strip spaces/commas + leading zeros) */
function _mdNormDO(d){ return String(d==null?'':d).replace(/[,\s]/g,'').replace(/^0+/,'').trim(); }

/* true when a DO string contains 2+ real (7-digit) DOs, e.g. "86511943 86511919" */
function isMultiDO(doStr){
  return String(doStr==null?'':doStr).trim().split(/\s+/)
    .filter(function(d){ return /^\d{7,}$/.test(d); }).length > 1;
}

/* split a combined DO string (space / slash / comma separated) into an array
   of normalised real DOs. Non-DO tokens (temp / "after loading") are dropped. */
function splitDOs(doStr){
  return String(doStr==null?'':doStr).trim().split(/[\s\/,]+/)
    .map(_mdNormDO).filter(function(d){ return /^\d{7,}$/.test(d); });
}

/* do two DO strings share at least one DO? */
function dosOverlap(a, b){
  var sa = {}; splitDOs(a).forEach(function(d){ sa[d] = 1; });
  return splitDOs(b).some(function(d){ return sa[d]; });
}

/* exact match (single DO) or overlap (multi-DO) */
function doMatch(a, b){
  var sa = _mdNormDO(a), sb = _mdNormDO(b);
  if(!sa || !sb) return false;
  if(sa === sb) return true;
  return dosOverlap(a, b);
}

/* normalise a raw DO cell → space-separated real DOs. If no real DO is found
   (temp DO like ABC2606031 / "after loading" / empty) the value is kept as-is. */
function cleanDO(raw){
  if(!raw) return '';
  var s = String(raw).replace(/[\n\r,;\/\\]+/g,' ').trim().replace(/\s+/g,' ');
  var dos = s.match(/\b\d{7,}\b/g);
  if(!dos || !dos.length) return s.trim();
  return dos.map(function(d){ return d.replace(/^0+/,'') || d; }).join(' ');
}

/* product type label for a merged multi-DO row: unique derived types joined
   with " + " (e.g. "C3 + C4"). Uses V4's existing _pfDeriveType. */
function deriveProductTypeMulti(linkedRows){
  if(!linkedRows || linkedRows.length <= 1) return '';
  var dt = (typeof _pfDeriveType === 'function') ? _pfDeriveType : function(t){ return t || ''; };
  var types = linkedRows.map(function(r){ return dt(r.type || ''); }).filter(Boolean);
  var uniq = []; types.forEach(function(t){ if(uniq.indexOf(t) < 0) uniq.push(t); });
  if(!uniq.length) return '';
  return uniq.length === 1 ? uniq[0] : uniq.join(' + ');
}


/* ============================================================
   SUB-TAB DEFINITIONS  (unchanged — # is hard key)
   ============================================================ */
