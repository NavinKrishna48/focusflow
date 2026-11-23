let currentTab = 'overview';
let isHighPriority = false;
let selectedDateISO = getTodayISO();
let calWindowStart = getStartOfWeek(new Date());
let selectedMonthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let monthlySelectedDay = new Date().getDate();
let noteFilter = 'All';
let noteInputMode = 'text';
let cardEntryMode = 'spend';
let activeCycleKey = getCycleKeyForDate(getTodayISO());

// Data Store (v4 + Credit Card Cycles)
let tasks = JSON.parse(localStorage.getItem('ff4_tasks')) || [];
let completions = JSON.parse(localStorage.getItem('ff4_completions')) || {};
let reminders = JSON.parse(localStorage.getItem('ff4_reminders')) || [];
let notes = JSON.parse(localStorage.getItem('ff4_notes')) || [];
let highlights = JSON.parse(localStorage.getItem('ff4_highlights')) || {};
let movedLogs = JSON.parse(localStorage.getItem('ff4_movedLogs')) || {};
let cardEntries = JSON.parse(localStorage.getItem('ff4_cardEntries')) || [];
let cardCycleStatus = JSON.parse(localStorage.getItem('ff4_cardCycleStatus')) || {};
let toastTimer = null;

function getTodayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatShortDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStartOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
}

// 20th-to-20th Billing Cycle Helper (e.g., "2026-11" = Nov 20 – Dec 20, 2026)
function getCycleKeyForDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    let y = d.getFullYear(), m = d.getMonth();
    if (d.getDate() < 20) {
        m -= 1;
        if (m < 0) { m = 11; y -= 1; }
    }
    return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function formatCycleLabel(cycleKey) {
    const [y, mStr] = cycleKey.split('-').map(Number);
    const start = new Date(y, mStr - 1, 20);
    const end = new Date(y, mStr, 20);
    const sTxt = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const eTxt = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${sTxt} – ${eTxt}`;
}

// Payable Due Month Logic: Nov 20 – Dec 20 => January 2027
function getPayableMonthLabel(cycleKey) {
    const [y, mStr] = cycleKey.split('-').map(Number);
    const dueDate = new Date(y, (mStr - 1) + 2, 1);
    return dueDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

if (localStorage.getItem('ff_theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ff_theme', next);
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

const daySelect = document.getElementById('monthDaySelect');
if (daySelect) {
    daySelect.innerHTML = '';
    for (let i = 1; i <= 31; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${i}${getOrdinal(i)}`;
        if (i === monthlySelectedDay) opt.selected = true;
        daySelect.appendChild(opt);
    }
}

function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}

function saveAll() {
    localStorage.setItem('ff4_tasks', JSON.stringify(tasks));
    localStorage.setItem('ff4_completions', JSON.stringify(completions));
    localStorage.setItem('ff4_reminders', JSON.stringify(reminders));
    localStorage.setItem('ff4_notes', JSON.stringify(notes));
    localStorage.setItem('ff4_highlights', JSON.stringify(highlights));
    localStorage.setItem('ff4_movedLogs', JSON.stringify(movedLogs));
    localStorage.setItem('ff4_cardEntries', JSON.stringify(cardEntries));
    localStorage.setItem('ff4_cardCycleStatus', JSON.stringify(cardCycleStatus));
    localStorage.setItem('ff4_snapshot', JSON.stringify({
        date: getTodayISO(), tasks, completions, reminders, notes, highlights, movedLogs, cardEntries, cardCycleStatus
    }));
    updateHeaderRing();
    updateReminderBadge();
}

function getTasksForDate(category, dateISO) {
    const dateObj = new Date(dateISO + 'T00:00:00');
    const weekday = dateObj.getDay();
    const dayOfMonth = dateObj.getDate();

    return tasks.filter(t => {
        if (t.category !== category) return false;
        if (t.startDate > dateISO) return false;
        if (t.endDate && t.endDate <= dateISO) return false;
        if (!t.repeat) return t.startDate === dateISO;
        if (category === 'daily') return true;
        if (category === 'weekly') return t.weekday === weekday;
        if (category === 'monthly') return t.monthDay === dayOfMonth;
        return false;
    }).sort((a, b) => b.priority - a.priority);
}

function isTaskCompleted(taskId, dateISO) {
    return Array.isArray(completions[dateISO]) && completions[dateISO].includes(taskId);
}

function toggleTaskComplete(taskId, dateISO) {
    if (!completions[dateISO]) completions[dateISO] = [];
    const idx = completions[dateISO].indexOf(taskId);
    if (idx > -1) completions[dateISO].splice(idx, 1);
    else completions[dateISO].push(taskId);
    saveAll();
    refreshCurrentView();
}

function switchTab(tab, btn) {
    currentTab = tab;
    document.body.setAttribute('data-accent', tab === 'cardbill' ? 'monthly' : tab);
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    const showSharedCal = ['overview', 'daily', 'weekly'].includes(tab);
    document.getElementById('sharedCalWrap').style.display = showSharedCal ? 'block' : 'none';

    if (tab === 'overview') {
        document.getElementById('overviewView').classList.add('active');
        renderCalendarStrip();
        renderOverview();
    } else if (tab === 'cardbill') {
        document.getElementById('cardbillView').classList.add('active');
        if (!document.getElementById('ccSpendDate').value) {
            document.getElementById('ccSpendDate').value = getTodayISO();
        }
        renderCardBillView();
    } else if (['daily', 'weekly', 'monthly'].includes(tab)) {
        document.getElementById('tasksView').classList.add('active');
        const isMonth = tab === 'monthly';
        document.getElementById('monthOnlyCard').style.display = isMonth ? 'flex' : 'none';
        document.getElementById('monthDayPickerWrap').style.display = isMonth ? 'flex' : 'none';
        document.getElementById('templateBar').style.display = tab === 'daily' ? 'flex' : 'none';
        updateRepeatLabel();
        if (isMonth) renderMonthOnlyView();
        else renderCalendarStrip();
        renderTaskSection();
    } else if (tab === 'reports') {
        document.getElementById('reportsView').classList.add('active');
        renderReports();
    } else if (tab === 'reminders') {
        document.getElementById('remindersView').classList.add('active');
        renderReminders();
    } else if (tab === 'notes') {
        document.getElementById('notesView').classList.add('active');
        renderNotes();
    }
}
function refreshCurrentView() {
    renderCalendarStrip();
    if (currentTab === 'overview') renderOverview();
    else if (currentTab === 'cardbill') renderCardBillView();
    else if (['daily', 'weekly', 'monthly'].includes(currentTab)) renderTaskSection();
    else if (currentTab === 'reports') renderReports();
}

function stepDay(delta) {
    const d = new Date(selectedDateISO + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    selectedDateISO = toISO(d);
    calWindowStart = getStartOfWeek(d);
    updateRepeatLabel();
    refreshCurrentView();
}

function shiftCalendar(days) {
    calWindowStart.setDate(calWindowStart.getDate() + days);
    renderCalendarStrip();
}

function jumpToToday() {
    selectedDateISO = getTodayISO();
    calWindowStart = getStartOfWeek(new Date());
    updateRepeatLabel();
    refreshCurrentView();
}

function selectCalendarDate(iso) {
    selectedDateISO = iso;
    updateRepeatLabel();
    refreshCurrentView();
}

function renderCalendarStrip() {
    const strip = document.getElementById('calendarStrip');
    if (!strip) return;
    strip.innerHTML = '';
    const todayISO = getTodayISO();
    const activeCat = ['daily', 'weekly'].includes(currentTab) ? currentTab : 'daily';

    document.getElementById('calMonthLabel').textContent = calWindowStart.toLocaleDateString('en-US', {
        month: 'long', year: 'numeric'
    });

    for (let i = 0; i < 7; i++) {
        const d = new Date(calWindowStart);
        d.setDate(d.getDate() + i);
        const iso = toISO(d);

        const dayTasks = getTasksForDate(activeCat, iso);
        const doneCount = dayTasks.filter(t => isTaskCompleted(t.id, iso)).length;
        let dotClass = '';
        if (dayTasks.length > 0 && doneCount === dayTasks.length) dotClass = 'dot-green';
        else if (doneCount > 0) dotClass = 'dot-amber';

        const cell = document.createElement('div');
        cell.className = `cal-day ${iso === todayISO ? 'is-today' : ''} ${iso === selectedDateISO ? 'selected' : ''}`;
        cell.onclick = () => selectCalendarDate(iso);
        cell.innerHTML = `
            <span class="d-name">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <span class="d-num">${d.getDate()}</span>
            <span class="d-dot ${dotClass}"></span>
        `;
        strip.appendChild(cell);
    }
}

// --- OVERVIEW TAB (MASTER DAILY TIMELINE & AUDIT TRAIL) ---
function saveDailyHighlight() {
    highlights[selectedDateISO] = document.getElementById('dailyHighlightInput').value.trim();
    saveAll();
    showToast('Daily highlight saved');
}

function moveTaskToTodayWithAudit(taskId, fromDateISO) {
    const t = tasks.find(item => item.id === taskId);
    const today = getTodayISO();
    if (!t || fromDateISO === today) return;

    if (!movedLogs[fromDateISO]) movedLogs[fromDateISO] = [];
    if (!movedLogs[fromDateISO].some(m => m.taskId === taskId)) {
        movedLogs[fromDateISO].push({ taskId, text: t.text, toDate: today });
    }

    tasks.unshift({
        id: Date.now(),
        text: t.text,
        subNote: t.subNote || `Carried forward from ${formatShortDate(fromDateISO)}`,
        category: 'daily',
        priority: t.priority,
        repeat: false,
        startDate: today,
        endDate: null,
        weekday: new Date().getDay(),
        monthDay: new Date().getDate()
    });

    saveAll();
    renderOverview();
    showToast(`Moved to Today (${formatShortDate(today)})`);
}

function renderOverview() {
    const iso = selectedDateISO;
    const todayISO = getTodayISO();
    const isPast = iso < todayISO;
    const dObj = new Date(iso + 'T00:00:00');

    document.getElementById('ovDateTitle').textContent = iso === todayISO
        ? `Today's Overview • ${formatShortDate(iso)}`
        : `${dObj.toLocaleDateString('en-US', { weekday: 'short' })}, ${formatShortDate(iso)} Overview`;

    document.getElementById('dailyHighlightInput').value = highlights[iso] || '';

    const allDayTasks = [
        ...getTasksForDate('daily', iso),
        ...getTasksForDate('weekly', iso),
        ...getTasksForDate('monthly', iso)
    ];
    const doneCount = allDayTasks.filter(t => isTaskCompleted(t.id, iso)).length;
    const pct = allDayTasks.length === 0 ? 0 : Math.round((doneCount / allDayTasks.length) * 100);

    const dayNotes = notes.filter(n => n.createdISO === iso);
    const dayRems = reminders.filter(r => r.date === iso);
    const daySpends = cardEntries.filter(c => c.type === 'spend' && c.date === iso);

    document.getElementById('ovSubStats').textContent = `${doneCount}/${allDayTasks.length} Tasks • ${dayNotes.length} Notes • ${daySpends.length} Card Spends`;
    document.getElementById('ovTaskPct').textContent = `${pct}%`;

    const tList = document.getElementById('ovTaskList');
    tList.innerHTML = '';
    const dayMoved = movedLogs[iso] || [];

    allDayTasks.forEach(t => {
        const done = isTaskCompleted(t.id, iso);
        const movedInfo = dayMoved.find(m => m.taskId === t.id);
        let statusBadge = '';
        let actionBtn = '';

        if (done) statusBadge = `<span class="badge-done">✓ Completed</span>`;
        else if (movedInfo) statusBadge = `<span class="badge-moved">↪ Incomplete on ${formatShortDate(iso)} • Moved to ${formatShortDate(movedInfo.toDate)}</span>`;
        else if (isPast) {
            statusBadge = `<span class="badge-missed">✕ Missed on ${formatShortDate(iso)} (Not completed)</span>`;
            if (!t.repeat) actionBtn = `<button class="mini-btn" onclick="moveTaskToTodayWithAudit(${t.id}, '${iso}')">→ Today</button>`;
        } else statusBadge = `<span class="tag-badge">Pending (${t.category})</span>`;

        const li = document.createElement('li');
        if (done) li.classList.add('completed');
        li.innerHTML = `
            <div class="item-left" onclick="toggleTaskComplete(${t.id}, '${iso}')">
                <div class="check-box"></div>
                <div class="item-main">
                    <span class="item-title">${escapeHTML(t.text)}</span>
                    ${t.subNote ? `<span class="task-detail-text">${escapeHTML(t.subNote)}</span>` : ''}
                    <span class="item-sub">${statusBadge}</span>
                </div>
            </div>
            <div class="item-actions">${actionBtn}</div>
        `;
        tList.appendChild(li);
    });

    if (allDayTasks.length === 0) tList.innerHTML = `<li style="opacity:0.65;"><span class="item-sub">No tasks scheduled for ${formatShortDate(iso)}</span></li>`;

    const cList = document.getElementById('ovCardList');
    cList.innerHTML = daySpends.length === 0
        ? `<li style="opacity:0.65;"><span class="item-sub">No card spends on ${formatShortDate(iso)}</span></li>`
        : '';
    daySpends.forEach(s => {
        cList.innerHTML += `<li><div class="item-main"><span class="item-title">${escapeHTML(s.desc)} — ₹${s.amount.toLocaleString('en-IN')}</span><span class="item-sub"><span class="tag-badge">${getPayableMonthLabel(s.cycleKey)} Bill</span><span>${s.cat}</span></span></div></li>`;
    });

    const rList = document.getElementById('ovRemList');
    rList.innerHTML = dayRems.length === 0 ? `<li style="opacity:0.65;"><span class="item-sub">No reminders on ${formatShortDate(iso)}</span></li>` : '';
    dayRems.forEach(r => rList.innerHTML += `<li><div class="item-main"><span class="item-title">${escapeHTML(r.title)}</span><span class="item-sub"><span class="tag-badge">${r.tag}</span><span>At ${r.time}</span></span></div></li>`);

    const nGrid = document.getElementById('ovNotesList');
    nGrid.innerHTML = dayNotes.length === 0 ? `<div class="card" style="opacity:0.65; font-size:12px; color:var(--text-muted);">No notes added on ${formatShortDate(iso)}</div>` : '';
    dayNotes.forEach(n => nGrid.appendChild(buildNoteCardElement(n)));
}

function shareDayOverview() {
    const iso = selectedDateISO;
    const allDayTasks = [...getTasksForDate('daily', iso), ...getTasksForDate('weekly', iso), ...getTasksForDate('monthly', iso)];
    const lines = [`*FocusFlow Overview — ${formatShortDate(iso)}*`];
    if (highlights[iso]) lines.push(`✨ Highlight: ${highlights[iso]}`);
    allDayTasks.forEach(t => {
        const done = isTaskCompleted(t.id, iso);
        lines.push(`${done ? '✅' : '❌'} ${t.text}${done ? '' : ` (Not completed on ${formatShortDate(iso)})`}`);
    });
    const text = lines.join('\n');
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else { navigator.clipboard.writeText(text); showToast('Day overview copied!'); }
}
// --- CREDIT CARD BILL (20-20 CYCLE + PAYABLE DUE MONTH + EMI + IMAGE/TEXT RECEIPT) ---
function shiftCardCycle(delta) {
    let [y, m] = activeCycleKey.split('-').map(Number);
    m += delta;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    activeCycleKey = `${y}-${String(m).padStart(2, '0')}`;
    renderCardBillView();
}

function setCardEntryMode(mode) {
    cardEntryMode = mode;
    document.getElementById('ccModeSpendBtn').classList.toggle('active', mode === 'spend');
    document.getElementById('ccModeEmiBtn').classList.toggle('active', mode === 'emi');
    document.getElementById('ccSpendFields').style.display = mode === 'spend' ? 'flex' : 'none';
    document.getElementById('ccEmiFields').style.display = mode === 'emi' ? 'flex' : 'none';
}

function addCardEntry() {
    if (cardEntryMode === 'spend') {
        const desc = document.getElementById('ccSpendDesc').value.trim();
        const amount = parseFloat(document.getElementById('ccSpendAmt').value);
        const date = document.getElementById('ccSpendDate').value || getTodayISO();
        const cat = document.getElementById('ccSpendCat').value;
        if (!desc || isNaN(amount) || amount <= 0) {
            showToast('Enter spend description & amount');
            return;
        }
        const cycleKey = getCycleKeyForDate(date);
        cardEntries.unshift({ id: Date.now(), type: 'spend', desc, amount, date, cat, cycleKey });
        activeCycleKey = cycleKey;
        document.getElementById('ccSpendDesc').value = '';
        document.getElementById('ccSpendAmt').value = '';
    } else {
        const name = document.getElementById('ccEmiName').value.trim();
        const monthNo = document.getElementById('ccEmiMonth').value.trim();
        const amount = parseFloat(document.getElementById('ccEmiAmt').value);
        if (!name || !monthNo || isNaN(amount) || amount <= 0) {
            showToast('Enter EMI name, month no. & amount');
            return;
        }
        cardEntries.unshift({ id: Date.now(), type: 'emi', desc: name, monthNo, amount, cycleKey: activeCycleKey });
        document.getElementById('ccEmiName').value = '';
        document.getElementById('ccEmiMonth').value = '';
        document.getElementById('ccEmiAmt').value = '';
    }
    saveAll();
    renderCardBillView();
    showToast('Added to Credit Card Bill!');
}

function deleteCardEntry(id) {
    cardEntries = cardEntries.filter(e => e.id !== id);
    saveAll();
    renderCardBillView();
}

function toggleCardCyclePaid() {
    cardCycleStatus[activeCycleKey] = !cardCycleStatus[activeCycleKey];
    saveAll();
    renderCardBillView();
    showToast(cardCycleStatus[activeCycleKey] ? 'Cycle marked as PAID ✓' : 'Marked as Unpaid');
}

function renderCardBillView() {
    const dueMonth = getPayableMonthLabel(activeCycleKey);
    document.getElementById('ccCycleLabel').textContent = `${dueMonth} Bill`;
    const hintEl = document.querySelector('#cardbillView .month-hint');
    if (hintEl) hintEl.textContent = `Cycle: ${formatCycleLabel(activeCycleKey)}`;

    const isPaid = !!cardCycleStatus[activeCycleKey];
    const statusTag = document.getElementById('ccStatusTag');
    const paidBtn = document.getElementById('ccPaidBtn');
    if (isPaid) {
        statusTag.textContent = `✓ PAID • ${dueMonth.toUpperCase()}`;
        statusTag.style.color = '#10b981';
        paidBtn.textContent = '✓ Paid';
        paidBtn.style.background = '#10b981';
    } else {
        statusTag.textContent = `● DUE: ${dueMonth.toUpperCase()}`;
        statusTag.style.color = '#f59e0b';
        paidBtn.textContent = 'Mark Paid';
        paidBtn.style.background = '';
    }

    const cycleItems = cardEntries.filter(e => e.cycleKey === activeCycleKey);
    const emis = cycleItems.filter(e => e.type === 'emi');
    const spends = cycleItems.filter(e => e.type === 'spend').sort((a, b) => new Date(b.date) - new Date(a.date));

    const emiTotal = emis.reduce((sum, e) => sum + e.amount, 0);
    const spendTotal = spends.reduce((sum, s) => sum + s.amount, 0);
    const grandTotal = emiTotal + spendTotal;

    document.getElementById('ccGrandTotal').textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
    document.getElementById('ccSplitSub').textContent = `Spends: ₹${spendTotal.toLocaleString('en-IN')} • EMI: ₹${emiTotal.toLocaleString('en-IN')}`;
    document.getElementById('ccEmiTotalPill').textContent = `₹${emiTotal.toLocaleString('en-IN')}`;
    document.getElementById('ccSpendTotalPill').textContent = `₹${spendTotal.toLocaleString('en-IN')}`;

    const eList = document.getElementById('ccEmiList');
    eList.innerHTML = emis.length === 0 ? `<li style="opacity:0.65;"><span class="item-sub">No EMIs added for this cycle</span></li>` : '';
    emis.forEach(e => {
        eList.innerHTML += `<li><div class="item-main"><span class="item-title">${escapeHTML(e.desc)} — ₹${e.amount.toLocaleString('en-IN')}</span><span class="item-sub"><span class="tag-badge">EMI Month: ${escapeHTML(e.monthNo)}</span></span></div><div class="item-actions"><button class="mini-btn" onclick="deleteCardEntry(${e.id})">✕</button></div></li>`;
    });

    const sList = document.getElementById('ccSpendList');
    sList.innerHTML = spends.length === 0 ? `<li style="opacity:0.65;"><span class="item-sub">No regular card spends in this cycle</span></li>` : '';
    spends.forEach(s => {
        sList.innerHTML += `<li><div class="item-main"><span class="item-title">${escapeHTML(s.desc)} — ₹${s.amount.toLocaleString('en-IN')}</span><span class="item-sub"><span class="tag-badge">${s.cat}</span><span>${formatShortDate(s.date)}</span></span></div><div class="item-actions"><button class="mini-btn" onclick="deleteCardEntry(${s.id})">✕</button></div></li>`;
    });
}

function buildCardBillTextReport() {
    const dueMonth = getPayableMonthLabel(activeCycleKey);
    const cycleLabel = formatCycleLabel(activeCycleKey);
    const isPaid = !!cardCycleStatus[activeCycleKey];
    const cycleItems = cardEntries.filter(e => e.cycleKey === activeCycleKey);
    const emis = cycleItems.filter(e => e.type === 'emi');
    const spends = cycleItems.filter(e => e.type === 'spend').sort((a, b) => new Date(a.date) - new Date(b.date));

    const emiTotal = emis.reduce((sum, e) => sum + e.amount, 0);
    const spendTotal = spends.reduce((sum, s) => sum + s.amount, 0);
    const grandTotal = emiTotal + spendTotal;

    const lines = [
        `*💳 CREDIT CARD BILL STATEMENT*`,
        `*🗓️ Bill Due Month:* ${dueMonth}`,
        `*🔄 Cycle:* ${cycleLabel}`,
        `*Status:* ${isPaid ? '✅ PAID' : '⏳ UNPAID'}`,
        `────────────────────`
    ];
    if (emis.length > 0) {
        lines.push(`*📅 EMI ENTRIES:*`);
        emis.forEach(e => lines.push(`• ${e.desc} (Month ${e.monthNo}): ₹${e.amount.toLocaleString('en-IN')}`));
        lines.push(``);
    }
    if (spends.length > 0) {
        lines.push(`*🛍️ REGULAR SPENDS:*`);
        spends.forEach(s => lines.push(`• ${formatShortDate(s.date)} - ${s.desc} [${s.cat}]: ₹${s.amount.toLocaleString('en-IN')}`));
        lines.push(``);
    }
    lines.push(`────────────────────`);
    lines.push(`Spends: ₹${spendTotal.toLocaleString('en-IN')} | EMI: ₹${emiTotal.toLocaleString('en-IN')}`);
    lines.push(`*💰 GRAND TOTAL: ₹${grandTotal.toLocaleString('en-IN')}*`);
    return lines.join('\n');
}

function copyCardBillTextOnly() {
    const text = buildCardBillTextReport();
    navigator.clipboard.writeText(text).then(() => showToast('Bill text copied for WhatsApp!')).catch(() => {});
}

async function shareCardBillImageAndText() {
    const dueMonth = getPayableMonthLabel(activeCycleKey);
    const cycleLabel = formatCycleLabel(activeCycleKey);
    const isPaid = !!cardCycleStatus[activeCycleKey];
    const cycleItems = cardEntries.filter(e => e.cycleKey === activeCycleKey);
    const emis = cycleItems.filter(e => e.type === 'emi');
    const spends = cycleItems.filter(e => e.type === 'spend').sort((a, b) => new Date(a.date) - new Date(b.date));

    const emiTotal = emis.reduce((sum, e) => sum + e.amount, 0);
    const spendTotal = spends.reduce((sum, s) => sum + s.amount, 0);
    const grandTotal = emiTotal + spendTotal;
    const textReport = buildCardBillTextReport();

    const rowCount = emis.length + spends.length;
    const canvas = document.createElement('canvas');
    canvas.width = 760;
    canvas.height = Math.max(460, 345 + rowCount * 38);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = isPaid ? '#059669' : '#1e293b';
    ctx.fillRect(0, 0, canvas.width, 134);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`${dueMonth.toUpperCase()} — CARD BILL`, 36, 50);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`Billing Cycle: ${cycleLabel}`, 36, 84);
    ctx.font = 'bold 17px sans-serif';
    ctx.fillStyle = isPaid ? '#a7f3d0' : '#fde047';
    ctx.fillText(`STATUS: ${isPaid ? 'PAID ✓' : 'UNPAID (DUE ' + dueMonth.toUpperCase() + ')'}`, 36, 114);

    let y = 175;
    if (emis.length > 0) {
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = '#2563eb';
        ctx.fillText('EMI ENTRIES', 36, y);
        y += 30;
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#1e293b';
        emis.forEach(e => {
            ctx.fillText(`• ${e.desc} (Month ${e.monthNo})`, 36, y);
            ctx.fillText(`₹${e.amount.toLocaleString('en-IN')}`, 590, y);
            y += 34;
        });
        y += 10;
    }

    if (spends.length > 0) {
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = '#2563eb';
        ctx.fillText('CARD SPENDS (20th – 20th)', 36, y);
        y += 30;
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#1e293b';
        spends.forEach(s => {
            ctx.fillText(`• ${formatShortDate(s.date)}  ${s.desc} (${s.cat})`, 36, y);
            ctx.fillText(`₹${s.amount.toLocaleString('en-IN')}`, 590, y);
            y += 34;
        });
    }

    y += 18;
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath(); ctx.moveTo(36, y); ctx.lineTo(724, y); ctx.stroke();
    y += 38;
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(`Spends: ₹${spendTotal.toLocaleString('en-IN')}   |   EMI: ₹${emiTotal.toLocaleString('en-IN')}`, 36, y);
    y += 40;
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`GRAND TOTAL:  ₹${grandTotal.toLocaleString('en-IN')}`, 36, y);

    canvas.toBlob(async (blob) => {
        const file = new File([blob], `CardBill_${dueMonth.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], text: textReport, title: `${dueMonth} Card Bill` });
            } catch (e) {}
        } else {
            navigator.clipboard.writeText(textReport).catch(() => {});
            showToast('Open in Chrome for PNG share! Text copied.');
        }
    }, 'image/png');
}
// --- TASKS, TEMPLATES & MONTHLY VIEW ---
function updateRepeatLabel() {
    const lbl = document.getElementById('repeatLabel');
    if (!lbl) return;
    const d = new Date(selectedDateISO + 'T00:00:00');
    if (currentTab === 'daily') lbl.textContent = 'Repeat every day';
    else if (currentTab === 'weekly') lbl.textContent = `Repeat every ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
    else if (currentTab === 'monthly') lbl.textContent = `Repeat on ${monthlySelectedDay}${getOrdinal(monthlySelectedDay)} of every month`;
}

function shiftMonth(delta) { selectedMonthDate.setMonth(selectedMonthDate.getMonth() + delta); renderMonthOnlyView(); renderTaskSection(); }
function changeMonthSelectedDay(val) { monthlySelectedDay = parseInt(val, 10); updateRepeatLabel(); renderTaskSection(); }
function renderMonthOnlyView() { document.getElementById('monthOnlyLabel').textContent = selectedMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }

function getActiveTargetISO() {
    if (currentTab !== 'monthly') return selectedDateISO;
    const y = selectedMonthDate.getFullYear(), m = selectedMonthDate.getMonth();
    const safeDay = Math.min(monthlySelectedDay, new Date(y, m + 1, 0).getDate());
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function togglePriorityInput() { isHighPriority = !isHighPriority; document.getElementById('priorityBtn').classList.toggle('active', isHighPriority); }

function applyQuickTemplate(type) {
    const targetISO = getActiveTargetISO();
    const dObj = new Date(targetISO + 'T00:00:00');
    const packs = {
        morning: ['Walking (30 mins)', 'Read Book (20 mins)', 'Plan Top 3 Priorities'],
        work: ['Check Client Emails', 'Update CRM & Tracker', 'End-of-Day Review']
    };
    (packs[type] || []).reverse().forEach((title, idx) => {
        tasks.unshift({
            id: Date.now() + idx, text: title, subNote: '', category: 'daily',
            priority: false, repeat: false, startDate: targetISO, endDate: null,
            weekday: dObj.getDay(), monthDay: monthlySelectedDay
        });
    });
    saveAll();
    refreshCurrentView();
    showToast('Routine pack added!');
}

function addTask() {
    const input = document.getElementById('taskInput');
    const subInput = document.getElementById('taskSubNoteInput');
    const text = input.value.trim();
    if (!text) return;

    const targetISO = getActiveTargetISO();
    const dObj = new Date(targetISO + 'T00:00:00');
    tasks.unshift({
        id: Date.now(), text, subNote: subInput.value.trim(), category: currentTab,
        priority: isHighPriority, repeat: document.getElementById('repeatToggle').checked,
        startDate: targetISO, endDate: null, weekday: dObj.getDay(), monthDay: monthlySelectedDay
    });

    input.value = ''; subInput.value = '';
    if (isHighPriority) togglePriorityInput();
    saveAll();
    refreshCurrentView();
}

function stopTaskFromDate(taskId, targetISO) {
    const t = tasks.find(item => item.id === taskId);
    if (!t) return;
    if (!t.repeat || t.startDate === targetISO) tasks = tasks.filter(item => item.id !== taskId);
    else t.endDate = targetISO;
    saveAll();
    refreshCurrentView();
    showToast('Task stopped from this date onward');
}

function renderTaskSection() {
    const targetISO = getActiveTargetISO();
    const dObj = new Date(targetISO + 'T00:00:00');
    const list = document.getElementById('taskList');
    const activeTasks = getTasksForDate(currentTab, targetISO);

    document.getElementById('selectedDateHeading').textContent = currentTab === 'monthly'
        ? `${dObj.toLocaleDateString('en-US', { month: 'long' })} ${monthlySelectedDay}${getOrdinal(monthlySelectedDay)} Tasks`
        : targetISO === getTodayISO() ? `Today • ${formatShortDate(targetISO)}` : dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    document.getElementById('recurrenceSub').textContent = `${activeTasks.length} scheduled task(s)`;

    const doneCount = activeTasks.filter(t => isTaskCompleted(t.id, targetISO)).length;
    const pct = activeTasks.length === 0 ? 0 : Math.round((doneCount / activeTasks.length) * 100);
    document.getElementById('dayScorePill').textContent = `${pct}% (${doneCount}/${activeTasks.length})`;

    list.innerHTML = '';
    activeTasks.forEach(t => {
        const done = isTaskCompleted(t.id, targetISO);
        const li = document.createElement('li');
        if (done) li.classList.add('completed');
        if (t.priority) li.classList.add('priority-high');
        li.innerHTML = `
            <div class="item-left" onclick="toggleTaskComplete(${t.id}, '${targetISO}')">
                <div class="check-box"></div>
                <div class="item-main">
                    <span class="item-title">${escapeHTML(t.text)}</span>
                    ${t.subNote ? `<span class="task-detail-text">${escapeHTML(t.subNote)}</span>` : ''}
                    <span class="item-sub"><span class="tag-badge">${t.repeat ? '↻ Auto-Repeat' : 'One-Time'}</span>${t.priority ? '<span>● Priority</span>' : ''}</span>
                </div>
            </div>
            <div class="item-actions"><button class="mini-btn" onclick="stopTaskFromDate(${t.id}, '${targetISO}')">Stop</button></div>
        `;
        list.appendChild(li);
    });
}

function updateHeaderRing() {
    const today = getTodayISO();
    const daily = getTasksForDate('daily', today);
    const done = daily.filter(t => isTaskCompleted(t.id, today)).length;
    const pct = daily.length === 0 ? 0 : Math.round((done / daily.length) * 100);
    document.getElementById('headerStatus').textContent = `${formatShortDate(today)} • ${pct}% Done`;
    const ring = document.getElementById('dailyRing');
    const circ = 2 * Math.PI * 15;
    ring.style.strokeDasharray = `${circ} ${circ}`;
    ring.style.strokeDashoffset = circ - (pct / 100) * circ;
}

// --- REPORTS & 30-DAY HEATMAP ---
function renderReports() {
    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 60; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const iso = toISO(d); const dt = getTasksForDate('daily', iso);
        if (dt.length === 0) continue;
        if ((dt.filter(t => isTaskCompleted(t.id, iso)).length / dt.length) >= 0.8) streak++;
        else if (i > 0) break;
    }
    document.getElementById('statStreak').textContent = `${streak} Day${streak === 1 ? '' : 's'}`;

    const hm = document.getElementById('heatmapGrid');
    hm.innerHTML = '';
    for (let i = 29; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const iso = toISO(d); const dt = getTasksForDate('daily', iso);
        const pct = dt.length === 0 ? 0 : Math.round((dt.filter(t => isTaskCompleted(t.id, iso)).length / dt.length) * 100);
        const lvl = pct === 0 ? 'hm-0' : pct < 50 ? 'hm-1' : pct < 100 ? 'hm-2' : 'hm-3';
        hm.innerHTML += `<div class="hm-cell ${lvl}" title="${iso}: ${pct}%">${d.getDate()}</div>`;
    }

    const y = today.getFullYear(), m = today.getMonth();
    let dT = 0, dD = 0, wT = 0, wD = 0, mT = 0, mD = 0;
    for (let day = 1; day <= today.getDate(); day++) {
        const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dt = getTasksForDate('daily', iso), wt = getTasksForDate('weekly', iso), mt = getTasksForDate('monthly', iso);
        dT += dt.length; dD += dt.filter(t => isTaskCompleted(t.id, iso)).length;
        wT += wt.length; wD += wt.filter(t => isTaskCompleted(t.id, iso)).length;
        mT += mt.length; mD += mt.filter(t => isTaskCompleted(t.id, iso)).length;
    }
    const tot = dT + wT + mT, dn = dD + wD + mD;
    document.getElementById('statMonthAvg').textContent = `${tot === 0 ? 0 : Math.round((dn / tot) * 100)}%`;
    document.getElementById('statMonthCounts').textContent = `${dn}/${tot} done`;
    setProg('repDaily', dD, dT); setProg('repWeekly', wD, wT); setProg('repMonthly', mD, mT);
}

function setProg(p, d, t) {
    const pct = t === 0 ? 0 : Math.round((d / t) * 100);
    document.getElementById(`${p}Pct`).textContent = `${pct}% (${d}/${t})`;
    document.getElementById(`${p}Bar`).style.width = `${pct}%`;
}

// --- REMINDERS, NOTES, SEARCH & BACKUP ---
function setQuickDate(days) { const d = new Date(); d.setDate(d.getDate() + days); document.getElementById('remDate').value = toISO(d); }
function addReminder() {
    const title = document.getElementById('remTitle').value.trim(), date = document.getElementById('remDate').value;
    if (!title || !date) return;
    reminders.push({ id: Date.now(), title, date, time: document.getElementById('remTime').value || '09:00', tag: document.getElementById('remTag').value, repeat: document.getElementById('remRepeat').value });
    reminders.sort((a, b) => new Date(a.date) - new Date(b.date));
    document.getElementById('remTitle').value = ''; saveAll(); renderReminders();
}
function syncToPhoneCalendar(id) {
    const r = reminders.find(i => i.id === id); if (!r) return;
    const dt = `${r.date.replace(/-/g, '')}T${r.time.replace(/:/g, '')}00`;
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:🔔 ${r.title}\r\nDTSTART:${dt}\r\nDTEND:${dt}\r\nBEGIN:VALARM\r\nTRIGGER:-PT5M\r\nACTION:DISPLAY\r\nDESCRIPTION:${r.title}\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = `Alert_${r.date}.ics`; a.click();
}
function completeReminder(id) {
    const idx = reminders.findIndex(r => r.id === id); if (idx === -1) return;
    const r = reminders[idx];
    if (r.repeat !== 'none') {
        const n = new Date(r.date + 'T00:00:00');
        if (r.repeat === 'weekly') n.setDate(n.getDate() + 7);
        if (r.repeat === 'monthly') n.setMonth(n.getMonth() + 1);
        if (r.repeat === 'yearly') n.setFullYear(n.getFullYear() + 1);
        r.date = toISO(n);
    } else reminders.splice(idx, 1);
    saveAll(); renderReminders();
}
function renderReminders() {
    const list = document.getElementById('reminderList'); document.getElementById('remCount').textContent = reminders.length; list.innerHTML = '';
    reminders.forEach(r => {
        list.innerHTML += `<li><div class="item-main"><span class="item-title">${escapeHTML(r.title)}</span><span class="item-sub"><span class="tag-badge">${r.tag}</span><span>${r.date} at ${r.time}</span></span></div><div class="item-actions"><button class="alarm-btn" onclick="syncToPhoneCalendar(${r.id})">🔔 Alarm</button><button class="mini-btn" onclick="completeReminder(${r.id})">✓</button></div></li>`;
    });
}
function updateReminderBadge() { document.getElementById('remBadge').style.display = reminders.some(r => r.date <= getTodayISO()) ? 'inline-block' : 'none'; }

function setNoteMode(mode) {
    noteInputMode = mode;
    document.getElementById('modeTextBtn').classList.toggle('active', mode === 'text');
    document.getElementById('modeCheckBtn').classList.toggle('active', mode === 'checklist');
    document.getElementById('noteBody').placeholder = mode === 'checklist' ? 'Type 1 item per line:\nMilk\nVegetables' : 'Write your note here...';
}
function setNoteFilter(cat, btn) { noteFilter = cat; document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active')); btn.classList.add('active'); renderNotes(); }
function addNote() {
    const title = document.getElementById('noteTitle').value.trim(), body = document.getElementById('noteBody').value.trim();
    if (!title && !body) return;
    const items = noteInputMode === 'checklist' ? body.split('\n').map(l => l.trim()).filter(Boolean).map(text => ({ text, done: false })) : null;
    notes.unshift({ id: Date.now(), title: title || (items ? 'Checklist' : 'Quick Note'), body, isChecklist: !!items, items, cat: document.getElementById('noteCat').value, createdISO: selectedDateISO, date: formatShortDate(selectedDateISO) });
    document.getElementById('noteTitle').value = ''; document.getElementById('noteBody').value = '';
    saveAll(); refreshCurrentView(); renderNotes();
}
function toggleChecklistItem(noteId, idx) { const n = notes.find(i => i.id === noteId); if (!n || !n.items) return; n.items[idx].done = !n.items[idx].done; saveAll(); renderNotes(); if (currentTab === 'overview') renderOverview(); }
function addInlineChecklistItem(noteId) { const inp = document.getElementById(`addItem_${noteId}`), val = inp.value.trim(); if (!val) return; const n = notes.find(i => i.id === noteId); n.items.push({ text: val, done: false }); saveAll(); renderNotes(); if (currentTab === 'overview') renderOverview(); }
function resetChecklistTicks(noteId) { const n = notes.find(i => i.id === noteId); if (!n || !n.items) return; n.items.forEach(i => i.done = false); saveAll(); renderNotes(); showToast('All ticks reset!'); }
function buildNoteCardElement(n) {
    const div = document.createElement('div'); div.className = 'note-card'; div.setAttribute('data-cat', n.cat);
    const contentHTML = (n.isChecklist && Array.isArray(n.items))
        ? n.items.map((it, idx) => `<div class="note-check-row ${it.done ? 'checked' : ''}" onclick="toggleChecklistItem(${n.id}, ${idx})"><input type="checkbox" ${it.done ? 'checked' : ''}><span>${escapeHTML(it.text)}</span></div>`).join('') + `<div class="inline-add-row"><input type="text" id="addItem_${n.id}" placeholder="+ Add item..."><button class="mini-btn" onclick="addInlineChecklistItem(${n.id})">Add</button></div>`
        : `<div class="note-body">${escapeHTML(n.body)}</div>`;
    div.innerHTML = `<div class="note-top"><span class="note-cat-pill">${n.cat} • ${n.date}</span><div class="item-actions">${n.isChecklist ? `<button class="mini-btn" onclick="resetChecklistTicks(${n.id})">Reset</button>` : ''}<button class="mini-btn" onclick="deleteNote(${n.id})">✕</button></div></div><h3>${escapeHTML(n.title)}</h3>${contentHTML}`;
    return div;
}
function deleteNote(id) { notes = notes.filter(n => n.id !== id); saveAll(); renderNotes(); if (currentTab === 'overview') renderOverview(); }
function renderNotes() { const grid = document.getElementById('notesGrid'); grid.innerHTML = ''; notes.filter(n => noteFilter === 'All' || n.cat === noteFilter).forEach(n => grid.appendChild(buildNoteCardElement(n))); }

function openSearchModal() { document.getElementById('searchModal').classList.add('open'); document.getElementById('globalSearchInput').focus(); }
function closeSearchModal() { document.getElementById('searchModal').classList.remove('open'); }
function runGlobalSearch() {
    const q = document.getElementById('globalSearchInput').value.toLowerCase().trim(), box = document.getElementById('globalSearchResults');
    box.innerHTML = ''; if (!q) return;
    tasks.filter(t => t.text.toLowerCase().includes(q)).forEach(t => box.innerHTML += `<div class="search-hit">📋 <b>Task (${t.category}):</b> ${escapeHTML(t.text)}</div>`);
    cardEntries.filter(c => c.desc.toLowerCase().includes(q)).forEach(c => box.innerHTML += `<div class="search-hit">💳 <b>${getPayableMonthLabel(c.cycleKey)} Bill:</b> ${escapeHTML(c.desc)} — ₹${c.amount}</div>`);
    notes.filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)).forEach(n => box.innerHTML += `<div class="search-hit">📝 <b>Note (${n.date}):</b> ${escapeHTML(n.title)}</div>`);
}
function openVaultModal() {
    const snap = JSON.parse(localStorage.getItem('ff4_snapshot'));
    document.getElementById('lastSnapshotInfo').textContent = snap ? `Snapshot: ${snap.date} (${snap.tasks.length} tasks, ${(snap.cardEntries || []).length} card entries)` : 'No snapshot yet.';
    document.getElementById('vaultModal').classList.add('open');
}
function closeVaultModal() { document.getElementById('vaultModal').classList.remove('open'); }
function exportData() {
    const payload = JSON.stringify({ tasks, completions, reminders, notes, highlights, movedLogs, cardEntries, cardCycleStatus }, null, 2);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' })); a.download = `FocusFlow_v4_${getTodayISO()}.json`; a.click();
}
function importData(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => { const d = JSON.parse(ev.target.result); tasks = d.tasks || []; completions = d.completions || {}; reminders = d.reminders || []; notes = d.notes || []; highlights = d.highlights || {}; movedLogs = d.movedLogs || {}; cardEntries = d.cardEntries || []; cardCycleStatus = d.cardCycleStatus || {}; saveAll(); refreshCurrentView(); closeVaultModal(); showToast('Restored!'); }; r.readAsText(f);
}
function showToast(msg) { const t = document.getElementById('undoToast'); document.getElementById('toastMsg').textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800); }
function escapeHTML(str) { return String(str || '').replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])); }

renderCalendarStrip(); renderOverview(); updateHeaderRing(); updateReminderBadge();
