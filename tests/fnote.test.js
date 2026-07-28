/* ============================================================
 * tests/fnote.test.js  (v4.81)
 * ------------------------------------------------------------
 * Kiểm tra module FNOTE (sổ ghi chú xe / tài xế):
 *   1) LAZY — mở modal KHÔNG đọc Firebase; chỉ load() mới đọc
 *   2) subjectKind suy ra đúng xe / tài xế / khác
 *   3) lọc theo loại · theo chữ (không dấu) · theo khoảng ngày
 *   4) sắp xếp mới nhất lên trước
 *   5) thêm dòng nháp → save() sinh payload đúng đường dẫn
 *   6) sửa ô → chỉ đẩy delta; sửa về giá trị cũ thì hết dirty
 *   7) dòng nháp thiếu ĐỐI TƯỢNG bị chặn, không ghi gì
 * Chạy:  node tests/fnote.test.js
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- đếm mọi lượt chạm Firebase ---------- */
const fbCalls = { once:0, update:0, on:0 };
let lastPayload = null;
function makeRef(p){
  return {
    once(){ fbCalls.once++; return Promise.resolve({ val: () => FB_STORE }); },
    update(payload){ fbCalls.update++; lastPayload = payload; return Promise.resolve(); },
    on(){ fbCalls.on++; },
    set(){ fbCalls.update++; return Promise.resolve(); }
  };
}
let FB_STORE = {};

/* ---------- DOM tối giản (module chỉ đụng vài id) ---------- */
function fakeEl(){
  return { textContent:'', innerHTML:'', value:'', disabled:false, dataset:{}, style:{display:'none'},
           classList:{ _s:new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
                       toggle(c,on){ on?this._s.add(c):this._s.delete(c); },
                       contains(c){ return this._s.has(c); } },
           focus(){}, onclick:null, querySelector(){ return null; } };
}
const ELS = {};
function getEl(id){ if(!ELS[id]) ELS[id] = fakeEl(); return ELS[id]; }

const sandbox = {
  console, setTimeout, clearTimeout,
  document: {
    getElementById: getEl,
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    addEventListener(){}
  },
  confirm(){ return true; },
  toast(){},
  escapeHtml(s){ return String(s==null?'':s); },
  canWrite(){ return true; },
  closeDelConfirm(){},
  CURRENT_USER: { name:'Hoàng Trung', role:'admin' },
  firebase: { database(){ return { ref:makeRef }; } },
  parseDate(s){
    if(!s) return null;
    let m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(m){ let y=+m[3]; if(y<100) y+=2000; return new Date(y, +m[2]-1, +m[1]); }
    m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(m) return new Date(+m[1], +m[2]-1, +m[3]);
    return null;
  },
  normalizeDate(s){
    const d = sandbox.parseDate(s);
    if(!d) return s||'';
    const p = n => String(n).padStart(2,'0');
    return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(-2);
  },
  DATA: {
    tanklorry:{ a:{ plate:'51D-05867' }, b:{ plate:'51C-11111' } },
    tractor:{},
    rmooc:{ c:{ plate:'51R-2222' } },
    driver:{ d1:{ name:'Nguyễn Văn A' }, d2:{ name:'Trần Văn B' } },
    twavg:{ t1:{ truck:'51C-77777' } }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'fnote.js'), 'utf8')
          + '\n;globalThis.__FNOTE = FNOTE;';
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename:'fnote.js' });
const FN = sandbox.__FNOTE;

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const wait = () => new Promise(r => setTimeout(r, 0));

(async function run(){

console.log('\n1) LAZY — không tự đọc Firebase');
{
  ok('nạp module: 0 lượt đọc', fbCalls.once === 0 && fbCalls.on === 0, fbCalls);
  ok('modal ẩn trước khi mở', getEl('fn-modal').style.display === 'none');
  FN.open();
  ok('mở modal: vẫn 0 lượt đọc', fbCalls.once === 0 && fbCalls.on === 0, fbCalls);
  ok('open() hiện modal không phụ thuộc CSS', getEl('fn-modal').style.display === 'flex');
  FN.close();
  ok('close() ẩn lại bằng inline style', getEl('fn-modal').style.display === 'none');
  FN.open();
  ok('KHÔNG gắn listener on()', fbCalls.on === 0, fbCalls);
  FN.setSearch('abc'); FN.setKind('vehicle'); FN.clearFilters();
  ok('lọc/tìm cũng không đọc Firebase', fbCalls.once === 0, fbCalls);

  FB_STORE = {};
  FN.load();
  await wait();
  ok('bấm TẢI → đúng 1 lượt đọc', fbCalls.once === 1, fbCalls);
}

console.log('\n2) subjectKind');
{
  ok('biển số có trong Fleet → vehicle', FN.subjectKind('51D-05867') === 'vehicle');
  ok('biển rmooc → vehicle',            FN.subjectKind('51R-2222')  === 'vehicle');
  ok('biển chỉ có ở TW AVG → vehicle',  FN.subjectKind('51C-77777') === 'vehicle');
  ok('tên tài xế → driver',             FN.subjectKind('Nguyễn Văn A') === 'driver');
  ok('tên tài xế không dấu/khác hoa thường vẫn nhận',
     FN.subjectKind('  nguyễn văn a ') === 'driver');
  ok('biển lạ đúng dạng VN → vehicle',  FN.subjectKind('61H-12345') === 'vehicle');
  ok('chuỗi lạ → other',                FN.subjectKind('Đội bảo vệ cổng 2') === 'other');
}

console.log('\n3) Lọc');
{
  FN._setRows({
    n1:{ subject:'51D-05867', subjectKind:'vehicle', date:'01/07/26', note:'Van xả bị kẹt', createdAt:1 },
    n2:{ subject:'Nguyễn Văn A', subjectKind:'driver', date:'15/07/26', note:'Quên thẻ ra vào', createdAt:2 },
    n3:{ subject:'51C-11111', subjectKind:'vehicle', date:'20/07/26', note:'Trễ giờ cân', createdAt:3 },
    n4:{ subject:'Đội vệ sinh', subjectKind:'other',  date:'25/07/26', note:'Rửa xe khu B', createdAt:4 }
  });
  FN.clearFilters();
  ok('mặc định thấy đủ 4 dòng', FN._visibleRows().length === 4);

  FN.setKind('vehicle');
  ok('lọc loại Xe → 2 dòng', FN._visibleRows().length === 2, FN._visibleRows().map(r=>r.subject));
  FN.setKind('driver');
  ok('lọc loại Tài xế → 1 dòng', FN._visibleRows().length === 1);
  FN.setKind('all');

  FN.setSearch('51D');
  ok('tìm theo biển số', FN._visibleRows().length === 1 && FN._visibleRows()[0].subject === '51D-05867');
  FN.setSearch('van xa');
  ok('tìm nội dung KHÔNG DẤU vẫn ra', FN._visibleRows().length === 1, FN._visibleRows().map(r=>r.note));
  FN.setSearch('nguyen van a');
  ok('tìm tên tài xế không dấu', FN._visibleRows().length === 1);
  FN.setSearch('');

  FN.setFrom('2026-07-14'); FN.setTo('2026-07-21');
  ok('lọc khoảng ngày → 2 dòng', FN._visibleRows().length === 2, FN._visibleRows().map(r=>r.date));
  FN.clearFilters();
}

console.log('\n4) Sắp xếp');
{
  const order = FN._visibleRows().map(r=>r.date);
  ok('mới nhất lên đầu', order[0] === '25/07/26' && order[order.length-1] === '01/07/26', order);
}

console.log('\n5) Thêm dòng nháp + LƯU');
{
  const before = fbCalls.update;
  FN.addDraft();
  const nid = FN._state().drafts[0]._nid;
  ok('thêm nháp KHÔNG ghi Firebase', fbCalls.update === before, fbCalls);
  ok('nháp mặc định ngày hôm nay', !!FN._state().drafts[0].date);

  FN.onDraft(nid, 'subject', '51C-11111');
  FN.onDraft(nid, 'note',    'Nhà máy nhắc nhở lần 2');
  FN.onDraft(nid, 'date',    '2026-07-28');
  ok('subjectKind tự suy ra', FN._state().drafts[0].subjectKind === 'vehicle');

  FN.save();
  await wait();
  ok('LƯU → đúng 1 lượt update', fbCalls.update === before + 1, fbCalls);
  const p = lastPayload || {};
  const keys = Object.keys(p);
  ok('payload ghi đúng node fleet_notes/<nid>',
     keys.some(k => k === 'fleet_notes/'+nid+'/subject'), keys.slice(0,4));
  ok('ngày lưu dạng DD/MM/YY', p['fleet_notes/'+nid+'/date'] === '28/07/26', p['fleet_notes/'+nid+'/date']);
  ok('có createdBy', p['fleet_notes/'+nid+'/createdBy'] === 'Hoàng Trung');
  ok('có field type để dành', p['fleet_notes/'+nid+'/type'] === '');
  ok('bump version', typeof p['fleet_notes_version'] === 'number');
  ok('nháp được dọn sau khi lưu', FN._state().drafts.length === 0);
  ok('dòng mới vào RAM luôn', !!FN._state().rows[nid]);
}

console.log('\n6) Sửa ô — chỉ đẩy delta');
{
  const before = fbCalls.update;
  FN.onEdit('n1', 'note', 'Van xả đã thay mới');
  ok('đánh dấu dirty, chưa ghi', fbCalls.update === before && !!FN._state().dirty.n1, FN._state().dirty);

  FN.onEdit('n1', 'note', 'Van xả bị kẹt');           /* quay lại giá trị gốc */
  ok('sửa về giá trị cũ → hết dirty', !FN._state().dirty.n1, FN._state().dirty);

  FN.onEdit('n2', 'subject', '51D-05867');
  ok('đổi ĐỐI TƯỢNG cập nhật luôn subjectKind',
     FN._state().dirty.n2 && FN._state().dirty.n2.subjectKind === 'vehicle', FN._state().dirty.n2);

  FN.save();
  await wait();
  const p = lastPayload || {};
  ok('payload CHỈ chứa field đã sửa của n2',
     !!p['fleet_notes/n2/subject'] && !p['fleet_notes/n2/note'], Object.keys(p));
  ok('không đụng tới n1', !Object.keys(p).some(k => k.startsWith('fleet_notes/n1/')), Object.keys(p));
  ok('có dấu vết người sửa', p['fleet_notes/n2/lastBy'] === 'Hoàng Trung');
}

console.log('\n7) Chặn dòng nháp thiếu ĐỐI TƯỢNG');
{
  const before = fbCalls.update;
  FN.addDraft();
  const nid = FN._state().drafts[0]._nid;
  FN.onDraft(nid, 'note', 'Ghi chú chưa gắn với ai');
  FN.save();
  await wait();
  ok('KHÔNG ghi gì lên Firebase', fbCalls.update === before, fbCalls);
  ok('giữ nguyên dòng nháp để sửa', FN._state().drafts.length === 1);

  FN.dropDraft(nid);
  ok('bỏ được dòng nháp', FN._state().drafts.length === 0);

  const b2 = fbCalls.update;
  FN.save();
  await wait();
  ok('không có gì để lưu → không ghi', fbCalls.update === b2);
}

console.log('\n────────────────────────────');
console.log(`PASS ${pass}   FAIL ${fail}`);
console.log('Firebase touches:', JSON.stringify(fbCalls));
process.exit(fail ? 1 : 0);

})();
