/* ============================================================
 * sp-filters.test.js — sp.js v4.100: FILTER SLoc / Batch / Batch code
 *                                    + mặc định NGÀY HÔM QUA + TỔNG
 * ------------------------------------------------------------
 *   node tests/sp-filters.test.js      (chạy từ thư mục gốc repo)
 * Bảo đảm:
 *   • Mở tab SAP lần đầu ⇒ dateFilter = D-1 (hôm qua), không phải hôm nay.
 *   • Ba filter mới AND với nhau và với ô Search + Date.
 *   • Dropdown Batch code chỉ liệt kê mã CÓ dòng theo date+sloc+batch.
 *   • Đổi date/sloc/batch làm mã batch đang lọc rỗng ⇒ tự bỏ mã đó.
 *   • Tổng = cộng ĐÚNG những dòng đang hiển thị (không nắn, không suy diễn).
 * ============================================================ */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');

/* ---- DOM giả CÓ TRẠNG THÁI (mỗi id một element thật) ---- */
const DOM={};
function el(id){
  return { id, value:'', textContent:'', innerHTML:'', _cls:{},
    classList:{ add(c){this._o._cls[c]=1;}, remove(c){delete this._o._cls[c];},
      toggle(c,v){ if(v===undefined) v=!this._o._cls[c]; if(v)this._o._cls[c]=1; else delete this._o._cls[c]; },
      contains(c){return !!this._o._cls[c];} },
    addEventListener(){}, focus(){}, style:{} };
}
global.window=global;
global.document={ getElementById(id){ if(!DOM[id]){ const e=el(id); e.classList._o=e; DOM[id]=e; } return DOM[id]; },
  querySelector:()=>null, querySelectorAll:()=>[] };
global.localStorage={ getItem:()=>null, setItem(){}, removeItem(){} };
global.toast=()=>{}; global.canWrite=()=>true;
global.escapeHtml=s=>String(s==null?'':s);
global.CURRENT_USER={name:'test'};
global.lastEditFormatter=()=>'';
global.Tabulator=function(){ return { on(){}, destroy(){}, replaceData(){}, redraw(){}, getRow:()=>null }; };
global.normalizeDate=function(s){ /* chỉ cần YYYY-MM-DD → DD/MM/YY cho test */
  const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m) return s;
  return m[3]+'/'+m[2]+'/'+m[1].slice(2);
};
const SP=global.SP=eval(fs.readFileSync(path.join(ROOT,'js','data','sp.js'),'utf8')+'\n;SP');

let fail=0;
function chk(n,c,x){ console.log((c?'  ✅ ':'  ❌ ')+n+(x?'  → '+x:'')); if(!c) fail++; }

/* ---- dữ liệu: 2 ngày, đủ SLoc, 1100 có nhiều mã batch ---- */
function iso(dOffset){ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+dOffset);
  const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
const Y=iso(-1), DBEFORE=iso(-2);
function add(rid,o){ SP.ROWS[rid]=Object.assign({_rid:rid,init:0,gr:0,gi:0,trs:0,end:0},o); }
add('r1',{date:Y,sloc:'1100',mat:'C3',batch:'X',bcode:'260818X001',init:0,gr:4750000,end:4750000});
add('r2',{date:Y,sloc:'1100',mat:'C3',batch:'X',bcode:'260818X002',init:0,gr:250000,end:250000});
add('r3',{date:Y,sloc:'1100',mat:'C4',batch:'E',bcode:'260818E001',init:0,gr:500000,end:500000});
add('r4',{date:Y,sloc:'1100',mat:'C4',batch:'D',bcode:'260806D001',init:1030053,trs:-172251,end:857802});
add('r5',{date:Y,sloc:'2100',mat:'C3',batch:'D',init:142882,gi:-31833,trs:47259,end:158308});
add('r6',{date:Y,sloc:'2101',mat:'C4',batch:'D',init:7626,gi:-82005,trs:139526,end:65147});
add('r7',{date:DBEFORE,sloc:'1100',mat:'C3',batch:'X',bcode:'260812X001',init:9000000,end:9000000});
add('r8',{date:DBEFORE,sloc:'2100',mat:'C3',batch:'D',init:100000,end:100000});

console.log('\n[1] MẶC ĐỊNH = NGÀY HÔM QUA (D-1)');
SP.buildTable();
const yDMY=SP._yesterdayDMY();
chk('dateFilter tự set = hôm qua', SP._filters().date===yDMY, SP._filters().date);
chk('KHÔNG phải hôm nay', SP._filters().date!==global.normalizeDate(iso(0)), 'today='+global.normalizeDate(iso(0)));
chk('ô nhập Date hiển thị đúng', DOM.spDateFilter.value===yDMY, DOM.spDateFilter.value);
chk('nút ✕ Clear bật', DOM.spDateClear.classList.contains('on'));
chk('chỉ còn 6 dòng của hôm qua', SP._rows().length===6, SP._rows().length+' dòng');

console.log('\n[2] LỌC THEO SLoc');
SP.setSloc('1100');
chk('SLoc 1100 → 4 dòng', SP._rows().length===4, SP._rows().map(r=>r.bcode).join(','));
chk('không lẫn SLoc khác', SP._rows().every(r=>r.sloc==='1100'));
SP.setSloc('2100');
chk('SLoc 2100 → 1 dòng', SP._rows().length===1);
SP.setSloc('');
chk('bỏ lọc SLoc → 6 dòng', SP._rows().length===6);

console.log('\n[3] LỌC THEO BATCH (ký tự P/X/D/E)');
SP.setBatch('X');
chk('Batch X → 2 dòng', SP._rows().length===2, SP._rows().map(r=>r.bcode).join(','));
SP.setBatch('D');
chk('Batch D → 3 dòng (1100 + 2100 + 2101)', SP._rows().length===3);
SP.setBatch('');
chk('bỏ lọc Batch → 6 dòng', SP._rows().length===6);

console.log('\n[4] LỌC THEO MÃ BATCH + dropdown động');
SP.setSloc('1100');
chk('dropdown liệt kê đúng 4 mã của hôm qua',
    (DOM.spBcodeFilter.innerHTML.match(/<option value="\d{6}[DEPX]\d+"/g)||[]).length===4,
    DOM.spBcodeFilter.innerHTML.replace(/</g,'\n<').slice(0,200));
chk('KHÔNG có mã của ngày khác (260812X001)',
    DOM.spBcodeFilter.innerHTML.indexOf('260812X001')<0);
SP.setBcode('260818X001');
chk('lọc 1 mã → đúng 1 dòng', SP._rows().length===1 && SP._rows()[0].bcode==='260818X001');
SP.setBatch('E');
chk('đổi Batch làm mã cũ hết dòng ⇒ tự bỏ mã', SP._filters().bcode==='' , 'bcode='+SP._filters().bcode);
chk('Batch E ở 1100 → 1 dòng', SP._rows().length===1 && SP._rows()[0].bcode==='260818E001');

console.log('\n[5] TỔNG CỦA PHẦN ĐANG LỌC');
SP.resetFilters();
SP.setSloc('1100'); SP.setBatch('X');
SP.renderTotals();
const num=id=>parseInt(String(DOM[id].innerHTML).replace(/<[^>]*>/g,'').replace(/[^0-9-]/g,''),10)||0;
chk('GR = 4.750.000 + 250.000 = 5.000.000', num('spTotGr')===5000000, num('spTotGr'));
chk('End = 5.000.000', num('spTotEnd')===5000000, num('spTotEnd'));
chk('GI = 0 (không có dòng nào xuất)', num('spTotGi')===0, num('spTotGi'));
chk('đếm dòng đúng', /2 dòng/.test(DOM.spTotRows.textContent||DOM.spTotRows.innerHTML), DOM.spTotRows.innerHTML);
SP.setBatch(''); SP.setSloc('1100'); SP.renderTotals();
chk('Trs của cả 1100 = -172.251', num('spTotTrs')===-172251, num('spTotTrs'));
chk('Init của cả 1100 = 1.030.053', num('spTotInit')===1030053, num('spTotInit'));
chk('End của cả 1100 = 6.357.802',
    num('spTotEnd')===4750000+250000+500000+857802, num('spTotEnd'));

console.log('\n[6] SEARCH vẫn AND với các filter mới');
DOM.spSearch.value='260818E';
SP.rebuildTableData();
chk('search + sloc 1100 → 1 dòng', SP._rows().length===1 && SP._rows()[0].bcode==='260818E001');
DOM.spSearch.value='';

console.log('\n[7] RESET quay về mặc định D-1');
SP.setSloc('2100'); SP.setBatch('D'); SP.resetFilters();
const f=SP._filters();
chk('mọi filter phụ đã sạch', !f.sloc && !f.batch && !f.bcode);
chk('date về lại hôm qua', f.date===yDMY, f.date);
chk('bảng lại đủ 6 dòng của hôm qua', SP._rows().length===6);

console.log(fail?('\n❌ FAIL: '+fail):'\n✅ TẤT CẢ PASS');
process.exit(fail?1:0);
