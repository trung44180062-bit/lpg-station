/* ============================================================
   TRỢ LÝ DUYỆT ĐƠN  —  LPGT Cavern · Quản lý Công Ca
   ------------------------------------------------------------
   Mục đích: người duyệt bấm vào một đơn là thấy ngay BỐI CẢNH của
   đúng ngày đó — ai đã nghỉ, đơn của họ ở trạng thái nào, duyệt xong
   thì ca còn mấy người — kèm một khuyến nghị NÊN / CÂN NHẮC / KHÔNG NÊN.
   Người làm đơn cũng thấy cùng bối cảnh đó trước khi bấm gửi, nên đơn
   gửi lên đã "biết điều" sẵn, đỡ một vòng gửi–từ chối–gửi lại.

   NGUYÊN TẮC:
   · Toàn bộ chạy bằng LOGIC trên dữ liệu đã nằm sẵn trong bộ nhớ (state S).
     KHÔNG gọi thêm Firebase, không đọc lại gì — gói Spark nên mỗi byte
     tải về đều phải có lý do. Xem js/02-storage.js (đồng bộ theo delta).
   · Hai khối nhân lực SẢN XUẤT (A/B/C/D) và VĂN PHÒNG không cover cho
     nhau, nên mọi phép đếm đều tách theo pool. Xem poolOf() ở 01-core.js.

   Tiêu chí xếp hạng khuyến nghị (theo yêu cầu nghiệp vụ):
     1. CHÍNH — cùng NHÓM đã có bao nhiêu người nghỉ ngày đó
        (đã duyệt = chắc chắn vắng; đang chờ = vắng tiềm năng).
     2. PHỤ  — sau khi duyệt thì ca trực của khối đó còn mấy người
        so với định mức minD / minN / minO.
   ============================================================ */

/* =================== NỀN =================== */
function advIsLeaveCode(c){return !!c&&codeInfo(c).cat==='leave';}
/* Mã ca quy về "chỗ đứng" trong ngày: D / N / O / R / LEAVE / OT */
function advShiftOf(c){
  if(!c)return '';
  const cat=codeInfo(c).cat;
  if(cat==='leave')return 'LEAVE';
  if(cat==='ot')   return 'OT';
  if(cat==='rest') return 'R';
  return baseShiftOf(c)||c;
}
/* Mã ca này có làm người đó RỜI KHỎI ca trực không (nghỉ phép hoặc về nghỉ ca) */
function advCodeLeavesShift(c){
  if(!c)return false;
  const cat=codeInfo(c).cat;
  return cat==='leave'||cat==='rest';
}

/* ------------------------------------------------------------
   AI VẮNG MẶT NGÀY iso — gộp hai nguồn:
     (1) ô lịch thực tế đã mang mã nghỉ  → CHẮC CHẮN nghỉ (đã duyệt)
     (2) đơn nghỉ đang CHỜ DUYỆT phủ lên ngày đó → nghỉ tiềm năng
   skipReqId: bỏ qua chính đơn đang xét, để không tự đếm mình.
   ------------------------------------------------------------ */
function offListOfDay(iso){
  const out=[],seen={};
  schedEmps().forEach(e=>{
    const r=eff(e.id,iso);
    if(!advIsLeaveCode(r.code))return;
    const rid=(r.o&&r.o.reqId)||'';
    seen[e.id]=1;
    out.push({e,code:r.code,status:'approved',reqId:rid,
              pool:poolOf(e),team:String(e.team||'').trim()});
  });
  Object.values(S.requests||{}).forEach(r=>{
    if(!r||r.status!=='pending')return;
    if(r.type!=='leave'&&r.type!=='change')return;
    const d=(reqDays(r)||[]).find(x=>x.iso===iso);
    if(!d||!advIsLeaveCode(d.code))return;
    if(seen[r.empId])return;
    const e=empById(r.empId);
    if(!e||e.active===false||!inSchedule(e))return;
    seen[r.empId]=1;
    out.push({e,code:d.code,status:'pending',reqId:r.id,
              pool:poolOf(e),team:String(e.team||'').trim()});
  });
  return out.sort((a,b)=>
    (a.status===b.status?0:(a.status==='approved'?-1:1))||
    String(a.team).localeCompare(String(b.team),'vi',{numeric:true})||
    String(a.e.name||'').localeCompare(String(b.e.name||''),'vi'));
}

/* ------------------------------------------------------------
   BỘ NHỚ ĐỆM TRONG PHIÊN
   Màn Duyệt có thể vẽ 150 dòng đơn, mỗi đơn vài ngày → nếu quét lại
   toàn bộ nhân sự + đơn cho từng ngày thì rất chậm. Kết quả chỉ đổi khi
   dữ liệu đổi, mà mỗi lần dữ liệu đổi thì S.rev đổi theo, nên lấy S.rev
   làm khoá đệm là đủ. Không liên quan gì tới Firebase — thuần bộ nhớ.
   ------------------------------------------------------------ */
let _advCache={rev:-1,off:{},bkt:{}};
function _advFresh(){
  if(_advCache.rev!==S.rev)_advCache={rev:S.rev,off:{},bkt:{}};
  return _advCache;
}
function offListCached(iso){
  const c=_advFresh();
  if(!c.off[iso])c.off[iso]=offListOfDay(iso);
  return c.off[iso];
}
function mpBucketsCached(iso,pool){
  const c=_advFresh(),k=iso+'|'+(pool||'*');
  if(!c.bkt[k])c.bkt[k]=mpBuckets(iso,pool);
  return c.bkt[k];
}

/* ------------------------------------------------------------
   KHUYẾN NGHỊ CHO MỘT NGƯỜI – MỘT NGÀY
   empId    : người xin nghỉ
   iso      : ngày
   newCode  : mã sẽ áp vào ô lịch nếu duyệt (AL8 / AL4 / NP / OFF / R…)
   skipReqId: id đơn đang xét (không tự tính mình vào danh sách đã nghỉ)
   ------------------------------------------------------------ */
function leaveAdvice(empId,iso,newCode,skipReqId){
  const e=empById(empId)||{id:empId,name:empId,team:''};
  const pool=poolOf(e), team=String(e.team||'').trim();
  const cur=eff(empId,iso).code;
  const shift=advShiftOf(cur);

  const off     = offListCached(iso).filter(x=>x.e.id!==empId&&!(skipReqId&&x.reqId===skipReqId));
  const offTeam = off.filter(x=>x.team===team);
  const offPool = off.filter(x=>x.pool===pool);
  const teamSize= schedEmps().filter(x=>String(x.team||'').trim()===team).length;

  /* Đếm quân số CÙNG KHỐI — khối kia không cover được nên không tính vào */
  const B=mpBucketsCached(iso,pool);
  const before={D:B.D.length,N:B.N.length,O:B.O.length,R:B.R.length};
  const after=Object.assign({},before);
  const pulls=(shift==='D'||shift==='N'||shift==='O');
  if(pulls)after[shift]=Math.max(0,after[shift]-1);

  /* Đơn cùng ca, cùng khối, đang chờ duyệt → nếu duyệt hết còn rút thêm nữa */
  const pendSameShift=offPool.filter(x=>x.status==='pending'&&
      advShiftOf(eff(x.e.id,iso).code)===shift).length;

  const nTeamOk  = offTeam.filter(x=>x.status==='approved').length;
  const nTeamPend= offTeam.filter(x=>x.status==='pending').length;
  const cap      = maxOffTeam();

  const reasons=[], pluses=[];
  let level='ok';
  const bump=l=>{ if(l==='block')level='block'; else if(l==='warn'&&level!=='block')level='warn'; };
  const say=(lv,txt)=>{ reasons.push({lv,txt}); bump(lv); };

  /* --- Bối cảnh ca của chính người xin --- */
  if(!cur)                  say('warn', t('Ngày này chưa xếp ca cho người xin — nên kiểm tra lại lịch trước khi duyệt.'));
  else if(shift==='LEAVE')  say('warn', t('Người xin đã đang nghỉ sẵn ngày này')+' ('+cur+') — '+t('đơn có thể bị trùng.'));
  else if(shift==='OT')     say('warn', t('Ngày này người xin đang được xếp tăng ca — duyệt nghỉ sẽ huỷ mất ca tăng đó.'));
  else if(shift==='R')      pluses.push(t('Ngày này vốn là ngày nghỉ ca R — nghỉ phép không rút ai khỏi ca trực.'));

  /* --- TIÊU CHÍ CHÍNH: cùng nhóm đã có ai nghỉ chưa --- */
  if(team){
    if(nTeamOk>=cap&&cap>0)
      say('block', t('Nhóm')+' '+team+' '+t('đã có')+' '+nTeamOk+' '+t('người nghỉ ngày này')+
                   ' ('+t('trần')+' '+cap+' '+t('người/ngày')+') — '+t('duyệt thêm sẽ mỏng kíp trực.'));
    else if(nTeamOk>0)
      say('warn',  t('Nhóm')+' '+team+' '+t('đã có')+' '+nTeamOk+'/'+cap+' '+t('người nghỉ ngày này.'));
    else
      pluses.push(t('Nhóm')+' '+team+' '+t('chưa có ai nghỉ ngày này.'));

    if(nTeamPend)
      say('warn', t('Còn')+' '+nTeamPend+' '+t('đơn cùng nhóm đang CHỜ DUYỆT cùng ngày — duyệt hết sẽ vượt trần.'));
  }

  /* --- TIÊU CHÍ PHỤ: định mức ca của khối --- */
  if(pulls){
    const need=minOfShift(shift);
    if(need>0){
      if(after[shift]<need)
        say('block', t('Ca')+' '+shift+' '+t('khối')+' '+t(POOL_LABEL[pool])+' '+t('còn')+' '+
                     after[shift]+'/'+need+' '+t('người — dưới định mức.'));
      else if(after[shift]===need)
        say('warn',  t('Ca')+' '+shift+' '+t('khối')+' '+t(POOL_LABEL[pool])+' '+t('còn đúng')+' '+
                     after[shift]+'/'+need+' — '+t('vừa sát định mức, không còn dự phòng.'));
      else
        pluses.push(t('Ca')+' '+shift+' '+t('còn')+' '+after[shift]+'/'+need+' '+t('người, vẫn đủ.'));
    }
    if(pendSameShift)
      say('warn', t('Cùng ca này còn')+' '+pendSameShift+' '+t('đơn đang chờ duyệt.'));
  }

  /* Ai có thể huy động cover: cùng KHỐI và đang nghỉ ca R */
  const cover=B.R.slice(0,8);

  return {empId,name:e.name||empId,iso,pool,team,teamSize,cur,shift,newCode,cap,
          level,reasons,pluses,off,offTeam,offPool,before,after,cover,
          nTeamOk,nTeamPend,pendSameShift,pulls};
}

/* =================== HIỂN THỊ =================== */
/* Hai giọng văn: 'appr' nói với người duyệt, 'emp' nói với người làm đơn */
const ADV_LV={
  ok   :{ic:'🟢',cls:'ok',   appr:'Nên duyệt',       emp:'Thuận lợi'},
  warn :{ic:'🟡',cls:'warn', appr:'Cân nhắc',        emp:'Có thể vướng'},
  block:{ic:'🔴',cls:'block',appr:'Không nên duyệt', emp:'Dễ bị từ chối'}
};
function advChip(lv,mode){
  const x=ADV_LV[lv]||ADV_LV.ok;
  return `<span class="adv-chip ${x.cls}">${x.ic} ${t(mode==='emp'?x.emp:x.appr)}</span>`;
}
function advWorst(list){
  return list.some(a=>a.level==='block')?'block'
       : list.some(a=>a.level==='warn') ?'warn':'ok';
}
/* Một người đang nghỉ → viên chip có tên + mã + trạng thái đơn */
function advOffChip(x,hi){
  const st=x.status==='approved'
    ? `<i class="st ok">✓ ${t('đã duyệt')}</i>`
    : `<i class="st pend">⏳ ${t('chờ duyệt')}</i>`;
  return `<span class="adv-off-i${hi?' same':''}">
    <b>${esc(shortName(x.e.name)||x.e.id)}</b>
    ${x.team?`<em>${esc(teamShort(x.team))}</em>`:''}
    <span class="cc" style="background:${codeInfo(x.code).col}">${esc(x.code)}</span>${st}</span>`;
}
/* Bảng quân số trước / sau khi duyệt */
function advCountHtml(a){
  const cell=sh=>{
    const need=minOfShift(sh), b=a.before[sh], af=a.after[sh];
    if(a.pool===POOL_OFF&&sh!=='O')return '';
    const bad=need>0&&af<need, tight=need>0&&af===need;
    return `<span class="adv-n${bad?' bad':(tight?' tight':'')}">
      ${chip(sh)}<b>${b===af?b:(b+'→'+af)}</b>${need?`<i>/${need}</i>`:''}</span>`;
  };
  return `<div class="adv-cnt">${poolChip(a.pool)}${cell('D')}${cell('N')}${cell('O')}
    <span class="adv-n rest">${chip('R')}<b>${a.before.R}</b></span></div>`;
}
/* Khối chi tiết cho MỘT ngày */
function advDayHtml(a,mode){
  const same=a.offTeam.length, other=a.off.length-same;
  const why=a.reasons.map(r=>`<li class="${r.lv}">${esc(r.txt)}</li>`).join('')
          + a.pluses.map(p=>`<li class="ok">${esc(p)}</li>`).join('');
  return `<div class="adv-day ${a.level}">
    <div class="adv-dh">
      <b>${fmtVN(a.iso)} <i>${dowOf(a.iso)}</i></b>
      ${a.cur?chip(a.cur):`<span class="muted">${t('chưa xếp ca')}</span>`}
      ${a.newCode?`<span class="arw">→</span>${chip(a.newCode)}`:''}
      <span class="sp"></span>${advChip(a.level,mode)}
    </div>
    ${advCountHtml(a)}
    <ul class="adv-why">${why||`<li class="ok">${t('Không có vướng mắc nào.')}</li>`}</ul>
    <div class="adv-off">
      <span class="lb">${t('Đã nghỉ ngày này')}:</span>
      ${a.off.length
        ? a.offTeam.map(x=>advOffChip(x,true)).join('')
          + a.off.filter(x=>x.team!==a.team).map(x=>advOffChip(x,false)).join('')
          + `<span class="adv-sum">${same} ${t('cùng nhóm')}${other?` · ${other} ${t('nhóm khác')}`:''}</span>`
        : `<span class="muted">${t('chưa có ai')}</span>`}
    </div>
    ${a.cover.length?`<div class="adv-cover"><span class="lb">${t('Có thể huy động')} (${t('nghỉ ca R, cùng khối')}):</span>
      ${a.cover.map(x=>`<span class="adv-cv">${esc(shortName(x.name)||x.id)}${x.team?` <em>${esc(teamShort(x.team))}</em>`:''}</span>`).join('')}</div>`:''}
  </div>`;
}

/* ------------------------------------------------------------
   KHUYẾN NGHỊ CHO CẢ MỘT ĐƠN
   Trả về {kind, days:[advice], level, notes:[...]}
   kind: 'leave'  — đơn làm người đó vắng ca (nghỉ phép / đổi sang mã nghỉ)
         'swap'   — đổi ca (kiểm tra hai khối)
         'ot'     — tăng ca (trần giờ, ai cover được)
         'info'   — các loại còn lại: chỉ cho biết ai đang nghỉ hôm đó
   ------------------------------------------------------------ */
function reqAdvice(r){
  const out={kind:'info',days:[],level:'ok',notes:[]};
  if(!r)return out;
  const days=(r.type==='multi')?[]:(reqDays(r)||[]);

  if(r.type==='swap'){
    out.kind='swap';
    const pa=poolOfId(r.empId), pb=r.withId?poolOfId(r.withId):pa;
    if(r.withId&&pa!==pb){
      out.level='block';
      out.notes.push({lv:'block',txt:t('Hai người khác khối nhân lực')+' ('+t(POOL_LABEL[pa])+' ⇄ '+
        t(POOL_LABEL[pb])+') — '+t('khối văn phòng và khối sản xuất không trực thay ca cho nhau được.')});
    }else{
      out.notes.push({lv:'ok',txt:t('Hai người cùng khối')+' '+t(POOL_LABEL[pa])+' — '+t('đổi ca hợp lệ về mặt bố trí.')});
    }
    days.forEach(d=>{
      const bad=swapBlockList(r.empId,r.withId,[d.iso]);
      if(bad.length){out.level='block';out.notes.push({lv:'block',txt:bad.join(' · ')});}
    });
    return out;
  }

  if(r.type==='ot'){
    out.kind='ot';
    const lim=(typeof asOtLimit==='function')?asOtLimit():40;
    const ym=days.length?schedMonthOf(days[0].iso):curSchedMonth();
    const used=advOtUsedInPeriod(r.empId,ym,r.id);
    const add=(typeof reqHours==='function')?reqHours(r):0;
    if(used+add>lim){
      out.level='warn';
      out.notes.push({lv:'warn',txt:t('Tăng ca kỳ')+' '+periodFor(ym).label+': '+rnd1(used)+'h + '+
        rnd1(add)+'h = '+rnd1(used+add)+'h > '+t('trần')+' '+lim+'h.'});
    }else{
      out.notes.push({lv:'ok',txt:t('Tăng ca kỳ')+' '+periodFor(ym).label+': '+rnd1(used+add)+'h / '+lim+'h '+t('trần')+'.'});
    }
    days.forEach(d=>{
      const cur=eff(r.empId,d.iso).code, sh=advShiftOf(cur);
      if(sh==='LEAVE'){out.level='warn';
        out.notes.push({lv:'warn',txt:fmtVN(d.iso)+': '+t('người này đang nghỉ phép')+' ('+cur+') '+t('mà lại xin tăng ca.')});}
    });
    return out;
  }

  /* Đơn làm người đó rời ca: nghỉ phép, hoặc đổi mã ca sang mã nghỉ */
  const leaveDays=days.filter(d=>advCodeLeavesShift(d.code)||r.type==='leave');
  if(leaveDays.length){
    out.kind='leave';
    out.days=leaveDays.slice(0,10).map(d=>leaveAdvice(r.empId,d.iso,d.code||'AL8',r.id));
    out.level=advWorst(out.days);
    if(leaveDays.length>10)out.notes.push({lv:'ok',txt:t('Đơn có')+' '+leaveDays.length+' '+t('ngày — đang hiện 10 ngày đầu.')});
    return out;
  }

  /* Còn lại: chỉ cho biết bối cảnh ngày đó */
  out.days=days.slice(0,6).map(d=>leaveAdvice(r.empId,d.iso,d.code||'',r.id));
  out.level='ok';
  return out;
}
/* Giờ tăng ca đã duyệt trong kỳ (không tính đơn đang xét) */
function advOtUsedInPeriod(empId,ym,skipReqId){
  let h=0;
  daysOfPeriod(ym).forEach(iso=>{
    const o=S.over[empId]&&S.over[empId][iso];
    if(!o||!o.code||codeInfo(o.code).cat!=='ot')return;
    if(skipReqId&&o.reqId===skipReqId)return;
    h+=(typeof o.hours==='number'&&o.hours>0)?o.hours:getHours(o.code);
  });
  return h;
}

/* Panel gắn vào một dòng đơn ở màn Duyệt */
function reqAdviceHtml(r){
  const a=reqAdvice(r);
  const head=`<div class="adv-head">🧭 <b>${t('Trợ lý duyệt đơn')}</b>${advChip(a.level,'appr')}
    <span class="muted sm2">${t('tính theo lịch & đơn đang có, không tải thêm dữ liệu')}</span></div>`;
  const notes=a.notes.length
    ? `<ul class="adv-why">${a.notes.map(n=>`<li class="${n.lv}">${esc(n.txt)}</li>`).join('')}</ul>`:'';
  const body=a.days.map(x=>advDayHtml(x,'appr')).join('');
  return `<div class="adv-box ${a.level}">${head}${notes}${body||
    (a.notes.length?'':`<p class="muted sm2">${t('Loại đơn này không ảnh hưởng tới bố trí ca.')}</p>`)}</div>`;
}

/* ------------------------------------------------------------
   NHẮC NHỞ CHO NGƯỜI LÀM ĐƠN (trong form gửi đơn ở trang chính)
   Cùng một engine, đổi giọng: cho biết hôm đó ai đã nghỉ, đơn của họ
   đang ở trạng thái nào, và khả năng đơn của mình có bị vướng không.
   ------------------------------------------------------------ */
function advForFormHtml(empId,rows,type){
  if(!empId||!rows||!rows.length)return '';
  const isos=[...new Set(rows.map(r=>r.iso).filter(Boolean))].sort().slice(0,6);
  if(!isos.length)return '';

  if(type==='swap'){
    return '';   // đơn đổi ca đã có cảnh báo riêng ở dsFormUI()
  }
  const leaveLike=(type==='leave')||rows.some(r=>advCodeLeavesShift(r.code));
  const list=isos.map(iso=>{
    const row=rows.find(r=>r.iso===iso)||{};
    return leaveAdvice(empId,iso,leaveLike?(row.code||'AL8'):'');
  });
  const lv=leaveLike?advWorst(list):'ok';

  const dayHtml=list.map(a=>{
    const same=a.offTeam.length;
    const who=a.off.length
      ? a.offTeam.map(x=>advOffChip(x,true)).join('')+
        a.off.filter(x=>x.team!==a.team).map(x=>advOffChip(x,false)).join('')
      : `<span class="muted">${t('chưa có ai')}</span>`;
    const tip=leaveLike
      ? a.reasons.filter(x=>x.lv!=='ok').map(x=>`<li class="${x.lv}">${esc(x.txt)}</li>`).join('')
      : '';
    return `<div class="adv-day ${leaveLike?a.level:'ok'}">
      <div class="adv-dh"><b>${fmtVN(a.iso)} <i>${dowOf(a.iso)}</i></b>
        ${a.cur?chip(a.cur):`<span class="muted">${t('chưa xếp ca')}</span>`}
        <span class="sp"></span>${leaveLike?advChip(a.level,'emp'):''}</div>
      <div class="adv-off"><span class="lb">${t('Đã nghỉ ngày này')}:</span>${who}
        ${a.off.length?`<span class="adv-sum">${same} ${t('cùng nhóm')}</span>`:''}</div>
      ${tip?`<ul class="adv-why">${tip}</ul>`:''}
    </div>`;
  }).join('');

  return `<div class="adv-box emp ${lv}">
    <div class="adv-head">🔎 <b>${t('Trước khi gửi, xem qua ngày này')}</b>${leaveLike?advChip(lv,'emp'):''}</div>
    ${dayHtml}
    <p class="muted sm2">${t('Danh sách gồm cả đơn của người khác đang chờ duyệt — nếu trùng ngày, ai gửi trước thường được xét trước.')}</p>
  </div>`;
}
