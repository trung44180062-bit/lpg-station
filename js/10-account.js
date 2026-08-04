/* ============================================================
   TAI KHOAN — SHA-256, dang nhap NV, tab 'Cua toi'
   LPGT Cavern — Quan ly Cong Ca v4
   ============================================================ */
/* =================== SHA-256 (thuần JS, cho hash mật khẩu) =================== */
function sha256(ascii){
  function rightRotate(v,a){return(v>>>a)|(v<<(32-a));}
  var mathPow=Math.pow,maxWord=mathPow(2,32),result='';
  var words=[],asciiBitLength=ascii.length*8;
  var hash=sha256.h=sha256.h||[],k=sha256.k=sha256.k||[],primeCounter=k.length;
  var isComposite={};
  for(var candidate=2;primeCounter<64;candidate++){
    if(!isComposite[candidate]){
      for(var i=0;i<313;i+=candidate)isComposite[i]=candidate;
      hash[primeCounter]=(mathPow(candidate,.5)*maxWord)|0;
      k[primeCounter++]=(mathPow(candidate,1/3)*maxWord)|0;
    }
  }
  ascii+='\x80';
  while(ascii.length%64-56)ascii+='\x00';
  for(i=0;i<ascii.length;i++){
    var j=ascii.charCodeAt(i);
    if(j>>8)return'';
    words[i>>2]|=j<<((3-i)%4)*8;
  }
  words[words.length]=(asciiBitLength/maxWord)|0;
  words[words.length]=asciiBitLength;
  for(j=0;j<words.length;){
    var w=words.slice(j,j+=16),oldHash=hash;
    hash=hash.slice(0,8);
    for(i=0;i<64;i++){
      var w15=w[i-15],w2=w[i-2];
      var a=hash[0],e=hash[4];
      var temp1=hash[7]+(rightRotate(e,6)^rightRotate(e,11)^rightRotate(e,25))+((e&hash[5])^((~e)&hash[6]))+k[i]+(w[i]=(i<16)?w[i]:(w[i-16]+(rightRotate(w15,7)^rightRotate(w15,18)^(w15>>>3))+w[i-7]+(rightRotate(w2,17)^rightRotate(w2,19)^(w2>>>10)))|0);
      var temp2=(rightRotate(a,2)^rightRotate(a,13)^rightRotate(a,22))+((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));
      hash=[(temp1+temp2)|0].concat(hash);
      hash[4]=(hash[4]+temp1)|0;
    }
    for(i=0;i<8;i++)hash[i]=(hash[i]+oldHash[i])|0;
  }
  for(i=0;i<8;i++){
    for(j=3;j+1;j--){
      var b=(hash[i]>>(j*8))&255;
      result+=((b<16)?0:'')+b.toString(16);
    }
  }
  return result;
}
function hashPw(id,pw){return sha256(unescape(encodeURIComponent(id+'|'+pw)));}

/* ============================================================
   TÀI KHOẢN ĐĂNG NHẬP
   Operator không có email nên đăng nhập bằng MÃ NHÂN VIÊN (phần số).

   Cách lưu mật khẩu (xem thêm BAO-MAT.md):
     · Chưa đặt mật khẩu riêng → chỉ ghi cờ {init:true}, KHÔNG lưu chuỗi băm
       nào cả. Mật khẩu tạm thời là chính mã số. Không có gì để lộ.
     · Đã đặt mật khẩu → lưu {alg:'pbkdf2', it, salt, hash}. PBKDF2-SHA256
       150 000 vòng, muối ngẫu nhiên 16 byte cho từng người, tính bằng
       WebCrypto của trình duyệt. Không lưu mật khẩu gốc ở bất kỳ đâu và
       KHÔNG viết mật khẩu nào trong mã nguồn.
     · Bản băm cũ (sha256 trần) vẫn đăng nhập được, và được nâng cấp âm thầm
       sang PBKDF2 ngay lần đăng nhập thành công kế tiếp.
   ============================================================ */
const SESS=LS+'_sess';
const PBKDF2_ITER=150000;

/* ---- Tiện ích mã hoá ---- */
function _hex(buf){return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function _rndSalt(){const a=new Uint8Array(16);(crypto||window.crypto).getRandomValues(a);return _hex(a);}
function _hasWebCrypto(){try{return !!(crypto&&crypto.subtle&&crypto.subtle.importKey);}catch(e){return false;}}

/* Băm mật khẩu bằng PBKDF2 — trả về Promise chuỗi hex */
async function pbkdf2Hex(pw,saltHex,iter){
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);
  const salt=Uint8Array.from(saltHex.match(/.{2}/g).map(h=>parseInt(h,16)));
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter||PBKDF2_ITER},key,256);
  return _hex(bits);
}
/* Tạo bản ghi mật khẩu mới cho một người */
async function makePwRecord(id,pw){
  if(_hasWebCrypto()){
    const salt=_rndSalt();
    const hash=await pbkdf2Hex(pw,salt,PBKDF2_ITER);
    return{alg:'pbkdf2',it:PBKDF2_ITER,salt,hash};
  }
  // Trình duyệt quá cũ (hoặc mở qua file:// không có crypto.subtle) → quay về sha256
  return{alg:'sha256',hash:hashPw(id,pw)};
}
/* Kiểm tra mật khẩu — trả về Promise<boolean> */
async function verifyPw(id,pw,acc){
  if(!acc)return false;
  if(acc.init&&!acc.hash)return pw===loginKey(id)||pw===id;     // chưa đặt mật khẩu riêng
  if(acc.alg==='pbkdf2'&&acc.salt){
    try{return (await pbkdf2Hex(pw,acc.salt,acc.it||PBKDF2_ITER))===acc.hash;}catch(e){return false;}
  }
  return hashPw(id,pw)===acc.hash;                              // bản cũ sha256
}

/* ===================== PHÂN QUYỀN =====================
     'staff' — nhân viên thường (mặc định): xem lịch của mình, gửi đơn
     'sec'   — Thư ký: xem hết lịch & báo cáo, in đơn, khai hộ đơn.
               KHÔNG duyệt đơn, KHÔNG sửa cấu hình.
     'appr'  — Duyệt đơn: thêm quyền duyệt/từ chối và sửa lịch thực tế
     'admin' — Quản trị: thêm Nhóm & Lịch, Dữ liệu, quản lý tài khoản
     'kmgr'  — Quản lý người Hàn: quyền y hệt 'admin', khác duy nhất là
               đăng nhập vào là giao diện TIẾNG ANH (xem js/14-i18n.js)
   Người không nằm trong lịch ca (thư ký, sếp Hàn) đặt Kiểu ca = "Không xếp lịch".
   ROOT_ADMIN luôn là quản trị để còn người cấp quyền cho những người khác.
   ====================================================== */
const ROOT_ADMIN='vc44180062';
const PERM_LABEL={staff:'Nhân viên',sec:'Thư ký',appr:'Duyệt đơn',admin:'Quản trị',kmgr:'Quản lý người Hàn (EN)'};
const PERM_HINT ={
  staff:'Xem lịch của mình, gửi đơn',
  sec:'Xem hết lịch & báo cáo, in đơn, khai hộ — không duyệt đơn',
  appr:'Như Thư ký, thêm quyền duyệt đơn và sửa lịch thực tế',
  admin:'Toàn quyền: Nhóm & Lịch, Dữ liệu, quản lý tài khoản',
  kmgr:'Toàn quyền như Quản trị, giao diện mặc định tiếng Anh'
};
const PERM_VALUES=['staff','sec','appr','admin','kmgr'];

function isRootAdmin(id){
  if(!id)return false;
  return String(id)===ROOT_ADMIN || loginKey(id)===loginKey(ROOT_ADMIN);
}
function permOf(id){
  if(!id)return 'staff';
  if(isRootAdmin(id))return 'admin';
  const e=empById(id);
  const p=e&&e.perm;
  return PERM_VALUES.includes(p)?p:'staff';
}
/* Đọc lại quyền của người đang đăng nhập → cập nhật các cờ toàn cục */
function applyPerm(){
  const me=meId();
  const p=permOf(me);
  adm =(p==='admin'||p==='kmgr');
  mgr =(p==='admin'||p==='kmgr'||p==='appr');
  secr=(p==='sec')||mgr;                        // được xem số liệu cả tổ
  /* Thư ký & quản lý người Hàn không nằm trong đối tượng chấm công → bỏ
     Trang chính cá nhân, vào thẳng Lịch thực tế. Ai đặt Kiểu ca = Không
     xếp lịch cũng vậy. */
  const e=me?empById(me):null;
  noSelf=!!me && (p==='sec'||p==='kmgr'|| (e&&e.shiftType==='none'));
  // Field Engineer của nhóm sản xuất = người duyệt cấp 1 (dù quyền là Nhân viên)
  myFE=!!(e && typeof posCode==='function' && posCode(e)==='field_eng');
  if(typeof applyLangForUser==='function')applyLangForUser();
  return p;
}

/* ---- TÊN ĐĂNG NHẬP = PHẦN SỐ CỦA MÃ NV ----------------------------
   Mã NV trong dữ liệu giữ nguyên (vd vc44180062) — mọi bảng biểu, biểu mẫu
   in và file Excel vẫn hiện đúng như cũ. Riêng màn hình đăng nhập chỉ dùng
   phần số (44180062) cho cả tên đăng nhập lẫn mật khẩu mặc định, để bàn phím
   điện thoại bật sẵn chế độ số.
   ------------------------------------------------------------------- */
function loginKey(id){
  const d=String(id||'').replace(/\D/g,'');
  return d||String(id||'');
}
/* Dòng đã điền đủ để trở thành tài khoản đăng nhập */
function canHaveAccount(e){return !!(e&&e.id&&String(e.name||'').trim());}
function isRealEmpId(id){return canHaveAccount(empById(id));}

/* Đánh dấu một mã NV là có tài khoản. KHÔNG tính băm ở đây — chỉ ghi cờ
   {init:true} nghĩa là "mật khẩu tạm thời = mã số, chưa ai đặt riêng". */
function ensureAccount(id,silent){
  if(!id)return false;
  const e=empById(id);
  if(e&&!canHaveAccount(e))return false;
  S.accounts=S.accounts||{};
  const a=S.accounts[id];
  if(a&&(a.hash||a.init))return false;
  S.accounts[id]={init:true,by:'auto',at:Date.now()};
  if(!silent)toast(t('Đã tạo tài khoản')+' '+loginKey(id)+' '+t('(mật khẩu = mã số)'));
  return true;
}
function syncAccounts(){
  let changed=false;
  S.employees.forEach(e=>{
    if(e.active===false||!canHaveAccount(e))return;
    if(ensureAccount(e.id,true))changed=true;
  });
  if(changed)save();
  return changed;
}
/* Còn đang dùng mật khẩu mặc định (= mã số) hay chưa */
function usingDefaultPw(id){
  const a=S.accounts&&S.accounts[id];
  return !!(a&&a.init&&!a.hash);
}

function meId(){
  try{const s=JSON.parse(localStorage.getItem(SESS)||'null');
    // Tài khoản hợp lệ khi đã có bản băm riêng HOẶC còn dùng mật khẩu mặc định (init)
    const a=s&&s.id&&S.accounts&&S.accounts[s.id];
    if(s&&s.id&&empById(s.id)&&a&&(a.hash||a.init))return s.id;
  }catch(e){}
  return null;
}
function meEmp(){const id=meId();return id?empById(id):null;}

/* ===== Cổng đăng nhập che toàn bộ ứng dụng ===== */
function renderGate(){
  const g=$('gate');if(!g)return;
  applyPerm();
  const open=!!meId();
  g.style.display=open?'none':'flex';
  document.body.classList.toggle('locked',!open);
  if(open)return;
  const gt=$('gateStatusTxt');
  if(gt&&$('syncTxt')){
    const n=(S.employees||[]).length;
    gt.textContent=$('syncTxt').textContent+(n?(' · '+n+' nhân viên'):' · chưa có dữ liệu nhân sự');
  }
  const f=$('loginId');if(f&&!f.value)setTimeout(()=>{try{f.focus();}catch(e){}},80);
}
/* Tìm nhân viên theo mã số — bỏ qua khoảng trắng, HOA/thường và tiền tố chữ.
   Trả về {emp} nếu khớp duy nhất, {many:[...]} nếu nhiều người trùng phần số. */
function findEmpLoose(raw){
  const k=String(raw||'').trim();
  if(!k)return{};
  const e=empById(k);
  if(e)return{emp:e};
  const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,'');
  const byFull=S.employees.filter(x=>norm(x.id)===norm(k));
  if(byFull.length===1)return{emp:byFull[0]};
  const num=k.replace(/\D/g,'');
  if(!num)return{};
  const byNum=S.employees.filter(x=>loginKey(x.id)===num);
  if(byNum.length===1)return{emp:byNum[0]};
  if(byNum.length>1)return{many:byNum};
  return{};
}

async function doLogin(){
  const raw=$('loginId').value.trim(),pw=$('loginPw').value;
  if(!raw||!pw){gateMsg(t('Nhập cả mã nhân viên và mật khẩu.'));return;}

  if(!S.employees||!S.employees.length){
    gateMsg(t('Chưa tải được danh sách nhân sự. Kiểm tra kết nối mạng rồi thử lại — hoặc nhờ quản lý mở app một lần trên máy này để đồng bộ.'));
    return;
  }
  const found=findEmpLoose(raw);
  if(found.many){
    gateMsg(t('Có')+' '+found.many.length+' '+t('người cùng mã số <b>')+esc(loginKey(raw))+t('</b>. Nhờ quản lý sửa lại cho mỗi người một mã riêng.'));
    return;
  }
  const e=found.emp;
  if(!e){
    gateMsg(t('Không tìm thấy mã nhân viên <b>')+esc(raw)+t('</b>. Nhập phần số trong ô <b>Mã NV</b> ở tab Nhóm &amp; Lịch, ví dụ <b>44180062</b>.'));
    return;
  }
  const id=e.id, key=loginKey(id);
  if(!canHaveAccount(e)){
    gateMsg(t('Mã <b>')+esc(key)+t('</b> chưa có họ tên trong danh sách nên chưa được cấp tài khoản. Nhờ quản lý điền họ tên giúp.'));
    return;
  }
  ensureAccount(id,true);
  const acc=S.accounts&&S.accounts[id];
  if(!acc){gateMsg(t('Không tạo được tài khoản cho mã này — liên hệ quản lý.'));return;}

  const btn=$('gateBtn');if(btn){btn.disabled=true;btn.textContent=t('Đang kiểm tra…');}
  let ok=false;
  try{ok=await verifyPw(id,pw,acc);}catch(err){ok=false;}
  if(btn){btn.disabled=false;btn.textContent=t('Đăng nhập');}

  if(!ok){
    gateMsg(t('Sai mật khẩu. Nếu chưa từng đổi, mật khẩu chính là mã số của bạn: <b>')+esc(key)+'</b>');
    return;
  }
  // Tài khoản còn dùng bản băm sha256 cũ → nâng cấp âm thầm sang PBKDF2
  if(acc.hash&&acc.alg!=='pbkdf2'&&_hasWebCrypto()){
    try{Object.assign(S.accounts[id],await makePwRecord(id,pw),{at:Date.now(),by:'auto-upgrade',init:false});save();}catch(err){}
  }
  localStorage.setItem(SESS,JSON.stringify({id,at:Date.now()}));
  localStorage.setItem(LS+'_me',id);
  $('loginPw').value='';$('loginId').value='';
  gateMsg('');
  markSeen(id);
  renderGate();applyRoleUI();refreshBadge();go(homeView());
  applyLangForUser();
  toast(t('Xin chào')+' '+(e.name||id)+' 👋');
}

/* Hiện lỗi ngay trên thẻ đăng nhập (toast bị cổng che nên khó thấy) */
function gateMsg(html){
  const b=$('gateMsg');if(!b)return;
  b.innerHTML=html||'';
  b.style.display=html?'':'none';
}
function doLogout(){
  localStorage.removeItem(SESS);
  mgr=false;adm=false;secr=false;noSelf=false;
  renderGate();applyRoleUI();renderMe();toast(t('Đã đăng xuất'));
}
/* Kiểm tra mật khẩu mới có đủ an toàn không */
function pwProblem(id,pw){
  const p=(pw||'').trim();
  if(p.length<6)return 'Mật khẩu mới tối thiểu 6 ký tự';
  if(p===id||p===loginKey(id))return 'Không dùng lại mã nhân viên làm mật khẩu';
  if(/^(\d)\1+$/.test(p))return 'Mật khẩu quá dễ đoán';
  if('0123456789'.includes(p)||'9876543210'.includes(p))return 'Mật khẩu quá dễ đoán';
  return '';
}
async function changeMyPass(){
  const id=meId();if(!id)return;
  const cur=$('mePwCur').value,n1=($('mePwNew').value||'').trim(),n2=($('mePwNew2')?$('mePwNew2').value:n1).trim();
  const acc=S.accounts[id];
  if(!await verifyPw(id,cur,acc)){toast(t('Mật khẩu hiện tại không đúng'));return;}
  const bad=pwProblem(id,n1);
  if(bad){toast(t(bad));return;}
  if(n1!==n2){toast(t('Hai ô mật khẩu mới chưa khớp'));return;}
  S.accounts[id]=Object.assign(await makePwRecord(id,n1),{at:Date.now(),by:'self',init:false});
  save();
  ['mePwCur','mePwNew','mePwNew2'].forEach(k=>{if($(k))$(k).value='';});
  toast(t('Đã đổi mật khẩu ✔'));renderMe(true);
}

/* ===== Thống kê cá nhân / chung ===== */
function calcStats(id,days){
  const cnt={};let hWork=0,hOT=0,hLeave=0;
  days.forEach(iso=>{
    const c=eff(id,iso).code;if(!c)return;
    cnt[c]=(cnt[c]||0)+1;
    const cat=codeInfo(c).cat,h=effHours(id,iso);
    /* Ca kép: 20h của "O+N" KHÔNG phải 20h giờ công — tách 8h công + 12h tăng ca */
    const sp=(typeof comboSplitHours==='function')&&comboSplitHours(c,h);
    if(sp){hWork+=sp.work;hOT+=sp.ot;}
    else if(cat==='work'||cat==='swap')hWork+=h;
    else if(cat==='ot')hOT+=h;
    else if(cat==='leave')hLeave+=h;
  });
  return{cnt,hWork,hOT,hLeave};
}
/* Số CA tăng ca — ca kép cũng là một lần tăng ca */
function otShifts(s){return Object.entries(s.cnt)
  .filter(([c])=>codeInfo(c).cat==='ot'||(typeof isCombo==='function'&&isCombo(c)))
  .reduce((a,[,n])=>a+n,0);}
const rnd1=v=>Math.round(v*10)/10;

/* Tab 'Cua toi' (trang chinh nhan vien) da chuyen sang js/13-portal.js */
