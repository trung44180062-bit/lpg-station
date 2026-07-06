/* ============================================================
 * PTT_EARLY  —  ptt-early.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 20616–21469   (~854 dòng)
 * Global xuất ra : window.PTT_EARLY
 * Phase tách     : P5B
 * Phụ thuộc      : sync, plan
 * Khởi tạo (boot): PTT_EARLY.init() trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: Tích hợp dữ liệu PTT (early bind).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   PTT_EARLY.init()
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module PTT_EARLY từ dòng 20616 đến 21469.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.PTT_EARLY).
 *   3) node --check ptt-early.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5B]: dán thân module PTT_EARLY (V4-54 dòng 20616–21469) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 20616–21469 ===== */
var PTT_EARLY = (function(){
  var _candidates = [];          /* rows currently shown in the modal */
  var _selected   = {};          /* _oid -> true (checked) */
  var _printedOids = {};         /* _oid -> ts (RAM-only "already printed" mark) */
  var _built = false;
  /* v4.58 — the modal now serves TWO sources, set by open(mode):
       'early' = Tomorrow Plan, note contains "8" (arrive before 8AM) — original.
       'today' = Today Plan, effective status Pending or Entered, NO note filter. */
  var _mode = 'early';
  var _units     = [];           /* ordered render/print units (single rows + multi-DO truck groups) */
  var _groupMode = {};           /* groupKey -> 'combined' | 'separate' (RAM-only; default combined) */
  var MDO_CAP_MT = 27;           /* one truck cannot exceed this — same cap as the scale assign picker */

  /* PTT print CSS — kept self-contained (mirrors pfPrint('ptt') branch so
     the multi-page doc renders identically). Trailing page-break added. */
  var _CSS = ''
    + "@page{size:A5 portrait;margin:3mm;}*{margin:0;padding:0;box-sizing:border-box;}html,body{margin:0;padding:0;background:#fff;}"
    + ".pf-ptt-paper{width:100%;box-shadow:none;background:#fff;color:#000;font-family:'Barlow',sans-serif;font-size:9pt;}"
    + ".pf-ptt-paper+.pf-ptt-paper{page-break-before:always;}"
    + ".pf-ptt{padding:2mm;}.pf-ptt-hdr{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:4pt;border-bottom:2pt solid #000;}"
    + ".pf-ptt-titl{font-size:13pt;font-weight:900;text-align:right;line-height:1.1;}"
    + ".pf-ig{border:1.2pt solid #555;margin-top:5pt;display:grid;grid-template-columns:16mm 1fr 16mm 1fr;}"
    + ".pf-il{background:#e8e8e8;padding:2pt 4pt;font-size:8pt;font-weight:500;border-right:0.5pt solid #888;border-bottom:0.5pt solid #888;display:flex;align-items:center;line-height:1.2;color:#000;}"
    + ".pf-iv{padding:2pt 5pt;font-weight:700;font-size:9pt;display:flex;align-items:center;border-right:0.5pt solid #888;border-bottom:0.5pt solid #888;}"
    + ".pf-iv.norb{border-right:none;}.pf-iv.nobb{border-bottom:none;}.pf-il.nobb{border-bottom:none;}"
    + ".pf-il-qty{background:#e8e8e8;padding:2pt 4pt;font-size:8pt;font-weight:700;border-right:0.5pt solid #888;border-bottom:2pt solid #333;display:flex;align-items:center;color:#000;}"
    + ".pf-wt{width:100%;border-collapse:collapse;border:1.2pt solid #555;border-top:none;}"
    + ".pf-wt th{background:#d8d8d8;padding:2pt 3pt;font-size:8pt;font-weight:700;border:0.5pt solid #888;text-align:center;white-space:nowrap;}"
    + ".pf-wt td{border:0.5pt solid #aaa;}"
    + ".pw-lbl{background:#ebebeb;font-size:8.5pt;color:#000;width:16mm;padding:2pt 4pt;vertical-align:middle;white-space:nowrap;font-weight:600;}"
    + ".pw-wr{vertical-align:bottom;padding:0 3pt 2pt;font-size:8pt;color:#999;height:11mm;text-align:right;padding-right:3pt;}"
    + ".pw-wr.pw-sm{height:10mm;padding:0 3pt 1pt;font-size:7.5pt;}"
    + ".pf-note{border:0.5pt solid #aaa;border-top:none;padding:2pt 5pt;font-size:9pt;min-height:5mm;display:flex;align-items:flex-start;gap:3pt;}"
    + ".pf-nlbl{font-weight:800;color:#000;white-space:nowrap;font-size:9pt;}"
    + ".pf-nval{color:#000;font-weight:600;flex:1;font-size:9pt;}"
    + ".pf-date{text-align:right;font-size:9pt;padding:3pt 0 1pt;color:#000;font-weight:700;}"
    + ".pf-sigs{display:grid;grid-template-columns:1fr 1fr 1fr;border:0.5pt solid #aaa;border-bottom:none;margin-top:2pt;}"
    + ".pf-sc{text-align:center;border-right:0.5pt solid #aaa;padding:2pt 6pt 1pt;}.pf-sc:last-child{border-right:none;}"
    + ".pf-sttl{font-size:8pt;color:#333;line-height:1.3;}.pf-ssp{height:16mm;}"
    + ".pf-snm{font-size:9pt;font-weight:600;border-top:0.5pt solid #aaa;border-bottom:0.5pt solid #aaa;padding:1pt 0;}"
    + ".pf-sfoot{border:0.5pt solid #aaa;border-top:none;height:2mm;}";

  function _esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function _attr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

  /* Predicate: order asks to arrive before 8AM. V406 scans the note text for
     the digit "8" (sale writes "tới trước 8H" / "Arrive before 8AM").
     Only the note field is checked (DO/qty/customer never count). */
  function _isEarly8(note){ return String(note==null?'':note).indexOf('8') !== -1; }

  /* v4.58 — source plan module per mode: 'today' reads TP, 'early' reads TMR. */
  function _srcMod(){
    if(_mode==='today') return (typeof TP  !== 'undefined' && TP.PLAN)  ? TP  : null;
    return                     (typeof TMR !== 'undefined' && TMR.PLAN) ? TMR : null;
  }
  function _planRows(){
    var M = _srcMod();
    if(!M) return [];
    var rows = Object.keys(M.PLAN).map(function(oid){ return M.PLAN[oid]; }).filter(Boolean);
    if(_mode==='today'){
      /* Today bulk print — only Pending ('' ) and Entered rows qualify.
         Effective status: AUTO rows follow live TL/station state, MANUAL rows
         honour the stored _status (same rule as the Today Plan status bar). */
      return rows.filter(function(r){
        var st = (M.getEffectiveStatus ? M.getEffectiveStatus(r) : (r._status||'')) || '';
        return st==='' || st==='entered';
      });
    }
    return rows.filter(function(r){ return r._status!=='done' && r._status!=='cancel'; });
  }

  function _gather(){
    var rows = _planRows();
    /* 'early' keeps the note-"8" filter; 'today' lists ALL pending/entered rows. */
    if(_mode!=='today') rows = rows.filter(function(r){ return _isEarly8(r.note); });
    /* v4.55.4 — print/selection order MUST match Plan TABLE VIEW = paste/Excel
       source order. Sort by _forDate then _seq (global paste index stamped in
       PLAN.parsePlanSheet), tie-break by per-customer "no". Rows without _seq
       (legacy data pre-v4.55.4) sink to the bottom and regain real order after
       the next paste — same fallback as PLAN.tableRows(). */
    rows.sort(function(a,b){
      var da = String(a._forDate||''), db = String(b._forDate||'');
      if(da !== db) return da < db ? -1 : 1;
      var sa = (typeof a._seq === 'number') ? a._seq : Number.MAX_SAFE_INTEGER;
      var sb = (typeof b._seq === 'number') ? b._seq : Number.MAX_SAFE_INTEGER;
      if(sa !== sb) return sa - sb;
      return (parseInt(a.no,10)||0) - (parseInt(b.no,10)||0);
    });
    return rows;
  }

  /* Cert badges for the selection list (NOT printed on the PTT). */
  function _badgesHTML(r){
    var w = null;
    try{
      var cd = (typeof parseDate==='function' && r._forDate) ? parseDate(r._forDate) : null;
      if(typeof FCHECK!=='undefined' && FCHECK.orderWarning) w = FCHECK.orderWarning(r, cd || undefined);
    }catch(_){}
    if(!w || !w.badges || !w.badges.length) return '<span class="pe-badge pe-ok">\u2713 certs OK</span>';
    return w.badges.map(function(b){
      var cls = b.type==='exp' ? 'pe-exp' : (b.type==='miss' ? 'pe-miss' : 'pe-warn');
      var ic  = b.type==='exp' ? '\uD83D\uDD34' : (b.type==='miss' ? '\u274C' : '\u26A0');
      return '<span class="pe-badge '+cls+'">'+ic+' '+_esc(b.text)+'</span>';
    }).join('');
  }

  /* v4.55.x — cert warning line PRINTED on the slip (not just shown as a
     badge in the selection modal). Returns a one-line "subject: certs"
     summary for one plan row, or '' when clean. Uses the same FCHECK source
     as the modal badges so the printed warning matches what the operator saw,
     and reads rmooc with the romooc fallback so an expired trailer cert is
     never dropped. Checked against the plan's own date (_forDate). */
  function _certWarnLine(r){
    try{
      if(typeof FCHECK==='undefined' || !FCHECK.orderWarning) return '';
      var cd = (typeof parseDate==='function' && r._forDate) ? parseDate(r._forDate) : null;
      var w = FCHECK.orderWarning(r, cd || undefined);
      if(!w || !w.badges || !w.badges.length) return '';
      return w.badges.map(function(b){ return b.text; }).join('  |  ');
    }catch(_){ return ''; }
  }
  /* Merge the cert warnings of every row in a combined (multi-DO) slip,
     de-duplicating identical lines (same truck/driver ⇒ usually identical). */
  function _certWarnLineMulti(rows){
    var seen = {}, out = [];
    (rows||[]).forEach(function(r){
      var s = _certWarnLine(r);
      if(s && !seen[s]){ seen[s] = 1; out.push(s); }
    });
    return out.join('  ||  ');
  }
  /* Red warning note block for the printed PTT, or '' when there is nothing
     to flag. Mirrors the Check-booth note styling. */
  function _certWarnHTML(text){
    if(!text) return '';
    return '<div class="pf-note" style="min-height:16px;background:#fff0f0;border:0.6pt solid #d98a8a;border-top:none">'
         + '<span class="pf-nlbl" style="color:#b30000">⚠ Cert:</span>'
         + '<span class="pf-nval" style="color:#b30000;font-weight:700">'+_esc(text)+'</span></div>';
  }

  function _dateParts(forDate){
    var d = (typeof parseDate==='function') ? parseDate(forDate) : null;
    if(d) return { day:d.getDate(), mon:d.getMonth()+1, yr:d.getFullYear() };
    return { day:'', mon:'', yr:new Date().getFullYear() };
  }

  /* ── RAM-only Fleet lookups (no Firebase) — identical sources to the
        assign-into-station PTT (SCALE.pttPrint). Used to fill the fields the
        early PTT previously left blank: TW average, safe-fill cap. ── */
  function _twAvgFor(plate){
    try{
      var twd = (typeof DATA!=='undefined' && DATA.twavg) ? DATA.twavg : {};
      var pl = String(plate||'').trim().toUpperCase();
      for(var rid in twd){ if(String(twd[rid].truck||twd[rid].plate||'').trim().toUpperCase()===pl) return parseFloat(twd[rid].avgWt)||null; }
    }catch(_){}
    return null;
  }
  function _sfKgFor(plate, rmooc){
    try{
      var fleets = (typeof DATA!=='undefined') ? DATA : {};
      var pl = String(plate||'').trim().toUpperCase();
      var rm = String(rmooc||'').trim().toUpperCase();
      var findCap = function(tab){ var d=fleets[tab]||{}; for(var rid in d){ var dp=String(d[rid].plate||'').trim().toUpperCase(); if(dp&&(dp===pl||(rm&&dp===rm))) return parseFloat(d[rid].cap||d[rid].volume)||0; } return 0; };
      var capM3 = findCap('tanklorry')||findCap('rmooc');
      if(capM3>0){
        var dens = (typeof sfDensity==='function') ? sfDensity() : 0.538;
        var pct  = (typeof sfFillPct==='function') ? sfFillPct() : 0.9;
        return Math.round(capM3 * dens * pct * 1000);
      }
    }catch(_){}
    return null;
  }
  /* Safe-fill adjustment of Loading Q'ty — same rule as _pttShowOverlay so the
     printed X/Y and the Check-booth warning match the on-station slip. */
  function _sfAdjust(planX, planY, sfKg){
    var x = planX, y = planY || planX, note = '';
    if(sfKg){
      var sfT = sfKg/1000;
      if(planX>0 && planX<sfT && sfT<y){ y=parseFloat(sfT.toFixed(2)); note='\u26A0 Sale plan '+planX+' ton/'+(planY||planX)+' ton > Safe fill allow'; }
      else if(planX>0 && sfT<=planX){ y=parseFloat(sfT.toFixed(2)); x=parseFloat((sfT-0.2).toFixed(1)); note='\u26A0 Sale plan '+planX+' ton/'+(planY||planX)+' ton > Safe fill allow'; }
    }
    return { x:x, y:y, note:note };
  }
  /* v4.59 — Lot/Tank on the printed slip.
     mode 'today': take the tank + lot currently SELECTED on the Scale tab
     (SCALE.tankForType — pure orders resolve their pure tank/lot), because
     Today-Plan bulk prints happen the same morning the tank is already chosen.
     mode 'early' (Tomorrow Plan, printed the evening before): keep the blank
     placeholders — tomorrow's tank is not decided yet. */
  function _lotTankStr(type){
    var curYr = new Date().getFullYear();
    var ph = 'LPG-'+curYr+'-......\nTK-350.....';
    if(_mode !== 'today') return ph;
    try{
      if(typeof SCALE !== 'undefined' && SCALE.tankForType){
        var tk = SCALE.tankForType(type||'');
        if(tk && (tk.lotFull || tk.name)){
          return (tk.lotFull || ('LPG-'+curYr+'-......')) + '\n' + (tk.name || 'TK-350.....');
        }
      }
    }catch(_){}
    return ph;
  }
  function _staffEng(){ var el=document.getElementById('scEngineer'); return el ? (el.value||'') : ''; }
  function _staffChk(){ var el=document.getElementById('scCheckBooth'); return el ? (el.value||'') : ''; }
  /* Customer printed name = VN full name, same as the assign-into-station PTT. */
  function _custVN(name){ return (typeof CT!=='undefined' && CT.vnName) ? CT.vnName(name||'') : (name||''); }

  /* Build ONE A5 PTT page from a Tomorrow-Plan row. Mirrors the assign-into-
     station slip (_pttShowOverlay): customer VN name, Loading Q'ty X/Y with
     safe-fill cap, Safe Fill Allow, Truck/Gross Wt AVG (RAM Fleet lookups),
     engineer + check-booth signatures. Kept as advance-print placeholders:
     Lot/Tank (tank not yet decided) and Bay (left blank). Date = _forDate. */
  function _buildPage(r){
    var dp = _dateParts(r._forDate);
    var curYr = new Date().getFullYear();
    var prodType = (typeof _pfDeriveType==='function') ? _pfDeriveType(r.type||'') : (r.type||'');
    var lotPlaceholder = _lotTankStr(r.type);   /* v4.59 — real tank/lot in 'today' mode */
    var custName = _custVN(r.customer);
    var twAvg = _twAvgFor(r.plate);
    var sfKg  = _sfKgFor(r.plate, r.rmooc);
    var sf = _sfAdjust(parseFloat(r.qty)||0, parseFloat(r.tolerance||r.maxTol||0)||0, sfKg);
    var dX = sf.x, dY = sf.y, boothNote = sf.note;
    var sfStr = sfKg ? sfKg.toLocaleString('en-US') : '';
    var twStr = twAvg ? Math.round(twAvg).toLocaleString('en-US') : '';
    var gwStr = (twAvg && dX>0) ? Math.round(twAvg + dX*1000).toLocaleString('en-US') : '';
    var eng = _staffEng(), chk = _staffChk();
    var qty = (r.qty!=null && r.qty!=='') ? String(r.qty) : '';
    var h = '';
    h += '<div class="pf-ptt-paper"><div class="pf-ptt">';
    /* Header */
    h += '<div class="pf-ptt-hdr"><div style="line-height:1.15"><div style="font-family:\'Arial Black\',Arial,sans-serif;font-size:18pt;font-weight:900;color:#000;letter-spacing:0.5px">HYOSUNG</div><div style="font-family:Arial,sans-serif;font-size:10pt;font-weight:700;color:#1a3a5c;letter-spacing:1px;margin-top:1px">VINA CHEMICALS</div></div><div><div class="pf-ptt-titl">LPG LOADING INFORMATION</div></div></div>';
    /* Info grid */
    h += '<div class="pf-ig">';
    h += '<div class="pf-il">Customer</div><div class="pf-iv" style="grid-column:span 3;border-right:none;font-size:10.5pt">'+_esc(custName)+'</div>';
    h += '<div class="pf-il">Truck No.</div><div class="pf-iv" style="font-size:13pt;font-weight:900;font-family:\'Courier New\',monospace">'+_esc(r.plate)+'</div>';
    h += '<div class="pf-il" style="border-left:none">Rmooc No.</div><div class="pf-iv norb" style="font-size:13pt;font-weight:900;font-family:\'Courier New\',monospace">'+_esc(r.rmooc)+'</div>';
    h += '<div class="pf-il-qty">Loading Q\'ty</div>';
    h += '<div style="padding:3px 6px;border-right:1px solid #888;border-bottom:2px solid #333;display:flex;align-items:center"><span style="font-size:20pt;font-weight:900;font-family:\'Courier New\',monospace">'+_esc(dX>0?dX:'')+'</span><span style="font-size:11pt;color:#666;margin:0 4px">Ton /</span><span style="font-size:20pt;font-weight:900;font-family:\'Courier New\',monospace">'+_esc(dY>0?dY:'')+'</span><span style="font-size:11pt;color:#666;margin-left:4px">Ton</span></div>';
    h += '<div class="pf-il-qty" style="border-left:none;font-size:8pt">Product Type</div><div style="padding:3px 6px;border-bottom:2px solid #333;display:flex;align-items:center"><span style="font-size:12pt;font-weight:800;color:#1a5276;letter-spacing:0.5px">'+_esc(prodType)+'</span></div>';
    h += '<div class="pf-il" style="font-size:8pt;padding:2px 4px">Safe Fill Allow</div><div class="pf-iv" style="font-family:\'Courier New\',monospace;padding:2px 5px;display:flex;align-items:center">'+(sfStr?('<span style="font-size:20pt;font-weight:900">'+_esc(sfStr)+'</span><span style="font-size:11pt;color:#666;margin-left:4px">kg</span>'):'')+'</div>';
    h += '<div class="pf-il" style="border-left:none;font-size:8pt;padding:2px 4px">Lot / Tank</div><div class="pf-iv norb" style="font-family:\'Courier New\',monospace;font-size:12pt;font-weight:700;padding:2px 5px;line-height:1.15;white-space:pre-line">'+_esc(lotPlaceholder)+'</div>';
    h += '<div class="pf-il nobb" style="font-size:8pt;padding:2px 4px">DO Info</div><div class="pf-iv nobb" style="font-family:\'Courier New\',monospace;padding:2px 5px;line-height:1.2;display:block"><div style="font-size:12pt;font-weight:900;white-space:pre-line">'+_esc(r.doNum)+'</div><div style="font-size:12pt;font-weight:900;color:#000"><span>'+_esc(qty)+'</span><span style="font-size:9pt;color:#666;margin-left:3px;font-weight:600">Ton</span></div></div>';
    h += '<div class="pf-il nobb" style="border-left:none;font-size:8pt;padding:2px 4px">Bay</div><div class="pf-iv norb nobb" style="font-size:15pt;font-weight:900;padding:2px 5px"></div>';
    h += '</div>';
    /* Weigh table — AVG column pre-filled from Fleet; 1st/2nd captured at booth */
    h += '<table class="pf-wt"><thead><tr><th style="width:60px">Parameter</th><th style="width:70px">AVG</th><th>1st time</th><th>2nd time</th><th style="width:70px">Time</th><th style="width:70px">Pressure</th></tr></thead><tbody>';
    h += '<tr><td class="pw-lbl">Truck Wt</td><td class="pw-wr pw-sm" style="font-size:15pt;font-weight:900;background:#f5f9fc;padding:3px 5px">'+_esc(twStr)+'</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm"></td><td class="pw-wr pw-sm"></td></tr>';
    h += '<tr><td class="pw-lbl">Gross Wt</td><td class="pw-wr pw-sm" style="font-size:15pt;font-weight:900;background:#f5f9fc;padding:3px 5px">'+_esc(gwStr)+'</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm"></td><td class="pw-wr pw-sm"></td></tr>';
    h += '<tr><td class="pw-lbl">Net Wt</td><td class="pw-wr pw-sm" colspan="2">kg</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm"></td><td class="pw-wr pw-sm"></td></tr>';
    h += '<tr><td class="pw-lbl">Seal No.</td><td class="pw-wr pw-sm" colspan="3"></td><td rowspan="2" colspan="2" style="border:1px solid #aaa;vertical-align:top;padding:3px 5px"><span style="font-size:7pt;color:#888;font-weight:600;letter-spacing:.5px">ENGINEER NOTE</span><div style="font-size:8.5pt;color:#d62839;min-height:16px"></div></td></tr>';
    h += '<tr><td class="pw-lbl">FQ</td><td class="pw-wr pw-sm" colspan="2">kg</td><td class="pw-wr pw-sm">kg</td></tr>';
    h += '</tbody></table>';
    /* Notes */
    h += '<div class="pf-note" style="min-height:20px"><span class="pf-nlbl">Sale Note:</span><span class="pf-nval">'+_esc(r.note)+'</span></div>';
    h += '<div class="pf-note" style="min-height:20px;background:#fff5f5"><span class="pf-nlbl" style="color:#c00">Check booth:</span><span class="pf-nval" style="color:#c00;font-weight:700">'+_esc(boothNote)+'</span></div>';
    /* v4.55.x — printed cert warning (expired / missing / dup), if any. */
    h += _certWarnHTML(_certWarnLine(r));
    /* Date — from plan _forDate */
    h += '<div class="pf-date" style="padding:2px 0 1px">Ng\u00E0y '+_esc(dp.day)+' th\u00E1ng '+_esc(dp.mon)+' n\u0103m '+_esc(dp.yr)+'</div>';
    /* Signatures */
    h += '<div class="pf-sigs">';
    h += '<div class="pf-sc" style="padding:2px 8px 1px"><div class="pf-sttl" style="font-size:8pt">Check Booth</div><div class="pf-ssp" style="height:52px"></div><div class="pf-snm" style="font-size:9pt">'+_esc(chk)+'</div></div>';
    h += '<div class="pf-sc" style="padding:2px 8px 1px"><div class="pf-sttl" style="font-size:8pt">Engineer</div><div class="pf-ssp" style="height:52px"></div><div class="pf-snm" style="font-size:9pt">'+_esc(eng)+'</div></div>';
    h += '<div class="pf-sc" style="padding:2px 8px 1px"><div class="pf-sttl" style="font-size:8pt">Driver</div><div class="pf-ssp" style="height:52px"></div><div class="pf-snm" style="font-size:9pt">'+_esc(r.driver)+'</div></div>';
    h += '</div><div class="pf-sfoot"></div>';
    h += '</div></div>';
    return h;
  }

  /* ── Multi-DO truck grouping ────────────────────────────────
     A truck carrying several early-morning DOs shows up as sibling
     plan rows (same plate + driver + plan date, each its own real DO
     and own qty). Such a group can print as ONE combined PTT (all DOs
     on a single slip) or as SEPARATE slips (one per DO). Detection is
     purely for the print suggestion — no scale / TL involvement.     */
  function _plateKey(p){ return String(p==null?'':p).toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function _realDO(d){
    var s = (typeof _mdNormDO==='function') ? _mdNormDO(d) : String(d==null?'':d).replace(/[,\s]/g,'').replace(/^0+/,'').trim();
    return /^\d{7,}$/.test(s) ? s : '';
  }
  /* Build the ordered list of units (single rows + qualifying groups). */
  function _buildUnits(rows){
    var buckets = {}, order = [];
    rows.forEach(function(r){
      var pk = _plateKey(r.plate), dk = String(r.driver||'').trim().toUpperCase(), fd = String(r._forDate||'');
      var key = pk+'|'+dk+'|'+fd;
      if(!buckets[key]){ buckets[key] = []; order.push(key); }
      buckets[key].push(r);
    });
    var units = [];
    order.forEach(function(key){
      var grp = buckets[key];
      var allReal = grp.every(function(r){ return !!_realDO(r.doNum); });
      var total = grp.reduce(function(s,r){ return s + (parseFloat(r.qty)||0); }, 0);
      var combinable = grp.length > 1 && allReal && total <= MDO_CAP_MT && _plateKey(grp[0].plate);
      if(combinable){
        units.push({ type:'group', key:key, rows:grp, total:total });
        if(!(key in _groupMode)) _groupMode[key] = 'combined';   /* default suggestion: gộp */
      } else {
        grp.forEach(function(r){ units.push({ type:'single', row:r }); });
      }
    });
    return units;
  }
  /* Resolve the current selection + group modes into an ordered list of
     pages to print. Each entry: { combined:bool, rows:[...] }. */
  function _computePlan(){
    var plan = [];
    _units.forEach(function(u){
      if(u.type==='single'){
        if(u.row._oid && _selected[u.row._oid]) plan.push({ combined:false, rows:[u.row] });
        return;
      }
      var checked = u.rows.filter(function(r){ return r._oid && _selected[r._oid]; });
      if(!checked.length) return;
      if(_groupMode[u.key]==='separate'){
        checked.forEach(function(r){ plan.push({ combined:false, rows:[r] }); });
      } else {
        plan.push({ combined:true, rows:checked });
      }
    });
    return plan;
  }

  /* Build ONE combined A5 PTT page for a multi-DO truck group. Same layout
     as _buildPage, but: customer = unique names joined; Loading Q'ty = sum;
     DO Info lists every DO with its own qty; product type = merged. */
  function _buildCombinedPage(rows){
    if(rows.length === 1) return _buildPage(rows[0]);
    var r0 = rows[0];
    var dp = _dateParts(r0._forDate);
    var curYr = new Date().getFullYear();
    var prodType = (typeof deriveProductTypeMulti==='function') ? deriveProductTypeMulti(rows) : '';
    if(!prodType) prodType = (typeof _pfDeriveType==='function') ? _pfDeriveType(r0.type||'') : (r0.type||'');
    var lotPlaceholder = _lotTankStr(r0.type);   /* v4.59 — real tank/lot in 'today' mode */
    var custs = []; rows.forEach(function(r){ var c=_custVN(r.customer).trim(); if(c && custs.indexOf(c)<0) custs.push(c); });
    var custStr = custs.join(' / ');
    var notes = []; rows.forEach(function(r){ var n=String(r.note||'').trim(); if(n && notes.indexOf(n)<0) notes.push(n); });
    var noteStr = notes.join('  |  ');
    var total = rows.reduce(function(s,r){ return s + (parseFloat(r.qty)||0); }, 0);
    var totalStr = total ? String(Math.round(total*100)/100) : '';
    /* RAM Fleet lookups keyed on the shared truck (r0). Gross = TW avg + total. */
    var twAvg = _twAvgFor(r0.plate);
    var sfKg  = _sfKgFor(r0.plate, r0.rmooc);
    var sfStr = sfKg ? sfKg.toLocaleString('en-US') : '';
    var twStr = twAvg ? Math.round(twAvg).toLocaleString('en-US') : '';
    var gwStr = (twAvg && total>0) ? Math.round(twAvg + total*1000).toLocaleString('en-US') : '';
    var boothNote = (sfKg && total > sfKg/1000) ? ('\u26A0 Combined '+totalStr+' ton > Safe fill allow') : '';
    var eng = _staffEng(), chk = _staffChk();
    /* DO Info lines: "<DO>  <qty> Ton" each */
    var doLines = rows.map(function(r){
      var dn = _realDO(r.doNum) || String(r.doNum||'').trim();
      var q  = (r.qty!=null && r.qty!=='') ? String(r.qty) : '';
      return '<div style="display:flex;gap:6px;align-items:baseline"><span style="font-size:12pt;font-weight:900">'+_esc(dn)+'</span><span style="font-size:10pt;font-weight:800;color:#000">'+_esc(q)+'</span><span style="font-size:8pt;color:#666;font-weight:600">Ton</span></div>';
    }).join('');
    var h = '';
    h += '<div class="pf-ptt-paper"><div class="pf-ptt">';
    /* Header */
    h += '<div class="pf-ptt-hdr"><div style="line-height:1.15"><div style="font-family:\'Arial Black\',Arial,sans-serif;font-size:18pt;font-weight:900;color:#000;letter-spacing:0.5px">HYOSUNG</div><div style="font-family:Arial,sans-serif;font-size:10pt;font-weight:700;color:#1a3a5c;letter-spacing:1px;margin-top:1px">VINA CHEMICALS</div></div><div style="text-align:right"><div class="pf-ptt-titl">LPG LOADING INFORMATION</div><div style="font-size:8pt;font-weight:700;color:#0077b6;margin-top:2pt;letter-spacing:.5px">COMBINED · '+rows.length+' DO</div></div></div>';
    /* Info grid */
    h += '<div class="pf-ig">';
    h += '<div class="pf-il">Customer</div><div class="pf-iv" style="grid-column:span 3;border-right:none;font-size:10pt">'+_esc(custStr)+'</div>';
    h += '<div class="pf-il">Truck No.</div><div class="pf-iv" style="font-size:13pt;font-weight:900;font-family:\'Courier New\',monospace">'+_esc(r0.plate)+'</div>';
    h += '<div class="pf-il" style="border-left:none">Rmooc No.</div><div class="pf-iv norb" style="font-size:13pt;font-weight:900;font-family:\'Courier New\',monospace">'+_esc(r0.rmooc)+'</div>';
    h += '<div class="pf-il-qty">Loading Q\'ty</div>';
    h += '<div style="padding:3px 6px;border-right:1px solid #888;border-bottom:2px solid #333;display:flex;align-items:center"><span style="font-size:20pt;font-weight:900;font-family:\'Courier New\',monospace">'+_esc(totalStr)+'</span><span style="font-size:11pt;color:#666;margin:0 4px">Ton</span><span style="font-size:8pt;color:#888;font-weight:600">(total)</span></div>';
    h += '<div class="pf-il-qty" style="border-left:none;font-size:8pt">Product Type</div><div style="padding:3px 6px;border-bottom:2px solid #333;display:flex;align-items:center"><span style="font-size:12pt;font-weight:800;color:#1a5276;letter-spacing:0.5px">'+_esc(prodType)+'</span></div>';
    h += '<div class="pf-il" style="font-size:8pt;padding:2px 4px">Safe Fill Allow</div><div class="pf-iv" style="font-family:\'Courier New\',monospace;padding:2px 5px;display:flex;align-items:center">'+(sfStr?('<span style="font-size:20pt;font-weight:900">'+_esc(sfStr)+'</span><span style="font-size:11pt;color:#666;margin-left:4px">kg</span>'):'')+'</div>';
    h += '<div class="pf-il" style="border-left:none;font-size:8pt;padding:2px 4px">Lot / Tank</div><div class="pf-iv norb" style="font-family:\'Courier New\',monospace;font-size:12pt;font-weight:700;padding:2px 5px;line-height:1.15;white-space:pre-line">'+_esc(lotPlaceholder)+'</div>';
    h += '<div class="pf-il nobb" style="font-size:8pt;padding:2px 4px">DO Info</div><div class="pf-iv nobb" style="font-family:\'Courier New\',monospace;padding:2px 5px;line-height:1.25;display:block">'+doLines+'</div>';
    h += '<div class="pf-il nobb" style="border-left:none;font-size:8pt;padding:2px 4px">Bay</div><div class="pf-iv norb nobb" style="font-size:15pt;font-weight:900;padding:2px 5px"></div>';
    h += '</div>';
    /* Weigh table — AVG column pre-filled from Fleet; 1st/2nd captured at booth */
    h += '<table class="pf-wt"><thead><tr><th style="width:60px">Parameter</th><th style="width:70px">AVG</th><th>1st time</th><th>2nd time</th><th style="width:70px">Time</th><th style="width:70px">Pressure</th></tr></thead><tbody>';
    h += '<tr><td class="pw-lbl">Truck Wt</td><td class="pw-wr pw-sm" style="font-size:15pt;font-weight:900;background:#f5f9fc;padding:3px 5px">'+_esc(twStr)+'</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm"></td><td class="pw-wr pw-sm"></td></tr>';
    h += '<tr><td class="pw-lbl">Gross Wt</td><td class="pw-wr pw-sm" style="font-size:15pt;font-weight:900;background:#f5f9fc;padding:3px 5px">'+_esc(gwStr)+'</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm"></td><td class="pw-wr pw-sm"></td></tr>';
    h += '<tr><td class="pw-lbl">Net Wt</td><td class="pw-wr pw-sm" colspan="2">kg</td><td class="pw-wr pw-sm">kg</td><td class="pw-wr pw-sm"></td><td class="pw-wr pw-sm"></td></tr>';
    h += '<tr><td class="pw-lbl">Seal No.</td><td class="pw-wr pw-sm" colspan="3"></td><td rowspan="2" colspan="2" style="border:1px solid #aaa;vertical-align:top;padding:3px 5px"><span style="font-size:7pt;color:#888;font-weight:600;letter-spacing:.5px">ENGINEER NOTE</span><div style="font-size:8.5pt;color:#d62839;min-height:16px"></div></td></tr>';
    h += '<tr><td class="pw-lbl">FQ</td><td class="pw-wr pw-sm" colspan="2">kg</td><td class="pw-wr pw-sm">kg</td></tr>';
    h += '</tbody></table>';
    /* Notes */
    h += '<div class="pf-note" style="min-height:20px"><span class="pf-nlbl">Sale Note:</span><span class="pf-nval">'+_esc(noteStr)+'</span></div>';
    h += '<div class="pf-note" style="min-height:20px;background:#fff5f5"><span class="pf-nlbl" style="color:#c00">Check booth:</span><span class="pf-nval" style="color:#c00;font-weight:700">'+_esc(boothNote)+'</span></div>';
    /* v4.55.x — printed cert warning merged across all DOs in the combined slip. */
    h += _certWarnHTML(_certWarnLineMulti(rows));
    /* Date — from plan _forDate */
    h += '<div class="pf-date" style="padding:2px 0 1px">Ng\u00E0y '+_esc(dp.day)+' th\u00E1ng '+_esc(dp.mon)+' n\u0103m '+_esc(dp.yr)+'</div>';
    /* Signatures */
    h += '<div class="pf-sigs">';
    h += '<div class="pf-sc" style="padding:2px 8px 1px"><div class="pf-sttl" style="font-size:8pt">Check Booth</div><div class="pf-ssp" style="height:52px"></div><div class="pf-snm" style="font-size:9pt">'+_esc(chk)+'</div></div>';
    h += '<div class="pf-sc" style="padding:2px 8px 1px"><div class="pf-sttl" style="font-size:8pt">Engineer</div><div class="pf-ssp" style="height:52px"></div><div class="pf-snm" style="font-size:9pt">'+_esc(eng)+'</div></div>';
    h += '<div class="pf-sc" style="padding:2px 8px 1px"><div class="pf-sttl" style="font-size:8pt">Driver</div><div class="pf-ssp" style="height:52px"></div><div class="pf-snm" style="font-size:9pt">'+_esc(r0.driver)+'</div></div>';
    h += '</div><div class="pf-sfoot"></div>';
    h += '</div></div>';
    return h;
  }

  /* ── Selection modal ── */
  function _ensureModal(){
    if(_built) return;
    if(!document.getElementById('ptt-early-css')){
      var st = document.createElement('style');
      st.id = 'ptt-early-css';
      st.textContent = ''
        + "#ptt-early-bg{position:fixed;inset:0;z-index:11500;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;}"
        + "#ptt-early-bg.on{display:flex;}"
        + "#ptt-early-bg .pe-card{background:#fff;border-radius:12px;width:96%;max-width:880px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.25);}"
        + "#ptt-early-bg .pe-hdr{padding:14px 18px 8px;border-bottom:1px solid #eee;}"
        + "#ptt-early-bg .pe-title{font-family:'Oswald',sans-serif;font-size:17px;font-weight:700;color:#0077b6;letter-spacing:.6px;}"
        + "#ptt-early-bg .pe-sub{font-size:11px;color:#667;margin-top:4px;line-height:1.45;}"
        + "#ptt-early-bg .pe-tools{display:flex;align-items:center;gap:12px;padding:8px 18px;border-bottom:1px solid #f0f0f0;}"
        + "#ptt-early-bg .pe-link{font-size:12px;color:#0077b6;cursor:pointer;text-decoration:underline;}"
        + "#ptt-early-bg .pe-cnt{margin-left:auto;font-size:12px;color:#445;font-weight:700;}"
        + "#ptt-early-bg .pe-body{overflow:auto;padding:8px 14px 10px;flex:1;}"
        + "#ptt-early-bg .pe-row{display:flex;align-items:flex-start;gap:9px;padding:8px;border:1px solid #eee;border-radius:7px;margin-bottom:6px;background:#fafbfc;}"
        + "#ptt-early-bg .pe-row.pe-printed{background:#eef6ff;border-color:#cfe5ff;}"
        + "#ptt-early-bg .pe-row input[type=checkbox]{margin-top:3px;width:16px;height:16px;cursor:pointer;flex-shrink:0;}"
        + "#ptt-early-bg .pe-info{flex:1;min-width:0;}"
        + "#ptt-early-bg .pe-l1{font-size:13px;font-weight:700;color:#1a2733;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;}"
        + "#ptt-early-bg .pe-no{color:#0077b6;font-family:'Oswald',sans-serif;}"
        + "#ptt-early-bg .pe-plate{font-family:'Courier New',monospace;}"
        + "#ptt-early-bg .pe-tag{font-size:9px;font-weight:700;color:#0077b6;background:#e3f1fb;border-radius:9px;padding:1px 7px;letter-spacing:.3px;}"
        + "#ptt-early-bg .pe-l2{font-size:11px;color:#667;margin-top:2px;}"
        + "#ptt-early-bg .pe-note{font-size:11px;color:#c0392b;font-weight:600;margin-top:2px;}"
        + "#ptt-early-bg .pe-badges{margin-top:5px;display:flex;flex-wrap:wrap;gap:4px;}"
        + "#ptt-early-bg .pe-badge{font-family:'Oswald',sans-serif;font-size:10px;font-weight:700;letter-spacing:.4px;padding:2px 8px;border-radius:11px;color:#fff;}"
        + "#ptt-early-bg .pe-ok{background:#2e8b57;}#ptt-early-bg .pe-warn{background:#bf6900;}#ptt-early-bg .pe-miss{background:#bf6900;}#ptt-early-bg .pe-exp{background:#d62839;}"
        + "#ptt-early-bg .pe-empty{padding:34px;text-align:center;color:#889;font-size:13px;}"
        + "#ptt-early-bg .pe-foot{display:flex;justify-content:flex-end;gap:9px;padding:10px 18px;border-top:1px solid #eee;}"
        + "#ptt-early-bg .pe-btn{padding:8px 22px;border:none;border-radius:7px;font-family:'Oswald',sans-serif;letter-spacing:.6px;font-size:13px;font-weight:700;cursor:pointer;}"
        + "#ptt-early-bg .pe-btn-cancel{background:#e0e0e0;color:#333;}"
        + "#ptt-early-bg .pe-btn-print{background:#0077b6;color:#fff;}"
        + "#ptt-early-bg .pe-btn-print:disabled{background:#9bbdd0;cursor:not-allowed;}"
        + "#ptt-early-bg .pe-group{border:1.5px solid #cfe0ee;border-radius:9px;margin-bottom:8px;background:#f5fafe;overflow:hidden;}"
        + "#ptt-early-bg .pe-ghdr{display:flex;align-items:center;gap:10px;padding:7px 10px;background:#e9f3fb;border-bottom:1px solid #d8e8f4;flex-wrap:wrap;}"
        + "#ptt-early-bg .pe-gtruck{font-family:'Oswald',sans-serif;font-size:13px;font-weight:700;letter-spacing:.6px;color:#0a4a73;}"
        + "#ptt-early-bg .pe-gmeta{font-size:11px;color:#567;}"
        + "#ptt-early-bg .pe-gtag{font-size:9px;font-weight:700;color:#fff;background:#0077b6;border-radius:9px;padding:1px 8px;letter-spacing:.4px;}"
        + "#ptt-early-bg .pe-gtoggle{margin-left:auto;display:inline-flex;border:1px solid #b9d4e8;border-radius:7px;overflow:hidden;}"
        + "#ptt-early-bg .pe-gbtn{padding:4px 11px;font-size:11px;font-weight:700;cursor:pointer;background:#fff;color:#456;border:none;}"
        + "#ptt-early-bg .pe-gbtn+.pe-gbtn{border-left:1px solid #b9d4e8;}"
        + "#ptt-early-bg .pe-gbtn.on{background:#0077b6;color:#fff;}"
        + "#ptt-early-bg .pe-gbody{padding:6px 8px 2px;}"
        + "#ptt-early-bg .pe-group .pe-row{margin-bottom:6px;}";
      document.head.appendChild(st);
    }
    var bg = document.createElement('div');
    bg.id = 'ptt-early-bg';
    bg.setAttribute('onclick', "if(event.target===this)PTT_EARLY.close()");
    bg.innerHTML = ''
      + '<div class="pe-card">'
      +   '<div class="pe-hdr">'
      +     '<div class="pe-title" id="pe-title">\uD83D\uDDA8 BULK PRINT PTT \u2014 EARLY-MORNING ORDERS</div>'
      +     '<div class="pe-sub" id="pe-sub"></div>'
      +   '</div>'
      +   '<div class="pe-tools">'
      +     '<span class="pe-link" onclick="PTT_EARLY.selectAll(true)">Select all</span>'
      +     '<span class="pe-link" onclick="PTT_EARLY.selectAll(false)">Select none</span>'
      +     '<span class="pe-cnt" id="pe-count">0 selected</span>'
      +   '</div>'
      +   '<div class="pe-body" id="pe-list"></div>'
      +   '<div class="pe-foot">'
      +     '<button class="pe-btn pe-btn-cancel" onclick="PTT_EARLY.close()">Cancel</button>'
      +     '<button class="pe-btn pe-btn-print" id="pe-print-btn" onclick="PTT_EARLY.print()">\uD83D\uDDA8 Print Selected</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(bg);
    _built = true;
  }

  function _rowHTML(r){
    var oid = r._oid||'';
    var on = !!_selected[oid];
    var printed = !!_printedOids[oid];
    var h = '<label class="pe-row'+(printed?' pe-printed':'')+'">';
    h += '<input type="checkbox" '+(on?'checked':'')+' onchange="PTT_EARLY.toggle(\''+_attr(oid)+'\', this.checked)">';
    h += '<div class="pe-info">';
    h += '<div class="pe-l1"><span class="pe-no">#'+_esc(r.no||'?')+'</span><span class="pe-plate">'+_esc(r.plate||'\u2014')+'</span><span>'+_esc(r.customer||'\u2014')+'</span>'+(printed?'<span class="pe-tag">printed</span>':'')+'</div>';
    h += '<div class="pe-l2">Driver: '+_esc(r.driver||'\u2014')+'  \u00B7  Qty: '+_esc(r.qty||'\u2014')+' MT  \u00B7  DO: '+_esc(r.doNum||'\u2014')+'  \u00B7  Date: '+_esc(r._forDate||'\u2014')+'</div>';
    if(r.note) h += '<div class="pe-note">\uD83D\uDCDD '+_esc(r.note)+'</div>';
    h += '<div class="pe-badges">'+_badgesHTML(r)+'</div>';
    h += '</div></label>';
    return h;
  }

  function _render(){
    var list = document.getElementById('pe-list');
    if(!list) return;
    if(!_units.length){
      list.innerHTML = (_mode==='today')
        ? '<div class="pe-empty">No Pending / Entered orders found in Today Plan.</div>'
        : '<div class="pe-empty">No early-morning orders found in Tomorrow Plan.<br>(No row note contains "8".)</div>';
      _updateCount();
      return;
    }
    var h = '';
    _units.forEach(function(u){
      if(u.type==='single'){ h += _rowHTML(u.row); return; }
      /* Multi-DO truck group — header with Combined / Separate toggle. */
      var mode = _groupMode[u.key]==='separate' ? 'separate' : 'combined';
      var r0 = u.rows[0];
      var totStr = u.total ? (Math.round(u.total*100)/100) : '';
      h += '<div class="pe-group">';
      h +=   '<div class="pe-ghdr">';
      h +=     '<span class="pe-gtruck">\uD83D\uDE9B '+_esc(r0.plate||'\u2014')+'</span>';
      h +=     '<span class="pe-gtag">'+u.rows.length+' DO</span>';
      h +=     '<span class="pe-gmeta">'+_esc(r0.driver||'\u2014')+' \u00B7 total '+_esc(totStr)+' MT</span>';
      h +=     '<span class="pe-gtoggle">';
      h +=       '<button class="pe-gbtn'+(mode==='combined'?' on':'')+'" onclick="PTT_EARLY.setGroupMode(\''+_attr(u.key)+'\',\'combined\')">\uD83D\uDD17 Combined (1 PTT)</button>';
      h +=       '<button class="pe-gbtn'+(mode==='separate'?' on':'')+'" onclick="PTT_EARLY.setGroupMode(\''+_attr(u.key)+'\',\'separate\')">\uD83D\uDCC4 Separate ('+u.rows.length+' PTT)</button>';
      h +=     '</span>';
      h +=   '</div>';
      h +=   '<div class="pe-gbody">';
      u.rows.forEach(function(r){ h += _rowHTML(r); });
      h +=   '</div>';
      h += '</div>';
    });
    list.innerHTML = h;
    _updateCount();
  }

  function _updateCount(){
    var n = 0; for(var k in _selected){ if(_selected[k]) n++; }
    var pages = _computePlan().length;
    var el = document.getElementById('pe-count');
    if(el) el.textContent = n + ' selected \u00B7 ' + pages + ' PTT page' + (pages===1?'':'s');
    var btn = document.getElementById('pe-print-btn');
    if(btn){ btn.disabled = (pages===0); btn.textContent = '\uD83D\uDDA8 Print'+(pages?(' ('+pages+')'):''); }
  }

  /* ── Public API ── */
  /* open(mode) — mode 'early' (default, Tomorrow Plan note "8") or 'today'
     (Today Plan, Pending + Entered, no note filter). */
  function open(mode){
    _mode = (mode==='today') ? 'today' : 'early';
    _ensureModal();
    var ttl = document.getElementById('pe-title');
    var sub = document.getElementById('pe-sub');
    if(ttl) ttl.textContent = (_mode==='today')
      ? '🖨 BULK PRINT PTT — TODAY PLAN (PENDING + ENTERED)'
      : '🖨 BULK PRINT PTT — EARLY-MORNING ORDERS';
    if(sub) sub.innerHTML = (_mode==='today')
      ? 'Listing every <b>Today Plan</b> order still <b>Pending / Entered</b>. Uncheck any to skip. Trucks with several DOs are grouped — choose <b>Combined</b> (one slip, all DOs) or <b>Separate</b> (one slip per DO). PTT date = plan date. Lot/Tank = the tank currently <b>selected on the Scale tab</b> (pure orders print their pure tank/lot).'
      : 'Scanned <b>Tomorrow Plan</b> notes for "8" (arrive before 8AM). Uncheck any to skip. Trucks with several DOs are grouped — choose <b>Combined</b> (one slip, all DOs) or <b>Separate</b> (one slip per DO). PTT date = plan date. Lot/Tank print as placeholders (LPG-YYYY-… / TK-350…) — booth staff fills the tank by hand.';
    _candidates = _gather();
    _selected = {};
    _candidates.forEach(function(r){ if(r._oid) _selected[r._oid] = true; });
    _units = _buildUnits(_candidates);
    _render();
    var bg = document.getElementById('ptt-early-bg');
    if(bg) bg.classList.add('on');
  }
  function close(){
    var bg = document.getElementById('ptt-early-bg');
    if(bg) bg.classList.remove('on');
  }
  function toggle(oid, on){ _selected[oid] = !!on; _updateCount(); }
  function selectAll(on){
    _candidates.forEach(function(r){ if(r._oid) _selected[r._oid] = !!on; });
    _render();
  }
  function setGroupMode(key, mode){
    _groupMode[key] = (mode==='separate') ? 'separate' : 'combined';
    _render();
  }
  function print(){
    var plan = _computePlan();
    if(!plan.length){ if(typeof toast==='function') toast('No orders selected','er'); return; }
    /* v4.58 — the Staff-on-duty gate (block when Engineer / Check Booth unset)
       NO LONGER applies to advance bulk printing: these slips are printed the
       evening/morning BEFORE the duty staff may be assigned. Blank names print
       as empty signature lines to be filled by hand. A soft toast still nudges
       the operator so the omission is visible, but printing proceeds. */
    var eng = _staffEng().trim(), chk = _staffChk().trim();
    if(!eng || !chk){
      var missing = [];
      if(!eng) missing.push('Engineer');
      if(!chk) missing.push('Check Booth');
      if(typeof toast==='function') toast('ℹ Staff on duty chưa chọn: '+missing.join(' & ')+' — phiếu in trống tên ký, điền tay sau.','ok');
    }
    var pages = '', printedOids = {};
    plan.forEach(function(item){
      pages += (item.combined && item.rows.length>1) ? _buildCombinedPage(item.rows) : _buildPage(item.rows[0]);
      item.rows.forEach(function(r){ if(r._oid) printedOids[r._oid] = 1; });
    });
    var doc = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      + '<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Barlow:wght@300;400;500;600;700;800;900&family=Barlow+Condensed:wght@600;700;800&display=swap" rel="stylesheet">'
      + '<style>'+_CSS+'</style></head><body>'+pages+'</body></html>';
    if(typeof _pfPrintViaIframe==='function') _pfPrintViaIframe(doc, 800);
    else { if(typeof toast==='function') toast('Print engine not ready','er'); return; }
    /* RAM-only "printed" mark — never written to Firebase / the row object */
    var orders = Object.keys(printedOids);
    orders.forEach(function(o){ _printedOids[o] = Date.now(); });
    if(typeof logAudit==='function'){ try{ logAudit(_mode==='today' ? 'print:ptt_bulk_today' : 'print:ptt_bulk_early', { pages: plan.length, orders: orders.length }); }catch(_){} }
    if(typeof toast==='function') toast('\uD83D\uDDA8 Printing '+plan.length+' PTT page(s) \u00B7 '+orders.length+' order(s)','ok');
    close();
  }

  /* v4.58 — live counter on the two "PTT TODAY" buttons (Today Plan toolbar +
     Scale Quick Actions). Counts Today Plan rows whose effective status is
     Pending ('') or Entered — i.e. exactly the rows the 'today' modal lists.
     Called from TP.refreshCounts/refreshBadge (plan.js) and once after boot. */
  function updateTodayBadge(){
    try{
      if(typeof TP === 'undefined' || !TP.PLAN) return;
      var n = 0;
      for(var oid in TP.PLAN){
        var r = TP.PLAN[oid]; if(!r) continue;
        var st = (TP.getEffectiveStatus ? TP.getEffectiveStatus(r) : (r._status||'')) || '';
        if(st==='' || st==='entered') n++;
      }
      ['peTodayCntScale','peTodayCntPlan'].forEach(function(id){
        var el = document.getElementById(id);
        if(el) el.textContent = n;
      });
    }catch(_){}
  }
  /* Initial fill once modules/cache have loaded (boot order independent). */
  setTimeout(updateTodayBadge, 2500);

  return {
    open: open, close: close, toggle: toggle, selectAll: selectAll, print: print,
    setGroupMode: setGroupMode, isEarly8: _isEarly8, gather: _gather,
    updateTodayBadge: updateTodayBadge
  };
})();


/* ══════════════════════════════════════════════════════════
   DN Overlay (Delivery Note) — A5 landscape, editable, in-Scale.
   Triggered by SCALE.techPrintDone() after Save+TL upsert.
   Strategy: temporarily move the existing #pf-dn-paper element into
   the overlay body so pfPrint('dn',...) can still read it by ID and
   edits live on the real DOM (no clone-sync needed).
   ══════════════════════════════════════════════════════════ */
var _dnOvStId = 0;
function _dnShowOverlay(stId, cur, tech){
  _dnOvStId = stId;
  /* Populate pf-dn-paper using the existing helper before showing the overlay */
  /* v4.57 — turn for the DN "Số trạm" cell. st.turn was written at ASSIGN time
     and could be stale/off-by-one (bug: DN printed "1-2" while modal showed
     Turn 3). Use SCALE.getPrintTurn — the same frozen turn the TL Data row was
     written with — so DN, modal and TL Data always agree. st.turn stays as a
     last-resort fallback. */
  const turn = (function(){
    try{
      if(typeof SCALE!=='undefined' && SCALE.getPrintTurn){
        const t = SCALE.getPrintTurn(stId);
        if(t) return t;
      }
      if(typeof SCALE!=='undefined' && SCALE.getStations){
        const st = SCALE.getStations()[stId];
        return st ? (st.turn||1) : 1;
      }
    }catch(_){}
    return 1;
  })();
  const lotFull = (cur.batch && cur.tank) ? (_sanitizeLotPrefix(cur.batch)+'/'+cur.tank) : (cur.tank||'');
  const tw = tech.truckWt!=null ? parseFloat(tech.truckWt) : null;
  const gw = tech.grossWt!=null ? parseFloat(tech.grossWt) : null;
  const netWt = (tw!=null && gw!=null && !isNaN(tw) && !isNaN(gw) && gw>tw) ? (gw - tw) : null;
  try{
    pfFillFromStation({
      doNo:   cur.doNum||'',
      cust:   cur.customer||'',
      plate:  cur.plate||'',
      rmooc:  cur.rmooc||'',
      driver: cur.driver||'',
      type:   cur.type||'',
      bay:    stId+'-'+turn,
      lotFull:lotFull,
      truckWt:tw,
      grossWt:gw,
      netWt:  netWt,
      timeIn: tech.timeIn||'',
      timeOut:tech.timeOut||'',
      seal:   tech.seal||''
    });
  }catch(e){ console.warn('[DN overlay] fill failed', e); }
  /* Move pf-dn-paper element into the overlay body */
  const paper = document.getElementById('pf-dn-paper');
  const body  = document.getElementById('dnOvBody');
  if(paper && body){
    if(!paper._dnOrigParent){
      paper._dnOrigParent = paper.parentNode;
      paper._dnOrigNext   = paper.nextSibling;
      paper._dnOrigStyle  = paper.getAttribute('style')||'';
    }
    body.appendChild(paper);
    paper.style.maxWidth  = '100%';
    paper.style.margin    = '0 auto';
    paper.style.boxShadow = '0 2px 10px rgba(0,0,0,.15)';
    paper.style.background= '#fff';
  }
  document.getElementById('dnOvTitle').textContent = '⚖️ Delivery Note — Station '+stId+' · '+(cur.plate||'');
  const _dnDoneBtn = document.querySelector('#dnOvBg .dnOvDone');
  if(_dnDoneBtn) _dnDoneBtn.textContent = '✓ DONE';
  document.getElementById('dnOvBg').classList.add('on');
}
/* ── Reprint a Delivery Note straight from a TL Data row ──
   Reconstructs the station-shaped (cur, tech) objects the DN overlay expects
   from the stored TL fields, then reuses _dnShowOverlay with stId=0 so that
   clicking DONE on the overlay does NOT complete/empty any live station. */
function dnReprintFromTL(rid){
  if(typeof TL === 'undefined' || !TL.ROWS){ toast('TL Data not ready','er'); return; }
  const r = TL.ROWS[rid];
  if(!r){ toast('Row not found','er'); return; }
  /* rebuild full lot label "LPG-20YY-<lot>" using the year from the row date */
  let batch = '';
  if(r.lot){
    const yy = (String(r.date||'').split('/')[2]||'').slice(-2);
    batch = yy ? ('LPG-20'+yy+'-'+r.lot) : ('LPG-'+r.lot);
  }
  const cur = {
    doNum:    r.doNo   || '',
    customer: r.cust   || '',
    plate:    r.truck  || '',
    rmooc:    r.rmooc  || '',
    driver:   r.driver || '',
    type:     r.type   || '',
    tank:     r.ltank  || '',
    batch:    batch,
    qty:      r.cw     || ''
  };
  const blank = v => (v!=null && v!=='') ? v : null;
  const tech = {
    truckWt: blank(r.truckWt),
    grossWt: blank(r.grossWt),
    timeIn:  r.timeIn  || '',
    timeOut: r.timeOut || '',
    seal:    r.seal    || ''
  };
  try{
    _dnShowOverlay(0, cur, tech);           /* stId 0 → dnOvDone skips setEmpty */
    /* _dnShowOverlay fills via the station path (scale = "0-1", net = gross−truck),
       which is wrong for a reprint — especially a split multi-DO row whose net is the
       allocated lpgQty, not gross−truck. Overwrite every field straight from the stored
       TL row so the printed station/turn (scaleNo-turn) and net match the data. */
    if(typeof pfFillDNFromTL === 'function') pfFillDNFromTL(r);
    const t = document.getElementById('dnOvTitle');
    if(t) t.textContent = '🖨 Reprint DN — '+(r.doNo||'')+' · '+(r.truck||'');
  }catch(e){
    console.warn('[TL] reprint DN failed', e);
    toast('Could not open DN preview','er');
  }
}
/* Move pf-dn-paper back to its original spot in the DN sub-pane */
function _dnRestorePaper(){
  const paper = document.getElementById('pf-dn-paper');
  if(paper && paper._dnOrigParent){
    if(paper._dnOrigNext && paper._dnOrigNext.parentNode === paper._dnOrigParent){
      paper._dnOrigParent.insertBefore(paper, paper._dnOrigNext);
    } else {
      paper._dnOrigParent.appendChild(paper);
    }
    paper.setAttribute('style', paper._dnOrigStyle||'');
    delete paper._dnOrigParent;
    delete paper._dnOrigNext;
    delete paper._dnOrigStyle;
  }
}
/* Cancel — abandon DN flow, do NOT complete the loading turn (data already in TL) */
function dnOvClose(){
  _dnSeq = null;                               /* abort any separate-DN sequence */
  _dnRestorePaper();
  document.getElementById('dnOvBg').classList.remove('on');
  _dnOvStId = 0;
  const doneBtn = document.querySelector('#dnOvBg .dnOvDone');
  if(doneBtn) doneBtn.textContent = '✓ DONE';
}
/* Done — finalise the loading turn without further print (or after printing) */
function dnOvDone(){
  if(_dnSeq){ _dnSeqNext(); return; }          /* separate-DN mode: advance / finish */
  const stId = _dnOvStId;
  _dnRestorePaper();
  document.getElementById('dnOvBg').classList.remove('on');
  _dnOvStId = 0;
  if(stId && typeof SCALE!=='undefined' && SCALE.setEmpty){
    SCALE.setEmpty(stId);
  }
}
function dnOvPrint(){
  if(typeof pfPrint!=='function'){ toast('Print unavailable','er'); return; }
  pfPrint('dn','landscape');
  toast('🖨 Printing DN — Station '+_dnOvStId,'ok');
}
function dnOvPrint3(){
  if(typeof pfPrint3DN!=='function'){ toast('Print unavailable','er'); return; }
  pfPrint3DN();
}

/* ============================================================
   Multi-DO Delivery Note printing — merged vs separate (v4.49.4)
   ------------------------------------------------------------
   After a combined load is allocated (one TL row per DO), the operator
   chooses to print ONE merged DN (combined DO numbers + total net) or a
   SEPARATE DN for each DO (its own DO number, customer and allocated net).
   Separate mode walks the DN overlay one DO at a time, reusing PRINT; the
   DONE button advances to the next DO and completes the station turn after
   the last one. RAM-only — no Firebase writes (rows were pushed at alloc).
   ============================================================ */
let _dnSeq = null;   /* { stId, cur, tech, payloads:[...], idx } while a separate sequence runs */

function _mdoPrintChoice(stId, cur, tech, payloads){
  const n = (payloads||[]).length;
  let bg = document.getElementById('mdo-print-bg');
  if(bg) bg.remove();
  bg = document.createElement('div');
  bg.id = 'mdo-print-bg';
  bg.style.cssText = 'position:fixed;inset:0;z-index:12500;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
  const doList = (payloads||[]).map(p => (p.doNo||'?')).join(' · ');
  bg.innerHTML =
      '<div style="background:#fff;border-radius:12px;width:min(460px,94vw);padding:20px 22px;box-shadow:0 10px 36px rgba(0,0,0,.3);font-family:Barlow,system-ui,sans-serif">'
    + '<h3 style="margin:0 0 4px;font-family:\'Oswald\',sans-serif;font-size:16px;color:#0077b6;letter-spacing:.5px">🖨 Print Delivery Note</h3>'
    + '<p style="margin:0 0 14px;font-size:12.5px;color:#475569;line-height:1.45">This is a combined load of <b>'+n+' DO</b> ('+_esc(doList)+'). Print one merged note, or a separate note for each DO?</p>'
    + '<div style="display:flex;flex-direction:column;gap:10px">'
    + '<button id="mdo-print-merged" style="padding:12px;background:#f1f5f9;border:1.5px solid #cbd5e1;border-radius:8px;color:#1e293b;font-size:13.5px;font-weight:700;cursor:pointer;text-align:left">🧾 Print 1 merged DN'
    + '<span style="display:block;font-weight:400;font-size:11.5px;color:#64748b;margin-top:2px">All DO numbers and total net on one note</span></button>'
    + '<button id="mdo-print-sep" style="padding:12px;background:#2563eb;border:0;border-radius:8px;color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;text-align:left">📑 Print '+n+' separate DNs'
    + '<span style="display:block;font-weight:400;font-size:11.5px;color:#dbeafe;margin-top:2px">One note per DO, each with its own net weight</span></button>'
    + '</div>'
    + '<div style="text-align:right;margin-top:14px"><button id="mdo-print-cancel" style="padding:8px 14px;background:transparent;border:0;color:#64748b;font-size:12.5px;cursor:pointer">Cancel</button></div>'
    + '</div>';
  document.body.appendChild(bg);
  const close = ()=>{ bg.remove(); };
  bg.addEventListener('click', e=>{ if(e.target===bg) close(); });
  document.getElementById('mdo-print-merged').addEventListener('click', ()=>{ close(); _dnShowOverlay(stId, cur, tech); });
  document.getElementById('mdo-print-sep').addEventListener('click', ()=>{ close(); _dnStartSeparate(stId, cur, tech, payloads); });
  document.getElementById('mdo-print-cancel').addEventListener('click', close);
}

function _dnStartSeparate(stId, cur, tech, payloads){
  _dnSeq = { stId, cur, tech, payloads: (payloads||[]).slice(), idx: 0 };
  _dnSeqShow();
}
function _dnSeqShow(){
  if(!_dnSeq) return;
  const p = _dnSeq.payloads[_dnSeq.idx];
  const total = _dnSeq.payloads.length;
  const last = (_dnSeq.idx === total - 1);
  try{
    /* Open the overlay shell + plumbing, then fill straight from the per-DO payload. */
    _dnShowOverlay(_dnSeq.stId, _dnSeq.cur, _dnSeq.tech);
    if(typeof pfFillDNFromTL === 'function') pfFillDNFromTL(p);
  }catch(e){ console.warn('[DN seq] fill failed', e); }
  const t = document.getElementById('dnOvTitle');
  if(t) t.textContent = '🖨 DN '+(_dnSeq.idx+1)+'/'+total+' — '+(p.doNo||'')+' · '+(_dnSeq.cur.plate||'');
  const doneBtn = document.querySelector('#dnOvBg .dnOvDone');
  if(doneBtn) doneBtn.textContent = last ? '✓ DONE' : 'Next DO →';
}
/* Advance the separate-DN sequence; on the last DO, complete the station turn. */
function _dnSeqNext(){
  if(!_dnSeq) return;
  if(_dnSeq.idx < _dnSeq.payloads.length - 1){
    _dnSeq.idx++;
    _dnSeqShow();
    return;
  }
  const stId = _dnSeq.stId;
  _dnSeq = null;
  _dnRestorePaper();
  document.getElementById('dnOvBg').classList.remove('on');
  _dnOvStId = 0;
  if(stId && typeof SCALE!=='undefined' && SCALE.setEmpty) SCALE.setEmpty(stId);
}

/* ── Global wrappers for inline onclick ── */
function scRenderCtrl(){ SCALE.scRenderCtrl(); }
function scTkSelect(n){ SCALE.scTkSelect(n); }
function scToggleMode(n){ SCALE.scToggleMode(n); }

/* ============================================================
   SYNC  — cross-module coordinator (the ONLY place that writes
   across modules). Modules stay "dumb": they just report events.
   Phase 1: SCALE station status -> Today Plan row _status.
            Respects each plan row's per-row _autoSync flag
            (enforced inside TP.autoSet).
   Status map (SCALE station -> TP order):
     calling -> entered , loading -> loading , wait -> loading
     completed (DONE / setEmpty) -> done
   ============================================================ */
/* ============================================================
   v4.22.10 — WMS GI → TL Data field-sync confirm UI
   Called by WG._autoFillTlGiDate after a WMS paste produces
   at least one TL row that needs an actual change. Shows the
   before/after value for each tracked field (giDate, lpgQty,
   c3Kg, c4Kg, c3Pct, c4Pct) and lets the operator deselect
   any row before commit. Default: all rows checked.
   ============================================================ */
let _tlSyncCands = [];
function openTlSyncModal(cands){
  /* v4.56 — keep DO-upgrade-only candidates (doOnly: pick = 0 rows) even
     though they carry no field changes: the DO rename itself is the change. */
  _tlSyncCands = (cands||[]).filter(c => c && c.preview && (c.preview.hasChanges || c.upgradeDo));
  const tbody = document.getElementById('wgTlSyncBody');
  if(!tbody){ console.warn('[WG→TL Sync] modal body not found'); return; }
  if(!_tlSyncCands.length){
    try{ toast('🔄 WMS GI synced — no changes','ok'); }catch(_){}
    return;
  }
  const fmt = (v) => (v==null || v==='') ? '—' : String(v);
  const cell = (b, a) => {
    const same = String(b||'') === String(a||'');
    const cls = 'wg-tl-diff' + (same ? ' same' : '');
    const td  = same ? '' : ' class="wg-tl-cell-changed"';
    return { cls, td, b: fmt(b), a: fmt(a) };
  };
  tbody.innerHTML = _tlSyncCands.map((c, i)=>{
    const r = c.tlRow || {};
    const B = c.preview.before, A = c.preview.after;
    const cGi = cell(B.giDate, A.giDate);
    const cNw = cell(B.lpgQty, A.lpgQty);
    const cC3 = cell(B.c3Kg,  A.c3Kg);
    const cC4 = cell(B.c4Kg,  A.c4Kg);
    const cP3 = cell(B.c3Pct, A.c3Pct);
    const cP4 = cell(B.c4Pct, A.c4Pct);
    const ident = _esc(r.customer || c.wmsRow?.customer || '');
    const plate = _esc(r.truck || r.plate || c.wmsRow?.vehicle || '');
    /* v4.56 — temp-DO upgrades show "TMP → real DO"; doOnly rows get a badge
       so the operator can see this match only renames the DO (no field stamp). */
    const doCell = c.upgradeDo
      ? `<span style="color:var(--muted)">${_esc(c.tempDo||'')}</span> → <b>${_esc(c.realDo)}</b>`
        + (c.doOnly ? `<div class="sync-pm-sub">DO only (pick = 0)</div>` : '')
      : `<b>${_esc(c.realDo)}</b>`;
    return `<tr>
      <td style="text-align:center"><input type="checkbox" class="wg-tl-cb" data-i="${i}" checked></td>
      <td>${doCell}</td>
      <td>${ident}<div class="sync-pm-sub">${plate}</div></td>
      <td${cGi.td}><div class="${cGi.cls}"><span class="b4">${cGi.b}</span><span class="af">${cGi.a}</span></div></td>
      <td${cNw.td} style="text-align:right"><div class="${cNw.cls}"><span class="b4">${cNw.b}</span><span class="af">${cNw.a}</span></div></td>
      <td${cC3.td} style="text-align:right"><div class="${cC3.cls}"><span class="b4">${cC3.b}</span><span class="af">${cC3.a}</span></div></td>
      <td${cC4.td} style="text-align:right"><div class="${cC4.cls}"><span class="b4">${cC4.b}</span><span class="af">${cC4.a}</span></div></td>
      <td${cP3.td} style="text-align:right"><div class="${cP3.cls}"><span class="b4">${cP3.b}</span><span class="af">${cP3.a}</span></div></td>
      <td${cP4.td} style="text-align:right"><div class="${cP4.cls}"><span class="b4">${cP4.b}</span><span class="af">${cP4.a}</span></div></td>
    </tr>`;
  }).join('');
  document.getElementById('wgTlSyncCount').textContent = _tlSyncCands.length;
  document.getElementById('wgTlSyncModal').classList.add('on');
}
function closeTlSyncModal(){
  document.getElementById('wgTlSyncModal').classList.remove('on');
  _tlSyncCands = [];
}
/* v4 — WMS GI ↔ TL Data weight discrepancy warning. Listed when a WMS row
   matched a TL row (by DO, or by plate+driver for temp DOs) but Pick ≠ Net
   weight. Pure information — nothing is written automatically. */
function openWgMismatchModal(list){
  list = (list||[]).filter(Boolean);
  const tbody = document.getElementById('wgMismatchBody');
  if(!tbody || !list.length) return;
  tbody.innerHTML = list.map(m=>{
    const d = m.diff;
    const dCls = d > 0 ? 'color:#c5303a' : 'color:#1f6fd0';
    return `<tr>
      <td><b>${_esc(m.realDo)}</b></td>
      <td>${_esc(m.tempDo||'—')}</td>
      <td>${_esc(m.customer||'')}</td>
      <td>${_esc(m.driver||'')}</td>
      <td>${_esc(m.vehicle||'')}</td>
      <td style="text-align:right">${(m.pick||0).toLocaleString('en-US')}</td>
      <td style="text-align:right">${(m.netWt||0).toLocaleString('en-US')}</td>
      <td style="text-align:right;font-weight:700;${dCls}">${d>0?'+':''}${(d||0).toLocaleString('en-US')}</td>
    </tr>`;
  }).join('');
  document.getElementById('wgMismatchCount').textContent = list.length;
  document.getElementById('wgMismatchModal').classList.add('on');
}
function closeWgMismatchModal(){
  const m = document.getElementById('wgMismatchModal');
  if(m) m.classList.remove('on');
}
function tlSyncToggleAll(on){
  document.querySelectorAll('#wgTlSyncBody .wg-tl-cb').forEach(cb=>{ cb.checked = on; });
}
/* v4.56 — when a TL temp DO is upgraded to its official DO (match confirm OR a
   hand edit in TL Data), the SAME-DAY Today Plan order still holding that temp
   DO must be upgraded too — otherwise the Plan↔Scale status chain and Actual
   Loading lose the link. Goes through SYNC.promotePair, which renames the plan
   oid (+ DO column), relinks any in-flight SCALE station and renames remaining
   TL rows. Date guard: if the plan row carries _forDate and a TL date is given,
   they must be the same day (plans without _forDate are allowed through).
   Returns true iff a plan order was actually promoted. */
function promoteTpTempDo(tempDo, realDo, tlDateDDMMYY){
  try{
    tempDo = String(tempDo||'').trim(); realDo = String(realDo||'').trim();
    if(!tempDo || !realDo) return false;
    if(typeof isTempOid !== 'function' || !isTempOid(tempDo)) return false;
    if(typeof TP === 'undefined' || !TP.PLAN) return false;
    if(typeof SYNC === 'undefined' || !SYNC.promotePair) return false;
    const tU = tempDo.toUpperCase();
    const oid = Object.keys(TP.PLAN).find(k => String(k).toUpperCase() === tU && isTempOid(String(k)));
    if(!oid) return false;
    if(tlDateDDMMYY){
      const m = String(tlDateDDMMYY).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
      if(m){
        let yy = m[3]; if(yy.length === 2) yy = '20'+yy;
        const iso = yy+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
        const fd = String((TP.PLAN[oid]||{})._forDate||'').trim();
        if(fd && fd !== iso) return false;      /* plan order is for another day */
      }
    }
    return SYNC.promotePair(oid, realDo) === true;
  }catch(e){ console.warn('[promoteTpTempDo]', e); return false; }
}
function applyTlSyncSelected(){
  const picks = [];
  document.querySelectorAll('#wgTlSyncBody .wg-tl-cb').forEach(cb=>{
    if(cb.checked){ const i = parseInt(cb.dataset.i,10); if(_tlSyncCands[i]) picks.push(_tlSyncCands[i]); }
  });
  if(!picks.length){ try{ toast('No rows selected','er'); }catch(_){} return; }
  let done = 0;
  picks.forEach(c=>{
    try{
      let ok = false;
      /* v4 — a TL row matched via TEMP DO (plate+driver, net===pick) gets its
         temp DO upgraded to the real WMS DO before the field stamp. */
      if(c.upgradeDo && c.tempDo && c.realDo){
        /* v4.56 — same-day Today Plan order still on this temp DO → upgrade it
           too (keeps status auto-run + Actual Loading linked to the real DO).
           promotePair itself also renames TL rows; the explicit renameDoNo
           below stays as fallback when no plan order exists (idempotent). */
        try{ if(typeof promoteTpTempDo === 'function' && promoteTpTempDo(c.tempDo, c.realDo, (c.tlRow||{}).date)) ok = true; }catch(_){}
        if(typeof TL!=='undefined' && TL.renameDoNo && TL.renameDoNo(c.tempDo, c.realDo) > 0) ok = true;
      }
      /* v4.56 — doOnly candidates (pick = 0) carry opts = null: DO rename
         only, no field stamp. Quantity rows apply exactly as before. */
      if(c.opts && typeof TL!=='undefined' && TL.applyWmsSync && TL.applyWmsSync(c.rid, c.opts)) ok = true;
      if(ok) done++;
    }catch(_){}
  });
  closeTlSyncModal();
  try{ toast(done ? `🔄 Synced ${done} TL row(s) (DO · GI Date · Net Wt · C3 · C4 · %wt)` : 'No rows were applied','ok'); }catch(_){}
}

/* ============================================================
   WMS GI → DO promotion confirm UI (used by SYNC.reviewPromotions)
   Shows a checkbox table; user ticks rows to promote (default all on).
   ============================================================ */
let _promoteCands = [];
let _promoteOnClose = null;       /* v4.22.11 — chained callback after modal closes */
function _esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function openPromoteModal(cands, onClose){
  _promoteCands = cands || [];
  _promoteOnClose = (typeof onClose === 'function') ? onClose : null;
  const tbody = document.getElementById('syncPromoteBody');
  if(!tbody) return;
  tbody.innerHTML = _promoteCands.map((c, i)=>{
    const w = c.wmsRow, p = c.planRow || {};
    const net = (parseFloat(w.propane)||0) + (parseFloat(w.butane)||0);
    return `<tr>
      <td style="text-align:center"><input type="checkbox" class="sync-pm-cb" data-i="${i}" checked></td>
      <td><b>${_esc(c.oid)}</b></td>
      <td>${_esc(w.delivId)}</td>
      <td>${_esc(p.customer||'')}<div class="sync-pm-sub">WMS: ${_esc(w.customer||'')}</div></td>
      <td>${_esc(p.plate||w.vehicle||'')}</td>
      <td>${_esc(p.driver||w.driver||'')}</td>
      <td style="text-align:right">${_esc(w.pickKg)}</td>
      <td style="text-align:right">${net}</td>
    </tr>`;
  }).join('');
  document.getElementById('syncPromoteCount').textContent = _promoteCands.length;
  document.getElementById('syncPromoteModal').classList.add('on');
}
function closePromoteModal(){
  document.getElementById('syncPromoteModal').classList.remove('on');
  _promoteCands = [];
  /* v4.22.11 — fire chained callback (e.g. WG → TL sync) on close. Runs
     on both Apply and Cancel paths so any TL rows that already had real
     DOs (no promotion needed) still get a chance to sync. */
  const cb = _promoteOnClose; _promoteOnClose = null;
  if(typeof cb === 'function'){ try{ cb(); }catch(e){ console.warn('[promote onClose]', e); } }
}
function syncPromoteToggleAll(on){
  document.querySelectorAll('#syncPromoteBody .sync-pm-cb').forEach(cb=>{ cb.checked = on; });
}
function applyPromoteSelected(){
  const picks = [];
  document.querySelectorAll('#syncPromoteBody .sync-pm-cb').forEach(cb=>{
    if(cb.checked){ const i = parseInt(cb.dataset.i,10); if(_promoteCands[i]) picks.push(_promoteCands[i]); }
  });
  if(!picks.length){ toast('No rows selected to match','er'); return; }
  let done = 0;
  picks.forEach(c=>{ if(typeof SYNC!=='undefined' && SYNC.promotePair(c.oid, String(c.wmsRow.delivId||'').trim())) done++; });
  closePromoteModal();
  toast(done ? `Replaced ${done} temp DO with real DO` : 'No rows matched','ok');
}

