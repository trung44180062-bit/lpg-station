/* ============================================================
   STORAGE + FIREBASE — localStorage, dong bo Realtime DB
   LPGT Cavern — Quan ly Cong Ca v4
   ------------------------------------------------------------
   ĐỒNG BỘ THEO DELTA (từ bản v4.7)

   Bản cũ nghe `on('value')` ngay gốc và ghi bằng `set(S)`: mỗi lần BẤT KỲ
   ai đổi một ô lịch là MỌI máy tải lại TOÀN BỘ dữ liệu (nhân sự + lịch
   chuẩn + lịch thực tế + toàn bộ đơn + nhật ký in…). Gói Firebase Spark
   tính tiền theo băng thông tải xuống nên cách đó rất phí.

   Bản này chia dữ liệu thành các NHÁNH và nghe ở mức CON:
     · Nhánh dạng bảng (base / over / requests / accounts / printLog /
       notifs) → nghe child_added / child_changed / child_removed. Sửa lịch
       của một người thì chỉ nhánh của đúng người đó bay về.
     · Nhánh nhỏ, hay đọc trọn gói (employees / settings / meta) → nghe
       value như cũ, vì chúng bé và luôn cần đủ.
   Khi ghi cũng vậy: so với ảnh chụp lần đồng bộ trước rồi chỉ `update()`
   đúng những khoá đã đổi, thay vì đẩy lại cả cây.

   Kết quả: lần đầu mở app tải một lượt đủ dữ liệu cần thiết, sau đó chỉ
   còn phần thay đổi chạy qua lại. SCHEMA GIỮ NGUYÊN — dữ liệu cũ trên
   Firebase dùng lại được ngay, không cần chuyển đổi gì.
   ============================================================ */

/* Nhánh dạng bảng: khoá là mã NV / id đơn → nghe & ghi ở mức con */
const FB_MAP_BRANCHES=['base','over','requests','accounts','printLog','notifs','events'];
/* Nhánh nghe trọn gói (nhỏ, và luôn cần đủ để render) */
const FB_VAL_BRANCHES=['employees','settings','meta'];

let _fbLast=null;        // ảnh chụp JSON của lần đồng bộ gần nhất (để tính delta)
let _fbSeen=null;        // id nào đã thấy từ máy chủ, dùng để dọn rác cục bộ
let _fbRemoteRev=0;      // rev phía máy chủ
let _fbSettleT=null;     // hẹn giờ "đã tải xong đợt đầu"
let _fbRenderT=null;     // gộp nhiều sự kiện con thành một lần vẽ lại
let _fbBooted=false;     // đã xử lý xong đợt đồng bộ đầu tiên chưa

/* =================== STORAGE =================== */
function save(){
  S.rev=Date.now();
  localStorage.setItem(LS,JSON.stringify(S));
  fbPush();
  refreshBadge();
}
function load(){
  try{const raw=localStorage.getItem(LS);if(raw){const d=JSON.parse(raw);S=Object.assign(S,d);
    S.settings=Object.assign({minD:3,minN:3,deptDefault:DEPT_DEFAULT_FALLBACK,approver1:APPROVER1_FALLBACK,approver2:APPROVER2_FALLBACK},d.settings||{});
    S.meta=Object.assign({schedFrom:'',schedTo:''},d.meta||{});}}catch(e){}
  normalizeState();
}
/* Điền các mặc định còn thiếu — gọi sau khi nạp từ localStorage và sau mỗi
   lần nhận nhánh settings mới từ máy chủ. */
function normalizeState(){
  S.employees=S.employees||[];
  S.base=S.base||{};S.over=S.over||{};S.requests=S.requests||{};
  S.accounts=S.accounts||{};S.printLog=S.printLog||{};S.notifs=S.notifs||{};
  S.events=S.events||{};                 // sự kiện trên lịch — xem js/20-events.js
  S.settings=S.settings||{minD:3,minN:3};
  S.settings.hours=S.settings.hours||{};
  S.settings.customCodes=S.settings.customCodes||[];
  S.settings.deptDefault=S.settings.deptDefault||DEPT_DEFAULT_FALLBACK;
  S.settings.approver1=S.settings.approver1||APPROVER1_FALLBACK;
  S.settings.approver2=S.settings.approver2||APPROVER2_FALLBACK;
  if(S.settings.minO===undefined)S.settings.minO=1;
  if(S.settings.maxOffTeam===undefined)S.settings.maxOffTeam=1;
  S.meta=Object.assign({schedFrom:'',schedTo:''},S.meta||{});
}

/* =================== DELTA =================== */
/* Ảnh chụp: mỗi nhánh value là 1 chuỗi JSON, mỗi nhánh map là bảng
   {id → chuỗi JSON}. So chuỗi là biết chính xác cái gì đã đổi. */
function fbSnapshot(){
  const s={v:{},m:{}};
  FB_VAL_BRANCHES.forEach(k=>{s.v[k]=JSON.stringify(S[k]===undefined?null:S[k]);});
  FB_MAP_BRANCHES.forEach(k=>{
    const src=S[k]||{},out={};
    Object.keys(src).forEach(id=>{out[id]=JSON.stringify(src[id]);});
    s.m[k]=out;
  });
  return s;
}
/* Danh sách khoá cần ghi lên máy chủ (dạng đường dẫn nhiều mức của update()) */
function fbDiff(prev,cur){
  const patch={};let n=0;
  FB_VAL_BRANCHES.forEach(k=>{
    if(!prev||prev.v[k]!==cur.v[k]){patch[k]=(S[k]===undefined?null:S[k]);n++;}
  });
  FB_MAP_BRANCHES.forEach(k=>{
    const a=(prev&&prev.m[k])||{}, b=cur.m[k];
    Object.keys(b).forEach(id=>{if(a[id]!==b[id]){patch[k+'/'+id]=S[k][id];n++;}});
    Object.keys(a).forEach(id=>{if(b[id]===undefined){patch[k+'/'+id]=null;n++;}});
  });
  return {patch,n};
}
function fbPush(){
  if(!fbRef||applyingRemote)return;
  const cur=fbSnapshot();
  const d=fbDiff(_fbLast,cur);
  _fbLast=cur;                         // ghi mốc TRƯỚC khi gửi để chặn tiếng vọng
  if(!d.n)return;
  d.patch.rev=S.rev;
  fbRef.update(d.patch).catch(e=>{console.warn('FB write',e);setSync(false,'Lỗi ghi');});
}
/* Gộp nhiều sự kiện con thành một lần vẽ lại — nhận 30 ô lịch mà vẽ 30 lần
   thì giao diện giật, mà vẽ 1 lần là đủ. */
function fbTouch(){
  clearTimeout(_fbRenderT);
  /* Dữ liệu về từ máy khác KHÔNG đi qua save() nên S.rev không đổi → các bộ
     đệm khoá theo S.rev phải được xoá tay ở đây, nếu không sẽ hiện số cũ. */
  if(typeof mealResetCache==='function')mealResetCache();
  if(typeof evResetCache==='function')evResetCache();
  _fbRenderT=setTimeout(()=>{
    localStorage.setItem(LS,JSON.stringify(S));
    if(typeof renderAll==='function')renderAll();
  },120);
}

/* =================== KẾT NỐI =================== */
function initFb(){
  const cfgRaw=localStorage.getItem(LS+'_fb');
  let cfg;
  if(cfgRaw){try{cfg=JSON.parse(cfgRaw);}catch(e){setSync(false,'Config lỗi');return;}}
  else{cfg=APP_CFG.firebase;} // config mac dinh lay tu js/config.js
  if(!cfg){setSync(false,'Chua co config (js/config.js)');return;}
  if(typeof firebase==='undefined'){setSync(false,'SDK chưa tải');return;}
  try{
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    fb=firebase;
    const done=()=>fbAttach();
    if(firebase.auth){firebase.auth().signInAnonymously().then(done).catch(done);}else done();
    setSync(true,'Đang kết nối…');
  }catch(e){setSync(false,'Lỗi kết nối');console.warn(e);}
}
function fbErr(err){setSync(false,'Lỗi quyền');console.warn(err);}

function fbAttach(){
  fbRef=firebase.database().ref(APP_CFG.dbPath);
  _fbLast=null;                 // chưa biết máy chủ có gì → đợi đợt đầu về
  _fbSeen={};_fbBooted=false;_fbRemoteRev=0;
  FB_MAP_BRANCHES.forEach(k=>{_fbSeen[k]={};});

  /* rev — chỉ để biết dữ liệu bên nào mới hơn, tốn vài byte */
  fbRef.child('rev').on('value',s=>{_fbRemoteRev=+s.val()||0;fbSettle();},fbErr);

  /* Nhánh nhỏ: nghe trọn gói */
  FB_VAL_BRANCHES.forEach(k=>{
    fbRef.child(k).on('value',snap=>{
      const val=snap.val();
      if(val===null){fbSettle();setSync(true,'Đã đồng bộ');return;}
      const js=JSON.stringify(val);
      if(_fbLast&&_fbLast.v[k]===js){setSync(true,'Đã đồng bộ');fbSettle();return;}  // tiếng vọng của chính mình
      applyingRemote=true;
      S[k]=val;
      normalizeState();
      applyingRemote=false;
      fbMark(k,null,JSON.stringify(S[k]));
      fbTouch();fbSettle();
      setSync(true,'Đã đồng bộ');
    },fbErr);
  });

  /* Nhánh bảng: nghe ở mức con → chỉ phần thay đổi bay về */
  FB_MAP_BRANCHES.forEach(k=>{
    const ref=fbRef.child(k);
    const put=snap=>{
      const id=snap.key, val=snap.val(), js=JSON.stringify(val);
      _fbSeen[k][id]=1;
      if(_fbLast&&_fbLast.m[k]&&_fbLast.m[k][id]===js){fbSettle();return;}
      applyingRemote=true;
      S[k]=S[k]||{};S[k][id]=val;
      applyingRemote=false;
      fbMark(k,id,js);
      fbTouch();fbSettle();
    };
    const del=snap=>{
      const id=snap.key;
      delete _fbSeen[k][id];
      if(!S[k]||S[k][id]===undefined){fbSettle();return;}
      applyingRemote=true;
      delete S[k][id];
      applyingRemote=false;
      fbMark(k,id,undefined);
      fbTouch();fbSettle();
    };
    ref.on('child_added',put,fbErr);
    ref.on('child_changed',put,fbErr);
    ref.on('child_removed',del,fbErr);
  });
}
/* Ghi lại mốc đồng bộ cho một khoá vừa nhận từ máy chủ */
function fbMark(branch,id,js){
  if(!_fbLast)_fbLast={v:{},m:{}};
  FB_MAP_BRANCHES.forEach(b=>{_fbLast.m[b]=_fbLast.m[b]||{};});
  if(id===null){_fbLast.v[branch]=js;return;}
  if(js===undefined)delete _fbLast.m[branch][id];
  else _fbLast.m[branch][id]=js;
}

/* ------------------------------------------------------------
   XONG ĐỢT ĐẦU
   Firebase bắn hàng loạt sự kiện khi vừa gắn listener; đợi im lặng
   ~900ms là coi như đã tải xong ảnh hiện trạng của máy chủ. Lúc đó mới
   quyết định: máy chủ trống thì đẩy dữ liệu máy này lên (khởi tạo lần
   đầu); ngược lại thì dọn những bản ghi máy này còn giữ mà máy chủ đã xoá.
   ------------------------------------------------------------ */
function fbSettle(){
  clearTimeout(_fbSettleT);
  _fbSettleT=setTimeout(fbBootSync,900);
}
function fbBootSync(){
  if(_fbBooted||!fbRef)return;
  _fbBooted=true;
  setSync(true,'Đã đồng bộ');

  const serverEmpty=!_fbRemoteRev&&!(_fbLast&&_fbLast.v.employees);
  if(serverEmpty){
    // Cơ sở dữ liệu còn trắng → đẩy toàn bộ dữ liệu máy này lên làm bản gốc
    if((S.employees||[]).length){_fbLast=null;fbPush();}
    return;
  }
  /* Máy chủ mới hơn: những id máy này còn giữ mà máy chủ không có nghĩa là
     đã bị xoá lúc mình offline → bỏ đi cho khớp. Nếu dữ liệu máy này mới hơn
     (sửa lúc mất mạng) thì giữ nguyên và đẩy phần thiếu lên. */
  if(_fbRemoteRev>(S.rev||0)){
    let n=0;
    applyingRemote=true;
    FB_MAP_BRANCHES.forEach(k=>{
      Object.keys(S[k]||{}).forEach(id=>{if(!_fbSeen[k][id]){delete S[k][id];n++;}});
    });
    applyingRemote=false;
    if(n)fbTouch();
    _fbLast=fbSnapshot();
  }else{
    fbPush();   // máy này có phần máy chủ chưa có → đẩy đúng phần đó
  }
}

function setSync(on,txt){
  $('syncDot').classList.toggle('on',on);$('syncTxt').textContent=txt;$('fbStatus').textContent=txt;
  // Hiện luôn trạng thái ở màn hình đăng nhập — không thì người dùng không biết vì sao login trượt
  const gd=$('gateDot'),gt=$('gateStatusTxt');
  if(gd)gd.classList.toggle('on',on);
  if(gt){
    const n=(S.employees||[]).length;
    gt.textContent=txt+(n?(' · '+n+' nhân viên'):' · chưa có dữ liệu nhân sự');
  }
}
function saveFbCfg(){
  const v=$('fbCfg').value.trim();
  if(!v){toast('Chưa dán config');return;}
  try{JSON.parse(v);}catch(e){toast('JSON không hợp lệ');return;}
  localStorage.setItem(LS+'_fb',v);toast('Đã lưu — đang kết nối');initFb();
}
function clearFbCfg(){localStorage.removeItem(LS+'_fb');if(fbRef){fbRef.off();fbRef=null;}$('fbCfg').value='';toast('Về config mặc định — đang kết nối');initFb();}
function wipeAll(){if(!confirm(t('Xoá toàn bộ dữ liệu trên máy này?')))return;localStorage.removeItem(LS);location.reload();}
