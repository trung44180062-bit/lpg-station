/* ============================================================
   STATE + UTILS  — bien toan cuc, ma ca, ham tien ich
   LPGT Cavern — Quan ly Cong Ca v4
   ============================================================ */
/* =================== STATE =================== */
/* Cau hinh nam o js/config.js (khong up GitHub). Neu thieu file do,
   app van chay duoc o che do offline voi gia tri trung tinh duoi day. */
window.APP_CFG = window.APP_CFG || {};
APP_CFG.firebase    = APP_CFG.firebase    || null;
APP_CFG.dbPath      = APP_CFG.dbPath      || 'shiftwork_v2';
APP_CFG.storageKey  = APP_CFG.storageKey  || 'lpgt_shiftwork_v2';
APP_CFG.deptDefault = APP_CFG.deptDefault || 'Bo phan';
APP_CFG.approver1   = APP_CFG.approver1   || '';
APP_CFG.approver2   = APP_CFG.approver2   || '';

const LS=APP_CFG.storageKey;
const DEPT_DEFAULT_FALLBACK=APP_CFG.deptDefault;
const APPROVER1_FALLBACK=APP_CFG.approver1, APPROVER2_FALLBACK=APP_CFG.approver2;
const DEFAULT_CODES=[
 {c:'O', l:'Office / Hành chính 08–17h', col:'var(--cO)', cat:'work'},
 {c:'D', l:'Ca ngày 08–20h', col:'var(--cD)',  cat:'work'},
 {c:'N', l:'Ca đêm 20–08h',  col:'var(--cN)',  cat:'work'},
 {c:'R', l:'Nghỉ ca (Rest)', col:'var(--cR)',  cat:'rest'},
 {c:'AL8',l:'Phép năm 8h',   col:'var(--cAL)', cat:'leave'},
 {c:'AL4',l:'Phép năm 4h',   col:'var(--cAL)', cat:'leave'},
 {c:'NP', l:'Nghỉ không lương', col:'var(--cNP)', cat:'leave'},
 {c:'COM',l:'Nghỉ bù (comp)', col:'var(--cNP)', cat:'leave'},
 {c:'OFF',l:'Nghỉ bù / OFF (cũ)', col:'var(--cNP)', cat:'leave', legacy:true},
 {c:'WED',l:'Nghỉ cưới',      col:'var(--cAL)', cat:'leave'},
 {c:'FUN',l:'Nghỉ tang',      col:'var(--cAL)', cat:'leave'},
 {c:'MAT',l:'Nghỉ thai sản / đẻ', col:'var(--cAL)', cat:'leave'},
 {c:'ALP',l:'Nghỉ phép năm thêm', col:'var(--cAL)', cat:'leave'},
 {c:'SD', l:'Đổi sang ca D', col:'var(--cSW)', cat:'swap'},
 {c:'SN', l:'Đổi sang ca N', col:'var(--cSW)', cat:'swap'},
 {c:'SO', l:'Đổi sang ca O', col:'var(--cSW)', cat:'swap'},
 {c:'OTD',l:'Tăng ca ngày 08–20h',   col:'var(--cOT)', cat:'ot'},
 {c:'OTN',l:'Tăng ca đêm 20–08h',    col:'var(--cOT)', cat:'ot'},
 {c:'OTL',l:'Tăng ca giờ nghỉ trưa', col:'var(--cOT)', cat:'ot'},
 {c:'OT2',l:'Tăng ca 18–20h',        col:'var(--cOT)', cat:'ot'},
 {c:'OT3',l:'Tăng ca 17–20h',        col:'var(--cOT)', cat:'ot'},
 /* CA KÉP — xem khối chú thích COMBO_CODES ngay bên dưới */
 {c:'O+N',l:'Ca O + tăng ca đêm N',  col:'var(--cO)',  cat:'combo'},
 {c:'D+N',l:'Ca D + tăng ca đêm N',  col:'var(--cD)',  cat:'combo'}
 /* Mã X (tăng ca nhập tàu) đã bỏ HOÀN TOÀN — không còn khai, không còn hiển thị
    trong danh sách chọn. Ô lịch cũ (nếu còn) sẽ hiện như mã lạ, không tính giờ OT. */
];
// Giờ công mặc định theo mã ca (chỉnh / thêm ở tab Dữ liệu)
const DEFAULT_HOURS={O:8,D:12,N:12,R:0,AL8:8,AL4:4,NP:0,COM:0,OFF:0,
                     WED:8,FUN:8,MAT:8,ALP:8,SD:12,SN:12,SO:8,
                     OTD:12,OTN:12,OTL:1,OT2:2,OT3:3,
                     'O+N':20,'D+N':24};

/* ============================================================
   CA KÉP — trực ca chuẩn RỒI TĂNG CA thêm một ca nữa
   ------------------------------------------------------------
   Một ô lịch chỉ chứa được MỘT mã, nên trước đây người vừa trực ca O
   vừa tăng ca đêm chỉ hiện được "OTN" — nhìn vào không biết hôm đó họ
   đã làm ca O. Nay có mã ghép: nửa trái là CA CHUẨN, nửa phải là CA
   TĂNG. Ô lịch vẽ hai tông màu để nhìn phát biết ngay "vừa O vừa N".

   Mã ghép mang cat riêng 'combo' — KHÔNG phải 'work' cũng không phải
   'ot' — để những chỗ cộng giờ không nhầm cả 20h thành giờ công.
   comboOf() tách lại thành 2 phần, comboSplitHours() chia số giờ.

   Biểu mẫu công ty KHÔNG có ký hiệu ghép, nên mã ghép CHỈ dùng ở ô lịch
   (quản lý chọn trong hộp sửa ca) — form gửi đơn không có nó, vì cat
   'combo' không lọt qua bộ lọc của dsCodesFor(). Nhân viên xác nhận ô ca
   kép thì inferReqFromChange() sinh đơn BỔ SUNG CÔNG 2 dòng đúng biểu
   mẫu: một dòng ca chuẩn, một dòng ca tăng.
   ============================================================ */
const COMBO_CODES={
  'O+N':{work:'O', ot:'OTN'},
  'D+N':{work:'D', ot:'OTN'}
};
function comboOf(c){return COMBO_CODES[c]||null;}
function isCombo(c){return !!COMBO_CODES[c];}
/* Chia số giờ của ô ca kép thành phần CÔNG và phần TĂNG CA.
   `total` là số giờ thực của ô (effHours) — bỏ trống thì lấy giờ mặc
   định của hai mã cộng lại. Phần công lấy trọn giờ ca chuẩn, phần dôi
   ra tính cho tăng ca (làm thêm bao nhiêu thì tính tăng ca bấy nhiêu). */
function comboSplitHours(code,total){
  const cb=comboOf(code);if(!cb)return null;
  const hw=getHours(cb.work);
  const tot=(typeof total==='number'&&total>0)?total:(hw+getHours(cb.ot));
  const w=Math.min(hw,tot);
  return {work:w, ot:Math.max(0,tot-w), workCode:cb.work, otCode:cb.ot};
}
/* Mã ca CHUẨN nằm trong một ô (ca kép thì trả về nửa ca chuẩn).
   Dùng cho mọi phép đếm quân số D/N/O — người trực ca O rồi tăng ca
   đêm thì ngày đó vẫn phải được đếm là có mặt ở ca O. */
function workCodeOf(c){const cb=comboOf(c);return cb?cb.work:c;}
/* Mã TĂNG CA nằm trong một ô ('' nếu ô không có phần tăng ca) */
function otCodeOf(c){const cb=comboOf(c);return cb?cb.ot:(codeInfo(c).cat==='ot'?c:'');}
/* Đếm số ca D / N / O từ bảng đếm mã ca của calcStats().
   Gộp mã đổi ca (SD/SN/SO) và ca kép: "D+N" tính cho cột ca D, "O+N" tính
   cho cột ca O — vì đó là ca chuẩn người ta trực hôm ấy. Mã tăng ca đơn
   lẻ (OTD/OTN) KHÔNG tính vào đây, chúng có cột "Ca OT" riêng. */
const CNT_SHIFT={D:['D','SD','D+N'],N:['N','SN'],O:['O','SO','O+N']};
function cntShift(cnt,sh){
  return (CNT_SHIFT[sh]||[]).reduce((a,c)=>a+((cnt&&cnt[c])||0),0);
}

/* ============================================================
   MẪU TĂNG CA
   Chọn mẫu → tự điền giờ bắt đầu / kết thúc. Chọn "Tự điền giờ" thì
   người khai tự nhập. Mẫu ca đêm vắt qua nửa đêm nên ngày kết thúc
   mặc định là hôm sau.
   ============================================================ */
const OT_PRESETS=[
  {v:'OTL', code:'OTL', label:'Nghỉ trưa 12:00–13:00', from:'12:00', to:'13:00'},
  {v:'OT2', code:'OT2', label:'Sau giờ HC 18:00–20:00', from:'18:00', to:'20:00'},
  {v:'OT3', code:'OT3', label:'Sau giờ HC 17:00–20:00', from:'17:00', to:'20:00'},
  {v:'OTD', code:'OTD', label:'Ca ngày 08:00–20:00',    from:'08:00', to:'20:00'},
  {v:'OTN', code:'OTN', label:'Ca đêm 20:00–08:00 (qua đêm)', from:'20:00', to:'08:00', overnight:true},
  {v:'',    code:'OTD', label:'Tự điền giờ',            from:'',      to:''}
];
function otPreset(v){return OT_PRESETS.find(p=>p.v===v)||OT_PRESETS[OT_PRESETS.length-1];}
/* Số giờ tăng ca thật, tính từ mốc bắt đầu tới mốc kết thúc.
   Bỏ trống ngày kết thúc mà giờ ra ≤ giờ vào → hiểu là vắt qua nửa đêm. */
function otHours(iso,tFrom,isoEnd,tTo){
  if(!iso||!tFrom||!tTo)return 0;
  const a=new Date(iso+'T'+tFrom+':00');
  let b=new Date((isoEnd||iso)+'T'+tTo+':00');
  if(b<=a)b=new Date(b.getTime()+86400000);
  const h=(b-a)/3600000;
  return (h>0&&h<=72)?Math.round(h*10)/10:0;
}
let S={
  employees:[],           // {id,name,pos,role,team,empType,shiftType,a1,a2,order,active}
  base:{},                // base[empId][iso] = code   (bảng chuẩn, do generator điền)
  over:{},                // over[empId][iso] = {code, reqId?, by, at}  (sửa tay)
  requests:{},            // requests[id] = {...}
  accounts:{},            // accounts[empId] = {hash, by, at}  (whitelist đăng nhập nhân viên)
  settings:{minD:3,minN:3,minO:1,maxOffTeam:1,hours:{},customCodes:[],deptDefault:DEPT_DEFAULT_FALLBACK,approver1:APPROVER1_FALLBACK,approver2:APPROVER2_FALLBACK},
  printLog:{},            // printLog[batchId] = {ts, by, formType, reqIds:[...], rows, pages, reprint}
  notifs:{},              // notifs[id] = {kind, to, from, status, createdAt, ...payload} — xác nhận đổi lịch / đổi ca
  events:{},              // events[id] = {title, from, to, days?, scope, teams, notify} — sự kiện trên lịch (js/20-events.js)
  meta:{schedFrom:'',schedTo:''},
  rev:0
};
/* mgr  = duyệt đơn & sửa lịch thực tế (appr / admin / kmgr)
   adm  = quản trị toàn quyền (admin / kmgr)
   secr = được XEM số liệu cả tổ + in đơn (sec / appr / admin / kmgr)
   noSelf = KHÔNG thuộc đối tượng chấm công (thư ký / quản lý người Hàn /
            người đặt Kiểu ca = Không xếp lịch) → bỏ hẳn Trang chính cá nhân,
            đăng nhập vào là vào thẳng Lịch thực tế. Xem homeView(). */
let mgr=false, adm=false, secr=false, noSelf=false, myFE=false, fb=null, fbRef=null, applyingRemote=false, curCell=null, curView='cal';
/* Được vào màn Duyệt: quản lý (mgr) hoặc Field Engineer duyệt cấp 1 của nhóm */
function canAppr(){return mgr||myFE;}
/* Màn hình đầu tiên sau khi đăng nhập */
function homeView(){return noSelf?'real':'me';}
/* v4 mobile cal state */
let calMode='std', calMobileView='week', calDate=null, calCollapsed={};
const isMobile=()=>window.matchMedia('(max-width:767px)').matches;

/* =================== UTILS =================== */
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const isoOf=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const todayIso=()=>isoOf(new Date());
const DOW=['CN','T2','T3','T4','T5','T6','T7'];
const DOW_EN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const fmtVN=iso=>{const[y,m,d]=iso.split('-');return d+'/'+m;};
const fmtVNfull=iso=>{const[y,m,d]=iso.split('-');return d+'/'+m+'/'+y;};
/* Thứ trong tuần — đổi theo ngôn ngữ đang dùng (xem js/14-i18n.js) */
const isEN=()=>{try{return LANG==='en';}catch(e){return false;}};
const dowOf=iso=>(isEN()?DOW_EN:DOW)[new Date(iso+'T00:00:00').getDay()];
const dowShort=i=>(isEN()?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['T2','T3','T4','T5','T6','T7','CN'])[i];
const fmtDateTime=ts=>new Date(ts).toLocaleString(isEN()?'en-GB':'vi-VN');
const dayNum=iso=>Math.round(new Date(iso+'T00:00:00').getTime()/86400000);
function toast(m){const t=$('toast');t.textContent=m;t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',2600);}
function allCodes(){return DEFAULT_CODES.concat((S.settings&&S.settings.customCodes)||[]);}
function codeInfo(c){return allCodes().find(x=>x.c===c)||{c,l:c,col:'#64748B',cat:'other'};}
function getHours(c){
  const h=(S.settings&&S.settings.hours)||{};
  if(h[c]!==undefined&&h[c]!==''&&h[c]!==null)return +h[c]||0;
  if(DEFAULT_HOURS[c]!==undefined)return DEFAULT_HOURS[c];
  return 0;
}
/* Nhãn mã ca. Ca kép vẽ thành hai nửa "O|N" hai tông màu để nhìn phát
   biết vừa trực ca gì vừa tăng ca ca gì (xem .cc.combo trong css/ui.css). */
function chip(c,big){
  const cb=comboOf(c);
  if(cb){
    const a=codeInfo(cb.work), b=codeInfo(cb.ot);
    const bl={OTD:'D',OTN:'N'}[cb.ot]||cb.ot;
    return `<span class="cc combo${big?' big':''}" style="--cca:${a.col};--ccb:${b.col}" title="${esc(codeInfo(c).l)}"><i>${cb.work}</i><i>${bl}</i></span>`;
  }
  const i=codeInfo(c);return `<span class="cc${big?' big':''}" style="background:${i.col}">${c}</span>`;
}
function eff(empId,iso){const o=S.over[empId]&&S.over[empId][iso];if(o&&o.code)return{code:o.code,ovr:true,o};const b=S.base[empId]&&S.base[empId][iso];return b?{code:b,ovr:false}:{code:'',ovr:false};}
/* Số giờ thực của một ô lịch.
   Đơn tăng ca khai giờ tự do (VD 14:00–19:30 = 5.5h) nên khi duyệt, số giờ thật
   được ghi kèm vào ô lịch (o.hours). Có thì dùng, không có thì lấy giờ mặc định
   của mã ca. Nhờ vậy thống kê khớp đúng với giờ nhân viên đã khai. */
function effHours(empId,iso){
  const r=eff(empId,iso);
  if(!r.code)return 0;
  if(r.o&&typeof r.o.hours==='number'&&r.o.hours>0)return r.o.hours;
  return getHours(r.code);
}
function empById(id){return S.employees.find(e=>e.id===id);}
const ROLE_ORD={eng:0,oper:1,other:2};
/* Người CÓ nằm trong lịch ca. Thư ký / quản lý cấp trên đặt Kiểu ca =
   "Không xếp lịch" (shiftType='none') — vẫn có tài khoản, vẫn thao tác phần
   mềm, nhưng không hiện trong bảng lịch, không tính vào định mức nhân lực. */
function inSchedule(e){return !!e&&e.shiftType!=='none';}
/* Nhãn nhóm viết gọn: nhóm "Office" chỉ hiện "O" cho đỡ chiếm chỗ */
function teamShort(tm){
  const s=String(tm||'').trim();
  return /^office$/i.test(s)?'O':s;
}
function schedEmps(){return activeEmps().filter(inSchedule);}
function activeEmps(){return S.employees.filter(e=>e.active!==false).slice().sort((a,b)=>{
  const t=(a.team||'~~').localeCompare(b.team||'~~');if(t)return t;
  const r=(ROLE_ORD[a.role]??3)-(ROLE_ORD[b.role]??3);if(r)return r;
  return (a.order||999)-(b.order||999);});}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function newVc(){let id;do{id='vc'+Math.floor(10000000+Math.random()*89999999);}while(empById(id));return id;}
function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
/* Bỏ dấu tiếng Việt để tìm kiếm theo tên: "Hoàng Trung" khớp "hoang trung" */
function noAccent(s){
  return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\u0111]/g,'d').replace(/[\u0110]/g,'D').toLowerCase().trim();
}
/* ============================================================
   HAI KHỐI NHÂN LỰC: SẢN XUẤT vs VĂN PHÒNG
   ------------------------------------------------------------
   Nhóm A / B / C / D … là nhóm SẢN XUẤT, trực vận hành theo ca.
   Nhóm Office là nhóm VĂN PHÒNG, làm hành chính.
   Hai khối này KHÔNG thay ca / tăng ca cover cho nhau được:
   người Office không trực thay ca O của nhóm sản xuất và ngược lại.

   Công ty quy định ký hiệu ca in ra giấy vẫn là "O" cho cả hai,
   nên phần mềm KHÔNG đổi ký hiệu — chỉ gắn một "khoá ẩn" (pool)
   suy ra từ NHÓM của người đó: 'prod' hoặc 'office'. Mọi phép đếm
   thiếu nhân lực, ai đang nghỉ, khuyến nghị duyệt đơn… đều tính
   tách bạch theo pool. Xem js/18-advice.js.
   ============================================================ */
const POOL_PROD='prod', POOL_OFF='office';
const POOL_LABEL={prod:'Sản xuất',office:'Văn phòng'};
const POOL_SHORT={prod:'SX',office:'VP'};
const POOL_ICON ={prod:'🏭',office:'🏢'};
/* Tên nhóm nào được coi là khối văn phòng (viết sao cũng nhận) */
const OFFICE_TEAM_RE=/^(office|van phong|vp|hanh chinh|hc|admin|office team)$/;
function isOfficeTeam(tm){return OFFICE_TEAM_RE.test(noAccent(tm).replace(/\s+/g,' ').trim());}
function poolOfTeam(tm){return isOfficeTeam(tm)?POOL_OFF:POOL_PROD;}
function poolOf(e){return poolOfTeam(e&&e.team);}
function poolOfId(id){const e=empById(id);return e?poolOf(e):POOL_PROD;}
function samePool(aId,bId){return poolOfId(aId)===poolOfId(bId);}
/* Khoá ẩn của một ô lịch — dùng nội bộ để phân biệt O sản xuất / O văn phòng.
   KHÔNG bao giờ đưa ra bản in hay biểu mẫu công ty. */
function shiftKey(empId,code){return (code||'')+'@'+poolOfId(empId);}
function poolEmps(p){return schedEmps().filter(e=>poolOf(e)===p);}
function poolChip(p){return `<span class="pool-chip ${p}">${POOL_ICON[p]} ${POOL_SHORT[p]}</span>`;}
/* Ngưỡng cấu hình (tab Dữ liệu) */
function minOfShift(sh){
  if(sh==='D')return +S.settings.minD||0;
  if(sh==='N')return +S.settings.minN||0;
  if(sh==='O')return (S.settings.minO===''||S.settings.minO==null)?1:(+S.settings.minO||0);
  return 0;
}
function maxOffTeam(){const v=S.settings&&S.settings.maxOffTeam;return (v===''||v==null)?1:(+v||0);}

/* ============================================================
   VỊ TRÍ CHUẨN (position)
   ------------------------------------------------------------
   Trước đây "Vị trí" là ô chữ tự do. Nay chuẩn hoá thành danh sách
   để phần mềm HIỂU được vai trò — đặc biệt để xác định Field Engineer
   của nhóm (người duyệt cấp 1 khối sản xuất). posCode() suy mã chuẩn
   từ dữ liệu cũ (chữ tự do) nên KHÔNG cần chuyển đổi thủ công.
   ============================================================ */
const POSITIONS=[
  {v:'operator',   l:'Operator',                    pool:POOL_PROD},
  {v:'field_eng',  l:'Field Engineer',              pool:POOL_PROD},
  {v:'boardman',   l:'DCS Boardman',                pool:POOL_PROD},
  {v:'check_booth', l:'Check booth (Trạm cân)',     pool:POOL_OFF},
  {v:'interpreter', l:'Phiên dịch kiêm thư ký',     pool:POOL_OFF},
  {v:'office',     l:'Office (Kỹ sư văn phòng)',    pool:POOL_OFF},
  {v:'supervisor', l:'Supervisor (Giám sát – Hàn)', pool:POOL_OFF},
  {v:'pm',         l:'PM (Giám đốc nhà máy – Hàn)', pool:POOL_OFF}
];
function posInfo(v){return POSITIONS.find(p=>p.v===v)||null;}
function posLabel(v){const p=posInfo(v);return p?p.l:(v||'');}
/* Suy mã vị trí chuẩn từ e.pos (đã là mã thì giữ nguyên, còn là chữ tự do
   thì đoán theo từ khoá; cuối cùng rơi về role). KHÔNG ghi đè dữ liệu —
   khi người dùng chọn lại ở dropdown mới lưu mã chuẩn vào e.pos. */
function posCode(e){
  if(!e)return '';
  const raw=e.pos||'';
  if(posInfo(raw))return raw;
  const s=noAccent(raw).replace(/\s+/g,' ').trim();
  if(s){
    if(/field|hien truong|\bfe\b/.test(s))return 'field_eng';
    if(/board|dcs/.test(s))return 'boardman';
    if(/check|booth|tram can/.test(s))return 'check_booth';
    if(/phien dich|thu ky|interpreter|secretary/.test(s))return 'interpreter';
    if(/supervisor|giam sat/.test(s))return 'supervisor';
    if(/\bpm\b|giam doc|plant manager|director/.test(s))return 'pm';
    if(/office|van phong/.test(s))return 'office';
    if(/operator|van hanh|\boper\b/.test(s))return 'operator';
  }
  return e.role==='eng'?'field_eng':(e.role==='oper'?'operator':'');
}
function posCodeOfId(id){return posCode(empById(id));}
/* ------------------------------------------------------------
   NHÓM VỊ TRÍ: KỸ SƯ vs OPERATOR
   Trực ca không chỉ cần ĐỦ ĐẦU NGƯỜI mà phải đủ ĐÚNG LOẠI người:
   một ca phải có kỹ sư (Field Engineer ngoài hiện trường + DCS
   Boardman trong phòng điều khiển) và operator vận hành. Ba người
   operator không thay được một kỹ sư, nên bảng Nhân lực theo ngày
   đếm tách hai nhóm này ra.
   ------------------------------------------------------------ */
const POSG_ENG='eng', POSG_OPER='oper', POSG_OTHER='other';
const POSG_LABEL={eng:'Kỹ sư',oper:'Operator',other:'Khác'};
const POSG_FULL ={eng:'Kỹ sư (Field + DCS Boardman)',oper:'Operator',other:'Vị trí khác'};
const POSG_ICON ={eng:'🛠️',oper:'⚙️',other:'👤'};
const POSG_COLOR={eng:'#2563EB',oper:'#0F766E',other:'#64748B'};
/* field_eng + boardman = kỹ sư · operator = operator · còn lại = khác */
function posGroupOf(e){
  const p=posCode(e);
  if(p==='field_eng'||p==='boardman')return POSG_ENG;
  if(p==='operator')return POSG_OPER;
  if(p)return POSG_OTHER;
  /* Chưa khai vị trí thì rơi về vai trò cũ (role) để dữ liệu cũ vẫn xếp đúng */
  return e&&e.role==='eng'?POSG_ENG:(e&&e.role==='oper'?POSG_OPER:POSG_OTHER);
}
function posGroupOfId(id){return posGroupOf(empById(id));}
/* Chia một danh sách nhân viên thành 3 rổ theo nhóm vị trí */
function splitEO(list){
  const out={eng:[],oper:[],other:[]};
  (list||[]).forEach(e=>{(out[posGroupOf(e)]||out.other).push(e);});
  return out;
}
/* Dropdown chọn vị trí — value đã chuẩn hoá qua posCode() */
function posSelectHtml(e,extraStyle){
  const cur=posCode(e);
  return `<select class="inp sm" style="${extraStyle||'min-width:150px'}" onchange="updEmp('${e.id}','pos',this.value,true)">`
    +`<option value=""${cur?'':' selected'}>—</option>`
    +POSITIONS.map(p=>`<option value="${p.v}"${p.v===cur?' selected':''}>${esc(p.l)}</option>`).join('')
    +`</select>`;
}
/* Field Engineer của một nhóm sản xuất — người duyệt cấp 1.
   Ưu tiên người đã điền tên (có tài khoản). Trả về mã NV hoặc ''. */
function teamFieldEngId(team){
  if(!team)return '';
  const list=activeEmps().filter(e=>(e.team||'')===team&&posCode(e)==='field_eng');
  const named=list.find(e=>String(e.name||'').trim());
  return (named||list[0]||{}).id||'';
}

/* ============================================================
   CHUỖI DUYỆT NHIỀU CẤP
   ------------------------------------------------------------
   Khối SẢN XUẤT (A/B/C/D): Field Engineer nhóm → Hoàng Trung → QL người Hàn.
   Khối VĂN PHÒNG:                       Hoàng Trung → QL người Hàn.
   - Cấp cao duyệt thì cấp dưới tự động "duyệt theo" (cascade).
   - Hoàng Trung (trung) duyệt → TẠM ghi vào lịch thực tế (provisional),
     vì lãnh đạo người Hàn đôi khi bận / đi công tác chưa kịp duyệt.
   - QL người Hàn (kmgr) duyệt = CHỐT chính thức.
   Bậc: fe(1) < trung(2) < kmgr(3). Cấp cuối luôn là 'kmgr'.
   ============================================================ */
const LVL_ORD={fe:1,trung:2,kmgr:3};
const LVL_FINAL='kmgr', LVL_PROV='trung';
function lvlLabel(k){
  if(k==='fe')return 'Field Engineer';
  if(k==='trung'){const e=empById(ROOT_ADMIN);return (e&&e.name)||'Quản trị';}
  if(k==='kmgr')return 'Quản lý người Hàn';
  return k;
}
/* Chuỗi cấp cần duyệt cho một đơn — suy từ khối & nhóm của người đứng đơn */
function reqChain(r){
  const emp=empById(r&&r.empId);
  const pool=poolOfId(r&&r.empId);
  if(pool===POOL_PROD && emp && teamFieldEngId(emp.team) && teamFieldEngId(emp.team)!==r.empId)
    return ['fe','trung','kmgr'];
  return ['trung','kmgr'];
}
/* Cấp mà 'who' được phép duyệt cho đơn r (null nếu không có quyền) */
function apprLevelOf(who,r){
  if(!who||!r)return null;
  const p=(typeof permOf==='function')?permOf(who):'staff';
  if(p==='kmgr')return 'kmgr';
  if((typeof isRootAdmin==='function'&&isRootAdmin(who))||p==='admin')return 'trung';
  const e=empById(who);
  if(e&&posCode(e)==='field_eng'){
    const emp=empById(r.empId);
    if(reqChain(r).includes('fe')&&emp&&emp.team&&emp.team===e.team)return 'fe';
  }
  if(p==='appr')return 'trung';   // tương thích: quyền "Duyệt đơn" cũ = cấp Trung
  return null;
}
/* Cấp thấp nhất trong chuỗi CHƯA được duyệt (đơn đang chờ ai) */
function reqNextLevel(r){
  const ap=(r&&r.appr)||{};
  for(const k of reqChain(r))if(!ap[k]||ap[k].reject)return k;
  return null;   // đã đủ mọi cấp
}
/* Đơn đã có cấp Trung duyệt nhưng chưa tới cấp cuối → đang TẠM DUYỆT */
function reqIsProvisional(r){
  if(!r||r.status!=='approved')return false;
  const ap=r.appr||{};const ch=reqChain(r);
  return ch.includes(LVL_FINAL)&&(!ap[LVL_FINAL])&&!!ap[LVL_PROV];
}

function firstOfMonthIso(){const d=new Date();return isoOf(new Date(d.getFullYear(),d.getMonth(),1));}
function lastOfMonthIso(){const d=new Date();return isoOf(new Date(d.getFullYear(),d.getMonth()+1,0));}
function curMonthStr(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1);}
