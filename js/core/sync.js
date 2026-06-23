/* ============================================================
 * SC  —  sync.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 8984–9363   (~380 dòng)
 * Global xuất ra : window.SC
 * Phase tách     : P2
 * Phụ thuộc      : config
 * Khởi tạo (boot): SC.init() = P0 (BẮT BUỘC chạy đầu tiên – gọi firebase.initializeApp() ~9211)
 * ------------------------------------------------------------
 * MÔ TẢ: Sync Core: RAM + localStorage + Firebase RTDB, ghi delta theo từng field, version-gated apply, audit log (who+when). Đồng thời khởi tạo Firebase (initializeApp).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   SC.init(), SC.write(path,val), SC.on(path,cb), SC.user(), SC.audit(...)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module SC từ dòng 8984 đến 9363.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.SC).
 *   3) node --check sync.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P2]: dán thân module SC (V4-54 dòng 8984–9363) vào đây. */

const SC = (function(){
  let FB=null, fbConnected=false;
  let _suppressLocalEcho = 0;   // we get our own writes echoed back; skip them
  /* v4.x — SELF-HEALING echo suppression. The counter alone could get STUCK
     positive if an FB write promise never settled (its .finally never ran) —
     e.g. a flaky connection during the big "wipe all" multi-row write. A stuck
     counter makes this machine ignore EVERY inbound child event until an F5,
     which is exactly the "fleet edits don't reach my machine" symptom. We pair
     the counter with a time ceiling: suppression holds only while the counter
     is up AND we're inside the window, so a stuck counter auto-heals. */
  let _suppressUntil = 0;
  let _lastReconcile = 0;       // throttle full re-reads (attach + reconnect can both fire)
  const _pendingQueue = [];     // edits buffered while offline
  let _versions = { fleet:0 };  // local idea of each area's version
  const LS_KEY = 'lpg_v4_cache_v1';

  /* ---- localStorage cache (versioned blob) ---- */
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
      const obj = { schema:1, savedAt:Date.now(), versions:_versions, data:DATA };
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    }catch(e){ /* quota — ignore */ }
  }

  /* ---- audit log: DISABLED in v4.5.0 to save Firebase Spark quota ---- */
  function logAudit(){ /* no-op */ }

  /* ---- audit listener: DISABLED in v4.5.0 (Spark quota) ---- */
  const AUDIT = [];
  function attachAuditListener(){ /* no-op */ }
  function getAuditFor(){ return []; }

  /* ---- the only function that mutates DATA + writes to FB ----
     changes = [{ tab, rid, field, value }, ...]
     reason  = 'edit' | 'paste' | 'add row' | 'delete' | 'seed' | ...
     Returns the multi-path payload it sent (for debugging).
  */
  function applyAndPush(changes, reason){
    if(!changes || !changes.length) return null;
    if(!canWrite('fleet')) { toast('You do not have permission to edit','er'); return null; }

    const now = Date.now();
    const payload = {};
    let touched = new Set();

    changes.forEach(c=>{
      const { tab, rid, field, value } = c;
      if(!DATA[tab][rid]) DATA[tab][rid] = { _rid: rid };
      const row = DATA[tab][rid];
      const before = row[field];
      if(field === '__DELETE__'){
        // row delete — special token
        delete DATA[tab][rid];
        payload[`fleet_/${tab}/${rid}`] = null;
        logAudit('fleet:'+tab, rid, '__row__', '(row)', null, reason);
      } else {
        // normalize date-shaped fields BEFORE storing/pushing
        const normalized = isDateField(tab, field) ? normalizeDate(value) : value;
        row[field] = normalized;
        payload[`fleet_/${tab}/${rid}/${field}`] = normalized;
        // also mutate the caller's change record so audit log matches what was stored
        c.value = normalized;
        // only log real value changes
        if(before !== normalized) logAudit('fleet:'+tab, rid, field, before, normalized, reason);
      }
      // stamp row metadata (last editor + time)
      if(field !== '__DELETE__'){
        row.lastBy = CURRENT_USER.name;
        row.lastAt = now;
        payload[`fleet_/${tab}/${rid}/lastBy`] = CURRENT_USER.name;
        payload[`fleet_/${tab}/${rid}/lastAt`] = now;
      }
      touched.add(tab);
    });

    // bump version once for the whole batch
    _versions.fleet = (_versions.fleet||0) + 1;
    payload['fleet_version'] = _versions.fleet;

    saveCache();

    if(FB && fbConnected){
      _suppressLocalEcho++; _suppressUntil = Date.now() + 1500;
      FB.ref().update(payload)
        .then(()=>{
          toast('Synced '+[...touched].map(t=>CERT_DEFS[t].label).join(', ')+' ('+reason+')','ok');
        })
        .catch(e=>{
          toast('FB write failed — saved locally; will retry','er');
          console.error('FB push',e);
          _pendingQueue.push({payload,reason});
        })
        .finally(()=>{ setTimeout(()=>{_suppressLocalEcho--;}, 600); });
    } else {
      _pendingQueue.push({payload,reason});
      toast('Saved locally (offline) — will sync when online','ok');
    }
    return payload;
  }

  /* ---- flush pending writes when we come back online ---- */
  function flushPending(){
    if(!FB || !fbConnected || !_pendingQueue.length) return;
    const q = _pendingQueue.splice(0, _pendingQueue.length);
    q.forEach(({payload,reason})=>{
      _suppressLocalEcho++; _suppressUntil = Date.now() + 1500;
      FB.ref().update(payload)
        .then(()=>toast('Flushed offline change ('+reason+')','ok'))
        .catch(e=>{ console.error(e); _pendingQueue.push({payload,reason}); })
        .finally(()=>setTimeout(()=>{_suppressLocalEcho--;},600));
    });
  }

  /* ---- inbound: child_added / child_changed / child_removed
     at fleet_/{tab} level. We listen to grandchildren too so a
     single-field write from another machine doesn't replace the whole row. */
  /* ── v4.34.0 — one shared debounced refresh for ALL fleet tabs.
     The initial replay fires child_added per row per tab; the old handlers
     serialized the whole fleet cache and rebuilt the table per row (O(N²)
     startup). RAM is mutated immediately; cache/table/subs/FCHECK refresh
     once per burst. Hoisted to module scope so _reconcileAll can reuse it. */
  let _fleetSyncT = null;
  function _scheduleFleetSync(){
    if(_fleetSyncT) return;
    _fleetSyncT = setTimeout(()=>{
      _fleetSyncT = null;
      saveCache();
      rebuildTableData();          /* current tab only — same as before */
      refreshCounts();
      buildFleetSubs();
      try{ if(typeof FCHECK!=='undefined') FCHECK.recompute(); }catch(_){}
    }, 100);
  }

  /* ── v4.x — FULL authoritative re-sync of every fleet tab.
     Firebase wins: pull every remote row into RAM (so a machine that missed
     child events still gets them), THEN prune local rows that no longer exist
     remotely (deleted/wiped elsewhere). We never re-upload local-only rows —
     that is the stale-cache-overwrites-Firebase bug the other modules guard
     against. Throttled because attach + reconnect + version-reset can all ask
     for a reconcile within the same moment. */
  function _reconcileAll(reason){
    if(!FB) return;
    const now = Date.now();
    if(now - _lastReconcile < 800) return;
    _lastReconcile = now;
    if(reason) console.warn('[fleet] full reconcile ('+reason+')');
    FLEET_TABS.forEach(tab=>{
      FB.ref('fleet_/'+tab).once('value').then(snap=>{
        const fbData = snap.val() || {};
        if(!DATA[tab]) DATA[tab] = {};
        Object.keys(fbData).forEach(rid=>{
          const row = fbData[rid];
          if(row && typeof row === 'object'){ row._rid = rid; DATA[tab][rid] = row; }
        });
        Object.keys(DATA[tab]).forEach(rid=>{
          if(!Object.prototype.hasOwnProperty.call(fbData, rid)) delete DATA[tab][rid];
        });
        _scheduleFleetSync();
      }).catch(()=>{});
    });
  }

  function attachListeners(){
    /* v4.x — chụp version local TRƯỚC khi listener fleet_version kịp sửa nó,
       để version-gate khi mở (chỉ tải full khi local ≠ firebase). */
    const _openLocalVer = _versions.fleet || 0;

    FB.ref('.info/connected').on('value', s=>{
      fbConnected = !!s.val();
      setLed(fbConnected, fbConnected?'FIREBASE':'OFFLINE');
      if(fbConnected){
        /* v4.x — on reconnect we only need to:
           1) reset any LEAKED echo-suppression so inbound events flow again;
           2) flush writes buffered while offline.
           We deliberately do NOT full-reconcile here: the Firebase SDK already
           re-syncs DELTAS automatically on reconnect (it fires child_* only for
           rows that actually changed while we were offline — no full download).
           A flaky link would otherwise trigger a full fleet read on every
           reconnect and burn Spark quota. The fleet_version listener below is
           the cheap safety net: if the node was wiped/reset (version went
           backward) it does ONE reconcile; a normal forward bump costs nothing
           beyond the deltas the SDK is already delivering. */
        _suppressLocalEcho = 0;
        flushPending();
      }
    });

    FB.ref('fleet_version').on('value', s=>{
      const v = s.val()||0;
      if(v < _versions.fleet){
        /* v4.x — server counter went BACKWARD → the fleet node was wiped /
           reset by hand (exactly the "I cleared all data yesterday" case).
           Adopt the lower counter and do a FULL reconcile so this machine
           drops the wiped rows and re-pulls the authoritative state. Without
           this the machine kept its stale-high version and never re-synced —
           the cause of "fleet edits don't reach my machine". Mirrors TL. */
        _versions.fleet = v;
        _reconcileAll('version-reset');
      } else if(v > _versions.fleet){
        _versions.fleet = v;          /* forward bump — child events deliver rows */
      }
    });

    FLEET_TABS.forEach(tab=>{
      const ref = FB.ref('fleet_/'+tab);

      ref.on('child_added', snap=>{
        if(_suppressLocalEcho && Date.now() < _suppressUntil) return;
        const rid = snap.key, row = snap.val();
        if(!row) return;
        row._rid = rid;
        DATA[tab][rid] = row;
        _scheduleFleetSync();
      });

      ref.on('child_changed', snap=>{
        if(_suppressLocalEcho && Date.now() < _suppressUntil) return;
        const rid = snap.key, row = snap.val();
        if(!row) return;
        row._rid = rid;
        DATA[tab][rid] = row;
        _scheduleFleetSync();
      });

      ref.on('child_removed', snap=>{
        if(_suppressLocalEcho && Date.now() < _suppressUntil) return;
        const rid = snap.key;
        delete DATA[tab][rid];
        _scheduleFleetSync();
      });
    });

    /* ── v4.x — VERSION-GATE KHI MỞ ──────────────────────────────────────
       Chỉ TẢI FULL (reconcile: merge + prune) khi version local KHÁC version
       Firebase. Sau khi FORCESYNC xoá cache thì local=0 ≠ firebase → tải về.
       Mở bình thường mà version KHỚP → tin cache, BỎ QUA full read (đỡ quota).
       child_added/changed/removed ở trên vẫn chạy để nhận realtime + nạp dòng. */
    FB.ref('fleet_version').once('value').then(s=>{
      const fbVer = s.val() || 0;
      if(fbVer !== _openLocalVer){
        console.warn('[fleet] version local '+_openLocalVer+' ≠ firebase '+fbVer+' → TẢI FULL về');
        _reconcileAll('attach v'+_openLocalVer+'→'+fbVer);
      } else {
        console.log('[fleet] version khớp ('+fbVer+') → dùng cache, bỏ qua tải full');
      }
    }).catch(()=>{ _reconcileAll('attach (đọc version lỗi → tải full an toàn)'); });
  }

  /* ---- auto-seed REMOVED (v4.x) ----
     Firebase is the single source of truth. The app must NEVER push sample
     data up. If Firebase is empty, the fleet stays empty (the reconcile step
     in attachListeners() prunes any stale local/cached rows to match FB).
     Kept as a no-op so any stray caller doesn't throw. */
  function seedIfEmpty(){ /* intentionally does nothing */ }

  /* ---- public API ---- */
  return {
    init(){
      // 1. load cache → UI shows last-known data immediately, offline-safe
      const cached = loadCache();
      if(cached){
        Object.assign(DATA, cached.data || {});
        _versions = cached.versions || _versions;
      }
      // 2. connect Firebase
      try{
        if(typeof firebase==='undefined'){ setLed(false,'NO SDK'); return; }
        firebase.initializeApp(firebaseConfig);
        FB = firebase.database();

        /* ─── Global Firebase instrumentation ───
           Monkey-patch Reference.prototype.update / .set / .remove so every write
           gets counted by FBA, regardless of which module made the call. The "area"
           label is derived from the ref path (e.g. "plan_today_/oid/field" → "plan_today").
           We also patch ref.on/once so reads are counted as snapshots arrive.
           This means NO per-module changes are needed for tracking — every Firebase
           call automatically updates the activity monitor. */
        try{
          const _RefProto = Object.getPrototypeOf(FB.ref());
          const _areaOf = (refOrPath) => {
            let p = '';
            try{ p = typeof refOrPath === 'string' ? refOrPath : (refOrPath.toString().split('/').slice(3).join('/') || '/'); }catch(_){ p = '?'; }
            /* Take top-level segment, strip trailing underscore for clean labels */
            const top = (p.split('/')[0] || '/').replace(/_$/,'');
            return top || '/';
          };

          /* writes: update / set / remove / push */
          const _origUpdate = _RefProto.update;
          _RefProto.update = function(values){
            try{
              if(values && typeof values === 'object'){
                /* For multi-path updates, count each top-level path bucket separately */
                const buckets = {};
                Object.keys(values).forEach(k=>{
                  const a = _areaOf(k);
                  buckets[a] = (buckets[a]||0) + JSON.stringify(values[k]==null?null:values[k]).length + k.length + 4;
                });
                Object.keys(buckets).forEach(a => FBA.write(a, buckets[a]));
              } else {
                FBA.write(_areaOf(this), values);
              }
            }catch(_){}
            return _origUpdate.apply(this, arguments);
          };
          const _origSet = _RefProto.set;
          _RefProto.set = function(value){
            try{ FBA.write(_areaOf(this), value); }catch(_){}
            return _origSet.apply(this, arguments);
          };
          const _origRemove = _RefProto.remove;
          _RefProto.remove = function(){
            try{ FBA.write(_areaOf(this), 0); }catch(_){}
            return _origRemove.apply(this, arguments);
          };
          const _origPush = _RefProto.push;
          _RefProto.push = function(value){
            try{ if(value !== undefined) FBA.write(_areaOf(this), value); }catch(_){}
            return _origPush.apply(this, arguments);
          };

          /* reads: on / once — wrap callback so each snapshot is counted */
          const _origOn = _RefProto.on;
          _RefProto.on = function(eventType, callback, ...rest){
            const path = this;
            const wrapped = function(snap){
              try{ FBA.read(_areaOf(path) + ':' + eventType, snap && snap.val ? snap.val() : 0); }catch(_){}
              return callback.apply(this, arguments);
            };
            /* preserve identity so .off(cb) callers can still find the original — we
               attach the wrapped fn directly; .off() with no callback removes all anyway */
            return _origOn.call(this, eventType, wrapped, ...rest);
          };
          const _origOnce = _RefProto.once;
          _RefProto.once = function(eventType, ...rest){
            const path = this;
            const p = _origOnce.call(this, eventType, ...rest);
            if(p && typeof p.then === 'function'){
              p.then(snap=>{
                try{ FBA.read(_areaOf(path) + ':once', snap && snap.val ? snap.val() : 0); }catch(_){}
              }).catch(()=>{});
            }
            return p;
          };

          console.log('[FBA] ✅ Global Firebase instrumentation installed');
        }catch(instrErr){
          console.warn('[FBA] Could not install instrumentation:', instrErr);
        }

        /* v4.x — KHÔNG attachListeners() ở đây! SC.init() chạy ở P0 TRƯỚC khi
           đăng nhập; rules cần auth để đọc fleet_/* → đọc lúc này bị
           PERMISSION_DENIED, listener bị huỷ, fleet rỗng (đúng lỗi "force xong
           fleet mất trắng"; cache cũ từng che lỗi này). Gắn listener + reconcile
           chuyển sang SC.attach(), gọi SAU đăng nhập trong AUTH onReady (boot.js).
           NOTE: auto-seed intentionally NOT called — Firebase is authoritative. */
      }catch(e){ console.error('FB init',e); setLed(false,'FB ERROR'); }
    },
    /* v4.x — gắn listener + tải dữ liệu fleet. PHẢI gọi SAU đăng nhập (rules
       cần auth để đọc fleet_/*). Gọi trong AUTH onReady ở boot.js. */
    attach(){
      if(!FB){ console.warn('[fleet] SC.attach: chưa có FB (firebase init lỗi?)'); return; }
      attachListeners();
      attachAuditListener();
    },
    getAuditFor,
    /* single-field edit */
    edit(tab, rid, field, value, reason){
      applyAndPush([{tab,rid,field,value}], reason||'edit');
    },
    /* multiple fields on one row, or many rows (paste/seed) */
    editBatch(changes, reason){ applyAndPush(changes, reason||'edit'); },
    /* add a fresh row — caller passes the row OBJ without _rid */
    addRow(tab, rowObj, reason){
      const rid = newRid();
      const batch = [];
      Object.entries(rowObj).forEach(([k,v])=> batch.push({tab,rid,field:k,value:v}));
      applyAndPush(batch, reason||'add row');
      return rid;
    },
    /* delete row */
    deleteRow(tab, rid, reason){
      applyAndPush([{tab,rid,field:'__DELETE__',value:null}], reason||'delete');
    },
    /* replace a whole tab (used by Paste). Diff vs current DATA so we
       only send fields that changed + deletions for missing rows. */
    replaceTab(tab, newRowsArr, reason){
      const batch=[];
      const existing = DATA[tab] || {};
      // delete rows that are gone
      Object.keys(existing).forEach(rid=>{
        batch.push({tab,rid,field:'__DELETE__',value:null});
      });
      // add fresh rows
      newRowsArr.forEach(r=>{
        const rid = newRid();
        Object.entries(r).forEach(([k,v])=> batch.push({tab,rid,field:k,value:v}));
      });
      applyAndPush(batch, reason||'paste');
    },
    /* nuke every row in a tab (Clear-all button). Same delta semantics —
       each row issues a __DELETE__ change. Audit log gets one row entry
       per row deleted. */
    wipeArea(tab, reason){
      if(!canWrite('fleet')) { toast('No permission','er'); return; }
      const existing = DATA[tab] || {};
      const rids = Object.keys(existing);
      if(!rids.length){ toast('Nothing to clear','er'); return; }
      const batch = rids.map(rid => ({tab,rid,field:'__DELETE__',value:null}));
      applyAndPush(batch, reason||'clear all');
    },
    cache: saveCache,
    isOnline: ()=>fbConnected
  };
})();
