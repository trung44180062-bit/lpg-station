/* ═══════════════════════════════════════════════════════════════════════
   v4.112 — MULTI-DO: dò tìm ở TRẠM chạy SONG SONG với 🔗 Link Orders,
            và xe đã gộp phải HIỆN + IN đủ mọi DO
     node tests/mdo-station-detect.test.js        (cwd = lpg-station-v4-modular)

   Người dùng báo hai chuyện:
     A. "Đã link MULTI-DO và chọn gộp, nhưng trạm chỉ hiện một đơn và PTT
        in ra cũng chỉ một đơn."
     B. "Phục hồi phép dò tìm multi-DO lúc assign ở trạm — sáng nhiều xe
        quá, không kịp link ở Today Plan."

   Bốn cửa chặn IM LẶNG là gốc của (A) — mỗi cái một mục test:
     [1] anh em đang nằm trong HÀNG ĐỢI bị tính là "đã cam kết" ⇒ nhóm co
         lại còn một dòng ⇒ assign lặng lẽ thành đơn lẻ;
     [2] phép dò tìm đòi TRÙNG TÀI XẾ tuyệt đối — kế hoạch thật hay bỏ
         trống ô tài xế ở dòng thứ hai;
     [3] cửa chặn `tổng <= 27` bỏ qua popup mà không nói gì;
     [4] nhóm còn nhưng hết anh em gộp được thì cũng không báo lý do.
   Và (A) phần in: pttPrint không hề dùng _linkedRows.
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SC  = fs.readFileSync(path.join(ROOT, 'js/features/scale.js'), 'utf8');
const PL  = fs.readFileSync(path.join(ROOT, 'js/features/plan.js'),  'utf8');
const WG  = fs.readFileSync(path.join(ROOT, 'js/checks/wgcheck.js'), 'utf8');
const RPT = fs.readFileSync(path.join(ROOT, 'js/features/rpt.js'),   'utf8');
const TLS = fs.readFileSync(path.join(ROOT, 'js/data/tl.js'),        'utf8');

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
let fail = 0;
function ok(label, cond, extra){
  if(cond) console.log('  ✓ ' + label);
  else { fail++; console.log('  ✗ ' + label + (extra ? '  →  ' + extra : '')); }
}
const eq = (l,g,w)=> ok(l, g===w, 'got '+JSON.stringify(g)+', want '+JSON.stringify(w));

/* ─── DOM + globals giả (dùng chung cho cả plan.js lẫn các hàm trích ra) ─── */
const DOM = {};
function el(id){
  const e = { id, value:'', textContent:'', innerHTML:'', _cls:{}, style:{}, children:[],
    addEventListener(){}, focus(){}, appendChild(){}, remove(){},
    querySelector:()=>null, querySelectorAll:()=>[] };
  e.classList = { add(c){e._cls[c]=1;}, remove(c){delete e._cls[c];},
                  contains(c){return !!e._cls[c];}, toggle(){} };
  return e;
}
global.window = global;
global.document = {
  getElementById(id){ if(!DOM[id]) DOM[id] = el(id); return DOM[id]; },
  createElement(){ return el('_new'); }, querySelector:()=>null, querySelectorAll:()=>[],
  body:{ appendChild(n){ DOM[n.id] = n; } }, head:{ appendChild(){} },
  hidden:true, addEventListener(){}
};
global.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
const LOG = [];
global.toast = (m,t)=> LOG.push('['+(t||'')+'] '+m);
global.confirm = ()=> true;  global.canWrite = ()=> true;  global.logAudit = ()=>{};
global.escapeHtml = s => String(s==null?'':s);
global.esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
global.CURRENT_USER = { name:'t' };
global.isTempOid = v => /^[A-Z]{3}\d{6,}$/.test(String(v||''));
global.cleanDO  = v => String(v||'').trim();
global.splitDOs = d => String(d||'').split(/[\s,;]+/).map(x=>x.trim()).filter(x=>/^\d{7,}$/.test(x));
global.isMultiDO = d => global.splitDOs(d).length > 1;
global.dosOverlap = ()=> false;
global.lastEditFormatter = ()=> '';
global.Tabulator = function(){ return { on(){}, destroy(){}, replaceData(){}, redraw(){},
  getRow:()=>null, getRows:()=>[] }; };
global.setInterval = ()=> 0;
global.TL = { getIndex:()=>({byKey:new Map()}), ROWS:[] };
global.DB_SC = { stations:{ 1:{status:'empty'}, 2:{status:'empty'}, 3:{status:'empty'}, 4:{status:'empty'} } };
global.SC_WAIT = [];
const th = { then(f){ f&&f(); return th; }, catch(){ return th; }, finally(f){ f&&f(); return th; } };
function ref(){ return { on(){}, once(){ return { then(f){ f&&f({val:()=>({})}); return th; },
  catch(){ return th; }, finally(f){ f&&f(); return th; } }; }, update(){ return th; }, child(){ return ref(); } }; }
global.firebase = { database(){ return { ref(){ return ref(); } }; } };

const { TP } = eval(PL + '\n;({TP:TP,TMR:TMR})');
global.TP = TP;
TP.init();

/* ─── hàm trích từ scale.js ─── */
eval(grab(SC, '_mdoNormPlate'));
eval(grab(SC, '_lnkGroupOf'));
eval(grab(SC, '_mdoFindLinkable'));
eval(grab(SC, '_mdoIsCombined'));
eval(grab(SC, '_mdoGroupKey'));
eval(grab(SC, '_mdoMaxTol'));

const TODAY_ISO = (()=>{ const d=new Date(),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); })();
function plan(o){
  TP.PLAN[o._oid] = Object.assign({ customer:'DANG QUANG', plate:'50H-17077',
    driver:'Nguyễn Văn Thanh', qty:'16', tolerance:'16.3', _forDate:TODAY_ISO,
    _seq:0, _autoSync:true, _status:'', allowLoad:'OK', rmooc:'60R-07115',
    type:'LPG (C3:50/C4:50)', note:'' }, o);
  return TP.PLAN[o._oid];
}
function resetPlan(){
  Object.keys(TP.PLAN).forEach(k=>delete TP.PLAN[k]);
  global.SC_WAIT = [];
  for(let i=1;i<=4;i++) DB_SC.stations[i] = { status:'empty' };
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log('\n── 1. Anh em ĐANG XẾP HÀNG ĐỢI vẫn gộp được (bug "chỉ hiện 1 đơn") ──');
{
  resetPlan();
  const a = plan({ _oid:'O1', doNum:'86758267', qty:'16', _seq:0 });
  const b = plan({ _oid:'O2', doNum:'86758266', qty:'9',  _seq:1 });
  TP.lnkToggleSel('O1',true); TP.lnkToggleSel('O2',true); TP.lnkApply('mdo');
  eq('link tạo được nhóm MULTI-DO', TP.lnkKind(a), 'mdo');

  let lk = _lnkGroupOf(a);
  ok('chưa ai xếp hàng: nhóm còn đủ anh em', lk && lk.others.length === 1);

  /* dòng thứ hai đang nằm trong hàng đợi */
  global.SC_WAIT = [{ _id:'w1', plate:'50H-17077', doNum:'86758266', _oid:'O2' }];
  lk = _lnkGroupOf(a);
  ok('⭐ anh em trong HÀNG ĐỢI VẪN gộp được (v4.112)', lk && lk.others.length === 1,
     lk ? ('others='+lk.others.length) : 'null');
  ok('… và KHÔNG bị ghi là bị loại', lk && lk.dropped.length === 0);

  /* dòng thứ hai đã nằm trên một trạm khác → mới thật sự loại */
  global.SC_WAIT = [];
  DB_SC.stations[2] = { status:'loading', doNum:'86758266', plate:'50H-17077' };
  lk = _lnkGroupOf(a);
  ok('anh em đã nằm TRÊN TRẠM khác thì loại', lk && lk.others.length === 0);
  ok('… và nêu ĐÍCH DANH lý do (không im lặng)',
     lk && lk.dropped.length === 1 && /already on another station/.test(lk.dropped[0].why),
     lk && lk.dropped.length ? lk.dropped[0].why : 'không có');
  DB_SC.stations[2] = { status:'empty' };
}

console.log('\n── 2. Phép DÒ TÌM ở trạm (chưa link ở Today Plan) ──');
{
  resetPlan();
  const a = plan({ _oid:'P1', doNum:'86758267', qty:'16', _seq:0 });
  plan({ _oid:'P2', doNum:'86758266', qty:'9', _seq:1 });
  eq('cùng xe cùng tài xế → dò ra 1 anh em', _mdoFindLinkable(1, a).length, 1);

  /* ô tài xế của dòng thứ hai bỏ trống — kế hoạch thật rất hay như vậy */
  TP.PLAN['P2'].driver = '';
  eq('⭐ dòng thiếu tên tài xế VẪN dò ra (v4.112)', _mdoFindLinkable(1, a).length, 1);

  /* tài xế KHÁC hẳn thì vẫn phải loại — đó là chuyến khác */
  TP.PLAN['P2'].driver = 'Trần Văn B';
  eq('tài xế khác hẳn thì KHÔNG gộp', _mdoFindLinkable(1, a).length, 0);
  TP.PLAN['P2'].driver = 'Nguyễn Văn Thanh';

  /* anh em đang xếp hàng đợi cũng phải dò ra được */
  global.SC_WAIT = [{ _id:'w1', plate:'50H-17077', doNum:'86758266', _oid:'P2' }];
  eq('⭐ anh em trong hàng đợi vẫn dò ra (v4.112)', _mdoFindLinkable(1, a).length, 1);
  global.SC_WAIT = [];

  /* dòng đã thuộc nhóm 🔗 thì để đường LINK lo, dò tìm không đụng */
  TP.lnkToggleSel('P1',true); TP.lnkToggleSel('P2',true); TP.lnkApply('mdo');
  eq('dòng đã link thì phép dò tìm bỏ qua', _mdoFindLinkable(1, a).length, 0);
}

console.log('\n── 3. scAssignToStation — không còn lối thoát IM LẶNG ──');
{
  const fn = grab(SC, 'scAssignToStation');
  ok('BỎ cửa chặn im lặng "tổng <= 27"', !/_tot\s*<=\s*27/.test(fn),
     'vẫn còn `_tot <= 27` — popup bị nuốt khi xe chở quá tải');
  ok('nhóm MDO hết anh em gộp được thì NÓI RÕ lý do', /_lk\.dropped/.test(fn));
  ok('vẫn ưu tiên đường đã link (không hỏi lại "load together?")',
     /_lnkPttAsk\(stId, _lk\)/.test(fn));
  ok('vẫn giữ đường dò tìm cho dòng CHƯA link', /_mdoFindLinkable\(stId, row\)/.test(fn));
  ok('lỗi bất ngờ khi dò cũng phải báo, không nuốt', /Multi-DO check failed/.test(fn));
  const popup = grab(SC, '_mdoShowPopup');
  ok('popup cảnh báo khi tổng vượt 27 MT', /sc-mdo-warn/.test(popup) && /27 MT/.test(popup));
}

console.log('\n── 4. Chọn "bán gộp" ở trạm ⇒ Today Plan tự lập nhóm 🔗 MULTI-DO ──');
{
  resetPlan();
  const a = plan({ _oid:'Q1', doNum:'86758267', qty:'16', _seq:0 });
  const b = plan({ _oid:'Q2', doNum:'86758266', qty:'9',  _seq:1 });
  global.SC_WAIT = [{ _id:'w9', plate:'50H-17077', doNum:'86758266', _oid:'Q2' }];

  /* môi trường tối thiểu cho mdoAssign */
  global.scHideResults = ()=>{};
  global._mdoModalClose = ()=>{};
  global.PTT_EARLY = { openFor(){ global._pttSeparateOpened = true; } };
  global._scWaitCleanupByRow = (oid, doNum)=>{
    const o = String(oid||''), d = String(doNum||'');
    global.SC_WAIT = global.SC_WAIT.filter(it =>
      !((o && String(it._oid||'') === o) || (/^\d{7,}$/.test(d) && String(it.doNum||'') === d)));
  };
  global.scAssignToStation = (stId, row)=>{
    DB_SC.stations[stId] = { status:'loading', doNum:String(row.doNum||''),
      qty:String(row.qty||''), tolerance:String(row.tolerance||''),
      plate:row.plate, driver:row.driver, customer:row.customer, tank:'TK-3502',
      batch:'LPG-2026-369', rmooc:row.rmooc, type:row.type, turn:1,
      _oid:String(row._oid||''), _multiDO:!!row._multiDO, _linkedRows:row._linkedRows||null,
      _pttMode:row._pttMode||'', tech:{} };
  };
  eval(grab(SC, 'mdoAssign'));
  global._mdoCtx = { stId:1, pickedRow:a, otherRows:[b], allRows:[a,b],
    totalQty:25, maxTol:_mdoMaxTol([a,b]), _linkGid:'' };
  mdoAssign(1, 'combined');

  const st = DB_SC.stations[1];
  eq('trạm nhận chuỗi DO GỘP',      String(st.doNum), '86758267 86758266');
  eq('trạm nhận TỔNG khối lượng',   String(st.qty), '25');
  eq('trạm giữ đủ 2 dòng con',      (st._linkedRows||[]).length, 2);
  ok('thẻ trạm nhận ra đây là xe gộp', _mdoIsCombined(st) === true);
  ok('⭐ Today Plan ĐÃ tự lập nhóm 🔗 MULTI-DO', TP.lnkKind(a) === 'mdo' && TP.lnkKind(b) === 'mdo',
     TP.lnkKind(a)+' / '+TP.lnkKind(b));
  eq('… hai dòng cùng MỘT nhóm', TP.lnkGid(a), TP.lnkGid(b));
  eq('… và nhớ cách in đã chọn', String(a._lnkPrint), 'combined');
  ok('… có báo cho người dùng biết', LOG.some(x=>/Linked as MULTI-DO on Today Plan/.test(x)),
     LOG.slice(-2).join(' | '));
  eq('⭐ anh em vừa gộp được dọn khỏi HÀNG ĐỢI', global.SC_WAIT.length, 0);

  /* bấm lại với cách in khác: nhóm đã có ⇒ chỉ cập nhật, không lập nhóm mới */
  const gid0 = TP.lnkGid(a);
  global._mdoCtx = { stId:1, pickedRow:a, otherRows:[b], allRows:[a,b],
    totalQty:25, maxTol:_mdoMaxTol([a,b]), _linkGid:'' };
  /* mdoAssign mở bảng in N phiếu rời qua setTimeout — cho nó chạy ngay */
  const _realST = global.setTimeout;
  global.setTimeout = f => { try{ f(); }catch(_){} return 0; };
  mdoAssign(1, 'separate');
  global.setTimeout = _realST;
  eq('nhóm cũ được GIỮ (không đẻ nhóm mới)', TP.lnkGid(a), gid0);
  eq('… cách in được cập nhật thành separate', String(a._lnkPrint), 'separate');
  ok('… và mở bảng in N phiếu rời', global._pttSeparateOpened === true);
}

console.log('\n── 5. PTT của xe GỘP phải liệt kê ĐỦ mọi DO ──');
{
  /* pttPrint dựng dữ liệu; _pttShowOverlay dựng phiếu. Chạy thật cả hai. */
  let captured = null;
  global._pttShowOverlay = d => { captured = d; };
  global.tkGetActive = ()=>({ name:'TK-3502', key:'tk2', lotFull:'LPG-2026-369', lotNum:'369', initWt:0 });
  global.getDisplayTurn = ()=> 2;
  global._sanitizeLotPrefix = v => String(v||'');
  global._scPureType = ()=> '';
  global.CT = { vnName:v=>String(v||''), lookup:v=>String(v||''), wmsName:v=>String(v||'') };
  global.DATA = {};
  global.sfDensity = ()=>0.538; global.sfFillPct = ()=>0.9;
  eval(grab(SC, 'pttPrint'));

  DB_SC.stations[1] = { status:'loading', plate:'50H-17077', rmooc:'60R-07115',
    doNum:'86758267 86758266', qty:'25', tolerance:'25.3', customer:'DANG QUANG',
    driver:'Nguyễn Văn Thanh', tank:'TK-3502', batch:'LPG-2026-369',
    type:'LPG (C3:50/C4:50)', turn:2, _oid:'Q1', _multiDO:true, tech:{},
    _linkedRows:[ { doNum:'86758267', customer:'DANG QUANG', qty:'16', note:'Arrive before 8AM' },
                  { doNum:'86758266', customer:'DANG QUANG', qty:'9',  note:'' } ] };
  pttPrint(1);
  const dCombo = captured;
  ok('pttPrint gửi kèm danh sách DO cho phiếu', !!(dCombo && dCombo.doRows));
  eq('… đủ 2 DO', dCombo.doRows.length, 2);
  eq('… số của DO thứ hai đúng', String(dCombo.doRows[1].qty), '9');
  eq('… Loading Qty vẫn là TỔNG', dCombo.qty, 25);
  ok('… ghi chú của sale được gộp lại', /Arrive before 8AM/.test(String(dCombo.saleNote||'')));

  /* cùng một trạm nhưng chỉ chở MỘT DO — phiếu phải giữ nguyên hình dạng cũ */
  captured = null;
  DB_SC.stations[1] = { status:'loading', plate:'50H-17077', rmooc:'60R-07115',
    doNum:'86758267', qty:'16', tolerance:'16.3', customer:'DANG QUANG',
    driver:'Nguyễn Văn Thanh', tank:'TK-3502', batch:'LPG-2026-369',
    type:'LPG (C3:50/C4:50)', turn:2, _oid:'Q1', tech:{} };
  pttPrint(1);
  const dOne = captured;
  ok('xe một DO: không kèm danh sách DO', !!dOne && dOne.doRows === null);

  /* ── dựng PHIẾU THẬT từ hai bộ dữ liệu trên ── */
  global._pfDeriveType = t => String(t||'');
  global._pfLotStack   = v => String(v||'');
  global._ktEnsureScreenCSS = ()=>{};
  global._pttOvRenderKt = ()=>{};
  eval(grab(WG, '_pttShowOverlay'));   /* từ đây _pttShowOverlay là hàm THẬT */

  _pttShowOverlay(dCombo);
  const paper = DOM['pttOvBody'].innerHTML;
  ok('⭐ phiếu in ĐỦ CẢ HAI số DO', /86758267/.test(paper) && /86758266/.test(paper),
     paper ? 'thiếu DO trên phiếu' : 'phiếu rỗng');
  ok('… in kèm số của TỪNG DO, mỗi DO một dòng',
     /id="pttov-do"[^>]*>86758267\n86758266</.test(paper)
     && /id="pttov-doqty"[^>]*>16\n9</.test(paper),
     (paper.match(/id="pttov-doqty"[^>]*>[^<]*/)||[''])[0]);
  ok('… đánh dấu rõ là phiếu GỘP', /COMBINED · 2 DO/.test(paper));
  ok('… ô Loading Qty ghi (total) để không ai nhầm với số một đơn', /\(total\)/.test(paper));
  ok('… vẫn giữ nguyên ô sửa tay #pttov-do / #pttov-doqty',
     /id="pttov-do"/.test(paper) && /id="pttov-doqty"/.test(paper));

  _pttShowOverlay(dOne);
  const one = DOM['pttOvBody'].innerHTML;
  ok('xe một DO: phiếu KHÔNG có nhãn COMBINED', !/COMBINED/.test(one));
  ok('… không có chữ (total)',   !/\(total\)/.test(one));
  ok('… vẫn in đúng số DO của nó', /86758267/.test(one) && !/86758266/.test(one));
}

console.log('\n── 6. TL Data ghi dấu nối multi-DO (báo cáo đếm đúng số lượt xe) ──');
{
  global._mdNormDO = d => String(d==null?'':d).replace(/[,\s]/g,'').replace(/^0+/,'').trim();
  global._tlFreezeTurn = ()=> 2;
  global.PP = null;
  eval(grab(SC, '_mdoBuildPayloadFor'));
  const cur = { tank:'TK-3502', batch:'LPG-2026-369', plate:'50H-17077',
                rmooc:'60R-07115', driver:'Nguyễn Văn Thanh', customer:'DANG QUANG',
                type:'LPG (C3:50/C4:50)' };
  const p1 = _mdoBuildPayloadFor(1, cur, {}, { doNum:'86758267', qty:'16' }, 16000, 19210, 35210, 2);
  const p2 = _mdoBuildPayloadFor(1, cur, {}, { doNum:'86758266', qty:'9'  },  9000, 19210, 28210, 2);
  ok('mỗi dòng TL mang khoá mdoG', !!p1.mdoG && !!p2.mdoG, p1.mdoG);
  eq('⭐ hai dòng CÙNG một lượt xe ⇒ cùng khoá', p1.mdoG, p2.mdoG);
  const p3 = _mdoBuildPayloadFor(1, cur, {}, { doNum:'86758260', qty:'9' }, 9000, 19210, 28210, 3);
  ok('lượt (turn) khác ⇒ khoá khác', p3.mdoG !== p1.mdoG, p3.mdoG);
  ok('khoá đọc được bằng mắt (có ngày · trạm · turn · biển số)',
     /^MDO-\d{6}-S1-T2-50H17077$/.test(p1.mdoG), p1.mdoG);

  ok('TL Data có cột Multi-DO', /\{k:'mdoG'/.test(TLS) && /h:'Multi-DO'/.test(TLS));
  ok('… cột này KHÔNG cho sửa tay', /\{k:'mdoG',\s*h:'Multi-DO',\s*w:\d+,\s*ed:false\}/.test(TLS));

  /* Báo cáo: cột "Trips" phải gộp theo mdoG, nếu không xe gộp bị đếm 2 lượt */
  const rptFlat = RPT.replace(/\s+/g,' ');
  ok('báo cáo đọc cột mdoG', /const _mdoG = String\(r\.mdoG\|\|''\)\.trim\(\);/.test(rptFlat),
     'rpt.js chưa đọc mdoG');
  ok('… và dùng nó làm khoá lượt xe', /_mdoG \? \( ?'MDO\|'\+_mdoG\)/.test(rptFlat)
     || /'MDO\|'\+_mdoG/.test(rptFlat), 'cột Trips vẫn đếm theo doNo — xe gộp bị đếm 2 lượt');
}

console.log('\n── 7. Chuỗi hiển thị mới phải là TIẾNG ANH ──');
{
  const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  const strings = s => (s.match(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g)||[]);
  /* scAssignToStation còn chuỗi tiếng Việt CŨ từ v4.80/v4.83 (cảnh báo ⛔ và
     loại hàng ≠50:50) — README cho phép giữ, chỉ CẤM viết THÊM. Nên ở đây
     chỉ soi đúng khối multi-DO vừa thêm. */
  const mdoBlock = (()=>{
    const b = grab(SC,'scAssignToStation');
    const i = b.indexOf('HAI ĐƯỜNG PHÁT HIỆN MULTI-DO');
    const j = b.indexOf('Fleet/cert warning is surfaced inline');
    return (i >= 0 && j > i) ? b.slice(i, j) : b;
  })();
  [['khối multi-DO trong scAssignToStation', mdoBlock],
   ['mdoAssign',         grab(SC,'mdoAssign')],
   ['_mdoShowPopup',     grab(SC,'_mdoShowPopup')],
   ['_mdoStationHint',   grab(SC,'_mdoStationHint')]].forEach(([n, body])=>{
     /* chỉ soi phần MÃ, bỏ mọi khối chú thích (chú thích vẫn viết tiếng Việt) */
     const code = body.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
     const bad = strings(code).filter(x=>VI.test(x));
     ok(n + ' — chuỗi hiển thị không lẫn tiếng Việt', bad.length === 0, bad.join(' | '));
   });
}

console.log('\n' + (fail ? ('❌ ' + fail + ' assert FAIL') : '✅ ALL PASS') + '\n');
process.exit(fail ? 1 : 0);
