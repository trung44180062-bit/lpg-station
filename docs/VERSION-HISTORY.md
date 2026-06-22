# VERSION HISTORY — V4-54 (tách từ comment dòng 5730–8714)

> Chuyển khối comment lịch sử ra khỏi file JS cho nhẹ token. Nội dung nguyên văn:

```text
/* ============================================================
   VERSION HISTORY (read this to resume work in later sessions)
   ------------------------------------------------------------
   v4.55.1 (bulk-delete-no-csv-for-wms-sap) — current
     BỎ chức năng tự tải file CSV khi XÓA dữ liệu cho 3 module:
     WMS GI (wg.js), WMS ST (ws.js), SAP (sp.js). Cách làm: thêm cờ
     skipCsvBackup:true vào cfg truyền cho BULKOPS.openRangeDelete().
     Trong BULKOPS._run() (bulkops.js) bước export CSV nay chạy có
     điều kiện: if(!_cfg.skipCsvBackup) exportRowsCsv(...); toast cũng
     bỏ chữ "(CSV backup downloaded)" khi skip. Cờ được lấy ra biến
     local TRƯỚC closeRangeDelete() vì hàm đó set _cfg=null.
     GIỮ NGUYÊN backup CSV-khi-xóa cho TL Data (tl.js), Tank Log
     (eng.js), Vessel Log (vlog.js) — không nằm trong yêu cầu.
     Không đổi schema / Firebase.
   ------------------------------------------------------------
   v4.54.0 (p31.4-cavern-collapsible-sections) — current
     Each Cavern data area is now collapsible via a click header
     (caret ▼/▶): ✍️ MANUAL INPUT (#cavBodyInput), 📑 SAP WMS REPORT
     fill (#cavBodyExport), 📋 SAP WMS TABLE (#cavBodyTable), 🧾 ENTRIES
     LOG (#cavBodyLog). Global cavToggle(id, btn) flips display + caret;
     headers use class .cav-sec-hdr / .cav-caret. No data/schema change.
   ------------------------------------------------------------
   v4.53.0 (p31.3-cavern-exact-excel-layout-table) — current
     The on-screen "SAP WMS TABLE" now renders the EXACT layout of the
     Cavern Excel file: the real 4-tier grouped header (extracted from the
     file's merged cells) + EVERY column (Propane 83 cols, Butane 58).
     Embedded const CAV_LEDGER = { c3:{ncol,hdr[]}, c4:{ncol,hdr[]} } holds
     the header model ({t,c=colspan,r=rowspan} per cell). viewTable(mode)
     builds <thead> from it (_hdrHTML) + one <tr> per day (date col + N-1
     cells) + a TOTAL <tfoot>. MANUAL columns show live ton values via
     _manTon()/FILL_C3 (Propane 1-based cols 10 VLGC · 14/15/16/17 GR
     P/X/D/E · 35/37 OL1 P · 38/40 OL1 X · 41 OL1 X+P · 45 Heater);
     all other columns render blank until APP/SAP/formula values are wired.
     Butane uses its own exact header; its manual fill map is pending.
     New .cav-led CSS (sticky grouped header, monospace nums, hover).
     User intent: keep the table IDENTICAL to the file now; group/filter/
     sort come later. No Firebase/schema change.
   ------------------------------------------------------------
   v4.52.0 (p31.2-cavern-onscreen-sap-wms-table) — current
     Added an ON-SCREEN "SAP WMS TABLE" viewer in Reports ▸ Cavern Daily,
     so the report data can be checked in-app (no need to export the xlsx).
     UI: Product C3/C4 + a Month picker (View month) + From/To date inputs
     (View range). CAV.viewTable(mode) renders one row per day in the
     range with the MANUAL ledger columns in TON (VLGC in · GR P/X/D/E ·
     OL1 P/X/X+P [C3 only] · Heater · entry count) + a TOTAL footer row;
     days with no manual entry are dimmed. Values come live from
     CAV.ROWS via _agg(date) (RAM). #cavMonth defaults to the current
     month on init. APP/SAP columns are intentionally omitted here until
     their values are wired (same pending item as the fill map).
     Helper added: _dateRange(from,to) (inclusive, 400-day guard).
     No Firebase/schema change.
   ------------------------------------------------------------
   v4.51.0 (p31.1-cavern-report-subtab-fill-preview) — current
     CAV reworked per user feedback (4 asks in one pass):
     (1) VLGC-IN and GR 통관 now capture BOTH C3 and C4 (separate kg
         fields); each Add pushes one Firebase child per non-zero figure.
     (2) OL1 SUPPLY split into 3 inputs: Total (X+P) → batch 'PX',
         X → batch 'X', P → batch 'P' (all C3). Maps to Propane ledger
         col 40 (total), col 37 (X / EX-PETCHEM), col 34 (P / PETCHEM).
     (3) CAVERN DAILY moved OUT of Engineer INTO a Reports sub-tab.
         page-report now has a subtab bar (#rptSubs): "Daily Stock"
         (existing rpt-shell) ↔ "Cavern Daily / SAP WMS" (#rpt-pg-cavern).
         rptSwitchTab(sub) toggles rpt-shell vs #rpt-pg-cavern display and
         calls CAV.render(). Engineer ▸ Cavern Daily button removed;
         #eng-pg-cavern reverted to a "moved to Reports" placeholder;
         engSwitchTab cavern branch removed. Badge #engBadgeCavern now
         lives on the Reports cavern subtab button.
     (4) SAP-WMS report fill UI added: 📂 Choose WMS SAP file (.xlsx,
         stored in RAM), 👁 Preview fill (by date), ⬇ Export filled .xlsx.
         CAV.preview() builds, for the selected date, the exact column→
         source→value table that WILL be written into the Propane sheet
         (col indices per HANDOFF; values in TON; formula/derived cols
         left untouched), exactly like the Daily Stock report flow.
         MANUAL columns (9 VLGC, 13/14/15/16 GR P/X/D/E, 34/37/40 OL1
         P/X/total, 44 Heater) are computed live from CAV.ROWS;
         APP columns (43 Pure, 48/49 Domestic 2100/2101, 52 vessel,
         54/55 Export 2100/2101 — from WMS GI/TL/Vessel) and SAP columns
         (58/60/62/69 End Batch Stock — from ZMMFR022) are listed with
         their target cells and marked "(auto)" pending wiring.
     ASSUMPTION / NEXT: the actual .xlsx cell-WRITE (JSZip, same approach
     as RPT — loadAsync → edit xl/worksheets + sharedStrings → generateAsync)
     is the next increment; exportReport() currently runs preview() and
     toasts that cell-write is pending. Also pending: wire APP/SAP column
     values into the fill map; Butane (C4) sheet fill; GR↔SAP reconcile.
     Firebase entry shape extended: prod now 'c3'|'c4'; batch adds 'PX'.
   ------------------------------------------------------------
   v4.50.0 (p31.0-cavern-daily-manual-inputs) — current
     NEW MODULE: CAV — "Cavern Daily" (Engineer ▸ Cavern Daily subtab,
     #eng-pg-cavern, previously a "Coming in a later phase" placeholder).
     Purpose: capture the daily MANUAL inputs the app does not already have,
     so a SAP-WMS batch-stock report (the LPG_Cavern_SAP_WMS_Batch_Stock
     ledger) can be assembled and exported later from 3 sources:
       (1) app discharge data (WMS GI / TL Data / Vessel Log)  — already held
       (2) SAP ZMMFR022 import (existing 📊 PASTE SAP tab)       — already held
       (3) these manual daily inputs                            — NEW (this build)
     This increment ships INPUT CAPTURE only (4 kinds, propane/C3 first):
       • vlgc   — VLGC discharge into Bonded WH (보세창고). batch=null.
       • gr     — GR 통관, Bonded → 1100, batch D/E/P/X (manual; SAP also has
                  it — reconcile later when both present).
       • heater — B100 GI to heater. batch fixed = D. (1100→B100 transfer is
                  derived = same qty; B100 never holds stock — verified vs SAP
                  ZMMFR022: B100 End Stock Qty = 0, Trs-in == GI-out.)
       • ol1    — OL1 supply = 1100 GI batch P/X (C3 use for PP/petrochem).
     Firebase: INPUT-ONLY, flat path /cavern_in (child = one entry, keyed by
     rid, exactly like VLOG /vessel_mix_log). Entry shape:
       { _rid, date:'YYYY-MM-DD', kind, prod:'c3', batch|null, qty(kg),
         note, _ts, by }.
     ALL totals / mass-balance / reconciliation / the SAP-WMS report are
     RAM-only (recompute from the live listener) — no computed values written
     to Firebase. UI shows per-date log table + per-kind daily totals.
     ASSUMPTIONS (flag for review): (a) flat /cavern_in path chosen over the
     earlier-proposed /cavern_in/<date>/history nesting — matches the proven
     VLOG pattern, date is a field; (b) qty unit = kg (loading report is Kg;
     Cavern ledger is ton → /1000 at report-export time, NOT at input);
     (c) heater stored as a single B100-GI input (no separate 1100→B100 row);
     (d) "Export SAP WMS" button is a stub (toast) — report assembler is the
     next increment. Wired: engSwitchTab('cavern')→CAV.render(); boot P4
     step CAV.init(); badge #engBadgeCavern = total entry count.
     NEXT: SAP-WMS report assembler/export (.xlsx in Cavern ledger format),
     then butane(C4), then GR↔SAP reconciliation + transfer-derivation
     (1100→2100/2101 from WMS-GI/TL + Ball-Tank stock delta).
   ------------------------------------------------------------
   v4.49.11 (p30.11-diff-pct-netfq)
     TL Data Diff% redefined per user: it is a PERCENTAGE, not a signed
     deviation. Diff% = Net / FQ × 100, rendered with a "%" sign (e.g.
     "98.4%"). Was (Net−FQ)/FQ×100 in p30.10 which read as small negatives
     (−2%, −1.6% …). Live formatter + the edit-path store both updated.
   ------------------------------------------------------------
   v4.49.10 (p30.10-diff-net-ledger-tlcol) — current
     Follow-up UI fixes on top of p30.9:
       (1) TL Data Diff% (pct) is now a LIVE render-time formatter, so every
           row shows it — not only manually-edited ones (previously blank for
           scale/paste-created rows, which read as "not calculating").
           Diff% = (Net − FQ)/FQ × 100, 1-dp (matches the historical -1.6
           reference). Edit path still stores it for report freshness.
       (2) Scale Data modal: the live Net Weight now also shows CLEARLY (bold
           green, not faint) right next to the "Seal No." label (#sc-net-inline).
           The earlier faint bottom-of-grid ghost was removed.
       (3) Plan ledger ACTUAL cell restyled to match the table view: green
           #157a40 / weight 700 (was #2d8a4e / 600); empty "—" now grey-italic
           via .pv-num.act.act-empty, same as table's tp-actual-empty.
       (4) TL Data: Net Weight column DISPLAYS between Driver and C3 now
           (UI-only reorder of the Tabulator column array — COLS / field keys
           untouched, so report + paste mapping are unchanged).
   ------------------------------------------------------------
   v4.49.9 (p30.9-ptt-dn-tl-scale-fixes) — current
     Print-form, TL-Data and Scale-input usability fixes (RAM-only; the
     only Firebase writes are the existing TL delta path, now carrying the
     recomputed lpgQty/pct alongside the edited cell):
       PTT (overlay _pttShowOverlay + static pf-ptt-paper):
         (1) Safe Fill Allow value now renders at 20pt (was 15pt / inline),
             matching the Loading Q'ty size; the "kg" unit stays small.
         (2) Lot / Tank prints on two lines — line 1 = tank, line 2 = lot —
             via new _pfLotStack() (splits "<lot>/<tank>" on the last "/").
         (3) TW AVG / GW AVG were always blank: the Fleet `twavg` tab stores
             the plate in field `.truck`, but three lookups read `.plate`
             (pttPrint, _scWaitPttPrint, _twAvgFor). All now read
             `.truck||.plate`, so TW AVG fills and GW AVG (= TW AVG + loading
             qty) computes again.
       DN (pfFillFromStation + pfFillDNFromTL reprint):
         (4) Seal now prints "LPG <seal>" (e.g. "LPG EIC", "LPG 12345") via
             new _pfSealLPG(); idempotent if already prefixed.
       TL Data (onCellEdited):
         (5) Editing Truck Wt / Gross Wt recomputes Net Weight
             (lpgQty = Gross − Truck, both required). Editing TW/GW/FQ/Net
             recomputes Diff% (pct = (Net − FQ)/FQ × 100, 1-dp). Both ride the
             same single delta write + update the visible cells.
             ⚠ Diff% formula is an assumption (V406 source not available this
             session) — one-line change in onCellEdited if a different metric
             is wanted.
       Scale input:
         (6) FQ field accepts an arithmetic expression ("1+1" → 2) via safe
             _evalArith() (char-whitelisted Function calculator) wired into
             _techRead through a new `expr` flag on _TECH_FIELDS.
         (7) A faint live Net Weight readout (#sc-net-ghost) now sits at the
             bottom of the scale-entry grid so Net stays visible while filling
             the remaining fields; updated by scCalcNet().
   ------------------------------------------------------------
   v4.49.8 (p30.8-mixcalc-ch4-bd-notify-fix)
     Three Mix-Calc / Tank-Log fixes (no new Firebase path; +1 idempotent
     child write on the live MIX-calc Pass-save):
       (1) Live MIX calc "SAVE PASS → TANK LOG" now also pushes the Scale
           Station 4-slot mix-notify (MIXNOTIFY.pushNotify), matching the
           edit-modal CALC+SAVE+NOTIFY. Previously it only did the silent
           SCALE.mcSyncTkCfg, so Scale never got the visible notification.
       (2) GC light-ends CH₄ (col 16) and 1,3-BD (col 21) — reserved slots
           that _saveToTankLog never wrote — are now stored. gcMult (% vs
           fraction scale) was keyed on ethane alone, so a 0-ethane sample
           saved the whole GC strip as fractions (0.5438 instead of 54.38);
           gcMult now derives scale from the total GC sum, ethane-independent.
           Edit-modal _editFields gains CH₄ + 1,3-BD inputs (and 4dp format)
           so historical rows can be back-filled by hand.
       (3) MC.calcFromRow hardcoded ch4=0/bd13=0, dropping CH₄ (~1.2%) and
           1,3-BD from the impurity redistribution sI — so re-pressing CALC
           on an unchanged row produced a different Filled C3/C4 than the
           live calc. calcFromRow now reads ch4=r[16]/bd13=r[21] and folds
           them into the same sum-normalize step, so recalc reproduces the
           original live result exactly. (Rows saved before this build still
           lack CH₄/1,3-BD until re-saved or back-filled via the new inputs.)
     Export header placeholders "(16)"/"(21)" relabelled CH4 / 1,3-BD.
     Pure render/data-consistency on the existing single 34-cell child write.

   v4.49.7 (p30.7-tanklog-header-aware-paste)
     Tank Log paste/import now remaps columns BY HEADER NAME instead of by
     position. The legacy plant software exports Tank Log columns in a different
     order than V4's internal 34-col layout (Init/Filled grouped before Vol/Qty,
     no reserved slots), so the old positional paste mis-placed every column from
     index 6 on — most visibly Filled C3/C4 (which received Qty(ton) and %C3).
     ENG.pasteText now builds a source-col→internal-index map from the header row
     (_PASTE_COL_INDEX dict; name-normalized, covers legacy + V4-export + V406
     header spellings) and drops unrecognized/reserved columns. No header row ⇒
     positional fallback (unchanged, assumes V4 internal order). RAM-only change
     ahead of the existing push-confirm; no new Firebase paths or reads.

   v4.49.5 (p30.5-ktptvc-modal-display-fix)
     Fixed the 🔍 KTPTVC "Print Selection" modal opening EMPTY when launched
     from the Scale tab. scOpenKtptvc relocates #pf-sub-kt into the modal then
     did `pane.style.display = ''`, but .pf-sub defaults to display:none (only
     .pf-sub.on shows), so clearing the inline style reverted the pane to hidden
     whenever the KT print sub-tab hadn't been .on — i.e. always from Scale.
     Now forces `display:flex` on open (matching .pf-sub.on) so the toolbar +
     vehicle table render and ktLoad() can populate; scCloseKtptvc resets the
     inline display to '' so the print page's pfSwitch governs it again. DOM-
     only fix, no Firebase.

   v4.49.4 (p30.4-multido-dn-split-reprint-fix)
     Two Delivery-Note fixes (RAM-only, no Firebase writes):
     1. Multi-DO DN: after a combined load is allocated (one TL row per DO),
        PRINT & DONE now asks "1 merged DN" vs "N separate DNs". Merged keeps
        the old single note; separate walks the DN overlay one DO at a time
        (each with its own DO number, customer and allocated net). The DONE
        button advances to the next DO ("Next DO →") and completes the station
        turn after the last one. Per-DO payloads built in mdoAllocSave are
        cached in _mdoPayloadsByStation (RAM) so no turn re-derivation is needed.
        New globals: _dnSeq, _mdoPrintChoice, _dnStartSeparate, _dnSeqShow,
        _dnSeqNext; dnOvDone/dnOvClose hooked for the sequence; _dnShowOverlay
        resets the DONE label.
     2. TL Data "Reprint DN" showed wrong Scale No. and Turn ("0-1") and wrong
        net for split rows, because dnReprintFromTL routed through the station
        fill path (scale = stId(0)-turn, net = gross−truck). It now overwrites
        the form with pfFillDNFromTL(r), which reads scaleNo/turn/lpgQty (the
        allocated net) straight from the stored TL row.

   v4.49.3 (p30.3-plan-no-missing-guard)
     Plan-sheet paste (TP + TMR) no longer silently drops vehicle rows whose
     "No" column is blank, and no longer mistakes such a row for the grand-total
     line (which previously halted parsing and lost every row below it).
       1. parsePlanSheet now computes looksData (plate/rmooc/driver/DO present)
          and adds `&& !looksData` to the table-end break, so a blank-No vehicle
          row with a numeric qty can't be read as the total line.
       2. Blank-No rows that look like real data are captured into a `skipped[]`
          list (with a suggested sequential No) instead of being dropped.
          parsePlanSheet now returns { rows, skipped }.
       3. submitPaste wraps the original flow in a proceed() closure; when skips
          exist it shows showPlanSkipOverlay (JS-built, scoped #planSkipOverlay,
          English). "Auto-number & include" writes suggested Nos back into the
          raw TSV and re-parses (fill-down + sub-group context applied correctly);
          "Cancel" leaves the paste modal open to fix the sheet.
     RAM-only parsing fix — adds NO Firebase reads/writes (writes still go
     through the existing diff modal in applyDiff). No rid / _oid / date changes.
     Shared factory => both TP and TMR get the fix.

   v4.49.2 (p30.2-tanklog-rangedel-datefix)
     Fixed Tank Log RANGE-DATE delete skipping every row as "no-date".
     The Tank Log DATE column stores textual-month dates (e.g. "24/Apr/26")
     but the global parseDate() only handled numeric months, so BULKOPS
     getDate() returned null for all rows. Added a DD/MMM/YY|DD-MMM-YYYY
     branch to parseDate() (month-name lookup, 2/4-digit year). RAM-only
     logic fix — no Firebase / schema / rid changes. Benefits any other
     consumer of parseDate() too (cert checks, daysLeft, etc.).

   v4.49.1 (p30.1-multido-tempdo-assign-fix)
     Temp-DO orders can now be assigned through the multi-DO (LOAD TOGETHER)
     picker. Two RAM-only fixes (no Firebase / date-format / rid changes):
       1. _assignBlockReason no longer flags a combined temp-DO load as "NO DO".
          A merged load holds a space-joined string ("8651943 PET2606121" or
          all-temp "PET2606121 TAN2606121"); isTempOid() rejects multi-token
          strings, so the guard now accepts the row when ANY whitespace token is
          a real DO or a temp OID, instead of testing the whole string.
       2. mdoMerge builds the combined doNum per linked row (real DO when present,
          else temp OID) rather than running cleanDO() on the joined string —
          which previously stripped every temp token whenever a real DO was
          present, losing temp-DO members of mixed combos.
     Detection (_mdoFindLinkable) already surfaced temp-DO candidates; the failure
     was only at the merge/assign step.

   v4.49.0 (p30.0-multido-tempdo-tol-queue-turn) — prior
     Four multi-DO (combined load) fixes:
       1. TEMP DO support. Combined-order detection no longer relies on
          isMultiDO(doNum) (which only counts 7-digit numeric DOs and so failed
          for temp DOs like DAR26061201). scAssignToStation now keys on
          _multiDO + _linkedRows.length>1 (_isCombo); the station card renders
          the COMBINED tag + each linked DO via _mdoIsCombined(s)/_linkedRows,
          so temp-DO combined loads display and assign correctly.
       2. Combined Max-Tol. Each plan row's `tolerance` already = qty + per-load
          allowance, so summing them double-counted the loading qty. _mdoShowPopup
          now computes maxTol = (Σ qty) + ONE allowance = totalQty + max(tol−qty).
          The merged row stores this tolerance; pttPrint prefers the station's own
          tolerance (was a planRow lookup that missed for the combined doNum).
       3. Re-assign after cancel-to-queue. The queue item (waitPopQueue +
          _scWaitBackFromStation) now carries _multiDO/_linkedRows/tolerance/
          _mdResolved, and waitClickAssign re-attaches the combined identity
          (doNum/qty/tolerance/_linkedRows/_mdResolved) onto the row before
          re-assign. Previously the combined order came back as a single DO (the
          fresh TP.PLAN-by-_oid lookup returns only the primary row) and re-linking
          failed because the combined doNum sat in SC_WAIT. No more manual queue clear.
       4. One truck = one turn. mdoAllocSave freezes ONE turn (_tlFreezeTurn) for
          the whole combined load and passes it to every _mdoBuildPayloadFor
          (new sharedTurn arg), so the linked DOs save to TL Data at the SAME turn
          (two rows, distinguished by doNo) instead of consuming turns N and N+1.

   v4.48.0 (p29.0-ledger-inline-edit)
     Plan ledger is now editable like the table view (Today + Tomorrow):
       • VAR column hidden (its width went to NOTE).
       • Click any data cell (plate / rmooc / driver / qty / tol / DO / note) to
         edit inline — swaps to an input, Enter or blur commits, Esc cancels.
       • Double-click GATE or LOAD to toggle OK ↔ NO.
       • STATUS: when a row's AUTO is OFF (manual), click it for an inline status
         dropdown (Pending/Entered/Loading/Done/Cancelled). AUTO rows keep the
         read-only computed badge. ACTUAL is editable only on manual rows too.
       • All commits go through the SAME path as the table (editCellField → delta
         Firebase write) + mirror its FCHECK/WGCHECK recompute, then re-render.
         New API: ledgerCellEdit / ledgerToggleGL / ledgerPickStatus (+ helper
         _ledgerCommit). Shared factory ⇒ identical behavior on TMR (minus the
         TMR-hidden STATUS/ACTUAL/AUTO).

   v4.47.0 (p28.0-plandate-chips-all)
     Plan-date filter reworked (Today + Tomorrow):
       • Default now shows ALL plan dates at once (was: a single selected date).
       • The toolbar dropdown is replaced by clickable date CHIPS: one chip per
         distinct _forDate (with row count) plus an ALL chip. Click a date to
         show only it; click more to add; click a selected date again to remove
         it; ALL clears the selection (→ every date shown).
       • Implemented with a _dateSel Set (empty = show all). planRows() and
         refreshCounts() filter on it; planDate is kept ONLY as the module
         default for paste-seed / temp-oid / legacy fallback, not as the view
         filter. _refreshDateOptions() → _refreshDateChips(); setPlanDate() now
         clears _dateSel (post-paste shows the new plan among all dates).
       • New API: toggleDateSel / clearDateSel; globals tp/tmrToggleDate +
         tp/tmrClearDateSel. RAM only — no Firebase change.

   v4.46.0 (p27.0-ledger-single-header)
     Plan ledger: ONE shared header instead of a repeated per-group header.
       • renderLedger now emits a single <thead> table at the top of a shared
         .pv-scroll wrapper; each customer group below it renders only its
         banner + a headerless <tbody> table. All tables use the same colSpec
         %-width colgroup, so every row still lines up under the one header.
       • colSpec/colGroup/headCols are built once (above the group loop) rather
         than per group. Horizontal scroll is on the single .pv-scroll wrapper
         so header + all groups scroll together and stay aligned on narrow
         screens. (.pv-wrap no longer scrolls independently.)
     Render-only; no data/Firebase change.

   v4.45.0 (p26.0-tl-write-once)
     TL Data write audit (Scale → TL):
       • Audit result — the TL write path was ALREADY delta-only and safe:
         TL.upsertFromScale writes ONLY the changed fields (multi-path
         ref().update via _pushBatch), skips the write entirely when nothing
         changed, and never writes/reads the whole raw_data array. Done in
         v4.34.0 (delta) + v4.37.0 (turn-freeze so SAVE/DONE share one row).
       • NEW write-once guard in _pushToTL: a per-station RAM signature of the
         last pushed weigh (_tlPushSig). SAVE pushes once; a following DONE /
         PRINT & DONE with the SAME weigh now short-circuits — no upsert scan,
         no Firebase delta at all. Re-pushes only if the weigh actually changed
         (operator re-weighed before DONE without SAVE) → no data loss. Cleared
         with the frozen turn in setEmpty / stationReset.
     No schema change, no new Firebase reads/writes — this strictly REDUCES
     Firebase traffic on the Spark plan.

   v4.44.0 (p25.0-ledger-cols-badges)
     Plan ledger columns + V406 warning badges:
       • PLATE and RMOOC split into two separate columns (both need checking).
       • +DATE column (today / future-orange / stale-red) and +AUTO column (the
         per-row Auto-sync checkbox; toggling re-renders the ledger too).
       • Warning badges now shown in the ledger like V406 / the table view:
         PLATE — WG plate-diff → Fleet-missing → cert-blink; RMOOC + DRIVER —
         FCHECK cert badges; DO — WGCHECK.badgeHtml cross-check badges; whole
         row tinted by WGCHECK.rowLevel (tr-wg-warn / tr-wg-warn-plate).
       • toggleRowSync now also calls renderLedger() so the ledger updates when
         the toggle is flipped from either view.

   v4.43.1 (p24.1-ledger-grid-columns)
     Ledger readability: vertical column dividers + row striping + crisp header;
     % column widths so columns fill evenly (no stretched gaps); completed rows
     muted via grey text (not blurry opacity) so PENDING + LOADING stand out.

   v4.43.0 (p24.0-ledger-align-esc-paste)
     STEP 6. Plan ledger (Today/Tomorrow) V406 polish + global UX:
       • Alignment fix — every per-customer .pv-tbl now shares one fixed
         <colgroup> (table-layout:fixed), so headers and rows line up across
         all groups (prior auto-layout made each group size independently).
       • +2 columns to match the table view: TOL. (tolerance, after QTY) and
         VAR (the unified _oid, muted, after DO NO.).
       • DO column now mirrors the table-view doFormatter EXACTLY — it shows
         ONLY the doNum field (real / temp / "no DO"); the _oid is NEVER
         written into the DO column anymore (it lives in its own VAR column).
       • Completed orders are DIMMED (rows opacity .5; fully-done groups get
         .pv-grp-done + collapsed-by-default) so PENDING + LOADING stand out;
         loading rows keep a warm highlight.
       • TMR unchanged re status: STATUS + ACTUAL still hidden (no status, no
         sync) — render-only, no data/Firebase change.
       • Plan paste modal: opens EMPTY and clears its textarea on close — pasted
         data is never retained between opens (Today + Tomorrow, shared factory).
       • Global ESC closes the top-most open overlay/modal (`.on` fixed/absolute
         containers) and wipes any paste textarea inside.
     NOTE: all of the above is render/UX only — no Firebase schema/read/write
     change. TL-Data write audit (scale-writes-once, delta-only Firebase, and
     Done / Print&Done not re-writing the whole TL array) is the NEXT step,
     intentionally deferred to its own validated session (see handoff).

   v4.42.0 (p23.0-plan-v406-ui)
     STEP 5b. Today + Tomorrow Plan ledger re-skinned to the familiar V406
     grouped-table look (render-only; SAME data, handlers, status model and
     date logic — no cross-tab change). renderLedger now emits, per customer
     group: a header (CT short name + (full WMS name) + contract-type chip +
     status dots + count + Sigma-QTY MT + completed MT) and a .pv-tbl table
     with columns # / STATUS badge / PLATE.RMOOC / DRIVER / QTY / ACTUAL /
     GATE / LOAD / DO NO / NOTE / PRICE / actions. Status shown as a
     read-only computed badge (Entered/Loading/Completed/Cancelled). TMR
     hides STATUS + ACTUAL (it is a pre-load plan). Edit/Delete still call
     the existing ledgerEdit/ledgerDel; group collapse + status filter chips
     reused. Dead helper _ledStKey removed.
     KNOWN FOLLOW-UP (next small step): the OLD ledger CSS (.pl-grp/.pl-ghd/
     .pl-orow/.pl-stt/.pl-sum/.pl-gprog/.pl-ohead/.pl-tno/.pl-oacts/.pl-do/
     .pl-veh/.pl-drv/.pl-num/.pl-note/.pl-gname/.pl-gmeta/.pl-gdots/.pl-gflag/
     .pl-gqty) is now unused (no JS emits it) and should be pruned — left in
     temporarily so this UI can be tested first. Still used: .pl-fbar,
     .pl-fchip, .pl-empty.
   ------------------------------------------------------------
   v4.41.0 (p22.0-today-paste-today) — current
     STEP 5a of the Plan/TL overhaul. Today Plan is now strictly "today's
     sales plan" (V406 parity): the paste Plan-Date picker is hidden and
     submitPaste forces pickedDate=isoToday() for kind==='today'. TMR keeps
     its future-date picker untouched. (Toolbar Plan-Date VIEW selector and
     the broader grouped-layout cleanup are pending Step 5b — awaiting scope
     confirmation from the operator on which controls to remove.)
   ------------------------------------------------------------
   v4.40.0 (p21.0-tl-rowcolor-3state) — current
     STEP 4 of the Plan/TL overhaul. TL Data row colours reduced to the
     V406 three-state scheme:
       • no GI date    -> neutral grey (pending), OVERRIDES tank
       • GI + TK-3501  -> blue   (#0077b6 bar + 10/15% tint)
       • GI + TK-3502  -> orange (#e76f00 bar + 10/15% tint)
     rowFormatter now adds exactly ONE class (no-GI is mutually exclusive
     with tank), so the combined .tl-no-gi.tl-tk-* CSS rules were deleted.
     The redundant ltank cell-formatter (which duplicated row-class logic)
     was removed; onCellEdited already calls row.reformat() on ltank/giDate
     edits so colour stays live. The 'disabled' dimming was dropped per
     request (no disabled state anymore).
   ------------------------------------------------------------
   v4.39.0 (p20.0-tl-rangedelete-fix) — current
     STEP 3 of the Plan/TL overhaul. Fixed: TL Data "Delete in range"
     downloaded the CSV backup but left the rows intact. Root cause:
     TL row objects were never stamped with _rid (child_added/changed,
     _reconcileFull, upsertFromScale, and cache load all did
     ROWS[rid]=row without row._rid=rid), so BULKOPS getRid:r=>r._rid
     returned undefined → deleteRids nulled raw_data/undefined (a no-op)
     while the CSV export — which reads row fields — still worked. FIX:
     stamp _rid at every TL row source + a getRid identity fallback.
     Also (per request) BULKOPS modal now defaults to a 7-day rolling
     retention: KEEP = [today-6 .. today] (press "DELETE OUTSIDE range"
     to keep only the last 7 days); DELETE IN RANGE = [earliest .. today-7]
     (everything older). Both are defaults; the operator can edit dates.
     Dead max/maxIso removed from openRangeDelete.
   ------------------------------------------------------------
   v4.38.0 (p19.0-cust-alias-match) — current
     STEP 2 of the Plan/TL overhaul. Customer Short Name now fills into
     TL Data the V406 way. Ported V406's customer-alias memory + match
     modal into V4_36:
       • CT alias memory: Firebase node `cust_alias` (key→short, ≤200).
         CT.lookup() consults the remembered alias FIRST, then the CUST
         record cascade — so the Scale→TL push resolves the short name.
         New CT APIs: aliasSave, resolvesShort, shortList.
       • Global match modal (_custMatchModal/_cmFilter/_cmPick/_cmSkip/
         _cmSave): searchable Short-Name picker.
       • Hook: plan confirmDiff (TP + TMR, shared factory) scans pasted
         rows; any customer that does not resolve to a short opens the
         modal; on Confirm the alias is saved (CT.aliasSave) and remembered.
     Write note: cust_alias write happens only on the operator's Confirm
     click (single small set per key). TL CUSTOMER column = field 'cust'
     (short), so resolved names appear there on the next push.
   ------------------------------------------------------------
   v4.37.0 (p18.0-tl-dup-fix) — current
     STEP 1 of the Plan/TL overhaul. Fixed: saving one Scale load wrote
     TWO identical rows into TL Data. Root cause: TL MERGE_KEY is
     doNo|scaleNo|turn, but getDisplayTurn() drifts +1 after SAVE pushes
     this vehicle's own row (its row is then counted in `base`), so the
     later DONE push computed turn N+1 → new key → duplicate row. FIX:
     a RAM-only `_tlTurnFreeze[stId]` map freezes the turn at the first
     push so SAVE and DONE share one MERGE_KEY (DONE merges idempotently).
     Freeze is never written to Firebase; cleared in setEmpty + stationReset.
     Multi-DO path untouched (distinct doNo per row → no collision).
   ------------------------------------------------------------
   v4.36.3 (p17.3-sync-chain-fix)
     Cross-module sync chain repaired (Station ↔ Today Plan ↔ WMS GI ↔ TL).
     TWO root causes found:
     ① SCOPE BUG — DB_SC (station RAM state) is a const inside the SCALE
       IIFE, but three call sites OUTSIDE that closure referenced the bare
       identifier behind `typeof DB_SC !== 'undefined'` guards, which were
       silently false there:
         • TP.computeStatusFromState → the 'loading' branch never ran, so
           Today Plan rows stayed PENDING while their truck was on a bay
           (DONE still worked — it reads the global TL index). FIXED by
           publishing `window.DB_SC = DB_SC` inside SCALE.
         • TP._stationIdFor → same guard, restored by the same line.
         • SYNC.promotePair → the in-flight-station relink also called the
           SCALE-private setSt as a bare identifier (always undefined), so
           after a WMS GI promotion the station kept the stale TMP oid and
           the Plan↔Station link broke. FIXED: setSt exported on SCALE's
           public API; promotePair now uses SCALE.getStations()/SCALE.setSt.
     ② ALNUM-DO BUG — KNHC export delivery IDs are letter-prefixed
       (KNH26061101) but the whole match chain assumed numeric DOs:
         • WG.parseWmsSheet dropped every alnum row AT PASTE TIME
           (/^\d{6,}/ gate) — the rows never reached WG.ROWS at all.
           Now accepts ^[A-Za-z]{2,4}\d{6,}$ (kept verbatim, uppercased;
           numeric IDs still get stripLeadingZeros).
         • WGCHECK.extractDOs + buildWgIndex could not tokenize/index alnum
           DOs → false NO_DO / DO_NOT_IN_WMS on plan rows. Both extended
           with the same alnum pattern (uppercase-normalized on both sides).
         • WG._autoFillTlGiDate filtered both the WMS pool and TL DO tokens
           with /^\d{6,}$/ → TL rows with KNH DOs never received their GI
           date. Shared _isDoTok helper accepts both forms now.
       Multi-DO merge helpers (splitDOs/isMultiDO) stay numeric-only by
       design — combined-load logic is unchanged. All fixes RAM-only;
       no Firebase schema or write-path changes.
   ------------------------------------------------------------
   v4.36.2 (p17.2-light-theme-stock-donut)
     Console feedback pass #2 (user review of v4.36.1):
     • LIGHT THEME — user rejected the dark console. Entire scx2
       shell converted to light: pane gradient #f3f6fa→#eaeff6, top
       strip / brand navy-on-light, staff pills + icon buttons white
       with #d7dee6 borders, yard card white with subtle blue radial,
       dock bar #f2f6fa, report popup white. No dark colors remain
       in the scx2 CSS block.
     • STAFF AUTOCOMPLETE FIX — the Engineer/Check Booth dropdown was
       clipped to the 130px input width inside the top-bar pill (names
       unreadable). The pill (.sc-staff-field) is now the positioning
       anchor (.sc-staff-ac → position:static) and the list gets
       min-width:265px, z-index:1200, anchored below the pill.
     • PLAN/STOCK PANEL REDESIGN — each half now has an Oswald section
       header with colored dot + unit chip (TODAY PLAN · MT / STOCK
       LEFT · kg); donuts enlarged 58→74px, stroke 8.5 rounded caps;
       legend rows separated by dashed hairlines. STOCK drain donut:
       track is now NEUTRAL gray (depleted portion), arc = remaining
       fraction (current LPG ÷ opening LPG, semantics unchanged from
       v4.36.1) and the arc COLOR shifts with level — ≥40% blue,
       15–40% amber, <15% red (lv-mid/lv-low classes set in
       INV.renderRow1). Center label "t LEFT". New OPEN legend row
       (id scPlanStockOpen) shows the opening baseline in kg.
       All RAM-only; no Firebase changes.
   ------------------------------------------------------------
   v4.36.1 (p17.1-console-feedback-pass)
     Console layout reworked per on-site feedback (24" screenshots;
     must also fit 13" laptops):
     • Pipe manifold REMOVED entirely (deemed visual noise) — SVG,
       renderer, scRenderCtrl hook and CSS all deleted (no dead code).
     • Right rail REMOVED — PLAN PROGRESS · QUEUE · EXPIRED CERTS now
       sit in ONE info row directly under the 4 bays, killing the dead
       space in the yard center and the cramped 290 px rail (plan
       numbers were clipping). Cards get min/max heights with internal
       scroll. ≤1180 px: tanks go horizontal above the yard and the
       info row wraps (auto-fit) for laptop screens.
     • CERT CHECK card retired: its search input now lives inside the
       EXPIRED CERTS header (same SCALE.certSearch handler) and the
       results render as an absolute OVERLAY dropdown over the card
       (hidden when empty via :empty). One card instead of two.
     • XFER card retired from view: each tank card gains (a) an
       opening-stock mini-row (OPEN total · C3 init · C4 init · %C3,
       fed by INV.stockFor, refreshed from renderRow1) and (b) a
       per-tank action row 📥 📐 ⇄ ⇆ 📜 📤 🛢 driving the SAME INV
       modals via INV.view(sloc)+open… (+ TKV per-tank viewer). The
       legacy inv-x card keeps its DOM hidden inside row 4 so INV
       internals stay untouched; its header translated (XFER · STOCK).
     • STOCK donut semantics changed per user decision: the ring now
       represents the day's OPENING LPG and the arc DRAINS in real
       time (arc = current ÷ opening, clamped; center = current t;
       tooltip shows left/opening/%). Was C3-vs-C4 split.
     • Tank card typography cleaned up: Oswald 16 px tank name, mono
       LOT input, aligned label/value stat pairs, dashed separators,
       96 px ball gauges (% in mono bold).
   ------------------------------------------------------------
   v4.36.0 (p17-scale-ops-console) — prior
     SCALE tab — "Operations Console v2" (approved mockup
     scale-console-redesign-mockup.html). Pure LAYOUT release: the new
     SCX2 module RELOCATES the existing live nodes into a dark SCADA
     scaffold (#scx2Root) — every id, inline onclick and delegated
     listener survives; NO new Firebase reads or writes.
     • Top strip: ⛽ SCALE CONSOLE brand · staff pills (relocated
       Engineer / Check Booth inputs, autocomplete intact) · 🔔
       Engineer-Notification + 📨 Sale icons (badges live) · 📋 report
       icon toggling a popover that hosts the relocated Report card.
     • Left column: the two ball-tank cards relocated and enlarged
       (128 px gauges, stacked vertical; lot input / AUTO toggle /
       LPG-C3-C4 stats untouched) + the XFER · stock card beneath —
       source-side controls live next to the tanks.
     • Center yard: NEW pipe manifold SVG (TK-3501 blue line /
       TK-3502 orange line + one drop per bay) with animated flow
       overlays that follow DB_SC.stations in RAM — a bay shows a
       running dashed stream from its tank's manifold while LOADING
       (hooked at the end of scRenderCtrl). Below: the untouched
       4-station grid (#scCtrlGrid — cards keep their light skin for
       readability inside the dark frame) and the relocated Quick
       Actions dock (dark chrome).
     • Right rail: PLAN PROGRESS (relocated plan + stock donut card) ·
       QUEUE · EXPIRED CERTS (Today/Tomorrow toggle intact) · CERT
       CHECK — static info consolidated off the operating area.
     • Fail-safe: SCX2.init() verifies every anchor first; if any is
       missing it aborts and the legacy Row-1/Row-4 layout stays
       visible unchanged.
     • Ball-tank capacity now derived from geometry per user decision:
       TANK_CAP_KG = 4/3·π·5.5³ × 0.54 t/m³ × 1000 ≈ 376,331 kg
       (11 m ball; replaces the rounded 376,000 literal — visual %
       shift < 0.1%).
   ------------------------------------------------------------
   v4.35.0 (p16-plan-customer-ledger) — prior
     TODAY / TOMORROW PLAN — "Customer Ledger" view (approved mockup
     plan-ledger-redesign-mockup.html). Pure render layer over the SAME
     plan_today/plan_tomorrow data — ZERO Firebase changes.
     • One band per customer: order count, per-order status dots
       (green done / blue pulsing loading / grey pending / red cancel),
       ⚠ n CERT flag (FCHECK.orderWarning level 'bad'), MT total +
       loaded/loading progress bar. Band click collapses/expands;
       all-done groups auto-collapse (manual toggle remembered in RAM).
     • Order rows: # · DO (temp/missing DO renders the DO Var italic
       amber) · plate+rmooc stacked · driver · qty MT mono · note with
       8H badge (note matches 8h/trước 8/before 8) and ⚠ cert chip
       (hover = badge details) · status pill: PENDING / ENTERED /
       LOADING · BAY n (live from DB_SC.stations) / DONE hh:mm (latest
       TL timeOut via TL.getIndex) / CANCEL · actions ✏ (switch to
       table view, scroll + flash the row) and 🗑 (existing
       requestDeleteRow confirm flow).
     • Filter chips ALL/PENDING/LOADING/DONE/CANCEL with live counts
       ('entered' counts under PENDING, shows its own ENTERED pill);
       summary strip PLAN/LOADED/REMAIN/CUSTOMERS/TRUCKS + day progress
       (green = loaded, striped blue = currently on the scale).
     • ▤/▦ view toggle button per plan tab; choice persists in
       localStorage (lpg_v4_planview_tp / _tmr, default ledger). The
       Tabulator stays untouched as the editing "Table view" — paste /
       inline edit / export / range delete flows unchanged.
     • renderLedger() hooks: rebuildTableData (data changes) and
       refreshStatus (SCALE/TL status pushes). Search box drives both
       views (ledger reads the same planRows()). RAM-only; reuses
       TL.getIndex + FCHECK fleet index from v4.34.0 — no extra scans.
   ------------------------------------------------------------
   v4.34.0 (p15-sync-bandwidth-ram-opt) — prior
     Spark-bandwidth + RAM/render optimization pass across the
     Plan → Scale → TL pipeline and the reverse WMS-GI flow.
     NOTE for the mix-workspace handoff: this release takes the
     v4.34.0 slot — CALCFG Session 1 shifts to v4.35.0, Tank Mix
     Console to v4.36.0, Vessel Mix Console to v4.37.0. All line
     numbers in HANDOFF-mix-workspace-upgrade.md (referenced to
     v4.33.2) have drifted — re-grep anchors before editing.

     1. TL Data → DELTA SYNC (biggest bandwidth fix). Previously
        every raw_data_version bump made every OTHER machine re-
        download the ENTIRE raw_data node (once('value') reloadFull)
        — each weigh event (SAVE + DONE = 2 bumps) broadcast a full
        multi-hundred-KB reload to every client. Now TL uses the
        same child_added/changed/removed pattern as Plan/WG, with
        ONE full read left: the reconcile-on-attach ghost-row prune
        (_reconcileFull, throttled 800ms). The version listener
        stays for (a) counter-RESET fallback → one full reconcile,
        (b) mixed-version fleets (older builds still need bumps).
        Forward bumps no longer trigger any read.
     2. TL writes unified through _pushBatch(): version bump rides
        INSIDE the same multi-path update (1 atomic write instead
        of 2), echo-suppressed, saveCache synchronous. Applied to
        doPaste (now ONE update for the whole paste instead of one
        write per row + version set), doDelete, rangeDelete,
        setGiNow, applyWmsSync, renameDoNo (one batched update for
        all renamed rows), onCellEdited, upsertFromScale.
     3. upsertFromScale: when NOTHING changed (e.g. DONE pressed
        right after SAVE) it now returns without writing — the old
        code bumped the version unconditionally, broadcasting a
        pointless full reload to every other machine per weigh.
     4. TL.getIndex() — lazy RAM lookup index (byKey: _oid/doNo →
        rid→lpgQty maps; turnByScale: today's per-scale counts),
        invalidated via a _mut counter bumped in saveCache. Today
        Plan/Tomorrow Plan computeStatusFromState and
        computeActualFromState now do O(1) lookups instead of
        scanning all TL rows per plan row per render (actual sums
        union the two rid sets so a row matching both keys is never
        double-counted — same semantics as the old scan).
     5. BUG FIX: getTurnFromTLData compared r.date against a
        DD/MM/YYYY (4-digit year) string while TL stores DD/MM/YY —
        it never matched, so the per-station turn count was always
        0. Now resolved through TL.getIndex() with normalized
        DD/MM/YY dates: turn numbers on station cards / PTT are
        correct per-day counts again.
     6. Firebase child-event bursts debounced (Plan factory, WMS GI,
        Fleet ×4 tabs, TL): the initial child_added replay used to
        run a full localStorage serialize + Tabulator rebuild PER
        ROW (O(N²) startup). RAM mutates immediately; cache/table/
        badges/FCHECK refresh once per ~100ms burst. Firebase
        traffic unchanged.
     7. FCHECK fleet lookup index (_fleetIdx: plate per tab + driver
        name): findVehicle/findDrivers were linear scans of the
        fleet tabs per plan row AND per cell warning per render.
        Index invalidated synchronously in recompute(), which every
        fleet write path (local + remote) already calls.
     8. English-only UI sweep: translated remaining Vietnamese UI
        strings (assign-block reasons, swapStationTank toasts,
        WGCHECK 'not found in WMS', WMS→TL sync + promote modals,
        station status labels/tooltips, INV card/buttons/modals/
        toasts/history). Print-form bodies (PTT/DN/KTPTVC), the
        Vietnamese number-to-words used on DN, diacritic
        normalizers and data-matching regexes ('thuần') are
        intentionally untouched.
     Behavior preserved everywhere else; no Firebase schema change;
     fully compatible with v4.33.2 machines running concurrently.
   ------------------------------------------------------------
   v4.33.2 (p14.2-sync-audit-hardening) — prior
     Full sync-safety audit of EVERY Firebase-backed module: verified that
     no module seeds/writes stale local cache back to Firebase on load, and
     that Firebase is always the source of truth on attach. Modules verified
     clean: Fleet (prune + sample-seed only when FB AND cache both empty),
     TP/TMR (prune; _repairTempDoNums only touches rows still on FB),
     TL (reloadFull = merge+prune), WG/WS/SP/CT/PP (prune + child listeners),
     INV (per-sloc _ver adopt, read-only), QUEUE/stations/tank_config/STAFF/
     VLOG/VMIX/mix_state (pure listeners, no localStorage seed-up), Fleet
     pending-write queue (RAM-only — never replayed across reloads).
     Two gaps found and fixed:
     • ENG (Tank Log): the empty-Firebase branch of _initialLoadAndAttach
       kept the local cache — ghost rows stayed visible after the node was
       wiped/range-deleted elsewhere, and editing one would write it back
       (resurrection). Now: empty FB ⇒ prune ALL local rows + cache.
     • TL Data: the raw_data_version listener only reloaded when the server
       counter was HIGHER. If the counter node was deleted/reset by hand,
       machines holding a high cached counter ignored every later low bump
       and stopped live-syncing until restart. Now: reload on ANY counter
       change (own-write echoes are equal ⇒ skipped, no extra reads in
       normal use), plus an 800 ms throttle so the attach-time explicit
       reloadFull and the listener can't double-read raw_data.
   ------------------------------------------------------------
   v4.33.1 (p14.1-rangedel-fix-confirm-guards)
     • FIX: TL Data range delete did nothing. Root cause: TL has a LOCAL
       parseDate(v) that returns a normalized "DD/MM/YY" STRING (paste-time
       normalizer); it shadowed the global Date-returning parseDate inside
       TL.rangeDelete's getDate, so BULKOPS crashed on d.getTime() and the
       modal never opened. Fix: getDate now calls window.parseDate (global).
     • Tank Log: "Delete All" (whole-node wipe of eng_tkmix via set(null))
       replaced by RANGE-DATE delete (BULKOPS, date = cell r[3] DD/MM/YY).
       Delete = per-rid child deletes in ONE _fbRef.update(map) — delta-only,
       CSV backup auto-downloaded first, no-date rows never auto-deleted.
       ENG.clearAll removed (API + button now ENG.rangeDelete). Audit:
       eng:tank_log:range_delete. (Vessel Log already had range delete and
       its date path was verified working — uses the global parseDate.)
     • Customers + Price List: Clear All no longer uses native confirm() —
       it opens the shared typed-"Confirm" modal (same as per-row delete);
       deletion only proceeds after the user types Confirm. Write path
       unchanged (applyAndPush __DELETE__ batch, canWrite gate intact).
     • FIX (latent): closeDelConfirm now always restores the default Fleet
       executeDelete handler on delConfirmBtn — previously a module that
       overrode .onclick (CT/PP/SP) left its stale handler attached, so a
       later Fleet row-delete could fire the wrong action.
   ------------------------------------------------------------
   v4.33.0 (p14.0-ball-gauge-plan-donuts)
     Scale Row-1 charts (RAM-only, no Firebase changes):
     • Tank cards: stock gauge is now a BALL-TANK chart, not a donut. The
       circle is the spherical shell; liquid fills from the BOTTOM like the
       real 11 m ball tank and falls in real time as LPG is loaded/transferred.
       Liquid LEVEL is physically correct: volume fraction p = LPG ÷ 376 t
       capacity is inverted through the spherical-cap formula t²(3−2t)=p
       (Newton iteration) so low stock pools at the bottom and 50% volume sits
       mid-sphere. nostock = dashed empty shell + "—"; lowstock (≤10%) = red
       liquid. IDs renamed scTkDonut→scTkBall, scTkFill→scTkLiq (+scTkSurf
       surface line); all old donut CSS/JS removed (no dead code).
     • PLAN card split into TWO donuts side by side:
       left  = PLAN donut  — arc = LOADED ÷ PLAN, center = % loaded, legend
               PLAN/LOADED/REMAIN (MT) keeps original IDs;
       right = STOCK donut — C3 (blue arc) vs C4 (orange track) share of the
               cross-tank stock, center = total LPG in t, legend LPG/C3/C4 (kg)
               keeps original IDs. Plan donut updates in scRenderCtrl; stock
               donut updates in INV.renderRow1 (live on every INV change).
       Empty state (no plan rows / no opening stock) = dashed ring + "—".
   ------------------------------------------------------------
   v4.32.3 (p13.3-stale-cache-no-reupload)
     CRITICAL DATA-INTEGRITY FIX: stale localStorage no longer resurrects
     rows that were deleted on another machine, and is never written back
     to Firebase on load.
     Root cause: Today Plan and TL Data were the only two modules that, on
     attach, SEEDED local-only rows back UP to Firebase. The seed-vs-prune
     decision used an in-memory `_fbSeeded` flag that resets to false on every
     page load, so a fresh load ALWAYS took the seed branch. Result: machine A
     deletes all TL Data + Today Plan → machine B opens with a stale cache →
     B re-uploads the deleted rows to Firebase, undoing the deletion on every
     client. (WMS/Station/Fleet were already correct — pure prune.)
     Fix: both Today Plan reconcile and TL.reloadFull now do PURE PRUNE —
     Firebase is the source of truth on attach; any row present locally but not
     remotely is a ghost (deleted elsewhere while offline) and is deleted from
     RAM/cache, never re-uploaded. Removed `_seedToFirebase` (TL) and the
     `_fbSeeded` flag (both modules). Rows are always written to Firebase at
     paste/edit time, so "local-only on load" reliably means "deleted elsewhere".
   ------------------------------------------------------------
   v4.32.2 (p13.2-bulk-range-delete-tl-vlog)
     Range-date delete wired to TL Data + Vessel Log (Phase 3).
     These two areas used whole-node WIPE in their old Clear All, so the new
     range-delete does PER-RID child deletes instead (one multi-path write):
     • TL Data: TL.clearAll → TL.rangeDelete; date field = date (parseDate,
       DD/MM/YY). Delete = single FD.ref().update({'raw_data/{rid}':null …,
       raw_data_version:++}) — one Firebase write incl. the version bump;
       other machines prune via the version listener → reloadFull().
       (TL has no per-write canWrite gate today, matching its existing
       single-row delete; none added here — flag if a gate is wanted.)
     • Vessel Log: VLOG.clearAll → VLOG.rangeDelete; date field = date
       (parseDate, DD/MM/YY). Delete = single _fbRef.update({rid:null …}) —
       one Firebase write; other devices prune via the child_removed listener.
       Old native confirm() prompts removed (BULKOPS modal is the confirm).
     • Both export matched rows to CSV+BOM before delete; audit logged via
       'scale:raw_data:range_delete' / 'eng:vessel_log:range_delete'.
     • Next phases: Tank Log (ENG, array rows), "type Confirm" on
       Cust/Price/Fleet wipe, paste-import for missing tabs.
   ------------------------------------------------------------
   v4.32.1 (p13.1-bulk-range-delete-ws-sap)
     Range-date delete wired to WMS ST + SAP (Phase 2).
     • WMS ST: old "Clear All" (WS.clearAll) replaced by WS.rangeDelete;
       date field = transDate (parseDate, DD/MM/YY); deletion still uses the
       existing delta __DELETE__ path (applyAndPush) — no new Firebase risk.
     • SAP: old "Clear All" (SP.clearAll) replaced by SP.rangeDelete; the old
       native confirm() prompt removed (BULKOPS modal is the confirm now);
       date field = date (ISO yyyy-mm-dd); delta __DELETE__ path unchanged.
     • Both export matched rows to CSV+BOM before delete; audit logged via
       'sales:wms_st:range_delete' / 'sales:sap:range_delete'.
     • Next phases: TL Data + Vessel Log, Tank Log, "type Confirm" on
       Cust/Price/Fleet wipe, paste-import for missing tabs.
   ------------------------------------------------------------
   v4.32.0 (p13.0-bulk-range-delete)
     Range-date delete + CSV-backup-before-delete (Phase 1 of multi-area rollout).
     • New shared module BULKOPS: a scoped #bulkDelModal with two modes —
       KEEP (delete rows OUTSIDE [From,To]) and DELETE IN RANGE (delete rows
       INSIDE [From,To]); live row-count preview; "type Delete to confirm".
     • Before deleting, the matched rows are exported to a CSV+BOM file
       (BULKOPS.exportRowsCsv) so a mistaken delete can be re-imported.
     • Rows with no parseable date are never auto-deleted (shown as skipped).
     • WMS GI wired live: old "Clear All" (WG.clearAll) replaced by
       WG.rangeDelete; deletion still uses the existing delta __DELETE__
       path (applyAndPush) — equal-or-fewer Firebase writes than Clear All.
     • Next phases: WMS ST + SAP, TL Data + Vessel Log, Tank Log,
       "type Confirm" on Cust/Price/Fleet wipe, paste-import for missing tabs.
   ------------------------------------------------------------
   v4.31.15 (p12.15-cert-search-nodau)
     Scale CERT CHECK search (plate / driver / phone) loosened:
     • Now accent-insensitive (no-dấu) — reuses SCALE._normVN, so "dao
       ngoc sang" finds "Đào Ngọc Sang", "cong" finds "Công", etc.
     • Match condition relaxed from "full query as a contiguous substring
       in ONE field" to token-AND across a combined plate+name+phone
       haystack: every whitespace token only has to appear somewhere in
       the row, order-free and field-agnostic. Easier to find drivers by
       a name fragment, or plate + driver mixed. RAM-only; no Firebase /
       data-shape change.

   v4.31.14 (p12.14-inv-gi-datefix)
     Tank stock now deducts ACTUAL sold (TL Data net weight). Bug:
     INV.todayDMY() built a 4-digit year ("09/06/2026") while TL Data
     rows store the canonical DD/MM/YY 2-digit year ("09/06/26"). The
     exact-string compare in giFromTL() (and _renderExport()) therefore
     matched ZERO rows, so the gi (sold-today) branch always returned
     {0,0} and tank REMAINING never came down for completed loads — it
     stayed at the static initial even after Scale wrote net weights.
     Fix: todayDMY() now emits 2-digit year, matching normalizeDate() and
     _buildTLPayload(). The intended stock lifecycle now works end-to-end:
       assign → tentative deduct by plan loading qty (station.qty)
       DONE   → SCALE.setEmpty drops the tentative; TL Data row written
       render → giFromTL deducts the ACTUAL net weight (replaces tentative)
     PLAN card REMAINING (plan-qty based) and the static XFER "Tồn đầu
     ngày" card are unchanged by design. RAM-only; no Firebase reads/
     writes, no data-shape change.

   v4.31.13 (p12.13-assign-guard-nodo-noload)
     Station-assign sales guard (Scale search → assign):
     • New _assignBlockReason(row) centralises every non-assignable case:
       done / cancel (as before) + NO-LOAD + NO-DO.
     • NO-DO: a plan row with no usable DO (no real DO and no temp DO — e.g.
       an empty DO column with only the auto "PLN-…" id) shows "⚠ CHƯA CÓ DO"
       and cannot be assigned. Legit temp DOs (KNH26060201…) stay sellable.
     • NO-LOAD: when sales set "allow to load" (allowLoad) = NO, the row shows
       "🚫 NO LOAD" and is blocked ("Sale đã ghi NO — không được bán").
     • Wired into scShowResults (compressed non-clickable render), assignFromSearch
       (toast + abort) and scAssignToStation (central guard → covers queue,
       multi-DO picker and waitPop paths too). Removed the now-redundant inline
       done/cancel re-check. RAM-only; no Firebase / data-shape changes.

   v4.31.12 (p12.12-tl-tank-recolor-nogi-lotsync)
     TL DATA tab fixes:
     • Editing the Tank cell now re-colours the row immediately
       (onCellEdited calls row.reformat(); ltank cell formatter also clears
        both tank classes before applying, so 3502→3501 no longer sticks).
     • Rows WITHOUT a GI date now use a distinct neutral grey fill (was a
       faint amber hatch over the tank tint — hard to read). Tank identity
       kept via the coloured left bar. Row re-colours when GI Date edited.
     • Changing the Tank of a row dated TODAY auto-pulls that tank's current
       lot from the Scale tank card (SCALE.getTkCfg → short lot) into the Lot
       cell, pushed in the same Firebase delta. Prevents stale-lot omissions.

   v4.31.11 (p12.11-plan-stock-total-live)
     PLAN card (Cluster 3) STOCK row now shows the live TOTAL of BOTH
     tanks. Bug: the sum lived in scRenderCtrl, which is NOT re-triggered
     by INV changes — so when a 2nd tank's init was declared later, the
     per-tank cards updated (via renderRow1) but the PLAN total stayed on
     the first tank's figure. Fix: moved the cross-tank sum into
     INV.renderRow1 (single owner), which runs on every INV _ver bump via
     the inv_daily listener → render(). scRenderCtrl's duplicate block
     removed. RAM-only (sum of compute('2100')+compute('2101')).

   v4.31.10 (p12.10-tank-card-compact-3row)
     Tank cards shortened from 5 rows to 3 to cut height:
     • LPG value moved onto the LOT row (right-aligned, margin-left:auto);
       LOT input narrowed to ~54px.
     • C3 + C4 now share one row (flex:1 each, label-left / value-right).
     CSS/markup only — no JS or data changes.

   v4.31.9 (p12.9-tank-cell-split-two-cards)
     SCALE Row-1 Cluster-1: the single tank cell is now TWO per-tank
     cards (one tank each), side by side inside the same grid slot:
     • Each card shows its tank's LOT (own input), AUTO/MANUAL mode
       (own toggle) and live LPG / C3 / C4 (INV.renderRow1 now renders
       BOTH tanks, not just the selected one).
     • Click a card body → selects that tank (scTkSelect); the non-
       selected card is dimmed (opacity + grayscale). Selected card
       takes its brand-colour highlight (blue 3501 / orange 3502).
     • Lot input & mode button stopPropagation so they act on their own
       tank without flipping the selection. _onLotChange(n) /
       scToggleMode(n) now take an explicit tank number.
     • Removed singular ids (#scLotInp/#scModeBtn/#scInvLpg/#scTkBtn*);
       #scInvChip kept hidden for backward refs. New ids: scTk{1,2}Card,
       scLotInp{1,2}, scModeBtn{1,2}, scInvLpg{1,2}/scInvC3_{1,2}/scInvC4_{1,2}.
     RAM-only (INV.compute per sloc); no Firebase / data-shape changes.

   v4.31.8 (p12.8-scale-search-accent-insensitive)
     STATION assign search is now accent-insensitive (no-dấu):
     • New SCALE _normVN (lowercase + strip diacritics + đ→d + collapse
       ws); scShowResults normalizes both query and every matched field
       (plate / driver / DO / _oid / customer). "cong"→"Công", "dat"→"Đạt".
     • _destNfc (destination autocomplete) now delegates to _normVN —
       single source of truth, no duplicated NFD logic.
     RAM-only filter over TP.PLAN; no Firebase / data-shape changes.

   v4.31.7 (p12.7-scale-cert-driver-search)
     SCALE › CERT CHECK panel now searches the DRIVER tab too:
     • certSearch iterates tanklorry+tractor+rmooc+DRIVER; matches
       plate, name AND phone (driver rows have name/phone, no plate).
     • Result item + cert modal title use each tab's own icon
       (👤 for driver); driver sub-line shows phone (falls back to #stt).
     • Input placeholder → "Search plate / driver / phone…".
     RAM-only read of DATA[*]; no Firebase / data-shape changes.

   v4.31.6 (p12.6-fcheck-summary-tbl-early-ptt-parity)
     FLEET CHECK summary (paste-time review only):
     • openIssueEditor summary mode now renders a compact one-row-
       per-order table (# / Plate / Driver / Customer / Issue) with
       issues collapsed into colour-coded bullets, instead of the
       tall per-subject block layout. Title = "N orders with issues".
     • Scale-tab entries (cert-panel click, station-card warning) are
       unchanged — they still pass {mode:'edit'} and keep the editable
       inline date inputs + SAVE-to-Fleet block layout.
     PTT_EARLY — printed PTT now matches the assign-into-station slip:
     • _buildPage / _buildCombinedPage fill the fields they used to
       leave blank: Customer = CT.vnName, Loading Q'ty X/Y with the
       same safe-fill cap + Check-booth warning as _pttShowOverlay,
       Safe Fill Allow, Truck Wt AVG + Gross Wt AVG (RAM Fleet lookups
       via _twAvgFor/_sfKgFor — no Firebase), Engineer + Check Booth
       signatures (scEngineer/scCheckBooth inputs).
     • Kept as advance-print placeholders by design: Lot/Tank (tank not
       yet decided) and Bay (blank). Date stays row._forDate.
   ------------------------------------------------------------
   v4.31.5 (p12.5-mdo-ptt-early-group)
     PTT_EARLY — multi-DO detection (print suggestion only).
     • A truck with several early-morning DOs appears as sibling
       Tomorrow-Plan rows (same plate + driver + _forDate, each its
       own real 7+digit DO and own qty). _buildUnits groups these
       (total <= MDO_CAP_MT=27); singletons stay individual.
     • Modal shows each group with a header (truck/driver/total) and
       a Combined/Separate toggle (PTT_EARLY.setGroupMode). Default
       = Combined (the "gộp" suggestion). _groupMode is RAM-only.
     • _computePlan() turns selection + per-group mode into the page
       list: Combined group -> ONE _buildCombinedPage (customers
       joined, Loading Q'ty = sum, DO Info lists every DO + its qty,
       product type via deriveProductTypeMulti, COMBINED·N DO tag);
       Separate group / singles -> _buildPage per row (unchanged).
     • Count line + Print button now show resulting PTT page count.
       logAudit('print:ptt_bulk_early',{pages,orders}) in-memory.
     • SCALE / TL Data untouched — detection lives entirely in
       PTT_EARLY and reuses the global M1 helpers (splitDOs,
       deriveProductTypeMulti, _mdNormDO). No Firebase reads/writes.
   ------------------------------------------------------------
   v4.31.4 (p12.4-mdo-combined-alloc) — prior
     MULTI-DO port — M1..M4a (combined weight allocation).
     • M1 helpers (after pttOvPrint region): isMultiDO/splitDOs/
       cleanDO/dosOverlap/doMatch/deriveProductTypeMulti + _mdNormDO.
     • M2 assign-time picker: same plate+driver+date, total <=27 MT ->
       popup LOAD TOGETHER vs Only DO (mdoMerge/mdoSingle).
       Merge stores doNum="DO1 DO2", _multiDO, _linkedRows[].
     • M3 station card shows split DOs + COMBINED tag; search hides
       linked rows via splitDOs; computeStatusFromState flips the
       other linked plan row to loading via dosOverlap.
     • M4a (this build) COMBINED weigh -> N TL rows. On SAVE of a
       combined station (_mdoIsCombined), techSaveNew opens the
       weight-allocation popup (#mdo-alloc-bg) instead of the single
       push: operator enters net per DO (last auto-balances), live
       preview shows cascading Truck/Gross (each DO truck = prev
       DO gross). mdoAllocSave pushes ONE TL row per DO via
       TL.upsertFromScale (existing path — NO new Firebase path),
       sets tech._mdoAllocated, swaps footer to postsave.
       techPrintDone / techDoneNew: combined+not-allocated routes to
       the popup first; combined+allocated SKIPS the single push
       (rows already written) and completes / opens DN.
     • Writes: TL.upsertFromScale (N calls) + setSt only. No direct
       firebase.database().ref(). logAudit('scale:assign_multi_do',
       ...'combined') in-memory.
     • NOT YET DONE — M4b: SEPARATE mode (weigh each DO on the same
       station via _sepCtx state machine, V406 lines ~8110-8640) and
       the combined/separate picker at tech-open. M4a always treats a
       merged order as combined (single weigh, ratio/manual split).
   ------------------------------------------------------------
   v4.31.0 (p12.0-ptt-early-bulk) — prior
     PTT_EARLY — bulk print PTT for early-morning orders.
     • New IIFE PTT_EARLY (defined right after pttOvPrint).
       Scans TMR.PLAN (Tomorrow Plan only — matches V406) for rows
       whose note contains the digit "8" ("arrive before 8AM").
       Note field is the ONLY field scanned.
     • Selection modal (#ptt-early-bg, built lazily via createElement,
       no markup edit): per-row checkbox, select-all/none, live count,
       and cert badges from FCHECK.orderWarning(row, parseDate(_forDate)).
       All candidates checked by default.
     • Prints N A5 PTT pages in ONE doc via _pfPrintViaIframe (no new
       tab). Page layout mirrors the single-PTT overlay. Differences:
         - PTT date = row._forDate  (NOT new Date()).
         - Lot/Tank = placeholder "LPG-<curYear>-...... / TK-350....."
           (tank undecided pre-station; booth staff fills by hand).
         - Weights / safe-fill / bay blank (filled at the booth).
     • "Printed" mark is RAM-only (_printedOids, module-level) — shows a
       "printed" tag on re-open; NEVER written to Firebase or the row
       object. logAudit('print:ptt_bulk_early',{count}) (in-memory only).
     • Entry points: TMR toolbar button "🖨 Early-8AM PTT" (after
       Promote to Today) + Scale Quick Actions "🖨 EARLY-8AM PTT".
     • No new Firebase path; no Firebase writes; no SC.* changes.
   ------------------------------------------------------------
   v4.30.4 (p11.4-fcheck-split-modes) — prior
     Fleet-check popup: two modes, different entry points.
     • Paste-Today-Plan entry (runPasteCheck) keeps the compact
       read-only summary built in v4.30.3 — screenshot-friendly,
       no inputs, single CLOSE button.
     • Scale-tab entries (cert-list row click + station card
     warning click) restore the v4.22.13 inline editor — date
       inputs per expired cert, validation, SAVE writes deltas
       via SC.editBatch('fcheck-fix-expired'). User asked for
       Scale to remain editable; paste-time will be re-spec'd
       from V406 reference later.
     • Mode flag is a second arg to openIssueEditor:
         openIssueEditor(orders)                  → 'summary'
         openIssueEditor(orders, { mode:'edit' }) → 'edit'
       Paste path passes default; Scale paths pass 'edit'.
     • _saveEditor restored (was removed in v4.30.3 — was never
       dead code, just temporarily unused). Editor-only CSS for
       inputs and SAVE button also restored under #fcheck-editor.
     UI-only release: no Firebase writes added (SC.editBatch
     remains the sole write path, same as v4.22.13).

   v4.30.3 (p11.3-paste-fleet-warn-readonly) — prior
     Paste-Today-Plan fleet warning popup — read-only summary.
     • Inline date inputs and SAVE button removed. The popup is
       now a screenshot-friendly summary that staff can capture
       and forward to sale. Per-cert editing already lives on
       the Scale tab (cert centre), which is the right place to
       fix dates when the operator actually has the new value
       in hand — closing this popup no longer loses access.
     • One problem per row: cert name + expired date, packed
       3-per-line on wide containers so a 9-expired-cert order
       fits in 3 lines instead of 9.
     • Subject row collapses to a single header strip (icon +
       plate/name + badge) with the cert grid below it.
     • Title changed to "Fleet check — summary" to reflect the
       read-only nature; help text updated.
     UI-only release: no Firebase writes (popup never wrote).
     _saveEditor / editor input handler removed (dead code).

   v4.30.2 (p11.2-paste-fleet-warn-compact) — prior
     Paste-Today-Plan fleet warning popup — compact mode.
     • OK subjects no longer rendered — only problematic items
       (expired / missing / duplicate) appear in the editor.
     • Identity row dropped — the subject rows already show the
       plate/name with status badge, so the duplicate block was
       pure noise.
     • Cert rows pack 2-per-line on wide containers (auto-fit
       grid) — one expired-cert subject with 4 certs is now 2
       short rows instead of 4 long ones. Falls back to 1 column
       on narrow screens.
     • Smaller per-block padding + slimmer headers; more orders
       fit on screen without scrolling.
     UI-only release: no new Firebase read/write paths.

   v4.30.1 (p11.1-paste-fleet-warn-detailed) — prior
     Paste-Today-Plan fleet warning popup overhaul.
     • Editor now renders EVERY problematic order completely so
       missing-only and duplicate-only orders are visible (previous
       build silently dropped them).
     • Top summary banner: total issue counts split by category
       (expired certs / missing in Fleet / duplicate drivers).
     • Per-order header redesign — DO number, customer, date, and a
       compact one-line problem summary so the operator sees at a
       glance whose order it is and what's wrong.
     • Vehicle / Rmooc / Driver each get their own subject row even
       when there are no expired certs to edit — with a status badge
       (✓ OK · ❌ Missing · ⚠ Expired N · ⚠ Duplicate N) so the
       cause of the warning is never hidden.
     • Duplicate-driver warning now propagated end-to-end (was
       gathered by checkOrder but never displayed in the editor).
     UI-only release: no new Firebase read/write paths.

   v4.30.0 (p11.0-scale-hub-consolidated) — prior
     Scale tab dispatch hub — Notifications consolidation.
     • Row 5 (4 Tank-Mix cards) removed; tank-mix slots relocated
       into a single "Notifications" popup with tabs (Tank mix /
       Cert / Sync / All).
     • Row 1 Cluster 1 (Tank cell) restructured to 2 rows:
         row A — TK-3501 / TK-3502 / LOT (full name) / AUTO
         row B — live LPG / C3 / C4 of the selected tank
     • Row 1 Cluster 2 (Staff cell) restructured to 2 rows:
         row A — Engineer + Check Booth (unchanged)
         row B — Engineer Notification button (badge) +
                 Sale Notification stub (future).
     • KTPTVC opens via modal (DOM-relocation of #pf-sub-kt) so the
       operator stays on Scale; Print-tab entry routes through the
       same modal — zero code duplication.
     • Quick Actions bar enlarged to fill the space freed by Row 5.
     UI-only release: no new Firebase read/write paths.

   v4.29.2 (p10.3-scale-tank-viewer-edit) — prior
     Scale tab dispatch hub — Session 3 of 3. TK viewer becomes a
     full edit surface that writes back into TL Data on demand.

     Inline editing
     ──────────────
     • Every operationally-relevant column is now editable. The
       editor type matches the data shape:
         number  — scaleNo, turn, lot, lpgQty, c3Kg, c4Kg
         input   — date, giDate, doNo, cust, trade, type, truck,
                   rmooc, driver
       The computed columns (%C3 / %C4 / Diff%) are NOT in the
       viewer's 15-col set, so there's nothing to recompute on
       save — the TL listener handles those derivations.
     • editTriggerEvent = 'click' so a single click pops the
       editor — faster booth workflow than Tabulator's default
       double-click.
     • date / giDate values pass through the global
       normalizeDate() helper after edit, so "27/5/26", "27-5-26",
       "20260527" all canonicalize to "27/05/26" before staging.

     Staged-edit (dirty) tracking
     ────────────────────────────
     • New private _dirty Map keyed by "{rid}|{field}". Each entry
       holds { rid, field, original, edited }.
     • cellEdited handler computes "did the value actually change"
       (null/string/number-tolerant compare against TL.ROWS) and
       either adds the entry + paints the cell yellow, or removes
       it + clears the paint if the operator typed back to the
       original.
     • Yellow paint = new .tkv-dirty class on the cell element
       (same tone as TL's pending-GI yellow for consistency). The
       rowFormatter re-applies it during virtual-scroll rebuilds
       so dirty marks survive scrolling.

     Save flow
     ─────────
     • New 💾 SAVE button next to the row counter:
         - Disabled gray when nothing's dirty.
         - When edits exist → flips RED, pulses softly, shows the
           pending count, e.g. "💾 SAVE (3)".
     • On click: builds a single multi-path payload mirroring
       TL.onCellEdited's shape —
         raw_data/{rid}/{field} = edited value
         raw_data/{rid}/_ts     = Date.now()   (per touched rid)
       — fires firebase.database().ref().update(payload), then
       reads-and-increments raw_data_version so every other
       client + TL's own listener reload the touched fields.
     • Updates TL.ROWS in-memory FIRST (synchronously) so the rest
       of the app stays consistent even before the network round-
       trip completes. If TL has been built, calls
       TL.rebuildTableData() to refresh its visible table.
     • Toasts the row count on success; surfaces the Firebase
       error message on failure. Button reverts to disabled gray
       once the dirty map drains.

     Reset / safety
     ──────────────
     • ↺ Reset button — only visible when edits are staged.
       Confirms then drops the _dirty Map and re-renders from
       TL.ROWS so cells revert.
     • close() — if dirty edits exist, confirms before discarding.
     • open(tk) — if a different tank is being opened with dirty
       edits still staged, confirms before swapping context.
     • openInTl() — confirms before navigating away with dirty
       edits.
     • New CSS:
         .tkv-dirty             — yellow cell tint + amber inset
         .tkv-tb-btn-save       — gray disabled state
         .tkv-tb-btn-save-on    — red + pulse animation (keyframe
                                   tkv-save-pulse, 1.6s ease)
         .tkv-tb-btn-reset      — red outlined "danger" style
         .tkv-tb-hint           — purple dashed "click cell to
                                   edit" caption next to the count

     CONCLUSION OF THE 3-SESSION PLAN
     ────────────────────────────────
     Scale is now the full dispatch control hub:
       Row 1   — Tank/Lot · Staff · PLAN · Report shortcut
       Row 2-4 — station map
       Row 5   — Tank-mix notification cards
       Row 6   — QUICK ACTIONS bar
                 [Paste Today][Paste Tomorrow][Paste WMS GI]
                 [Paste WMS ST][Paste SAP][KTPTVC] | [TK-3501][TK-3502]
     The TK-3501 / TK-3502 buttons each open a compact 15-column
     TL viewer (today's GI date by default, free-text search,
     click-to-edit, batched SAVE → raw_data delta-write). The full
     37-column TL editor is one click away via "Full TL Data →"
     when the operator needs delete or column-show-hide.
     Operators never have to leave Scale to import plan data,
     print KTPTVC, inspect what's leaving a tank, or correct a
     weighing record.

   v4.29.1 (p10.2-scale-tank-viewer) — prior
     Scale tab dispatch hub — Session 2 of 3.

     Two new buttons 🛢 TK-3501 / 🛢 TK-3502 in the QUICK ACTIONS
     bar open a compact, read-only TL Data viewer modal scoped
     to that tank's outgoing orders. Operators get the most
     useful 15 columns at a glance without leaving Scale.

     New TKV module (IIFE, after window.scOpenKtptvc):
       • Source: TL.ROWS (live RAM). No Firebase round-trip.
       • Filter chain:
           tank      — String(r.ltank).toUpperCase().includes(
                       '3501' or '3502'); handles every stored
                       format ('TK-3501' / '3501' / '01').
           giDate    — exact-match against r.giDate (DD/MM/YY);
                       default = today, settable via the date
                       input, "Today" button (reset to today)
                       or "All dates" button (clear filter).
           search    — lowercase substring across DO / customer
                       / truck / rmooc / driver / lot /
                       engineer / WMS customer.
       • Sort: GI date · scale · turn — chronological dispatch
         order matching the booth's read flow.
       • Columns (15): Date · GI Date · DO No. · Customer ·
         Trade · Type · Sc · Tn · Lot · Net Wt · Truck · Rmooc
         · Driver · C3 kg · C4 kg.
       • Date helpers: _isoToDdmmyy / _ddmmyyToIso /
         _todayDdmmyy / _ddmmyyKey — bridge between the HTML
         <input type="date"> (YYYY-MM-DD) and TL's DD/MM/YY.
       • Lazy Tabulator instance — built on first open, reused
         on subsequent opens via replaceData() for fast switch
         between tanks / filters.
       • Row tinting reused from TL: tl-tk-3501 (blue inset
         border) / tl-tk-3502 (orange).
       • Public API: open(tk) · close() · onDateChange(iso) ·
         clearDate() · setDateToday() · onSearch(v) · openInTl().

     New modal #tkv-modal:
       • Fixed overlay at z-index 300, 1100px / 96vw, 80vh.
       • Header tints blue (3501) or orange (3502) — matches
         the tank colour throughout the app.
       • Toolbar: GI-DATE input + Today / All-dates buttons,
         SEARCH input (240px), row counter, "Full TL Data →"
         button that navigates to Sales > TL sub-tab for the
         deep 37-column editor.
       • Body: full-height Tabulator (#tkv-tbl) at font-size
         11px to keep all 15 columns visible without scrolling.

     New CSS:
       • .tkv-modal-bg / .tkv-modal / .tkv-hdr[.tkv-hdr-3501 |
         .tkv-hdr-3502] / .tkv-ttl / .tkv-x / .tkv-toolbar /
         .tkv-tb-grp / .tkv-tb-lbl / .tkv-tb-date /
         .tkv-tb-search / .tkv-tb-btn[.tkv-tb-btn-full] /
         .tkv-tb-cnt / .tkv-body.
       • .sc-sc-btn-tk1 (blue) + .sc-sc-btn-tk2 (orange) for
         the QUICK ACTIONS bar buttons.
       • .sc-sc-sep — thin vertical divider between the
         paste/print group and the tank-viewer group.

     NEXT — Session 3
     ────────────────
     Add inline editing in the compact viewer + a "💾 SAVE"
     button that performs a multi-path Firebase update against
     /raw_data so edits flow back into TL Data without leaving
     the modal. The "Full TL Data →" button stays as the
     escape hatch for delete / column-show-hide / advanced
     filtering.

   v4.29.0 (p10.1-scale-quick-actions) — prior
     Scale tab becomes the dispatch control hub — Session 1 of 3.

     PLAN
     ─────
     The operator should never have to leave Scale to paste plan
     data or print KTPTVC. Three sessions:
       Session 1 (this build): 6 QUICK-ACTION buttons in the
         shortcut bar — Paste Today / Tomorrow / WMS GI / WMS ST
         / SAP / Open KTPTVC.
       Session 2 (next):       2 buttons TK-3501 / TK-3502 open
         a compact TL-Data viewer modal — read-only, filtered to
         that tank's outgoing orders, default date = today, with
         search and a "Full TL Data" link.
       Session 3 (after):      add inline edit + save to the
         compact viewer so changes flow back into TL Data
         (Firebase multi-path update).

     SESSION 1 — what changed
     ────────────────────────
     • The Row 6 placeholder ("Shortcut buttons will appear
       here") is replaced with a real QUICK ACTIONS bar.
     • 6 colour-coded pill buttons:
         📋 PASTE TODAY     → tpOpenPaste()    (green)
         📋 PASTE TOMORROW  → tmrOpenPaste()   (orange)
         📦 PASTE WMS GI    → wgOpenPaste()    (teal)
         📦 PASTE WMS ST    → wsOpenPaste()    (teal-dark)
         📊 PASTE SAP       → spOpenPaste()    (blue)
         🔍 KTPTVC          → scOpenKtptvc()   (purple)
     • Each paste action delegates directly to the existing
       module-level handler. The paste modals are independent
       overlays so they open correctly regardless of which sales
       sub-tab is currently active — no need to switch tabs.
     • New window.scOpenKtptvc() — single helper that calls
       navGo('print') then pfSwitch('kt', #pf-tab-kt) so the
       Print page opens directly on the KTPTVC sub-tab.

     LAYOUT
     ──────
     • .sc-shortcut-bar switched from grid to flex (wrap), so the
       buttons sit naturally side-by-side and wrap gracefully on
       narrow viewports.
     • New "QUICK ACTIONS" caption (.sc-sc-lbl) at the row's left
       edge (Oswald 9px, 1.4px tracking, muted) so the row reads
       as a labelled toolbar.
     • Each button is a compact pill (~32px tall) with icon +
       short label; coloured outline + soft tinted background
       that fills on hover, matching each module's identity.

     NEXT
     ────
     Session 2 will add the TK-3501 / TK-3502 viewer modal —
     compact Tabulator table, date filter, search box, "Full TL
     Data" link. Wired into the same QUICK ACTIONS bar to keep
     all dispatch controls in one place.

   v4.28.3 (p9.6-mix-notify-single-line) — prior
     Tank-mix notification cards refined for one-line layout
     with bigger C3/C4 numbers and a compact TK · lot header.

     Render (MIXNOTIFY.render):
       • Lot display strips the "LPG-YYYY-" prefix and shows only
         the trailing lot number — e.g. "LPG-2026-7" → "7". Match
         is /(\d+)$/; falls back to the raw string if no trailing
         digits found. Result: header reads "TK-3502 · 7" instead
         of "TK-3502 · LPG-2026-7".

     CSS only (Row 5):
       • Single line — .sc-r5-mix-vals drops flex-wrap:wrap and
         adds white-space:nowrap. .sc-r5-mix gets min-width:0 and
         the cell adds overflow:hidden. .sc-r5-mix-vals also gets
         min-width:0 + text-overflow:ellipsis for narrow viewports.
       • Header shrinks (.sc-r5-mix-hd font 18 → 13px, flex 0 0
         auto so it doesn't compete for space).
       • Numbers grow (.sc-r5-mix-vals font 18 → 22px) — C3 / C4 /
         total now dominate the card visually. Align changed from
         "center" to "baseline" so the bigger digits sit cleanly
         next to each other.
       • Cell min-height 60 → 50px (one line needs less vertical
         room); padding 10/14 → 8/14 on the on-state.
       • OK button trimmed (font 16 → 15px, padding 6/14 → 5/12)
         and pinned with flex 0 0 auto so it never gets squeezed.

   v4.28.2 (p9.5-mix-notify-bigger) — prior
     Tank-mix notification cards (Scale Row 5) roughly doubled in
     size so the C3 / C4 / total figures read clearly from across
     the booth.

     CSS only — no markup, no module changes:
       • .sc-r5-cell        min-height 30 → 60px, padding 4 8 →
                            8 14, placeholder font 9 → 13px
       • .sc-r5-cell-on     padding 5 8 → 10 14
       • .sc-r5-mix         gap 8 → 14
       • .sc-r5-mix-hd      font 11 → 18px (tank · lot header)
       • .sc-r5-mix-vals    font 11 → 18px, gap 6 → 12
                            (C3 · C4 · total monospace numbers)
       • .sc-r5-mix-c3/c4   font-weight 600 → 700 for stronger
                            colour reading
       • .sc-r5-mix-ok      font 11 → 16px, padding 2 8 → 6 14,
                            border-radius 4 → 5
     Empty placeholder font bumped modestly (9 → 13px) so empty
     slots still read but don't compete with active slots.

   v4.28.1 (p9.4-scale-report-shortcut) — prior
     Scale tab Report shortcut — Row 1 is back to 4 clusters
     (Tank/Lot · Staff · PLAN · Report shortcut).

     The Report tab (#page-report) is UNCHANGED — full Report
     Engine UI (help block · file card · date card · action card
     · log card) still lives there with all its rpt-* IDs.

     What changed on the Scale tab:
       • #scRow1 inline style `grid-template-columns:repeat(3,1fr)`
         removed; row falls back to the default 4-column grid.
       • Row 1b (#scR1bReport) removed entirely along with its
         #scaleReportSlot receiver div.
       • New 4th .sc-r1-cell with class .sc-r1-rpt-cell — a tight
         vertical-stack card the same height as Tank/Lot · Staff
         · PLAN:
            row 1: 📋 REPORT + badge (NOT SELECTED / READY)
            row 2: file pick strip (📄 filename)
            row 3: date input + Y (Yesterday) + T (Today) buttons
            row 4: 🔍 CHECK  +  📋 EXPORT
         Own DOM IDs (sc-rpt-file-box / sc-rpt-file-name /
         sc-rpt-file-badge / sc-rpt-btn-export / sc-rpt-date) so
         no ID clash with the full Report Engine.

     State sync (Scale shortcut ↔ Report tab):
       • RPT.updateUI() — when a file is picked, mirrors filename
         + "READY" badge + has-file class + export-button enable
         to BOTH homes (rpt-* and sc-rpt-*).
       • RPT.setDate(which) — when Y/T quick buttons fire, sets
         BOTH #rpt-date and #sc-rpt-date.
       • RPT.init() — seeds today's date into BOTH inputs; navGo
         now calls it on both id==='report' and id==='sales' so
         the shortcut input is never blank when the operator
         opens Scale.
       • New window.scRptSyncDate(v) — bound to the Scale
         shortcut date input's `oninput`; mirrors the typed
         value into #rpt-date so RPT.executeExport / RPT.preCheck
         (which read by ID from the Report tab) see it.

     Relocator retired:
       • v4.22.19's window.moveReportShellToScale /
         moveReportShellToReportTab are demoted to no-op shims
         (kept on `window` for backward-compat in case any stale
         call sites survive).
       • navGo() no longer calls them; .rpt-shell stays at
         #page-report.

     CSS:
       • Removed .sc-row-rpt and .sc-rpt-inline-card rules.
       • Added .sc-r1-rpt-cell + sub-rules (.sc-r1-rpt-hdr /
         .sc-r1-rpt-ico / .sc-r1-rpt-ttl / .sc-r1-rpt-badge[.ready]
         / .sc-r1-rpt-file[.has-file] / .sc-r1-rpt-fname /
         .sc-r1-rpt-rowctrl / .sc-r1-rpt-date / .sc-r1-rpt-quick
         / .sc-r1-rpt-rowbtn / .sc-r1-rpt-btn[-check|-export]).

     Net effect: operator gets a one-click Report flow inline on
     Scale (pick file · set date · check · export) while the
     "official" Report tab is unchanged for full-page work.
     No Firebase / schema changes.

   v4.28.0 (p9.3-vessel-log) — prior
     Vessel Log — Session 6 of Tank-Mix-completion plan.
     Closes the Vessel Mix → Vessel Log save loop.

     Feature 1 — Vessel Log table sub-tab (#eng-pg-shiplog).
     The placeholder is replaced with a full table:
       • Toolbar: 📋 VESSEL LOG title, free-text search (Lot / Ship /
         Customer / Date / Tank / Type), two narrow filter inputs for
         %Vol C3 and %Wt C3 (±0.5 tolerance), live stats counter,
         ⬇ EXPORT (CSV), 🗑 CLEAR ALL.
       • Table columns (19 total):
         actions ✏ ✕ · No · Lot · Tank · Ship · Customer · Date ·
         Start · Finish · Qty · %Vol C3 · %Vol C4 · %Wt C3 · %Wt C4 ·
         C3 Wt · C4 Wt · LPG Wt · Quality · Remark.
       • Row identity: lot grouped with .row-newlot top-border;
         secondary cells (Customer / Date) blank on the ↳ continuation
         row to match V406 readability.
       • Tank cell colour-coded: '1' → blue chip, '2' → orange chip,
         '02 TANK' → green chip (merged 1-ratio row).
       • Quality cell: Pass=green, Fail=red.

     Feature 2 — VLOG module (IIFE, after VMIX).
       Firebase path: /vessel_mix_log/{rid} — rid-keyed (not array)
       so a save is one child write, not a full-tree rewrite.
       Listeners:
         • child_added — initial backfill + remote adds
         • child_changed — remote edits (e.g. remark)
         • child_removed — remote deletions
       Each listener is _suppressEcho-guarded so a local write doesn't
       echo back as a duplicate render.
       Public API:
         • init / render
         • pushEntry(entry) — accepts entry without _rid (generates
           one) or with _rid (overwrite). Returns the rid.
         • deleteRow(rid) / clearAll() — with confirm dialogs.
         • openEdit(rid) — minimal Remark editor via prompt()
           (a full row-edit modal is deferred to a later session).
         • exportCsv() — UTF-8 BOM CSV download of currently-
           visible (filtered) rows.
         • Getter: ROWS.
       Badge: #engBadgeShiplog updated on every render.

     Feature 3 — Real VMIX.saveLog() (replaces the v4.27.0 stub).
       Workflow:
         1. Validates lot, GC sums (warn-but-allow on ≠100%),
            critical fields (Customer / Date / per-tank Total Loaded).
         2. If the operator skipped 🧮 CALCULATE RESULT, runs it
            once silently so _afterResult is populated.
         3. Builds commonInfo (lot, type, ship, customer, date,
            start/finish, c3fq, c4fq, ratio).
         4. Collects per-tank data via _collectTank(i) — merges DOM
            inputs with the cached _afterResult intermediates
            (tw3, tw4, wr3, ld3=stC3, ld4=stC4, fqty, lw3, lw4,
            vw3, vw4).
         5. Cross-checks RATIO button vs actual Target C3% (V406
            sanity dialog: 1-ratio with different targets → confirm,
            2-ratio with identical targets → confirm).
         6. Branches:
              • RATIO=1 + both tanks have data → ONE merged entry
                with tank='02 TANK', aggregated gTw3/gTw4/gTwt/
                gTload/gR/stC3/stC4, %vol/%wt from tank-0 target.
              • Otherwise (RATIO=2 or single tank) → ONE entry per
                active tank with tank='1' | '2', per-tank GC stored
                under entry.gc.
         7. Quality check via _qualCheck() — Pass/Fail using
            ±0.5% tolerance from min/max bounds (vol↔wt convert
            when targetUnit='vol').
         8. Every entry pushed via VLOG.pushEntry — one Firebase
           child set per entry, plus echo-suppressed listener.

     Wiring:
       • engSwitchTab('shiplog') → calls VLOG.render() to bring
         badge + rows up to date on tab focus.
       • VLOG.init() added to P4 boot (right after VMIX.init).

     Spark-frugality:
       • Save = 1 child write per entry (max 2 for 2-ratio).
       • Edit-remark = 1 child update (not a full rewrite).
       • Delete = 1 child set-null.
       • Clear all = 1 root set-null.
       • Compare with V406 which did .set(SM_LOG) on the whole array
         every save — usually 10–100× more bandwidth per write.

     Out of scope this session (deferred):
       • Full Vessel Log edit modal (all 30+ columns) — current
         openEdit is a Remark-only prompt(). Lands in v4.29.
       • Paste-from-Excel into Vessel Log (V406 smPasteLog).
       • Column grouping toggles (V406 SL_GRP plan/weight/gc1/gc2/
         extra) — current Vessel Log shows a fixed lean column set
         instead. Adding the toggles is a single-session task once
         the operator decides which groups they actually use.
       • Ship Mix State Machine FB sync (ship_mix_state) — only
         needed once two engineers actively co-mix the same vessel;
         not required for single-operator save flow.

   v4.27.0 (p9.2-vessel-mix-calc) — prior
     Vessel Mix — Session 5 of Tank-Mix-completion plan.

     Feature — Real per-tank mass-balance for Vessel Mix.
     The calcPlan / calcResult stubs from v4.26.0 are replaced with
     direct ports of V406 smCalcPlan + smCalcResult. Both functions
     are pure RAM; no Firebase writes. The PLAN card auto-recomputes
     on every QTY / Target / ODO / TOL input change (already wired
     via oninput); the AFTER-LOADING card recomputes when the
     operator presses 🧮 CALCULATE RESULT.

     calcPlan(i ∈ {0,1}):
       • Inputs: qty (ton), r3 (% C3, unit = vol|wt), tolerance %,
         odorPpm.
       • Converts between %vol and %wt using DENS.{c3l,c4l}:
           vol→wt :  m_i = r_i · DL_i, ptw_i = m_i / Σm
           wt→vol :  v_i = r_i / DL_i, ptv_i = v_i / Σv
       • edens (kg/m³) = 1000·[(ptv3/100)·(c3_vr/100)·c3_den
                              + (ptv4/100)·((nc4_vr/100)·nc4_den
                              + (ic4_vr/100)·ic4_den)]
       • mixtgt{3,4} = qty · ptw{3,4}/100  (mass split per component)
       • odorkg      = qty · odorPpm / 1000
       • Tolerance band = qty · (1 ∓ tole/100)
       • Renders into #vs-plan-res-{i}: header row (MIX TARGET %vol /
         %wt / Odorant / Est.Density) + two large C4/C3 cards + a
         tolerance range line. Per-tank state pill auto-promotes
         idle → calc on first input.

     calcResult():
       • Per tank i, reads Liq Vol, Total Loaded, Init Vap Wt, and
         the 8-cell GC strip. Uses ship.tk{i+1}_m3 as the working
         tank's maximum volume.
       • Liquid-phase ratios from GC propane & butanes:
           lvr3 = C3H8 / (C3H8 + iC4 + nC4)
           lvr4 = (iC4 + nC4) / (C3H8 + iC4 + nC4)
       • Distributes the same ratio onto the vapour space
         (vtot = maxV − lvol), so the calc treats the vapour
         composition as ≈ the liquid composition (V406 simplification).
       • Weight per component:
           lw_i = lv_i · DL_i,    vw_i = vv_i · DV_i
           tw_i = lw_i + vw_i,    twt  = tw3 + tw4
           wr_i = tw_i / twt
           fqty = twt − initVapWt
           ld3  = tload · round(wr3, 2)
           ld4  = tload − ld3
       • Renders:
           – collapsible RESULT row + hidden detail table into
             #vs-after-res-{i} (Liq Vol / Liq Ratio / Vap Vol /
             Liq Wt / Vap Wt / Total Wt / Wt Ratio / Filled Qty /
             Loaded).
           – yellow per-tank grand-total card into #vs-grand-{i}
             when tload is present.
       • Per-tank state pill: 'pending' if some after-loading inputs
         are filled but not enough; 'done' once tload + GC + lvol
         are all in.
       • Cached intermediate (_afterResult[i]) is exposed via
         VMIX.AFTER_RESULT — Session 6's saveLog reads this directly
         instead of recomputing.

     Wiring (no new boot work):
       • The HTML already calls oninput="VMIX.calcPlan()" on QTY,
         Target, ODO, TOL — calcPlan handles its own debouncing via
         the existing oninput cadence.
       • 🧮 CALCULATE RESULT button onclick="VMIX.calcResult()"
         (already wired in v4.26.0).

     saveLog is still a stub pointing at v4.28.0 — _afterResult is
     the contract; v4.28.0 will read it to write one entry per mix
     to /vessel_mix_log.

     Diagnostics:
       • When calcResult finds no tank produces a result, it toasts
         a concise per-tank reason list (Vessel not selected /
         missing Liq Vol / missing GC / maxVol=0) — same UX as V406
         but English-only.

     Out of scope this session (deferred to S6):
       • Vessel Log sub-tab table + Firebase listener (vessel_mix_log).
       • saveLog — writes one entry per mix, derives from
         VMIX.AFTER_RESULT (no recompute).
       • Vessel Log paste-from-Excel.

   v4.26.0 (p9.1-vessel-mix-scaffold) — prior
     Vessel Mix — Session 4 of Tank-Mix-completion plan.

     Feature — Vessel Mix Calculator UI scaffold + VMIX module.
     The existing Engineer sub-tab "🚢 Vessel" (#eng-pg-shipcal) was
     a "Coming in a later phase" placeholder; this version replaces
     it with the full V406 sm* layout (ported, not copied — built on
     v4 design tokens) so the operator can validate the form shape
     against V406 screens before the calc logic lands in v4.27.0.

     Layout (single sub-pane):
       • Header bar (one horizontal row): SHIP selector · TYPE (Dom/Exp)
         · LOT (# + auto-pick ↺ + LPG-YYYY-{S/EX}-NNN preview) ·
         CUSTOMER · DATE · START (HH:MM + ▶) · FINISH (HH:MM + ⏹) ·
         C3 FQ · C4 FQ · RATIO toggle · ⚙ VESSEL · ρ · 🔄 · 💾 SAVE.
       • Two side-by-side tank columns (blue TANK 1 / orange TANK 2):
           Plan card: QTY · TARGET C3 (with %vol/%wt switch) ·
                      MIN C3% · MAX C3% · ODO ppm · TOL %
           Plan result placeholder
           After Loading card: Init Liq Wt · Init Vap Wt · Total
                      Loaded · Liq Vol m³ · Lab Dens, plus 8-cell
                      GC strip (CH₄ C₂H₆ C₃H₈ i-C₄ n-C₄ 1,3-BD
                      C5+ Olefins) with a live Σ visual check
                      (✓ ⚠ ≠100). 🧮 CALCULATE RESULT button.
                      After-result placeholder + grand-total box.
       • Vessel + density edit modal — single body-level
         #vsmixModalBg / #vsmixModal slot, dispatched via
         VMIX.openShipEdit / VMIX.openDensityEdit (one render path,
         no twin overlays).

     VMIX module (IIFE) — placed right after MIXNOTIFY.
       Defaults match V406:
         • SHIPS: VIET GAS 01 (452.056 / 721.153 m³), VIET GAS
           (500 / 500 m³), OCEAN STAR (2509.007 / 2508.962 m³).
         • DENS: { c3l:0.492, c4l:0.566, c3v:0.01721, c4v:0.00825 }.
         • PROPS: V406 component vol-ratio / density values.
       Firebase listeners (already attached this version):
         • /vessel_config  → { ships, props }
         • /vessel_density → { c3l, c4l, c3v, c4v }
       (Writes to these paths are wired here so ⚙ VESSEL and ρ work
       persistently across sessions. /vessel_mix_log is deferred to
       Session 6.)
       Public API:
         • init / refresh
         • onShipChange / updateLot / autoLot
         • toggleRatio / onUnitChange / gcSum
         • startMix / finishMix / reset
         • calcPlan / calcResult / saveLog (STUBS → toast pointing
           to v4.27.0 / v4.28.0; deliberately inert so we don't
           ship half-working math)
         • openShipEdit / openDensityEdit / closeModal
         • Getters: SHIPS, DENS, PROPS, RATIO, UNIT, STATE, SEL_SHIP

     Wiring:
       • engSwitchTab('shipcal') → calls VMIX.refresh().
       • VMIX.init() added to the P4 boot stage (right after
         MIXNOTIFY.init).
       • Date / time inputs reuse MC.fmtDate / MC.fmtDateBlur /
         MC.fmtTime helpers — no duplicated mask code.

     Spark-frugality:
       • Zero writes on UI scaffold. The two new listeners
         (vessel_config / vessel_density) are small objects
         (~200 bytes total). Defaults wins if either path is empty.

     Out of scope this session (deferred):
       • calcPlan() — per-tank mass-balance from GC + density +
         volume → Filled C3/C4/LPG, target compliance, tolerance
         band (Session 5).
       • calcResult() — combines plan + after-loading + GC into a
         grand-total + tolerance check (Session 5).
       • Mixing-state Firebase sync via ship_mix_state (Session 5).
       • saveLog() — writes one entry to vessel_mix_log per mix
         (Session 6, alongside Vessel Log table).
       • Vessel Log sub-tab table + paste + Firebase (Session 6).

   v4.25.0 (p8.3-open-gc-resume) — prior
     Tank Log feature parity · Session 3 of Tank-Mix-completion plan.

     Feature — "🧪 OPEN GC" button on the Tank Log edit modal.
     Operator clicks a Pending row → modal → "🧪 OPEN GC" → app
     jumps to Mix Cal sub-tab, restores the lot's full context into
     the correct tank panel (TK-3501 or TK-3502), and scrolls/focuses
     the inline GC section. Operator finishes GC, presses 🧮 CALC
     then 💾 SAVE PASS → TANK LOG. _saveToTankLog already routes
     through ENG.upsertRow which finds the existing row by Lot|Tank
     (year-tolerant numeric match) → same rid, one child write.

     Implementation:
       • New MC.openGc(rowSnap) — public, accepts a 34-col row
         snapshot (defensive copy, not a live reference). Picks the
         tank from r[2] ('TK-3501' → n='1', else n='2'). Refuses /
         confirms when the target tank is mixing a different lot.
         Switches engSwitchTab('mixcal'), sets ST[n]='calc' (so all
         inputs stay editable), MIXING_LOT[n]=parsed-lot-num, then
         prefills:
           – mc-l/mc-iv/mc-tv/mc-tr/mc-cr (lot, init vol, target
             vol/C3, current C3)
           – mc-sd/mc-s/mc-fd/mc-f (start/finish date+time)
           – gc{n}-c2h6/c3h8/ic4/nc4/c5/olef (GC light + heavy)
           – gc{n}-temp/pres/fvol/den (Temp, Pressure, Final Vol,
             Density)
         Forces CR_MODE='manual' (user provided the value), unlocks
         the CR input and flips the CR mode button. Then calls
         updateLotNames + _renderStatus + gcSumInline + autoCalc,
         scrolls #mc-gc-inline{n} into view and focuses the first
         GC input after 300ms.
       • New ENG.openGc() — bridge. Snapshots the row under edit,
         closes the modal, calls MC.openGc(snap). Defensive try/catch
         so a MC-side bug surfaces as a toast, not a silent fail.

     UX:
       • Edit modal now has 4 buttons in the footer (left → right):
         🧪 OPEN GC (purple) · 🧮 CALC+💾 SAVE+📢 NOTIFY (blue) ·
         💾 SAVE (green) · Cancel (grey). Visual hierarchy mirrors
         the natural workflow: resume → recalc → save → bail.
       • Lot string year mismatch (e.g. resuming an LPG-2025-NNN row
         in 2026) is tolerated by findRowByLotTank's numeric-suffix
         match, so the same-numeric-lot rule wins over year drift.

     Spark-frugality:
       • Zero Firebase writes on OPEN GC — pure RAM state restore.
       • The eventual 💾 SAVE PASS issues exactly 1 child write
         (same as a fresh save) via the existing ENG.upsertRow path.

     Out of scope this session (deferred):
       • Vessel Mix module + sub-tab + UI scaffold (S4).
       • Vessel Mix calculations (S5).
       • Vessel Log table + paste + Firebase (S6).

   v4.24.0 (p8.2-calc-save-notify) — prior
     Tank Log feature parity · Session 2 of Tank-Mix-completion plan.

     Feature 1 — Edit modal "🧮 CALC + 💾 SAVE + 📢 NOTIFY" button.
     Operator opens any Tank Log row, edits GC / final vol / density,
     clicks the blue button → engine recomputes Filled C3/C4/LPG/Qty
     and writes the result back to cols 13/14/15/7/8/9/24/25, stamps
     col 27='Pass', updates Odorant (col 26), pushes one Firebase
     child write, then pushes a notification to the Scale Station
     4-slot bar so the floor staff knows new stock just landed.

     Implementation:
       • New MC.calcFromRow(row) — pure function (no DOM, no FB writes).
         Reuses the same mass-balance formula as gcCalcInline; reads
         cols [17,18,19,20,22,23] GC, [6] fvol, [33] density, [10] iv,
         [11] crC3, [29] trC3, [30] tv. Returns
         { fC3, fC4, fLPG, rC3, rC4, qty, tC3, tC4, odoBD, error? }.
         Caller decides which cols to update.
       • ENG.calcSaveNotify() — orchestrator: commits modal inputs,
         validates Start Time (col 4, must exist), auto-fills Finish
         Time (col 5) if blank, calls MC.calcFromRow, writes results
         back to the row, _saveCache + _pushRowFb (one child write),
         then MIXNOTIFY.pushNotify(tkName, lot, c3Kg, c4Kg, key).

     Feature 2 — MIXNOTIFY module + Scale Row-5 4-slot bar.
       • New IIFE module right after MC. Firebase path /mix_notify.
       • State: PEND[pk] = entry (only entries that aren't
         {confirmed:true} or {cancelled:true}).
       • pushNotify(tkName, lot, c3Kg, c4Kg, key) — writes one small
         object (~80 bytes) keyed by sanitized pk (tkName+'_'+lot
         with [.#$/\[\]] → _).
       • Firebase .on('value') listener rebuilds PEND and calls
         render(); all devices share the same view.
       • render() — populates the 4 #scRow5 .sc-r5-cell slots with
         the OLDEST 4 pending entries (sort by _ts ascending). Empty
         slots fall back to "Tank Mix N" placeholder text.
       • Each active slot shows TK-name · LPG-YYYY-NNN, C3/C4 in kg,
         total, and a ✅ button. Click ✅ → MIXNOTIFY.confirm(pk) →
         FB child .update({confirmed:true}) → slot drops out → next
         oldest fills the spot automatically.
       • New CSS .sc-r5-cell-on + .sc-r5-mix* classes (purple theme
         to match V406 stl-mix-float colour identity).
       • MIXNOTIFY.init() added to P4 boot stage.

     HTML:
       • Edit modal footer gains "🧮 CALC + 💾 SAVE + 📢 NOTIFY"
         button (.eng-edit-btn.csn) ahead of the plain SAVE.
       • Row 5 placeholders refreshed: "Tank Mix N" without "(TBD)";
         the rendered empty state now mirrors this.

     Spark-frugality:
       • CALC+SAVE+NOTIFY = 1 child set on eng_tkmix + 1 child set
         on mix_notify per mix. Confirm = 1 child update. No FB
         reads (PEND state is built from the listener payload).

     Out of scope this session (deferred):
       • "Open GC" — resume a Pending lot back into inline GC (S3).
       • Vessel Mix module (S4+).

   v4.23.0 (p8.1-tanklog-edit-modal) — prior
     Tank Log feature parity · Session 1 of Tank-Mix-completion plan.

     New — Tank Log row-edit modal (V406 engEditRow port,
     re-implemented for v4's IIFE module + rid-keyed storage):
       • Click any row in the Tank Log table → modal opens.
       • 26 editable fields laid out in a 5-row × 6-col CSS grid.
       • Highlighted fields (V406 parity):
           – Lot (purple), Tank (blue)
           – Filled C3 (blue), Filled C4 (orange), Filled LPG (red)
           – %C3 Result (blue), %C4 Result (orange)
       • Date columns rendered as DD/MM/YY text inputs with a light
         oninput mask; time columns as HH:MM with numeric mask.
       • Save button writes back to RAM (RID_MAP/ROWS in place to
         preserve row identity), persists to localStorage cache,
         and pushes a single Firebase child set via _pushRowFb —
         no full-tree rewrite.
       • String-preserving columns: 1 (Lot), 2 (Tank), 3 (Date),
         4 (Start), 5 (Finish), 27 (Quality), 28 (Remark). All other
         columns are parseFloat'd if non-empty, else kept as string.

     Wiring:
       • ENG.editRow(idx,event) kept for backward compat (render()
         still calls it from the row onclick) — now just resolves
         rid and forwards to openEdit(rid).
       • New: ENG.openEdit(rid), ENG.closeEdit(), ENG.saveEdit(),
         ENG._timeMask, ENG._dateMask (used by inline oninput).
       • _editingRid module-private state tracks the row under edit.

     HTML:
       • #engEditBg / #engEditModal added at the bottom of
         #eng-pg-tkmix (still a fixed-position overlay, parented
         to the engineer page so it lives near related markup).
       • CALC+SAVE+NOTIFY button intentionally not added in this
         session — comes in v4.24.0 along with mix_notify Firebase
         wiring and the 4-slot banner on Scale row-5.

     CSS:
       • New .eng-edit-bg / .eng-edit-modal / .eng-edit-grid /
         .eng-edit-fld / .eng-edit-inp + .hl-lot / .hl-tank /
         .hl-c3 / .hl-c4 / .hl-lpg / .eng-edit-foot / .eng-edit-btn
         rules added right after the MC settings modal CSS.

     Out of scope this session (deferred to v4.24+):
       • CALC + SAVE + NOTIFY button + recompute logic.
       • mix_notify Firebase node + Scale Row-5 4-slot rendering.
       • "Open GC" — resume a Pending lot back into inline GC.
       • Vessel Mix + Vessel Log modules.

   v4.22.19 (p7.6-scale-report-inline-no-modal) — prior
     WMS/SAP refactoring updates · Piece E refinement.

     Operator feedback (image-1 vs image-2): the v4.22.18 modal
     launcher (a small "📋 OPEN REPORT" button inside the Reserved
     slot, opening the Report Engine in a modal overlay) was the
     wrong shape. The Report Engine cards — REPORT FILE / EXPORT
     DATE / ACTIONS (Check Data + Export Report) — should sit
     directly inside the Scale tab as inline UI, not behind a
     button → modal indirection.

     Layout change:
       • Row 1 cluster-4 (Reserved slot) removed. Row 1 grid
         inline-overridden to grid-template-columns:repeat(3,1fr)
         so Tank/Lot · Staff · PLAN clusters fill the row cleanly.
       • New Row 1b sub-row (#scR1bReport) inserted directly below
         Row 1 in #page-sales, full width, hosting a single
         receiver div #scaleReportSlot inside a .sc-rpt-inline-card
         wrapper.
       • The .rpt-shell DOM (entire Report Engine: file card, date
         card, action card, log card) is now DOM-moved into
         #scaleReportSlot on first navGo('sales'). On
         navGo('report') it moves back to #page-report. Bidirectional
         on every tab switch — single source of truth, no clones.

     JS:
       • window.openScaleReportModal / window.closeScaleReportModal
         (v4.22.18) demoted to no-op shims for backward compat in
         case any stale onclick references survive.
       • New window.moveReportShellToScale() — appendChild .rpt-shell
         to #scaleReportSlot if not already there.
       • New window.moveReportShellToReportTab() — appendChild it
         back to #page-report if not already there.
       • navGo() hooked: id==='sales' → moveReportShellToScale,
         id==='report' → moveReportShellToReportTab. P0 boot step
         already calls navGo('sales') so the shell lands in the
         Scale slot on first paint; both window.* functions are
         defined before the staged scheduler runs (boot work is
         scheduled via rAF and runs after script parse).

     HTML:
       • #scaleReportModal element removed entirely. No longer in DOM.
       • Reserved slot HTML removed entirely.

     CSS:
       • .sc-r1-reserved-rpt / .sc-r1-rpt-btn / .scale-report-modal
         rules removed (modal styles no longer needed).
       • New .sc-row-rpt (padding + margin-top to align with other
         rows) and .sc-rpt-inline-card (border + radius matching
         .sc-r1-cell) and a tight override of .rpt-shell padding
         so it fits the inline card without the page-gutter centring.

     Net effect: operator opens Scale → sees the full Report Engine
     inline (Report File · Export Date · Actions, plus the Log) ready
     to use. Going to the Report tab still works and shows the same
     UI in its original home. No syncing, no duplicated state, no
     wiring changes to RPT module body.

   v4.22.18 (p7.5-scale-reserved-report-launcher) — prior
     WMS/SAP refactoring updates · Piece E of 5 (final).

     Feature — Scale row-1 Reserved slot now hosts an in-Scale
     Report launcher. Operators can pick the monthly .xlsx,
     set the export date, run Check Data and Export Report
     without leaving the Scale tab.

     Implementation strategy — DOM relocation, not duplication.
       • Reserved slot's RESERVED placeholder replaced with a
         "📋 OPEN REPORT" pill button (.sc-r1-rpt-btn) plus a
         small "REPORT" caption.
       • New modal #scaleReportModal (wide, max 1240px / 96vw,
         max-height 92vh, scroll-y inside body) styled as
         .scale-report-modal. Empty body #scaleReportModalBody
         acts as a receiver slot.
       • openScaleReportModal():
           – Look up #page-report > .rpt-shell.
           – If its parentNode is not already #scaleReportModalBody,
             appendChild it (DOM move — no clone).
           – Toggle the modal .on class.
       • closeScaleReportModal():
           – Remove .on from #scaleReportModal.
           – If the .rpt-shell now lives in the modal, appendChild
             it back to #page-report so the Report tab keeps the
             same UI when the operator navigates to it normally.
       • Style override in modal: .rpt-shell padding/max-width
         resized so it fills the modal without the page's
         centred-1240px gutter.

     Why DOM-move beats cloning here:
       – All rpt-* IDs stay unique (no duplicate-ID bugs).
       – RPT.pickFile / RPT.setDate / RPT.preCheck /
         RPT.executeExport / RPT.clearLog read by ID and
         work without any wiring changes.
       – The log card (#rpt-log) moves with the topbar, so
         Check Data and Export Report output appears in the
         modal, not on the hidden Report page.
       – Pre-check modal (rptOpenPreCheck) is a sibling overlay,
         independent of the .rpt-shell parent, so it still
         renders correctly on top of everything.
       – No syncing of state needed between two UIs.

     Files touched: row-1 Reserved cell HTML (button + caption);
     new .sc-r1-reserved-rpt + .sc-r1-rpt-btn + .scale-report-modal
     CSS rules; new #scaleReportModal element above the
     ENGINEER paste modal; new window.openScaleReportModal /
     window.closeScaleReportModal globals next to the existing
     window.rpt* bindings; version constants. No Firebase /
     schema changes. RPT module body unchanged.

   v4.22.17 (p7.4-plan-loaded-stations-paste-note-filldown) — prior
     WMS/SAP refactoring updates · Piece D of 5.

     Feature 1 — PLAN card "LOADED" now includes trucks currently
     loading at stations whose plan row was not already counted.
       • _updateRow1 had two issues: (a) AUTO 'loading' status was
         already counted via TP.PLAN scan, but (b) manually-created
         station sessions, station qty edits that diverge from the
         plan row, or stations loading a truck not in today's plan
         were invisible to the LOADED figure.
       • Added a SECOND PASS over SCALE.getStations() after the
         TP.PLAN loop. Tracks counted _oid values in a Set during
         the first pass; in the second pass, for every station with
         status === 'loading', if its _oid isn't in the Set, add
         parseFloat(station.qty) to planDoneLoadMt.
       • Uses station.qty (the operator-typed in-progress volume)
         rather than the plan-row qty, because that's what's
         actually being drawn out at this moment.
       • When the truck finishes loading and a TL row is written,
         the AUTO status flips to 'done' on the next render, the
         plan loop picks it up under the existing 'done' branch,
         the _oid lands in countedOids, and the station pass skips
         it — no double-count window.
       • When the truck is reset (dbl-click), the station goes back
         to 'empty', the station pass naturally drops it. No extra
         cleanup needed.

     Feature 2 — Today Plan paste: merged note cells fill down on
     split. Was: the first row of a merged Excel note block carried
     the note text; rows 2+ landed with empty r[12] in the TSV and
     the parsed objects had note=''. Now: parsePlanSheet remembers
     lastNote, fills it down onto rows whose r[12] is empty, and
     resets it on customer change AND on sub-group reset (noInt===1
     and prevNo>1) so a note from one customer's block cannot leak
     into the next customer's block.
       • Pattern mirrors the existing lastCust / lastContractQty /
         lastType / lastQty / lastTol fill-down semantics already in
         the function — same shape, same reset point.
       • Diff/replace logic unchanged; the new note value flows
         through COMPARE_FIELDS naturally.

     Files touched: parsePlanSheet (added lastNote variable + reset
     points + final assignment); _updateRow1 (added countedOids Set
     + station-level second pass — already in place from earlier
     work, this entry documents it for the version-history audit
     trail); version constants. No Firebase / schema changes.

   v4.22.16 (p7.3-wms-sap-date-filter) — prior
     WMS/SAP refactoring updates · Piece C of 5.

     Feature — Date filter widgets added inside WMS ST and SAP analysis
     panel headers, alongside the existing toolbar filters.
       • Each analysis header now has: "📅 Filter date" button, the
         existing scope label, and an "✕" clear button (auto-shown when
         a filter is active).
       • Both new controls call the SAME existing functions —
         WS.openPicker / WS.clearDate for WMS ST, SP.openPicker /
         SP.clearDate for SAP. State is single-sourced through
         dateFilter, so toolbar input and header buttons always agree.
       • renderAnalysis() in WS and SP updated to toggle the new clear
         button's display when dateFilter changes.
       • New CSS: .ws-an-date-btn / .sp-an-date-btn (blue pill) and
         .ws-an-date-clr / .sp-an-date-clr (red pill, hidden by default).

     Bug fix — SAP date filter clear button (✕) became unclickable
     after first picker open. Same latent bug existed in WMS GI and
     WMS ST toolbars.
       • Root cause: .sp-datefilter input[type=date] is an invisible
         overlay (opacity:0 + width/height 100%) with z-index:1, and
         openPicker() sets inline pointer-events:auto without ever
         resetting it. After the first picker open, the invisible
         input swallowed clicks on the ✕ and 📅 buttons.
       • Fix: gave .sp-datefilter .clr / .pick (and the matching
         .ws-datefilter and .wg-datefilter buttons) z-index:2 so they
         always sit above the overlay regardless of pointer-events
         state. No JS changes — pure CSS layering fix.

     Files touched: 3 CSS blocks (.wg/.ws/.sp-datefilter); analysis
     panel HTML for WS + SP; renderAnalysis in WS + SP. No Firebase
     schema changes. No changes to openPicker / pickerChange /
     clearDate JS.

   v4.22.15 (p7.2-export-tach-tank-picker) — prior
     WMS/SAP refactoring updates · Piece B of 5.

     Feature — Tank picker added inside "📋 Export tách C3/C4" modal.
       • Two-button picker (TK-3501 / TK-3502) sits above the summary
         boxes (#invExportPick), styled with the same .inv-tank-pick
         class as the Tồn-đầu / %wt / Hầm / Xfer modals.
       • Default tank on open = the one shown in the XFER card (sel),
         matching prior behaviour.
       • Switching tank re-runs the per-truck breakdown against TL.ROWS
         for that tank's suffix (3501 / 3502) and re-fills summary +
         body + TSV clipboard, all without closing the modal.
       • openExport() refactored: body extracted into _renderExport(sloc).
         openExport sets _exportPick = sel, calls _renderExport, then
         opens the modal. pickExport(sloc) updates the picker chrome and
         re-runs _renderExport with the new sloc.
       • INV.pickExport exported from module return block.

     Files touched: invExportModal HTML (added picker block); INV
     openExport / new pickExport / extracted _renderExport; module
     return block. No Firebase / schema changes. copyExport unchanged.

   v4.22.14 (p7.1-xfer-static-wt-decouple) — prior
     WMS/SAP refactoring updates · Piece A of 5.

     Feature 1 — XFER card display becomes STATIC "Tồn đầu ngày".
       • INV.render() no longer shows c3Cur/c4Cur/lpg (auto-deducted).
         Card now shows c3Init / c4Init / (c3Init+c4Init) / effective %wt C3.
       • Labels updated: "C3 đầu / C4 đầu / LPG đầu / %wt C3".
       • Meta line below caption text "Tồn đầu ngày (static)" plus optional
         cavern + transfer extras (no GI deduction shown — those don't
         affect the displayed initial volume anymore).
       • Static = changes ONLY when operator manually re-confirms via
         📥 Tồn đầu ngày or 📐 %wt C3. Truck loads, station loadings, and
         WMS GI deductions do NOT move the displayed numbers.
       • Scale tank-cell chip (LPG) and PLAN card REMAINING are UNCHANGED
         — those still auto-deduct (operational "what's left now" view).
         INV.compute() return shape unchanged: c3Cur/c4Cur/lpg are still
         computed (consumed by SCALE._updateRow1 + renderRow1's chip).

     Feature 2 — Decoupled %wt C3 update path.
       • New button "📐 %wt C3" added to XFER card actions (purple variant
         .inv-x-btn.prim2) next to "📥 Tồn đầu ngày".
       • New modal #invWtModal with tank picker + single %wt input + Xác
         nhận button.
       • New functions INV.openWt / INV.pickWt / INV.saveWt.
       • saveWt() writes ONLY inv_daily/{date}/{sloc}/wt (override node).
         init.c3/init.c4 are NEVER touched. History row of type 'wt' is
         appended for audit. _ver bumps so other machines re-sync.
       • Init modal openInit/pickInit now prefill %wt with the EFFECTIVE
         current value (override → init.wtC3) instead of init.wtC3 only —
         so reopening shows the live wt, not a stale baseline.

     Architectural notes:
       • saveInit still wipes the wt override (a fresh init resets baseline,
         intended behaviour — was already in place).
       • compute() unchanged; the wt-override-vs-init.wtC3 precedence was
         already correct.
       • No Firebase schema changes; no breaking changes to other modules.

   v4.22.13 (p7.0-ktptvc-v406-fcheck-editor) — prior
     Feature 1 — KTPTVC port from V406 (form parity + inline print + engineer sort).
       • Print form replaced with the V406 Hyosung Vina Chemicals LPGT-PD-002
         layout (procedure header table, capacity cell, document checklist
         row, KIỂM TRA CHUNG block, signature row). 2 forms per A4 portrait
         page, separator line. Form body stays Vietnamese (legal/ISO doc).
       • ktPrint() routes through _pfPrintViaIframe — no window.open, no
         new tab. Old V4 generic 14-item checklist + sub-tab path removed.
       • Engineer column header is sortable. Click toggles time → asc →
         desc → time. Default sort on each LOAD is timeIn (first-trip
         engineer wins on dedup).
       • Capacity lookup uses DATA.rmooc first (it's the actual tank),
         truck plate fallback. Match by normalized plate (strip separators).
       • UI labels switched to English (SELECT ALL / CLEAR / PRINT KTPTVC).
       • Date picker onchange re-loads (V406 parity).
       • Tables auto-fit content: .kt-tbl and .kt-t use table-layout:auto;
         labels keep nowrap+min-width; value cells get word-break:break-word.
         Removed all hard-coded width:X% from value/label <td> elements —
         long driver/engineer/plate strings no longer cramp.

     Feature 2 — Expired-cert rows in #scCertList clickable; opens an in-place
                 Fleet editor (replaces the old read-only paste overlay).
       • Each issue row in EXPIRED CERTS gets a pointer cursor; click opens
         a fleet-issue editor (same visual feel as paste-time) with editable
         date inputs per expired cert, grouped by subject (Tank Lorry /
         Tractor / Rmooc / Driver).
       • Save validates each input through parseDate, normalizes via
         normalizeDate, writes deltas through SC.editBatch('fcheck-fix-expired')
         — never direct firebase.database().ref(). Unchanged inputs skipped.
       • Missing-in-Fleet items show read-only with a hint to add the row
         on the Fleet tab first.
       • runPasteCheck now opens the editable editor instead of the old
         read-only showOverlay (removed — no dead code). Paste-time issues
         are fixable in place.
       • .sc-warn-line.sc-warn-exp / .sc-warn-miss on Scale station cards
         clickable (delegated on #scCtrlGrid via SCALE.getStation). Click
         opens the editor for that station's current order, with
         stopPropagation so stEditOpen does not also fire.
       • New FCHECK export: openIssueEditor(orderArray).
       • New SCALE export: getStation(id) — used by the delegated handler.

   v4.22.12 (p6.9-wms-tl-match-scope) — prior
     Feature — WMS GI → TL Data match scope expanded per
     operator clarification. The matching exists because data
     saved from the SCALE station never includes the WMS GI
     portion (operator does that on the WMS system later), so
     this auto-match saves manual re-entry.

     Two TL row types qualify as candidates:
       (a) rows that already have an official DO (from a prior
           paste or manual entry), and
       (b) rows whose TMP-xxx was just promoted to a real DO
           by SYNC in the same paste session.
     Both are handled by a single scan now — no special case.

     Match conditions (all required):
       1. TL.doNo contains at least one real DO (6+ digits).
       2. TL.giDate is empty.
          giDate is the field that records "this row has been
          GI'd on WMS". Empty = not yet matched. Rows that
          already have a giDate are skipped to protect history.
       3. TL.date (export day) === picker wmsDate.
          The operator picks the date their WMS GI references
          (often yesterday — trucks export day N, WMS GI is
          done day N+1). This narrows the search window so a
          WMS DO can't accidentally match a TL row from a
          different export day. WMS DOs are globally unique
          but the date filter is a cheap belt-and-braces
          safeguard against operator paste mistakes.

     Search pool — every WG row where:
       • delivId is a real DO (6+ digits),
       • pickKg > 0, AND
       • _wmsDate === picker wmsDate.
     Includes rows from past pastes, not just this paste's
     adds / changes. So a TL row created today can still match
     a WMS row that was pasted yesterday, as long as both
     reference the same export day.

     Stamp on confirm — giDate ← TODAY (current system date),
     NOT the picker date. Reason: daily stock report aggregates
     by giDate and must align with the WMS system's actual GI
     timestamp, which is now (operator is doing the GI on WMS
     today). Pick / C3 / C4 / %wt sync logic unchanged from
     v4.22.9.

     Modal layout — table columns unchanged from v4.22.10:
       Match · DO · Khách/Biển số · GI Date · Net Wt · C3 · C4
       · %C3 · %C4. The Date column is intentionally NOT
       added: WMS GI already shows WMS Date per row, TL Data
       already shows the export Date per row, so repeating
       them in the confirm modal would be redundant. Subtitle
       updated to explain the match rules and the "GI date =
       today" stamping behaviour.

     Files touched: _autoFillTlGiDate rewritten (full-scope
     scan instead of paste-only); wgTlSyncModal subtitle
     updated; version constants. No changes to applyWmsSync /
     previewWmsSync (still single source of truth for the
     sync math). No Firebase / schema changes.

     Known limitation: trigger remains "on WMS paste only". A
     TL row added AFTER the matching WMS GI was already
     pasted will not auto-match until the next WMS GI paste
     for that date. Acceptable for now per operator workflow
     (WMS GI is typically pasted last each day).

   v4.22.11 (p6.8-wms-tl-sync-chain) — prior
     Bug fix — WMS→TL sync confirm modal opened with a stale
     candidate list. User reported: modal appeared, ticked all,
     clicked Apply, but nothing matched. The DO-promotion path
     (TMP → real DO) had already run separately, so the user
     could see promoted DOs in TL, yet the TL sync modal showed
     only a handful of rows that already had real DOs before
     the paste.

     Root cause — call ordering inside WG.confirmDiff:

       1. applyAndPush(WMS rows)           ← WMS data into RAM
       2. _autoFillTlGiDate(...)           ← gathers TL candidates
                                             by matching real DO
                                             against TL.doNo
                                             → opens wgTlSyncModal
       3. SYNC.reviewPromotions(...)       ← opens syncPromoteModal
                                             (stacked on top)
       4. User confirms promote modal      ← TL.renameDoNo runs,
                                             TMP-xxx → real DO on
                                             TL rows
       5. wgTlSyncModal revealed           ← but its candidate
                                             list is stale (from
                                             step 2, before step 4
                                             renamed the DOs)
       6. User clicks Apply                ← only the stale, pre-
                                             rename candidates get
                                             written. Freshly
                                             promoted rows never
                                             appeared and never
                                             synced.

     Fix — chained modal flow:

       (a) openPromoteModal(cands, onClose) now stashes an
           optional onClose callback. closePromoteModal fires it
           on both Apply and Cancel paths (so TL rows that
           already had real DOs still get a sync pass even when
           the operator cancels promotion).

       (b) SYNC.reviewPromotions(wmsRows, onClose) forwards the
           callback and returns true iff a modal was opened.
           When no promotion candidates exist (zero return), the
           caller runs its follow-up directly.

       (c) WG.confirmDiff inverted: promotion runs first; TL
           sync is wrapped in a runTlSync closure passed as the
           promote-modal onClose. If no promote modal opens, the
           closure fires immediately. Either way, TL.doNo is in
           its final state before _autoFillTlGiDate gathers
           candidates, so newly-promoted rows appear in the TL
           sync modal exactly like rows that already had real
           DOs. No more stale candidate list.

     Files touched: openPromoteModal / closePromoteModal (added
     onClose stash + fire); SYNC.reviewPromotions (forward
     callback + return bool); WG.confirmDiff (promotion-first
     ordering with runTlSync closure); version constants. No
     Firebase / schema changes. previewWmsSync / applyWmsSync /
     wgTlSyncModal HTML and handlers unchanged from v4.22.10.

   v4.22.10 (p6.7-wms-tl-sync-confirm) — prior
     UX — WMS GI → TL Data sync now opens a confirmation modal
     mirroring the existing TMP→Real DO promotion modal pattern.
     User reported v4.22.9 wrote silently without any visible
     notification, so matched rows could be overwritten without
     review. Operator wanted (a) a confirm step, (b) per-row
     checkboxes defaulting to all-checked, (c) full before-and-
     after value display for every tracked field.

     New modal #wgTlSyncModal — columns:
       Match (☑) · DO No. · Khách / Biển số ·
       GI Date (before / after) · Net Wt (before / after) ·
       C3 kg (before / after) · C4 kg (before / after) ·
       %C3 (before / after) · %C4 (before / after)
     Each cell renders the old value struck through with the
     new value highlighted green; unchanged cells render the
     value once with no diff styling and an .wg-tl-cell-changed
     light-green background marks any cell that will change.
     Toolbar buttons "Chọn tất cả" / "Bỏ chọn tất cả" toggle
     every row at once. Footer: Cancel / Apply selected.

     New TL.previewWmsSync(rid, opts) — uses the exact same
     math as applyWmsSync (pure-grade rules, denominator
     fallback chain) but returns { before, after, hasChanges }
     instead of writing. Single source of truth: any future
     change to sync rules only touches one place.

     _autoFillTlGiDate refactor — instead of looping
     applyWmsSync, it collects candidates with previews and
     opens the modal. Rows whose preview shows no changes are
     filtered out, so the modal only surfaces real diffs. If
     nothing differs after a paste, the modal stays closed and
     no toast fires (silent no-op, matches idempotency).

     applyTlSyncSelected → calls TL.applyWmsSync on each ticked
     row, then toast: "🔄 Đã đồng bộ N dòng TL (GI Date · Net
     Wt · C3 · C4 · %wt)".

     Files touched: modal HTML inserted before syncPromoteModal;
     CSS for .wg-tl-diff / .wg-tl-cell-changed added next to
     existing .sync-pm-* rules; openTlSyncModal +
     closeTlSyncModal + tlSyncToggleAll + applyTlSyncSelected
     added next to openPromoteModal; _autoFillTlGiDate
     rewritten; TL.previewWmsSync inserted above applyWmsSync;
     version constants. No Firebase / schema changes.

   v4.22.9 (p6.6-wms-tl-sync-finalize) — prior
     Bug fix — WMS GI → TL Data auto-sync now actually completes the
     full field set. Three issues reported by user:
       1. Pick (Net Wt) never reached TL.lpgQty.
       2. %C3 / %C4 used wrong denominator.
       3. The picker date never landed on TL.giDate when truck
          loading day differed from WMS issue day.

     Root cause traced through three layers:

     (a) TL.applyWmsSync (line ~9760) accepted only c3Kg / c4Kg /
         isoDate. pickKg had no entry path, so Net Wt could not
         be synced even if the caller had the value.
     (b) %C3 formula was c3Kg / (c3Kg + c4Kg) × 100. Per user
         spec it must be c3Kg / pickKg × 100. These diverge when
         WMS reports pick separately from propane + butane (real
         data sometimes shows a small gap).
     (c) _autoFillTlGiDate (line ~8290) enforced a strict same-day
         gate: `TL.date === wmsDate` (loading day equals WMS
         issue day). When paperwork lagged by one day — common —
         the loop hit `continue` and silently skipped the row.
         Nothing reached applyWmsSync at all, so GI Date / C3 /
         C4 / %wt all appeared "broken". The DO-promotion path
         (a separate code path through the SYNC modal) was
         unaffected, which matched the user's observation that
         the official DO was being updated correctly.

     Fixes applied (RAM + per-field Firebase delta, no schema change):

       1. TL.applyWmsSync extended:
            • New opts.pickKg → writes to r.lpgQty (Net Wt) when
              > 0 and different.
            • %C3 denominator switched to pickKg per spec.
              Fallback chain: opts.pickKg → existing r.lpgQty →
              (c3Kg + c4Kg). %C4 = 100 − %C3.
            • Pure-grade rules preserved (pure C3 → 100/0,
              pure C4 → 0/100). NaN guard preserved.
            • Idempotency preserved — fields already matching are
              skipped from the payload, so re-pasting the same WMS
              data is a no-op.

       2. _autoFillTlGiDate:
            • Same-day gate removed. Per user clarification
              recorded in v4.21.x changelog ("WG→TL matching by
              real DO only — no date comparison, since each WMS
              DO is globally unique"), match is now purely on
              real DO.
            • pickKg now passed to applyWmsSync alongside c3/c4.
            • Toast updated: "Auto-synced WMS GI → N TL row(s)
              (GI Date · Net Wt · C3 · C4 · %wt)".

     Files touched: TL module applyWmsSync block (line ~9760);
     WG module _autoFillTlGiDate block (line ~8290); version
     constants. No Firebase rule / schema changes. No localStorage
     cache invalidation needed — RAM rebuild on next paste picks
     up the new logic immediately.

   v4.22.8 (p6.5-plan-card-merge) — prior
     Scale row-1 PLAN + REMAINING cards reorganized into a single
     PLAN card that surfaces today's full progress at a glance.

     (1) Three plan figures instead of one.
       Was: PLAN card showed a single number — the remaining MT
       still to sell today. Operators wanted to see the full
       progress in one place (total committed, what's been done
       or is currently loading, and what's left). They also
       complained the old "remaining" figure was wrong because
       it relied on r._status === 'done', which is empty for
       AUTO-mode rows (status is derived from TL Data presence
       in RAM, not written to Firebase).
       Now: PLAN card row 1 shows three MT figures —
         • PLAN total      = sum of qty across ALL today's plan
                             rows (TP.PLAN where _forDate=today).
         • DONE + LOAD     = sum of qty for rows whose
                             EFFECTIVE status is 'done' OR
                             'loading'. Uses TP.getEffectiveStatus
                             so AUTO-mode done rows (TL Data
                             arrived; station already cleared)
                             are counted correctly, fixing the
                             old _status-only check.
         • REMAIN          = PLAN total − (DONE + LOAD).
       All three derived in RAM in a single pass over TP.PLAN.

     (2) REMAINING (inventory) is now cross-tank.
       Was: row 2 showed the SELECTED tank's stock only
       (TK-3501 or TK-3502 depending on the scale-tab tank
       toggle). Operators saw only half the station's stock.
       Now: PLAN card row 2 sums INV.compute('2100') +
       INV.compute('2101') and renders LPG · C3 · C4 totals
       across both tanks. INV.renderRow1 keeps updating the
       small chip near the tank selector (that one still
       follows the selected tank, on purpose) but no longer
       writes to the row-1 REMAIN cell — dead code removed.

     (3) Old REMAINING card slot is now a blank placeholder.
       Per operator: reserved for an export-report function
       that will be moved here later. The cell stays in DOM
       (preserving the row1 grid) with no content for now.

   v4.22.7 (p6.4-station-card-polish) — previous
     Three operator-requested polish fixes for SCALE station cards:

     (1) Done / Cancel orders no longer assignable to stations.
       Was: scShowResults filtered only by "_oid already on a
       station" / "real DO already on a station". Orders whose
       plan-side status had become 'done' (TL Data present) or
       'cancel' (manual override) were still listed normally and a
       click would re-assign them, producing duplicate scale runs
       or zombie loadings.
       Now: TP exposes getEffectiveStatus(row) on its public API
       (reads RAM — TL.ROWS + DB_SC.stations — no Firebase round-
       trips, AUTO/MANUAL modes both honored). scShowResults
       computes the effective status for each match and renders
       done/cancel rows in a COMPRESSED single-line form with a
       badge ("✅ DONE" / "🚫 CANCEL"), grayed out and
       cursor:not-allowed. Clicking such a row no longer assigns —
       it shows a toast explaining why. scAssignToStation also
       re-checks status as a defense in depth: if a race
       (TL Data arrives between search and click) flipped the
       order to done/cancel, the assign aborts cleanly.

     (2) Station card body — DO + Qty moved to the right edge.
       Was: tank/lot, DO, qty were laid out with flex-wrap+gap on
       the second body line. With long customer names + lot
       formats the DO and qty cluttered the middle of the card.
       Now: tank/lot anchored on the LEFT, a flex group of
       (DO, qty) pushed to the RIGHT via margin-left:auto.
       Matches the operator's reference mockup: "TK-3501/5" left,
       "KNH26060402  25 MT" right. Purely a layout change —
       no data shape, no Firebase write.

     (3) Double-click behavior split into two distinct zones.
       Was: the entire .sc-card responded to double-click to reset
       the station to empty. This made misclicks easy (e.g.
       double-clicking near the warn row or driver name) and
       offered no way to swap the tank on a single station
       without resetting and re-assigning.
       Now: card-level dblclick handler removed. Two targeted
       handlers instead:
         • dblclick on .sc-status-pill (the "ĐANG NẠP" pill area)
           → stationReset(i) — same destructive flow as before,
           tightly scoped to the status indicator. Cursor:pointer
           + title "Nhấp đúp để reset" on the pill.
         • dblclick on .sc-v.tk (the "TK-3501/5" span) →
           swapStationTank(i): swaps THIS station's tank only
           (3501↔3502) using the other tank's lot from SC_TK_CFG.
           Global tank selector is NOT touched — bandwidth stays
           at one station write. Tech weights preserved
           (operator may have already weighed in). If the target
           tank has no lot configured, toast + abort (no write).
           Cursor:pointer + title on the tank span.
       Audit logged via 'scale:swap_tank:{stId}'. The interactive
       children (buttons, inputs, warn row) remain dblclick-inert.
       Drag-drop station swap unaffected — it lives on the card
       container, dblclick lives on inner spans.

   v4.22.6 (p6.3-cust-vn-lot-wt-fmt) — previous
     Four operator-requested polish fixes for PTT/DN print + TL Data
     readability + Scale weighing input UX:

     (1) PTT / DN Customer field — print Vietnamese full name.
       Was: CT.lookup() returned the short code ("Gas South") which
       printed on the customer line of PTT and DN.
       Now: new CT.vnName() resolves any alias → cust.vn (Vietnamese
       full name, e.g. "CÔNG TY CỔ PHẦN KINH DOANH KHÍ MIỀN NAM"),
       cascading vn → wms → short → original so the field is never
       empty even when the VN column hasn't been populated yet.
       Switched four call sites: pttPrint (PTT overlay),
       _scWaitPttPrint (queue PTT), pfFillDNFromTL (DN reprint),
       pfFillFromStation (live DN/PTT static fill). _buildTLPayload
       still uses CT.lookup → short code is what TL Data stores.

     (2) DN Lot No. — duplicated "LPG-YYYY-" prefix fixed.
       Was: DN printed "LPG-2026-LPG-2026-7/TK-3502". Root cause was
       tkGetActive() re-prepending "LPG-{yr}-" onto cfg.lot, even
       though _onLotChange / _latestLotForTank already store the
       canonical full string ("LPG-2026-7") into SC_TK_CFG[key].lot.
       Now: tkGetActive returns cfg.lot directly via the new
       _sanitizeLotPrefix() helper. The helper collapses any chain
       of "LPG-YYYY-" prefixes down to the last one, so legacy
       station.batch values already poisoned in Firebase clean up
       at read time on PTT/DN print without a manual migration.
       Applied defensively at pttPrint (s.batch composition) and
       _dnShowOverlay (cur.batch composition).

     (3) TL Data — tank-color row tint now full-row.
       Was (v4.22.5): 4-px left stripe + tinted gradient that faded
       to white after the first ~80 px — operator feedback: invisible
       on the bulk of the row, eye had to dart left to read the tank.
       Now: 5-px left stripe (stronger anchor) + full-row solid tint
       at ~10–15% alpha so a TK-3501 row reads blue all the way across
       and a TK-3502 row reads orange. Zebra-striping preserved
       (.tabulator-row-even gets a slightly stronger tint). The
       missing-GI amber hatch overlay stays layered on top so both
       signals coexist.

     (4) Scale TW / GW inputs — live thousands-separator formatting.
       Was: typing "10000" stayed "10000" — easy to misread as 1000
       or 100000 during a busy shift.
       Now: live commas as the operator types ("10,000"). Caret is
       restored by counting digits-before-caret (not character index)
       so editing inside the number doesn't snap the caret to the end.
       Read paths updated: scCalcNet and _techRead both strip commas
       via _stripCommas before parseFloat, so Net Wt math and the
       saved tech payload still see raw numbers. openTech pre-fill
       also formats stored values for display. The fmt:true flag on
       _TECH_FIELDS gates which fields get the treatment — only
       truckWt and grossWt; small fields (pressure, FQ) stay plain.

   v4.22.5 (p6.2-tl-tank-colors-tp-polish) — previous
     UX polish — three coordinated improvements requested together:

     (1) TL Data — row coloring by source tank.
       Rows where d.ltank includes "3501" get an inset 4-px LEFT border
       in --tk1 (blue, #1565c0); "3502" rows get --tk2 (orange, #e8740c).
       Same palette as the LPG Scale tank tabs — instant visual link.
       A faint horizontal gradient fades the tint out after the first
       ~80px so the bulk of the row stays clean and readable.
       Classes already emitted by TL.rowFormatter; v4.22.5 adds the CSS.

     (2) TL Data — missing-GI distinction.
       TL.rowFormatter now also stamps `.tl-no-gi` on any row whose
       giDate is empty/missing. CSS gives those rows a soft amber
       diagonal hatch (repeating-linear-gradient 135°, ~10% opacity)
       layered on top of the tank gradient — orthogonal indicators,
       both visible simultaneously.

     (3) Modernized blink animations site-wide.
       Replaced the harsh `steps(1,end)` strobe in three keyframes:
         • fcBlink         (Today Plan plate-missing, cert-blink)
         • wgPlateBlink    (PLAN ↔ WMS GI diff plate cell)
         • fcRowBlink      (.sc-res-armed two-click arm state)
       All three now use 1.4–1.6s ease-in-out sine pulses with
       text-shadow / box-shadow halos and opacity dips instead of
       hard color flips. Same warning intent, far easier on the eyes
       during long shifts.

     (4) Today Plan / Tomorrow Plan visual polish.
       Scoped to #sub-pln and #sub-tmr (no leakage to other tables):
         • System font stack + Oswald uppercase headers w/ letter-spacing.
         • Tabular-nums for vertical column alignment.
         • Tighter cell padding (7×9px) + 1.35 line-height.
         • Row hover: light blue (#eaf2fb) + inset 3px blue stripe +
           .18s ease transition instead of a solid background swap.
         • Header gets a gentle vertical gradient for depth.

     Files touched: blink keyframes block (around line 925), TL
     rowFormatter (line ~8959), version constants (line 3900).
     No Firebase / no localStorage / no architectural changes —
     pure presentation layer.

   v4.22.4 (p6.1-plan-stock-realtime)
     Feature — Scale row-1 cards (PLAN + REMAINING) now show real-time
     decrement / re-credit based on operational state. Pure RAM math
     over data already in Firebase — no new persistence.
     PLAN card:
       OLD: row count of TP.PLAN (e.g. "8").
       NEW: total MT REMAINING to sell today (e.g. "190.0").
       Algorithm — iterate TP.PLAN where _forDate == today, sum row.qty
       EXCEPT when:
         • r._status === 'done'   (already sold)
         • r._oid is on a station (in-progress, qty already drawn out)
       So: assigning a vehicle to a station decrements PLAN; cancelling
       (dbl-click reset → vehicle returns to queue) re-credits it;
       finishing the loading (status → done) keeps it decremented.
     REMAINING (per tank — TK-3501 / TK-3502):
       Existing inputs preserved:
         c3Cur = c3Init + cavernIn + xferIn − xferOut − giFromTL(today)
         c4Cur = (same shape)
       NEW tentative deduction (v4.22.4):
         − sum(stationLoadingQty in kg) split into c3/c4 via tank's %wt
       Per-tank guard: only stations whose `tank` field equals this sloc's
       name (TK-3501 ↔ 2100, TK-3502 ↔ 2101) are deducted.
       Lifecycle:
         • Assign → tentative deduction appears immediately.
         • Cancel (reset station to empty) → tentative deduction
           evaporates automatically (station no longer non-empty).
         • DONE (TL Data row written) → giFromTL picks up the actual
           net weight; the station drops out on next render, so the
           tentative is replaced by the real net seamlessly.
     Triggers (RAM recompute):
       • SCALE.scRenderCtrl       — already called on every station
                                    change → calls _updateRow1.
       • TP.refreshStatus         — now also calls SCALE.refreshRow1
                                    (NEW), so any TP status flip
                                    (done / cancel / new oid) updates
                                    the PLAN card in the same tick.
       • TL.rebuildTableData      — now also calls INV.renderRow1 +
                                    SCALE.refreshRow1 (NEW), so a fresh
                                    TL row appearing decrements REMAINING
                                    by the actual net weight in real time.
     No Firebase writes added. No schema changes. compute() return shape
     gains one optional sub-object `stn:{c3,c4}` for the new deduction
     (existing readers ignore it).

   v4.22.3 (p6.0d-wms-sync-c3c4) — prior
     Feature — WMS GI → TL Data sync now propagates C3 + C4 + %wt at the
     same time as GI Date, not just the date alone. Whenever WMS GI is
     pasted with pickKg > 0 on a real DO, the matched TL row (real DO +
     same-day match) gets ONE atomic patch covering:
       • giDate     ← _wmsDate (picker, DD/MM/YY)
       • c3Kg       ← WMS propane (C3 weight)
       • c4Kg       ← WMS butane  (C4 weight)
       • c3Pct      ← derived from c3Kg / (c3Kg + c4Kg) × 100
       • c4Pct      ← 100 - c3Pct
     Pure-grade handling (per spec):
       • Pure C3 (butane = 0)  → c3Pct = 100, c4Pct = 0
       • Pure C4 (propane = 0) → c3Pct = 0,   c4Pct = 100
     %wt fields are only written when at least one of c3Kg / c4Kg is
     supplied AND the sum is > 0 — so a 0/0 paste can't write NaN.
     Replaces v4.22.0's narrow `setGiDateFromIso` with `applyWmsSync(rid,
     {isoDate, c3Kg, c4Kg})` — single atomic Firebase update per matched
     row instead of one path per field. Idempotent: any field already
     matching the patch is skipped. The previous method had only one
     caller (_autoFillTlGiDate) so removing it leaves no dead code.
     Toast updated: "🔄 Auto-synced WMS GI → N TL row(s) (GI Date · C3 ·
     C4 · %wt)".

   v4.22.2 (p6.0c-paste-merge-3pass) — prior
     Bug fix — sales re-pasting Today Plan blew away real DOs and re-added
     vehicles as fresh TMP rows. Two failure modes in one screenshot:
       • THAI LYHUOT row: old plan had real DO 86640335 (promoted via WMS
         GI), new sales paste still showed "After loading" (sales sheet
         hadn't caught up). Old computeDiff overwrote doNum with "After
         loading", demoting the row.
       • 3 KNHC export rows marked REMOVED and 4 marked ADDED (3 of them
         the same vehicles): sales inserted a new customer in the middle,
         which shifted `no` (Excel row number) on every later row. The
         old position-fingerprint match used `no`, so every shifted row
         broke its match.
     Fix — 3-pass matching in computeDiff:
       PASS 1: real DO equality (strongest identity).
       PASS 2: customer + driver + plate (positionless) — survives middle-
               insert shifts.
       PASS 3: legacy position fingerprint (fallback for planning rows
               with no clear identity).
     Each pass marks both sides as consumed so the next pass can't
     double-match.
     New "REAL → After loading demotion guard" on matched pairs: when the
     OLD row carries a real DO but the NEW paste regressed to "after
     loading" or blank, KEEP the real DO + _oid. Sales sheet just hasn't
     been updated to reflect the WMS GI promotion that already happened —
     losing the real DO would force a re-promotion next paste.
     Existing migrations preserved:
       (a) TMP → real DO when new paste brings a real DO.
       (c) Temp _oid carryover to doNum when no real DO came in.
     Removal detection unchanged — old rows still get marked REMOVED only
     when no pass matched them.
     No Firebase schema change. No new modules. The fix is contained to
     one function (computeDiff) — every existing caller in TP and TMR is
     unaffected.

   v4.22.1 (p6.0b-match-fixes) — prior
     Bug fix — TMP → real DO promotion never fired even when WMS GI clearly
     matched a temp Today Plan row. Three root causes in findTempOrderStrict:
       1. Plate equality was string-strict. WMS combines truck + rmooc in
          the `vehicle` field ("70E-00375 70R-02272"); plan plate is just
          "70E-00375". normPlate stripped dashes but kept whitespace, so
          "70E0037570R02272" never equalled "70E00375".
          → New _plateMatchAny splits the WMS vehicle by whitespace and
            checks if ANY token (normalized) equals the plan plate. Mirrors
            V406 wPlateParts.some() pattern.
       2. Driver normalize was whitespace-collapse + lowercase only —
          "hoàngtrầnngọc" never equalled "trầnngọchoàng" even though
          they're the same person with the words re-ordered.
          → New _driverMatch normalizes with NFD diacritic removal +
            VN đ/Đ handling, then tries exact / sorted-word-set / subset
            in that order. Mirrors V406 _matchDriverName + _normVNName.
       3. Customer match (custMatch) was substring-based on alphanumerics
          only — "THAILYHUOT" was a substring of both sides but the full
          plan label "THAILYHUOTEXPORT" wasn't continuous inside the legal
          WMS name "THAILYHUOTIMPORTEXPORTCOLTD".
          → New _custMatchViaCt first resolves plan.customer through
            CT.wmsName (returns the canonical WMS legal name for any
            alias) and then compares the mapped name against the WMS row.
            Falls back to a VN-aware word-set match and finally the legacy
            substring rule so existing CUST records still work.
     The fix protects the use case user called out: one driver + one truck
     legitimately doing two trips for two customers in the same day. Plate
     and driver alone aren't enough — the CT-mapped customer name is the
     disambiguator.
     No schema change, no Firebase write change. The new helpers live
     inside TP module next to findTempOrderStrict (which is the only
     consumer). findTempOrderByVehicle (looser, used by other paths) is
     left untouched.

   v4.22.0 (p6.0-wms-date-picker) — prior
     NEW — WMS GI gains an explicit "PASTE FOR DATE" picker that stamps a
     new `_wmsDate` field (ISO YYYY-MM-DD) on every pasted row. This date
     is the source of truth for all WMS GI sync matching going forward —
     the unreliable arrival-date matching inherited from V406 is gone.
     Default = today.
     Confirmed with user before coding:
       1. Match against TL Data `date` (truck loading date), NOT giDate.
          When pickKg > 0, auto-fill TL Data `giDate` = `_wmsDate` for the
          matched DO + same-day TL row.
       2. Legacy WMS rows (no `_wmsDate`) are silently skipped from auto-
          match. User accepted this — current data is test data, will be
          wiped.
       3. Re-paste of same DO with a different date:
            • If old.pick = 0  → silently take the new date (planning data
              gets superseded by actual paste).
            • If new.pick = 0  → also silently take new date (still
              preliminary, not a value-laden conflict).
            • If BOTH pick > 0 AND dates differ → diff modal now shows a
              "DATE CONFLICT" warning section listing each affected row;
              operator must click "Apply Changes" to overwrite or Cancel
              to keep old dates.
       4. Arrival column kept (it's the WMS sheet column being pasted) —
          new WMS Date column added immediately after it for display.
     Wiring (all inside V4 IIFE style, no V406 code copied verbatim):
       HTML       — `<input type="date" id="wgPasteDate">` + Today button
                    inserted in `#wgPasteModal` body.
       WG module  — openPaste() defaults the picker to today on open;
                    new pasteDateToday() helper exposed; submitPaste()
                    requires the picker value (rejects empty) and stamps
                    every parsed row's `_wmsDate`; FIELDS array adds
                    `_wmsDate` so the field is diffed + persisted; new
                    "WMS Date" column rendered DD/MM/YY (italic red dash
                    when missing); showDiff() takes a third arg
                    `dateConflicts` and renders the warning section;
                    confirmDiff() calls _autoFillTlGiDate() after the
                    applyAndPush.
       TL module  — new public method setGiDateFromIso(rid, isoDate):
                    converts ISO → DD/MM/YY, writes via the same per-
                    field Firebase delta path as setGiNow(), idempotent
                    (skips when giDate already matches).
       SYNC       — collectCandidates() now requires `_wmsDate` on every
                    WMS row AND requires plan's `_forDate` === `_wmsDate`
                    before offering the TMP→real DO promotion. WMS rows
                    without a picker date are excluded.
     RAM-first preserved: matching loops walk RAM. Firebase writes only
     for the per-field `_wmsDate` (one path per row, debounced into the
     existing paste batch) and the auto-filled `giDate` (one path per
     matched TL row). Spark budget unaffected.

   v4.21.3 (p5.5d-queue-autoclean) — prior
     Bug fix — vehicle could appear BOTH on a station AND in the queue.
     Repro: add a DO to the queue, then walk over to the station's own
     search input and assign the same DO directly. Before this fix, the
     queue still showed the item because the queue-cleanup logic only
     ran when the operator clicked 📍 (queue's own assign path).
     Fix — centralized cleanup helper _scWaitCleanupByRow(oid, doNum)
     now runs INSIDE scAssignToStation right after the setSt() write.
     That covers ALL assign entry points uniformly:
       • per-station search input  → assignFromSearch → scAssignToStation
       • queue 📍 click            → waitClickAssign  → scAssignToStation
       • queue popup "Assign now"  → waitPopAssign    → scAssignToStation
     Match priority: _oid first (canonical), then real 7+ digit DO.
     Plate alone is intentionally NOT a match key — same truck can
     re-appear with a different DO on a later trip, and we don't want
     to wipe its later queue entry.
     Bonus side-effect — removed the pre-splice in waitClickAssign that
     was vulnerable to a "lost item on failed assign" race (if validation
     bailed early because no tank was selected, the queue item was gone
     but never reached a station). Now the splice happens AFTER setSt
     succeeds — failed assigns leave the queue intact for retry.
     No Firebase schema change. No JS API change. RAM-only filter +
     existing debounced save path.

   v4.21.2 (p5.5c-row4-tuned) — prior
     Pure CSS bump. Row-4 cell height: clamp(260,32vh,340) → clamp(220,25vh,275).
     v4.21.1 went too tall — XFER · TỒN KHO fit fine but the other 3 cells
     (EXPIRED CERTS, CERT CHECK, QUEUE) looked half-empty with 1-2 items.
     New value is the middle ground between v4.20.1's 180-240 (too short for
     XFER's bottom button rows) and v4.21.1's 260-340 (excessive). XFER's
     last action row may need a 1-2 line internal scroll on the smallest
     screens but stays fully reachable. No JS / Firebase changes.

   v4.21.1 (p5.5b-queue-row4-taller) — prior

   v4.21.0 (p5.5-queue-wait-list) — prior
     NEW — QUEUE (SC_WAIT) sidebar in the Scale row-4 grid. Port of V406
     wait-list, written in V4 IIFE style (no code copied verbatim).
     Use case: all 4 stations busy → operator adds the next vehicle to
     a queue with a target station; PTT prints with the wait-list turn
     so the driver knows their slot.
     Confirmed decisions (asked user before coding):
       1. Firebase persist: path `sc_wait_queue` with .on('value')
          multi-machine sync + 300ms debounced save. Equal-JSON guard
          on every write to spare Spark quota.
       2. Auto-promote when a station empties: OFF — operator must
          click 📍 on the queue item to assign.
       3. Day-rollover: silent clear (listener detects forDate mismatch
          → SC_WAIT=[] + push empty snapshot for today).
       4. "Back to queue": dbl-click reset on a loading station now
          re-queues the vehicle with _targetSt = that station (with a
          clean note pulled from TP.PLAN if available) instead of
          destroying it.
     UI:
       Row 4 cell #scQueue now holds a search input + scrollable list +
       counter badge. Search dropdown is position:fixed (body-attached,
       reuses the scShowResults positioning pattern) so it escapes the
       row-4 overflow:hidden clip without breaking the v4.20.1 layout.
       Station picker modal (#scWaitPopBg) opens after the operator
       picks a result; one button per station 1-4 with current state
       ("Assign now" if empty, "Add to queue" if loading).
     New JS (inside SCALE IIFE):
       State          — SC_WAIT, _scWaitSaveTimer, _scWaitLastJson,
                        _scWaitSuppressSave.
       Persist        — _scWaitSnapshot, _scWaitScheduleSave,
                        scWaitClear, _scWaitInit (listener).
       Search & pick  — waitSearch, waitHideRes, waitPick,
                        _scWaitPopOpen, waitPopClose, waitPopAssign,
                        waitPopQueue, _scWaitValidate (shared block-list).
       List & assign  — _scRenderWait, waitClickAssign, waitDel,
                        _scWaitPttPrint.
       Back-to-queue  — _scWaitBackFromStation (called by stationReset).
     Wiring:
       SCALE.init     → calls _scWaitInit() + initial _scRenderWait().
       stationReset   → calls _scWaitBackFromStation BEFORE clearing.
       click-outside  → extended to close #scWaitRes dropdown.
       scroll/resize  → reposition #scWaitRes alongside per-station drops.
       tmrConfirmPromote → calls SCALE.waitClear() after the bulk update
                          (queue's _oid refs become stale).
     Audit log areas added (logAudit is no-op today, kept for parity):
       scale:queue:save  scale:queue:clear  scale:queue:add
       scale:queue:assign  scale:queue:remove  scale:queue:back
     Read-only on plans — module never writes back to TP.PLAN / TMR.PLAN.
     RAM-first, Firebase-last: list render and validation are pure RAM
     reads; only the snapshot push to `sc_wait_queue` hits Firebase.

   v4.20.1 (p5.4b-row4-fixed-height) — prior
     UI FIX: Row 4 of Scale (EXPIRED CERTS / CERT CHECK / QUEUE /
     XFER) now has a clamped fixed height so content overflow stays
     INSIDE the cell instead of pushing the row taller and breaking
     Row 5 / shortcut bar below.
       .sc-r4-cell  height:clamp(180px, 22vh, 240px) + position:relative
       .sc-r4-hdr   flex:0 0 auto (header never shrinks)
       .sc-r4-body  flex:1 1 0 + min-height:0 (CRITICAL for flex
                    overflow to actually scroll instead of expand).
     This is preparation for the upcoming QUEUE feature (port from
     V406 SC_WAIT) so search dropdowns / wait lists float internally
     without breaking layout. EXPIRED CERTS overflow that was visible
     in v4.20.0 is also fixed by the same change.
     No JS / Firebase changes.

   v4.20.0 (p5.4-wgcheck-plan-wms-diff) — prior
     ADDED — WMS GI ↔ Today/Tomorrow Plan cross-check (RAM-only).
     New module WGCHECK (placed right after FCHECK). Mirrors V406
     diffCheckPlan() semantics but written in V4 IIFE style, no
     code copied verbatim. Five warning codes (per V406):
       NO_DO          — plan has plate but no DO and note is not
                        "after loading".
       DO_NOT_IN_WMS  — extracted DO number not found in WG.ROWS.
       PLATE_DIFF     — a plan plate (plate or rmooc) is missing
                        from the matched WMS row's vehicle field.
       CUST_DIFF      — customer name mismatch after CT.wmsName
                        normalization (lenient 8-char substring).
       QTY_DIFF       — |planQty − wmsQty| / max > 5%.
     Results live on r._wgWarns (RAM only — never persisted, in
     line with the project's "computed values stay in RAM" rule).
     New CSS (added next to fcBlink, line ~925):
       .tp-plate-wg-diff   — orange/red blinking plate cell when
                             PLATE_DIFF is present (priority over
                             the plain fc-plate-missing rule).
       .wg-badge family    — inline pills appended to the DO cell
                             for every code (de-duped per row).
       .tr-wg-warn(.-plate)— row-level background tint for any
                             warning; stronger tint when PLATE_DIFF.
       .tp-cert-blink, .tp-cert-badge — driver / rmooc cell blink
                             + badges (parity with V406 _planCertCell).
     Formatter changes:
       plateFormatter   — 3-layer cascade: PLATE_DIFF > Fleet-
                          missing > Fleet-cert-expired, OK.
       driverFormatter  — NEW. Wires FCHECK.cellWarn(row,'driver')
                          → blink + ❌/🔴/⚠ badges.
       rmoocFormatter   — NEW. Same pattern for rmooc cell.
       doFormatter      — appends WGCHECK.badgeHtml(row) inline.
       rowFmt           — adds tr-wg-warn / tr-wg-warn-plate.
     FCHECK now exports cellWarn(row, field) for the new per-field
       formatters above. Subject-filtered so a plate-cert problem
       does not blink the driver cell.
     Wired trigger points (all RAM-only):
       1. TP.confirmDiff (and TMR via the factory) — after paste
          apply, WGCHECK.runCheck(PLAN,{toast:true}) + rebuild.
       2. TP cellEdited — recheck the edited row when the field
          is one of plate/rmooc/driver/qty/doNum/customer/note/
          _status; reformat just that Tabulator row.
       3. WG.confirmDiff — after WMS paste apply, WGCHECK
          .recheckAllPlans({toast:false}) (silent refresh).
       4. WG cellEdited (delivId/customer/vehicle/orderMt) —
          debounced recheckAllPlans, RAM-only.
     scAssignToStation — soft Plan↔WMS warnings (WGCHECK
       .assignWarnings) are now PREPENDED to the station note
       on assign, so the booth operator sees them. Operator is
       NOT blocked — parity with V406 checkBoothNote behavior.
       Triggers an extra toast when a warning is generated.
     NOT changed:
       - Firebase paths / writes / version nodes — pure RAM logic.
       - Existing FCHECK behaviors (still drives the live panel
         + paste fleet-check overlay + station card warn row).
       - Cross-module sync between TL Data / Station / Plan (still
         deferred to the dedicated integration session).

   v4.19.9 (p5.3-do-date-suffix-cross-date-dup) — prior
     CRITICAL DATA-LOSS FIX: cross-date DO collision.
     Before: a real DO became its own _oid (Firebase key) directly,
       so the same real DO pasted for different _forDate values
       overwrote each other in plan_today_/plan_tomorrow_ — losing
       the earlier day's row silently.
     Now: real DO _oid is suffixed with the sale date as -YYMMDD
       (e.g. 86633934-260603). The DO column itself keeps the plain
       real DO unchanged; only the Firebase node key carries the
       date suffix, so cross-date rows live in distinct keys.
     Changes:
       1. resolveOid()       — real DO branch appends '-YYMMDD'.
       2. computeDiff() TMP→Real migration — when a temp _oid is
          promoted by a re-paste bringing a real DO, the new _oid
          now uses real-DO + '-YYMMDD' (not just the bare DO).
       3. _detectCrossDateDuplicates() — new helper. Scans the
          paste's added rows; if a real DO already exists on a
          different _forDate, the row is flagged. Reused by both
          computeDiff and computeReplaceWipe; result attached to
          diff.duplicates.
       4. showDiff() — renders an amber "Cross-date duplicate DO"
          section listing each conflict (DO + dates + plate +
          customer). User can confirm (both rows coexist thanks
          to the date suffix) or cancel to review.
     Backward compat: legacy rows whose _oid is still the bare real
       DO load unchanged; new pastes for those dates won't collide
       since they'll use the suffixed form.
     Phase 2 (deferred — WMS GI ↔ TL ↔ Plan sync chain):
       per user clarification, WG→TL matching by real DO only
       (no date comparison) since each WMS DO is globally unique.
       _oid carry into _buildTLPayload still pending.
   v4.19.8 (p5.2-toolbar-date-dropdown-from-actual-data) — prior
     Plan-date dropdown populated from PLAN rows, paste flow per
     _forDate, scoped diff, Clear All multi-date modal.
   v4.14.0 (p3.6-fleet-warn-ux) — prior baseline
     CHANGED/ADDED (all RAM-only, no Firebase writes):
       1. EXPIRED CERTS box (#scCertList) now hosts the live fleet-check
          panel (was a separate #fc-live-panel, removed). Header has a
          Today/Tomorrow toggle (FCHECK.setPanelMode). Default Today =
          compare certs vs current date; Tomorrow = vs current date +1
          (fuller Tomorrow logic still TBD per user). Re-runs on every
          FCHECK.recompute() (user edits + Firebase pushes) and on
          scale-tab open. FCHECK additions: setPanelMode/getPanelMode,
          _modeCheckDate, buildPanelIssues now uses the mode date.
       2. TODAY PLAN plate cell: new plateFormatter on the 'plate'
          column → if FCHECK.plateInFleet(plate) is false, the plate
          text turns red and BLINKS (.fc-plate-missing, @keyframes
          fcBlink) with a ⚠ marker + tooltip. Re-evaluated when the
          cell is edited.
       3. ASSIGN SEARCH (scShowResults): each result now shows inline
          warning badges (❌ missing / 🔴 expired / ⚠ dup driver via
          FCHECK.orderWarning) AND the sale note (row.note). Plate text
          reddens when missing in Fleet.
       4. TWO-CLICK ASSIGN (replaces the old confirm() dialog): clean
          rows assign on a single click. Rows WITH warnings require two
          clicks — 1st click arms the row (red blink + outline +
          "Click again to assign anyway"), 2nd click assigns. Arm state
          resets on each new search. scAssignToStation no longer shows
          a blocking confirm().
       5. STATION CARD warning row now follows the Today/Tomorrow toggle
          date too (stationWarning uses _modeCheckDate).
       FCHECK exports added: plateInFleet, orderWarning, setPanelMode,
          getPanelMode.
   v4.13.0 (p3.5-live-fleet-warn-panel) — prior
     Live recompute on data change; fixed panel; per-station warn row.
   v4.12.0 (p3.4-paste-assign-fleet-warn) — prior
     FCHECK module; paste overlay; assign confirm (now superseded by
     the two-click flow in v4.14.0).
   v4.11.0 (p3.3-cert-check-dual-lot) — prior baseline.
   ============================================================ */
document.title=`LPG Station — ${APP_VERSION} (build ${APP_BUILD_ID})`;

```
