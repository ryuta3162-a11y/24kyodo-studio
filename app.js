const state = {
  data: null,
  selectedDow: null,
  selectedTemplate: null,
  selectedBooking: null,
};

const DOW_LABEL = { 月: 'Mon', 火: 'Tue', 水: 'Wed', 木: 'Thu', 金: 'Fri', 土: 'Sat', 日: 'Sun' };

const els = {
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  formFlow: document.getElementById('form-flow'),
  teamGrid: document.getElementById('team-grid'),
  sectionDow: document.getElementById('section-dow'),
  sectionLesson: document.getElementById('section-lesson'),
  sectionDate: document.getElementById('section-date'),
  sectionForm: document.getElementById('section-form'),
  stepSubmitting: document.getElementById('step-submitting'),
  stepSuccess: document.getElementById('step-success'),
  dowTabs: document.getElementById('dow-tabs'),
  lessonList: document.getElementById('lesson-list'),
  lessonListLabel: document.getElementById('lesson-list-label'),
  selectedLessonSummary: document.getElementById('selected-lesson-summary'),
  dateList: document.getElementById('date-list'),
  selectedSummary: document.getElementById('selected-summary'),
  successDetails: document.getElementById('success-details'),
  form: document.getElementById('booking-form'),
  submitBtn: document.getElementById('submit-btn'),
  restartBtn: document.getElementById('restart-btn'),
};

const DOW_FULL = { 月: '月曜日', 火: '火曜日', 水: '水曜日', 木: '木曜日', 金: '金曜日', 土: '土曜日', 日: '日曜日' };

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function revealSection(el) {
  if (!el || !el.classList.contains('hidden')) return;
  el.classList.remove('hidden');
  el.classList.remove('is-revealing');
  void el.offsetWidth;
  el.classList.add('is-revealing');
}

function updateFlowState() {
  const { selectedDow, selectedTemplate, selectedBooking } = state;

  els.sectionDow.classList.toggle('is-complete', !!selectedDow);
  els.sectionDow.classList.toggle('is-active', !selectedDow);

  if (selectedDow) {
    revealSection(els.sectionLesson);
    els.sectionLesson.classList.toggle('is-complete', !!selectedTemplate);
    els.sectionLesson.classList.toggle('is-active', !selectedTemplate);
  } else {
    els.sectionLesson.classList.add('hidden');
    els.sectionDate.classList.add('hidden');
    els.sectionForm.classList.add('hidden');
  }

  if (selectedTemplate) {
    revealSection(els.sectionDate);
    els.sectionDate.classList.toggle('is-complete', !!selectedBooking);
    els.sectionDate.classList.toggle('is-active', !selectedBooking);
  } else if (selectedDow) {
    els.sectionDate.classList.add('hidden');
    els.sectionForm.classList.add('hidden');
  }

  if (selectedBooking) {
    revealSection(els.sectionForm);
    els.sectionForm.classList.add('is-active');
  } else if (selectedTemplate) {
    els.sectionForm.classList.add('hidden');
  }
}

function showStatePanel(name) {
  els.formFlow.classList.toggle('hidden', name !== 'flow');
  els.stepSubmitting.classList.toggle('hidden', name !== 'submitting');
  els.stepSuccess.classList.toggle('hidden', name !== 'success');
}

function countLessonsForDow(dow) {
  const schedule = state.data.scheduleByDow[dow] || [];
  return schedule.filter((tpl) =>
    state.data.bookable.some(
      (b) => b.dow === dow && b.start === tpl.start && b.end === tpl.end && b.lessonName === tpl.lessonName
    )
  ).length;
}

function norm(s) {
  return String(s).replace(/\s/g, '').toLowerCase();
}

function matchInstructor(scheduleName, person) {
  const keys = [person.display, person.name, person.name.replace(/\s/g, '')].filter(Boolean);
  const sn = norm(scheduleName);
  return keys.some((k) => {
    const nk = norm(k);
    return nk === sn || sn.includes(nk) || nk.includes(sn);
  });
}

function buildInstructorLessons() {
  const map = new Map();
  if (!state.data?.scheduleByDow) return map;

  Object.entries(state.data.scheduleByDow).forEach(([dow, lessons]) => {
    lessons.forEach((tpl) => {
      const hasBookable = state.data.bookable.some(
        (b) => b.dow === dow && b.start === tpl.start && b.end === tpl.end && b.lessonName === tpl.lessonName
      );
      if (!hasBookable) return;

      const key = tpl.instructor;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ dow, start: tpl.start, end: tpl.end, lessonName: tpl.lessonName });
    });
  });

  map.forEach((lessons) => {
    const dowOrder = state.data.dowOrder || [];
    lessons.sort((a, b) => {
      const di = dowOrder.indexOf(a.dow) - dowOrder.indexOf(b.dow);
      if (di !== 0) return di;
      return a.start.localeCompare(b.start);
    });
  });

  return map;
}

function makeGuestIcon() {
  const div = document.createElement('div');
  div.className = 'team-guest-icon';
  div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
  return div;
}

async function renderTeam() {
  try {
    const res = await fetch('data/instructors.json');
    const list = await res.json();
    const lessonMap = buildInstructorLessons();
    els.teamGrid.innerHTML = '';

    list.forEach((person) => {
      const lessons = [];
      lessonMap.forEach((items, instructorKey) => {
        if (matchInstructor(instructorKey, person)) lessons.push(...items);
      });
      if (lessons.length === 0) return;

      const card = document.createElement('article');
      card.className = 'team-card';

      const photoWrap = document.createElement('div');
      photoWrap.className = 'team-photo-wrap';
      if (person.photo) {
        const img = document.createElement('img');
        img.src = person.photo;
        img.alt = person.name;
        img.loading = 'lazy';
        img.onerror = () => img.replaceWith(makeGuestIcon());
        photoWrap.appendChild(img);
      } else {
        photoWrap.appendChild(makeGuestIcon());
      }
      card.appendChild(photoWrap);

      const nameEl = document.createElement('p');
      nameEl.className = 'team-name';
      nameEl.textContent = person.name;
      card.appendChild(nameEl);

      if (person.display && person.display !== person.name) {
        const d = document.createElement('p');
        d.className = 'team-display';
        d.textContent = person.display;
        card.appendChild(d);
      }

      const ul = document.createElement('ul');
      ul.className = 'team-lessons';
      lessons.forEach((l) => {
        const li = document.createElement('li');
        const dowClass = l.dow === '土' ? 'tl-dow-sat' : l.dow === '日' ? 'tl-dow-sun' : '';
        li.innerHTML = `
          <span class="tl-row">
            <span class="tl-dow ${dowClass}">${l.dow}</span>
            <span class="tl-time">${l.start}</span>
          </span>
          <span class="tl-name">${escapeHtml(l.lessonName)}</span>
        `;
        ul.appendChild(li);
      });
      card.appendChild(ul);
      els.teamGrid.appendChild(card);
    });
  } catch {
    els.teamGrid.innerHTML = '';
  }
}

function initFoldSections() {
  document.querySelectorAll('.fold-banner').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
      panel.classList.toggle('is-open', !open);
    });
  });
}

function getAvailableDows() {
  const dows = new Set(state.data.bookable.map((b) => b.dow));
  return (state.data.dowOrder || []).filter((d) => dows.has(d));
}

function parseTimeMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

function calcDuration(start, end) {
  const mins = parseTimeMin(end) - parseTimeMin(start);
  return mins > 0 ? `${mins}分` : '';
}

function renderDowStrip() {
  els.dowTabs.innerHTML = '';
  els.dowTabs.className = 'dow-strip dow-strip--pick';

  getAvailableDows().forEach((dow) => {
    const count = countLessonsForDow(dow);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dow-strip-btn';
    if (dow === state.selectedDow) btn.classList.add('active');
    if (dow === '土') btn.classList.add('dow-sat');
    if (dow === '日') btn.classList.add('dow-sun');
    btn.innerHTML = `
      <span class="ds-char">${dow}</span>
      <span class="ds-sub">${DOW_LABEL[dow] || ''}</span>
      <span class="ds-count">${count}</span>
    `;
    btn.addEventListener('click', () => {
      state.selectedDow = dow;
      state.selectedTemplate = null;
      state.selectedBooking = null;
      renderDowStrip();
      renderLessons(dow);
      els.selectedLessonSummary.innerHTML = '';
      els.dateList.innerHTML = '';
      els.selectedSummary.innerHTML = '';
      updateFlowState();
      scrollToSection('section-lesson');
    });
    els.dowTabs.appendChild(btn);
  });
}

function buildLessonCard(tpl, dow, dates, index) {
  const duration = calcDuration(tpl.start, tpl.end);
  const isSelected = state.selectedTemplate
    && state.selectedTemplate.start === tpl.start
    && state.selectedTemplate.end === tpl.end
    && state.selectedTemplate.lessonName === tpl.lessonName;

  const card = document.createElement('article');
  card.className = 'lesson-card' + (isSelected ? ' is-selected' : '');
  card.dataset.dow = dow;
  card.style.animationDelay = `${index * 0.04}s`;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  const meta = [
    tpl.stars ? `<span class="lc-stars">${escapeHtml(tpl.stars)}</span>` : '',
    tpl.note ? `<span class="lc-note">${escapeHtml(tpl.note)}</span>` : '',
  ].filter(Boolean).join('');

  card.innerHTML = `
    <div class="lc-time">
      <span class="lc-start">${tpl.start}</span>
      ${duration ? `<span class="lc-dur">${duration}</span>` : ''}
    </div>
    <div class="lc-body">
      <p class="lc-name">${escapeHtml(tpl.lessonName)}</p>
      <p class="lc-inst">${escapeHtml(tpl.instructor)}</p>
      ${meta ? `<div class="lc-meta">${meta}</div>` : ''}
    </div>
    <span class="lc-check" aria-hidden="true">${isSelected ? '✓' : ''}</span>
  `;

  const select = () => {
    state.selectedTemplate = tpl;
    state.selectedBooking = null;
    renderLessons(dow);
    renderDatesForLesson(dow, tpl, dates);
    updateFlowState();
    scrollToSection('section-date');
  };

  card.addEventListener('click', select);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select();
    }
  });

  return card;
}

function renderLessons(dow) {
  const count = countLessonsForDow(dow);
  if (els.lessonListLabel) {
    els.lessonListLabel.textContent = `${DOW_FULL[dow] || dow} · ${count}クラス`;
    els.lessonListLabel.className = 'lesson-list-label';
    if (dow === '土') els.lessonListLabel.classList.add('label-sat');
    else if (dow === '日') els.lessonListLabel.classList.add('label-sun');
    else els.lessonListLabel.classList.add('label-wday');
  }
  els.lessonList.innerHTML = '';

  const schedule = state.data.scheduleByDow[dow] || [];
  let index = 0;
  schedule.forEach((tpl) => {
    const dates = state.data.bookable.filter(
      (b) => b.dow === dow && b.start === tpl.start && b.end === tpl.end && b.lessonName === tpl.lessonName
    );
    if (dates.length === 0) return;
    els.lessonList.appendChild(buildLessonCard(tpl, dow, dates, index++));
  });

  if (!els.lessonList.children.length) {
    els.lessonList.innerHTML = '<p class="hint">この曜日は現在予約可能なヨガレッスンがありません。</p>';
  }
}

function renderDatesForLesson(dow, tpl, dates) {
  const duration = calcDuration(tpl.start, tpl.end);
  els.selectedLessonSummary.innerHTML = `
    <div class="recap-time">${tpl.start}<span>–</span>${tpl.end}${duration ? `<em>${duration}</em>` : ''}</div>
    <div class="recap-name">${escapeHtml(tpl.lessonName)}</div>
    <div class="recap-meta">${escapeHtml(tpl.instructor)}${tpl.stars ? ` · ${escapeHtml(tpl.stars)}` : ''}</div>
  `;
  els.dateList.innerHTML = '';

  dates.forEach((slot) => {
    const parts = slot.dateLabel.match(/(\d+)月(\d+)日(?:（(.)）|\((.)\))?/);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'date-btn';
    if (slot.dow === '土') btn.classList.add('date-sat');
    if (slot.dow === '日') btn.classList.add('date-sun');
    if (state.selectedBooking?.date === slot.date
      && state.selectedBooking?.start === slot.start) {
      btn.classList.add('is-selected');
    }

    if (parts) {
      const wd = parts[3] || parts[4] || slot.dow || '';
      btn.innerHTML = `
        <span class="date-btn-label">${parts[1]}月${parts[2]}日</span>
        ${wd ? `<span class="date-btn-wd">（${wd}）</span>` : ''}
      `;
    } else {
      btn.innerHTML = `<span class="date-btn-label">${escapeHtml(slot.dateLabel)}</span>`;
    }

    btn.addEventListener('click', () => {
      state.selectedBooking = slot;
      els.dateList.querySelectorAll('.date-btn').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      els.selectedSummary.innerHTML = `
        <div class="recap-time">${slot.dateLabel} ${slot.start}<span>–</span>${slot.end}</div>
        <div class="recap-name">${escapeHtml(slot.lessonName)}</div>
        <div class="recap-meta">${escapeHtml(slot.instructor)}</div>
      `;
      updateFlowState();
      scrollToSection('section-form');
    });
    els.dateList.appendChild(btn);
  });
}

function clearFormError() {
  const old = els.form.querySelector('.form-error');
  if (old) old.remove();
}

function showFormError(msg) {
  clearFormError();
  const div = document.createElement('div');
  div.className = 'form-error';
  div.textContent = msg;
  els.form.prepend(div);
}

async function handleSubmit(e) {
  e.preventDefault();
  const fd = new FormData(els.form);
  const slot = state.selectedBooking;

  const payload = {
    date: slot.date,
    dateLabel: slot.dateLabel,
    start: slot.start,
    end: slot.end,
    lessonName: slot.lessonName,
    instructor: slot.instructor,
    name: fd.get('name'),
    phone: fd.get('phone'),
    email: fd.get('email'),
    note: fd.get('note') || '',
  };

  els.submitBtn.disabled = true;
  showStatePanel('submitting');

  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || '送信に失敗しました');

    els.successDetails.innerHTML = `
      <dt>日時</dt><dd>${escapeHtml(slot.dateLabel)} ${slot.start}–${slot.end}</dd>
      <dt>レッスン</dt><dd>${escapeHtml(slot.lessonName)}</dd>
      <dt>担当</dt><dd>${escapeHtml(slot.instructor)}</dd>
      <dt>お名前</dt><dd>${escapeHtml(payload.name)}</dd>
      <dt>電話番号</dt><dd>${escapeHtml(payload.phone)}</dd>
      <dt>メール</dt><dd>${escapeHtml(payload.email)}</dd>
    `;
    showStatePanel('success');
  } catch (err) {
    showStatePanel('flow');
    showFormError(err.message);
    scrollToSection('section-form');
  } finally {
    els.submitBtn.disabled = false;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function restart() {
  state.selectedDow = null;
  state.selectedTemplate = null;
  state.selectedBooking = null;
  els.form.reset();
  clearFormError();
  els.selectedLessonSummary.innerHTML = '';
  els.dateList.innerHTML = '';
  els.selectedSummary.innerHTML = '';
  els.lessonList.innerHTML = '';
  if (els.lessonListLabel) els.lessonListLabel.textContent = '';
  renderDowStrip();
  updateFlowState();
  showStatePanel('flow');
  scrollToSection('section-dow');
}

els.form.addEventListener('submit', handleSubmit);
els.restartBtn.addEventListener('click', restart);
initFoldSections();

async function init() {
  try {
    const res = await fetch('/api/slots');
    if (!res.ok) throw new Error('予約可能レッスンを読み込めませんでした');
    state.data = await res.json();
    els.loading.classList.add('hidden');
    els.formFlow.classList.remove('hidden');
    renderDowStrip();
    renderTeam();
    updateFlowState();
    showStatePanel('flow');
  } catch (err) {
    els.loading.classList.add('hidden');
    els.error.classList.remove('hidden');
    els.error.textContent = err.message;
  }
}

init();
