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
            step('P4 · MC (Mix Calc)',  () => MC.init());
            step('P4 · MIXNOTIFY',      () => MIXNOTIFY.init());
            step('P4 · VMIX (Vessel)',  () => VMIX.init());
            step('P4 · VLOG (V.Log)',   () => VLOG.init());
            step('P4 · CAV (Cavern)',   () => CAV.init());
            step('P4 · STAFF',          () => STAFF.init());
            step('P4 · SCX2 (Console)', () => SCX2.init());
            step('P4 · Fleet subs',     () => { buildFleetSubs(); switchFleetTab('tanklorry'); });
            const total = (performance.now() - _tBoot).toFixed(0);
            console.log('[BOOT] ✅ all modules ready · total ' + total + 'ms');
          }, 400);
        }, 200);
      }, 80);
    });
  });
});
