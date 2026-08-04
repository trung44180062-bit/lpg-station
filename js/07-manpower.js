/* ============================================================
   NHAN LUC — thong ke nhan su theo ngay
   LPGT Cavern — Quan ly Cong Ca v4
   ============================================================ */
/* =================== NHÂN LỰC (v2 — dòng gọn, chạm mở chi tiết) =================== */
/* mpBuckets(iso)         → gộp cả tổ (giữ nguyên cách gọi cũ)
   mpBuckets(iso,'prod')  → chỉ khối sản xuất A/B/C/D
   mpBuckets(iso,'office')→ chỉ khối văn phòng
   Hai khối không cover cho nhau nên định mức phải đếm tách bạch. */
/* Xếp một người vào đúng rổ theo mã ca của ngày đó.
   CA KÉP (O+N, D+N) được đếm HAI LẦN có chủ đích: người đó thật sự có
   mặt ở ca chuẩn (nên phải tính vào quân số ca O/D) và đồng thời đang
   tăng ca ca đêm (nên phải hiện trong danh sách tăng ca). Nếu chỉ đếm
   một nơi thì hoặc là ca chuẩn hụt người, hoặc là mất dấu giờ tăng ca. */
function mpPut(B,e,c){
  const cb=(typeof comboOf==='function')&&comboOf(c);
  const w=cb?cb.work:c;
  if(cb)B.ot.push({e,c});
  if(w==='D'||w==='SD')B.D.push(e);
  else if(w==='N'||w==='SN')B.N.push(e);
  else if(w==='O'||w==='SO')B.O.push(e);
  else if(w==='R')B.R.push(e);
  else if(!cb){
    const cat=codeInfo(c).cat;
    if(cat==='leave')B.leave.push({e,c});
    else if(cat==='ot')B.ot.push({e,c});
  }
}
function mpBuckets(iso,pool){
  const B={D:[],N:[],O:[],R:[],leave:[],ot:[]};
  schedEmps().forEach(e=>{
    if(pool&&poolOf(e)!==pool)return;
    const c=eff(e.id,iso).code;if(!c)return;
    mpPut(B,e,c);
  });
  return B;
}
/* Cả hai khối trong một lần duyệt danh sách — đỡ chạy 2 vòng */
function mpBucketsByPool(iso){
  const mk=()=>({D:[],N:[],O:[],R:[],leave:[],ot:[]});
  const out={prod:mk(),office:mk()};
  schedEmps().forEach(e=>{
    const c=eff(e.id,iso).code;if(!c)return;
    mpPut(out[poolOf(e)],e,c);
  });
  return out;
}
/* Ngày này có thiếu người không — chỉ xét khối SẢN XUẤT, vì khối văn phòng
   không trực ca D/N nên không có định mức trực. */
function mpLowOfDay(iso){
  const B=mpBuckets(iso,POOL_PROD);
  const lowD=B.D.length<minOfShift('D'), lowN=B.N.length<minOfShift('N');
  return {lowD,lowN,low:lowD||lowN,B};
}
/* renderMp() đã chuyển sang js/15-report.js (tab Báo cáo).
   Lưu ý lỗi cũ ở đây: `const f=..., t=$('mpTo').value` che mất hàm dịch t()
   → cả hàm ném lỗi và tab Nhân lực trắng trơn. Bản mới không dùng biến tên `t`. */
