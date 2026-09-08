/* SHAPE 2기 면접 시간 확인
 *
 * 명단은 assets/schedule.js 에 조회 키만 실려 있습니다. 이름과 학번은 이 파일
 * 안에서 같은 방식(PBKDF2-HMAC-SHA256)으로 키를 만들어 대조할 뿐이고, 어디로도
 * 나가지 않습니다.
 */
(function () {
  'use strict';

  var PLACE = '서울대학교 44-1동 401-1호';
  var ARRIVE_EARLY = 10; // 분
  var CAL_MINUTES = 30;  // 달력에 넣을 때만 쓰는 길이

  var DB = window.SHAPE_SCHEDULE;
  var form = document.getElementById('lookup');
  var nameEl = document.getElementById('name');
  var sidEl = document.getElementById('sid');
  var errEl = document.getElementById('formError');
  var btn = document.getElementById('submitBtn');
  var out = document.getElementById('result');
  var busy = false;

  /* ── 입력 정리 — tools/build_schedule.py 와 규칙이 같아야 합니다 ────── */

  function normName(v) {
    return String(v).normalize('NFC').replace(/\s+/g, '').toLowerCase();
  }
  function normSid(v) {
    return String(v).replace(/[^0-9]/g, '');
  }

  /* ── 키 만들기 ─────────────────────────────────────────────────────── */

  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function bytesToHex(buf) {
    var view = new Uint8Array(buf), s = '';
    for (var i = 0; i < view.length; i++) s += view[i].toString(16).padStart(2, '0');
    return s;
  }
  function derive(material) {
    var enc = new TextEncoder().encode(material);
    return crypto.subtle.importKey('raw', enc, 'PBKDF2', false, ['deriveBits']).then(function (key) {
      return crypto.subtle.deriveBits({
        name: 'PBKDF2', salt: hexToBytes(DB.salt), iterations: DB.iterations, hash: 'SHA-256'
      }, key, DB.bytes * 8);
    }).then(bytesToHex);
  }

  /* ── 시각 ──────────────────────────────────────────────────────────── */

  function pad(n) { return String(n).padStart(2, '0'); }
  function hhmm(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }

  function korTime(min) {
    var h = Math.floor(min / 60), m = min % 60;
    var half = h < 12 ? '오전' : '오후';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return half + ' ' + h12 + '시' + (m ? ' ' + m + '분' : '');
  }

  /** 브라우저가 어느 시간대에 있든 한국 시각으로 읽습니다. */
  function todayKst() {
    var d = new Date();
    var kst = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 9 * 3600000);
    return { y: kst.getFullYear(), m: kst.getMonth() + 1, d: kst.getDate(), min: kst.getHours() * 60 + kst.getMinutes() };
  }

  function daysBetween(a, b) {
    var ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
    return Math.round(ms / 86400000);
  }

  function countdown(rec) {
    var parts = rec.d.split('-');
    var when = { y: +parts[0], m: +parts[1], d: +parts[2] };
    var now = todayKst();
    var diff = daysBetween(now, when);
    if (diff > 1) return { text: 'D-' + diff, cls: 'info' };
    if (diff === 1) return { text: '내일', cls: 'info' };
    if (diff === 0) return now.min > rec.t ? { text: '오늘 · 시작 시각이 지났습니다', cls: 'warn' } : { text: '오늘', cls: 'success' };
    return { text: '지난 일정', cls: 'warn' };
  }

  /* ── 그리기 ────────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 한글 이름은 "구 진 모" 처럼 띄어 써도 붙여서 보여 줍니다. */
  function displayName(raw) {
    var v = raw.trim().replace(/\s+/g, ' ');
    return /[가-힣]/.test(v) && !/[A-Za-z]/.test(v) ? v.replace(/\s+/g, '') : v;
  }

  function show(html) {
    out.innerHTML = html;
    out.setAttribute('tabindex', '-1');
    out.focus({ preventScroll: true });
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function panel(title, body) {
    return '<section class="result-panel"><h2>' + title + '</h2>' + body + '</section>';
  }

  function renderFound(name, rec) {
    var parts = rec.d.split('-');
    var cd = countdown(rec);
    var arrive = rec.t - ARRIVE_EARLY;
    show(
      '<article class="result-card">' +
        '<div class="result-head">' +
          '<p class="result-name">' + esc(displayName(name)) + ' 님</p>' +
          '<span class="badge ' + cd.cls + '">' + cd.text + '</span>' +
        '</div>' +
        '<p class="result-date">' + (+parts[0]) + '년 ' + (+parts[1]) + '월 ' + (+parts[2]) + '일 ' + rec.w + '요일</p>' +
        '<p class="result-time">' + hhmm(rec.t) + '<span class="ampm">' + korTime(rec.t) + '</span></p>' +
        '<p class="result-arrive"><b>' + hhmm(arrive) + '</b>까지 면접 장소에 도착해 주세요.</p>' +
        '<dl class="result-meta">' +
          '<div><dt>장소</dt><dd>' + PLACE + '</dd></div>' +
          '<div><dt>방식</dt><dd>다대다 면접</dd></div>' +
        '</dl>' +
        '<div class="result-actions"><button type="button" class="button secondary" id="icsBtn">달력에 저장 (.ics)</button></div>' +
      '</article>'
    );
    var ics = document.getElementById('icsBtn');
    if (ics) ics.addEventListener('click', function () { saveIcs(rec); });
  }

  function renderPending(name) {
    show(panel(esc(displayName(name)) + ' 님은 면접 시간을 조율 중입니다',
      '<p>주신 가능 시간으로는 일정이 잡히지 않아, 운영진이 따로 연락드릴 예정입니다. ' +
      '지원서에 적어 주신 연락처를 확인해 주세요.</p>'));
  }

  function renderNotFound() {
    show(panel('면접 대상자 명단에서 찾지 못했습니다',
      '<p>이름과 학번이 <b>지원서에 적으신 것과 한 글자라도 다르면</b> 찾지 못합니다. ' +
      '띄어쓰기와 학번의 하이픈은 무시하니, 이름의 글자와 학번 아홉 자리를 다시 확인해 주세요.</p>' +
      '<p>안내 메일을 받으셨는데도 조회되지 않으면 지원서에 적어 주신 연락처로 회신해 주세요.</p>'));
  }

  /* ── 달력 파일 ─────────────────────────────────────────────────────── */

  function utcStamp(dateStr, minutes) {
    var p = dateStr.split('-');
    var t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], Math.floor(minutes / 60) - 9, minutes % 60));
    return t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()) + 'T' +
           pad(t.getUTCHours()) + pad(t.getUTCMinutes()) + '00Z';
  }

  /** RFC 5545 는 한 줄을 75 옥텟에서 접으라고 합니다. 한글은 한 자가 3 옥텟이라
   *  글자 수로 세면 금방 넘칩니다. */
  function fold(line) {
    var bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    var out = [], buf = '', size = 0, limit = 75;
    for (var ch of line) {
      var n = new TextEncoder().encode(ch).length;
      if (size + n > limit) { out.push(buf); buf = ' '; size = 1; limit = 74; }
      buf += ch; size += n;
    }
    out.push(buf);
    return out.join('\r\n');
  }

  function saveIcs(rec) {
    var body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SHAPE//interview//KO',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + rec.d.replace(/-/g, '') + '-' + rec.t + '@snu-shape.com',
      'DTSTAMP:' + utcStamp(rec.d, rec.t),
      'DTSTART:' + utcStamp(rec.d, rec.t),
      'DTEND:' + utcStamp(rec.d, rec.t + CAL_MINUTES),
      'SUMMARY:SHAPE 2기 면접',
      'LOCATION:' + PLACE,
      'DESCRIPTION:시작 ' + ARRIVE_EARLY + '분 전까지 도착해 주세요.',
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      'DESCRIPTION:SHAPE 2기 면접',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].map(fold).join('\r\n');

    var url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'shape-interview.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ── 조회 ──────────────────────────────────────────────────────────── */

  function fail(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
    out.innerHTML = '';
  }

  function setBusy(on) {
    busy = on;
    btn.disabled = on;
    btn.textContent = on ? '확인하는 중…' : '면접 시간 보기';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    errEl.hidden = true;

    var rawName = nameEl.value.trim();
    var sid = normSid(sidEl.value);

    if (!rawName || !sid) return fail('이름과 학번을 모두 입력해 주세요.');
    if (sid.length !== 9) return fail('학번은 2025-12345 처럼 아홉 자리입니다.');
    if (!DB) return fail('명단을 불러오지 못했습니다. 새로고침해 주세요.');
    if (!window.crypto || !crypto.subtle) {
      return fail('이 브라우저에서는 조회할 수 없습니다. 크롬·사파리 최신 버전에서 열어 주세요.');
    }

    setBusy(true);
    derive(normName(rawName) + '|' + sid).then(function (key) {
      var rec = DB.people[key];
      if (rec && rec.s === 'pending') renderPending(rawName);
      else if (rec) renderFound(rawName, rec);
      else renderNotFound();
    }).catch(function () {
      fail('조회 중 문제가 생겼습니다. 새로고침한 뒤 다시 시도해 주세요.');
    }).then(function () {
      setBusy(false);
    });
  });

  // 값을 고치기 시작하면 앞선 오류 문구를 치웁니다.
  [nameEl, sidEl].forEach(function (el) {
    el.addEventListener('input', function () { errEl.hidden = true; });
  });
})();
