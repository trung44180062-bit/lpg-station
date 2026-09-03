/* ============================================================
 * sale-role.test.js — v4.126 · VAI TRÒ "SALE" + THÔNG BÁO ĐỔI KẾ HOẠCH
 *   node tests/sale-role.test.js
 *
 * Kiểm sáu chỗ dễ sai nhất:
 *   A. MATRIX — sale ghi được ĐÚNG hai vùng plan_today/plan_tomorrow,
 *      viewer không ghi được gì, admin/editor giữ nguyên toàn quyền.
 *   B. CỔNG ĐƯỜNG DẪN — canWrite() chỉ chặn chỗ nào có gọi nó; rất nhiều
 *      module ghi thẳng Firebase. mayWritePath() phải chặn mọi node khác
 *      (stations, raw_data, staff, fcst_map…) và cho qua node plan.
 *      ⚠ Bẫy: tên node BẮT ĐẦU giống nhau — "plan_today_backup" KHÔNG
 *      được lọt chỉ vì có tiền tố "plan_today".
 *   C. DẤU VẾT — mọi đường ghi của plan phải kèm lastBy · lastAt · lastRole.
 *   D. GHI NGUYÊN DÒNG — payload không được vừa có "plan_today/X" vừa có
 *      "plan_today/X/lastBy" (Firebase từ chối multi-path chồng cha-con
 *      ⇒ hỏng cả lệnh dán Excel).
 *   E. SINH THÔNG BÁO — chỉ khi lastRole==='sale', bỏ qua khi chính mình
 *      sửa, bỏ qua khi chỉ đổi mỗi lastAt.
 *   F. XÁC NHẬN LÀ MẤT HẲN — ack() xoá khỏi RAM, không ghi Firebase.
 *
 * DOM giả + Firebase giả, KHÔNG cần jsdom.
 * ============================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

process.on('unhandledRejection', e => { console.error('\n💥 unhandledRejection:', e); process.exit(1); });
const _wd = setTimeout(() => { console.error('\n💥 test treo quá 30s'); process.exit(1); }, 30000);
_wd.unref && _wd.unref();

let FAIL = 0;
function ok(cond, name, extra) {
  if (cond) { console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/* ─────────── DOM giả tối thiểu ─────────── */
function mkEl(id) {
  const set = new Set();
  return {
    id, innerHTML: '', textContent: '', value: '', title: '', disabled: true,
    style: {}, dataset: {}, children: [], onclick: null,
    classList: {
      add: c => set.add(c), remove: c => set.delete(c),
      contains: c => set.has(c),
      toggle: (c, on) => { if (on === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else { on ? set.add(c) : set.delete(c); } }
    },
    _cls: set,
    setAttribute() {}, appendChild(c) { this.children.push(c); }, remove() {},
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {},
    getBoundingClientRect() { return { top: 0, bottom: 40, left: 0, right: 900, width: 900, height: 40 }; },
    contains() { return false; }, closest() { return null; },
    insertAdjacentHTML() {}, scrollTo() {}, scrollTop: 0,
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
}

function makeSandbox() {
  const EL = {};
  const doc = {
    body: mkEl('body'),
    head: mkEl('head'),
    getElementById(id) { return EL[id] || (EL[id] = mkEl(id)); },
    createElement(t) { const e = mkEl('new-' + t); e.tag = t; return e; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}
  };
  doc.createElement = function (t) { const e = mkEl('new-' + t); e.tag = t; return e; };
  const sb = {
    console, setTimeout, clearTimeout, Promise, Date, JSON, Math, Object, Array, String, Number, RegExp, Set, Map,
    document: doc, _EL: EL,
    TOASTS: [],
    toast(m, t) { sb.TOASTS.push(String(t || '') + '|' + String(m || '')); }
  };
  sb.window = sb;
  sb.setInterval = setInterval; sb.clearInterval = clearInterval;
  sb.createElement = null;
  return sb;
}

/* ─────────── nạp auth.js với firebase giả ─────────── */
function loadAuth() {
  const sb = makeSandbox();
  const WRITES = [];
  /* Reference giả có prototype thật để installWriteGuard() vá được */
  function Ref(url) { this._url = url; }
  Ref.prototype.toString = function () { return this._url; };
  Ref.prototype.set = function (v) { WRITES.push(['set', this._url, v]); return Promise.resolve('SET'); };
  Ref.prototype.remove = function () { WRITES.push(['remove', this._url]); return Promise.resolve('REMOVE'); };
  Ref.prototype.update = function (v) { WRITES.push(['update', this._url, v]); return Promise.resolve('UPDATE'); };
  Ref.prototype.push = function (v) { WRITES.push(['push', this._url, v]); const r = new Ref(this._url + '/k1'); r.key = 'k1'; return r; };
  Ref.prototype.transaction = function (f) { WRITES.push(['transaction', this._url]); return Promise.resolve('TX'); };
  Ref.prototype.get = function () { return Promise.resolve({ exists: () => false, val: () => null }); };
  const DB = { ref: p => new Ref('https://fake.firebaseio.com/' + String(p == null ? '' : p)) };
  sb.firebase = { database: () => DB, auth: () => ({}) };
  sb.WRITES = WRITES;
  sb.Ref = Ref;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core/auth.js'), 'utf8'), sb, { filename: 'auth.js' });
  return sb;
}

console.log('\n══ A · MATRIX ══');
{
  const sb = loadAuth();
  const M = sb.AUTH.MATRIX;
  ok(M.admin === '*', 'admin vẫn toàn quyền');
  ok(M.editor === '*', 'editor vẫn toàn quyền');
  ok(Array.isArray(M.sale), 'sale là danh sách vùng, không phải "*"');
  ok(M.sale.length === 2 && M.sale.indexOf('plan_today') >= 0 && M.sale.indexOf('plan_tomorrow') >= 0,
     'sale đúng hai vùng plan_today + plan_tomorrow', M.sale);
  ok(Array.isArray(M.viewer) && M.viewer.length === 0, 'viewer không ghi được vùng nào');

  const cw = sb.AUTH.canWrite;
  sb.CURRENT_USER = { role: 'sale', name: 'An' };
  ok(cw('plan_today') === true, 'sale ghi được Today Plan');
  ok(cw('plan_tomorrow') === true, 'sale ghi được Tomorrow Plan');
  ['fleet', 'cust', 'price', 'sap', 'sales', 'eng_tkmix'].forEach(a => {
    ok(cw(a) === false, 'sale KHÔNG ghi được vùng "' + a + '"');
  });
  sb.CURRENT_USER = { role: 'viewer', name: 'Khach' };
  ok(cw('plan_today') === false, 'viewer không ghi được cả Today Plan');
}

console.log('\n══ B · CỔNG ĐƯỜNG DẪN FIREBASE ══');
{
  const sb = loadAuth();
  const may = sb.AUTH.mayWritePath;

  sb.CURRENT_USER = { role: 'sale', name: 'An' };
  ['plan_today/ABC123', 'plan_today/ABC123/qty', 'plan_tomorrow/X1/lastBy',
   'plan_today_version', 'plan_tomorrow_version'].forEach(p => {
    ok(may(p) === true, 'sale ghi được "' + p + '"');
  });
  ['stations/1', 'sc_wait_queue', 'raw_data/r1/qty', 'staff/s1', 'fleet_/tanklorry/r1',
   'fcst_map/50', 'eng_tanklog/1', 'vessel_data/v1', 'cust_alias/x', 'knq_watch/a',
   'plan_today_backup/x', 'plan_todayx/1', 'settings/force_sync_version', ''].forEach(p => {
    ok(may(p) === false, 'sale KHÔNG ghi được "' + (p || '(gốc)') + '"');
  });

  sb.CURRENT_USER = { role: 'admin', name: 'Sep' };
  ok(may('stations/1') === true && may('plan_today/X') === true, 'admin ghi được mọi đường dẫn');
  sb.CURRENT_USER = { role: 'viewer', name: 'Khach' };
  ok(may('plan_today/X') === false && may('stations/1') === false, 'viewer không ghi được đường dẫn nào');
}

console.log('\n══ B2 · GUARD VÁ THẬT VÀO Reference.prototype ══');
{
  const sb = loadAuth();
  sb.CURRENT_USER = { role: 'sale', name: 'An' };
  /* auth.js gọi applyRole('viewer') ngay lúc nạp ⇒ guard đã tự cài sẵn.
     Đây chính là điều cần: chưa đăng nhập cũng KHÔNG ghi được gì. */
  ok(sb.Ref.prototype.__lpgGuard === true, 'guard tự cài ngay lúc nạp auth.js (chưa đăng nhập đã khoá)');
  ok(sb.AUTH.installWriteGuard() === false, 'gọi lại không vá chồng');

  const db = sb.firebase.database();
  const WRITES = sb.WRITES;
  const n0 = WRITES.length;

  return Promise.resolve()
    .then(() => db.ref('plan_today/A1').set({ qty: 20 }))
    .then(r => { ok(r === 'SET', 'sale set được plan_today/A1'); })
    .then(() => db.ref('stations/1').set({ x: 1 }).then(
      () => { ok(false, 'set stations/1 LẼ RA phải bị chặn'); },
      e => { ok(/AUTH_WRITE_DENIED/.test(String(e.message)), 'set stations/1 bị chặn'); }))
    .then(() => db.ref().update({ 'plan_today/A1/qty': 21, 'plan_today_version': 5 }))
    .then(r => { ok(r === 'UPDATE', 'update đa-đường-dẫn toàn node plan được cho qua'); })
    .then(() => db.ref().update({ 'plan_today/A1/qty': 21, 'raw_data/r1/qty': 9 }).then(
      () => { ok(false, 'update lẫn raw_data LẼ RA phải bị chặn'); },
      e => { ok(/raw_data/.test(String(e.message)), 'update lẫn MỘT đường dẫn cấm → chặn CẢ lệnh'); }))
    .then(() => db.ref('raw_data/r1').remove().then(
      () => { ok(false, 'remove raw_data LẼ RA phải bị chặn'); },
      e => { ok(/AUTH_WRITE_DENIED/.test(String(e.message)), 'remove raw_data bị chặn'); }))
    .then(() => {
      const before = WRITES.length;
      const r = db.ref('eng_mix_audit').push({ a: 1 });
      ok(r && r.key === 'k1', 'push bị chặn vẫn trả về Reference có .key (chỗ gọi không nổ)');
      ok(WRITES.filter(w => w[0] === 'push' && w[2] !== undefined).length === 0,
         'push bị chặn KHÔNG ghi giá trị nào');
      /* admin thì qua */
      sb.CURRENT_USER = { role: 'admin', name: 'Sep' };
      return db.ref('stations/1').set({ x: 1 });
    })
    .then(r => { ok(r === 'SET', 'đổi sang admin thì guard cho qua ngay (không cần F5)'); })
    .then(() => { ok(n0 <= WRITES.length, 'sổ ghi giả có nhận lệnh'); })
    .then(runPlanTests);
}

/* ─────────── nạp plan.js (chỉ lấy factory) ─────────── */
function loadPlan(role, name) {
  const sb = makeSandbox();
  const PUSHED = [];
  sb.PUSHED = PUSHED;
  sb.CURRENT_USER = { role: role, name: name, email: name + '@x.vn' };
  sb.canWrite = () => true;
  sb.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  sb.performance = { now: () => 0 };
  sb.requestAnimationFrame = fn => setTimeout(fn, 0);
  sb.escapeHtml = s => String(s == null ? '' : s);
  sb.normalizeDate = v => v;
  sb.cleanDO = v => String(v || '').replace(/^0+/, '');
  sb.logAudit = () => {};
  sb.firebase = { database: () => ({ ref: p => (p === undefined ? {
      update(pay) { PUSHED.push(pay); return Promise.resolve(); }
    } : { on() {}, off() {}, once: () => Promise.resolve({ val: () => null, exists: () => false }) }) }) };
  /* SALENOTIF giả — ghi lại thông báo được đẩy vào */
  sb.NOTIFIED = [];
  sb.SALENOTIF = { push(it) { sb.NOTIFIED.push(it); return 'id'; } };
  vm.createContext(sb);
  /* `const TP` ở đầu file không tự thành thuộc tính của sandbox — nối thêm 2 dòng */
  const src = fs.readFileSync(path.join(ROOT, 'js/features/plan.js'), 'utf8')
            + '\n;window.TP = TP; window.TMR = TMR;\n';
  vm.runInContext(src, sb, { filename: 'plan.js' });
  return sb;
}

function runPlanTests() {
  console.log('\n══ C · DẤU VẾT: AI · LÚC NÀO · VAI TRÒ ══');
  const sb = loadPlan('sale', 'An');
  const TP = sb.TP;

  /* mọi đường ghi dùng chung _stampWho */
  {
    TP.PLAN['A1'] = { _oid: 'A1', customer: 'KNH', qty: '20' };
    const pay = {};
    TP._stampWho(pay, 'A1', 1700000000000);
    ok(pay['plan_today/A1/lastBy'] === 'An', 'lastBy ghi tên người sửa');
    ok(pay['plan_today/A1/lastAt'] === 1700000000000, 'lastAt ghi mốc thời gian');
    ok(pay['plan_today/A1/lastRole'] === 'sale', 'lastRole ghi VAI TRÒ (mới v4.126)');
    ok(TP.PLAN['A1'].lastRole === 'sale', 'dòng trong RAM cũng mang dấu vết');
  }

  /* đếm số chỗ gọi trong mã: không được sót đường ghi nào */
  {
    const src = fs.readFileSync(path.join(ROOT, 'js/features/plan.js'), 'utf8');
    const stampCalls = (src.match(/_stampWho\(payload/g) || []).length;
    ok(stampCalls >= 6, 'mọi đường ghi (edit ô · applyDiff · autoSync · status · link · _writeField) đều đóng dấu', stampCalls);
    ok(!/payload\[`\$\{FBN\}\$\{oid\}\/lastBy`\]\s*=\s*CURRENT_USER/.test(src),
       'không còn chỗ nào chép tay lastBy (đã gom về _stampWho)');
    ok(/cloned\.lastRole/.test(src), 'promote Tomorrow→Today cũng gắn lastRole');
  }

  console.log('\n══ D · GHI NGUYÊN DÒNG KHÔNG ĐƯỢC CHỒNG CHA-CON ══');
  {
    const row = TP._stampRow({ _oid: 'B9', customer: 'ABC' }, 1700000000001);
    ok(row.lastBy === 'An' && row.lastRole === 'sale' && row.lastAt === 1700000000001,
       '_stampRow đóng dấu THẲNG vào object dòng');
    const src = fs.readFileSync(path.join(ROOT, 'js/features/plan.js'), 'utf8');
    const i = src.indexOf('diff.added.forEach');
    const seg = src.slice(i, i + 500);
    ok(/_stampRow\(sanitizeForStorage/.test(seg),
       'dòng thêm mới đóng dấu bằng _stampRow, KHÔNG tách path con');
    ok(!/_stampWho\(payload, nr\._oid\)/.test(src),
       '⚠ bẫy Firebase: không có payload vừa "plan_today/X" vừa "plan_today/X/lastBy"');
  }

  console.log('\n══ E · LUẬT SINH THÔNG BÁO ══');
  {
    const base = { _oid: 'A1', doNum: '8612345', customer: 'KNH', plate: '51C-123', qty: '20' };

    /* E1 — người sửa là sale, mình là nhân viên cân → CÓ báo */
    const cân = loadPlan('editor', 'Cân');
    const prev = Object.assign({}, base, { lastBy: 'An', lastRole: 'sale', lastAt: 1 });
    const next = Object.assign({}, base, { qty: '24', lastBy: 'An', lastRole: 'sale', lastAt: 2 });
    ok(cân.TP._saleNotify('edit', 'A1', prev, next) === true, 'sale sửa → máy nhân viên cân có thông báo');
    const it = cân.NOTIFIED[0];
    ok(it && it.who === 'An', 'thông báo ghi rõ AI sửa', it && it.who);
    ok(it && it.table === 'Today Plan', 'thông báo ghi rõ BẢNG nào');
    ok(it && it.fields.length === 1 && it.fields[0].field === 'qty',
       'thông báo liệt kê ĐÚNG trường đã đổi', it && it.fields);
    ok(it && it.fields[0].old === '20' && it.fields[0]['new'] === '24', 'kèm giá trị cũ → mới');

    /* E2 — người sửa là admin → KHÔNG báo */
    const c2 = loadPlan('editor', 'Cân');
    const p2 = Object.assign({}, base, { lastBy: 'Sep', lastRole: 'admin', lastAt: 1 });
    const n2 = Object.assign({}, base, { qty: '30', lastBy: 'Sep', lastRole: 'admin', lastAt: 2 });
    ok(c2.TP._saleNotify('edit', 'A1', p2, n2) === false, 'admin sửa → KHÔNG bắn thông báo sale');
    ok(c2.NOTIFIED.length === 0, 'không có thông báo nào lọt ra');

    /* E3 — chính người sale đó không tự báo cho mình */
    const c3 = loadPlan('sale', 'An');
    ok(c3.TP._saleNotify('edit', 'A1', prev, next) === false, 'sale không tự báo cho chính mình');

    /* E3b — nhưng máy của sale KHÁC thì vẫn báo */
    const c3b = loadPlan('sale', 'Binh');
    ok(c3b.TP._saleNotify('edit', 'A1', prev, next) === true, 'sale khác vẫn nhận được thông báo');

    /* E4 — chỉ đổi mỗi lastAt (ghi lại y nguyên) → KHÔNG báo */
    const c4 = loadPlan('editor', 'Cân');
    const same = Object.assign({}, base, { lastBy: 'An', lastRole: 'sale', lastAt: 999 });
    ok(c4.TP._saleNotify('edit', 'A1', prev, same) === false, 'không có trường nghiệp vụ nào đổi → im lặng');

    /* E5 — thêm dòng / xoá dòng */
    const c5 = loadPlan('editor', 'Cân');
    ok(c5.TP._saleNotify('add', 'A9', null, Object.assign({}, base, { _oid: 'A9', lastBy: 'An', lastRole: 'sale' })) === true,
       'sale THÊM dòng → có thông báo');
    ok(c5.TP._saleNotify('del', 'A1', prev, null) === true, 'sale XOÁ dòng → có thông báo (đọc dòng cũ)');
    ok(c5.NOTIFIED[0].kind === 'add' && c5.NOTIFIED[1].kind === 'del', 'phân biệt đúng add / del');

    /* E6 — Tomorrow Plan cũng chạy */
    const c6 = loadPlan('editor', 'Cân');
    ok(c6.TMR._saleNotify('edit', 'A1', prev, next) === true, 'Tomorrow Plan cũng sinh thông báo');
    ok(c6.NOTIFIED[0].table === 'Tomorrow Plan', 'ghi đúng tên bảng Tomorrow Plan');

    /* E7 — đợt replay lúc mở app không được bắn thông báo */
    const src = fs.readFileSync(path.join(ROOT, 'js/features/plan.js'), 'utf8');
    ok(/_replayDone && !prev/.test(src), 'child_added chỉ báo khi dòng THẬT SỰ mới và đã qua đợt replay');
    ok((src.match(/if\(_replayDone\)/g) || []).length >= 2, 'child_changed / child_removed cũng chờ hết replay');
  }

  console.log('\n══ F · XÁC NHẬN LÀ MẤT HẲN, KHÔNG ĐỤNG FIREBASE ══');
  {
    const sb2 = makeSandbox();
    ['snf-float', 'snf-modal', 'snf-body', 'snf-cnt', 'scNotifSaleBadge', 'scNotifSaleBtn']
      .forEach(id => { sb2._EL[id] = mkEl(id); });
    sb2.firebase = { database() { throw new Error('SALENOTIF KHÔNG ĐƯỢC ĐỤNG FIREBASE'); } };
    vm.createContext(sb2);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/integrations/salenotify.js'), 'utf8'), sb2, { filename: 'salenotify.js' });
    const S = sb2.SALENOTIF;
    S.init();
    ok(sb2._EL['scNotifSaleBtn'].disabled === false, 'nút 📨 được mở khoá (bỏ disabled từ thời "coming soon")');

    const id1 = S.push({ table: 'Today Plan', kind: 'edit', oid: 'A1', who: 'An', doNum: '8612345',
                         cust: 'KNH', plate: '51C-123', fields: [{ field: 'qty', label: 'Qty', old: '20', 'new': '24' }] });
    const id2 = S.push({ table: 'Tomorrow Plan', kind: 'add', oid: 'A2', who: 'An' });
    ok(S.count() === 2, 'hai thông báo nằm trong danh sách');
    ok(sb2._EL['scNotifSaleBadge'].textContent === 2, 'badge trên nút hiện số 2', sb2._EL['scNotifSaleBadge'].textContent);

    ok(S.ack(id1) === true, 'bấm ✓ Confirm xoá được');
    ok(S.count() === 1, 'xác nhận rồi thì MẤT HẲN, không quay lại');
    ok(S.ack(id1) === false, 'xác nhận lần hai không xoá thêm gì');
    ok(S.ackAll() === 1, '✓ Confirm all dọn nốt phần còn lại');
    ok(S.count() === 0, 'danh sách sạch');
    ok(sb2._EL['scNotifSaleBadge'].style.display === 'none', 'hết thông báo thì badge ẩn đi');
    ok(id2 !== id1, 'mỗi thông báo một id riêng');

    /* trần giữ */
    for (let i = 0; i < 80; i++) S.push({ table: 'Today Plan', kind: 'edit', oid: 'X' + i, who: 'An' });
    ok(S.count() === 60, 'giữ tối đa 60 thông báo, không phình RAM vô hạn', S.count());
  }

  console.log('\n══ G · GIAO DIỆN TIẾNG ANH (luật chung của V4) ══');
  {
    const src = fs.readFileSync(path.join(ROOT, 'js/integrations/salenotify.js'), 'utf8');
    /* chỉ soi chuỗi trong innerHTML / textContent / title — chú thích vẫn tiếng Việt */
    const shown = [];
    src.replace(/innerHTML\s*=\s*([\s\S]*?);\n/g, (m, g) => { shown.push(g); return m; });
    const diac = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
    const bad = shown.filter(s => diac.test(s));
    ok(bad.length === 0, 'không có chữ tiếng Việt lọt vào chuỗi hiển thị', bad.slice(0, 1));
  }

  console.log('\n' + (FAIL ? '❌ ' + FAIL + ' mục SAI' : '✅ TẤT CẢ ĐỀU ĐÚNG'));
  process.exit(FAIL ? 1 : 0);
}
