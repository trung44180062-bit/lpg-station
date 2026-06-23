/* ============================================================
 * FORCESYNC — forcesync.js
 * ------------------------------------------------------------
 * Global xuất ra : window.FORCESYNC
 * Phase tách     : P2 (core)
 * Phụ thuộc      : firebase đã initializeApp (SC.init) + ĐÃ ĐĂNG NHẬP (rules cần auth)
 * Khởi tạo (boot): FORCESYNC.init() — VIỆC ĐẦU TIÊN trong callback AUTH.init()
 * ------------------------------------------------------------
 * MỤC ĐÍCH: "Nút bấm đỏ" ép TẤT CẢ máy đồng bộ lại 100% từ Firebase.
 *   Khắc phục lỗi version-desync của fleet (máy giữ version cũ, edit ghi đè
 *   version cao đã sửa tay). Đây là cơ chế tổng, ĐỘC LẬP với các *_version node.
 *
 * CƠ CHẾ (theo yêu cầu):
 *   - 1 node tổng trên Firebase: settings/force_sync_version  (số nguyên).
 *   - Mỗi máy lưu epoch đã áp dụng ở localStorage 'lpg_v4_force_sync_epoch'.
 *   - 1 listener on('value'):
 *       fb >  local → XÓA toàn bộ data-cache (lpg_v4_*) + lưu epoch mới
 *                     + location.reload() → nạp lại 100% từ Firebase
 *                     (ghi đè local & RAM, reset luôn version-desync).
 *       fb <= local → KHÔNG làm gì → đi tiếp logic version từng node (như V406).
 *   - on('value') bắn CẢ lúc attach (mở app kiểm tra) LẪN mỗi lần đổi
 *     (auto-reload khi đang mở) ⇒ 1 listener lo cả hai.
 *
 * AN TOÀN:
 *   - Lưu epoch TRƯỚC khi reload ⇒ lần nạp lại fb==local ⇒ KHÔNG lặp reload.
 *   - Cờ _busy chặn double-reload.
 *   - CHỈ xóa cache có nguồn Firebase (sẽ tự kéo lại). KHÔNG đụng config
 *     local-only (mc_config, gi_auto, planview…) để khỏi mất cấu hình máy.
 *   - App KHÔNG BAO GIỜ tự ghi node này (chỉ đọc) ⇒ employee edit KHÔNG thể
 *     reset nó (khác hẳn fleet_version). Chỉ sửa tay trên Firebase Console.
 *
 * CÁCH DÙNG: vào Firebase Console → settings/force_sync_version → tăng lên
 *   (cao hơn số hiện tại). Mọi máy: đang mở sẽ auto-reload, máy khác mở lên
 *   sẽ tải lại — tất cả đồng bộ về đúng dữ liệu Firebase.
 * ============================================================ */
const FORCESYNC = (function(){
  'use strict';

  const FB_PATH  = 'settings/force_sync_version';
  const LS_EPOCH = 'lpg_v4_force_sync_epoch';

  /* CHỈ những cache có NGUỒN Firebase (xóa xong sẽ tự kéo lại khi attach).
     KHÔNG liệt kê config local-only: lpg_v4_mc_config_v1, lpg_v4_gi_auto,
     lpg_v4_planview_* … (xóa sẽ mất cấu hình riêng của máy).
     ⚠ Khi tách thêm module mới có cache đồng bộ Firebase → THÊM key vào đây. */
  const DATA_CACHE_KEYS = [
    'lpg_v4_cache_v1',     // SC   — fleet_/*           (fleet_version)
    'lpg_v4_tl_v1',        // TL   — raw_data           (raw_data_version)
    'lpg_v4_cust_v1',      // CT   — cust_              (cust_version)
    'lpg_v4_price_v1',     // PP   — price_             (price_version)
    'lpg_v4_sap_v1',       // SP   — sap_               (sap_version)
    'lpg_v4_wms_v1',       // WG   — wms_gi_            (wms_gi_version)
    'lpg_v4_st_v1',        // WS   — wms_st_            (wms_st_version)
    'lpg_v4_plan_v1',      // TP   — plan_today_        (plan_today_version)
    'lpg_v4_plan_tmr_v1',  // TMR  — plan_tomorrow_     (plan_tomorrow_version)
    'lpg_v4_eng_tkmix_v2', // ENG  — eng_tkmix
    'lpg_v4_inv_v1'        // INV  — inv_daily/*
  ];

  let _busy = false;   // chặn double-reload trong cửa sổ chờ

  function _localEpoch(){
    const n = parseInt(localStorage.getItem(LS_EPOCH) || '0', 10);
    return isNaN(n) ? 0 : n;
  }

  function _forceReset(fb){
    if(_busy) return;
    _busy = true;
    console.warn('[FORCESYNC] epoch ' + _localEpoch() + ' → ' + fb +
                 ' — xóa cache & reload toàn bộ từ Firebase');
    /* 1) LƯU epoch TRƯỚC khi reload — chống lặp reload (lần sau fb==local). */
    try{ localStorage.setItem(LS_EPOCH, String(fb)); }catch(_){}
    /* 2) Xóa toàn bộ data-cache có nguồn Firebase → buộc nạp lại sạch. */
    DATA_CACHE_KEYS.forEach(k=>{ try{ localStorage.removeItem(k); }catch(_){} });
    /* 3) Báo người dùng rồi reload. */
    try{ if(typeof toast === 'function') toast('Đồng bộ lại toàn bộ dữ liệu từ Firebase…','ok'); }catch(_){}
    setTimeout(function(){
      try{ location.reload(); }
      catch(_){ try{ location.href = location.href; }catch(__){} }
    }, 600);
  }

  /* Gọi SAU đăng nhập (rules yêu cầu auth để đọc). */
  function init(){
    if(typeof firebase === 'undefined'){ console.warn('[FORCESYNC] no firebase SDK — bỏ qua'); return; }
    let db;
    try{ db = firebase.database(); }
    catch(e){ console.warn('[FORCESYNC] chưa có database', e); return; }

    db.ref(FB_PATH).on('value',
      function(snap){
        const fb = parseInt(snap.val(), 10) || 0;   // null/NaN → 0 (an toàn)
        if(fb > _localEpoch()) _forceReset(fb);
      },
      function(err){ console.warn('[FORCESYNC] listener error', err); }
    );
    console.log('[FORCESYNC] ✅ đang theo dõi ' + FB_PATH + ' (epoch local = ' + _localEpoch() + ')');
  }

  return { init: init, current: _localEpoch };
})();
