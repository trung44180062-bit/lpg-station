let pass=0,fail=0;
const ok=(name,cond,extra)=>{if(cond){pass++;console.log('  ✓',name);}
  else{fail++;console.log('  ✗',name,extra!==undefined?('→ '+JSON.stringify(extra)):'');}};

/* ---------- dữ liệu giả ---------- */
S.employees=[
 {id:'e1',name:'Nguyễn Văn A',team:'A',pos:'operator',shiftType:'type1',active:true},
 {id:'e2',name:'Trần Văn B', team:'A',pos:'field_eng',shiftType:'type1',active:true},
 {id:'e3',name:'Lê Văn C',   team:'B',pos:'operator',shiftType:'type1',active:true},
 {id:'e4',name:'Phạm Thị D', team:'Office',pos:'office',shiftType:'admin',active:true}
];
S.base={e1:{'2026-08-07':'O','2026-08-08':'D','2026-08-09':'R'},
            e2:{'2026-08-07':'D','2026-08-08':'D','2026-08-09':'N'},
            e3:{'2026-08-07':'N','2026-08-08':'R','2026-08-09':'D'},
            e4:{'2026-08-07':'O','2026-08-08':'O','2026-08-09':'R'}};
S.over={};S.notifs={};S.events={};S.settings.hours={};
S.rev=1;

console.log('\n[1] CA KÉP — tách giờ công / giờ tăng ca');
ok('O+N có trong bảng mã',!!codeInfo('O+N')&&codeInfo('O+N').cat==='combo');
ok('giờ mặc định O+N = 20',getHours('O+N')===20,getHours('O+N'));
ok('giờ mặc định D+N = 24',getHours('D+N')===24,getHours('D+N'));
let sp=comboSplitHours('O+N');
ok('O+N tách 8h công + 12h OT',sp.work===8&&sp.ot===12,sp);
sp=comboSplitHours('D+N');
ok('D+N tách 12h công + 12h OT',sp.work===12&&sp.ot===12,sp);
sp=comboSplitHours('O+N',14);      // quản lý ghi tổng thực tế 14h
ok('tổng khai 14h → 8h công + 6h OT',sp.work===8&&sp.ot===6,sp);
ok('workCodeOf(O+N)=O',workCodeOf('O+N')==='O');
ok('otCodeOf(D+N)=OTN',otCodeOf('D+N')==='OTN');
ok('baseShiftOf(O+N)=O',baseShiftOf('O+N')==='O');
ok('mã thường không bị ảnh hưởng',comboSplitHours('D')===null&&workCodeOf('D')==='D');

/* e1 trực ca O ngày 07 rồi tăng ca đêm */
S.over.e1={'2026-08-07':{code:'O+N',by:'mgr',at:Date.now()}};S.rev++;
const st=calcStats('e1',['2026-08-07','2026-08-08','2026-08-09']);
ok('giờ công = 8 (O kép) + 12 (D) = 20',st.hWork===20,st);
ok('giờ tăng ca = 12',st.hOT===12,st);
ok('đếm mã có O+N',st.cnt['O+N']===1,st.cnt);
ok('cntShift O gộp ca kép',cntShift(st.cnt,'O')===1,cntShift(st.cnt,'O'));
ok('cntShift D không nuốt ca kép O+N',cntShift(st.cnt,'D')===1,cntShift(st.cnt,'D'));
ok('otShifts đếm ca kép là 1 lần OT',otShifts(st)===1,otShifts(st));

console.log('\n[2] CA KÉP — quân số theo ngày');
const B=mpBuckets('2026-08-07','prod');
ok('e1 vẫn nằm trong ca O',B.O.some(e=>e.id==='e1'),B.O.map(e=>e.id));
ok('e1 đồng thời nằm trong danh sách tăng ca',B.ot.some(x=>x.e.id==='e1'),B.ot.map(x=>x.e.id));
ok('ca N vẫn đúng 1 người (e3)',B.N.length===1&&B.N[0].id==='e3',B.N.map(e=>e.id));
const P=mpBucketsByPool('2026-08-07');
ok('khối văn phòng tách riêng',P.office.O.length===1&&P.office.O[0].id==='e4');

console.log('\n[3] CA KÉP — suất cơm');
/* Ca O 08–17 ăn trưa; tăng ca đêm 20–08 ăn thêm bữa đêm + sáng hôm sau */
const meals=actualMealsOf('e1','2026-08-07',false).map(x=>x.v+'@'+x.iso).sort();
ok('có suất của ca O',meals.some(x=>x.startsWith('lunch')||x.includes('@2026-08-07')),meals);
ok('có suất phát sinh do tăng ca đêm',meals.some(x=>x.includes('2026-08-08')),meals);

console.log('\n[4] SỰ KIỆN — ngày, người nhận, thu hồi');
_me='admin1';adm=true;
const ev={id:'ev1',title:'Nhập tàu LPG',from:'2026-08-07',to:'2026-08-09',
          scope:'all',teams:[],notify:true};
S.events.ev1=ev;S.rev++;
ok('evDays trải đủ 3 ngày',evDays(ev).join(',')==='2026-08-07,2026-08-08,2026-08-09',evDays(ev));
ok('eventsOfDay bắt đúng ngày giữa',eventsOfDay('2026-08-08').length===1);
ok('ngày ngoài khoảng không dính',eventsOfDay('2026-08-10').length===0);
ok('nhãn ngày liên tục gọn',evDateLabel(ev)==='07/08 → 09/08',evDateLabel(ev));
ok('scope all = mọi người',evRecipients(ev).length===4,evRecipients(ev));
ev.scope='teams';ev.teams=['A'];
ok('scope teams = đúng nhóm A',evRecipients(ev).join(',')==='e1,e2',evRecipients(ev));
ev.scope='working';
const w=evRecipients(ev);
ok('scope working loại người nghỉ cả 3 ngày',w.length>0&&w.length<=4,w);
ok('e1 (có ca O/D) nằm trong nhóm làm việc',w.includes('e1'),w);

ev.scope='all';
const nSent=evSendNotifs(ev);
ok('gửi thông báo cho 4 người',nSent===4,nSent);
ok('S.notifs có 4 tin sự kiện',Object.values(S.notifs).filter(n=>n.kind==='event').length===4);
ok('gửi lại KHÔNG nhân đôi (thu hồi bản cũ trước)',evSendNotifs(ev)===4
   &&Object.values(S.notifs).filter(n=>n.kind==='event').length===4,
   Object.values(S.notifs).filter(n=>n.kind==='event').length);
const nRev=evRevokeNotifs('ev1');
ok('xoá sự kiện thu hồi hết 4 thông báo',nRev===4
   &&Object.values(S.notifs).filter(n=>n.kind==='event').length===0,nRev);
/* ngày rời rạc */
const ev2={id:'ev2',title:'Kiểm định',days:['2026-08-07','2026-08-11'],scope:'all',notify:false};
ok('ngày rời rạc giữ nguyên',evDays(ev2).length===2);
ok('nhãn ngày rời rạc liệt kê',evDateLabel(ev2)==='07/08, 11/08',evDateLabel(ev2));
ok('notify=false thì không gửi',evSendNotifs(ev2)===0);

console.log('\n[5] THU HỒI THÔNG BÁO KHI TRẢ LỊCH VỀ CHUẨN');
/* revokeSchedChange đã được nạp sẵn từ js/13-portal.js ở phần boot */
S.notifs={};
newNotif({kind:'schedChange',to:'e1',from:'admin1',iso:'2026-08-07',oldCode:'O',newCode:'OTN'});
ok('có 1 thông báo chờ xác nhận',Object.keys(S.notifs).length===1);
let n1=revokeSchedChange('e1','2026-08-07','O');
ok('CHƯA xác nhận → thu hồi lặng lẽ, không sinh tin mới',
   n1===1&&Object.keys(S.notifs).length===0,{n1,left:Object.keys(S.notifs).length});

const nid=newNotif({kind:'schedChange',to:'e1',from:'admin1',iso:'2026-08-07',oldCode:'O',newCode:'OTN'});
S.notifs[nid].status='confirmed';                    // nhân viên đã bấm xác nhận
let n2=revokeSchedChange('e1','2026-08-07','O');
const infos=Object.values(S.notifs).filter(x=>x.kind==='info'&&x.to==='e1');
ok('ĐÃ xác nhận → vẫn thu hồi',n2===1&&S.notifs[nid].status==='revoked',S.notifs[nid].status);
ok('ĐÃ xác nhận → gửi lại thông báo thu hồi',infos.length===1,infos.map(x=>x.text));
ok('thông báo của người khác không bị đụng',
   revokeSchedChange('e2','2026-08-07','D')===0);

console.log('\n'+(fail?'❌ ':'✅ ')+pass+' đạt / '+fail+' hỏng');
process.exit(fail?1:0);
