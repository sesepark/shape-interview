/* SHAPE 2기 선발 결과 확인
 * 공개 파일에는 이름과 학번이 없습니다. 브라우저가 입력값으로 PBKDF2 조회 키를
 * 만들고, 같은 키에 연결된 결과 코드만 확인합니다.
 */
(function () {
  'use strict';

  var MAIL = 'snu.shape@gmail.com';
  var DB = window.SHAPE_RESULTS;
  var form = document.getElementById('lookup');
  var nameEl = document.getElementById('name');
  var sidEl = document.getElementById('sid');
  var errEl = document.getElementById('formError');
  var btn = document.getElementById('submitBtn');
  var out = document.getElementById('result');
  var dialog = document.getElementById('contactDialog');
  var enc = new TextEncoder();
  var busy = false;

  function normName(v) {
    return String(v).normalize('NFC').replace(/\s+/g, '').toLowerCase();
  }

  function normSid(v) {
    return String(v).replace(/[^0-9]/g, '');
  }

  function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }

  function bytesToHex(buf) {
    var view = new Uint8Array(buf), value = '';
    for (var i = 0; i < view.length; i++) value += view[i].toString(16).padStart(2, '0');
    return value;
  }

  function derive(material) {
    return crypto.subtle.importKey('raw', enc.encode(material), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits({
          name: 'PBKDF2', salt: hexToBytes(DB.salt), iterations: DB.iterations, hash: 'SHA-256'
        }, key, DB.bytes * 8);
      })
      .then(bytesToHex);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function displayName(raw) {
    var value = raw.trim().replace(/\s+/g, ' ');
    return /[가-힣]/.test(value) && !/[A-Za-z]/.test(value) ? value.replace(/\s+/g, '') : value;
  }

  var ACTIONS =
    '<div class="result-actions">' +
      '<button type="button" class="button secondary" id="contactBtn">문의하기</button>' +
      '<button type="button" class="button secondary" id="againBtn">다시 조회</button>' +
    '</div>';

  function show(html) {
    out.innerHTML = html;
    form.hidden = true;
    out.hidden = false;
    out.setAttribute('tabindex', '-1');
    out.focus({ preventScroll: true });
    out.scrollIntoView({ block: 'nearest' });
    document.getElementById('againBtn').addEventListener('click', reset);
    document.getElementById('contactBtn').addEventListener('click', openContact);
  }

  function reset() {
    out.hidden = true;
    out.innerHTML = '';
    form.hidden = false;
    errEl.hidden = true;
    nameEl.value = '';
    sidEl.value = '';
    nameEl.focus();
  }

  function renderPass(name, membership) {
    var label = membership === 'regular' ? '정회원 합격' : '준회원 합격';
    show(
      '<div class="result-head">' +
        '<p class="result-name">' + esc(displayName(name)) + ' 님</p>' +
      '</div>' +
      '<h2 class="result-title outcome-title">최종 합격을 축하드립니다</h2>' +
      '<p class="result-body">SHAPE 2기 <b>' + label.replace(' 합격', '') + '</b>으로 최종 선발되셨습니다.</p>' +
      '<div class="result-callout">' +
        '<span class="callout-label">신입 부원 OT</span>' +
        '<strong>9월 15일(화) 오후 7시</strong>' +
        '<span>서울대학교 301동 105호</span>' +
        '<p>원활한 활동 안내를 위해 참석해 주세요.</p>' +
      '</div>' +
      '<p class="result-notice"><b>9월 14일(월) 중</b> 카카오톡 단체방에 초대해 드릴 예정입니다.</p>' +
      ACTIONS
    );
  }

  function renderRejected(name) {
    show(
      '<div class="result-head">' +
        '<p class="result-name">' + esc(displayName(name)) + ' 님</p>' +
      '</div>' +
      '<h2 class="result-title outcome-title">SHAPE 2기 선발 결과 안내</h2>' +
      '<p class="result-body">아쉽게도 이번 SHAPE 2기 부원으로 최종 선발되지 않았습니다.</p>' +
      '<p class="result-body">SHAPE에 관심을 가지고 지원해 주시고, 면접에 귀한 시간을 내어 참여해 주셔서 진심으로 감사드립니다.</p>' +
      '<p class="result-body">보내주신 관심과 열정에 다시 한번 감사드리며, 앞으로의 활동을 응원하겠습니다.</p>' +
      ACTIONS
    );
  }

  function renderNotFound() {
    show(
      '<h2 class="result-title">선발 결과 명단에서 찾지 못했습니다</h2>' +
      '<p class="result-body">이름과 학번이 <b>지원서에 적으신 것과 한 글자라도 다르면</b> 찾지 못합니다. ' +
      '띄어쓰기와 학번의 하이픈은 무시하니, 이름의 글자와 학번 아홉 자리를 다시 확인해 주세요.</p>' +
      '<p class="result-body">계속 조회되지 않으면 문의하기로 연락해 주세요.</p>' +
      ACTIONS
    );
  }

  function openContact() {
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeContact() {
    if (dialog.close) dialog.close();
    else dialog.removeAttribute('open');
  }

  var copyBtn = document.getElementById('copyMailBtn');
  var copyTimer = null;
  document.getElementById('closeDialogBtn').addEventListener('click', closeContact);
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closeContact(); });
  dialog.addEventListener('close', function () {
    clearTimeout(copyTimer);
    copyBtn.textContent = '주소 복사';
  });

  copyBtn.addEventListener('click', function () {
    function done(msg) {
      copyBtn.textContent = msg;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () { copyBtn.textContent = '주소 복사'; }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(MAIL).then(function () { done('복사했습니다'); },
                                              function () { done('직접 복사해 주세요'); });
    } else {
      var range = document.createRange();
      range.selectNodeContents(document.querySelector('.contact-mail'));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      done('길게 눌러 복사');
    }
  });

  function fail(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function setBusy(on) {
    busy = on;
    btn.disabled = on;
    btn.textContent = on ? '확인하는 중…' : '결과 확인';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    errEl.hidden = true;

    var rawName = nameEl.value.trim();
    var sid = normSid(sidEl.value);
    if (!rawName || !sid) return fail('이름과 학번을 모두 입력해 주세요.');
    if (sid.length !== 9) return fail('학번은 2025-12345처럼 아홉 자리입니다.');
    if (!DB) return fail('결과 명단을 불러오지 못했습니다. 새로고침해 주세요.');
    if (!window.crypto || !crypto.subtle) {
      return fail('이 브라우저에서는 조회할 수 없습니다. 크롬·사파리 최신 버전에서 열어 주세요.');
    }

    setBusy(true);
    derive(normName(rawName) + '|' + sid).then(function (key) {
      var result = DB.people[key];
      if (result === 'j') renderPass(rawName, 'junior');
      else if (result === 'r') renderPass(rawName, 'regular');
      else if (result === 'n') renderRejected(rawName);
      else renderNotFound();
    }).catch(function () {
      fail('조회 중 문제가 생겼습니다. 새로고침한 뒤 다시 시도해 주세요.');
    }).then(function () {
      setBusy(false);
    });
  });

  [nameEl, sidEl].forEach(function (el) {
    el.addEventListener('input', function () { errEl.hidden = true; });
  });
})();
