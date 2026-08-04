/* ============================================================
   BOOT — khoi tao ung dung
   LPGT Cavern — Quan ly Cong Ca v4
   ============================================================ */
/* =================== BOOT =================== */
function renderAll(){
  syncAccounts();                 // mã NV mới → tự thành tài khoản đăng nhập
  applyRoleUI();
  fillMonthSelects();renderCal();renderSetup();renderAppr();renderData();refreshBadge();
  renderGate();
  if(curView==='me')renderMe();
  if(curView==='rep')renderReport();
}

load();
applyPerm();                      // quyền lấy từ cột Quyền của người đang đăng nhập
fillMonthSelects();
syncAccounts();
if(typeof pruneOldNotifs==='function'){const _pn=pruneOldNotifs();if(_pn)save();}  // dọn thông báo cũ (>~2 kỳ)
renderAll();
initFb();

/* Màn hình đầu tiên sau khi đăng nhập: nhân viên → Trang chính;
   thư ký / quản lý người Hàn (không thuộc diện chấm công) → Lịch thực tế */
renderGate();
go(homeView());
if(!noSelf)renderMe(true);

/* Ngôn ngữ: Quản lý người Hàn (quyền kmgr) mặc định vào là tiếng Anh,
   ai đã tự bấm nút EN/VI thì theo lựa chọn đã lưu. Xem js/14-i18n.js. */
applyLangForUser();
