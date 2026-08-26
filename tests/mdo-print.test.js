/* ═══════════════════════════════════════════════════════════════════════
   v4.110 — MULTI-DO: hỏi & in GỘP / TÁCH (PTT + phiếu cân DN)
     node tests/mdo-print.test.js         (cwd = lpg-station-v4-modular)

   Người dùng báo chức năng "hoạt động không ổn định". Bốn nguyên nhân đã
   tìm ra, mỗi cái một mục test canh ở đây:
     [1] Hộp hỏi được vẽ vào ô kết quả tìm kiếm của trạm (#sc-res-N) nên bị
         handler click-outside VÀ scRenderCtrl() ghi đè bất cứ lúc nào.
     [2] Danh sách chia số per-DO chỉ nằm trong RAM ⇒ F5 hay đổi máy là câu
         hỏi "gộp hay tách" biến mất, phần mềm âm thầm in một phiếu gộp.
     [3] Turn đã chốt cũng chỉ nằm trong RAM ⇒ sau F5 sinh dòng TL TRÙNG và
         DN in sai ô "Số trạm".
     [4] Cách in chọn lúc assign không được nhớ ⇒ phiếu DN mặc định ngược
         với phiếu PTT đã đưa tài xế; và một cú bấm trượt ra nền là mất
         luôn phiếu DN.
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const SC  = fs.readFileSync('js/features/scale.js', 'utf8');
const PE  = fs.readFileSync('js/integrations/ptt-early.js', 'utf8');

function grab(src, name){
  const i = src.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('không tìm thấy ' + name);
  let d = 0;
  for(let k = src.indexOf('{', i); k < src.length; k++){
    if(src[k] === '{') d++;
    else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k + 1); }
  }
  throw new Error('không đóng ngoặc: ' + name);
}
/* Lấy nguyên thân một hàm dưới dạng CHUỖI để soi mã (test hồi quy nguồn). */
function body(src, name){ return grab(src, name); }

let fail = 0;
function ok(label, cond, extra){
  if(cond) console.log('  ✓ ' + label);
  else { fail++; console.log('  ✗ ' + label + (extra ? '  →  ' + extra : '')); }
}
function eq(label, got, want){ ok(label, got === want, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }

/* ─── môi trường giả tối thiểu cho các hàm được trích ─── */
global.document = { getElementById:()=>null };
global.toast = ()=>{};
global.console.warn = ()=>{};
global._mdNormDO = d => String(d==null?'':d).replace(/[,\s]/g,'').replace(/^0+/,'').trim();
global._pfDeriveType = t => String(t||'');
global.CT = { lookup:v=>String(v||''), wmsName:v=>String(v||'') };
global.DB_SC = { stations:{} };
let _displayTurn = 5;
global.getDisplayTurn = ()=>_displayTurn;
const _tlTurnFreeze = {};
eval(grab(SC, '_tlFreezeTurn'));
eval(grab(SC, '_mdoGroupKey'));   /* v4.112 — khoá nhóm multi-DO ghi xuống TL */
eval(grab(SC, '_mdoBuildPayloadFor'));
eval(grab(SC, '_mdoMaxTol'));
const _mdoPayloadsByStation = {};
eval(grab(SC, '_mdoPayloads'));
eval(grab(SC, '_mdoPrintPref'));
eval(grab(SC, '_techCarry'));

/* ══════════════════════════════════════════════════════════════ */
console.log('\n── 1. Hộp hỏi phải là MODAL THẬT, không nằm trong dropdown tìm kiếm ──');
{
  const popup = body(SC, '_mdoShowPopup');
  const lnk   = body(SC, '_lnkPttAsk');
  ok('popup dò tìm dựng qua _mdoModal', /_mdoModal\(/.test(popup));
  ok('popup dò tìm KHÔNG còn vẽ vào #sc-res-N', !/_getOrCreateRes\(/.test(popup), 'vẫn còn _getOrCreateRes');
  ok('popup nhóm đã link dựng qua _mdoModal', /_mdoModal\(/.test(lnk));
  ok('popup nhóm đã link KHÔNG còn vẽ vào #sc-res-N', !/_getOrCreateRes\(/.test(lnk), 'vẫn còn _getOrCreateRes');
  const modal = body(SC, '_mdoModal');
  ok('modal gắn thẳng vào <body> (ngoài vùng scRenderCtrl vẽ lại)', /document\.body\.appendChild/.test(modal));
  ok('modal KHÔNG tự đóng khi bấm ra nền', !/addEventListener\('click'/.test(modal));
  /* hộp chọn phiếu DN cũng vậy */
  const pc = body(PE, '_mdoPrintChoice');
  ok('hộp chọn phiếu DN bỏ đóng-khi-bấm-nền', !/if\(e\.target===bg\)\s*close\(\)/.test(pc),
     'còn listener đóng khi bấm nền — một cú bấm trượt là mất phiếu');
}

console.log('\n── 2. Cả HAI đường assign đều hỏi cách in (không còn lúc hỏi lúc không) ──');
{
  const popup = body(SC, '_mdoShowPopup');
  const lnk   = body(SC, '_lnkPttAsk');
  ok('đường dò tìm có 2 nút chọn cách in', /_mdoPrintBtns\(/.test(popup));
  ok('đường đã link có 2 nút chọn cách in', /_mdoPrintBtns\(/.test(lnk));
  const btns = body(SC, '_mdoPrintBtns');
  ok('hai nút gọi cùng một hàm mdoAssign', (btns.match(/SCALE\.mdoAssign\(/g)||[]).length === 2);
  ok('nút combined và separate đều có mặt',
     /'combined'/.test(btns) && /'separate'/.test(btns));
  const asg = body(SC, 'mdoAssign');
  ok('mdoAssign ghi cách in lên trạm (_pttMode)', /_pttMode:\s*pm/.test(asg));
  ok('mdoAssign chỉ mở bảng in khi trạm THẬT SỰ nhận', /okAssigned/.test(asg));
  ok('cờ chặn PTT tự mở đi theo DÒNG, không phải biến toàn cục',
     /_noAutoPtt:\s*\(pm === 'separate'\)/.test(asg) && !/_scNoAutoPtt/.test(SC));
  ok('scAssignToStation đọc cờ từ row', /const _noAutoPtt = !!row\._noAutoPtt/.test(SC));
}

console.log('\n── 3. Chia số per-DO phải sống sót qua F5 / sang máy khác ──');
{
  const save = body(SC, 'mdoAllocSave');
  ok('mdoAllocSave lưu _mdoNets lên trạm', /_mdoNets:\s*netsSaved/.test(save));
  ok('mdoAllocSave lưu _tlTurn lên trạm', /_tlTurn:\s*String\(comboTurn\)/.test(save));
  ok('mdoAllocSave chặn dòng không có số DO', /No DO number on row/.test(save));

  /* dựng lại thật: giả lập vừa F5 xong — RAM trống, chỉ còn số trên trạm */
  const cur = {
    plate:'51C-111.11', rmooc:'51R-9', driver:'NAM', customer:'ACME',
    tank:'TK-3501', batch:'LPG-2026-07', type:'50:50',
    _multiDO:true,
    _linkedRows:[
      { doNum:'8651943', customer:'ACME', qty:'10', type:'50:50' },
      { doNum:'8651944', customer:'BETA', qty:'15', type:'50:50' }
    ],
    tech:{ _mdoAllocated:true, _tlTurn:'3',
      _mdoNets:[ { doNo:'8651943', net:10000, truckWt:15000, grossWt:25000 },
                 { doNo:'8651944', net:15000, truckWt:25000, grossWt:40000 } ] }
  };
  DB_SC.stations[2] = cur;
  const pls = _mdoPayloads(2, cur, cur.tech);
  ok('dựng lại được danh sách per-DO khi RAM trống', Array.isArray(pls) && pls.length === 2,
     'got ' + (pls ? pls.length : pls));
  eq('DO thứ nhất đúng',        pls[0].doNo,    '8651943');
  eq('net thứ nhất đúng',       pls[0].lpgQty,  '10000');
  eq('DO thứ hai đúng',         pls[1].doNo,    '8651944');
  eq('net thứ hai đúng',        pls[1].lpgQty,  '15000');
  eq('truck của DO2 = gross DO1 (cân dồn)', pls[1].truckWt, '25000');
  eq('cả hai dòng dùng CHUNG turn đã lưu (không phải turn tính lại)', pls[0].turn + '/' + pls[1].turn, '3/3');

  /* số đã lưu lệch thứ tự DO ⇒ thà KHÔNG dựng còn hơn in nhầm khách */
  delete _mdoPayloadsByStation[2];
  const bad = JSON.parse(JSON.stringify(cur));
  bad.tech._mdoNets[0].doNo = '9999999';
  DB_SC.stations[3] = bad;
  ok('số lưu lệch DO ⇒ trả null, không dựng bừa', _mdoPayloads(3, bad, bad.tech) === null);

  /* thiếu hẳn số đã lưu ⇒ null, và chỗ gọi phải BÁO chứ không im lặng */
  delete _mdoPayloadsByStation[4];
  const noNets = { _multiDO:true, _linkedRows:cur._linkedRows, tech:{ _mdoAllocated:true } };
  DB_SC.stations[4] = noNets;
  ok('không có số đã lưu ⇒ trả null', _mdoPayloads(4, noNets, noNets.tech) === null);
  ok('chỗ gọi báo rõ khi không in tách được',
     /Per-DO weights are missing/.test(SC), 'vẫn âm thầm in gộp');
}

console.log('\n── 4. Turn đã chốt phải đọc lại từ trạm sau F5 ──');
{
  DB_SC.stations[1] = { tech:{ _tlTurn:'7' } };
  _displayTurn = 9;                      /* tính lại sẽ ra 9 — sai */
  eq('lấy turn đã lưu (7), không lấy số tính lại (9)', _tlFreezeTurn(1), 7);
  DB_SC.stations[2] = { tech:{} };
  delete _tlTurnFreeze[2];
  eq('chưa có gì lưu thì mới tính từ getDisplayTurn', _tlFreezeTurn(2), 9);
  /* _techRead() dựng object MỚI ⇒ mọi trường phần mềm tự đặt phải được chép lại */
  DB_SC.stations[8] = { tech:{ _mdoAllocated:true, _tlTurn:'4',
    _mdoNets:[{doNo:'1',net:1,truckWt:1,grossWt:2}] } };
  const carried = _techCarry(8, DB_SC.stations[8], { grossWt:1 });
  eq('_techCarry giữ _tlTurn đã lưu', carried._tlTurn, '4');
  eq('_techCarry giữ cờ đã chia số', carried._mdoAllocated, true);
  ok('_techCarry giữ luôn _mdoNets', Array.isArray(carried._mdoNets) && carried._mdoNets.length === 1);
  DB_SC.stations[9] = { tech:{} };
  delete _tlTurnFreeze[9];
  _displayTurn = 6;
  eq('trạm chưa có _tlTurn thì _techCarry đóng dấu số hiện tại', _techCarry(9, DB_SC.stations[9], {})._tlTurn, '6');
  ok('ba nút SAVE / PRINT&DONE / DONE đều đi qua _techCarry',
     (SC.match(/_techCarry\(stId, cur, _techRead\(\)\)/g)||[]).length === 3,
     'đếm được ' + (SC.match(/_techCarry\(stId, cur, _techRead\(\)\)/g)||[]).length);
}

console.log('\n── 5. Phiếu DN mở sẵn đúng cách in đã chọn lúc assign ──');
{
  eq('trạm ghi separate ⇒ ưu tiên separate', _mdoPrintPref(1, { _pttMode:'separate' }), 'separate');
  eq('trạm ghi combined ⇒ ưu tiên combined', _mdoPrintPref(1, { _pttMode:'combined' }), 'combined');
  eq('trạm chưa ghi gì ⇒ mặc định combined',  _mdoPrintPref(1, {}), 'combined');
  /* rơi về nhóm 🔗 đã link ở Today Plan */
  global.TP = { PLAN:{ a:{ doNum:'8651943', _lnkPrint:'separate' } } };
  eq('không có _pttMode thì đọc lựa chọn của nhóm đã link',
     _mdoPrintPref(1, { _linkedRows:[{doNum:'8651943'}] }), 'separate');
  delete global.TP;
  ok('techPrintDone truyền lựa chọn đó vào hộp hỏi DN',
     /_mdoPrintChoice\(stId, cur, tech, _pl, _mdoPrintPref\(stId, cur\)\)/.test(SC));
  ok('hộp hỏi DN nhận tham số pref', /function _mdoPrintChoice\(stId, cur, tech, payloads, pref\)/.test(PE));
  ok('hộp hỏi DN tô đậm sẵn lựa chọn đó', /const want = \(pref === 'separate'\)/.test(PE));
}

console.log('\n── 6. Chuỗi giao diện mới phải là TIẾNG ANH ──');
{
  const VN = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  function strs(src, name){
    return (body(src, name)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .match(/'(?:[^'\\]|\\.)*'/g) || []);
  }
  ['_mdoShowPopup','_lnkPttAsk','_mdoPrintBtns','_mdoListHtml','mdoAssign','mdoAllocSave']
    .forEach(fn=>{
      const bad = strs(SC, fn).filter(s=>VN.test(s));
      ok(fn + ' — không có chuỗi tiếng Việt', bad.length === 0, bad.join(' | '));
    });
  const badPE = strs(PE, '_mdoPrintChoice').filter(s=>VN.test(s));
  ok('_mdoPrintChoice — không có chuỗi tiếng Việt', badPE.length === 0, badPE.join(' | '));
}

console.log('\n── 7. Dựng THẬT hộp hỏi trong DOM giả ──');
{
  /* DOM giả vừa đủ cho _mdoModal + hai popup: bắt lỗi dựng HTML / biến thiếu. */
  const NODES = {};
  let BODY = null;
  global.esc = v => String(v==null?'':v).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  global.scHideResults = ()=>{};
  global.document = {
    getElementById: id => NODES[id] || null,
    createElement: ()=>({ id:'', className:'', innerHTML:'', style:{},
      remove(){ if(this.id) delete NODES[this.id]; } }),
    body: { appendChild(n){ BODY = n; if(n.id) NODES[n.id] = n; } }
  };
  let _mdoCtx = null;
  eval(grab(SC, '_mdoModal'));
  eval(grab(SC, '_mdoModalClose'));
  eval(grab(SC, '_mdoListHtml'));
  eval(grab(SC, '_mdoPrintBtns'));
  eval(grab(SC, '_mdoShowPopup'));
  eval(grab(SC, '_lnkPttAsk'));

  const rows = [
    { _oid:'A', doNum:'8651943', customer:'ACME', plate:'51C-111.11', driver:'NAM', qty:'10', tolerance:'10.3', note:'giao truoc 8h' },
    { _oid:'B', doNum:'',        customer:'BETA', plate:'51C-111.11', driver:'NAM', qty:'15', tolerance:'15.3' }
  ];
  _mdoShowPopup(1, rows[0], [rows[1]]);
  const h1 = BODY.innerHTML;
  ok('popup dò tìm dựng ra HTML', h1.length > 200);
  ok('có đủ 3 lựa chọn + Cancel',
     (h1.match(/SCALE\.mdoAssign\(/g)||[]).length === 2
     && /SCALE\.mdoSingle\(/.test(h1) && /SCALE\.mdoCancel\(/.test(h1));
  ok('dòng chưa có DO hiện rõ "Waiting DO"', /Waiting DO/.test(h1));
  ok('tổng hiện 3 số thập phân', /Total 25\.000 MT/.test(h1), h1.match(/Total[^<]*/));
  ok('ghi chú của sale được đưa lên hộp hỏi', /giao truoc 8h/.test(h1));
  ok('ctx được set để nút bấm có việc mà làm', !!_mdoCtx && _mdoCtx.allRows.length === 2);
  ok('maxTol = tổng qty + MỘT phần dung sai', Math.abs(_mdoCtx.maxTol - 25.3) < 1e-9, String(_mdoCtx.maxTol));

  const lnkRows = rows.map(r=>Object.assign({}, r, { _lnkPrint:'separate' }));
  _lnkPttAsk(2, { kind:'mdo', gid:'G1', row:lnkRows[0], others:[lnkRows[1]], allRows:lnkRows });
  const h2 = BODY.innerHTML;
  ok('popup nhóm đã link chỉ có 2 nút chọn cách in (không hỏi gộp hay không)',
     (h2.match(/SCALE\.mdoAssign\(/g)||[]).length === 2 && !/SCALE\.mdoSingle\(/.test(h2));
  ok('mở sẵn đúng ô "separate" mà nhóm đã ghi nhớ',
     /SEPARATE SLIPS ✓/.test(h2) && !/COMBINED SLIP ✓/.test(h2));
  ok('nhớ gid để ghi lại lựa chọn lên nhóm', _mdoCtx._linkGid === 'G1');
  _mdoModalClose();
  ok('đóng modal thì gỡ hẳn khỏi DOM', !document.getElementById('sc-mdo-bg'));
}

console.log('\n' + (fail ? '❌ ' + fail + ' test FAILED' : '✅ ALL PASS') + '\n');
process.exit(fail ? 1 : 0);
