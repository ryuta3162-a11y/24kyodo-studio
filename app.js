const state = {
  data: null,
  selectedSlot: null,
};

const els = {
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  monthLabel: document.getElementById('month-label'),
  teamGrid: document.getElementById('team-grid'),
  stepDate: document.getElementById('step-date'),
  stepTime: document.getElementById('step-time'),
  stepForm: document.getElementById('step-form'),
  stepSubmitting: document.getElementById('step-submitting'),
  stepSuccess: document.getElementById('step-success'),
  dateList: document.getElementById('date-list'),
  timeList: document.getElementById('time-list'),
  selectedDateLabel: document.getElementById('selected-date-label'),
  selectedSummary: document.getElementById('selected-summary'),
  successDetails: document.getElementById('success-details'),
  form: document.getElementById('booking-form'),
  submitBtn: document.getElementById('submit-btn'),
  restartBtn: document.getElementById('restart-btn'),
  steps: document.querySelectorAll('.booking-step'),
};

function showPanel(name) {
  const panels = {
    date: els.stepDate,
    time: els.stepTime,
    form: els.stepForm,
    submitting: els.stepSubmitting,
    success: els.stepSuccess,
  };
  Object.entries(panels).forEach(([n, el]) => el.classList.toggle('hidden', n !== name));

  const stepNum = { date: 1, time: 2, form: 3, submitting: 3, success: 3 }[name];
  els.steps.forEach((s) => {
    const n = parseInt(s.dataset.step, 10);
    s.classList.toggle('active', n === stepNum && name !== 'success');
    s.classList.toggle('done', n < stepNum || name === 'success');
  });
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
    els.teamGrid.innerHTML = '';

    list.forEach((person) => {
      const card = document.createElement('article');
      card.className = 'team-card';

      const photoWrap = document.createElement('div');
      photoWrap.className = 'team-photo-wrap';

      const hasPhoto = person.photo && String(person.photo).trim();
      if (hasPhoto) {
        const img = document.createElement('img');
        img.src = person.photo;
        img.alt = person.name;
        img.loading = 'lazy';
        img.onerror = () => {
          img.replaceWith(makeGuestIcon());
        };
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
        const displayEl = document.createElement('p');
        displayEl.className = 'team-display';
        displayEl.textContent = person.display;
        card.appendChild(displayEl);
      }

      const roleEl = document.createElement('p');
      roleEl.className = 'team-role';
      roleEl.textContent = person.role;
      card.appendChild(roleEl);

      els.teamGrid.appendChild(card);
    });
  } catch {
    els.teamGrid.innerHTML = '<p class="section-desc">スタッフ情報を読み込めませんでした。</p>';
  }
}

function groupByDate(slots) {
  const map = new Map();
  for (const slot of slots) {
    if (!map.has(slot.date)) map.set(slot.date, { label: slot.label, slots: [] });
    map.get(slot.date).slots.push(slot);
  }
  return map;
}

function renderDates() {
  const grouped = groupByDate(state.data.slots);
  els.dateList.innerHTML = '';
  for (const [, { label, slots }] of grouped) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'date-btn';
    btn.innerHTML = `<span>${label}</span><span class="count">${slots.length}枠</span>`;
    btn.addEventListener('click', () => {
      state.selectedSlot = null;
      renderTimes(slots, label);
      showPanel('time');
    });
    els.dateList.appendChild(btn);
  }
}

function renderTimes(slots, label) {
  els.selectedDateLabel.textContent = label + ' — 時間を選択';
  els.timeList.innerHTML = '';
  const seen = new Set();
  for (const slot of slots) {
    if (seen.has(slot.start)) continue;
    seen.add(slot.start);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'time-btn';
    btn.textContent = slot.start;
    btn.addEventListener('click', () => {
      state.selectedSlot = slot;
      clearFormError();
      els.selectedSummary.innerHTML =
        `<strong>${slot.label}</strong><br>${slot.start} 〜 ${slot.end}（60分）`;
      showPanel('form');
    });
    els.timeList.appendChild(btn);
  }
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
  const slot = state.selectedSlot;

  const payload = {
    date: slot.date,
    dateLabel: slot.label,
    start: slot.start,
    end: slot.end,
    name: fd.get('name'),
    phone: fd.get('phone'),
    email: fd.get('email'),
    note: fd.get('note') || '',
  };

  els.submitBtn.disabled = true;
  showPanel('submitting');

  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || '送信に失敗しました');

    els.successDetails.innerHTML = `
      <dt>日時</dt><dd>${escapeHtml(slot.label)} ${slot.start}〜${slot.end}</dd>
      <dt>お名前</dt><dd>${escapeHtml(payload.name)}</dd>
      <dt>電話番号</dt><dd>${escapeHtml(payload.phone)}</dd>
      <dt>メール</dt><dd>${escapeHtml(payload.email)}</dd>
      <dt>ステータス</dt><dd>${escapeHtml(data.status || '申請済み')}</dd>
    `;
    showPanel('success');
    document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showPanel('form');
    showFormError(err.message);
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
  state.selectedSlot = null;
  els.form.reset();
  clearFormError();
  showPanel('date');
}

document.querySelectorAll('.link-back').forEach((btn) => {
  btn.addEventListener('click', () => {
    showPanel(btn.dataset.back === 'date' ? 'date' : 'time');
  });
});

els.form.addEventListener('submit', handleSubmit);
els.restartBtn.addEventListener('click', restart);

async function init() {
  renderTeam();
  try {
    const res = await fetch('/api/slots');
    if (!res.ok) throw new Error('予約可能時間を読み込めませんでした');
    state.data = await res.json();
    els.monthLabel.textContent = state.data.month;
    els.loading.classList.add('hidden');
    renderDates();
    showPanel('date');
  } catch (err) {
    els.loading.classList.add('hidden');
    els.error.classList.remove('hidden');
    els.error.textContent = err.message;
  }
}

init();
