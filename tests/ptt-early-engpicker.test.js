/* ═══════════════════════════════════════════════════════════════════════
   v4.87 — PTT EARLY · KTPTVC ENGINEER PICKER test harness
   (node thuần, không cần jsdom — trích hàm từ source rồi eval)
     node tests/ptt-early-engpicker.test.js     (cwd = lpg-station-v4-modular)
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const src = fs.readFileSync('js/integrations/ptt-early.js', 'utf8');

function grab(name){
  const i = src.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('không tìm thấy ' + name);
  let d = 0;
  for(let k = src.indexOf('{', i); k < src.length; k++){
    if(src[k] === '{') d++;
    else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k + 1); }
  }
  throw new Error('không đóng ngoặc: ' + name);
}

eval(grab('_normVN'));
eval(grab('_isEngRole'));
eval(grab('_staffOpts'));
eval(grab('_plateKey'));
eval(grab('_ktPageCount'));

let fail = 0;
function eq(label, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if(!ok) fail++;
  console.log((ok ? '  ok  ' : ' FAIL ') + label.padEnd(52) + ' → ' + JSON.stringify(got)
            + (ok ? '' : '  (mong đợi ' + JSON.stringify(want) + ')'));
}

console.log('\n[1] _normVN — bỏ dấu tiếng Việt để so tên');
eq('"Dương"',            _normVN('Dương'),            'duong');
eq('"Nguyễn Văn Hoàng"', _normVN('Nguyễn Văn Hoàng'), 'nguyen van hoang');
eq('"  Kỹ Sư  "',        _normVN('  Kỹ Sư  '),        'ky su');

console.log('\n[2] _isEngRole — nhận diện vai trò kỹ sư (Anh + Việt)');
eq('"Engineer"',    _isEngRole('Engineer'),    true);
eq('"Kỹ sư"',       _isEngRole('Kỹ sư'),       true);
eq('"KY SU LPG"',   _isEngRole('KY SU LPG'),   true);
eq('"Check booth"', _isEngRole('Check booth'), false);
eq('"Driver"',      _isEngRole('Driver'),      false);
eq('rỗng',          _isEngRole(''),            false);

console.log('\n[3] _staffOpts — kỹ sư lên đầu, còn lại xếp theo tên');
global.STAFF = { ROWS: {
  a: { name: 'Trần Bình',   role: 'Check booth' },
  b: { name: 'Lê Dương',    role: 'Engineer'    },
  c: { name: '',            role: 'Engineer'    },   /* thiếu tên → loại */
  d: { name: 'Ánh',         role: 'Kỹ sư'       },
  e: { name: 'Phạm An',     role: ''            }
}};
eq('thứ tự tên', _staffOpts().map(s => s.name), ['Ánh', 'Lê Dương', 'Phạm An', 'Trần Bình']);
eq('bỏ bản ghi không tên', _staffOpts().length, 4);
global.STAFF = undefined;
eq('không có STAFF → []', _staffOpts(), []);

console.log('\n[4] _ktPageCount — 1 phiếu KTPTVC / 1 XE (không phải / DO)');
const plan = [
  { combined:false, rows:[{ plate:'51C-123.45' }] },
  { combined:false, rows:[{ plate:'51C-12345'  }] },   /* cùng xe, khác định dạng */
  { combined:true,  rows:[{ plate:'60A-999.99' }, { plate:'60A-999.99' }] },
  { combined:false, rows:[{ plate:''           }] }    /* không biển số → bỏ */
];
eq('4 unit → 2 xe', _ktPageCount(plan), 2);
eq('plan rỗng',     _ktPageCount([]),   0);

console.log('\n[5] Nguồn tên kỹ sư in lên PTT + KTPTVC');
eq('_doPrint dùng _ktEng (KTPTVC)',   /var eng0 = _ktEng;/.test(src),                true);
eq('KHÔNG còn eng0 = _staffEng()',    /var eng0 = _staffEng\(\)/.test(src),          false);
eq('_buildPage lấy eng = _ktEng',     /var eng = _ktEng;/.test(src),                 true);
eq('_buildCombinedPage lấy _ktEng',   (src.match(/var eng = _ktEng/g) || []).length, 2);
eq('ô ký Engineer in tên (2 chỗ)',
   (src.match(/Engineer<\/div>[\s\S]{0,120}?\+\(eng\?_esc\(eng\)\:'&nbsp;'\)\+/g) || []).length, 2);
eq('không còn ô Engineer hard-blank',
   /Engineer<\/div><div class="pf-ssp" style="height:52px"><\/div><div class="pf-snm" style="font-size:9pt">&nbsp;<\/div>/.test(src), false);
eq('print() luôn mở picker',          /_openEngPicker\(plan\.length, ktOn \? _ktPageCount\(plan\) \: 0\)/.test(src), true);
eq('engPick trim + cho phép rỗng',    /_ktEng = String\(name==null\?''\:name\)\.trim\(\);/.test(src), true);
eq('API xuất engPick/engPickIdx',     /engPick: engPick, engPickIdx: engPickIdx/.test(src), true);
eq('nút "Để trống" gọi engPick(\'\')', /PTT_EARLY\.engPick\(\\'\\'\)/.test(src),      true);

console.log('\n[6] Render thật _buildPage — tên kỹ sư vào đúng ô ký Engineer');
/* Nạp _buildPage với stub cho các phụ thuộc, để test chạy trên HTML thật. */
let _ktEng = '';
const _esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const _dateParts     = () => ({ day:12, mon:8, yr:2026 });
const _pfDeriveType  = t => t;
const _lotTankStr    = () => 'LPG-2026-......\nTK-350.....';
const _custVN        = n => n;
const _twAvgFor      = () => 15000;
const _sfKgFor       = () => 20000;
const _sfAdjust      = (x, y) => ({ x:x, y:y||x, note:'' });
const _certWarnLine  = () => '';
const _certWarnHTML  = () => '';
const _staffChk      = () => 'Trần Thị Mỹ Hương';
eval(grab('_buildPage'));

const ROW = { plate:'61H-09486', rmooc:'', driver:'Nguyễn Văn Mạnh', customer:'E1',
              qty:10, doNum:'8012345', note:'Arrive before 8AM', type:'50:50', _forDate:'12/08/2026' };
const engBox = html => {
  const i = html.indexOf('>Engineer<');
  return html.slice(i, i + 260).match(/pf-snm[^>]*>([^<]*)</)[1];
};

_ktEng = 'Dương Xuân Thạnh';
eq('chọn tên → in lên PTT',   engBox(_buildPage(ROW)), 'Dương Xuân Thạnh');
eq('Check Booth vẫn on-duty', /Trần Thị Mỹ Hương/.test(_buildPage(ROW)), true);
_ktEng = '';
eq('để trống → ô ký trống',   engBox(_buildPage(ROW)), '&nbsp;');
_ktEng = 'A & B <x>';
eq('escape ký tự HTML',       engBox(_buildPage(ROW)), 'A &amp; B &lt;x&gt;');

console.log(fail ? '\n❌ ' + fail + ' test FAIL\n' : '\n✅ Tất cả test PASS\n');
process.exit(fail ? 1 : 0);
