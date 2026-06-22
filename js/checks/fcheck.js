/* ============================================================
 * FCHECK  —  fcheck.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 18777–19653   (~877 dòng)
 * Global xuất ra : window.FCHECK
 * Phase tách     : P4
 * Phụ thuộc      : tl, ct + DATA fleet
 * Khởi tạo (boot): FCHECK.recompute() sau khi data nạp
 * ------------------------------------------------------------
 * MÔ TẢ: Đối soát chứng chỉ đội xe (cert fleet): cảnh báo cert hết hạn theo xe/tài xế/đơn hàng.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   FCHECK.plateInFleet(plate), FCHECK.cellWarn(r,field), FCHECK.orderWarning(r,date), FCHECK.recompute()
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module FCHECK từ dòng 18777 đến 19653.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.FCHECK).
 *   3) node --check fcheck.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P4]: dán thân module FCHECK (V4-54 dòng 18777–19653) vào đây. */

const FCHECK = (function(){
  'use strict';

  /* Normalize a plate for comparison: uppercase, strip separators,
     re-insert canonical dash for VN pattern "51D05867" -> "51D-05867". */
  function normPlate(p){
    var s = (p||'').trim().toUpperCase();
    var raw = s.replace(/[\s\-\.]+/g,'');
    var m = raw.match(/^([0-9]{2}[A-Z][A-Z]?)(\d+)$/);
    if(m) return m[1] + '-' + m[2];
    return raw || s;
  }
  /* Stripped form (alnum only) — robust equality key. */
  function plateKey(p){ return (p||'').toUpperCase().replace(/[^0-9A-Z]/g,''); }

  /* ── v4.34.0 — cached fleet lookup index (RAM only) ──────────────
     checkOrder used to linear-scan the fleet tabs for every plan row and
     for every plate/rmooc/driver cell on every render. The index is built
     once and reused until invalidated; recompute() — which every fleet
     write path (local edit AND remote child event) already calls —
     invalidates it synchronously. */
  var _fidx = null;
  function _fleetIdx(){
    if(_fidx) return _fidx;
    var idx = { tanklorry:{}, tractor:{}, rmooc:{}, driver:{} };
    if(typeof DATA !== 'undefined'){
      ['tanklorry','tractor','rmooc'].forEach(function(tab){
        var store = DATA[tab] || {};
        Object.keys(store).forEach(function(rid){
          var row = store[rid];
          if(!row) return;
          var k = plateKey(row.plate);
          if(k && !idx[tab][k]) idx[tab][k] = row;   /* first match wins — same as the old scan order */
        });
      });
      var ds = DATA.driver || {};
      Object.keys(ds).forEach(function(rid){
        var r = ds[rid];
        if(!r) return;
        var n = (r.name||'').trim().toLowerCase().normalize('NFC');
        if(!n) return;
        (idx.driver[n] = idx.driver[n] || []).push(r);
      });
    }
    _fidx = idx;
    return idx;
  }

  /* Find a vehicle row across the given DATA tabs by plate. */
  function findVehicle(plate, tabs){
    var key = plateKey(plate);
    if(!key) return null;
    var idx = _fleetIdx();
    for(var t=0; t<tabs.length; t++){
      var row = idx[tabs[t]] && idx[tabs[t]][key];
      if(row) return { tab: tabs[t], row: row };
    }
    return null;
  }

  /* Find all driver rows by name (NFC-normalized, case-insensitive). */
  function findDrivers(name){
    var n = (name||'').trim().toLowerCase().normalize('NFC');
    if(!n) return [];
    return _fleetIdx().driver[n] || [];
  }

  /* Collect expired cert fields for a row using CERT_DEFS[tab]. checkDate
     is the plan's forDate (Date) — a cert is "expired" if it lapses before it. */
  function expiredCerts(row, tab, checkDate, vehicleLabel, subjectKey){
    var out = [];
    var def = (typeof CERT_DEFS !== 'undefined') ? CERT_DEFS[tab] : null;
    if(!def) return out;
    def.certs.forEach(function(c){
      var v = row[c.k];
      if(!v) return;
      var d = (typeof parseDate === 'function') ? parseDate(v) : null;
      if(!d) return;
      d.setHours(0,0,0,0);
      if(d < checkDate){
        out.push({ vehicle: vehicleLabel, subject: subjectKey, cert: c.name, expired: v });
      }
    });
    return out;
  }

  /* Core per-order check. Returns:
     { missing: ['Vehicle'|'Rmooc'|'Driver'], expired: [{vehicle,subject,cert,...}], dupDriver: int } */
  function checkOrder(plate, rmooc, driver, checkDate){
    var cd = checkDate ? new Date(checkDate) : new Date();
    cd.setHours(0,0,0,0);
    var res = { missing: [], expired: [], dupDriver: 0 };

    var hasRmooc = !!(rmooc && rmooc.trim());

    // Vehicle: tank lorry (rigid) carries its own tank certs; tractor pulls an rmooc.
    var veh = findVehicle(plate, ['tanklorry','tractor']);
    if(plate && plate.trim()){
      if(!veh){
        res.missing.push('Vehicle');
      } else {
        res.expired = res.expired.concat(
          expiredCerts(veh.row, veh.tab, cd, normPlate(plate)+' ('+(veh.tab==='tractor'?'Tractor':'Tank Lorry')+')', plate)
        );
      }
    }

    // Rmooc (only when a tractor pulls one).
    if(hasRmooc){
      var rm = findVehicle(rmooc, ['rmooc']);
      if(!rm){
        res.missing.push('Rmooc');
      } else {
        res.expired = res.expired.concat(
          expiredCerts(rm.row, 'rmooc', cd, normPlate(rmooc)+' (Rmooc)', rmooc)
        );
      }
    }

    // Driver.
    if(driver && driver.trim()){
      var drs = findDrivers(driver);
      if(!drs.length){
        res.missing.push('Driver');
      } else {
        if(drs.length > 1) res.dupDriver = drs.length;
        drs.forEach(function(drRow){
          res.expired = res.expired.concat(
            expiredCerts(drRow, 'driver', cd, driver+' (Driver)', driver)
          );
        });
      }
    }

    return res;
  }

  /* Group expired certs into a compact one-line string, grouped by subject. */
  function compactExpired(expired){
    if(!expired || !expired.length) return '';
    var bySubj = {};
    expired.forEach(function(w){
      var k = w.subject || w.vehicle;
      if(!bySubj[k]) bySubj[k] = [];
      bySubj[k].push(w.cert);
    });
    var parts = [];
    for(var k in bySubj){ parts.push(k + ': ' + bySubj[k].join(', ')); }
    return 'Expired: ' + parts.join(' | ');
  }

  function esc(s){
    return (s||'').toString()
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ===== Paste warning: scan plan rows, open the editable editor (RAM-only).
     Replaces the old runPasteCheck → showOverlay path. Accepts an optional plan
     dict — the factory passes its local PLAN (so a paste into Tomorrow scans
     plan_tomorrow_ rows, not today's). */
  function runPasteCheck(planArg){
    var plan;
    if(planArg && typeof planArg === 'object'){ plan = planArg; }
    else if(typeof TP !== 'undefined' && TP.PLAN){ plan = TP.PLAN; }
    else { return; }

    var orders = [];
    Object.keys(plan).forEach(function(oid){
      var r = plan[oid];
      if(!r) return;
      if(r._status === 'done' || r._status === 'cancel') return;
      var checkDate = (typeof parseDate === 'function' && r._forDate)
        ? (parseDate(r._forDate) || new Date()) : new Date();
      var c = checkOrder(r.plate||'', r.rmooc||'', r.driver||'', checkDate);
      if(c.missing.length || c.expired.length || c.dupDriver){
        /* v4.30.1 — surface dupDriver to the editor (was lost before).
           Editor needs it to render the duplicate-driver warning per
           order, even when the order has no expired certs at all. */
        orders.push({ no:r.no||'', plate:r.plate||'', rmooc:r.rmooc||'', driver:r.driver||'',
                      customer:r.customer||'', _forDate:r._forDate||'',
                      _dupDriver: c.dupDriver||0,
                      _missing: c.missing.slice() });
      }
    });
    if(!orders.length){
      if(typeof toast === 'function') toast('Fleet check: all trucks/rmoocs/drivers OK','ok');
      return;
    }
    openIssueEditor(orders);
  }

  /* Locate the rid for a vehicle row inside a Fleet tab. Plate-normalized lookup. */
  function _ridFor(tab, plate){
    if(typeof DATA === 'undefined' || !DATA[tab]) return null;
    var norm = plateKey(plate);
    if(!norm) return null;
    var store = DATA[tab];
    for(var rid in store){
      if(plateKey(store[rid].plate||'') === norm) return rid;
    }
    return null;
  }

  /* Locate driver rids by NFC-normalized name. May return multiple on duplicate names. */
  function _ridForDriver(name){
    if(typeof DATA === 'undefined' || !DATA.driver) return [];
    var n = String(name||'').trim().toLowerCase().normalize('NFC');
    if(!n) return [];
    var out = [];
    for(var rid in DATA.driver){
      if(String(DATA.driver[rid].name||'').trim().toLowerCase().normalize('NFC') === n) out.push(rid);
    }
    return out;
  }

  /* Reverse-lookup field key from cert display name via CERT_DEFS. */
  function _certKey(tab, certName){
    if(typeof CERT_DEFS === 'undefined' || !CERT_DEFS[tab]) return null;
    var c = CERT_DEFS[tab].certs.find(function(x){ return x.name === certName; });
    return c ? c.k : null;
  }

  /* Build subject rows for one order at checkDate.
     v4.30.2 — only emit subjects that have a real problem
     (expired / missing / dup). OK subjects are not rendered at
     all; the goal of this popup is to surface issues, not to
     re-summarize every order. The roll-up summary banner at the
     top of the editor still reflects per-category totals.
     Returns { subjects:[{kind,status,tab?,rid?,icon,label,certs?,dup?}],
               counts:{expired,missing,dup} } */
  function _buildEditorRowsForOrder(o, checkDate){
    var subjects = [];
    var counts = { expired: 0, missing: 0, dup: 0 };

    // Vehicle (tank lorry OR tractor)
    if(o.plate && o.plate.trim()){
      var v = findVehicle(o.plate, ['tanklorry','tractor']);
      if(!v){
        counts.missing++;
        subjects.push({
          kind: 'vehicle', status: 'missing',
          icon: '\uD83D\uDE9A',
          label: normPlate(o.plate) + ' (Vehicle)'
        });
      } else {
        var rid = _ridFor(v.tab, o.plate);
        var exp = expiredCerts(v.row, v.tab, checkDate, '', '');
        if(rid && exp.length){
          counts.expired += exp.length;
          subjects.push({
            kind: 'vehicle', status: 'expired',
            tab: v.tab, rid: rid,
            icon: v.tab==='tractor' ? '\uD83D\uDE9B' : '\uD83D\uDE9A',
            label: normPlate(o.plate) + ' (' + (v.tab==='tractor' ? 'Tractor' : 'Tank Lorry') + ')',
            certs: exp.map(function(e){ return { k: _certKey(v.tab, e.cert), name: e.cert, cur: e.expired }; })
                      .filter(function(c){ return c.k; })
          });
        }
        /* No-issue vehicle: intentionally not rendered. */
      }
    }

    // Rmooc
    if(o.rmooc && o.rmooc.trim()){
      var rm = findVehicle(o.rmooc, ['rmooc']);
      if(!rm){
        counts.missing++;
        subjects.push({
          kind: 'rmooc', status: 'missing',
          icon: '\uD83D\uDD17',
          label: normPlate(o.rmooc) + ' (Rmooc)'
        });
      } else {
        var rRid = _ridFor('rmooc', o.rmooc);
        var rExp = expiredCerts(rm.row, 'rmooc', checkDate, '', '');
        if(rRid && rExp.length){
          counts.expired += rExp.length;
          subjects.push({
            kind: 'rmooc', status: 'expired',
            tab: 'rmooc', rid: rRid, icon: '\uD83D\uDD17',
            label: normPlate(o.rmooc) + ' (Rmooc)',
            certs: rExp.map(function(e){ return { k: _certKey('rmooc', e.cert), name: e.cert, cur: e.expired }; })
                       .filter(function(c){ return c.k; })
          });
        }
        /* No-issue rmooc: intentionally not rendered. */
      }
    }

    // Driver(s) — duplicate name still produces a warn-only row.
    if(o.driver && o.driver.trim()){
      var dRids = _ridForDriver(o.driver);
      if(!dRids.length){
        counts.missing++;
        subjects.push({
          kind: 'driver', status: 'missing',
          icon: '\uD83D\uDC64',
          label: o.driver + ' (Driver)'
        });
      } else {
        if(dRids.length > 1){
          counts.dup++;
          subjects.push({
            kind: 'driver', status: 'dup',
            icon: '\uD83D\uDC64',
            label: o.driver + ' (Driver)',
            dup: dRids.length
          });
        }
        dRids.forEach(function(dRid, idx){
          var drRow = DATA.driver[dRid];
          if(!drRow) return;
          var dExp = expiredCerts(drRow, 'driver', checkDate, '', '');
          if(dExp.length){
            counts.expired += dExp.length;
            subjects.push({
              kind: 'driver', status: 'expired',
              tab: 'driver', rid: dRid, icon: '\uD83D\uDC64',
              label: o.driver + (dRids.length>1 ? ' (Driver #'+(idx+1)+')' : ' (Driver)'),
              certs: dExp.map(function(e){ return { k: _certKey('driver', e.cert), name: e.cert, cur: e.expired }; })
                         .filter(function(c){ return c.k; })
            });
          }
          /* No-issue driver: intentionally not rendered. */
        });
      }
    }
    return { subjects: subjects, counts: counts };
  }

  /* Public: open editor for one or more orders.
     orderArray = [{no, plate, rmooc, driver, customer, _forDate?,
                    _dupDriver?, _missing?}, ...]
     v4.30.1 — overhauled rendering:
       • top summary banner (counts split by category)
       • per-order header shows DO / customer / date / one-line problem summary
       • each subject (vehicle/rmooc/driver) gets a row with a status
         badge (OK / Missing / Expired N / Duplicate N) so the cause
         of the warning is always visible — even for orders whose only
         issue is a missing plate or a duplicate driver name. */
  /* openIssueEditor — two display modes:
       'summary' (default): read-only screenshot view, used by
                            runPasteCheck (paste-time review). No
                            inputs, no SAVE, single CLOSE button.
                            Compact one-row-per-order table
                            (# / Plate / Driver / Customer / Issue),
                            issues collapsed into colour-coded bullets.
       'edit'             : editable inputs per expired cert,
                            SAVE writes deltas via SC.editBatch.
                            Block layout per subject. Used by Scale-tab
                            cert-list row click and station-card warning.
     The mode is passed via second arg { mode:'edit' }. */
  function openIssueEditor(orderArray, opts){
    if(!orderArray || !orderArray.length){
      if(typeof toast === 'function') toast('Fleet check: nothing to report','ok');
      return;
    }
    var mode = (opts && opts.mode === 'edit') ? 'edit' : 'summary';
    document.getElementById('fcheck-editor')?.remove();

    var checkDate = _modeCheckDate();
    var blocks = orderArray.map(function(o){
      var b = _buildEditorRowsForOrder(o, checkDate);
      b.order = o;
      return b;
    });

    /* Roll-up totals across every block. */
    var totals = blocks.reduce(function(acc, b){
      acc.expired += b.counts.expired;
      acc.missing += b.counts.missing;
      acc.dup     += b.counts.dup;
      return acc;
    }, { expired:0, missing:0, dup:0 });

    /* Count editable cert inputs (only relevant in edit mode). */
    var totalEditable = blocks.reduce(function(s,b){
      return s + b.subjects.reduce(function(s2,sub){
        return s2 + (sub.status==='expired' && sub.certs ? sub.certs.length : 0);
      }, 0);
    }, 0);

    if(!totals.expired && !totals.missing && !totals.dup){
      if(typeof toast === 'function') toast('Fleet check: all clean','ok');
      return;
    }

    /* ISO yyyy-mm-dd → dd/mm/yy display (header date). */
    function _isoDisp(iso){
      if(!iso || typeof iso !== 'string') return '';
      var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? (m[3]+'/'+m[2]+'/'+m[1].slice(2)) : iso;
    }

    var isEdit = (mode === 'edit');

    var h = '<div class="fce-card fce-mode-'+mode+'">';
    h += '<div class="fce-title">\u26A0 FLEET CHECK \u2014 ' + (isEdit ? 'FIX EXPIRED CERTS' : (orderArray.length + ' order' + (orderArray.length>1?'s':'') + ' with issues')) + '</div>';
    h += '<div class="fce-sub">'
       + (isEdit
            ? 'Edit expired dates inline. SAVE writes back to Fleet (delta only). Missing-in-Fleet items and duplicate drivers are read-only \u2014 fix them on the Fleet tab.'
            : 'Cert check results for trucks / rmoocs / drivers against current Fleet data. Fix dates on the Scale tab (Cert centre) when the new expiry is available.')
       + '</div>';

    /* Top summary banner */
    h += '<div class="fce-summary">'
       + '<span class="fce-sum-pill fce-sum-orders">' + orderArray.length + ' order' + (orderArray.length>1?'s':'') + '</span>'
       + (totals.expired ? '<span class="fce-sum-pill fce-sum-expired">\u26A0 ' + totals.expired + ' expired cert' + (totals.expired>1?'s':'') + '</span>' : '')
       + (totals.missing ? '<span class="fce-sum-pill fce-sum-missing">\u274C ' + totals.missing + ' missing in Fleet</span>' : '')
       + (totals.dup     ? '<span class="fce-sum-pill fce-sum-dup">\u26A0 ' + totals.dup + ' duplicate driver' + (totals.dup>1?'s':'') + '</span>' : '')
       + '</div>';

    if(!isEdit){
      /* ── Summary mode (paste-time review): compact one-row-per-order table.
            Read-only; issues collapsed into red bullets. No inputs. ── */
      h += '<table class="fce-tbl"><thead><tr>'
         + '<th class="fce-th-no">#</th><th>Plate</th><th>Driver</th><th>Customer</th><th>Issue</th>'
         + '</tr></thead><tbody>';
      blocks.forEach(function(b){
        var o = b.order;
        var bullets = [];
        b.subjects.forEach(function(sub){
          if(sub.status === 'expired' && sub.certs && sub.certs.length){
            sub.certs.forEach(function(c){
              bullets.push('<li class="fce-li-exp">\uD83D\uDD34 ' + esc(sub.label) + ' \u2013 ' + esc(c.name) + ' exp ' + esc(c.cur) + '</li>');
            });
          } else if(sub.status === 'missing'){
            bullets.push('<li class="fce-li-miss">\u274C ' + esc(sub.label) + ' not in Fleet</li>');
          } else if(sub.status === 'dup'){
            bullets.push('<li class="fce-li-dup">\u26A0 Duplicate driver name' + (sub.dup ? ' (' + sub.dup + ')' : '') + ': ' + esc(o.driver || '') + '</li>');
          }
        });
        h += '<tr>'
           + '<td class="fce-td-no">' + (o.no ? esc(o.no) : '\u2014') + '</td>'
           + '<td class="fce-td-plate">' + (o.plate ? esc(o.plate) : '\u2014') + '</td>'
           + '<td class="fce-td-driver">' + (o.driver ? esc(o.driver) : '\u2014') + '</td>'
           + '<td class="fce-td-cust">' + (o.customer ? esc(o.customer) : '\u2014') + '</td>'
           + '<td class="fce-td-issue"><ul class="fce-ul">' + bullets.join('') + '</ul></td>'
           + '</tr>';
      });
      h += '</tbody></table>';
    } else {
    blocks.forEach(function(b, bIdx){
      var o = b.order;
      var c = b.counts;
      var probs = [];
      if(c.expired) probs.push('\u26A0 ' + c.expired + ' expired');
      if(c.missing) probs.push('\u274C ' + c.missing + ' missing');
      if(c.dup)     probs.push('\u26A0 dup driver');
      var probLine = probs.join(' \u00B7 ');

      h += '<div class="fce-block">';
      h += '<div class="fce-block-hdr">';
      h += '<div class="fce-block-hdr-l">';
      h +=   '<span class="fce-do">DO ' + (o.no ? esc(o.no) : '\u2014') + '</span>';
      if(o.customer) h += '<span class="fce-cust">' + esc(o.customer) + '</span>';
      if(o._forDate) h += '<span class="fce-date">' + esc(_isoDisp(o._forDate)) + '</span>';
      h += '</div>';
      h += '<div class="fce-block-hdr-r">' + esc(probLine) + '</div>';
      h += '</div>';

      b.subjects.forEach(function(sub){
        var statusCls = 'fce-st-' + sub.status;
        var badge = '';
        switch(sub.status){
          case 'missing':  badge = '<span class="fce-badge fce-b-missing">\u274C NOT IN FLEET</span>'; break;
          case 'expired':  badge = '<span class="fce-badge fce-b-expired">\u26A0 ' + (sub.certs?sub.certs.length:0) + ' EXPIRED</span>'; break;
          case 'dup':      badge = '<span class="fce-badge fce-b-dup">\u26A0 DUPLICATE NAME (' + (sub.dup||'?') + ')</span>'; break;
        }

        /* data-tab/data-rid only needed in edit mode for SAVE plumbing. */
        var dataAttrs = (isEdit && sub.status==='expired' && sub.tab && sub.rid)
          ? ' data-tab="'+esc(sub.tab)+'" data-rid="'+esc(sub.rid)+'"'
          : '';
        h += '<div class="fce-subject ' + statusCls + '"' + dataAttrs + '>';
        h += '<div class="fce-subj-hdr"><span class="fce-subj-lbl">'+sub.icon+' '+esc(sub.label)+'</span>'+badge+'</div>';

        if(sub.status === 'expired' && sub.certs && sub.certs.length){
          h += '<div class="fce-cert-grid">';
          sub.certs.forEach(function(c){
            if(isEdit){
              h += '<div class="fce-cert-row">'
                 + '<span class="fce-cert-name">'+esc(c.name)+'</span>'
                 + '<span class="fce-cert-cur" title="Current expired value">'+esc(c.cur)+'</span>'
                 + '<input type="text" class="fce-cert-inp" data-field="'+esc(c.k)+'" data-orig="'+esc(c.cur)+'" '
                 + 'value="'+esc(c.cur)+'" placeholder="DD/MM/YY" autocomplete="off">'
                 + '</div>';
            } else {
              h += '<div class="fce-cert-row">'
                 + '<span class="fce-cert-name">'+esc(c.name)+'</span>'
                 + '<span class="fce-cert-cur">'+esc(c.cur)+'</span>'
                 + '</div>';
            }
          });
          h += '</div>';
        } else if(isEdit && sub.status === 'missing'){
          h += '<div class="fce-hint">Add this on the Fleet tab before its certs can be edited here.</div>';
        } else if(isEdit && sub.status === 'dup'){
          h += '<div class="fce-hint">Multiple drivers in Fleet share this name. Verify which one drove this order, or rename one of them on the Driver tab.</div>';
        }

        h += '</div>';
      });

      h += '</div>';
    });
    }

    /* Footer differs by mode. */
    if(isEdit){
      h += '<div class="fce-actions">'
         + '<button class="fce-btn fce-btn-cancel" data-act="cancel">CANCEL</button>'
         + '<button class="fce-btn fce-btn-save" data-act="save" '+(totalEditable?'':'disabled')+'>\uD83D\uDCBE SAVE TO FLEET' + (totalEditable ? ' ('+totalEditable+')' : '') + '</button>'
         + '</div>';
    } else {
      h += '<div class="fce-actions">'
         + '<button class="fce-btn fce-btn-cancel" data-act="cancel">CLOSE</button>'
         + '</div>';
    }
    h += '</div>';

    var overlay = document.createElement('div');
    overlay.id = 'fcheck-editor';
    overlay.innerHTML = h;
    overlay.addEventListener('click', function(e){
      if(e.target === overlay){ overlay.remove(); return; }
      var act = e.target && e.target.dataset && e.target.dataset.act;
      if(act === 'cancel'){ overlay.remove(); return; }
      if(act === 'save' && isEdit){ _saveEditor(overlay); }
    });
    if(isEdit){
      overlay.addEventListener('input', function(e){
        var t = e.target;
        if(!t.classList || !t.classList.contains('fce-cert-inp')) return;
        var v = t.value.trim();
        t.classList.remove('fce-ok','fce-bad');
        if(!v) return;
        if(typeof parseDate === 'function' && parseDate(v)) t.classList.add('fce-ok');
        else t.classList.add('fce-bad');
      });
    }
    document.body.appendChild(overlay);
  }

  /* Collect changes, validate, write deltas via SC.editBatch, close, recompute.
     Only invoked from the edit-mode popup (paste-time popup never calls it). */
  function _saveEditor(overlay){
    if(typeof SC === 'undefined' || typeof SC.editBatch !== 'function'){
      if(typeof toast === 'function') toast('SC module not ready','er');
      return;
    }
    var changes = [];
    var invalid = 0;
    overlay.querySelectorAll('.fce-subject').forEach(function(subEl){
      var tab = subEl.dataset.tab;
      var rid = subEl.dataset.rid;
      if(!tab || !rid) return;
      subEl.querySelectorAll('.fce-cert-inp').forEach(function(inp){
        var newVal = inp.value.trim();
        var orig   = inp.dataset.orig || '';
        var field  = inp.dataset.field;
        if(!field) return;
        if(newVal === orig) return;        // delta-only
        if(newVal && (typeof parseDate !== 'function' || !parseDate(newVal))){
          invalid++; inp.classList.add('fce-bad');
          return;
        }
        // Normalize to canonical DD/MM/YY (matches storage convention).
        var canon = (typeof normalizeDate === 'function') ? normalizeDate(newVal) : newVal;
        changes.push({ tab: tab, rid: rid, field: field, value: canon });
      });
    });
    if(invalid){
      if(typeof toast === 'function') toast('\u26A0 '+invalid+' invalid date(s) \u2014 fix highlighted inputs','er');
      return;
    }
    if(!changes.length){
      if(typeof toast === 'function') toast('No changes','');
      overlay.remove();
      return;
    }
    SC.editBatch(changes, 'fcheck-fix-expired');
    if(typeof toast === 'function') toast('\u2705 Saved '+changes.length+' cert update(s)','ok');
    overlay.remove();
    setTimeout(function(){ recompute(); }, 50);
  }

  /* Collect changes, validate, write deltas via SC.editBatch, close, recompute. */
  /* ===== Assign warning: returns text for a confirm() dialog, or '' if clean.
     RAM-only; the caller decides whether to block. ===== */
  function assignWarningText(row, stId){
    if(!row) return '';
    var checkDate = new Date();
    if(typeof TP !== 'undefined' && TP.PLAN){
      // Use the plan row's forDate when available.
      var pr = row._oid && TP.PLAN[row._oid] ? TP.PLAN[row._oid] : null;
      if(pr && pr._forDate && typeof parseDate === 'function'){
        checkDate = parseDate(pr._forDate) || new Date();
      }
    }
    var c = checkOrder(row.plate||'', row.rmooc||row.romooc||'', row.driver||'', checkDate);

    var lines = [];
    if(c.missing.length){
      lines.push('\u274C No Fleet data found for: ' + c.missing.join(', '));
    }
    if(c.dupDriver){
      lines.push('\u26A0 Duplicate driver name (' + c.dupDriver + ' matches in Fleet) — verify manually');
    }
    var compact = compactExpired(c.expired);
    if(compact){
      lines.push('\uD83D\uDD34 ' + compact);
    }
    if(!lines.length) return '';

    return '\u26A0 WARNING before assigning to Station ' + stId + ':\n\n'
         + lines.join('\n') + '\n\nContinue assigning anyway?';
  }

  /* ===== Per-station warning text (RAM-only, for the extra card row).
     Returns { level:'exp'|'miss'|'warn'|'', text:'' } or null when clean. ===== */
  var _panelMode = 'today';            // 'today' | 'tomorrow' (tomorrow logic TBD)
  function _modeCheckDate(){
    var d = new Date(); d.setHours(0,0,0,0);
    if(_panelMode === 'tomorrow') d.setDate(d.getDate() + 1);
    return d;
  }
  function setPanelMode(m){
    _panelMode = (m === 'tomorrow') ? 'tomorrow' : 'today';
    try{
      var bt = document.getElementById('fcModeToday'), bm = document.getElementById('fcModeTomorrow');
      if(bt) bt.classList.toggle('on', _panelMode==='today');
      if(bm) bm.classList.toggle('on', _panelMode==='tomorrow');
    }catch(_){}
    recompute();
  }
  function getPanelMode(){ return _panelMode; }

  /* Is this plate present in the Fleet (tank lorry / tractor)? Empty plate
     is treated as "present" (nothing to flag). RAM-only. */
  /* Per-cell fleet/cert warning, filtered for one column (plate / rmooc / driver).
     Returns { blink:bool, badges:'<span>...</span>' } for use inside Tabulator formatters.
     Reads checkOrder() result and filters by subject so a plate-cert problem doesn't
     blink the driver cell and vice-versa. RAM-only, no Firebase access. */
  function cellWarn(row, field){
    const out = { blink:false, badges:'' };
    if(!row || !field) return out;
    const val = String(row[field] || (field==='rmooc' ? row.romooc : '') || '').trim();
    if(!val) return out;

    let plate  = String(row.plate||'').trim();
    let rmooc  = String(row.rmooc||row.romooc||'').trim();
    let driver = String(row.driver||'').trim();

    // For per-field check, isolate inputs so warnings come back tagged.
    const checkDate = _modeCheckDate ? _modeCheckDate() : new Date();
    let c;
    try{
      if(field === 'plate')      c = checkOrder(plate, '',    '',    checkDate);
      else if(field === 'rmooc') c = checkOrder('',    rmooc, '',    checkDate);
      else if(field === 'driver')c = checkOrder('',    '',    driver,checkDate);
      else                       return out;
    }catch(_){ return out; }

    const missing = c.missing || [];
    const expired = c.expired || [];
    const dup     = c.dupDriver || 0;

    const subjLabel = field==='plate' ? 'Vehicle' : field==='rmooc' ? 'Rmooc' : 'Driver';
    const missHit = missing.includes(subjLabel);
    const hasExp  = expired.length > 0;
    const hasDup  = field==='driver' && dup > 0;

    if(missHit){
      out.blink = true;
      out.badges += '<span class="tp-cert-badge miss" title="Not found in Fleet — verify">\u274C</span>';
    }
    if(hasExp){
      out.blink = true;
      const tip = expired.map(e => (e.cert||'')+' expired '+(e.expired||'')).join('\n').replace(/"/g,'&quot;');
      out.badges += '<span class="tp-cert-badge" title="'+tip+'">\uD83D\uDD34 '+expired.length+'</span>';
    }
    if(hasDup){
      out.blink = true;
      out.badges += '<span class="tp-cert-badge dup" title="Duplicate driver name ('+dup+' matches) — verify manually">\u26A0</span>';
    }
    return out;
  }

  function plateInFleet(plate){
    if(!plate || !plate.trim()) return true;
    return !!findVehicle(plate, ['tanklorry','tractor']);
  }

  /* Compact warning badges for one order/row (search results, station, etc.).
     Returns { badges:[{type:'miss'|'exp'|'warn', text}], hasWarn, level }. */
  function orderWarning(row, checkDate){
    var cd = checkDate || _modeCheckDate();
    var c = checkOrder(row.plate||'', row.rmooc||row.romooc||'', row.driver||'', cd);
    var badges = [];
    c.missing.forEach(function(m){ badges.push({ type:'miss', text:'No '+m+' in Fleet' }); });
    var compact = compactExpired(c.expired);
    if(compact) badges.push({ type:'exp', text: compact });
    if(c.dupDriver) badges.push({ type:'warn', text:'Dup driver ('+c.dupDriver+')' });
    var level = badges.some(function(b){ return b.type==='exp'||b.type==='miss'; }) ? 'bad'
              : (badges.length ? 'warn' : '');
    return { badges: badges, hasWarn: badges.length>0, level: level };
  }

  function stationWarning(stationObj){
    if(!stationObj || !stationObj.status || stationObj.status === 'empty') return null;
    var checkDate = _modeCheckDate();   // follows the Today/Tomorrow toggle
    var c = checkOrder(stationObj.plate||'', stationObj.rmooc||stationObj.romooc||'', stationObj.driver||'', checkDate);
    var parts = [], level = '';
    if(c.missing.length){ parts.push('\u274C Missing in Fleet: ' + c.missing.join(', ')); level = 'miss'; }
    var compact = compactExpired(c.expired);
    if(compact){ parts.push('\uD83D\uDD34 ' + compact); level = 'exp'; }
    if(c.dupDriver && !level){ parts.push('\u26A0 Duplicate driver name'); level = 'warn'; }
    else if(c.dupDriver){ parts.push('\u26A0 Duplicate driver name'); }
    if(!parts.length) return null;
    return { level: level, text: parts.join('  ') };
  }

  /* ===== Live recompute (RAM-only): updates the fixed panel. NO popup.
     Debounced so it can be wired to any data-change hook safely. ===== */
  function buildPanelIssues(){
    var issues = [];
    /* Pick which plan dataset to scan based on the panel mode. Tomorrow mode
       reads TMR.PLAN (separate Firebase node plan_tomorrow_); today mode
       reads TP.PLAN. Falling back gracefully if a module isn't loaded. */
    var plan;
    if(_panelMode === 'tomorrow'){
      if(typeof TMR === 'undefined' || !TMR.PLAN) return issues;
      plan = TMR.PLAN;
    } else {
      if(typeof TP === 'undefined' || !TP.PLAN) return issues;
      plan = TP.PLAN;
    }
    var checkDate = _modeCheckDate();   // Today (default) or Tomorrow toggle.
    Object.keys(plan).forEach(function(oid){
      var r = plan[oid];
      if(!r) return;
      if(r._status === 'done' || r._status === 'cancel') return;
      var c = checkOrder(r.plate||'', r.rmooc||'', r.driver||'', checkDate);
      var probs = [];
      c.missing.forEach(function(m){ probs.push({ type:'miss', detail:'Missing in Fleet: '+m }); });
      if(c.dupDriver){ probs.push({ type:'warn', detail:'Duplicate driver name ('+c.dupDriver+' matches)' }); }
      if(c.expired.length){
        var bySubj = {};
        c.expired.forEach(function(w){ var k=w.subject||w.vehicle; (bySubj[k]=bySubj[k]||[]).push(w.cert); });
        for(var k in bySubj){ probs.push({ type:'exp', detail: k+': '+bySubj[k].join(', ') }); }
      }
      if(probs.length){
        issues.push({ no:r.no||'', plate:r.plate||'', rmooc:r.rmooc||'', driver:r.driver||'', customer:r.customer||'', probs:probs });
      }
    });
    return issues;
  }

  function renderPanel(){
    var panel = document.getElementById('scCertList') || document.getElementById('fc-live-panel');
    if(!panel) return;
    var modeLbl = (_panelMode === 'tomorrow') ? 'Tomorrow' : 'Today';
    var issues = buildPanelIssues();
    if(!issues.length){
      panel.innerHTML = '<div class="fc-panel-ok">\u2705 All certs OK vs <b>'+modeLbl+'</b> '
        + '<span class="fc-panel-sub">(RAM only)</span></div>';
      return;
    }
    var nExp = issues.reduce(function(s,i){ return s + i.probs.filter(function(p){return p.type==='exp';}).length; }, 0);
    var nMiss = issues.reduce(function(s,i){ return s + i.probs.filter(function(p){return p.type==='miss';}).length; }, 0);
    var h = '<div class="fc-panel-head">\u26A0 ' + issues.length + ' order(s) \u2014 vs <b>'+modeLbl+'</b>'
          + '<span class="fc-panel-counts">'
          + (nExp ? '<span class="fc-c-exp">\uD83D\uDD34 '+nExp+'</span>' : '')
          + (nMiss ? '<span class="fc-c-miss">\u274C '+nMiss+'</span>' : '')
          + '</span></div>';
    h += '<div class="fc-panel-rows">';
    issues.forEach(function(iss){
      var probHtml = iss.probs.map(function(p){
        var icon = p.type==='exp' ? '\uD83D\uDD34' : (p.type==='miss' ? '\u274C' : '\u26A0');
        return '<span class="fc-prob fc-prob-'+p.type+'">'+icon+' '+esc(p.detail)+'</span>';
      }).join('');
      /* Each row carries its order tuple so the click handler can call openIssueEditor without recomputing. */
      h += '<div class="fc-panel-row" title="Click to fix expired certs" '
         + 'data-no="'+esc(iss.no||'')+'" data-plate="'+esc(iss.plate||'')+'" '
         + 'data-rmooc="'+esc(iss.rmooc||'')+'" data-driver="'+esc(iss.driver||'')+'" '
         + 'data-customer="'+esc(iss.customer||'')+'">'
         + '<span class="fc-pr-no">#'+esc(iss.no)+'</span>'
         + '<span class="fc-pr-plate">'+(iss.plate?esc(iss.plate):'\u2014')+'</span>'
         + '<span class="fc-pr-driver">'+(iss.driver?esc(iss.driver):'\u2014')+'</span>'
         + '<span class="fc-pr-probs">'+probHtml+'</span></div>';
    });
    h += '</div>';
    panel.innerHTML = h;

    /* One delegated click handler per render — replaces the previous one if any. */
    panel.onclick = function(ev){
      var row = ev.target && ev.target.closest && ev.target.closest('.fc-panel-row');
      if(!row || !row.dataset) return;
      /* Scale-side entry → edit mode (user wants to update the expiry on the spot). */
      openIssueEditor([{
        no: row.dataset.no||'', plate: row.dataset.plate||'',
        rmooc: row.dataset.rmooc||'', driver: row.dataset.driver||'',
        customer: row.dataset.customer||''
      }], { mode:'edit' });
    };
  }

  var _recalcTimer = null;
  function recompute(){
    _fidx = null;   /* v4.34.0 — fleet data may have changed: drop the lookup index NOW (sync), re-render later (debounced) */
    if(_recalcTimer) clearTimeout(_recalcTimer);
    _recalcTimer = setTimeout(function(){
      _recalcTimer = null;
      try{ renderPanel(); }catch(_){}
      // Refresh station cards so their warning rows update too.
      try{ if(typeof SCALE !== 'undefined' && SCALE.scRenderCtrl
              && document.getElementById('sub-scale')
              && document.getElementById('sub-scale').classList.contains('on')){
        SCALE.scRenderCtrl();
      } }catch(_){}
    }, 200);
  }

  return {
    normPlate: normPlate,
    checkOrder: checkOrder,
    compactExpired: compactExpired,
    runPasteCheck: runPasteCheck,
    assignWarningText: assignWarningText,
    stationWarning: stationWarning,
    recompute: recompute,
    renderPanel: renderPanel,
    plateInFleet: plateInFleet,
    orderWarning: orderWarning,
    setPanelMode: setPanelMode,
    getPanelMode: getPanelMode,
    cellWarn: cellWarn,
    openIssueEditor: openIssueEditor
  };
})();

/* Per-station warning chip → opens the editor for that station's current order.
   Delegated on the station grid so it works for re-rendered cards too. Station
   card root carries data-st-id="<n>"; we read its plate/rmooc/driver via SCALE. */
document.addEventListener('DOMContentLoaded', function(){
  var grid = document.getElementById('scCtrlGrid');
  if(!grid) return;
  grid.addEventListener('click', function(ev){
    var line = ev.target && ev.target.closest && ev.target.closest('.sc-warn-line.sc-warn-exp,.sc-warn-line.sc-warn-miss');
    if(!line) return;
    var card = line.closest('[data-st-id]');
    if(!card) return;
    var stId = card.dataset.stId;
    var s = (typeof SCALE !== 'undefined' && SCALE.getStation) ? SCALE.getStation(stId) : null;
    if(!s) return;
    ev.stopPropagation();   /* prevent the card body's stEditOpen */
    /* Scale-side entry → edit mode (user wants to update the expiry on the spot). */
    FCHECK.openIssueEditor([{
      no: s.doNum||'', plate: s.plate||'', rmooc: s.rmooc||'',
      driver: s.driver||'', customer: s.customer||''
    }], { mode:'edit' });
  });
});



/* ============================================================
   WGCHECK — Plan ↔ WMS GI cross-check  (ported from V406 diffCheckPlan)
   RAM-only: reads WG.ROWS + TP.PLAN / TMR.PLAN, never writes Firebase.
   Stores per-row result on r._wgWarns = [{code, msg}] | null.
   Codes: NO_DO | DO_NOT_IN_WMS | PLATE_DIFF | CUST_DIFF | QTY_DIFF
   Triggers (wired externally):
     - after TP/TMR paste apply  → runCheck(plan, {toast:true})
     - after WG paste apply      → recheckAllPlans({toast:false})
     - on cell edit (relevant fields) → recheckRow(row)
   ============================================================ */
