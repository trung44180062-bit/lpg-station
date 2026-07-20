/* ============================================================
 * PLAN  —  plan.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 9951–12568   (~2618 dòng)
 * Global xuất ra : window.PLAN
 * Phase tách     : P5C
 * Phụ thuộc      : sync, ct, pp, wgcheck, fcheck, Tabulator
 * Khởi tạo (boot): PLAN qua API; init trong boot
 * ------------------------------------------------------------
 * MÔ TẢ: ★ LỚN NHẤT (~2.6k dòng). Module PLAN (Today/Tomorrow) + object API (12310). Factory dùng chung tạo 2 instance TP/TMR; 2 chế độ Table(Tabulator)/Ledger. GỢI Ý tách con sau: plan-core / plan-table / plan-ledger / plan-status.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   TP.*, TMR.* (qua API): init, buildTable, renderLedger, planRows, rebuildTableData, applyView, toggleView
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module PLAN từ dòng 9951 đến 12568.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.PLAN).
 *   3) node --check plan.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5C]: dán thân module PLAN (V4-54 dòng 9951–12568) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 9940–12568 ===== */
function _makePlanModule(opts){
  /* destructure once for readability (these are CONSTANT for the lifetime
     of the instance, so it is safe to capture them in closures) */
  const ID      = opts.idPrefix;     /* DOM id prefix: "tp" or "tmr" */
  const FBN     = opts.fbNode;       /* Firebase node: "plan_today_" or "plan_tomorrow_" */
  const VERK    = opts.versionKey;   /* version counter node */
  const LSK     = opts.lsKey;        /* localStorage cache key */
  const PERMK   = opts.permKey;      /* canWrite/logAudit area key */
  const UILABEL = opts.uiLabel;      /* user-facing label */
  const DEFD    = opts.defaultDate;  /* () => ISO date string */
  /* live state */
  const PLAN = {};                 // keyed by _oid: { _oid, doNum, customer, plate, ... }
  let table = null;
  let planDate = DEFD();           // load date (instance-default — today or tomorrow)
  /* Display filter: a SET of plan dates the user has clicked to show. EMPTY = show
     ALL dates (the new default). planDate above stays as the module's default for
     paste seeding / temp-oid / legacy-row fallback — it is NOT the view filter. */
  const _dateSel = new Set();
  let autoSync = true;             // toggle for auto-update of status / actual
  let _suppressEcho = 0;           // suppress own Firebase echoes
  let _pendingPaste = null;        // { rows, mode } awaiting confirmation
  let _pendingDiff = null;         // { changes, mode } awaiting Apply
  let _pasteDateForBatch = '';     // forDate of the rows currently being pasted
  let _versions = { plan:0 };      // local idea of the area version
  const LS_KEY = LSK; // separate cache key per area (bandwidth-saving)

  /* ── v4.35.0 Customer Ledger state (RAM + one localStorage pref) ── */
  const G = (ID === 'tp') ? 'TP' : 'TMR';        // global name for onclick strings
  const PANE = (ID === 'tp') ? 'sub-today' : 'sub-tmr';
  let viewMode = 'ledger';   /* v4: LUÔN mở mặc định Ledger cho TP & TMR (bỏ qua localStorage cũ có thể = 'table') */
  let _ledgerFilter = 'all';                     // all | pending | loading | done | cancel
  const _grpOpen = {};                           // customer → explicit open/close; undefined = auto

  /* -------- localStorage cache (versioned blob, separate per area) -------- */
  function loadCache(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj || obj.schema!==1) return null;
      return obj;
    }catch(e){ return null; }
  }
  function saveCache(){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify({ schema:1, savedAt:Date.now(), versions:_versions, data:PLAN }));
    }catch(e){ /* quota — ignore */ }
  }
  /* bump the area version into a payload + persist cache, just before a FB write */
  function bumpVersion(payload){
    _versions.plan = (_versions.plan||0) + 1;
    payload[VERK] = _versions.plan;
    saveCache();
  }

  /* -------- helpers -------- */
  function isoToday(){
    const d = new Date(), p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }
  function isoLabel(iso){
    if(!iso) return '—';
    const p = iso.split('-');
    return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  }
  /* Add N days to an ISO date string (YYYY-MM-DD), returning a new ISO string.
     Uses local time so the date arithmetic matches what the user sees. */
  function _addDaysIso(iso, days){
    const p = String(iso||'').split('-').map(Number);
    if(p.length !== 3) return iso;
    const d = new Date(p[0], p[1]-1, p[2]);
    d.setDate(d.getDate() + (days|0));
    const pad = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  }
  function isRealDO(v){
    return /^\d{7,}$/.test(String(v||'').trim());
  }
  /* 3-letter uppercase customer prefix (letters only; padded with X if short). */
  function tempPrefix(customer){
    const s = String(customer||'').replace(/[^A-Za-z]/g,'').toUpperCase();
    return (s.slice(0,3) || 'XXX').padEnd(3,'X');
  }
  /* Temp DO id = <3-letter customer prefix> + <YYMMDD> + <per-customer seq, 2-digit>.
     e.g. KNHC + 2026-06-02 + 1st order  →  KNH26060201 */
  function makeTempOid(forDate, seq, customer){
    const ds = (forDate||isoToday()).replaceAll('-','');   /* YYYYMMDD */
    const yymmdd = ds.slice(2);                            /* YYMMDD   */
    return tempPrefix(customer) + yymmdd + String(seq).padStart(2,'0');
  }
  /* positional fingerprint — used to match new/old rows on re-paste.
     Customer name normalized to first 8 alpha-num chars (matches v406 behavior). */
  function posFingerprint(row, forDate){
    const pl = String(row.plate||'').replace(/[-.\s]/g,'').toUpperCase();
    const cu = String(row.customer||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,8);
    const dr = String(row.driver||'').replace(/\s+/g,'').toLowerCase();
    const no = String(row.no||'0');
    const fd = forDate || row._forDate || planDate;
    return `${cu}|${dr}|${pl}|${no}|${fd}`;
  }
  /* Internal, NON-DO key for planning/summary rows (no real DO, no "after loading").
     Not a real DO and not a temp DO, so it never appears as a temp DO and is never
     written into the DO column — it only gives the row a stable Firebase key. */
  let _rowKeySeq = 0;
  function makeRowKey(forDate){
    const ds = (forDate||isoToday()).replaceAll('-','').slice(2);   /* YYMMDD */
    _rowKeySeq++;
    return 'PLN-' + ds + '-' + Date.now().toString(36) + _rowKeySeq.toString(36);
  }
  /* The single source-of-truth identifier resolver:
     - keep an existing _oid (sticky);
     - real DO (>=7 digits) → DO + '-YYMMDD' so the same real DO sold on
       different _forDate values gets distinct Firebase keys (fixes the
       cross-date overwrite bug). The DO column itself still carries the
       plain real DO — only the _oid (Firebase key) bears the date suffix;
     - DO column contains "after loading" (sales-approved) → generate a temp DO;
     - otherwise (planning/summary row) → internal non-DO key, NO temp DO.
     Suffix format note: the dash makes isRealDO() reject the suffixed
     value (it requires pure digits), so the suffixed _oid is never
     mistaken for a real DO downstream. */
  function resolveOid(row, forDate, seqMap){
    if(row._oid) return row._oid;
    const doN = String(row.doNum||'').trim();
    if(isRealDO(doN)){
      const ymd = (forDate||planDate).replaceAll('-','').slice(2);   /* YYMMDD */
      return doN + '-' + ymd;
    }
    if(/after\s*loading/i.test(doN)){
      const pfx = tempPrefix(row.customer);
      seqMap[pfx] = (seqMap[pfx]||0) + 1;
      return makeTempOid(forDate, seqMap[pfx], row.customer);
    }
    return makeRowKey(forDate);
  }

  /* -------- TSV parser (RFC 4180 with quoted multiline support) -------- */
  function parseTSV(text){
    const rows = [];
    let row = [], field = '', inQuote = false;
    const s = String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    for(let i=0; i<s.length; i++){
      const ch = s[i];
      if(inQuote){
        if(ch === '"'){
          if(i+1 < s.length && s[i+1] === '"'){ field += '"'; i++; }
          else inQuote = false;
        } else field += ch;
      } else {
        if(ch === '"' && field === '') inQuote = true;
        else if(ch === '\t'){ row.push(field); field = ''; }
        else if(ch === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
        else field += ch;
      }
    }
    if(field || row.length){ row.push(field); rows.push(row); }
    return rows;
  }

  /* -------- Plan-sheet parser (v406 port, English comments only) --------
     TABLE BOUNDARY RULE: col[3] is the per-customer row-no (1..99).
     Valid row: col[3] is a positive integer 1..99.
     Table END signal: first row where col[3] is empty AND col[7] has a numeric
     value (the grand-total row appended after the last vehicle row).
     FILL-DOWN: col[0]=customer, col[1]=contractQty, col[2]=type;
                col[7]=qty, col[8]=tolerance — reset whenever col[3] resets to 1.
     SUB-GROUP: col[3] resetting to 1 within the same customer = new batch. */
  function parsePlanSheet(rows){
    /* skip optional header within first 5 rows */
    let startRow = 2;
    for(let i=0; i<Math.min(rows.length,5); i++){
      const j = rows[i].join(' ').toLowerCase();
      if(j.includes('plate') || j.includes('driver') || j.includes('allow')){
        startRow = i + 1; break;
      }
    }
    const out = [];
    const skipped = [];                                          /* v4.49.3 — rows missing "No" but carrying real vehicle data */
    let lastCust='', lastContractQty='', lastType='', lastQty='', lastTol='';
    let lastNote='';                                              /* v4.22.17 — merged-note fill-down */
    let subGroupIdx = 0, prevNo = 0, lastCustForSubgroup = '';
    let foundValidRow = false;
    /* v4.55.4 — global paste-order index. Stamped on every emitted row in the
       exact order it appears in the pasted/Excel sheet, so TABLE VIEW can keep
       that order verbatim (NOT customer-grouped, NOT no-sorted) for 1:1 visual
       cross-reference against the source file. */
    let gseq = 0;

    for(let i=startRow; i<rows.length; i++){
      const r = rows[i].map(c => (c||'').trim());
      const noRaw = r[3] || '';
      const col7  = r[7] || '';
      const noInt = parseInt(noRaw, 10);
      const noValid = noRaw && !isNaN(noInt) && noInt >= 1 && noInt <= 99;
      /* v4.49.3 — a row with plate/rmooc/driver/DO is a real vehicle row,
         never the grand-total line. Used both to avoid a false table-end
         break and to flag blank-No rows for confirmation instead of dropping. */
      const looksData = !!(r[4] || r[5] || r[6] || r[11]);

      /* table-end detection — a numeric col7 with no vehicle data is the total line */
      if(foundValidRow && !noRaw && col7 && !isNaN(parseFloat(col7)) && !looksData) break;
      if(!noValid){
        if(looksData){
          prevNo += 1;                                           /* keep suggested numbers unique & increasing */
          skipped.push({
            rowIdx: i, suggestedNo: prevNo,
            customer: r[0] || lastCust || '',
            plate: r[4]||'', rmooc: r[5]||'', driver: r[6]||'',
            qty: r[7]||'', doNum: String(r[11]||'').trim()
          });
        }
        continue;
      }
      foundValidRow = true;

      /* fill-down header fields */
      if(r[0]) lastCust = r[0];
      if(r[1]) lastContractQty = r[1];
      if(r[2]) lastType = r[2];

      /* sub-group detection */
      if(lastCust !== lastCustForSubgroup){
        subGroupIdx = 0; prevNo = 0; lastQty=''; lastTol='';
        lastNote='';                                              /* v4.22.17 — reset note on customer change */
        lastCustForSubgroup = lastCust;
      }
      if(noInt === 1 && prevNo > 1){ subGroupIdx++; lastQty=''; lastTol=''; lastNote=''; }
      prevNo = noInt;

      if(r[7]) lastQty = r[7];
      if(r[8]) lastTol = r[8];
      /* v4.22.17 — Note fill-down. Excel often merges the note cell across
         multiple plate rows for the same customer/sub-group; when the paste
         is split into TSV, only the first row carries the note text and
         subsequent rows have an empty r[12]. Mirror the lastCust pattern:
         remember the most recent non-empty note and reuse it on rows where
         r[12] is empty. Reset on customer change AND sub-group reset above
         so a note from one customer's block can never leak into the next. */
      if(r[12]) lastNote = r[12];

      const gateRaw = (r[9]||'').toUpperCase().replace(/\s+/g,'');
      const loadRaw = (r[10]||'').toUpperCase().replace(/\s+/g,'');

      out.push({
        no:          noRaw,
        customer:    lastCust,
        contractQty: lastContractQty,
        type:        lastType,
        plate:       r[4]  || '',
        rmooc:       r[5]  || '',
        driver:      r[6]  || '',
        qty:         r[7]  || lastQty,
        tolerance:   r[8]  || lastTol,
        allowGate:   gateRaw === 'OK' ? 'OK' : 'NO',
        allowLoad:   loadRaw === 'OK' ? 'OK' : 'NO',
        doNum:       cleanDO(r[11]||''),                          /* strip WMS leading zeros (V406 parity) */
        note:        r[12] || lastNote,                            /* v4.22.17 — fill-down */
        _subGroup:   subGroupIdx,
        _seq:        gseq++,                                       /* v4.55.4 — paste/Excel source order */
        _status:     '',
        _actualQty:  '',
        _autoSync:   true,                                         /* v4.59 — auto-sync is ALWAYS the default */
        _forDate:    planDate
      });
    }
    return { rows: out, skipped };
  }

  /* -------- Diff computation --------
     Compares a parsed paste against the current PLAN by positional fingerprint.
     For 'replace' mode: every old row that has no positional match becomes a removal,
                        every matched row turns into a field-by-field change (oid kept),
                        every unmatched new row is an add (gets a fresh oid).
     For 'update' mode:  same matching but unmatched OLD rows are NOT removed —
                        they stay as-is. Unmatched NEW rows are added. */
  const COMPARE_FIELDS = ['no','customer','contractQty','type','plate','rmooc','driver',
                          'qty','tolerance','allowGate','allowLoad','doNum','note'];

  function rowFieldChanged(oldRow, newRow){
    for(const f of COMPARE_FIELDS){
      if(String(oldRow[f]||'').trim() !== String(newRow[f]||'').trim()) return true;
    }
    return false;
  }
  function fieldDiffs(oldRow, newRow){
    const out = [];
    for(const f of COMPARE_FIELDS){
      const ov = String(oldRow[f]||'').trim();
      const nv = String(newRow[f]||'').trim();
      if(ov !== nv) out.push({field:f, old:ov, new:nv});
    }
    return out;
  }

  function computeDiff(newRows, mode, forDate){
    /* v4.22.2 — 3-pass matching to survive sales re-paste edge cases:
       PASS 1: real DO equality — strongest identity.
       PASS 2: plate + driver + customer (positionless) — survives sales
               inserting a new customer in the middle of the list, which
               used to shift `no` and break the old position fingerprint.
       PASS 3: full position fingerprint (legacy behavior) — fallback for
               planning rows with no clear identity.
       Each pass marks both sides as consumed so the next pass can't double-
       match. After all passes:
         - Unmatched new rows → ADDED (fresh oid via resolveOid).
         - Unmatched old rows → REMOVED.
         - Matched pairs → CHANGED if any field differs, else UNCHANGED.
       Special migrations on matched pairs:
         (a) old._oid is TMP, new has real DO → migrate _oid to real DO.
         (b) old has real DO, new shows "After loading" / non-real DO →
             KEEP old real DO + _oid (sales sheet hasn't been updated to
             reflect the WMS GI promotion that already happened — do NOT
             demote the row).
         (c) _oid still TMP and no real DO came in → write the temp _oid
             into the DO column so it shows directly. */
    const oldOnDate = Object.values(PLAN).filter(r => (r._forDate || planDate) === forDate);
    const matchedOldOids = new Set();
    const matchedNewIdx  = new Set();
    const seqMap = _tempSeqMap(forDate);
    const pairs = [];   /* [{ or, nr }] */

    /* PASS 1 — real DO equality */
    const oldByDO = new Map();
    oldOnDate.forEach(or => {
      const d = String(or.doNum||'').trim();
      if(isRealDO(d) && !oldByDO.has(d)) oldByDO.set(d, or);
    });
    newRows.forEach((nr, ni) => {
      const d = String(nr.doNum||'').trim();
      if(!isRealDO(d)) return;
      const or = oldByDO.get(d);
      if(!or || matchedOldOids.has(or._oid)) return;
      pairs.push({ or, nr });
      matchedOldOids.add(or._oid);
      matchedNewIdx.add(ni);
      oldByDO.delete(d);
    });

    /* PASS 2 — identity (customer + driver + plate), positionless */
    const ident = r => {
      const pl = String(r.plate||'').replace(/[-.\s]/g,'').toUpperCase();
      const cu = String(r.customer||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
      const dr = String(r.driver||'').replace(/\s+/g,'').toLowerCase();
      if(!pl || !cu) return '';
      return cu + '|' + dr + '|' + pl;
    };
    const oldByIdent = new Map();
    oldOnDate.forEach(or => {
      if(matchedOldOids.has(or._oid)) return;
      const k = ident(or);
      if(k && !oldByIdent.has(k)) oldByIdent.set(k, or);
    });
    newRows.forEach((nr, ni) => {
      if(matchedNewIdx.has(ni)) return;
      const k = ident(nr);
      if(!k) return;
      const or = oldByIdent.get(k);
      if(!or || matchedOldOids.has(or._oid)) return;
      pairs.push({ or, nr });
      matchedOldOids.add(or._oid);
      matchedNewIdx.add(ni);
      oldByIdent.delete(k);
    });

    /* PASS 3 — full position fingerprint (legacy) */
    const oldByFp = new Map();
    oldOnDate.forEach(or => {
      if(matchedOldOids.has(or._oid)) return;
      const fp = posFingerprint(or, forDate);
      if(fp && !oldByFp.has(fp)) oldByFp.set(fp, or);
    });
    newRows.forEach((nr, ni) => {
      if(matchedNewIdx.has(ni)) return;
      const fp = posFingerprint(nr, forDate);
      if(!fp) return;
      const or = oldByFp.get(fp);
      if(!or || matchedOldOids.has(or._oid)) return;
      pairs.push({ or, nr });
      matchedOldOids.add(or._oid);
      matchedNewIdx.add(ni);
      oldByFp.delete(fp);
    });

    /* Apply matched pairs — preserve oid/status/actual, handle DO migrations. */
    const added = [], removed = [], changed = [], unchanged = [];
    pairs.forEach(({ or, nr }) => {
      nr._oid       = or._oid;
      nr._status    = or._status || '';
      nr._actualQty = or._actualQty || '';
      /* v4.59 — carry the per-row auto flag through the re-paste. Before this,
         a matched row whose _oid changed (TMP → real DO) was written as a FULL
         node from `nr` (which had no _autoSync), silently dropping a manual
         lock / cancel override. Default stays AUTO (true). */
      nr._autoSync  = (or._autoSync === false) ? false : true;
      nr._forDate   = forDate;
      const newDO = String(nr.doNum||'').trim();
      const oldDO = String(or.doNum||'').trim();
      /* (a) TMP → real DO migration. */
      if(isRealDO(newDO) && !isRealDO(or._oid) && isTempOid(or._oid)){
        const ymd = (forDate||planDate).replaceAll('-','').slice(2);   /* YYMMDD */
        nr._oid = newDO + '-' + ymd;
      }
      /* (b) v4.22.2 — REAL → "After loading" demotion guard. When the old
         row carries a real DO (already promoted from WMS GI) but the new
         sales paste regressed to "after loading" or blank, KEEP the real
         DO. Sales sheet just hasn't caught up with the WMS GI promotion
         that already happened — losing the real DO here would force a
         re-promotion next paste. */
      if(isRealDO(oldDO) && !isRealDO(newDO)){
        nr.doNum = or.doNum;
      }
      /* (c) Temp _oid carryover when no real DO came in. */
      if(isTempOid(String(nr._oid||'')) && !isRealDO(String(nr.doNum||'').trim())){
        nr.doNum = nr._oid;
      }
      const diffs = fieldDiffs(or, nr);
      if(diffs.length) changed.push({ old: or, new: nr, diffs });
      else unchanged.push({ old: or, new: nr });
    });

    /* Unmatched new rows → ADDED with fresh oid. */
    newRows.forEach((nr, ni) => {
      if(matchedNewIdx.has(ni)) return;
      nr._oid = resolveOid(nr, forDate, seqMap);
      nr._forDate = forDate;
      nr._status = nr._status || '';
      nr._autoSync = true;               /* v4.59 — new rows are ALWAYS auto */
      if(isTempOid(String(nr._oid||''))){
        nr.doNum = nr._oid;
      }
      added.push(nr);
    });

    /* Unmatched old rows → REMOVED. */
    oldOnDate.forEach(or => {
      if(!matchedOldOids.has(or._oid)) removed.push(or);
    });

    const duplicates = _detectCrossDateDuplicates(added, forDate);
    return { added, removed, changed, unchanged, duplicates };
  }
  /* Cross-date duplicate real-DO scan — shared by computeDiff and
     computeReplaceWipe. Principle from operations: 1 real DO = 1 order.
     If a row being added carries a real DO that already exists in PLAN on a
     DIFFERENT _forDate, surface it as a soft warning. The new -YYMMDD suffix
     on _oid means both rows can safely coexist in Firebase (distinct keys),
     so this is a heads-up, NOT a blocker. The operator decides whether to
     keep both rows (e.g. order rolled forward after cancellation) or cancel
     and clean up the older entry first.
     Only real DOs are scanned (temp DOs already embed the date in their id,
     so they can't collide cross-date). */
  function _detectCrossDateDuplicates(addedRows, forDate){
    const dups = [];
    if(!addedRows || !addedRows.length) return dups;
    addedRows.forEach(nr=>{
      const newDO = String(nr.doNum||'').trim();
      if(!isRealDO(newDO)) return;
      Object.values(PLAN).forEach(or=>{
        if(or._oid === nr._oid) return;        /* same row (shouldn't happen for added, defensive) */
        const orDO   = String(or.doNum||'').trim();
        const orDate = or._forDate || planDate;
        if(orDO === newDO && orDate !== forDate){
          dups.push({newRow:nr, existingRow:or, existingDate:orDate});
        }
      });
    });
    return dups;
  }
  /* True-wipe builder for Replace All mode. Unlike computeDiff, this does NOT
     attempt to match rows, preserve _status/_actualQty, or carry oids forward.
     It simply removes every row currently on the given _forDate and adds every
     pasted row as brand-new. Operational state (status, actual) on existing
     rows is intentionally discarded — that is what "Replace All (Wipe)" means.
     Rows on OTHER dates are untouched. Result has the same shape as computeDiff
     so applyDiff / showDiff can render it unchanged. */
  function computeReplaceWipe(newRows, forDate){
    const removed = Object.values(PLAN).filter(r => (r._forDate || planDate) === forDate);
    const seqMap = _tempSeqMap(forDate);
    const added = newRows.map(nr => {
      nr._oid = resolveOid(nr, forDate, seqMap);
      nr._forDate = forDate;
      nr._status = '';
      nr._actualQty = '';
      nr._autoSync = true;               /* v4.59 — wipe restores the AUTO default */
      if(isTempOid(String(nr._oid||''))){
        nr.doNum = nr._oid;
      }
      return nr;
    });
    const duplicates = _detectCrossDateDuplicates(added, forDate);
    return { added, removed, changed: [], unchanged: [], duplicates };
  }
  /* find the highest TMP sequence already in PLAN for the given forDate
     so generated temp oids don't collide on repeated pastes */
  /* Build {prefix: maxSeq} from existing temp ids on this date so re-paste /
     re-run continues each customer's counter instead of colliding. New format
     only (ABC + YYMMDD + seq); the seq is namespaced by the visible 3-letter
     prefix, which guarantees unique Firebase keys even if two customers share it. */
  function _tempSeqMap(forDate){
    const ds = (forDate||planDate).replaceAll('-','');
    const yymmdd = ds.slice(2);
    const map = {};
    Object.keys(PLAN).forEach(k=>{
      const m = /^([A-Z]{3})(\d{6})(\d{1,})$/.exec(String(k));
      if(m && m[2] === yymmdd){
        const n = parseInt(m[3], 10);
        if(!isNaN(n) && n > (map[m[1]]||0)) map[m[1]] = n;
      }
    });
    return map;
  }

  /* -------- Apply (per-field delta writes) -------- */
  function applyDiff(diff, mode, reason){
    if(!canWrite(PERMK)){ toast('You do not have permission to edit '+UILABEL,'er'); return; }
    if(!FB_DB){ toast('Offline — Firebase not connected','er'); return; }
    const payload = {};
    let writes = 0;

    /* removals */
    diff.removed.forEach(or=>{
      delete PLAN[or._oid];
      payload[`${FBN}${or._oid}`] = null;
      writes++;
    });

    /* additions — write full row at once (it's brand new, no point in deltas) */
    diff.added.forEach(nr=>{
      PLAN[nr._oid] = sanitizeForStorage(nr);
      payload[`${FBN}${nr._oid}`] = sanitizeForStorage(nr);
      writes++;
    });

    /* field-level changes — only touched fields go up */
    diff.changed.forEach(c=>{
      /* if oid changed (e.g. TMP → real DO), we must move the node */
      const oldOid = c.old._oid;
      const newOid = c.new._oid;
      if(oldOid !== newOid){
        delete PLAN[oldOid];
        payload[`${FBN}${oldOid}`] = null;
        PLAN[newOid] = sanitizeForStorage(c.new);
        payload[`${FBN}${newOid}`] = sanitizeForStorage(c.new);
        writes++;
      } else {
        const row = PLAN[oldOid] || (PLAN[oldOid] = sanitizeForStorage(c.old));
        c.diffs.forEach(d=>{
          row[d.field] = d.new;
          payload[`${FBN}${oldOid}/${d.field}`] = d.new;
          writes++;
        });
        /* stamp last-edit */
        row.lastBy = CURRENT_USER.name;
        row.lastAt = Date.now();
        payload[`${FBN}${oldOid}/lastBy`] = CURRENT_USER.name;
        payload[`${FBN}${oldOid}/lastAt`] = Date.now();
      }
    });

    /* v4.55.4 — keep paste/Excel order (_seq) in sync for EVERY current row,
       even when only the order changed and no other field differs. _seq is not
       in COMPARE_FIELDS (so it never shows up as a user-facing "changed" field
       in the diff modal), but it must still be written so TABLE VIEW mirrors
       the latest pasted order. Added rows already carry _seq via their full
       write above; here we cover same-oid changed rows and unchanged rows. */
    const _stampSeq = (oid, seq)=>{
      if(seq === undefined || seq === null) return;
      const row = PLAN[oid];
      if(!row || row._seq === seq) return;
      row._seq = seq;
      payload[`${FBN}${oid}/_seq`] = seq;
      writes++;
    };
    diff.changed.forEach(c=>{ if(c.old._oid === c.new._oid) _stampSeq(c.new._oid, c.new._seq); });
    (diff.unchanged||[]).forEach(u=>{ _stampSeq(u.new._oid, u.new._seq); });

    if(!writes){ toast('No changes to write','ok'); return; }

    bumpVersion(payload);
    _suppressEcho++;
    FB_DB.ref().update(payload)
      .then(()=>{
        toast(`${UILABEL} ${reason}: ${diff.added.length}+ / ${diff.removed.length}- / ${diff.changed.length}~`, 'ok');
      })
      .catch(e=>{ console.error('plan push', e); toast(UILABEL+': Firebase write failed','er'); })
      .finally(()=>{ setTimeout(()=>{ _suppressEcho--; }, 600); });

    if(table) rebuildTableData();
    refreshCounts();
    refreshBadge();
  }

  /* strip runtime-only props before sending to Firebase */
  function sanitizeForStorage(r){
    const out = {};
    Object.keys(r).forEach(k=>{
      if(k.startsWith('__')) return;        /* skip internal markers */
      if(r[k] === undefined) return;
      out[k] = r[k];
    });
    return out;
  }

  /* -------- Single-cell edit (Tabulator cellEdited handler) -------- */
  function editCellField(oid, field, value){
    if(!canWrite(PERMK)){ toast('You do not have permission','er'); return; }
    if(!FB_DB){ toast('Offline — Firebase not connected','er'); return; }
    const row = PLAN[oid];
    if(!row) return;
    /* v4.56 — DO values typed/pasted from WMS carry leading zeros
       ("0086687802" → "86687802"). Strip them on every DO-carrying edit;
       cleanDO leaves temp DOs / non-DO text unchanged. */
    let _doCleaned = false;
    if((field === 'doNum' || field === '_oid') && typeof cleanDO === 'function'){
      const _c = cleanDO(String(value==null?'':value));
      if(_c !== value){ value = _c; _doCleaned = true; }
    }
    /* special-case: editing the _oid (DO Var) column → rename the node */
    if(field === '_oid'){
      const newOid = String(value||'').trim();
      if(!newOid){ toast('Order ID cannot be empty','er'); rebuildTableData(); return; }
      if(newOid === oid) return;
      if(PLAN[newOid]){ toast('Order ID already exists: '+newOid,'er'); rebuildTableData(); return; }
      if(renameOid(oid, newOid)) toast('Order ID renamed: '+oid+' → '+newOid,'ok');
      else { toast('Rename failed','er'); rebuildTableData(); }
      return;
    }
    /* special-case: editing the DO column on a TEMP order.
       The temp DO IS the order identity, so the edit must migrate _oid too.
       - new value empty → ignore (keep current temp DO)
       - new value already used by another order → reject
       - otherwise rename _oid to the new value and mirror it into doNum */
    if(field === 'doNum' && isTempOid(String(oid))){
      const newDo = String(value||'').trim();
      if(!newDo){ toast('DO cannot be empty','er'); rebuildTableData(); return; }
      if(newDo === oid) return;
      if(PLAN[newDo]){ toast('DO already exists: '+newDo,'er'); rebuildTableData(); return; }
      if(renameOid(oid, newDo, { writeDoNum:true })) toast('DO renamed: '+oid+' → '+newDo,'ok');
      else { toast('DO rename failed','er'); rebuildTableData(); }
      return;
    }
    row[field] = value;
    row.lastBy = CURRENT_USER.name;
    row.lastAt = Date.now();
    const payload = {};
    payload[`${FBN}${oid}/${field}`] = value;
    payload[`${FBN}${oid}/lastBy`] = CURRENT_USER.name;
    payload[`${FBN}${oid}/lastAt`] = Date.now();
    bumpVersion(payload);
    _suppressEcho++;
    FB_DB.ref().update(payload)
      .then(()=>{})
      .catch(e=>{ console.error('plan edit', e); toast('Edit write failed','er'); })
      .finally(()=>setTimeout(()=>{_suppressEcho--;}, 600));
    /* v4.56 — the cell keeps showing the raw typed text (with leading zeros)
       until the next redraw; force one so the operator sees the cleaned DO. */
    if(_doCleaned && table) rebuildTableData();
    refreshCounts();
  }

  /* -------- Auto-sync gate (PER-ROW) --------
     Each plan row carries its own _autoSync flag (default ON / true).
     When _autoSync !== false (AUTO mode) the row's _status / _actualQty are PURELY
     COMPUTED at render time from station state and TL Data — NEVER persisted to
     Firebase. autoSet() therefore does no I/O; it just nudges the table so the
     computed value gets re-rendered. This is the core Spark-saver.
     When _autoSync === false (MANUAL mode), external callers are refused; the
     operator drives both fields by hand and those edits go through editCellField
     (which writes to Firebase, so other machines see the override). */
  function autoSet(oid, field, value){
    const row = PLAN[oid];
    if(!row) return false;
    if(row._autoSync === false) return false;          /* per-row manual lock */
    if(field !== '_status' && field !== '_actualQty') return false;
    /* RAM-only: just trigger a re-render so the computed status reflects the new state.
       We deliberately do NOT mutate row._status — that value is virtual in AUTO mode. */
    if(table){
      try{
        const r = table.getRow(oid);
        if(r){ r.reformat(); rowFmt(r); }
      }catch(_){}
    }
    refreshCounts();
    return true;
  }

  /* Flip the per-row auto-sync flag.
     - MANUAL → AUTO: wipe stored _status and _actualQty from Firebase so all
       machines drop the override; status reverts to computed.
     - AUTO   → MANUAL: snapshot the current computed status into Firebase so the
       row keeps that value when the operator edits it from a known baseline. */
  function toggleRowSync(oid){
    const row = PLAN[oid];
    if(!row) return;
    if(!FB_DB){ toast('Offline — Firebase not connected','er'); return; }
    if(!canWrite(PERMK)){ toast('You do not have permission','er'); return; }
    const goingAuto = (row._autoSync === false);
    const payload   = {};
    const now       = Date.now();
    if(goingAuto){
      /* Going AUTO — broadcast the wipe so peers also drop their stored override. */
      payload[`${FBN}${oid}/_autoSync`] = true;
      payload[`${FBN}${oid}/_status`]   = null;
      payload[`${FBN}${oid}/_actualQty`] = null;
      row._autoSync  = true;
      row._status    = '';
      row._actualQty = '';
    } else {
      /* Going MANUAL — snapshot whatever AUTO was showing as the starting point. */
      const snap = computeStatusFromState(row);
      payload[`${FBN}${oid}/_autoSync`] = false;
      payload[`${FBN}${oid}/_status`]   = snap;
      row._autoSync = false;
      row._status   = snap;
    }
    payload[`${FBN}${oid}/lastBy`] = CURRENT_USER.name;
    payload[`${FBN}${oid}/lastAt`] = now;
    row.lastBy = CURRENT_USER.name;
    row.lastAt = now;
    bumpVersion(payload);
    _suppressEcho++;
    FB_DB.ref().update(payload)
      .then(()=>{ try{ logAudit(PERMK + ':autoSync', oid, '_autoSync', !goingAuto, goingAuto, goingAuto?'auto on':'auto off'); }catch(_){} })
      .catch(e=>{ console.error('plan toggleRowSync', e); toast('Toggle failed','er'); })
      .finally(()=>setTimeout(()=>{ _suppressEcho--; }, 600));
    setTimeout(()=>{
      if(table){
        try{ const r = table.getRow(oid); if(r){ r.reformat(); rowFmt(r); } }catch(_){}
      }
      refreshCounts();
      try{ renderLedger(); }catch(_){}
    }, 30);
    toast('Row '+(row.plate||oid)+': Auto-sync '+(goingAuto?'ON':'OFF (manual)'), 'ok');
  }

  /* v4.59 — CANCEL from AUTO mode, one click.
     Operators must be able to cancel an order without first hunting for the
     AUTO checkbox. This flips the row to MANUAL and stores the given status
     (always 'cancel' today) in ONE atomic Firebase write. The current computed
     Actual is snapshotted too, so a partially-loaded row keeps its weight.
     Re-checking the AUTO box (toggleRowSync) un-cancels: it wipes the override
     and the row goes back to computed status. */
  function setManualStatus(oid, status){
    const row = PLAN[oid];
    if(!row) return;
    if(!FB_DB){ toast('Offline — Firebase not connected','er'); return; }
    if(!canWrite(PERMK)){ toast('You do not have permission','er'); return; }
    const now  = Date.now();
    const snapAct = computeActualFromState(row);   /* keep whatever was loaded */
    const payload = {};
    payload[`${FBN}${oid}/_autoSync`]  = false;
    payload[`${FBN}${oid}/_status`]    = status;
    payload[`${FBN}${oid}/_actualQty`] = snapAct || '';
    payload[`${FBN}${oid}/lastBy`]     = CURRENT_USER.name;
    payload[`${FBN}${oid}/lastAt`]     = now;
    row._autoSync  = false;
    row._status    = status;
    row._actualQty = snapAct || '';
    row.lastBy = CURRENT_USER.name;
    row.lastAt = now;
    bumpVersion(payload);
    _suppressEcho++;
    FB_DB.ref().update(payload)
      .then(()=>{ try{ logAudit(PERMK + ':status', oid, '_status', '', status, 'cancel from auto'); }catch(_){} })
      .catch(e=>{ console.error('plan setManualStatus', e); toast('Status write failed','er'); })
      .finally(()=>setTimeout(()=>{ _suppressEcho--; }, 600));
    setTimeout(()=>{
      if(table){ try{ const r = table.getRow(oid); if(r){ r.reformat(); rowFmt(r); } }catch(_){} }
      refreshCounts();
      try{ renderLedger(); }catch(_){}
    }, 30);
    toast('Row '+(row.plate||oid)+': '+status.toUpperCase()+' (Auto-sync OFF — re-check ☑ to undo)', 'ok');
  }

  /* -------- Ensure temp DOs for orders without a real DO --------
     This is the MANUAL trigger of the same logic that runs automatically on paste
     (resolveOid). It NEVER creates a blank row. It scans existing plan orders and,
     for any whose DO column is empty or a placeholder (e.g. "after loading") and that
     does not already carry a temp id, assigns a TMP-YYYYMMDD-NNN identifier. */
  /* Low-level single-field writer to PLAN + Firebase, bypassing the special-case
     branches in editCellField (used for repairs / programmatic writes). */
  function _writeField(oid, field, value){
    const row = PLAN[oid];
    if(!row || !FB_DB) return;
    row[field] = value;
    row.lastBy = CURRENT_USER.name;
    row.lastAt = Date.now();
    const payload = {};
    payload[`${FBN}${oid}/${field}`] = value;
    payload[`${FBN}${oid}/lastBy`] = CURRENT_USER.name;
    payload[`${FBN}${oid}/lastAt`] = Date.now();
    bumpVersion(payload);
    _suppressEcho++;
    FB_DB.ref().update(payload)
      .catch(e=>{ console.error('plan _writeField', e); })
      .finally(()=>setTimeout(()=>{ _suppressEcho--; }, 600));
  }

  function createTempDO(){
    if(!canWrite(PERMK)){ toast('You do not have permission to edit '+UILABEL,'er'); return; }
    if(!FB_DB){ toast('Offline — Firebase not connected','er'); return; }
    const seqMap = _tempSeqMap(planDate);
    let created = 0, skipped = 0;
    Object.values(PLAN).slice().forEach(r=>{          /* snapshot — renameOid mutates PLAN */
      const doN = String(r.doNum||'').trim();
      const oid = String(r._oid||'');
      if(isRealDO(doN)) return;                        /* already has a real DO → skip */
      if(isTempOid(oid)) return;                       /* already a temp order → repaired below */
      /* SALES GATE: a temp DO may be issued ONLY when sales has written
         "after loading" into the DO column. Any other value (blank, a note, etc.)
         means temp-DO selling is NOT approved → leave the row untouched. */
      if(!/after\s*loading/i.test(doN)){ if(doN) skipped++; return; }
      const pfx = tempPrefix(r.customer);
      seqMap[pfx] = (seqMap[pfx]||0) + 1;
      const newOid = makeTempOid(planDate, seqMap[pfx], r.customer);
      if(renameOid(oid, newOid, { writeDoNum:true })) created++;
    });
    /* repair any temp order whose DO column still shows placeholder text */
    const repaired = _repairTempDoNums();
    const parts = [];
    if(created)  parts.push(`${created} new temp DO`);
    if(repaired) parts.push(`wrote temp DO into ${repaired} row(s)`);
    if(parts.length)      toast('Done: '+parts.join(', ')+(skipped?` · ${skipped} row(s) skipped (no "after loading")`:''),'ok');
    else if(skipped)      toast(`No temp DO created — ${skipped} row(s) have no "after loading" mark from sales`,'');
    else                  toast('All orders already have a DO (real or temp) — column is correct','ok');
    rebuildTableData();
  }

  /* -------- Identity helpers shared with SYNC (Phase 2) --------
     Normalization mirrors posFingerprint so cross-module matching is consistent. */
  function normPlate(v){ return String(v||'').replace(/[-.\s]/g,'').toUpperCase(); }
  function normDriver(v){ return String(v||'').replace(/\s+/g,'').toLowerCase(); }

  /* v4.22.1 — VN-aware normalizer for driver/customer matching.
     Lowercase + remove diacritics + collapse whitespace. Lets us compare
     "HOÀNG TRẦN NGỌC" with "Trần Ngọc Hoàng" by word-set after this strips
     the marks and downcases. Mirrors V406 _normVNName. */
  function _normVN(s){
    return String(s||'')
      .trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/đ/g,'d').replace(/Đ/g,'d')
      .replace(/\s+/g,' ');
  }
  /* WMS vehicle field combines truck+rmooc separated by whitespace, e.g.
     "70E-00375 70R-02272". The plan stores them separately (plate vs rmooc).
     Match any whitespace-split token against the plan plate (normalized).
     Mirrors V406's plate-parts.some(p => p === rdPlateClean) logic. */
  function _plateMatchAny(wmsVehicle, planPlate){
    const planClean = String(planPlate||'').replace(/[-.\s]/g,'').toUpperCase();
    if(!planClean) return false;
    return String(wmsVehicle||'').split(/\s+/).some(p =>
      p.replace(/[-.\s]/g,'').toUpperCase() === planClean
    );
  }
  /* Driver matching that survives Vietnamese name re-ordering. Three rungs:
       1. exact after VN normalize          (toggleable diacritics, casing)
       2. sorted word-set                   ("Hoang Tran Ngoc" === "Tran Ngoc Hoang")
       3. subset (all words of shorter set appear in larger set; >=2 each side)
     Mirrors V406's _matchDriverName. */
  function _driverMatch(a, b){
    if(!a || !b) return false;
    const na = _normVN(a), nb = _normVN(b);
    if(na === nb) return true;
    const wa = na.split(' ').filter(Boolean).sort().join(' ');
    const wb = nb.split(' ').filter(Boolean).sort().join(' ');
    if(wa === wb) return true;
    const sa = new Set(na.split(' ').filter(Boolean));
    const sb = new Set(nb.split(' ').filter(Boolean));
    if(sa.size >= 2 && sb.size >= 2){
      const smaller = sa.size <= sb.size ? sa : sb;
      const larger  = sa.size <= sb.size ? sb : sa;
      let all = true;
      smaller.forEach(w => { if(!larger.has(w)) all = false; });
      if(all) return true;
    }
    return false;
  }

  /* Find a TEMP order (oid starts 'TMP-') matching a vehicle plate (+ optional driver).
     Returns the matching _oid string, or null. ONLY temp orders are eligible — a real
     DO order is never matched here (its identity is already final). */
  function findTempOrderByVehicle(plate, driver){
    const np = normPlate(plate);
    if(!np) return null;
    const nd = normDriver(driver);
    let hit = null;
    Object.values(PLAN).forEach(r=>{
      if(hit) return;
      if(!isTempOid(String(r._oid||''))) return;     /* promote temp orders only */
      if(normPlate(r.plate) !== np) return;
      /* driver is a loose tie-breaker: only reject when both sides have a driver and differ */
      const rd = normDriver(r.driver);
      if(nd && rd && rd !== nd) return;
      hit = r._oid;
    });
    return hit;
  }

  /* Normalize a customer name for matching: keep alphanumerics, uppercase.
     WMS customer names and plan customer names rarely match char-for-char, so we
     compare on a normalized substring-overlap basis (either contains the other). */
  function normCust(v){ return String(v||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase(); }
  function custMatch(a, b){
    const na = normCust(a), nb = normCust(b);
    if(!na || !nb) return false;
    if(na === nb) return true;
    const short = na.length <= nb.length ? na : nb;
    const long  = na.length <= nb.length ? nb : na;
    return short.length >= 4 && long.includes(short);
  }

  /* v4.22.1 — Customer match that resolves the plan customer through the
     CUST table to its canonical WMS name first. This handles the common case
     where the plan shows a short label ("THAI LYHUOT (EXPORT)") and WMS shows
     the legal name ("THAI LYHUOT IMPORT EXPORT CO LTD"). CT.wmsName returns
     the input unchanged if no record is found, so the fallback degrades to
     the legacy custMatch behavior. */
  function _custMatchViaCt(wmsCustomer, planCustomer){
    if(!wmsCustomer || !planCustomer) return false;
    let planMapped = planCustomer;
    try{
      if(typeof CT !== 'undefined' && CT.wmsName) planMapped = CT.wmsName(planCustomer) || planCustomer;
    }catch(_){}
    /* Exact diacritic-insensitive comparison on the mapped name. */
    const nw = normCust(wmsCustomer);
    const np = normCust(planMapped);
    if(nw && np && nw === np) return true;
    /* Word-set fallback after VN-normalize, mirrors driver matching. Catches
       "GAS SOUTH JOINT STOCK COMPANY" vs "Gas South JSC" by token overlap. */
    const sw = new Set(_normVN(wmsCustomer).split(/\s+/).filter(w => w.length >= 3));
    const sp = new Set(_normVN(planMapped).split(/\s+/).filter(w => w.length >= 3));
    if(sw.size && sp.size){
      const smaller = sw.size <= sp.size ? sw : sp;
      const larger  = sw.size <= sp.size ? sp : sw;
      let all = true;
      smaller.forEach(w => { if(!larger.has(w)) all = false; });
      if(all) return true;
    }
    /* Last resort — the legacy substring rule (mostly to keep older test
       data from regressing if CT is empty). */
    return custMatch(wmsCustomer, planMapped);
  }

  /* STRICT match for WMS GI promotion (Phase 2, per user spec):
       customer (WMS name) + driver + plate must all line up against a TEMP order.
     Returns the matching _oid or null. Used only to decide candidates; the actual
     promote still goes through the user-confirmed table.
     v4.22.1 — switched to _plateMatchAny (split WMS vehicle), _driverMatch
     (VN-aware word-set), and _custMatchViaCt (resolves plan.customer through
     CT.wmsName before compare). The previous strict-equality logic failed on
     real data: WMS vehicle "70E-00375 70R-02272" never equalled plan plate
     "70E-00375", and "HOÀNG TRẦN NGỌC" never equalled "Trần Ngọc Hoàng". */
  function findTempOrderStrict(wmsCustomer, driver, plate){
    if(!plate) return null;
    let hit = null;
    Object.values(PLAN).forEach(r=>{
      if(hit) return;
      if(!isTempOid(String(r._oid||''))) return;          /* temp orders only */
      if(!_plateMatchAny(plate, r.plate)) return;          /* plate must match (any WMS part) */
      if(driver && r.driver && !_driverMatch(driver, r.driver)) return;
      if(wmsCustomer && r.customer && !_custMatchViaCt(wmsCustomer, r.customer)) return;
      hit = r._oid;
    });
    return hit;
  }

  /* Rename the unified order id = move the Firebase node (old → new), keeping all data.
     Single source of the rename mechanic, reused by the manual "DO Var" cell edit and by
     SYNC.promoteFromWMS. Returns true on success, false if blocked (no row / target exists
     / no permission / offline). Does NOT touch _status. */
  function renameOid(oldOid, newOid, opts){
    oldOid = String(oldOid||'');
    newOid = String(newOid||'').trim();
    if(!oldOid || !newOid || oldOid === newOid) return false;
    const row = PLAN[oldOid];
    if(!row) return false;
    if(PLAN[newOid]) return false;                  /* refuse to clobber an existing order */
    if(!canWrite(PERMK) || !FB_DB) return false;
    const cloned = { ...row, _oid: newOid };
    /* mirror the id into the DO column so clicking the order shows its (temp/real) DO number,
       which is what gets carried to TL Data / SCALE assign / PTT printout. */
    if(opts && opts.writeDoNum){ cloned.doNum = newOid; }
    delete PLAN[oldOid];
    PLAN[newOid] = cloned;
    const payload = {};
    payload[`${FBN}${oldOid}`] = null;
    payload[`${FBN}${newOid}`] = sanitizeForStorage(cloned);
    bumpVersion(payload);
    _suppressEcho++;
    FB_DB.ref().update(payload)
      .catch(e=>{ console.error('plan renameOid', e); })
      .finally(()=>setTimeout(()=>{ _suppressEcho--; }, 600));
    rebuildTableData();
    return true;
  }

  /* -------- Firebase listeners (per-area cache + version) -------- */
  let FB_DB = null;
  function attachFirebase(){
    if(typeof firebase === 'undefined') return;
    FB_DB = firebase.database();

    FB_DB.ref(VERK).on('value', s=>{
      const v = s.val()||0;
      if(v > _versions.plan) _versions.plan = v;
    });

    const ref = FB_DB.ref(FBN);

    /* ── CRITICAL: Reconcile local cache against Firebase BEFORE trusting listeners ──
       Firebase RTDB child_added/changed/removed listeners only fire for events that
       occur WHILE the listener is attached. If another machine deleted rows while
       this machine was offline, no child_removed event will fire when we reconnect —
       those rows remain as ghosts in localStorage cache and re-appear in the UI.
       Worse: subsequent edits on this machine would write those stale rows back to
       Firebase, resurrecting the deleted data on every other client.

       Fix: do a one-shot `once('value')` to get the authoritative state, then prune
       any local oid that doesn't exist remotely. Firebase is always the source of
       truth on attach. This runs in parallel with the child_added replay below — the
       handlers are idempotent (PLAN[oid] = row), so there's no race. */
    ref.once('value').then(snap => {
      const fbData = snap.val() || {};
      const localOids = Object.keys(PLAN);
      const orphans = localOids.filter(oid => !Object.prototype.hasOwnProperty.call(fbData, oid));
      if(orphans.length){
        /* Firebase is ALWAYS the source of truth on attach. Any local row that is
           not present remotely is a ghost — it was deleted on another machine while
           this one was offline (no child_removed event fires for offline deletions).
           PRUNE it. We never seed local-only rows back to Firebase here: doing so
           resurrected data that had been intentionally deleted on another machine
           (the stale-cache-overwrites-Firebase bug). Rows are always written to
           Firebase at creation/edit time, so a row that exists only locally on a
           fresh load is a deletion that hasn't been replayed — not unsynced work. */
        console.warn(`[${PERMK}] Reconcile: pruning ${orphans.length} stale local row(s):`, orphans);
        orphans.forEach(oid => delete PLAN[oid]);
        saveCache();
        if(table) rebuildTableData();
        refreshCounts(); refreshBadge();
        try{ if(typeof FCHECK!=='undefined') FCHECK.recompute(); }catch(_){}
      }
      /* update local version baseline to whatever FB says, so future writes don't
         carry a lower-than-server version number */
      try{
        FB_DB.ref(VERK).once('value').then(vs => {
          const v = vs.val()||0;
          if(v > _versions.plan){ _versions.plan = v; saveCache(); }
        });
      }catch(_){}
    }).catch(e => {
      console.warn(`[${PERMK}] reconcile read failed (offline?) — relying on incremental listeners`, e);
    });

    /* ── v4.34.0 — child events coalesce into ONE debounced refresh.
       The initial replay fires child_added once per row; the old handlers
       ran saveCache (full-PLAN serialize) + rebuildTableData per row,
       making startup O(N²). RAM is mutated immediately; cache/table/badge
       refresh once per burst. Zero change in Firebase traffic. */
    let _syncT = null;
    const _scheduleSync = ()=>{
      if(_syncT) return;
      _syncT = setTimeout(()=>{
        _syncT = null;
        saveCache();
        if(table) rebuildTableData();
        refreshCounts(); refreshBadge();
        try{ if(typeof FCHECK!=='undefined') FCHECK.recompute(); }catch(_){}
      }, 100);
    };
    ref.on('child_added', snap=>{
      if(_suppressEcho) return;
      const oid = snap.key, row = snap.val();
      if(!row) return;
      row._oid = oid;
      PLAN[oid] = row;
      _scheduleSync();
    });
    ref.on('child_changed', snap=>{
      if(_suppressEcho) return;
      const oid = snap.key, row = snap.val();
      if(!row) return;
      row._oid = oid;
      PLAN[oid] = row;
      _scheduleSync();
    });
    ref.on('child_removed', snap=>{
      if(_suppressEcho) return;
      const oid = snap.key;
      delete PLAN[oid];
      _scheduleSync();
    });

    /* One-time data repair after the initial snapshot: any TEMP order whose DO column
       still holds placeholder text (e.g. "After loading") gets its temp id written into
       doNum, in a single batched update. This makes the stored value match the temp DO
       (no more "After loading" lurking under the display) and keeps each order's doNum
       unique so station search/assign works. */
    ref.once('value').then(()=>{ setTimeout(_repairTempDoNums, 400); }).catch(()=>{});
  }

  /* Batched repair: write _oid into doNum for every temp order where they differ. */
  function _repairTempDoNums(){
    if(!FB_DB || !canWrite(PERMK)) return 0;
    const payload = {}; let n = 0;
    Object.values(PLAN).forEach(r=>{
      const oid = String(r._oid||'');
      if(isTempOid(oid) && String(r.doNum||'') !== oid){
        r.doNum = oid;
        payload[`${FBN}${oid}/doNum`] = oid;
        n++;
      }
    });
    if(n){
      bumpVersion(payload);
      _suppressEcho++;
      FB_DB.ref().update(payload)
        .catch(e=>{ console.warn('plan repair doNum', e); })
        .finally(()=>setTimeout(()=>{ _suppressEcho--; }, 600));
      if(table) rebuildTableData();
    }
    return n;
  }

  /* -------- Tabulator -------- */
  const STATUS_OPTS = [
    {val:'',        label:'Pending',   cls:'s-pending', icon:'—'},
    {val:'entered', label:'Entered',   cls:'s-entered', icon:'🚛'},
    {val:'loading', label:'Loading',   cls:'s-loading', icon:'⛽'},
    {val:'done',    label:'Done',      cls:'s-done',    icon:'✅'},
    {val:'cancel',  label:'Cancelled', cls:'s-cancel',  icon:'🚫'}
  ];

  /* ─── Effective status (the heart of AUTO mode) ───
     In AUTO mode (_autoSync !== false), a plan row's status is computed at render
     time from station state + TL Data presence — never persisted to Firebase. This
     is the Spark-quota saver: thousands of status flips a day cost zero writes.
     In MANUAL mode (_autoSync === false) we honor the stored row._status value,
     which IS written to Firebase (so other machines see the operator's override).

     Compute rules — Highest priority wins:
       1. TL Data has a row matching this _oid or doNum → 'done'
       2. A station has this _oid in 'loading' state            → 'loading'
       3. Otherwise                                              → '' (pending)
     The 'entered' / 'cancel' values are MANUAL-only; AUTO never produces them. */
  function computeStatusFromState(row){
    if(!row) return '';
    const oid    = String(row._oid||'').trim();
    const doStr  = String(row.doNum||'').trim();
    if(!oid && !doStr) return '';
    /* TL Data presence wins. v4.34.0 — O(1) lookups in TL.getIndex()
       (rebuilt lazily once per TL mutation) instead of scanning every
       TL row for every plan row on every table render. */
    if(typeof TL !== 'undefined' && TL.getIndex){
      const byKey = TL.getIndex().byKey;
      if(oid   && byKey.has(oid))   return 'done';
      if(doStr && byKey.has(doStr)) return 'done';
    }
    /* Station state — only 'loading' is meaningful (the only non-empty state now). */
    if(typeof DB_SC !== 'undefined' && DB_SC.stations){
      for(const id in DB_SC.stations){
        const s = DB_SC.stations[id];
        if(!s || s.status !== 'loading') continue;
        if(oid && String(s._oid||'') === oid) return 'loading';
        /* multi-DO: a station may carry several DOs combined — a linked plan row
           whose own DO is part of that load is also 'loading'. */
        if(doStr && s.doNum && typeof dosOverlap==='function' && dosOverlap(s.doNum, doStr)) return 'loading';
      }
    }
    return '';
  }
  function getEffectiveStatus(row){
    if(!row) return '';
    return row._autoSync === false ? (row._status||'') : computeStatusFromState(row);
  }

  /* ─── Effective Actual quantity (AUTO mode, RAM-only) ───
     Mirrors computeStatusFromState: sum the LPG net (lpgQty, kg) of every TL Data
     row that matches this plan order by _oid or real DO. Computed at render time,
     NEVER written to Firebase (a TMP order can have several scale turns; summing
     gives the total loaded). In MANUAL mode the stored _actualQty is honoured.
     v4.34.0 — sums via TL.getIndex(); the rid→qty maps for the two keys are
     unioned so a TL row matching BOTH keys is never double-counted. */
  function computeActualFromState(row){
    if(!row) return '';
    const oid   = String(row._oid||'').trim();
    const doStr = String(row.doNum||'').trim();
    if(!oid && !doStr) return '';
    if(typeof TL === 'undefined' || !TL.getIndex) return '';
    const byKey = TL.getIndex().byKey;
    const seen = new Map();   /* rid → qty|null, unioned across the two keys */
    [oid, doStr].forEach(k=>{
      if(!k) return;
      const m = byKey.get(k);
      if(m) m.forEach((q, rid)=>{ seen.set(rid, q); });
    });
    if(!seen.size) return '';
    let sum = 0, found = false;
    seen.forEach(q=>{ if(q !== null && !isNaN(q)){ sum += q; found = true; } });
    return found ? String(sum) : '';   /* kg — actualFormatter renders MT when >=1000 */
  }
  function getEffectiveActual(row){
    if(!row) return '';
    return row._autoSync === false ? (row._actualQty||'') : computeActualFromState(row);
  }

  function statusFormatter(cell){
    const row = cell.getRow().getData();
    const v   = getEffectiveStatus(row);
    const opt = STATUS_OPTS.find(o=>o.val===v) || STATUS_OPTS[0];
    /* Subtle marker on the pill so operators can tell at a glance whether the
       value is computed (AUTO) or stored manually. */
    const manual = row._autoSync === false ? ' tp-status-manual' : '';
    return `<span class="tp-status-pill ${opt.cls}${manual}" title="${row._autoSync===false?'Manual':'Auto'}"><span class="pdot"></span>${opt.icon} ${opt.label}</span>`;
  }
  function doFormatter(cell){
    const v = String(cell.getValue()||'').trim();
    const rowData = cell.getRow().getData();
    // Build WG diff badges (RAM-only) — appended after the DO value
    let wgBadges = '';
    try{ if(typeof WGCHECK !== 'undefined') wgBadges = WGCHECK.badgeHtml(rowData); }catch(_){}
    /* real DO → show plain */
    if(isRealDO(v)) return `<span class="tp-do">${escapeHtml(v)}</span>${wgBadges}`;
    /* temp DO (stored in the DO column) → editable temp value */
    if(isTempOid(v)) return `<span class="tp-do tp-do-temp" title="Temp DO — editable; auto-upgrades to real DO when WMS GI matches">${escapeHtml(v)}</span>${wgBadges}`;
    /* nothing yet → prompt to create a temp DO */
    if(!v) return `<span class="tp-do tp-do-empty">no DO</span>${wgBadges}`;
    /* any leftover placeholder text (e.g. "After loading") → flag it */
    return `<span class="tp-do tp-do-empty" title="No temp DO — click '🔢 Create temp DO'">${escapeHtml(v)}</span>${wgBadges}`;
  }
  function oidFormatter(cell){
    const v = String(cell.getValue()||'').trim();
    if(!v) return `<span class="tp-var tp-var-empty">—</span>`;
    return `<span class="tp-var">${escapeHtml(v)}</span>`;
  }
  /* Plate cell: 3-level visual state — RAM-only, no Firebase reads.
       1) PLATE_DIFF (WG cross-check) → orange/red BLINK + 🚨 (priority over plain Fleet-missing
          because PLATE_DIFF is a stronger semantic: the truck IS in Fleet but doesn't match the WMS DO)
       2) Plate missing in Fleet      → red BLINK + ⚠
       3) Plate-cert expired/etc.     → red BLINK + 🔴N badge via FCHECK.cellWarn
       4) OK                          → plain text */
  function plateFormatter(cell){
    const v = String(cell.getValue()||'').trim();
    if(!v) return '<span class="tp-plate-empty">—</span>';
    const rowData = cell.getRow().getData();
    // Layer 1: WG plate diff
    try{
      if(typeof WGCHECK !== 'undefined' && WGCHECK.plateHasDiff(rowData)){
        const tip = (rowData._wgWarns || [])
          .filter(w => w.code === 'PLATE_DIFF')
          .map(w => w.msg).join('\n').replace(/"/g,'&quot;');
        return `<span class="tp-plate-wg-diff" title="${tip}">${escapeHtml(v)}</span>`;
      }
    }catch(_){}
    // Layer 2: missing in Fleet
    let missing = false;
    try{ if(typeof FCHECK!=='undefined') missing = !FCHECK.plateInFleet(v); }catch(_){}
    if(missing) return `<span class="fc-plate-missing" title="Plate not found in Fleet — verify">${escapeHtml(v)}</span>`;
    // Layer 3: expired/other Fleet cert problem on this plate
    try{
      if(typeof FCHECK !== 'undefined' && FCHECK.cellWarn){
        const w = FCHECK.cellWarn(rowData, 'plate');
        if(w.blink) return `<span class="tp-cert-blink">${escapeHtml(v)}</span>${w.badges}`;
      }
    }catch(_){}
    return escapeHtml(v);
  }

  /* Driver cell: red BLINK + per-issue badges (missing / expired / duplicate name).
     Mirrors V406 _planCertCell(r,'driver'). RAM-only. */
  function driverFormatter(cell){
    const v = String(cell.getValue()||'').trim();
    if(!v) return '<span class="tp-plate-empty">—</span>';
    try{
      if(typeof FCHECK !== 'undefined' && FCHECK.cellWarn){
        const w = FCHECK.cellWarn(cell.getRow().getData(), 'driver');
        if(w.blink) return `<span class="tp-cert-blink">${escapeHtml(v)}</span>${w.badges}`;
      }
    }catch(_){}
    return escapeHtml(v);
  }

  /* Rmooc cell: red BLINK + missing/expired badges. Mirrors V406. */
  function rmoocFormatter(cell){
    const v = String(cell.getValue()||'').trim();
    if(!v) return '<span class="tp-plate-empty">—</span>';
    try{
      if(typeof FCHECK !== 'undefined' && FCHECK.cellWarn){
        const w = FCHECK.cellWarn(cell.getRow().getData(), 'rmooc');
        if(w.blink) return `<span class="tp-cert-blink">${escapeHtml(v)}</span>${w.badges}`;
      }
    }catch(_){}
    return escapeHtml(v);
  }
  function actualFormatter(cell){
    const v = getEffectiveActual(cell.getRow().getData());
    if(v === '' || v == null) return `<span class="tp-actual tp-actual-empty">—</span>`;
    const n = parseFloat(v);
    if(isNaN(n)) return `<span class="tp-actual">${escapeHtml(String(v))}</span>`;
    /* if value looks like kilograms (>= 1000) show as MT with 3 decimals */
    const disp = n >= 1000 ? (n/1000).toFixed(3) : n.toFixed(3);
    return `<span class="tp-actual">${disp}</span>`;
  }

  function statusEditor(cell, onRendered, success, cancel){
    /* v4.59 — AUTO mode no longer refuses outright. Status is still computed
       there (Pending/Loading/Done follow the scale + TL Data), but the
       operator may pick CANCEL directly: it flips the row to MANUAL + cancel
       in one write (setManualStatus). Other statuses stay disabled in AUTO —
       they would be overwritten by the computed value anyway. */
    const rowData = cell.getRow().getData();
    const isAuto  = rowData._autoSync !== false;
    const current = isAuto ? getEffectiveStatus(rowData) : (rowData._status || '');
    const oid     = String(rowData._oid||'');
    const menu = document.createElement('div');
    menu.className = 'tp-stdd';
    STATUS_OPTS.forEach(opt=>{
      const item = document.createElement('div');
      const disabled = isAuto && opt.val !== 'cancel';
      item.className = 'tp-stdd-item' + (current === opt.val ? ' on' : '');
      if(disabled){
        item.style.opacity = '.45';
        item.style.cursor  = 'not-allowed';
        item.title = 'Auto-sync ON — this status is computed from the scale / TL Data. Uncheck ☑ to set it manually.';
      }
      item.innerHTML = `<span class="pdot" style="background:${opt.cls==='s-pending'?'#90a0ad':
        opt.cls==='s-entered'?'#00b8c8':opt.cls==='s-loading'?'#e8740c':
        opt.cls==='s-done'?'#1f9d55':'#d8392b'}"></span>${opt.icon} ${opt.label}`;
      item.onmousedown = e=>{ e.preventDefault(); e.stopPropagation();
        if(disabled){ toast('Auto-sync ON — only Cancel can be set here. Uncheck ☑ for full manual control.',''); return; }
        document.body.removeChild(menu);
        document.removeEventListener('mousedown', closer, true);
        if(isAuto && opt.val === 'cancel'){
          /* bypass Tabulator's cellEdited (which writes _status only and would
             be ignored while _autoSync is true) — do the atomic flip instead. */
          cancel();
          setManualStatus(oid, 'cancel');
          return;
        }
        success(opt.val);
      };
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    onRendered(()=>{
      const rect = cell.getElement().getBoundingClientRect();
      const menuH = STATUS_OPTS.length * 38 + 12;
      const top = (rect.bottom + menuH > window.innerHeight - 8)
        ? Math.max(8, rect.top - menuH - 4)
        : rect.bottom + 4;
      menu.style.top = top + 'px';
      menu.style.left = rect.left + 'px';
    });
    function closer(e){
      if(!menu.contains(e.target)){
        try{ document.body.removeChild(menu); }catch(_){}
        document.removeEventListener('mousedown', closer, true);
        cancel();
      }
    }
    setTimeout(()=>document.addEventListener('mousedown', closer, true), 10);
    /* return a hidden dummy element — Tabulator requires a Node */
    const dummy = document.createElement('input');
    dummy.type = 'hidden';
    return dummy;
  }

  /* per-row auto-sync control: a checkbox. CHECKED = ON (status auto-computes from
     station state + TL Data, no Firebase persistence). UNCHECKED = OFF (manual lock —
     the operator types status / actual by hand; those edits ARE written to Firebase
     so other machines see the override). */
  function autoSyncFormatter(cell){
    const on  = cell.getRow().getData()._autoSync !== false;
    const oid = String(cell.getRow().getData()._oid||'');
    const tip = on ? 'Auto-sync ON — uncheck to edit status manually'
                   : 'Manual (locked) — check to re-enable Auto-sync (clears the override on all machines)';
    return `<input type="checkbox" class="tp-sync-chk" ${on?'checked':''} title="${tip}"`
         + ` onclick="event.stopPropagation(); ${ID}ToggleRowSync('${oid}')">`;
  }
  /* Plan-date column formatter. Today = neutral; future = orange highlight
     (assignment to a station will be refused); past = red strikethrough
     (stale row from a previous day, also blocked). */
  function forDateFormatter(cell){
    const fd  = String(cell.getValue() || cell.getRow().getData()._forDate || '').trim();
    const tod = isoToday();
    if(!fd) return '<span class="tp-fordate-stale">—</span>';
    if(fd === tod) return `<span class="tp-fordate-today">${escapeHtml(isoLabel(fd))}</span>`;
    if(fd > tod)   return `<span class="tp-fordate-future" title="Future plan — cannot be assigned to a station yet">${escapeHtml(isoLabel(fd))}</span>`;
    return `<span class="tp-fordate-stale" title="Stale plan from ${escapeHtml(isoLabel(fd))} — cannot be assigned">${escapeHtml(isoLabel(fd))}</span>`;
  }

  /* ── v4.66 — product-type ratio helpers ──────────────────────────
     Plan col[2] carries free text ("50:50", "C3:20/C4:80", "30:70 Cargo
     July SPOT", "Pure Propane"…). Normalize through _pfDeriveType, which
     accepts the FULL ratio range (any a:b with a+b=100 → 10:90 … 90:10)
     plus the pure grades. Rows with no ratio derive to 50:50 (hàng bán
     phổ thông) — same fallback the PTT/DN printers use.
     Any ratio ≠ 50:50 (or a pure grade) is flagged with a warning badge
     so the operator double-checks tank/lot before selling. */
  function prodRatio(t){
    const norm = (typeof _pfDeriveType==='function') ? _pfDeriveType(t||'') : String(t||'');
    const m = norm.match(/C3:(\d{1,3})\/C4:(\d{1,3})/i);
    if(m) return parseInt(m[1],10)+':'+parseInt(m[2],10);
    if(/pure\s*propane/i.test(norm)) return 'Pure C3';
    if(/pure\s*butane/i.test(norm))  return 'Pure C4';
    return '';
  }
  function isSpecialType(t){
    const r = prodRatio(t);
    return r !== '' && r !== '50:50';
  }
  function typeBadgeHtml(t){
    if(!isSpecialType(t)) return '';
    const r = prodRatio(t);
    return '<span class="tp-type-badge" title="Product type '+r
         + ' — KHÁC hàng phổ thông 50:50. Kiểm tra tank/lot/COQ trước khi cân!">⚠ '+r+'</span>';
  }

  function buildColumns(){
    return [
      {title:'#', field:'no', width:50, hozAlign:'center', headerSort:false, sorter:'number',
        cssClass:'tp-no'},
      {title:'☑', field:'_autoSync', width:44, hozAlign:'center', headerSort:false,
        formatter:autoSyncFormatter,
        headerTooltip:'Per-row Auto-sync. Checked = Status & Actual computed from station + TL Data (no Firebase writes). Unchecked = manual entry (writes to Firebase).',
        cellClick:(e,cell)=>API.toggleRowSync(cell.getRow().getData()._oid)},
      {title:'Date', field:'_forDate', width:88, hozAlign:'center', headerSort:false,
        formatter:forDateFormatter,
        headerTooltip:'Plan date for this row. Rows whose date is not today cannot be assigned to a station — they are a future plan staged in advance.'},
      {title:'Status', field:'_status', width:130, hozAlign:'center', headerSort:false,
        formatter:statusFormatter, editor:statusEditor},
      {title:'Customer', field:'customer', minWidth:170, editor:'input', cssClass:'tp-customer',
        /* v4.66 — append a warning badge when the order's product type
           (full C3:C4 ratio range) is NOT the common 50:50 grade */
        formatter:function(cell){
          const d = cell.getRow().getData();
          return escapeHtml(String(cell.getValue()||'')) + typeBadgeHtml(d.type);
        }},
      {title:'Plate', field:'plate', width:115, editor:'input', cssClass:'tp-plate', formatter:plateFormatter},
      {title:'Rmooc', field:'rmooc', width:100, editor:'input', cssClass:'tp-rmooc', formatter:rmoocFormatter},
      {title:'Driver', field:'driver', minWidth:140, editor:'input', cssClass:'tp-driver', formatter:driverFormatter},
      {title:'Qty (MT)', field:'qty', width:80, editor:'input', cssClass:'tp-qty'},
      {title:'Tol.', field:'tolerance', width:60, editor:'input', cssClass:'tp-qty'},
      {title:'Actual', field:'_actualQty', width:90, editor:'input',
        formatter:actualFormatter, hozAlign:'right'},
      {title:'Gate', field:'allowGate', width:60, hozAlign:'center', editor:'list',
        editorParams:{values:['OK','NO']}},
      {title:'Load', field:'allowLoad', width:60, hozAlign:'center', editor:'list',
        editorParams:{values:['OK','NO']}},
      {title:'DO No.', field:'doNum', width:110, editor:'input', formatter:doFormatter},
      {title:'Note', field:'note', minWidth:140, editor:'input'},
      {title:'Last Edit', field:'lastAt', width:90, headerSort:false,
        formatter:lastEditFormatter, cssClass:'cell-lastedit-wrap'},
      {title:'🗑', width:44, hozAlign:'center', headerSort:false, formatter:()=>'✕',
        cssClass:'cell-del', cellClick:(e,cell)=>API.requestDeleteRow(cell.getRow().getData())},
      /* the unified order-id column — last, editable */
      {title:'DO Var', field:'_oid', width:155, editor:'input', formatter:oidFormatter,
        headerTooltip:'Unified Order ID (also the Firebase key). Auto = real DO if available, else a temp DO: <3-letter customer><YYMMDD><seq>, e.g. KNH26060201.'}
    ];
  }

  function rowFmt(row){
    const el = row.getElement();
    el.classList.remove('tp-row-done','tp-row-loading','tp-row-cancel','tp-row-temp','tp-row-future','tr-wg-warn','tr-wg-warn-plate');
    const d  = row.getData();
    const st = getEffectiveStatus(d);
    if(st === 'done')        el.classList.add('tp-row-done');
    else if(st === 'loading') el.classList.add('tp-row-loading');
    else if(st === 'cancel')  el.classList.add('tp-row-cancel');
    /* mark TMP-* rows with an orange edge */
    if(d._oid && isTempOid(d._oid)) el.classList.add('tp-row-temp');
    /* dim rows whose plan date isn't today — these can't be assigned to a
       station; they're either a pre-staged future plan or a stale leftover. */
    const fd = String(d._forDate || '').trim();
    if(fd && fd !== isoToday()) el.classList.add('tp-row-future');
    /* WG cross-check tint — RAM-only, no Firebase read. Plate-diff takes
       precedence over generic warning because it's the highest-severity. */
    try{
      if(typeof WGCHECK !== 'undefined'){
        const lvl = WGCHECK.rowLevel(d);
        if(lvl === 'plate')      el.classList.add('tr-wg-warn-plate');
        else if(lvl === 'any')   el.classList.add('tr-wg-warn');
      }
    }catch(_){}
  }

  function planRows(){
    const q = (document.getElementById(ID + 'Search')||{}).value || '';
    const ql = q.trim().toLowerCase();
    /* Display filter: with NO date chips selected, show every plan date (the
       default). With one or more selected, show only those. Legacy rows without
       _forDate fall back to the module default date. */
    let rows = Object.values(PLAN).filter(r => _dateSel.size === 0 ? true : _dateSel.has(r._forDate || planDate));
    if(ql){
      rows = rows.filter(r=>{
        const hay = (r.plate||'')+(r.driver||'')+(r.customer||'')+
                    (r.doNum||'')+(r.rmooc||'')+(r.no||'')+(r.note||'')+(r._oid||'');
        return hay.toLowerCase().includes(ql);
      });
    }
    /* v4.55.5 — LEDGER VIEW order = paste/Excel-source order (giống TABLE VIEW):
       _forDate → _seq. Ledger vẫn group theo customer (grouping dùng
       first-appearance order trong renderLedger), nên customer hiện theo đúng
       thứ tự được paste, và trong mỗi customer các dòng cũng giữ thứ tự paste.
       Dòng thiếu _seq (legacy / pre-v4.55.4 Firebase) chìm xuống cuối, fallback
       theo "no"; chúng lấy lại thứ tự thật ở lần paste kế tiếp. */
    rows.sort((a,b)=>{
      const da = String(a._forDate||''), db = String(b._forDate||'');
      if(da !== db) return da.localeCompare(db);
      const sa = (typeof a._seq === 'number') ? a._seq : Number.MAX_SAFE_INTEGER;
      const sb = (typeof b._seq === 'number') ? b._seq : Number.MAX_SAFE_INTEGER;
      if(sa !== sb) return sa - sb;
      return (parseInt(a.no,10)||0) - (parseInt(b.no,10)||0);
    });
    return rows;
  }

  /* v4.55.4 — TABLE VIEW order = paste/Excel-source order (NOT customer-grouped,
     NOT user-sortable) so staff can cross-reference against the source sheet
     row-for-row. Ordered by _forDate, then by _seq (the global paste index
     stamped in parsePlanSheet). The old "#" (no) column is per-customer and
     resets to 1 each customer/sub-group, so sorting by it scrambled the order
     across customers — _seq keeps every row exactly where it was pasted.
     Rows without _seq (legacy / pre-v4.55.4 Firebase data) sink to the bottom
     and fall back to no-order; they regain real order on the next paste. */
  function tableRows(){
    const q = (document.getElementById(ID + 'Search')||{}).value || '';
    const ql = q.trim().toLowerCase();
    let rows = Object.values(PLAN).filter(r => _dateSel.size === 0 ? true : _dateSel.has(r._forDate || planDate));
    if(ql){
      rows = rows.filter(r=>{
        const hay = (r.plate||'')+(r.driver||'')+(r.customer||'')+
                    (r.doNum||'')+(r.rmooc||'')+(r.no||'')+(r.note||'')+(r._oid||'');
        return hay.toLowerCase().includes(ql);
      });
    }
    rows.sort((a,b)=>{
      const da = String(a._forDate||''), db = String(b._forDate||'');
      if(da !== db) return da.localeCompare(db);
      const sa = (typeof a._seq === 'number') ? a._seq : Number.MAX_SAFE_INTEGER;
      const sb = (typeof b._seq === 'number') ? b._seq : Number.MAX_SAFE_INTEGER;
      if(sa !== sb) return sa - sb;
      return (parseInt(a.no,10)||0) - (parseInt(b.no,10)||0);
    });
    return rows;
  }

  function buildTable(){
    if(table){ try{ table.destroy(); }catch(_){} table = null; }
    table = new Tabulator('#' + ID + 'Grid', {
      data: tableRows(),
      layout: 'fitDataStretch',
      height: '100%',
      index: '_oid',
      columns: buildColumns(),
      /* v4.54.1 — keep paste/Excel order: no column sorting, no column moving */
      columnDefaults: { headerSort: false },
      movableColumns: false,
      rowFormatter: rowFmt,
      placeholder: 'No ' + UILABEL + ' loaded — click "📋 Paste from Excel" to import',
      clipboard: true,
      clipboardPasteAction: 'replace'
    });
    table.on('cellEdited', cell=>{
      const field = cell.getField();
      const oid   = cell.getRow().getData()._oid;
      const value = cell.getValue();
      editCellField(oid, field, value);
      setTimeout(()=>{ table.getRows().forEach(r=>rowFmt(r)); refreshCounts(); }, 30);
      try{ if(typeof FCHECK!=='undefined') FCHECK.recompute(); }catch(_){}
      /* WGCHECK: re-evaluate this row when a cross-check input field changes.
         Re-render the row so badges/tints/blink reflect the new state. */
      try{
        if(typeof WGCHECK !== 'undefined'
           && /^(plate|rmooc|driver|qty|doNum|customer|note|_status)$/.test(field)){
          const r = PLAN[oid];
          if(r){
            WGCHECK.recheckRow(r);
            const trow = table.getRow(oid);
            if(trow){ trow.reformat(); rowFmt(trow); }
          }
        }
      }catch(_){}
    });
    refreshCounts();
    refreshBadge();
    /* refreshBadge() already calls _refreshDateChips() which rebuilds the
       toolbar date chips from every date present in PLAN. No further setup. */
  }

  function rebuildTableData(){
    if(!table){ buildTable(); renderLedger(); return; }
    try{ table.replaceData(tableRows()); }
    catch(_){ buildTable(); }
    setTimeout(()=>{ table.getRows().forEach(r=>rowFmt(r)); }, 30);
    renderLedger();   /* v4.35.0 — keep the Customer Ledger view in sync */
  }

  function refreshCounts(){
    /* Counts mirror the table's date filter: all dates when none selected,
       otherwise only the chosen dates. */
    const all = Object.values(PLAN).filter(r => _dateSel.size === 0 ? true : _dateSel.has(r._forDate || planDate));
    let p=0,e=0,l=0,d=0,c=0;
    all.forEach(r=>{
      switch(getEffectiveStatus(r)){
        case 'entered': e++; break;
        case 'loading': l++; break;
        case 'done':    d++; break;
        case 'cancel':  c++; break;
        default:        p++;
      }
    });
    document.getElementById(ID + 'CntPending').textContent  = p;
    document.getElementById(ID + 'CntEntered').textContent  = e;
    document.getElementById(ID + 'CntLoading').textContent  = l;
    document.getElementById(ID + 'CntDone').textContent     = d;
    document.getElementById(ID + 'CntCancel').textContent   = c;
    document.getElementById(ID + 'CntTotal').textContent    = all.length;
    document.getElementById(ID + 'CntShown').textContent    =
      table ? table.getRows('active').length : all.length;
    /* v4.58 — live counter on the "PTT TODAY" bulk-print buttons (Scale Quick
       Actions + Today Plan toolbar). Only the Today module drives it. */
    if(ID === 'tp' && typeof PTT_EARLY !== 'undefined' && PTT_EARLY.updateTodayBadge){
      try{ PTT_EARLY.updateTodayBadge(); }catch(_){}
    }
  }
  /* Re-render rows when an external module (SCALE, TL) changes state.
     Call without args to refresh everything, or with a specific _oid to refresh one row.
     Pure RAM op — no Firebase reads or writes. */
  function refreshStatus(oid){
    /* v4.59 — do NOT bail out when the Tabulator isn't built yet. The default
       view is the LEDGER; returning early here dropped every SCALE/TL push,
       leaving the ledger stuck on stale status/actual until the operator
       toggled the AUTO box (whose handler calls renderLedger directly). */
    if(table){
      if(oid){
        try{
          const r = table.getRow(oid);
          if(r){ r.reformat(); rowFmt(r); }
        }catch(_){}
      } else {
        try{ table.getRows().forEach(r=>{ r.reformat(); rowFmt(r); }); }catch(_){}
      }
    }
    refreshCounts();
    renderLedger();   /* v4.35.0 — statuses changed (SCALE/TL push) → refresh ledger pills */
    /* v4.22.4 — bubble up to SCALE row-1 stats: PLAN remaining MT changes
       whenever a row goes DONE / cancel / new assignment. RAM-only. */
    try{ if(typeof SCALE !== 'undefined' && SCALE.refreshRow1) SCALE.refreshRow1(); }catch(_){}
  }
  function refreshBadge(){
    /* Badge shows the total across ALL dates (PLAN size) so the operator can
       see at a glance how many rows are stored in this node — including those
       on a different date than the one currently being viewed. */
    const el = document.getElementById(ID + 'BadgeCount');
    if(el) el.textContent = Object.keys(PLAN).length;
    /* v4.58 — data changed (Firebase push / paste / delete) → refresh the
       "PTT TODAY" button counters too (refreshCounts only runs with a table). */
    if(ID === 'tp' && typeof PTT_EARLY !== 'undefined' && PTT_EARLY.updateTodayBadge){
      try{ PTT_EARLY.updateTodayBadge(); }catch(_){}
    }
    /* Whenever data changes, also rebuild the toolbar date chips so they
       always reflect the actual set of dates present in PLAN. */
    _refreshDateChips();
  }
  /* Rebuild the toolbar's Plan-Date CHIPS from PLAN's actual data. One chip per
     distinct _forDate (with row count), plus an ALL chip. A chip is highlighted
     when its date is in _dateSel; ALL is highlighted when nothing is selected
     (= every date shown). Pure RAM — no Firebase. */
  function _refreshDateChips(){
    const host = document.getElementById(ID + 'PlanDateChips');
    if(!host) return;
    const counts = {};
    Object.values(PLAN).forEach(r=>{
      const d = r._forDate || planDate;
      counts[d] = (counts[d]||0) + 1;
    });
    const dates = Object.keys(counts).sort();
    if(!dates.length){ host.innerHTML = '<span class="pl-datechip-empty">No plans yet</span>'; return; }
    const total = Object.keys(PLAN).length;
    const allOn = _dateSel.size === 0;
    let html = '<span class="pl-datechip all'+(allOn?' on':'')+'" onclick="'+ID+'ClearDateSel()" title="Show every plan date">ALL ('+total+')</span>';
    dates.forEach(d=>{
      const on = _dateSel.has(d);
      html += '<span class="pl-datechip'+(on?' on':'')+'" onclick="'+ID+'ToggleDate(\''+d+'\')"'
            + ' title="'+(on?'Click to remove this date from the view':'Click to show this date')+'">'
            + escapeHtml(isoLabel(d)) + ' (' + counts[d] + ')</span>';
    });
    host.innerHTML = html;
  }
  /* Toggle a plan date in/out of the display set. Clicking a selected date again
     removes it; when the set empties, every date shows again. RAM only. */
  function toggleDateSel(iso){
    if(!iso) return;
    if(_dateSel.has(iso)) _dateSel.delete(iso); else _dateSel.add(iso);
    _refreshDateChips();
    rebuildTableData();
    refreshCounts();
  }
  function clearDateSel(){
    _dateSel.clear();
    _refreshDateChips();
    rebuildTableData();
    refreshCounts();
  }
  /* setPlanDate — used by the paste flow to point the module default at the
     just-pasted date (paste seed / temp-oid). It no longer single-filters the
     view; instead it clears the date selection so the freshly pasted plan is
     visible among all dates. RAM only. */
  function setPlanDate(iso){
    if(iso) planDate = iso;
    _dateSel.clear();
    _refreshDateChips();
    rebuildTableData();
    refreshCounts();
    refreshBadge();
  }

  /* -------- Paste flow -------- */
  /* The paste modal's date picker seeds from the toolbar's current planDate
     (so user's view selection carries into the paste). Both TP and TMR allow
     the user to pick any date — responsibility is on the operator to pick the
     correct day. Station-assign gating still refuses non-today rows. */
  function openPaste(){
    const dateInp = document.getElementById(ID + 'PasteDate');
    if(dateInp){
      dateInp.value = planDate || opts.defaultDate();
      dateInp.disabled = false;
      /* TMR keeps a sensible min (strictly future) so operators don't
         accidentally paste a today-date row into the future-drafts node. */
      if(opts.minFuture){
        dateInp.min = _addDaysIso(isoToday(), 1);
      } else {
        dateInp.removeAttribute('min');
      }
    }
    document.getElementById(ID + 'PasteModal').classList.add('on');
    /* Always open empty — pasted data is never retained between sessions. */
    const ta = document.getElementById(ID + 'PasteArea');
    if(ta) ta.value = '';
    setTimeout(()=>document.getElementById(ID + 'PasteArea').focus(), 50);
  }
  function closePaste(){
    document.getElementById(ID + 'PasteModal').classList.remove('on');
    /* Discard whatever was pasted — leaving on exit must not keep stale text,
       so the next open starts from a clean empty state. */
    const ta = document.getElementById(ID + 'PasteArea');
    if(ta) ta.value = '';
  }
  /* v4.49.3 — Missing-"No" confirmation overlay (RAM-only, no Firebase).
     Built in JS so it inherits factory scope (ID / escapeHtml / toast). Shown
     when a paste contains vehicle rows (plate/rmooc/driver/DO present) whose
     "No" column is blank — these would otherwise be silently dropped or, worse,
     mistaken for the grand-total line and halt parsing. */
  function showPlanSkipOverlay(skips, cb){
    cb = cb || {};
    if(!document.getElementById('pskStyle')){
      const st = document.createElement('style');
      st.id = 'pskStyle';
      st.textContent = `
        #planSkipOverlay{position:fixed;inset:0;z-index:100000;display:flex;
          align-items:center;justify-content:center;background:rgba(15,23,42,.55);}
        #planSkipOverlay .psk-card{background:#fff;border-radius:14px;width:min(680px,94vw);
          max-height:86vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.35);
          font-family:Barlow,system-ui,sans-serif;overflow:hidden;}
        #planSkipOverlay .psk-head{padding:18px 22px 12px;border-bottom:1px solid #eef0f3;}
        #planSkipOverlay .psk-title{font-size:17px;font-weight:800;color:#b45309;margin:0;}
        #planSkipOverlay .psk-sub{font-size:12.5px;color:#475569;margin:6px 0 0;line-height:1.45;}
        #planSkipOverlay .psk-body{padding:6px 22px;overflow:auto;}
        #planSkipOverlay .psk-row{display:flex;gap:10px;align-items:baseline;
          padding:8px 0;border-bottom:1px dashed #eef0f3;font-size:13px;}
        #planSkipOverlay .psk-no{flex:0 0 auto;min-width:30px;height:22px;padding:0 7px;border-radius:6px;
          background:#fde68a;color:#92400e;font-weight:800;font-size:12px;display:inline-flex;
          align-items:center;justify-content:center;}
        #planSkipOverlay .psk-info{color:#1e293b;}
        #planSkipOverlay .psk-info .psk-dim{color:#94a3b8;}
        #planSkipOverlay .psk-foot{padding:14px 22px;border-top:1px solid #eef0f3;display:flex;
          gap:10px;justify-content:flex-end;}
        #planSkipOverlay .psk-btn{border:0;border-radius:9px;padding:9px 16px;font-size:13.5px;
          font-weight:700;cursor:pointer;font-family:inherit;}
        #planSkipOverlay .psk-cancel{background:#f1f5f9;color:#334155;}
        #planSkipOverlay .psk-cancel:hover{background:#e2e8f0;}
        #planSkipOverlay .psk-include{background:#2563eb;color:#fff;}
        #planSkipOverlay .psk-include:hover{background:#1d4ed8;}
      `;
      document.head.appendChild(st);
    }
    const prev = document.getElementById('planSkipOverlay');
    if(prev) prev.remove();

    const ov = document.createElement('div');
    ov.id = 'planSkipOverlay';
    const rowsHtml = skips.map(s=>{
      const bits = [];
      if(s.customer) bits.push(escapeHtml(s.customer));
      if(s.plate)    bits.push(escapeHtml(s.plate));
      if(s.rmooc)    bits.push(escapeHtml(s.rmooc));
      if(s.driver)   bits.push(escapeHtml(s.driver));
      if(s.doNum)    bits.push('DO ' + escapeHtml(s.doNum));
      if(s.qty)      bits.push('Qty ' + escapeHtml(s.qty));
      const detail = bits.length ? bits.join(' <span class="psk-dim">·</span> ') : '<span class="psk-dim">(no other data)</span>';
      return `<div class="psk-row"><span class="psk-no">${escapeHtml(String(s.suggestedNo))}</span>`
           + `<span class="psk-info">${detail}</span></div>`;
    }).join('');
    ov.innerHTML = `
      <div class="psk-card" role="dialog" aria-modal="true">
        <div class="psk-head">
          <p class="psk-title">⚠ ${skips.length} row(s) missing a "No" value</p>
          <p class="psk-sub">These rows have real vehicle data but a blank <b>No</b> column, so they were left out.
            You can auto-number them with the suggested No shown on the left and include them, or cancel and fix the sheet.</p>
        </div>
        <div class="psk-body">${rowsHtml}</div>
        <div class="psk-foot">
          <button class="psk-btn psk-cancel" id="pskCancelBtn">Cancel (fix sheet)</button>
          <button class="psk-btn psk-include" id="pskIncludeBtn">Auto-number &amp; include</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    const close = ()=>{ ov.remove(); };
    ov.querySelector('#pskCancelBtn').addEventListener('click', ()=>{ close(); if(cb.onCancel) cb.onCancel(); });
    ov.querySelector('#pskIncludeBtn').addEventListener('click', ()=>{ close(); if(cb.onInclude) cb.onInclude(); });
  }

  function submitPaste(){
    const txt = document.getElementById(ID + 'PasteArea').value;
    if(!txt.trim()){ toast('Nothing to paste','er'); return; }
    /* Read the user-chosen date from the picker. TMR rejects same-day/past
       dates to keep the future-drafts semantics clean.
       v4.41.0 — Today Plan is ALWAYS today's sales plan (V406 parity): the
       date picker is hidden and the paste date is forced to today regardless
       of the toolbar. TMR keeps its future-date picker. */
    const dateInp = document.getElementById(ID + 'PasteDate');
    const pickedDate = (opts.kind === 'today')
      ? isoToday()
      : ((dateInp && dateInp.value) || planDate);
    if(opts.minFuture && pickedDate <= isoToday()){
      toast('Tomorrow Plan must use a date AFTER today. Use Today Plan for today\'s rows.','er'); return;
    }
    const rows = parseTSV(txt);
    const parsed = parsePlanSheet(rows);
    if(!parsed.rows.length && !parsed.skipped.length){
      toast('No valid plan rows detected','er'); return;
    }
    /* Closure holding the original flow: close paste modal, stage the pending
       paste, and open the Replace/Update choice modal. Called either directly
       (no skips) or after the user resolves the missing-No overlay. */
    const proceed = (finalRows)=>{
      if(!finalRows.length){ toast('No valid plan rows detected','er'); return; }
      closePaste();
      _pendingPaste = { rows: finalRows, forDate: pickedDate };
      _pasteDateForBatch = pickedDate;
      /* show choice modal */
      document.getElementById(ID + 'PchoiceCount').textContent    = finalRows.length;
      document.getElementById(ID + 'PchoiceOldCount').textContent =
        Object.values(PLAN).filter(r => (r._forDate||planDate) === pickedDate).length;
      document.getElementById(ID + 'PchoiceModal').classList.add('on');
    };

    if(parsed.skipped.length){
      /* Some rows carried real vehicle data but had a blank "No" column.
         Ask the user before silently dropping them (RAM-only, no Firebase). */
      showPlanSkipOverlay(parsed.skipped, {
        onInclude: ()=>{
          /* Write the suggested sequential No back into the raw TSV and re-parse
             so fill-down + sub-group context apply correctly to recovered rows. */
          parsed.skipped.forEach(s => { if(rows[s.rowIdx]) rows[s.rowIdx][3] = String(s.suggestedNo); });
          const re = parsePlanSheet(rows);
          proceed(re.rows);
        },
        onCancel: ()=>{
          /* Leave the paste modal open so the user can fix the sheet and retry. */
          toast('Add a No to those rows, then paste again','warn');
        }
      });
      return;
    }
    proceed(parsed.rows);
  }
  function closeChoice(){
    document.getElementById(ID + 'PchoiceModal').classList.remove('on');
    _pendingPaste = null;
  }
  function runChoice(mode){
    if(!_pendingPaste) return;
    document.getElementById(ID + 'PchoiceModal').classList.remove('on');
    /* Replace = true wipe + re-upload (no preservation). Update = smart diff
       with removal detection (preserves _status / _actualQty on matches). */
    const diff = (mode === 'replace')
      ? computeReplaceWipe(_pendingPaste.rows, _pendingPaste.forDate)
      : computeDiff(_pendingPaste.rows, mode, _pendingPaste.forDate);
    _pendingDiff = { diff, mode };
    showDiff(diff, mode);
  }

  /* -------- Diff modal -------- */
  function showDiff(diff, mode){
    const modal = document.getElementById(ID + 'DiffModal');
    const title = mode==='replace'
      ? 'Confirm: Replace All (Wipe)'
      : 'Confirm: Update (Smart Diff Sync)';
    document.getElementById(ID + 'DiffTitle').textContent = title;
    document.getElementById(ID + 'DiffSubtitle').textContent =
      `${mode==='replace'?'Wipe + re-upload every row for the plan date.':'Apply only the differences for the plan date (add / change / remove).'} · Plan date: ${isoLabel(_pasteDateForBatch||planDate)}`;

    let html = '';
    /* stats grid */
    html += '<div class="tp-diff-stats">';
    html += `<div class="tp-diff-stat add"><div class="v">${diff.added.length}</div><div class="l">Added</div></div>`;
    html += `<div class="tp-diff-stat rem"><div class="v">${diff.removed.length}</div><div class="l">Removed</div></div>`;
    html += `<div class="tp-diff-stat chg"><div class="v">${diff.changed.length}</div><div class="l">Changed</div></div>`;
    html += `<div class="tp-diff-stat same"><div class="v">${diff.unchanged.length}</div><div class="l">Unchanged</div></div>`;
    html += '</div>';

    /* danger warning if removing live rows */
    const dangerRemoved = diff.removed.filter(r=>r._status==='loading' || r._status==='done');
    if(dangerRemoved.length){
      html += `<div class="tp-diff-warn">⚠ ${dangerRemoved.length} row(s) currently in <b>loading</b> or <b>done</b> state will be removed. Verify carefully before confirming.</div>`;
    }

    /* cross-date duplicate real-DO warning (Phase 1, v4.19.9).
       Soft warning, not a blocker — user can still confirm because the
       date-suffixed _oid keeps the rows in separate Firebase keys. */
    if(diff.duplicates && diff.duplicates.length){
      const forDateLbl = isoLabel(_pasteDateForBatch || planDate);
      let dupHtml = '';
      dupHtml += `<div class="tp-diff-warn" style="background:#fff7e6;border-color:#ffc266;color:#a04b00">`;
      dupHtml += `⚠ <b>Cross-date duplicate DO detected</b> (${diff.duplicates.length} row${diff.duplicates.length>1?'s':''})<br>`;
      dupHtml += `<span style="font-size:11.5px;line-height:1.55">Principle: <b>1 real DO = 1 order</b>. Valid case: the order was rolled forward from a previous day. `;
      dupHtml += `Confirm to keep <b>both</b> rows (they live in separate Firebase keys thanks to the date suffix), or cancel and delete the old-date row first if you mean to move the order.</span>`;
      dupHtml += `<ul style="margin:8px 0 0 18px;padding:0;font-size:11.5px;line-height:1.6">`;
      diff.duplicates.slice(0,15).forEach(d=>{
        const ex = d.existingRow;
        dupHtml += `<li>DO <b>${escapeHtml(d.newRow.doNum||'?')}</b> on <b>${escapeHtml(forDateLbl)}</b> also exists on <b>${escapeHtml(isoLabel(d.existingDate))}</b> — plate <b>${escapeHtml(ex.plate||'?')}</b>, customer ${escapeHtml(ex.customer||'?')}${ex._status?` <span class="stat-tag" style="background:#fee;color:#a32a1f">${escapeHtml(ex._status)}</span>`:''}</li>`;
      });
      if(diff.duplicates.length > 15){
        dupHtml += `<li style="font-style:italic">…and ${diff.duplicates.length-15} more</li>`;
      }
      dupHtml += `</ul></div>`;
      html += dupHtml;
    }

    /* added */
    if(diff.added.length){
      html += `<div class="tp-diff-section add"><h4><span class="badge">+ NEW</span> ${diff.added.length} row(s) added</h4><div class="tp-diff-list">`;
      diff.added.forEach(r=>{
        html += `<div class="tp-diff-item"><span class="who">${escapeHtml(r.plate||'?')}</span> · ${escapeHtml(r.customer||'?')} · ${escapeHtml(r.driver||'')} <span class="field">DO Var</span> <span class="nv">${escapeHtml(r._oid)}</span></div>`;
      });
      html += '</div></div>';
    }
    /* removed */
    if(diff.removed.length){
      html += `<div class="tp-diff-section rem"><h4><span class="badge">- REMOVE</span> ${diff.removed.length} row(s) removed</h4><div class="tp-diff-list">`;
      diff.removed.forEach(r=>{
        const statTag = r._status ? `<span class="stat-tag" style="background:#fee;color:#a32a1f">${r._status}</span>` : '';
        html += `<div class="tp-diff-item"><span class="who">${escapeHtml(r.plate||'?')}</span> · ${escapeHtml(r.customer||'?')} · ${escapeHtml(r.driver||'')} <span class="field">DO Var</span> <span class="ov">${escapeHtml(r._oid)}</span>${statTag}</div>`;
      });
      html += '</div></div>';
    }
    /* changed */
    if(diff.changed.length){
      html += `<div class="tp-diff-section chg"><h4><span class="badge">~ CHANGED</span> ${diff.changed.length} row(s) with field changes</h4><div class="tp-diff-list">`;
      diff.changed.slice(0,40).forEach(c=>{
        let line = `<div class="tp-diff-item"><span class="who">${escapeHtml(c.new.plate||'?')}</span> · ${escapeHtml(c.new.customer||'?')} `;
        c.diffs.forEach(d=>{
          line += `<span class="field">${escapeHtml(d.field)}</span><span class="ov">${escapeHtml(d.old||'(empty)')}</span><span class="arr">→</span><span class="nv">${escapeHtml(d.new||'(empty)')}</span> `;
        });
        line += '</div>';
        html += line;
      });
      if(diff.changed.length > 40){
        html += `<div class="tp-diff-item" style="font-style:italic;color:var(--ink-3)">…and ${diff.changed.length-40} more row(s)</div>`;
      }
      html += '</div></div>';
    }
    if(!diff.added.length && !diff.removed.length && !diff.changed.length){
      html += '<div class="tp-diff-warn" style="background:var(--green-soft);border-color:#bfe3cc;color:#157a40">✓ No changes detected — paste is identical to the current plan.</div>';
    }
    document.getElementById(ID + 'DiffBody').innerHTML = html;
    modal.classList.add('on');
  }
  function closeDiff(){
    document.getElementById(ID + 'DiffModal').classList.remove('on');
    _pendingDiff = null;
    _pendingPaste = null;
  }
  function confirmDiff(){
    if(!_pendingDiff){ closeDiff(); return; }
    const { diff, mode } = _pendingDiff;
    const pastedDate = _pasteDateForBatch || planDate;
    applyDiff(diff, mode, mode==='replace'?'replace':'update');
    closeDiff();
    /* If the user pasted under a different date than the one currently shown,
       switch the toolbar to that date so the new rows are visible. */
    if(pastedDate !== planDate) setPlanDate(pastedDate);
    /* RAM-only fleet/cert check over the resulting plan — no Firebase reads/writes.
       Pass the local PLAN so a paste into Tomorrow scans plan_tomorrow_ rows
       (not today's). Each row's _forDate already drives the cert checkDate. */
    try{ if(typeof FCHECK !== 'undefined'){ setTimeout(function(){ FCHECK.runPasteCheck(PLAN); }, 200); FCHECK.recompute(); } }catch(_){}
    /* WMS GI cross-check (RAM-only) — sets r._wgWarns and tints rows.
       Run after FCHECK so the toast/overlay order matches V406. */
    try{ if(typeof WGCHECK !== 'undefined'){ WGCHECK.runCheck(PLAN, {toast:true}); setTimeout(function(){ rebuildTableData(); }, 250); } }catch(_){}
    /* v4.38.0 — V406 parity: after the paste applies, prompt for any pasted
       customer that does not resolve to a CUST Short Name, then remember the
       choice (CT.aliasSave) so the Scale→TL push yields the short name. */
    try{
      if(typeof CT!=='undefined' && CT.resolvesShort){
        const unmatched={};
        const scan=r=>{ const c=String((r&&r.customer)||'').trim();
          if(c && !CT.resolvesShort(c)) unmatched[c]=(unmatched[c]||0)+1; };
        (diff.added||[]).forEach(scan);
        (diff.changed||[]).forEach(c=>scan(c.new));
        if(Object.keys(unmatched).length) setTimeout(()=>_custMatchModal(unmatched), 300);
      }
    }catch(_){}
  }

  /* -------- Clear all / Delete row -------- */
  /* If the node holds rows for a single date, the modal still appears but
     shows just that one date pre-checked (one click confirms). If it holds
     multiple dates, the operator picks which dates to wipe via checkboxes. */
  function clearAll(){
    const n = Object.keys(PLAN).length;
    if(!n){ toast(UILABEL+' is already empty','er'); return; }
    if(!canWrite(PERMK)){ toast('No permission','er'); return; }
    /* Tally rows per _forDate (fallback to module's planDate for legacy rows
       that pre-date this field). */
    const byDate = {};
    Object.values(PLAN).forEach(r=>{
      const d = r._forDate || planDate;
      byDate[d] = (byDate[d]||0) + 1;
    });
    const dates = Object.keys(byDate).sort();
    /* Build modal body */
    document.getElementById('planClearTitle').textContent = '🗑 Clear ' + UILABEL;
    document.getElementById('planClearLead').innerHTML =
      dates.length === 1
        ? 'This node holds <b>' + n + '</b> row(s) on one date. Confirm to wipe.'
        : 'This node holds <b>' + n + '</b> row(s) across <b>' + dates.length + '</b> dates. Tick the dates whose rows should be removed.';
    const listEl = document.getElementById('planClearList');
    listEl.innerHTML = '';
    /* "Select all" master checkbox when multiple dates */
    if(dates.length > 1){
      const allRow = document.createElement('label');
      allRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 9px;background:#fff;border:1.5px solid var(--line);border-radius:6px;font-weight:700';
      allRow.innerHTML = '<input type="checkbox" id="planClearAllChk" onclick="planClearToggleAll(this.checked)"> <span>Select all dates</span>';
      listEl.appendChild(allRow);
    }
    dates.forEach(d=>{
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 9px;background:#fff;border:1px solid var(--line);border-radius:6px;cursor:pointer';
      lbl.innerHTML = '<input type="checkbox" class="planClearDateChk" data-date="'+escapeHtml(d)+'"'
                    + (dates.length===1 ? ' checked' : '') + '> '
                    + '<span style="flex:1">'+escapeHtml(isoLabel(d))+'</span>'
                    + '<span style="color:var(--ink-2);font-size:11.5px">'+byDate[d]+' row(s)</span>';
      listEl.appendChild(lbl);
    });
    /* Stash the owning module so the shared modal can dispatch back */
    window._planClearOwner = API;
    document.getElementById('planClearModal').classList.add('on');
  }
  /* Internal: actually run the wipe for the given dates. One bulk Firebase
     update with all matched keys set to null. */
  function _clearDatesActual(datesToClear){
    if(!FB_DB){ toast('Offline — Firebase not connected','er'); return; }
    if(!datesToClear || !datesToClear.length){ toast('Pick at least one date','er'); return; }
    const setToClear = new Set(datesToClear);
    const payload = {};
    let n = 0;
    const removedOids = [];
    Object.values(PLAN).forEach(r=>{
      const d = r._forDate || planDate;
      if(setToClear.has(d)){
        payload[`${FBN}${r._oid}`] = null;
        removedOids.push(r._oid);
        n++;
      }
    });
    if(!n){ toast('Nothing matched the selected date(s)','er'); return; }
    removedOids.forEach(oid=>delete PLAN[oid]);
    bumpVersion(payload);
    _suppressEcho++;
    FB_DB.ref().update(payload)
      .then(()=>toast('Cleared '+n+' row(s) in '+UILABEL+' ('+datesToClear.length+' date'+(datesToClear.length>1?'s':'')+')','ok'))
      .catch(e=>{ console.error(e); toast('Clear failed','er'); })
      .finally(()=>setTimeout(()=>{_suppressEcho--;}, 600));
    try{ logAudit(PERMK+':clear_dates', '_bulk_', '_clearAll', n+' rows', datesToClear.join(','), 'clear'); }catch(_){}
    rebuildTableData();
    refreshCounts();
    refreshBadge();
    try{ if(typeof FCHECK!=='undefined') FCHECK.recompute(); }catch(_){}
  }
  /* Pending oid for the shared delete-confirm modal. Local to this closure,
     so TP and TMR each have their own pointer; the modal itself is shared but
     only one instance can hold it open at a time (modal singleton). */
  let _pendingDeleteOid = null;
  function requestDeleteRow(rowData){
    _pendingDeleteOid = rowData._oid;
    const name = rowData.plate || ('row '+(rowData.no||'?'));
    document.getElementById('delConfirmMsg').innerHTML =
      'Delete row <b>"'+escapeHtml(name)+'"</b> (DO Var: '+escapeHtml(rowData._oid)+') from '+UILABEL+'?<br>This cannot be undone.';
    document.getElementById('delConfirmInput').value = '';
    document.getElementById('delConfirmBtn').classList.remove('ready');
    document.getElementById('delConfirmModal').classList.add('on');
    /* Re-target the shared delete button to this instance's handler. Restored to
       Fleet's executeDelete inside executeDeleteRow / cancel paths below. */
    document.getElementById('delConfirmBtn').onclick = executeDeleteRow;
    setTimeout(()=>document.getElementById('delConfirmInput').focus(), 80);
  }
  function executeDeleteRow(){
    if(!_pendingDeleteOid) return;
    if(document.getElementById('delConfirmInput').value.trim().toLowerCase() !== 'confirm'){
      toast('Type "Confirm" to delete','er'); return;
    }
    if(!canWrite(PERMK)){ toast('No permission','er'); return; }
    if(!FB_DB){ toast('Offline','er'); return; }
    const oid = _pendingDeleteOid;
    delete PLAN[oid];
    const payload = {};
    payload[`${FBN}${oid}`] = null;
    bumpVersion(payload);
    _suppressEcho++;
    FB_DB.ref().update(payload)
      .then(()=>toast('Row deleted','ok'))
      .catch(e=>{ console.error(e); toast('Delete failed','er'); })
      .finally(()=>setTimeout(()=>{_suppressEcho--;}, 600));
    try{ if(table){ const r = table.getRow(oid); if(r) r.delete(); } }catch(_){}
    refreshCounts(); refreshBadge();
    try{ if(typeof FCHECK!=='undefined') FCHECK.recompute(); }catch(_){}
    closeDelConfirm();
    /* Restore Fleet's delete handler so the shared modal works for fleet again. */
    document.getElementById('delConfirmBtn').onclick = executeDelete;
    _pendingDeleteOid = null;
  }

  /* -------- Export -------- */
  function exportCsv(){
    if(table) table.download('csv', PERMK + '_'+planDate+'_'+Date.now()+'.csv');
  }

  /* -------- Public API -------- */
  /* ════════ v4.35.0 — CUSTOMER LEDGER render layer ════════
     Pure RAM view over the SAME PLAN data (per approved mockup): one band
     per customer with MT total / loaded progress / per-order status dots /
     cert flag; orders inside without repeating customer info. The Tabulator
     stays as the editing "Table view"; toggleView switches between them and
     the choice persists in localStorage. NO Firebase reads or writes here. */
  function _ledChipKey(st){ return (st === '' || st === 'entered') ? 'pending' : st; }
  function _ledBay(r){
    /* Which station is loading this order right now (for the LOADING pill). */
    try{
      if(typeof DB_SC === 'undefined' || !DB_SC.stations) return '';
      const oid = String(r._oid||''), doStr = String(r.doNum||'').trim();
      for(const id in DB_SC.stations){
        const s = DB_SC.stations[id];
        if(!s || s.status !== 'loading') continue;
        if(oid && String(s._oid||'') === oid) return id;
        if(doStr && s.doNum && typeof dosOverlap === 'function' && dosOverlap(s.doNum, doStr)) return id;
      }
    }catch(_){}
    return '';
  }
  function _ledDoneTime(r){
    /* Latest TL timeOut among the rows that made this order DONE. */
    try{
      if(typeof TL === 'undefined' || !TL.getIndex) return '';
      const byKey = TL.getIndex().byKey;
      let bestTs = -1, bestT = '';
      [String(r._oid||'').trim(), String(r.doNum||'').trim()].forEach(k=>{
        if(!k) return;
        const m = byKey.get(k);
        if(!m) return;
        m.forEach((q, rid)=>{
          const tr = TL.ROWS[rid];
          if(!tr) return;
          const ts = tr._ts || 0;
          if(ts >= bestTs && tr.timeOut){ bestTs = ts; bestT = String(tr.timeOut); }
        });
      });
      return bestT;
    }catch(_){ return ''; }
  }
  function _ledWarn(r){
    try{
      if(typeof FCHECK === 'undefined' || !FCHECK.orderWarning) return null;
      const cd = (typeof window.parseDate === 'function') ? window.parseDate(r._forDate || planDate) : undefined;
      return FCHECK.orderWarning(r, cd || undefined);
    }catch(_){ return null; }
  }
  function applyView(){
    const pane = document.getElementById(PANE);
    if(!pane) return;
    const tableWrap = pane.querySelector('.tp-table-full');
    const led = document.getElementById(ID + 'Ledger');
    const btn = document.getElementById(ID + 'ViewToggle');
    const ledger = viewMode === 'ledger';
    if(tableWrap) tableWrap.style.display = ledger ? 'none' : '';
    if(led) led.style.display = ledger ? '' : 'none';
    if(btn) btn.textContent = ledger ? '▤ TABLE VIEW' : '▦ LEDGER VIEW';
    if(ledger) renderLedger();
    else if(table){ try{ table.redraw(true); }catch(_){} }
  }
  function toggleView(){
    viewMode = (viewMode === 'ledger') ? 'table' : 'ledger';
    try{ localStorage.setItem('lpg_v4_planview_' + ID, viewMode); }catch(_){}
    applyView();
  }
  function setLedgerFilter(f){ _ledgerFilter = f; renderLedger(); }
  function toggleGroup(key){
    const k = decodeURIComponent(key);
    _grpOpen[k] = !(_grpOpen[k] === undefined ? _grpAutoOpen[k] : _grpOpen[k]);
    renderLedger();
  }
  let _grpAutoOpen = {};   // computed per render: customer → auto open state
  function ledgerEdit(oid){
    /* Edit happens in the Tabulator — switch view, scroll to the row, flash it. */
    if(viewMode !== 'table'){ viewMode = 'table'; try{ localStorage.setItem('lpg_v4_planview_' + ID, viewMode); }catch(_){} applyView(); }
    setTimeout(()=>{
      try{
        const row = table && table.getRow(oid);
        if(row){
          table.scrollToRow(oid, 'center', false);
          const el = row.getElement();
          el.classList.remove('pl-flash'); void el.offsetWidth; el.classList.add('pl-flash');
        }
      }catch(_){}
    }, 60);
  }
  function ledgerDel(oid){
    const r = PLAN[oid];
    if(r) requestDeleteRow(r);
  }
  /* ── Ledger inline editing (parity with the table view) ──────────────
     Commit a single field through the SAME write path as the table, then
     mirror the table's cellEdited side-effects (FCHECK / WGCHECK recompute)
     and re-render. RAM-delta write only. */
  function _ledgerCommit(oid, field, value){
    editCellField(oid, field, value);
    try{ if(typeof FCHECK!=='undefined' && FCHECK.recompute) FCHECK.recompute(); }catch(_){}
    try{
      if(typeof WGCHECK!=='undefined' && WGCHECK.recheckRow
         && /^(plate|rmooc|driver|qty|doNum|customer|note|_status)$/.test(field)){
        const r = PLAN[oid]; if(r) WGCHECK.recheckRow(r);
      }
    }catch(_){}
    rebuildTableData();   /* re-renders table + ledger */
  }
  /* Click a data cell → swap to an inline input; Enter / blur commit, Esc cancels. */
  function ledgerCellEdit(oid, field, td, ev){
    if(ev){ ev.stopPropagation(); }
    if(!td || td.querySelector('input,select')) return;
    const row = PLAN[oid]; if(!row) return;
    const cur = (row[field]==null ? '' : String(row[field]));
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'pv-inp'; inp.value = cur;
    td.innerHTML = ''; td.appendChild(inp);
    inp.focus(); inp.select();
    let done = false;
    const commit = ()=>{ if(done) return; done = true;
      const v = inp.value.trim();
      if(v !== cur) _ledgerCommit(oid, field, v); else renderLedger(); };
    const cancel = ()=>{ if(done) return; done = true; renderLedger(); };
    inp.addEventListener('keydown', e=>{
      if(e.key === 'Enter'){ e.preventDefault(); commit(); }
      else if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cancel(); }
    });
    inp.addEventListener('blur', commit);
  }
  /* Double-click GATE / LOAD → toggle OK ↔ NO. */
  function ledgerToggleGL(oid, field, ev){
    if(ev){ ev.stopPropagation(); }
    const row = PLAN[oid]; if(!row) return;
    const cur = String(row[field]||'') === 'OK' ? 'OK' : 'NO';
    _ledgerCommit(oid, field, cur === 'OK' ? 'NO' : 'OK');
  }
  /* Click STATUS (manual rows only) → inline dropdown of the status options. */
  function ledgerPickStatus(oid, td, ev){
    if(ev){ ev.stopPropagation(); }
    const row = PLAN[oid]; if(!row) return;
    if(!td || td.querySelector('select')) return;
    /* v4.59 — AUTO rows are no longer blocked: the dropdown opens with every
       computed status disabled and only CANCEL selectable (atomic flip to
       MANUAL + cancel via setManualStatus). Manual rows keep full choice. */
    const isAuto = row._autoSync !== false;
    const cur = isAuto ? String(getEffectiveStatus(row)||'') : String(row._status||'');
    const sel = document.createElement('select');
    sel.className = 'pv-statsel';
    STATUS_OPTS.forEach(o=>{
      const op = document.createElement('option');
      op.value = o.val; op.textContent = o.icon + ' ' + o.label;
      if(o.val === cur) op.selected = true;
      if(isAuto && o.val !== 'cancel' && o.val !== cur) op.disabled = true;
      sel.appendChild(op);
    });
    if(isAuto) sel.title = 'Auto-sync ON — only 🚫 Cancelled can be picked here. Uncheck AUTO for full manual control.';
    td.innerHTML = ''; td.appendChild(sel); sel.focus();
    let done = false;
    const commit = ()=>{ if(done) return; done = true;
      const v = sel.value;
      if(v === cur){ renderLedger(); return; }
      if(isAuto){
        if(v === 'cancel') setManualStatus(oid, 'cancel');
        else { toast('Auto-sync ON — only Cancel can be set here','er'); renderLedger(); }
        return;
      }
      _ledgerCommit(oid, '_status', v); };
    sel.addEventListener('change', commit);
    sel.addEventListener('blur', commit);
    sel.addEventListener('keydown', e=>{ if(e.key === 'Escape'){ done = true; e.stopPropagation(); renderLedger(); } });
  }
  function _fmtMT(v){
    const n = parseFloat(v);
    if(!isFinite(n)) return '0';
    return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
  function renderLedger(){
    if(viewMode !== 'ledger') return;
    const host = document.getElementById(ID + 'Ledger');
    if(!host) return;
    /* v4.42.0 — V406-style grouped plan table (render-only; same data, same
       handlers, same date logic). TMR is a pre-load plan → no STATUS / ACTUAL
       columns. Status is shown as a read-only badge (computed), not editable. */
    const isTmr = (opts.kind === 'tomorrow');
    const rows = planRows();   // search + date filtered, sorted by paste order (_forDate → _seq)

    const info = rows.map(r=>{
      const st = getEffectiveStatus(r) || '';
      return { r, st, chip: _ledChipKey(st) };
    });
    const cnt = { all: info.length, pending:0, loading:0, done:0, cancel:0 };
    info.forEach(i=>{ if(cnt[i.chip] !== undefined) cnt[i.chip]++; });
    const shown = (_ledgerFilter === 'all') ? info : info.filter(i => i.chip === _ledgerFilter);

    /* v4.59 — Plan/Loaded/Remain theo dõi KẾ HOẠCH SALE: toàn bộ theo cột
       qty (MT). Loaded = Σ qty đơn 'done' + 'loading' (xe đang nạp tạm trừ
       khỏi Remain; về queue thì tự cộng lại). KHÔNG cân thực TL, KHÔNG max
       tole. Remain = Plan − Loaded. Khớp 1:1 với PLAN card tab Scale. */
    let planMT = 0, loadedMT = 0;
    info.forEach(i=>{
      const q = parseFloat(i.r.qty) || 0;
      if(i.st !== 'cancel') planMT += q;
      if(i.st === 'done' || i.st === 'loading') loadedMT += q;
    });
    const remainMT = Math.max(0, planMT - loadedMT);

    const FCH = [['all','ALL'],['pending','PENDING'],['loading','LOADING'],['done','DONE'],['cancel','CANCEL']];
    let h = '<div class="pl-fbar">' + FCH.map(([k,lbl])=>
      '<span class="pl-fchip'+(_ledgerFilter===k?' on':'')+'" onclick="'+G+'.setLedgerFilter(\''+k+'\')">'+lbl+' '+cnt[k]+'</span>'
    ).join('')
      + '<span class="pv-sum">Plan <b>'+_fmtMT(planMT)+'</b> · Loaded <b class="g">'+_fmtMT(loadedMT)+'</b> · Remain <b class="o">'+_fmtMT(remainMT)+'</b> MT</span>'
      + '</div>';

    if(!shown.length){
      host.innerHTML = h + '<div class="pv-empty">No orders match the current filter / search.</div>';
      return;
    }

    /* ── v4.54.1 — V406 layout: customers in display order become header rows
       INSIDE one continuous table (no collapsible cards). ── */
    const groups = [];
    const byCust = new Map();
    shown.forEach(i=>{
      const c = (i.r.customer || '—').trim() || '—';
      let g = byCust.get(c);
      if(!g){ g = { cust:c, items:[] }; byCust.set(c, g); groups.push(g); }
      g.items.push(i);
    });

    /* Sub-group colour bands (ported from V406 SG_COLORS / SG_BORDERS): a
       distinct hue per sub-group, cycling per customer. */
    const SG_COLORS = ['rgba(0,200,216,.07)','rgba(255,140,0,.08)','rgba(120,80,255,.09)','rgba(0,220,100,.07)','rgba(255,60,120,.08)','rgba(0,160,255,.08)','rgba(255,220,0,.07)','rgba(180,90,30,.09)'];
    const SG_BORDERS = ['rgba(0,200,216,.35)','rgba(255,140,0,.40)','rgba(120,80,255,.40)','rgba(0,220,100,.35)','rgba(255,60,120,.40)','rgba(0,160,255,.40)','rgba(255,220,0,.35)','rgba(180,90,30,.40)'];
    const sgColorIdx = {}, custSgCount = {};
    shown.forEach(i=>{
      const c = (i.r.customer || '—').trim() || '—';
      const key = c + '||' + i.r._subGroup;
      if(sgColorIdx[key] === undefined){
        if(custSgCount[c] === undefined) custSgCount[c] = 0;
        sgColorIdx[key] = custSgCount[c]++;
      }
    });

    /* One shared header for the whole table; widths in px (V406-style). */
    const colSpec = [['#',42]];
    if(!isTmr) colSpec.push(['AUTO',34]);
    colSpec.push(['DATE',72]);
    if(!isTmr) colSpec.push(['STATUS',122]);
    colSpec.push(['PLATE',100],['RMOOC',84],['DRIVER',130],['QTY (MT)',64],['TOL.',48]);
    if(!isTmr) colSpec.push(['ACTUAL',66]);
    colSpec.push(['GATE',48],['LOAD',48],['DO NO.',108],['NOTE',160],['PRICE',66],['',56]);
    const N = colSpec.length;
    const headCols = '<tr>'+colSpec.map(c=>'<th style="width:'+c[1]+'px">'+c[0]+'</th>').join('')+'</tr>';

    h += '<div class="pv-scroll"><table class="pv-tbl"><thead>'+headCols+'</thead><tbody>';

    groups.forEach(g=>{
      const short = (typeof CT!=='undefined' && CT.lookup) ? CT.lookup(g.cust) : g.cust;
      const hasShort = short && short !== g.cust;
      let gQty = 0, gAct = 0;

      let body = '', lastSg = null;
      g.items.forEach((i, idx)=>{
        const r = i.r, st = i.st;
        const q = parseFloat(r.qty) || 0;
        if(st !== 'cancel') gQty += q;
        const akg = parseFloat(computeActualFromState(r));
        const actMT = (isFinite(akg) && akg > 0) ? akg/1000 : 0;
        if(st === 'done') gAct += (actMT>0?actMT:q);

        const oid = String(r._oid||'').replace(/['"\\]/g,'');

        /* STATUS split-button (V406 .sbtn) — today only; TMR is a draft. */
        let stCell = '';
        if(!isTmr){
          let lbl = '—', scls = '';
          if(st === 'entered'){ lbl='🚛 Entered'; scls=' ent'; }
          else if(st === 'loading'){ const bay=_ledBay(r); lbl='⛽ Loading'+(bay?' · '+escapeHtml(bay):''); scls=' load'; }
          else if(st === 'done'){ const t=_ledDoneTime(r); lbl='✅ Completed'+(t?' '+escapeHtml(t):''); scls=' done'; }
          else if(st === 'cancel'){ lbl='🚫 Cancelled'; scls=' cxl'; }
          const autoOnS = r._autoSync !== false;
          const lock = autoOnS ? ' lock' : '';
          const btn = '<span class="pv-stwrap"><span class="pv-sbtn split'+scls+lock+'">'+lbl+'</span><span class="pv-sbtn arrow'+scls+lock+'">▾</span></span>';
          /* v4.59 — AUTO cells are clickable too: the picker opens with only
             🚫 Cancel selectable (computed statuses stay read-only). */
          stCell = autoOnS
            ? '<td class="pv-stc pv-editable" title="Auto-sync ON (computed). Click to CANCEL this order — uncheck AUTO for full manual." onclick="'+G+'.ledgerPickStatus(\''+oid+'\',this,event)">'+btn+'</td>'
            : '<td class="pv-stc pv-editable" title="Click to set status (manual)" onclick="'+G+'.ledgerPickStatus(\''+oid+'\',this,event)">'+btn+'</td>';
        }

        /* DO cell — mirror the table-view doFormatter. */
        const dn = String(r.doNum||'').trim();
        let doH;
        if(isRealDO(dn))        doH = '<span class="pv-do">'+escapeHtml(dn)+'</span>';
        else if(isTempOid(dn))  doH = '<span class="pv-do temp" title="Temp DO — auto-upgrades when WMS GI matches">'+escapeHtml(dn)+'</span>';
        else if(!dn)            doH = '<span class="pv-do none">no DO</span>';
        else                    doH = '<span class="pv-do none" title="No temp DO yet">'+escapeHtml(dn)+'</span>';
        let doBadges = ''; try{ if(typeof WGCHECK!=='undefined' && WGCHECK.badgeHtml) doBadges = WGCHECK.badgeHtml(r) || ''; }catch(_){}
        const tolRaw = String(r.tolerance||'').trim();

        /* PLATE cell — WG plate-diff → Fleet-missing → cert blink */
        const plateV = String(r.plate||'').trim();
        let plateH;
        if(!plateV){ plateH = '<span class="pv-cell-empty">—</span>'; }
        else {
          let resolved = false;
          try{ if(typeof WGCHECK!=='undefined' && WGCHECK.plateHasDiff && WGCHECK.plateHasDiff(r)){
            const tip = (r._wgWarns||[]).filter(w=>w.code==='PLATE_DIFF').map(w=>w.msg).join(' · ').replace(/"/g,'&quot;');
            plateH = '<span class="tp-plate-wg-diff" title="'+tip+'">'+escapeHtml(plateV)+'</span>'; resolved = true;
          }}catch(_){}
          if(!resolved){ let missing=false; try{ if(typeof FCHECK!=='undefined' && FCHECK.plateInFleet) missing = !FCHECK.plateInFleet(plateV); }catch(_){}
            if(missing){ plateH = '<span class="fc-plate-missing" title="Plate not found in Fleet — verify">'+escapeHtml(plateV)+'</span>'; resolved = true; } }
          if(!resolved){ try{ if(typeof FCHECK!=='undefined' && FCHECK.cellWarn){ const w=FCHECK.cellWarn(r,'plate'); if(w.blink){ plateH='<span class="tp-cert-blink">'+escapeHtml(plateV)+'</span>'+w.badges; resolved=true; } } }catch(_){} }
          if(!resolved) plateH = escapeHtml(plateV);
        }
        /* RMOOC cell */
        const rmoocV = String(r.rmooc||'').trim();
        let rmoocH = rmoocV ? escapeHtml(rmoocV) : '<span class="pv-cell-empty">—</span>';
        if(rmoocV){ try{ if(typeof FCHECK!=='undefined' && FCHECK.cellWarn){ const w=FCHECK.cellWarn(r,'rmooc'); if(w.blink) rmoocH='<span class="tp-cert-blink">'+escapeHtml(rmoocV)+'</span>'+w.badges; } }catch(_){} }
        /* DRIVER cell */
        const drvV = String(r.driver||'').trim();
        let drvH = drvV ? escapeHtml(drvV) : '<span class="pv-cell-empty">—</span>';
        if(drvV){ try{ if(typeof FCHECK!=='undefined' && FCHECK.cellWarn){ const w=FCHECK.cellWarn(r,'driver'); if(w.blink) drvH='<span class="tp-cert-blink">'+escapeHtml(drvV)+'</span>'+w.badges; } }catch(_){} }

        /* AUTO-sync toggle (today only) */
        const autoOn = r._autoSync !== false;
        const autoH = '<input type="checkbox" class="tp-sync-chk" '+(autoOn?'checked':'')
                    + ' title="'+(autoOn?'Auto-sync ON — uncheck to edit status manually':'Manual (locked) — check to re-enable')+'"'
                    + ' onclick="event.stopPropagation(); '+ID+'ToggleRowSync(\''+oid+'\')">';
        /* DATE cell */
        const fd = String(r._forDate||'').trim();
        let dateH;
        if(!fd)                   dateH = '<span class="tp-fordate-stale">—</span>';
        else if(fd === isoToday())dateH = '<span class="tp-fordate-today">'+escapeHtml(isoLabel(fd))+'</span>';
        else if(fd > isoToday())  dateH = '<span class="tp-fordate-future" title="Future plan — cannot be assigned yet">'+escapeHtml(isoLabel(fd))+'</span>';
        else                      dateH = '<span class="tp-fordate-stale" title="Stale plan from '+escapeHtml(isoLabel(fd))+'">'+escapeHtml(isoLabel(fd))+'</span>';
        /* row-level WG-warning tint */
        let warnCls = '';
        try{ if(typeof WGCHECK!=='undefined' && WGCHECK.rowLevel){ const lvl=WGCHECK.rowLevel(r); if(lvl==='plate') warnCls=' tr-wg-warn-plate'; else if(lvl==='any') warnCls=' tr-wg-warn'; } }catch(_){}

        const noteRaw = String(r.note||'');
        let noteH = '';
        noteH += typeBadgeHtml(r.type);   /* v4.66 — non-50:50 product-type warning */
        if(/8\s*h|trước\s*8|truoc\s*8|before\s*8/i.test(noteRaw)) noteH += '<span class="pv-h8">8H</span>';
        const warn = _ledWarn(r);
        if(warn && warn.hasWarn){ const tip=warn.badges.map(b=>b.text).join(' · '); noteH += '<span class="pv-cw" title="'+escapeHtml(tip)+'">⚠</span>'; }
        noteH += escapeHtml(noteRaw);

        const gateOk = String(r.allowGate||'')==='OK', loadOk = String(r.allowLoad||'')==='OK';
        const gateH = '<span class="pv-gl '+(gateOk?'ok':'no')+'">'+(gateOk?'OK':'NO')+'</span>';
        const loadH = '<span class="pv-gl '+(loadOk?'ok':'no')+'">'+(loadOk?'OK':'NO')+'</span>';

        let priceH = '';
        if(typeof PP!=='undefined' && PP.planLookupPrice){
          const p = PP.planLookupPrice(hasShort?short:g.cust, r.type, '');
          if(typeof p === 'number' && isFinite(p) && p>0) priceH = String(p);
        }

        /* Status tint wins over the sub-group band (V406 rule). */
        const statusCls = (st==='done')?' done':(st==='loading')?' loading':(st==='cancel')?' cancel':(st==='entered')?' entered':'';
        const sgKey = ((r.customer||'—').trim()||'—') + '||' + r._subGroup;
        const colorIdx = (sgColorIdx[sgKey]||0) % SG_COLORS.length;
        /* Thin coloured divider when the sub-group changes within a customer. */
        if(idx > 0 && r._subGroup !== lastSg){
          body += '<tr class="pv-sgdiv"><td colspan="'+N+'" style="background:'+SG_BORDERS[colorIdx]+'"></td></tr>';
        }
        lastSg = r._subGroup;
        const sgStyle = statusCls ? '' : (' style="background-color:'+SG_COLORS[colorIdx]+';border-left:3px solid '+SG_BORDERS[colorIdx]+'"');

        const ec = (field)=>' pv-editable" onclick="'+G+'.ledgerCellEdit(\''+oid+'\',\''+field+'\',this,event)';
        body += '<tr class="pv-row'+statusCls+warnCls+'"'+sgStyle+'>'
          + '<td class="pv-no">'+escapeHtml(String(r.no||idx+1))+'</td>'
          + (isTmr?'':'<td class="pv-autoc">'+autoH+'</td>')
          + '<td class="pv-datec">'+dateH+'</td>'
          + stCell
          + '<td class="pv-plate'+ec('plate')+'" title="Click to edit">'+plateH+'</td>'
          + '<td class="pv-rmooc'+ec('rmooc')+'" title="Click to edit">'+rmoocH+'</td>'
          + '<td class="pv-drv'+ec('driver')+'" title="Click to edit">'+drvH+'</td>'
          + '<td class="pv-num'+ec('qty')+'" title="Click to edit">'+escapeHtml(String(r.qty||'—'))+'</td>'
          + '<td class="pv-num tol'+ec('tolerance')+'" title="Click to edit">'+(tolRaw?escapeHtml(tolRaw):'—')+'</td>'
          + (isTmr?'':'<td class="pv-num act'+(actMT>0?'':' act-empty')+(autoOn?'">':' pv-editable" title="Click to edit actual (manual)" onclick="'+G+'.ledgerCellEdit(\''+oid+'\',\'_actualQty\',this,event)">')+(actMT>0?_fmtMT(actMT):'—')+'</td>')
          + '<td class="pv-c pv-editable" title="Double-click to toggle OK / NO" ondblclick="'+G+'.ledgerToggleGL(\''+oid+'\',\'allowGate\',event)">'+gateH+'</td>'
          + '<td class="pv-c pv-editable" title="Double-click to toggle OK / NO" ondblclick="'+G+'.ledgerToggleGL(\''+oid+'\',\'allowLoad\',event)">'+loadH+'</td>'
          + '<td class="pv-docell'+ec('doNum')+'" title="Click to edit DO">'+doH+doBadges+'</td>'
          + '<td class="pv-note'+ec('note')+'" title="Click to edit">'+(noteH||'—')+'</td>'
          + '<td class="pv-price">'+(priceH||'')+'</td>'
          + '<td class="pv-act"><button class="ed" title="Edit (full form)" onclick="'+G+'.ledgerEdit(\''+oid+'\')">✎</button><button class="de" title="Delete" onclick="'+G+'.ledgerDel(\''+oid+'\')">✕</button></td>'
          + '</tr>';
      });

      /* Customer header row INSIDE the table (V406 .tr-cust). */
      const gName = hasShort
        ? '<b class="pv-gname">'+escapeHtml(short)+'</b><span class="pv-gfull">('+escapeHtml(g.cust)+')</span>'
        : '<b class="pv-gname">'+escapeHtml(g.cust)+'</b><span class="pv-noshort">⚠ NO SHORT</span>';
      /* v4.66 — group type chip: highlight + badge when ANY order in the
         group carries a non-50:50 product type (full C3:C4 ratio range) */
      const gTypeRaw = (g.items[0] && g.items[0].r.type) ? String(g.items[0].r.type) : '';
      const gSpecials = Array.from(new Set(
        g.items.map(it=>prodRatio(it.r.type)).filter(rt=>rt && rt!=='50:50')
      ));
      let typeChip = gTypeRaw ? '<span class="pv-type'+(gSpecials.length?' pv-type-warn':'')+'">'+escapeHtml(gTypeRaw)+'</span>' : '';
      if(gSpecials.length){
        typeChip += '<span class="tp-type-badge" title="Nhóm có đơn hàng product type '+gSpecials.join(', ')
                  + ' — KHÁC hàng phổ thông 50:50. Kiểm tra tank/lot/COQ trước khi cân!">⚠ '+gSpecials.join(' · ')+'</span>';
      }
      const actChip  = (!isTmr && gAct>0) ? '<span class="pv-gact">✅ '+_fmtMT(gAct)+' MT</span>' : '';
      const cntChip  = '<span class="pv-gmeta" style="font-size:10px;color:#6b8299;margin-left:8px">'+g.items.length+' order'+(g.items.length>1?'s':'')+'</span>';
      const custCell = gName + typeChip + cntChip + '<span class="pv-gqty">'+_fmtMT(gQty)+' MT</span>' + actChip;

      h += '<tr class="pv-cust"><td colspan="'+N+'">'+custCell+'</td></tr>' + body;
    });
    h += '</tbody></table></div>';
    host.innerHTML = h;
  }
  const API = {
    init(){
      const cached = loadCache();
      if(cached){
        Object.assign(PLAN, cached.data || {});
        _versions = cached.versions || _versions;
      }
      refreshBadge();
      attachFirebase();
      applyView();   /* v4.35.0 — restore the saved Ledger/Table view */
      /* v4.59 — self-healing repaint. Status/Actual are COMPUTED at render
         time (RAM-only); if any push event is ever missed (listener race,
         suppressed echo, tab hidden), the row froze until a manual AUTO
         toggle. A cheap 30s reformat guarantees the view converges to the
         real TL / station state with zero Firebase traffic. */
      setInterval(()=>{ try{ if(!document.hidden) refreshStatus(); }catch(_){} }, 30000);
    },
    buildTable,
    rebuildTableData,
    openPaste, closePaste, submitPaste,
    closeChoice, runChoice,
    closeDiff, confirmDiff,
    clearAll, requestDeleteRow, exportCsv,
    createTempDO, toggleRowSync,
    autoSet, refreshStatus,
    setPlanDate, toggleDateSel, clearDateSel,
    _clearDatesActual,
    findTempOrderByVehicle, findTempOrderStrict, renameOid,
    /* v4 — exposed so WMS GI can reuse the SAME plate/driver matchers (handles
       WMS reversed driver name + combined truck/rmooc plate). Logic unchanged. */
    plateMatchAny: _plateMatchAny, driverMatch: _driverMatch,
    /* v4.35.0 — Customer Ledger view */
    toggleView, setLedgerFilter, toggleGroup, ledgerEdit, ledgerDel, renderLedger,
    ledgerCellEdit, ledgerToggleGL, ledgerPickStatus,
    getEffectiveStatus,   /* v4.22.7 — RAM-only status check (TL.ROWS + DB_SC.stations).
                              Used by SCALE.scShowResults to gray out done/cancel orders
                              and by scAssignToStation as a defense-in-depth race guard. */
    getEffectiveActual,   /* RAM-only ACTUAL loaded (kg) for a row from TL weights.
                              Dùng cho PLAN card donut (SCALE._updateRow1) để LOADED
                              lấy ĐÚNG khối lượng cân thực, không dùng plan qty. */
    get table(){ return table; },
    get PLAN(){ return PLAN; },
    get planDate(){ return planDate; },
    get autoSync(){ return autoSync; },
    set autoSync(v){ autoSync = !!v; }
  };
  return API;
}

/* Instantiate the two PLAN modules.
   - TP   handles \"plan_today_\"    (default load date = today)
   - TMR  handles \"plan_tomorrow_\" (default load date = tomorrow)
   Each gets its own Firebase node, localStorage cache, Tabulator table and
   modal DOM ids. They share zero state at runtime. */
function _isoToday(){
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
function _isoTomorrow(){
  const d = new Date(); d.setDate(d.getDate()+1);
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
const TP = _makePlanModule({
  kind:'today', idPrefix:'tp', fbNode:'plan_today/',
  versionKey:'plan_today_version', lsKey:'lpg_v4_plan_v1',
  permKey:'plan_today', uiLabel:'Today Plan',
  defaultDate: _isoToday,
  minFuture: false       /* Today Plan accepts any date (operator's responsibility) */
});
const TMR = _makePlanModule({
  kind:'tomorrow', idPrefix:'tmr', fbNode:'plan_tomorrow/',
  versionKey:'plan_tomorrow_version', lsKey:'lpg_v4_plan_tmr_v1',
  permKey:'plan_tomorrow', uiLabel:'Tomorrow Plan',
  defaultDate: _isoTomorrow,
  minFuture: true        /* Tomorrow Plan only accepts dates AFTER today */
});

/* Tabulator-level shims used by Today Plan (mirrors fleet helpers) */
function tpOpenPaste(){ TP.openPaste(); }
function tpClosePaste(){ TP.closePaste(); }
function tpSubmitPaste(){ TP.submitPaste(); }
function tpCloseChoice(){ TP.closeChoice(); }
function tpRunChoice(m){ TP.runChoice(m); }
function tpCloseDiff(){ TP.closeDiff(); }
function tpConfirmDiff(){ TP.confirmDiff(); }
function tpClearAll(){ TP.clearAll(); }
function tpRequestDeleteRow(r){ TP.requestDeleteRow(r); }
function tpExportCsv(){ TP.exportCsv(); }
function tpCreateTemp(){ TP.createTempDO(); }
function tpToggleRowSync(oid){ TP.toggleRowSync(oid); }
function tpChangePlanDate(iso){ TP.setPlanDate(iso); }
function tpToggleDate(iso){ TP.toggleDateSel(iso); }
function tpClearDateSel(){ TP.clearDateSel(); }

/* Tabulator-level shims used by Tomorrow Plan (mirror of tp* helpers; same
   factory module, different instance) */
function tmrOpenPaste(){ TMR.openPaste(); }
function tmrClosePaste(){ TMR.closePaste(); }
function tmrSubmitPaste(){ TMR.submitPaste(); }
function tmrCloseChoice(){ TMR.closeChoice(); }
function tmrRunChoice(m){ TMR.runChoice(m); }
function tmrCloseDiff(){ TMR.closeDiff(); }
function tmrConfirmDiff(){ TMR.confirmDiff(); }
function tmrClearAll(){ TMR.clearAll(); }
function tmrRequestDeleteRow(r){ TMR.requestDeleteRow(r); }
function tmrExportCsv(){ TMR.exportCsv(); }
function tmrCreateTemp(){ TMR.createTempDO(); }
function tmrToggleRowSync(oid){ TMR.toggleRowSync(oid); }
function tmrChangePlanDate(iso){ TMR.setPlanDate(iso); }
function tmrToggleDate(iso){ TMR.toggleDateSel(iso); }
function tmrClearDateSel(){ TMR.clearDateSel(); }

/* ─── Shared Clear-All modal handlers (TP & TMR) ─────────────────
   The modal is shared DOM; the owning plan module is stashed on
   window._planClearOwner when clearAll() is called and is the only
   route by which planClearConfirm() applies the wipe. No Firebase
   activity until the operator clicks "Clear selected". */
function planClearClose(){
  document.getElementById('planClearModal').classList.remove('on');
  window._planClearOwner = null;
}
function planClearToggleAll(on){
  document.querySelectorAll('#planClearList .planClearDateChk').forEach(cb => { cb.checked = !!on; });
}
function planClearConfirm(){
  const owner = window._planClearOwner;
  if(!owner){ planClearClose(); return; }
  const checks = Array.from(document.querySelectorAll('#planClearList .planClearDateChk'));
  const picked = checks.filter(c => c.checked).map(c => c.dataset.date);
  if(!picked.length){ toast('Pick at least one date','er'); return; }
  owner._clearDatesActual(picked);
  planClearClose();
}

/* ─── PROMOTE TOMORROW → TODAY ──────────────────────────────────
   Single-batch Firebase write that:
     1. nulls every key under plan_today/
     2. nulls every key under plan_tomorrow/
     3. re-creates each Tomorrow row under plan_today/ preserving
        the original _forDate (the date picker in Today Plan toolbar
        lets the operator switch between dates).
   The whole operation is sent as ONE multi-path update() so other
   clients see today wipe + new today rows atomically. */
function tmrOpenPromote(){
  const today  = Object.keys(TP.PLAN || {}).length;
  const tmrRow = Object.keys(TMR.PLAN || {}).length;
  if(!tmrRow){ toast('Tomorrow Plan is empty — nothing to promote','er'); return; }
  document.getElementById('tmrPromoteCount').textContent    = tmrRow;
  document.getElementById('tmrPromoteOldCount').textContent = today;
  document.getElementById('tmrPromoteModal').classList.add('on');
}
function tmrClosePromote(){
  document.getElementById('tmrPromoteModal').classList.remove('on');
}
function tmrPromoteToToday(){ tmrOpenPromote(); }
function tmrConfirmPromote(){
  tmrClosePromote();
  if(!canWrite('plan_today') || !canWrite('plan_tomorrow')){
    toast('You do not have permission to promote','er'); return;
  }
  if(typeof firebase === 'undefined'){ toast('Offline — Firebase not connected','er'); return; }
  const FB = firebase.database();
  const tmrRows = Object.values(TMR.PLAN || {});
  if(!tmrRows.length){ toast('Tomorrow Plan is empty','er'); return; }
  const payload = {};
  /* 1) wipe existing Today Plan (every date inside it) */
  Object.keys(TP.PLAN || {}).forEach(oid => {
    payload['plan_today/'+oid] = null;
  });
  /* 2) wipe Tomorrow source */
  Object.keys(TMR.PLAN || {}).forEach(oid => {
    payload['plan_tomorrow/'+oid] = null;
  });
  /* 3) insert each Tomorrow row under plan_today/ PRESERVING _forDate.
     The timestamp tells the software which day each row is meant for —
     the date picker on Today Plan toolbar lets the operator switch between
     dates to view / load each. Rows whose _forDate is not today are still
     blocked from Scale-assignment until their date arrives. */
  tmrRows.forEach(r => {
    const cloned = {};
    Object.keys(r).forEach(k => { if(!k.startsWith('__')) cloned[k] = r[k]; });
    /* keep r._forDate untouched */
    /* drop runtime status — promoted rows start fresh (AUTO will recompute) */
    cloned._status    = '';
    cloned._actualQty = '';
    /* v4.59 — promoted rows are ALWAYS reset to AUTO. Preserving a manual lock
       here was a trap: _status/_actualQty are wiped above, so a row promoted
       with _autoSync:false stayed frozen on "Pending" all day (never synced
       Loading/Done from the scale) until someone noticed the unchecked box. */
    cloned._autoSync  = true;
    cloned.lastBy = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER.name) ? CURRENT_USER.name : 'system';
    cloned.lastAt = Date.now();
    payload['plan_today/'+r._oid] = cloned;
  });
  /* bump both version counters so all listeners refresh */
  payload['plan_today_version']    = Date.now();
  payload['plan_tomorrow_version'] = Date.now();
  FB.ref().update(payload)
    .then(()=> toast('Promoted '+tmrRows.length+' row(s) → Today Plan','ok'))
    .catch(e=>{ console.error('promote', e); toast('Promote failed: '+(e.message||e),'er'); });
  try{ logAudit('plan_today:promote', '_bulk_', '_promoteFromTomorrow', Object.keys(TP.PLAN||{}).length, tmrRows.length, 'promote'); }catch(_){}
  /* v4.21.0 — wipe the wait-queue: queue items reference _oid into TP.PLAN
     (and possibly TMR.PLAN) which is fully replaced by this promote, so
     stored _oids would be stale. Single-shot Firebase delete via SCALE. */
  try{ if(typeof SCALE!=='undefined' && SCALE.waitClear) SCALE.waitClear(); }catch(_){}
}

function switchSalesTab(t){
  document.querySelectorAll('#salesSubs .stab').forEach(s=>s.classList.toggle('on', s.dataset.sub===t));
  document.querySelectorAll('#page-sales .sub-pane').forEach(p=>p.classList.toggle('on', p.id==='sub-'+t));
  if(t==='scale'){ scRenderCtrl(); try{ if(typeof FCHECK!=='undefined') FCHECK.renderPanel(); }catch(_){} }
  /* TL Data: lazy-build its Tabulator the first time the sub-tab is opened.
     Without this the grid div stays empty even though ROWS / cache hold data
     (badge + CSV export read ROWS directly, so they looked correct). */
  if(t==='tl' && !TL.table){ TL.buildTable(); }
  if(t==='tl' && TL.table){ setTimeout(()=>{ try{ TL.table.redraw(true); }catch(_){ } }, 50); }
  if(t==='wms' && !WG.table){ WG.buildTable(); }
  if(t==='st' && !WS.table){ WS.buildTable(); }
  if(t==='sap' && !SP.table){ SP.buildTable(); }
  if(t==='cust' && !CT.table){ CT.buildTable(); }
  if(t==='price' && !PP.table){ PP.buildTable(); }
  if(t==='tmr' && !TMR.table){ TMR.buildTable(); }
  if(t==='today' && TP.table){ setTimeout(()=>{ try{ TP.table.redraw(true); }catch(_){ } }, 50); }
  if(t==='tmr' && TMR.table){ setTimeout(()=>{ try{ TMR.table.redraw(true); }catch(_){ } }, 50); }
  if(t==='wms' && WG.table){ setTimeout(()=>{ try{ WG.table.redraw(true); }catch(_){ } }, 50); }
  if(t==='st' && WS.table){ setTimeout(()=>{ try{ WS.table.redraw(true); }catch(_){ } }, 50); }
  if(t==='sap' && SP.table){ setTimeout(()=>{ try{ SP.table.redraw(true); }catch(_){ } }, 50); }
  if(t==='cust' && CT.table){ setTimeout(()=>{ try{ CT.table.redraw(true); }catch(_){ } }, 50); }
  if(t==='price' && PP.table){ setTimeout(()=>{ try{ PP.table.redraw(true); }catch(_){ } }, 50); }
  if(t==='vs'){ try{ if(typeof vsRender==='function') vsRender(); }catch(_){ } }
  /* v4.68 — Allocation planner: dựng/tính lại mỗi lần mở tab vì nó đọc
     SP.ROWS + ENG.ROWS trực tiếp (không có listener riêng cho hai nguồn này). */
  if(t==='alloc'){ try{ ALLOC.refresh(); }catch(e){ console.warn('[ALLOC] open tab', e); } }
}

/* live search wiring */
document.getElementById('tpSearch').addEventListener('input', ()=>{
  if(TP.table) TP.rebuildTableData();
});
document.getElementById('tmrSearch').addEventListener('input', ()=>{
  if(TMR.table) TMR.rebuildTableData();
});

/* close TP/TMR modals on Escape (extends the fleet ESC handler) */
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    document.getElementById('tpPasteModal').classList.remove('on');
    document.getElementById('tpPchoiceModal').classList.remove('on');
    document.getElementById('tpDiffModal').classList.remove('on');
    document.getElementById('tmrPasteModal').classList.remove('on');
    document.getElementById('tmrPchoiceModal').classList.remove('on');
    document.getElementById('tmrDiffModal').classList.remove('on');
    document.getElementById('tmrPromoteModal').classList.remove('on');
  }
});

/* ============================================================
   WMS GI MODULE  (build p1.9-wms-gi)
   ─────────────────────────────────────────────────────────
   Goods-Issue register imported from the WMS Excel export.
   Architecture mirrors the Fleet Sync Core:
     - Per-field delta writes via multi-path update (wms_gi_/{rid}/{field}).
     - localStorage cache (key 'lpg_v4_wms_v1') for instant, offline-safe UI.
     - Own version counter node 'wms_gi_version' (bumped per write batch).
     - rid = 12-char base36 random (collision-safe, offline-create friendly).
   Identity / paste merge:
     - Rows are matched on delivId (the WMS Delivery-ID). A re-paste UPDATES
       the matching row's changed fields and ADDS rows with new delivId
       (mirrors v406 _wmsSaveIncoming). Existing rows whose delivId is absent
       from the paste are KEPT (the export is incremental, not authoritative).
     - Leading zeros are stripped from delivId at the source (v406 behavior).
   Date handling:
     - transDate / arrival are normalized to canonical DD/MM/YY via
       normalizeDate() at applyAndPush() time (source-of-truth), never at
       display. parseDate() already understands YYYYMMDD compact ISO.
   NOTE: TL Data / Today-Plan cross-checks are intentionally NOT wired here
         (to be added in a later phase once a TL Data tab exists).
   ============================================================ */
