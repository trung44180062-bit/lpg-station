/* ============================================================
 * SALENOTIF  —  salenotify.js        ★ MODULE MỚI (v4.126)
 * ------------------------------------------------------------
 * Thông báo "tài khoản SALE vừa đổi Today Plan / Tomorrow Plan".
 *
 * ĐƯỜNG ĐI CỦA MỘT THÔNG BÁO
 *   Máy A (sale) sửa dòng plan → plan.js đóng dấu lastBy/lastAt/lastRole vào
 *   CHÍNH dòng đó rồi ghi Firebase như cũ.
 *   Máy B (nhân viên cân) đang nghe sẵn child_added/changed/removed của
 *   plan_today/ · plan_tomorrow/ → thấy lastRole==='sale' thì TỰ SINH thông báo
 *   ngay tại chỗ và gọi SALENOTIF.push().
 *
 * ⚠ KHÔNG CÓ NODE FIREBASE NÀO CHO THÔNG BÁO. Danh sách thông báo sống trong
 *   RAM của từng máy:
 *     · nổi lên góc phải ~5 giây (mọi trang, không riêng tab Scale)
 *     · sau đó nằm trong nút 📨 Sale Notification ở tab Sales ▸ Scale
 *     · bấm ✓ Confirm là XOÁ HẲN trên máy đó, không quay lại
 *     · F5 / đóng tab là sạch — đúng yêu cầu "không lưu trữ".
 *
 * Global xuất ra : window.SALENOTIF
 * Khởi tạo (boot): SALENOTIF.init() — trước SCALE để nút có sẵn trạng thái.
 * Phụ thuộc      : không. (toast/CURRENT_USER chỉ dùng nếu có.)
 * ============================================================ */
window.SALENOTIF = (function () {
  'use strict';

  var MAX_KEEP  = 60;     // giữ tối đa bấy nhiêu thông báo chưa xác nhận
  var FLOAT_MS  = 5000;   // thời gian nổi trên màn hình
  var FADE_MS   = 260;    // thời gian trượt ra

  var _items = [];        // [{id, table, area, kind, oid, who, at, doNum, cust, plate, fields[]}]
  var _seq   = 0;
  var _panelOpen = false;

  /* ---------- tiện ích ---------- */
  function _esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function _hhmm(ts) {
    try {
      var d = new Date(ts || Date.now()), p = function (n) { return ('0' + n).slice(-2); };
      return p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (_) { return '--:--'; }
  }
  function _kindIco(k) { return k === 'add' ? '➕' : (k === 'del' ? '🗑' : '✏'); }
  function _kindWord(k) { return k === 'add' ? 'added' : (k === 'del' ? 'deleted' : 'edited'); }

  /* Dòng tiêu đề: "SALES · An edited Today Plan · 14:07" */
  function _headline(it) {
    return _esc(it.who || 'sale') + ' ' + _kindWord(it.kind) + ' ' + _esc(it.table || 'plan');
  }
  /* Dòng nhận dạng đơn hàng */
  function _subject(it) {
    var bits = [];
    if (it.doNum) bits.push('DO ' + it.doNum);
    if (it.cust)  bits.push(it.cust);
    if (it.plate) bits.push(it.plate);
    if (!bits.length) bits.push(it.oid || '—');
    return _esc(bits.join(' · '));
  }
  /* Danh sách trường đã đổi: "Qty 20 → 24" */
  function _fieldsHtml(it) {
    if (!it.fields || !it.fields.length) return '';
    return '<div class="snf-flds">' + it.fields.map(function (f) {
      return '<div class="snf-fld"><b>' + _esc(f.label || f.field) + '</b>' +
             '<span class="snf-o">' + (f.old ? _esc(f.old) : '(empty)') + '</span>' +
             '<span class="snf-ar">→</span>' +
             '<span class="snf-n">' + (f['new'] ? _esc(f['new']) : '(empty)') + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- API chính ---------- */
  function push(raw) {
    if (!raw) return null;
    var it = {
      id    : 'sn' + (++_seq) + '-' + Date.now(),
      table : raw.table || 'Plan',
      area  : raw.area  || '',
      kind  : raw.kind  || 'edit',
      oid   : raw.oid   || '',
      who   : raw.who   || 'sale',
      at    : raw.at    || Date.now(),
      doNum : raw.doNum || '',
      cust  : raw.cust  || '',
      plate : raw.plate || '',
      fields: Array.isArray(raw.fields) ? raw.fields : []
    };
    _items.unshift(it);
    if (_items.length > MAX_KEEP) _items.length = MAX_KEEP;
    _float(it);
    refresh();
    return it.id;
  }

  function ack(id) {
    var n = _items.length;
    _items = _items.filter(function (x) { return x.id !== id; });
    /* thông báo đang nổi cũng biến mất luôn cho khỏi lệch */
    try {
      var el = document.getElementById('snf-f-' + id);
      if (el) _fadeOut(el);
    } catch (_) {}
    refresh();
    return _items.length < n;
  }

  function ackAll() {
    var n = _items.length;
    _items = [];
    try {
      var host = document.getElementById('snf-float');
      if (host) Array.prototype.slice.call(host.children).forEach(_fadeOut);
    } catch (_) {}
    refresh();
    return n;
  }

  function list() { return _items.slice(); }
  function count() { return _items.length; }

  /* ---------- nút + badge ở tab Scale ---------- */
  function refresh() {
    var n = _items.length;
    try {
      var badge = document.getElementById('scNotifSaleBadge');
      var btn   = document.getElementById('scNotifSaleBtn');
      if (badge) {
        badge.textContent = n;
        badge.style.display = n > 0 ? '' : 'none';
      }
      if (btn) {
        btn.disabled = false;
        btn.classList.toggle('has-notif', n > 0);
        btn.title = n > 0
          ? (n + ' plan change(s) from Sales waiting for confirmation')
          : 'Sale notifications — plan changes made by Sales accounts';
      }
    } catch (_) {}
    if (_panelOpen) _renderPanel();
  }

  /* ---------- thông báo NỔI (5 giây) ---------- */
  function _floatHost() {
    var h = document.getElementById('snf-float');
    if (!h) {
      h = document.createElement('div');
      h.id = 'snf-float';
      document.body.appendChild(h);
    }
    return h;
  }
  function _fadeOut(el) {
    if (!el || el.__snfOut) return;
    el.__snfOut = true;
    el.classList.add('out');
    setTimeout(function () { try { el.remove(); } catch (_) {} }, FADE_MS);
  }
  function _float(it) {
    var host, card;
    try { host = _floatHost(); } catch (_) { return; }
    card = document.createElement('div');
    card.className = 'snf-card k-' + it.kind;
    card.id = 'snf-f-' + it.id;
    card.innerHTML =
      '<div class="snf-top">' +
        '<span class="snf-ico">' + _kindIco(it.kind) + '</span>' +
        '<span class="snf-hd">' + _headline(it) + '</span>' +
        '<span class="snf-t">' + _hhmm(it.at) + '</span>' +
        '<button class="snf-ok" title="Confirm — remove this notification">✓</button>' +
      '</div>' +
      '<div class="snf-sub">' + _subject(it) + '</div>' +
      _fieldsHtml(it);
    var ok = card.querySelector('.snf-ok');
    if (ok) ok.onclick = function () { ack(it.id); };
    host.appendChild(card);
    /* Chỉ giữ tối đa 4 tấm nổi cùng lúc cho khỏi che màn hình.
       ⚠ BẪY: _fadeOut() chỉ gắn class rồi 260ms sau mới gỡ khỏi DOM, nên
       "while (host.children.length > 4)" là VÒNG LẶP VÔ TẬN — số con không
       giảm ngay. Phải đếm trên danh sách CHỤP SẴN và bỏ qua tấm đang trượt ra. */
    var live = Array.prototype.filter.call(host.children, function (c) { return !c.__snfOut; });
    while (live.length > 4) _fadeOut(live.shift());
    setTimeout(function () { _fadeOut(card); }, FLOAT_MS);
  }

  /* ---------- bảng thông báo (mở từ nút 📨) ---------- */
  function _panel() {
    var el = document.getElementById('snf-modal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'snf-modal';
    el.className = 'snf-modal-bg';
    el.innerHTML =
      '<div class="snf-modal">' +
        '<div class="snf-hdr">' +
          '<span class="snf-ttl">📨 Sale Notifications</span>' +
          '<span class="snf-cnt" id="snf-cnt">0</span>' +
          '<button class="snf-x" id="snf-x" title="Close">✕</button>' +
        '</div>' +
        '<div class="snf-body" id="snf-body"></div>' +
        '<div class="snf-foot">' +
          '<span class="snf-hint">Confirmed notifications are deleted for good — nothing is stored on the server.</span>' +
          '<button class="snf-ackall" id="snf-ackall">✓ Confirm all</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.onclick = function (ev) { if (ev.target === el) close(); };
    var x = el.querySelector('#snf-x');       if (x) x.onclick = close;
    var a = el.querySelector('#snf-ackall');  if (a) a.onclick = function () { ackAll(); };
    return el;
  }

  function _renderPanel() {
    var body = document.getElementById('snf-body');
    var cnt  = document.getElementById('snf-cnt');
    if (cnt) cnt.textContent = _items.length;
    if (!body) return;
    if (!_items.length) {
      body.innerHTML = '<div class="snf-empty">No plan changes from Sales.</div>';
      return;
    }
    body.innerHTML = _items.map(function (it) {
      return '<div class="snf-row k-' + it.kind + '" data-id="' + _esc(it.id) + '">' +
               '<div class="snf-top">' +
                 '<span class="snf-ico">' + _kindIco(it.kind) + '</span>' +
                 '<span class="snf-hd">' + _headline(it) + '</span>' +
                 '<span class="snf-t">' + _hhmm(it.at) + '</span>' +
                 '<button class="snf-ok" data-ack="' + _esc(it.id) + '" title="Confirm — remove this notification">✓ Confirm</button>' +
               '</div>' +
               '<div class="snf-sub">' + _subject(it) + '</div>' +
               _fieldsHtml(it) +
             '</div>';
    }).join('');
    Array.prototype.slice.call(body.querySelectorAll('[data-ack]')).forEach(function (b) {
      b.onclick = function () { ack(b.getAttribute('data-ack')); };
    });
  }

  function open() {
    _panel().classList.add('on');
    _panelOpen = true;
    _renderPanel();
  }
  function close() {
    var el = document.getElementById('snf-modal');
    if (el) el.classList.remove('on');
    _panelOpen = false;
  }

  function init() {
    refresh();
    /* Nút 📨 trong markup vốn để disabled từ thời "coming soon" — mở khoá. */
    try {
      var btn = document.getElementById('scNotifSaleBtn');
      if (btn) { btn.disabled = false; btn.onclick = open; }
    } catch (_) {}
  }

  return {
    init: init, push: push, ack: ack, ackAll: ackAll,
    open: open, close: close, refresh: refresh,
    list: list, count: count,
    get items() { return _items.slice(); }
  };
})();
