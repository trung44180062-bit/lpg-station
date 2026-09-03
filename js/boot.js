/* ============================================================
 * boot.js — KHOI DONG (da doi chieu 1:1 voi boot goc V4-54 28751-28823)
 * ------------------------------------------------------------
 * Nguyen tac: GIU DUNG thu tu + lich (afterPaint/idle) cua ban goc da chay
 * that, chi THEM AUTH.init() ngay sau SC.init() (cong quyen — BAT BUOC dang
 * nhap Firebase, khong co tai khoan mac dinh). Moi feature chay TRONG callback
 * cua AUTH => chi boot sau khi dang nhap + whitelist hop le.
 *
 * KHONG goi init o day cho cac module TU init / lazy (tranh double-init):
 *   - FCHECK  -> tu init qua DOMContentLoaded (fcheck.js)
 *   - BULKOPS -> tu init qua DOMContentLoaded (bulkops.js)
 *   - WGCHECK -> khong co init, goi theo nhu cau (PLAN/FCHECK dung badgeHtml)
 *   - FBA (fleet) -> init bang buildFleetSubs()+switchFleetTab() (globals.js)
 *   - PLAN -> chi la factory; instance la TP/TMR (da init ben duoi)
 *   - RPT, TKV, PTT_EARLY, SYNC, NOTIF -> lazy, mo theo thao tac (nhu ban goc)
 * Ban goc de doi chieu: js/boot.original.js
 * ============================================================ */
/* ============================================================
   v4.127 — CANH BẢN ĐANG CHẠY (chống "mã đã sửa mà máy vẫn chạy bản cũ")
   ------------------------------------------------------------
   Chạy TRƯỚC mọi thứ, không cần đăng nhập, không đụng Firebase.
   Hai phép so:
     ① APP_BUILD (config.js) vs <meta name="app-build"> (index.html)
        — lệch nhau nghĩa là trình duyệt trộn file của hai bản khác nhau.
     ② TRADE.dirOfText('PETIMEX') — bản trước v4.125 khớp CHUỖI CON "EX"
        nên trả 'E'. Đây là mẫu thử rẻ và chắc chắn cho một lỗi ĐÃ XẢY RA:
        khách nội địa PETIMEX / PETROLIMEX bị dải STOCK FORECAST đếm sang
        cột EXPORT, sai 240 MT trong một ngày mà không có thông báo nào.
   Sai kiểu này KHÔNG tự lộ ra — số vẫn hiện, chỉ là số sai — nên phải nói
   thẳng ra màn hình chứ không chỉ ghi console.
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  try{
    var chip = document.getElementById('buildChip');
    var meta = document.querySelector('meta[name="app-build"]');
    var htmlB = meta ? String(meta.getAttribute('content')||'').trim() : '';
    var jsB   = (typeof APP_BUILD !== 'undefined') ? String(APP_BUILD) : '';
    var bad   = [];
    if(htmlB && jsB && htmlB !== jsB)
      bad.push('index.html is build ' + htmlB + ' but the scripts are build ' + jsB);
    if(typeof TRADE !== 'undefined' && TRADE.dirOfText &&
       TRADE.dirOfText('PETIMEX') === 'E')
      bad.push('the Domestic/Export rule is the pre-4.125 one — PETIMEX reads as Export');
    if(chip){
      chip.textContent = 'build ' + (jsB || '?');
      chip.title = bad.length
        ? ('STALE FILES: ' + bad.join('; ') + '. Press Ctrl+Shift+R to reload.')
        : ('Build ' + jsB + ' — all scripts match.');
      if(bad.length) chip.className = 'build-chip stale';
    }
    console.log('[BUILD] scripts ' + (jsB||'?') + ' · index.html ' + (htmlB||'?')
                + (bad.length ? ' · ⚠ STALE: ' + bad.join('; ') : ' · ok'));
    if(bad.length){
      var bar = document.createElement('div');
      bar.className = 'build-stale-bar';
      bar.innerHTML = '\u26A0 <b>You are running a stale cached build.</b> ' +
        bad.join('. ') + '. Numbers on screen may be wrong \u2014 press ' +
        '<b>Ctrl+Shift+R</b> (Cmd+Shift+R on Mac) to reload, then check the build chip.';
      bar.onclick = function(){ try{ location.reload(true); }catch(_){ location.reload(); } };
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }catch(e){ console.warn('[BUILD] check failed', e); }
});

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  /* tiny scheduler — prefers requestIdleCallback, falls back to setTimeout */
  const _idle = window.requestIdleCallback
    ? (fn, timeout) => window.requestIdleCallback(fn, { timeout: timeout || 1000 })
    : (fn, timeout) => setTimeout(fn, Math.max(0, timeout || 0));

  /* run one init step; log timing; swallow errors so the chain survives */
  function step(label, fn) {
    try {
      const t0 = performance.now();
      fn();
      console.log('[BOOT] ' + label + ' · ' + (performance.now() - t0).toFixed(0) + 'ms');
    } catch (e) {
      console.error('[BOOT] ' + label + ' FAILED', e);
    }
  }

  /* run after the browser has painted at least once */
  function afterPaint(fn) {
    requestAnimationFrame(() => requestAnimationFrame(fn));
  }

  console.log('[BOOT] cold-start scheduler engaged');
  const _tBoot = performance.now();

  /* P0 · synchronous · Sync Core (firebase.initializeApp) PHAI truoc tien */
  step('P0 · SC (Sync Core)', () => SC.init());

  /* P0 · AUTH — cong quyen BAT BUOC. onReady() chi chay SAU khi
   * onAuthStateChanged + whitelist resolve (dang nhap Firebase hop le).
   * Moi feature nam TRONG onReady de canWrite() san sang truoc khi init.
   * Chua dang nhap => overlay dang nhap, app KHONG boot. */
  AUTH.init(function () {
    /* P0 · FORCESYNC — "nut do" ep dong bo. PHAI chay SAU dang nhap (rules can
     * auth de doc) va TRUOC khi cac module nap cache: neu settings/force_sync_version
     * tren Firebase > epoch local thi xoa cache + reload sach ngay (khong phi init).
     * Khi epoch khop thi khong lam gi -> cac module chay logic version binh thuong. */
    step('P0 · FORCESYNC', () => FORCESYNC.init());

    /* P0 · SC.attach — gan listener + tai fleet SAU dang nhap. Fleet la module
     * DUY NHAT init o P0 (vi SC.init phai initializeApp truoc AUTH); doc fleet_/*
     * luc chua dang nhap bi rules chan -> fleet rong. Cac module khac init trong
     * onReady nen khong dinh. Day la fix loi "force xong fleet mat trang". */
    step('P0 · SC.attach (fleet, post-auth)', () => SC.attach());

    /* v4.126 · SALENOTIF — thông báo "tài khoản sale vừa đổi Today/Tomorrow Plan".
       Chạy SỚM (trước SCALE) để nút 📨 ở tab Scale có sẵn badge, và để bảng plan
       gọi SALENOTIF.push() được ngay từ sự kiện đồng bộ đầu tiên. RAM-only. */
    step('P0 · SALENOTIF', () => SALENOTIF.init());

    step('P0 · navGo(sales)', () => navGo('sales'));

    /* P1 · next frame · Sales->Scale subtab dependencies */
    afterPaint(() => {
      step('P1 · SCALE',          () => SCALE.init());
      step('P1 · CT (Customers)', () => CT.init());
      step('P1 · PP (Price)',     () => PP.init());   /* PP reads CT */

      /* P2 · idle · supporting sales data */
      _idle(() => {
        step('P2 · SP (SAP)',      () => SP.init());
        step('P2 · TL (TL Data)',  () => TL.init());
        step('P2 · INV (Tank Inv)', () => INV.init());

        /* P3 · idle · plan tables (PLAN factory -> TP/TMR instances) */
        _idle(() => {
          step('P3 · TP (Today Plan)',     () => TP.init());
          step('P3 · TMR (Tomorrow Plan)', () => TMR.init());

          /* P4 · idle · everything else */
          _idle(() => {
            step('P4 · WG (WMS GI)',    () => WG.init());
            step('P4 · WS (WMS ST)',    () => WS.init());
            step('P4 · ENG (Engineer)', () => ENG.init());
            step('P4 · ODOR (Odorant)', () => ODOR.init());
            /* v4.86 — DENS (bảng tra density) đã gỡ: phương pháp ② tra bảng không còn dùng */
            step('P4 · MC (Mix Calc)',  () => MC.init());
            step('P4 · MIXNOTIFY',      () => MIXNOTIFY.init());
            step('P4 · VMIX (Vessel)',  () => VMIX.init());
            step('P4 · VLOG (V.Log)',   () => VLOG.init());
            step('P4 · PLOG (Pure Log)',() => PLOG.init());
            step('P4 · CAV (Cavern)',   () => CAV.init());
            step('P4 · VS (Vessel data)', () => VS.init());
            step('P4 · MTHR (Monthly)', () => MTHR.init());
            step('P4 · STAFF',          () => STAFF.init());
            step('P4 · SCX2 (Console)', () => SCX2.init());
            /* v4.119 — dự báo tồn kho: PHẢI sau SP/TP/TMR/ENG/SCALE vì nó
               chỉ đọc RAM của mấy module đó, và sau SCX2 vì dải số nằm trên
               thanh tiêu đề console. */
            step('P4 · FCST (Forecast)', () => FCST.init());
            step('P4 · Fleet subs',     () => { buildFleetSubs(); switchFleetTab('tanklorry'); });
            const total = (performance.now() - _tBoot).toFixed(0);
            console.log('[BOOT] ✅ all modules ready · total ' + total + 'ms');
          }, 400);
        }, 200);
      }, 80);
    });
  });
});
