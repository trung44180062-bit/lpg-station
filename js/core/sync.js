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
    FB.ref('.info/connected').on('value', s=>{
      fbConnected = !!s.val();
      setLed(fbConnected, fbConnected?'FIREBASE':'OFFLINE');
      if(fbConnected){
        /* reconnect: reset leaked echo-suppression + flush offline writes.
           KHÔNG full-reconcile ở đây (SDK tự đồng bộ delta khi reconnect). */
        _suppressLocalEcho = 0;
        flushPending();
      }
    });

    /* ── v4.x — ROW LISTENERS gắn LAZY (chỉ khi thật sự cần tải) ──────────
       Trước đây child_added gắn VÔ ĐIỀU KIỆN ⇒ MỖI LẦN MỞ replay toàn bộ dòng
       = tải full dù dữ liệu không đổi (tốn quota). Giờ chỉ gắn qua _loadFleet
       khi version local ≠ firebase. Idempotent: gắn đúng 1 lần. */
    let _rowListenersOn = false;
    function _attachRowListeners(){
      if(_rowListenersOn) return;
      _rowListenersOn = true;
      FLEET_TABS.forEach(tab=>{
        const ref = FB.ref('fleet_/'+tab);
        ref.on('child_added', snap=>{
          if(_suppressLocalEcho && Date.now() < _suppressUntil) return;
          const rid = snap.key, row = snap.val();
          if(!row) return;
          row._rid = rid;
          if(!DATA[tab]) DATA[tab] = {};
          DATA[tab][rid] = row;
          _scheduleFleetSync();
        });
        ref.on('child_changed', snap=>{
          if(_suppressLocalEcho && Date.now() < _suppressUntil) return;
          const rid = snap.key, row = snap.val();
          if(!row) return;
          row._rid = rid;
          if(!DATA[tab]) DATA[tab] = {};
          DATA[tab][rid] = row;
          _scheduleFleetSync();
        });
        ref.on('child_removed', snap=>{
          if(_suppressLocalEcho && Date.now() < _suppressUntil) return;
          const rid = snap.key;
          if(DATA[tab]) delete DATA[tab][rid];
          _scheduleFleetSync();
        });
      });
    }
    /* Tải fleet từ Firebase: gắn row listeners (realtime) + reconcile (merge + prune). */
    function _loadFleet(reason){ _attachRowListeners(); _reconcileAll(reason); }

    /* ── v4.x — VERSION-GATE (mở app + realtime dùng CHUNG 1 listener) ──
       on('value') bắn NGAY lúc attach (so version khi MỞ) và mỗi lần đổi:
         fb <  local → node bị wipe/reset tay → tải lại + prune.
         fb >  local → máy khác vừa sửa (hoặc vừa bị FORCESYNC nên local=0) → TẢI về.
         fb == local → dữ liệu KHỚP → KHÔNG tải (dùng cache/RAM) → đỡ quota.
       Vì row listeners gắn LAZY trong _loadFleet, khi version khớp sẽ KHÔNG
       replay ⇒ KHÔNG tải full mỗi lần mở (đúng yêu cầu: chỉ tải khi local < firebase). */
    FB.ref('fleet_version').on('value', s=>{
      const fb = s.val()||0;
      if(fb < _versions.fleet){
        console.warn('[fleet] version firebase '+fb+' < local '+_versions.fleet+' → wipe/reset tay → tải lại + prune');
        _versions.fleet = fb; _loadFleet('version-reset');
      } else if(fb > _versions.fleet){
        console.warn('[fleet] version firebase '+fb+' > local '+_versions.fleet+' → TẢI về');
        _versions.fleet = fb; _loadFleet('version-up');
      } else {
        console.log('[fleet] version khớp ('+fb+') → dùng cache, KHÔNG tải full (đỡ quota)');
      }
    }, err=>{ console.warn('[fleet] đọc fleet_version lỗi → tải full an toàn', err); _loadFleet('version-err'); });
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
