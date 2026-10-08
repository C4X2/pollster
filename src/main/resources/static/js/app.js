let currentPollId = null;
let currentAdminKey = null;
let currentPollData = null;
let stompClient = null;
let chartInstance = null;
let activeChartType = 'bar';

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  // Generate client-side voter token if missing
  if (!localStorage.getItem('pollster_voter_token')) {
    localStorage.setItem('pollster_voter_token', crypto.randomUUID());
  }

  updateMyPollsDropdown();
  refreshStoredPollStatuses();
  loadDurationConfig();

  // Check URL parameters for poll ID or admin key
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  
  let pollId = urlParams.get('poll') || (pathParts[0] === 'poll' ? pathParts[1] : null);
  let adminKey = urlParams.get('key');

  if (pollId) {
    if (adminKey) {
      // Persist key into LocalStorage and strip key from visible URL for clean history
      saveStoredAdminKey(pollId, adminKey);
      const cleanUrl = `/?poll=${pollId}`;
      window.history.replaceState({}, '', cleanUrl);
    }
    loadPoll(pollId);
  } else {
    showCreateView();
  }
});

// Close dropdown on outside click
document.addEventListener('click', (event) => {
  const dropdown = document.getElementById('my-polls-dropdown');
  const btn = document.getElementById('my-polls-btn');
  if (dropdown && !dropdown.classList.contains('hidden') && !btn.contains(event.target) && !dropdown.contains(event.target)) {
    closeMyPollsDropdown();
  }
});

function getVoterToken() {
  return localStorage.getItem('pollster_voter_token');
}

async function loadDurationConfig() {
  try {
    const res = await fetch('/api/polls/config');
    if (!res.ok) return;
    const data = await res.json();
    const durations = data.durations || (Array.isArray(data) ? data : null);
    if (!durations || !Array.isArray(durations)) return;

    const select = document.getElementById('poll-duration');
    if (!select) return;

    select.innerHTML = durations.map(opt => {
      const val = (opt.minutes === null || opt.minutes === undefined || opt.minutes === 0) ? '' : opt.minutes;
      return `<option value="${val}">${escapeHtml(opt.label)}</option>`;
    }).join('');
  } catch (err) {
    console.error(ErrorMsg.FETCH_CONFIG_FAILED, err);
  }
}

// LocalStorage Admin Key Persistence Helpers
function getAdminKeysMap() {
  try {
    const raw = localStorage.getItem('pollster_admin_keys');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    
    // Normalize format to objects { adminKey, title, createdAt }
    const normalized = {};
    for (const [id, val] of Object.entries(parsed)) {
      if (!val) continue;
      if (typeof val === 'string') {
        normalized[id] = { adminKey: val, title: 'Poll #' + (id ? id.substring(0, 8) : 'unknown'), createdAt: Date.now(), status: 'OPEN' };
      } else if (typeof val === 'object') {
        normalized[id] = {
          adminKey: val.adminKey || '',
          title: val.title || ('Poll #' + (id ? id.substring(0, 8) : 'unknown')),
          createdAt: (typeof val.createdAt === 'number' && !isNaN(val.createdAt)) ? val.createdAt : Date.now(),
          status: val.status || (val.isClosed ? 'CLOSED' : (val.isExpired ? 'EXPIRED' : 'OPEN'))
        };
      }
    }
    return normalized;
  } catch (e) {
    console.error(ErrorMsg.PARSE_ADMIN_KEYS_FAILED, e);
    return {};
  }
}

async function refreshStoredPollStatuses() {
  try {
    const keysMap = getAdminKeysMap();
    const pollIds = Object.keys(keysMap);
    if (pollIds.length === 0) return;

    let updated = false;
    await Promise.all(pollIds.map(async (id) => {
      try {
        const adminKey = keysMap[id] ? keysMap[id].adminKey : null;
        const headers = {};
        if (adminKey) headers['X-Admin-Key'] = adminKey;

        const res = await fetch(`/api/polls/${id}?voterToken=${getVoterToken()}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && data.status) {
            if (keysMap[id].status !== data.status || (data.title && keysMap[id].title !== data.title)) {
              keysMap[id].status = data.status;
              if (data.title) keysMap[id].title = data.title;
              updated = true;
            }
          }
        }
      } catch (e) {
        // Ignore single poll fetch failure
      }
    }));

    if (updated) {
      localStorage.setItem('pollster_admin_keys', JSON.stringify(keysMap));
      updateMyPollsDropdown();
    }
  } catch (e) {
    console.error(ErrorMsg.REFRESH_STATUSES_FAILED, e);
  }
}

function getStoredAdminKey(pollId) {
  if (!pollId) return null;
  const keys = getAdminKeysMap();
  const entry = keys[pollId];
  return entry ? (typeof entry === 'string' ? entry : entry.adminKey) : null;
}

function saveStoredAdminKey(pollId, adminKey, title = null, status = null) {
  if (!pollId || !adminKey) return;
  try {
    const keys = getAdminKeysMap();
    const existing = keys[pollId] || {};
    
    keys[pollId] = {
      adminKey: adminKey,
      title: (title !== null && title !== undefined) ? title : (existing.title || ('Poll #' + String(pollId).substring(0, 8))),
      createdAt: (existing.createdAt && !isNaN(existing.createdAt)) ? existing.createdAt : Date.now(),
      status: (status !== null && status !== undefined) ? status : (existing.status || 'OPEN')
    };

    localStorage.setItem('pollster_admin_keys', JSON.stringify(keys));
    updateMyPollsDropdown();
  } catch (e) {
    console.error(ErrorMsg.SAVE_ADMIN_KEY_FAILED, e);
  }
}

function removeStoredAdminKey(pollId) {
  if (!pollId) return;
  try {
    const keys = getAdminKeysMap();
    delete keys[pollId];
    localStorage.setItem('pollster_admin_keys', JSON.stringify(keys));
    updateMyPollsDropdown();
  } catch (e) {
    console.error(ErrorMsg.REMOVE_ADMIN_KEY_FAILED, e);
  }
}

function clearMyPollsHistory() {
  if (confirm('Clear all stored poll admin keys from this browser?')) {
    try {
      localStorage.removeItem('pollster_admin_keys');
    } catch (e) {}
    updateMyPollsDropdown();
    showToast('Recent polls history cleared.', 'info');
  }
}

// Dropdown UI Management
function toggleMyPollsDropdown(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const dropdown = document.getElementById('my-polls-dropdown');
  const chevron = document.getElementById('my-polls-chevron');
  if (!dropdown) return;

  const isHidden = dropdown.classList.contains('hidden');
  
  if (isHidden) {
    dropdown.classList.remove('hidden');
    if (chevron) chevron.classList.add('rotate-180');
    updateMyPollsDropdown();
    refreshStoredPollStatuses();
  } else {
    closeMyPollsDropdown();
  }
}

function closeMyPollsDropdown() {
  const dropdown = document.getElementById('my-polls-dropdown');
  const chevron = document.getElementById('my-polls-chevron');
  if (dropdown) dropdown.classList.add('hidden');
  if (chevron) chevron.classList.remove('rotate-180');
}

function updateMyPollsDropdown() {
  try {
    const keysMap = getAdminKeysMap();
    const entries = Object.entries(keysMap).sort((a, b) => ((b[1] && b[1].createdAt) || 0) - ((a[1] && a[1].createdAt) || 0));
    
    const countBadge = document.getElementById('my-polls-count');
    const listContainer = document.getElementById('my-polls-list');
    
    if (!listContainer) return;

    if (entries.length > 0) {
      if (countBadge) {
        countBadge.textContent = entries.length;
        countBadge.classList.remove('hidden');
      }

      listContainer.innerHTML = entries.map(([id, item]) => {
        const itemTitle = item && item.title ? item.title : ('Poll #' + id.substring(0, 8));
        const itemDate = (item && item.createdAt) ? new Date(item.createdAt).toLocaleDateString() : 'Recent';

        const pollStatus = item.status || (item.isClosed ? 'CLOSED' : (item.isExpired ? 'EXPIRED' : 'OPEN'));

        let statusBadge = '';
        if (pollStatus === 'CLOSED') {
          statusBadge = `<span class="inline-flex items-center gap-1 font-medium text-amber-400"><i class="fa-solid fa-lock text-[8px]"></i> Closed</span>`;
        } else if (pollStatus === 'EXPIRED') {
          statusBadge = `<span class="inline-flex items-center gap-1 font-medium text-rose-400"><i class="fa-regular fa-clock text-[8px]"></i> Expired</span>`;
        } else {
          statusBadge = `<span class="inline-flex items-center gap-1 font-medium text-emerald-400"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Open</span>`;
        }

        return `
          <div class="p-3 hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-2 group">
            <button onclick="selectPollFromHistory('${id}')" class="text-left flex-1 min-w-0">
              <p class="text-xs font-semibold text-slate-200 truncate group-hover:text-brand-400 transition-colors">${escapeHtml(itemTitle)}</p>
              <div class="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                <span>${itemDate}</span>
                <span>•</span>
                ${statusBadge}
              </div>
            </button>
            <button onclick="removeStoredAdminKey('${id}')" title="Remove from history" class="text-slate-600 hover:text-rose-400 p-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        `;
      }).join('') + `
        <div class="p-2.5 bg-slate-950/60 border-t border-slate-800 text-center">
          <button onclick="importAdminKeyPrompt()" class="text-xs text-brand-400 hover:text-brand-300 font-medium inline-flex items-center gap-1">
            <i class="fa-solid fa-key text-[10px]"></i> Add existing poll by Admin Key
          </button>
        </div>
      `;
    } else {
      if (countBadge) countBadge.classList.add('hidden');
      listContainer.innerHTML = `
        <div class="p-6 text-center space-y-3">
          <i class="fa-solid fa-folder-open text-slate-600 text-2xl block"></i>
          <p class="text-xs text-slate-400">No polls saved in this browser yet.</p>
          <button onclick="importAdminKeyPrompt()" class="px-3 py-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 border border-brand-500/30 text-xs font-semibold transition-colors">
            <i class="fa-solid fa-key text-[10px] mr-1"></i> Add Admin Key
          </button>
        </div>
      `;
    }
  } catch (err) {
    console.error(ErrorMsg.UPDATE_MY_POLLS_DROPDOWN_FAILED, err);
  }
}

function importAdminKeyPrompt() {
  closeMyPollsDropdown();
  const pollId = prompt('Enter Poll ID:');
  if (!pollId || !pollId.trim()) return;
  const adminKey = prompt('Enter Secret Admin Key:');
  if (!adminKey || !adminKey.trim()) return;

  saveStoredAdminKey(pollId.trim(), adminKey.trim());
  showToast('Admin key saved to this browser!', 'success');
  loadPoll(pollId.trim());
}

function selectPollFromHistory(pollId) {
  closeMyPollsDropdown();
  loadPoll(pollId);
}

function escapeHtml(str) {
  if (!str) return 'Untitled Poll';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// View Switching
function showCreateView() {
  document.getElementById('create-view').classList.remove('hidden');
  document.getElementById('poll-view').classList.add('hidden');
  closeMyPollsDropdown();
  window.history.pushState({}, '', '/');
  if (stompClient) stompClient.disconnect();
}

function showPollView() {
  document.getElementById('create-view').classList.add('hidden');
  document.getElementById('poll-view').classList.remove('hidden');
}

// Dynamic Option Inputs
function addOptionRow() {
  const container = document.getElementById('options-container');
  const count = container.querySelectorAll('.option-row').length + 1;
  const row = document.createElement('div');
  row.className = 'flex gap-2 option-row';
  row.innerHTML = `
    <input type="text" placeholder="Option ${count}" required class="option-input flex-1 px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/70 focus:border-brand-500 text-white placeholder-slate-500 outline-none">
    <button type="button" onclick="removeOptionRow(this)" class="px-3 py-2 text-slate-500 hover:text-rose-400 transition-colors">
      <i class="fa-solid fa-trash-can"></i>
    </button>
  `;
  container.appendChild(row);
  updateRemoveButtonsVisibility();
}

function removeOptionRow(btn) {
  const rows = document.querySelectorAll('.option-row');
  if (rows.length > 2) {
    btn.closest('.option-row').remove();
    updateRemoveButtonsVisibility();
  }
}

function updateRemoveButtonsVisibility() {
  const rows = document.querySelectorAll('.option-row');
  rows.forEach(row => {
    const btn = row.querySelector('button');
    if (rows.length > 2) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  });
}

function toggleAdvancedSettings() {
  const settings = document.getElementById('advanced-settings');
  const chevron = document.getElementById('advanced-chevron');
  settings.classList.toggle('hidden');
  chevron.classList.toggle('rotate-180');
}

// Create Poll Submission
async function handleCreatePoll(event) {
  event.preventDefault();

  const title = document.getElementById('poll-title').value;
  const description = document.getElementById('poll-description').value;
  const optionInputs = document.querySelectorAll('.option-input');
  const options = Array.from(optionInputs).map(inp => inp.value.trim()).filter(Boolean);
  
  const durationVal = document.getElementById('poll-duration').value;
  const passwordVal = document.getElementById('poll-password').value;
  const visibilityVal = document.getElementById('poll-visibility').value;

  if (options.length < 2) {
    showToast(ErrorMsg.MIN_OPTIONS_REQUIRED, 'error');
    return;
  }

  const payload = {
    title: title,
    description: description,
    options: options,
    durationMinutes: durationVal ? parseInt(durationVal) : null,
    password: passwordVal || null,
    resultsVisibility: visibilityVal
  };

  const btn = document.getElementById('submit-create-btn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin text-sm"></i> Creating...`;

  try {
    const res = await fetch('/api/polls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || ErrorMsg.CREATE_POLL_FAILED);
    }

    const data = await res.json();
    showToast('Poll created successfully!', 'success');
    
    // Store Admin Key & Metadata in LocalStorage
    if (data.adminKey) {
      saveStoredAdminKey(data.id, data.adminKey, data.title, data.status);
      currentAdminKey = data.adminKey;
    }

    // Update URL cleanly without exposing secret key in query string
    const cleanUrl = `/?poll=${data.id}`;
    window.history.pushState({}, '', cleanUrl);
    
    renderPollView(data);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Create Poll</span><i class="fa-solid fa-arrow-right text-xs"></i>`;
  }
}

// Load Poll Data
async function loadPoll(pollId) {
  currentPollId = pollId;
  currentAdminKey = getStoredAdminKey(pollId);

  try {
    const headers = {};
    if (currentAdminKey) {
      headers['X-Admin-Key'] = currentAdminKey;
    }

    const res = await fetch(`/api/polls/${pollId}?voterToken=${getVoterToken()}`, { headers });
    if (!res.ok) throw new Error(ErrorMsg.POLL_NOT_FOUND);

    const poll = await res.json();
    
    // Update stored title & status
    if (currentAdminKey && poll.title) {
      saveStoredAdminKey(poll.id, currentAdminKey, poll.title, poll.status);
    }

    renderPollView(poll);
    connectWebSocket(pollId);
  } catch (err) {
    showToast(err.message, 'error');
    showCreateView();
  }
}

// Render Poll Interface
function renderPollView(poll) {
  currentPollData = poll;
  currentPollId = poll.id;
  currentAdminKey = poll.adminKey || getStoredAdminKey(poll.id);

  showPollView();

  const pollStatus = poll.status || (poll.isClosed ? 'CLOSED' : (poll.isExpired ? 'EXPIRED' : 'OPEN'));

  // Set titles
  document.getElementById('poll-title-heading').textContent = poll.title;
  const descEl = document.getElementById('poll-desc-paragraph');
  if (poll.description) {
    descEl.textContent = poll.description;
    descEl.classList.remove('hidden');
  } else {
    descEl.classList.add('hidden');
  }

  document.getElementById('poll-total-votes').textContent = poll.totalVotes || 0;
  document.getElementById('poll-created-time').textContent = poll.createdAt ? new Date(poll.createdAt).toLocaleDateString() : 'Just now';

  // Set Share link (Clean URL) & QR Code
  const shareUrl = `${window.location.origin}/?poll=${poll.id}`;
  document.getElementById('share-link-input').value = shareUrl;
  generateQrCode(shareUrl);

  // Admin Banner (Visible if creator key present in LocalStorage)
  const adminBanner = document.getElementById('admin-banner');
  if (currentAdminKey) {
    saveStoredAdminKey(poll.id, currentAdminKey, poll.title, pollStatus);
    adminBanner.classList.remove('hidden');
    const closeBtn = document.getElementById('admin-close-btn');
    if (pollStatus === 'CLOSED') {
      closeBtn.innerHTML = `<i class="fa-solid fa-unlock text-xs"></i> Reopen Poll`;
      closeBtn.className = closeBtn.className.replace('amber', 'emerald');
    } else {
      closeBtn.innerHTML = `<i class="fa-solid fa-lock text-xs"></i> Close Poll`;
    }
  } else {
    adminBanner.classList.add('hidden');
  }

  // Status Banner
  const statusBanner = document.getElementById('status-banner');
  if (pollStatus === 'CLOSED') {
    statusBanner.innerHTML = `<span class="font-bold text-amber-400"><i class="fa-solid fa-circle-minus"></i> This poll has been closed by the creator.</span> Voting is disabled.`;
    statusBanner.classList.remove('hidden');
  } else if (pollStatus === 'EXPIRED') {
    statusBanner.innerHTML = `<span class="font-bold text-rose-400"><i class="fa-regular fa-clock"></i> This poll has expired.</span> Voting is disabled.`;
    statusBanner.classList.remove('hidden');
  } else {
    statusBanner.classList.add('hidden');
  }

  // Render Voting Options
  const votingSection = document.getElementById('voting-section');
  const optionsList = document.getElementById('vote-options-list');
  optionsList.innerHTML = '';

  if (poll.hasVoted || pollStatus === 'CLOSED' || pollStatus === 'EXPIRED') {
    votingSection.classList.add('hidden');
  } else if (poll.options) {
    votingSection.classList.remove('hidden');
    poll.options.forEach((opt, idx) => {
      const item = document.createElement('label');
      item.className = 'flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-brand-500/50 cursor-pointer transition-all hover:bg-slate-950/90';
      item.innerHTML = `
        <input type="radio" name="poll-option" value="${opt.id}" required class="w-4 h-4 text-brand-600 focus:ring-brand-500 accent-brand-600">
        <span class="text-sm font-medium text-slate-200">${opt.optionText}</span>
      `;
      optionsList.appendChild(item);
    });
  }

  // Render Chart
  renderChart(poll.options);
}

// Cast Vote
async function handleCastVote(event) {
  event.preventDefault();
  const selected = document.querySelector('input[name="poll-option"]:checked');
  if (!selected) {
    showToast(ErrorMsg.SELECT_OPTION_REQUIRED, 'error');
    return;
  }

  const btn = document.getElementById('submit-vote-btn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin text-sm"></i> Submitting...`;

  try {
    const res = await fetch(`/api/polls/${currentPollId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        optionId: selected.value,
        voterToken: getVoterToken()
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || ErrorMsg.VOTE_FAILED);
    }

    const updatedPoll = await res.json();
    showToast('Your vote was recorded anonymously!', 'success');
    renderPollView(updatedPoll);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Submit Anonymous Vote</span><i class="fa-solid fa-check text-xs"></i>`;
  }
}

// Toggle Close / Reopen Poll
async function toggleClosePoll() {
  if (!currentAdminKey || !currentPollData) return;
  const currentStatus = currentPollData.status || (currentPollData.isClosed ? 'CLOSED' : 'OPEN');
  const endpoint = (currentStatus === 'CLOSED') ? 'reopen' : 'close';

  try {
    const res = await fetch(`/api/polls/${currentPollId}/${endpoint}`, {
      method: 'POST',
      headers: {'X-Admin-Key': currentAdminKey}
    });

    if (!res.ok) throw new Error(ErrorMsg.ACTION_FAILED);
    const updated = await res.json();
    showToast(`Poll ${endpoint === 'close' ? 'closed' : 'reopened'} successfully.`, 'success');
    renderPollView(updated);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Delete Poll
async function deletePoll() {
  if (!currentAdminKey || !confirm('Are you sure you want to permanently delete this poll?')) return;

  try {
    const res = await fetch(`/api/polls/${currentPollId}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Key': currentAdminKey }
    });

    if (!res.ok) throw new Error(ErrorMsg.DELETE_POLL_FAILED);
    removeStoredAdminKey(currentPollId);
    showToast('Poll deleted.', 'success');
    showCreateView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// WebSockets STOMP Connection
function connectWebSocket(pollId) {
  if (stompClient) stompClient.disconnect();

  const socket = new SockJS('/ws');
  stompClient = Stomp.over(socket);
  stompClient.debug = null; // Suppress verbose STOMP logs

  stompClient.connect({}, () => {
    document.getElementById('live-badge').classList.remove('hidden');
    stompClient.subscribe(`/topic/polls/${pollId}`, (message) => {
      const update = JSON.parse(message.body);
      if (update && update.options) {
        document.getElementById('poll-total-votes').textContent = update.totalVotes || 0;
        renderChart(update.options);
      }
    });
  }, () => {
    document.getElementById('live-badge').classList.add('hidden');
  });
}

// Render Chart.js
function renderChart(options) {
  const ctx = document.getElementById('resultsChart').getContext('2d');
  const labels = options.map(o => o.optionText);
  const data = options.map(o => o.voteCount);

  if (chartInstance) {
    chartInstance.destroy();
  }

  const colors = [
    '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6', '#f59e0b',
    '#06b6d4', '#10b981', '#f43f5e', '#a855f7', '#3b82f6'
  ];

  chartInstance = new Chart(ctx, {
    type: activeChartType,
    data: {
      labels: labels,
      datasets: [{
        label: 'Votes',
        data: data,
        backgroundColor: activeChartType === 'doughnut' ? colors : 'rgba(99, 102, 241, 0.75)',
        borderColor: activeChartType === 'doughnut' ? '#0f172a' : '#6366f1',
        borderWidth: 2,
        borderRadius: activeChartType === 'bar' ? 8 : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: activeChartType === 'doughnut',
          position: 'bottom',
          labels: { color: '#94a3b8', font: { family: 'sans-serif', size: 12 } }
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1
        }
      },
      scales: activeChartType === 'bar' ? {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#64748b' },
          grid: { color: 'rgba(51, 65, 85, 0.3)' }
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid: { display: false }
        }
      } : {}
    }
  });
}

function switchChartType(type) {
  activeChartType = type;
  document.getElementById('chart-bar-btn').className = type === 'bar' ? 'px-2.5 py-1 rounded bg-brand-600 text-white font-medium' : 'px-2.5 py-1 rounded text-slate-400 hover:text-white';
  document.getElementById('chart-doughnut-btn').className = type === 'doughnut' ? 'px-2.5 py-1 rounded bg-brand-600 text-white font-medium' : 'px-2.5 py-1 rounded text-slate-400 hover:text-white';
  if (currentPollData) renderChart(currentPollData.options);
}

// Share & QR Helpers
function copyShareLink() {
  const input = document.getElementById('share-link-input');
  navigator.clipboard.writeText(input.value);
  showToast('Poll link copied to clipboard!', 'success');
}

function copyAdminLink() {
  const adminUrl = `${window.location.origin}/?poll=${currentPollId}&key=${currentAdminKey}`;
  navigator.clipboard.writeText(adminUrl);
  showToast('Secret Admin Link copied! Use this to manage your poll from another device.', 'success');
}

function generateQrCode(text) {
  const container = document.getElementById('qrcode-canvas');
  container.innerHTML = '';
  new QRCode(container, {
    text: text,
    width: 180,
    height: 180,
    colorDark: "#090d16",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

function toggleQrModal() {
  document.getElementById('qr-modal').classList.toggle('hidden');
}

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    if (icon) {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    }
  } else {
    input.type = 'password';
    if (icon) {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }
}

// Toast Notifications
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const colors = type === 'success' ? 'bg-emerald-600 text-white' : type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white';
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';

  toast.className = `${colors} px-4 py-3 rounded-xl shadow-xl border border-white/10 text-sm font-medium flex items-center gap-2.5 transform transition-all duration-300 pointer-events-auto opacity-0 translate-y-2`;
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.classList.remove('opacity-0', 'translate-y-2'), 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
