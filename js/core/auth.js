/* ============================================================
 * AUTH  —  auth.js   ★ MODULE MỚI (whitelist + roles + login)
 * ------------------------------------------------------------
 * Đây là nơi DUY NHẤT chứa logic người dùng / phân quyền.
 * Gốc trong V4-54: CURRENT_USER (dòng 8790) + canWrite() (dòng 8798)
 *   — hiện đang ở chế độ "dev" (luôn cho ghi). canWrite() đã được
 *   gọi 28 lần khắp app ⇒ chỉ cần SỬA Ở ĐÂY là khoá được toàn bộ.
 *
 * Global xuất ra : window.CURRENT_USER, window.canWrite, window.AUTH
 * Phase tách     : P2 (core) — bật thật ở P6
 * Phụ thuộc      : firebase-auth-compat.js (đã thêm vào index.html),
 *                  Firebase RTDB (đã có), SC (sync.js) để đọc whitelist.
 * Khởi tạo (boot): AUTH.init() chạy NGAY SAU SC.init(), TRƯỚC mọi feature.
 * ------------------------------------------------------------
 * DB (Firebase RTDB):
 *   /users_whitelist/{emailKey} = { active:true, role:"admin"|"editor"|"viewer", name }
 *      emailKey = email.replace(/\./g, ',')   (RTDB key không chứa dấu '.')
 *
 * ⚠ BẢO MẬT (vì publish source công khai lên GitHub):
 *   - apiKey trong firebaseConfig là CÔNG KHAI theo thiết kế — commit được.
 *   - canWrite() phía client CHỈ ẩn nút. KHÓA THẬT đặt ở Firebase Security Rules
 *     (xem docs/PLAN-TACH-MODULE.md §7 + docs/P6-WHITELIST-SETUP.md).
 *   - CÔNG TẮC bật auth thật: var AUTH_ENFORCE (ngay dưới).
 * ============================================================ */
window.AUTH = (function () {
  'use strict';

  // ⇩ CÔNG TẮC P6: false = DEV (admin, KHÔNG cần đăng nhập, kể cả khi đã nạp
  //   firebase-auth-compat). true = bật đăng nhập Email/Mật khẩu + whitelist THẬT.
  //   CHỈ đổi sang true SAU KHI đã cấu hình Console + Rules. Xem docs/P6-WHITELIST-SETUP.md.
  var AUTH_ENFORCE = true;

  // Bảng phân quyền: vai trò nào được ghi vùng nào. CHỈNH Ở ĐÂY.
  var MATRIX = {
    admin:  '*',                                   // ghi mọi vùng
    editor: ['plan_today','plan_tomorrow','scale','cavern','vlog','raw_data'],
    viewer: []                                     // chỉ xem
  };

  function emailKey(email) {
    return String(email || '').trim().toLowerCase().replace(/\./g, ',');
  }

  function applyRole(role, name, email, uid) {
    window.CURRENT_USER = { uid: uid || '', name: name || email || '', email: email || '', role: role || 'viewer' };
  }

  // canWrite(area) — cổng trung tâm MỌI lệnh ghi phải đi qua (giữ nguyên chữ ký cũ).
  function canWrite(area) {
    var u = window.CURRENT_USER;
    if (!u) return false;
    var allow = MATRIX[u.role];
    if (allow === '*') return true;
    if (!allow) return false;
    return allow.indexOf(area) !== -1;
  }

  // Đọc whitelist theo email → {active, role, name} hoặc null nếu không có.
  function lookupWhitelist(email) {
    return firebase.database().ref('/users_whitelist/' + emailKey(email)).get()
      .then(function (s) { return s.exists() ? s.val() : null; });
  }

  // ----- Overlay chung (dùng cho màn BỊ CHẶN) -----
  function _overlay(inner) {
    var el = document.getElementById('authOverlay');
    if (!el) {
      el = document.createElement('div'); el.id = 'authOverlay';
      document.body.appendChild(el);
    }
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(6,18,32,.94);font-family:Barlow,system-ui,sans-serif';
    el.innerHTML = '<div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:380px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)">' + inner + '</div>';
    el.style.display = 'flex';
  }
  function hideOverlay() { var el = document.getElementById('authOverlay'); if (el) el.style.display = 'none'; }

  // ----- Man DANG NHAP Email/Mat khau (giao dien Hyosung LPG STATION) -----
  function _injectStyle() {
    if (document.getElementById('authStyle')) return;
    var st = document.createElement('style'); st.id = 'authStyle';
    st.textContent = [
      '#authOverlay{position:fixed;inset:0;z-index:99999;overflow:hidden;color:#eaf2fb;',
        'font-family:Barlow,"Segoe UI",system-ui,sans-serif;',
        'background:radial-gradient(1100px 700px at 18% 78%,rgba(31,155,255,.10),transparent 60%),',
        'radial-gradient(900px 600px at 88% 16%,rgba(31,155,255,.08),transparent 60%),',
        'linear-gradient(120deg,#040f1d 0%,#06223a 46%,#04131f 100%)}',
      '#authOverlay .ov-grid{position:absolute;inset:0;background-image:',
        'linear-gradient(rgba(120,170,220,.05) 1px,transparent 1px),',
        'linear-gradient(90deg,rgba(120,170,220,.05) 1px,transparent 1px);',
        'background-size:54px 54px;mask-image:radial-gradient(120% 90% at 50% 40%,#000 40%,transparent 85%)}',
      '#authOverlay .ov-wrap{position:relative;height:100%;display:flex;flex-direction:column}',
      '#authOverlay .ov-top{display:flex;align-items:center;gap:16px;padding:26px 48px 0;',
        'letter-spacing:.32em;font-size:11px;font-weight:700;color:#a9c4e2}',
      '#authOverlay .ov-top .ov-dot{width:8px;height:8px;border-radius:50%;background:#2f9bff;',
        'box-shadow:0 0 0 4px rgba(47,155,255,.18);animation:ovPulse 2s infinite}',
      '#authOverlay .ov-top .ov-rule{flex:1;height:1px;background:linear-gradient(90deg,rgba(120,170,220,.5),transparent)}',
      '#authOverlay .ov-main{flex:1;display:flex;align-items:center;justify-content:space-between;gap:48px;',
        'padding:0 48px;max-width:1280px;width:100%;margin:0 auto}',
      '#authOverlay .ov-hero h1{font-size:clamp(46px,6.6vw,98px);line-height:.9;font-weight:800;',
        'letter-spacing:-.01em;text-transform:uppercase;margin:0}',
      '#authOverlay .ov-hero .ac{color:#2f9bff}',
      '#authOverlay .ov-hero .ov-sub{margin-top:22px;letter-spacing:.34em;font-size:12px;color:#9fb8d4;font-weight:600}',
      '#authOverlay .ov-hero .ov-bar{margin-top:18px;width:120px;height:3px;border-radius:2px;',
        'background:linear-gradient(90deg,#2f9bff,transparent)}',
      '#authOverlay form{position:relative;width:392px;flex:none;animation:ovIn .5s ease both;',
        'background:rgba(8,24,42,.80);border:1px solid rgba(120,170,220,.20);backdrop-filter:blur(9px);',
        'padding:36px 34px 30px;border-radius:6px;box-shadow:0 36px 90px rgba(0,0,0,.55)}',
      '#authOverlay form::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;border-radius:6px 6px 0 0;',
        'background:linear-gradient(90deg,#2f9bff,#1d6fd0 60%,transparent)}',
      '#authOverlay .ov-h2{font-size:26px;font-weight:800;letter-spacing:.14em}',
      '#authOverlay .ov-tag{margin-top:8px;color:#e8913a;letter-spacing:.22em;font-size:11px;font-weight:700}',
      '#authOverlay label{display:block;margin-top:22px;font-size:11px;letter-spacing:.18em;color:#9fb8d4;font-weight:600;margin-bottom:9px}',
      '#authOverlay input{width:100%;background:rgba(3,13,26,.72);border:1px solid rgba(120,170,220,.26);',
        'color:#eaf2fb;padding:14px 14px;font-size:14px;border-radius:4px;outline:none;box-sizing:border-box;',
        'transition:border-color .15s,box-shadow .15s;letter-spacing:.02em}',
      '#authOverlay input::placeholder{color:#5d7790;letter-spacing:.06em}',
      '#authOverlay input:focus{border-color:#2f9bff;box-shadow:0 0 0 3px rgba(47,155,255,.18)}',
      '#authOverlay #authSubmit{margin-top:28px;width:100%;border:0;cursor:pointer;color:#fff;padding:15px;',
        'font-size:14px;font-weight:700;letter-spacing:.16em;border-radius:4px;',
        'background:linear-gradient(90deg,#2f9bff,#1d6fd0);transition:filter .15s,transform .05s}',
      '#authOverlay #authSubmit:hover{filter:brightness(1.09)}',
      '#authOverlay #authSubmit:active{transform:translateY(1px)}',
      '#authOverlay #authSubmit:disabled{opacity:.6;cursor:not-allowed}',
      '#authOverlay #authMsg{margin-top:16px;min-height:18px;font-size:13px;color:#ff7b7b;letter-spacing:.01em}',
      '#authOverlay .ov-stats{display:flex;gap:14px;padding:0 48px 20px;max-width:1280px;width:100%;margin:0 auto}',
      '#authOverlay .ov-stat{background:rgba(8,24,42,.66);border:1px solid rgba(120,170,220,.16);',
        'padding:13px 20px;border-radius:4px;min-width:118px}',
      '#authOverlay .ov-stat b{display:block;font-size:21px;color:#2f9bff;font-weight:800}',
      '#authOverlay .ov-stat span{font-size:10px;letter-spacing:.2em;color:#7f97b0;font-weight:600}',
      '#authOverlay .ov-foot{border-top:1px solid rgba(120,170,220,.14);background:rgba(3,11,20,.6);',
        'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;',
        'padding:13px 48px;font-size:10.5px;letter-spacing:.2em;color:#6f88a3;font-weight:600}',
      '#authOverlay .ov-foot b{color:#a9c4e2}',
      '@keyframes ovIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
      '@keyframes ovPulse{0%,100%{opacity:1}50%{opacity:.35}}',
      '@media(max-width:880px){#authOverlay .ov-hero,#authOverlay .ov-stats{display:none}',
        '#authOverlay .ov-main{justify-content:center;padding:0 22px}',
        '#authOverlay .ov-top{padding:20px 22px 0;font-size:9px}',
        '#authOverlay .ov-foot{padding:11px 22px;font-size:9px}}'
    ].join('');
    document.head.appendChild(st);
  }

  function showLogin() {
    _injectStyle();
    var el = document.getElementById('authOverlay');
    if (!el) { el = document.createElement('div'); el.id = 'authOverlay'; document.body.appendChild(el); }

    el.innerHTML =
      '<div class="ov-grid"></div>' +
      '<div class="ov-wrap">' +
        '<div class="ov-top"><span class="ov-dot"></span>' +
          '<span>HYOSUNG VINA CHEMICALS &middot; LPG STATION</span><span class="ov-rule"></span></div>' +
        '<div class="ov-main">' +
          '<div class="ov-hero">' +
            '<h1>HYOSUNG<br><span class="ac">VINA</span><br>CHEMICALS.</h1>' +
            '<div class="ov-bar"></div>' +
            '<div class="ov-sub">LPG STATION &middot; OPERATIONS CONTROL &middot; PHU MY &middot; VN</div>' +
          '</div>' +
          '<form id="authForm" autocomplete="on">' +
            '<div class="ov-h2">SIGN IN</div>' +
            '<div class="ov-tag">RESTRICTED ACCESS TERMINAL</div>' +
            '<label for="authEmail">USER ID</label>' +
            '<input id="authEmail" type="email" autocomplete="username" placeholder="ENTER EMAIL" required>' +
            '<label for="authPwd">PASSWORD</label>' +
            '<input id="authPwd" type="password" autocomplete="current-password" placeholder="********" required>' +
            '<button id="authSubmit" type="submit">AUTHENTICATE &rarr;</button>' +
            '<div id="authMsg"></div>' +
          '</form>' +
        '</div>' +
        '<div class="ov-stats">' +
          '<div class="ov-stat"><b>170,000 T</b><span>PROPANE / Y</span></div>' +
          '<div class="ov-stat"><b>70,000 T</b><span>BUTANE / Y</span></div>' +
          '<div class="ov-stat"><b>2 &times; 300 T</b><span>MIX TANK</span></div>' +
          '<div class="ov-stat"><b>4 &times; 1 T/m</b><span>LOADING</span></div>' +
        '</div>' +
        '<div class="ov-foot">' +
          '<span>LOCATION&nbsp;&nbsp;<b>PHU MY &middot; BR-VT &middot; VN</b></span>' +
          '<span>TERMINAL TIME&nbsp;&nbsp;<b id="authClock">--:--:--</b></span>' +
          '<span>BUILD&nbsp;&nbsp;<b>LPG STATION v4.54</b></span>' +
        '</div>' +
      '</div>';
    el.style.display = 'block';

    // dong ho terminal (chi 1 interval)
    if (!window._authClock) {
      window._authClock = setInterval(function () {
        var c = document.getElementById('authClock'); if (!c) return;
        var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
        c.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
      }, 1000);
    }

    var form = document.getElementById('authForm');
    var msg  = document.getElementById('authMsg');
    var btn  = document.getElementById('authSubmit');
    function err(t) { msg.style.color = '#ff7b7b'; msg.textContent = t; }

    form.onsubmit = function (ev) {
      ev.preventDefault();
      var email = document.getElementById('authEmail').value.trim();
      var pwd   = document.getElementById('authPwd').value;
      if (!email || !pwd) { err('Vui long nhap email va mat khau.'); return; }
      btn.disabled = true; btn.textContent = 'DANG XAC THUC...'; msg.textContent = '';
      login(email, pwd).catch(function (e) {
        var c = e && e.code ? e.code : '';
        var m = 'Dang nhap that bai. Thu lai.';
        if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found') m = 'Sai email hoac mat khau.';
        else if (c === 'auth/invalid-email') m = 'Email khong hop le.';
        else if (c === 'auth/too-many-requests') m = 'Sai nhieu lan. Thu lai sau it phut.';
        else if (c === 'auth/user-disabled') m = 'Tai khoan da bi khoa.';
        else if (c === 'auth/network-request-failed') m = 'Loi mang. Kiem tra ket noi.';
        err(m);
        btn.disabled = false; btn.innerHTML = 'AUTHENTICATE &rarr;';
      });
      // Thanh cong: onAuthStateChanged trong init() se kiem whitelist & boot app.
    };
  }

  function showBlocked(email) {
    _overlay('<div style="font-size:20px;font-weight:800;color:#b91c1c;margin-bottom:8px">Khong co quyen truy cap</div>'
      + '<div style="color:#475569;margin-bottom:18px">Tai khoan <b>' + (email || '') + '</b> chua duoc them vao whitelist.<br>Lien he quan tri vien.</div>'
      + '<button id="authLogoutBtn" style="cursor:pointer;border:1px solid #cbd5e1;border-radius:9px;padding:9px 16px;font-weight:700;background:#fff;color:#0f172a">Dang xuat</button>');
    var b = document.getElementById('authLogoutBtn');
    if (b) b.onclick = function () { logout(); };
  }

  function login(email, password) {
    return firebase.auth().signInWithEmailAndPassword(String(email || '').trim(), password);
  }
  function logout() { return firebase.auth().signOut(); }

  function init(onReady) {
    var _done = false;
    function ready(u) { if (_done) return; _done = true; if (onReady) onReady(u); }

    // DEV (AUTH_ENFORCE=false) hoac chua nap firebase-auth: luon admin, boot ngay.
    if (!AUTH_ENFORCE || !firebase.auth) {
      applyRole('admin', 'Dev User', 'dev@local', 'dev');
      ready(window.CURRENT_USER);
      return;
    }
    // THAT (P6): Email/Mat khau + whitelist. Chua dang nhap -> overlay, KHONG boot app.
    // Persistence = NONE: phien dang nhap CHI giu trong bo nho trang hien tai.
    // => Moi lan F5 / dong-mo lai trinh duyet deu PHAI dang nhap lai.
    //    (Doi NONE -> SESSION neu muon giu trong cung tab khi F5; -> LOCAL neu muon nho lau dai.)
    function _attach() {
      firebase.auth().onAuthStateChanged(function (user) {
        if (!user) { applyRole('viewer', 'Khach', '', ''); showLogin(); return; }
        lookupWhitelist(user.email).then(function (wl) {
          if (!wl || wl.active !== true) { showBlocked(user.email); return; }
          hideOverlay();
          applyRole(wl.role || 'viewer', wl.name || user.displayName, user.email, user.uid);
          ready(window.CURRENT_USER);
        }).catch(function (e) { console.error('[AUTH] whitelist loi', e); showBlocked(user.email); });
      });
    }
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE)
      .catch(function (e) { console.warn('[AUTH] setPersistence loi', e); })
      .then(_attach);
  }

  // Bat che do dev ngay khi nap (de app chay duoc truoc khi P6 bat auth that).
  applyRole('admin', 'Dev User', 'dev@local', 'dev');
  window.canWrite = canWrite;   // giu canWrite() la global nhu V4-54

  return { init: init, login: login, logout: logout, canWrite: canWrite,
           lookupWhitelist: lookupWhitelist, emailKey: emailKey, MATRIX: MATRIX };
})();
