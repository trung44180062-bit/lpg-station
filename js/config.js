/* ============================================================
   CAU HINH FIREBASE CUA APP
   File nay PHAI di kem repo thi GitHub Pages moi chay duoc.
   Firebase apiKey/databaseURL la CONG KHAI theo thiet ke cua Firebase —
   an toan hay khong phu thuoc vao Security Rules (xem firebase-rules.json
   trong folder rieng), KHONG phai vao viec giau file nay.
   => KHONG dat mat khau/PIN/bi mat that su o day.
   ============================================================ */
var APP_CFG = {

  /* --- Firebase Realtime Database --- */
  firebase: {
    apiKey:            "AIzaSyAUrZio5gMp2ACgbZi71PhPTC1hXznK70I",
    authDomain:        "hsvc-working-schedule.firebaseapp.com",
    databaseURL:       "https://hsvc-working-schedule-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:         "hsvc-working-schedule",
    storageBucket:     "hsvc-working-schedule.firebasestorage.app",
    messagingSenderId: "1011767047175",
    appId:             "1:1011767047175:web:80cacf9bef2fcec6c2a6a2"
  },

  /* --- Duong dan node du lieu tren Realtime Database --- */
  dbPath: "shiftwork_v2",

  /* --- Khoa localStorage (doi neu muon chay nhieu ban song song) --- */
  storageKey: "lpgt_shiftwork_v2",

  /* --- Thong tin bo phan & nguoi duyet mac dinh (in tren bieu mau) --- */
  deptDefault: "LPG Terminal",
  approver1:   "Hoàng Trung",
  approver2:   "Kim Ji Min"
};
