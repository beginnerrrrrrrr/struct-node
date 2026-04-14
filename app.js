/* =====================================================================
   GITHUB AUTH STATE
   ===================================================================== */
let githubToken = null;
let githubUser  = null;
let fileSha     = null;   // SHA of progress.json in user's repo (needed for updates)
let saveTimer   = null;   // debounce handle

/* ── Auth helpers ── */
function handleLogin() {
  window.location.href = '/api/auth';
}

function handleLogout() {
  githubToken = null;
  githubUser  = null;
  fileSha     = null;
  localStorage.removeItem('gh_token');
  document.getElementById('login-btn').style.display  = '';
  document.getElementById('user-info').style.display  = 'none';
  setSyncStatus('');
}

async function fetchGitHubUser() {
  const r = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${githubToken}` },
  });
  if (!r.ok) return null;
  return r.json();
}

function setSyncStatus(msg) {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = msg;
}

/* ── Load progress.json from user's GitHub repo ── */
async function loadFromGitHub() {
  if (!githubToken || !githubUser) return;
  setSyncStatus('loading…');
  try {
    const repo = `${githubUser.login}/dsa-sheet`;
    const r    = await fetch(`/api/load?repo=${encodeURIComponent(repo)}`, {
      headers: { Authorization: `Bearer ${githubToken}` },
    });
    if (!r.ok) throw new Error(r.statusText);
    const { data, sha } = await r.json();
    fileSha = sha;
    if (data) {
      statuses  = data.statuses  || {};
      edits     = data.edits     || {};
      codes     = data.codes     || {};
      resources = data.resources || {};
      collapsed = data.collapsed || {};
      notes     = data.notes     || {};
    }
    setSyncStatus('synced ✓');
  } catch (err) {
    console.error('Load error:', err);
    setSyncStatus('load failed');
  }
}

/* ── Save progress.json to user's GitHub repo (debounced 1.5 s) ── */
function debouncedSave() {
  if (!githubToken || !githubUser) return;  // not logged in — no-op
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToGitHub, 1500);
}

async function saveToGitHub() {
  if (!githubToken || !githubUser) return;
  setSyncStatus('saving…');
  try {
    const repo = `${githubUser.login}/dsa-sheet`;
    const r = await fetch('/api/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${githubToken}`,
      },
      body: JSON.stringify({
        repo,
        sha: fileSha,
        data: { statuses, edits, codes, resources, collapsed, notes },
      }),
    });
    if (!r.ok) throw new Error(r.statusText);
    const result = await r.json();
    fileSha = result.sha;
    setSyncStatus('saved ✓');
  } catch (err) {
    console.error('Save error:', err);
    setSyncStatus('save failed');
  }
}

/* =====================================================================
   IN-MEMORY STATE  (mirrored to GitHub on changes)
   ===================================================================== */
let statuses  = {};
let edits     = {};
let codes     = {};
let resources = {};
let collapsed = {};
let notes     = {};

let activeTopic  = 'all';
let activeFilter = 'all';
let searchVal    = '';

/* =====================================================================
   STATUS HELPERS
   ===================================================================== */
function getStatus(id)    { return statuses[id] || 'pending'; }
function setStatus(id, s) { statuses[id] = s; debouncedSave(); updateStats(); reRenderRow(id); }
function cycleStatus(id)  {
  const c = getStatus(id);
  setStatus(id, STATUS_CYCLE[(STATUS_CYCLE.indexOf(c) + 1) % STATUS_CYCLE.length]);
}

/* =====================================================================
   EDITS (name, lang overrides)
   ===================================================================== */
function getEditedName(p) {
  return edits[p.id]?.name !== undefined ? edits[p.id].name : getLabel(p);
}
function getEditedLang(p) {
  if (edits[p.id]?.lang !== undefined) return edits[p.id].lang;
  return (p.lang && p.lang !== '-' && p.lang !== 'nan') ? normLang(p.lang) : '';
}
function normLang(s) {
  const map = {
    'c++': 'cpp', 'py3': 'python', 'py': 'python', 'python3': 'python',
    java: 'java', javascript: 'javascript', js: 'javascript',
    ts: 'typescript', typescript: 'typescript', 'c#': 'csharp',
    go: 'go', rust: 'rust', kotlin: 'kotlin', swift: 'swift',
    ruby: 'ruby', scala: 'scala', c: 'c',
  };
  return map[s.toLowerCase()] || '';
}
function setEdit(id, field, val) {
  if (!edits[id]) edits[id] = {};
  edits[id][field] = val;
  debouncedSave();
}
function handleNameEdit(id, val)   { setEdit(id, 'name', val.trim()); }
function handleLangChange(id, val) { setEdit(id, 'lang', val); }

/* =====================================================================
   PLATFORM DETECTION
   ===================================================================== */
function getPlatform(url) {
  if (url.includes('leetcode'))               return 'lc';
  if (url.includes('codeforces') || url.includes('cses')) return 'cf';
  if (url.includes('geeksforgeeks'))          return 'gfg';
  if (url.includes('spoj'))                   return 'spoj';
  if (url.includes('codechef'))               return 'cc';
  return 'oj';
}
const PLAT = { lc: 'LC', cf: 'CF', gfg: 'GFG', spoj: 'SPOJ', cc: 'CC', oj: 'OJ' };

function getLabel(p) {
  if (p.name) return p.name;
  try {
    const u = new URL(p.url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1]
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .substring(0, 52) || p.url;
  } catch { return p.url.substring(0, 52); }
}

/* =====================================================================
   FILTER / TOPIC / SEARCH
   ===================================================================== */
function setFilter(f, el) {
  activeFilter = f;
  ['all', 'done', 'review', 'skip', 'pending'].forEach(k => {
    const b = document.getElementById('fb-' + k);
    if (b) { b.style.background = ''; b.style.borderColor = ''; b.style.color = ''; }
  });
  const b = el || document.getElementById('fb-' + f);
  if (b) {
    if      (f === 'done')   { b.style.background = 'var(--green)';  b.style.borderColor = 'var(--green)';  b.style.color = 'var(--bg)'; }
    else if (f === 'review') { b.style.background = 'var(--amber)';  b.style.borderColor = 'var(--amber)';  b.style.color = 'var(--bg)'; }
    else if (f === 'skip')   { b.style.background = 'var(--muted2)'; b.style.borderColor = 'var(--muted2)'; b.style.color = 'var(--text)'; }
    else                     { b.style.background = 'var(--accent)'; b.style.borderColor = 'var(--accent)'; b.style.color = '#fff'; }
  }
  render();
}

function setTopic(t) {
  activeTopic = t;
  document.querySelectorAll('.topic-tab').forEach(b => b.classList.toggle('active', b.dataset.topic === t));
  render();
}

/* =====================================================================
   COLLAPSE
   ===================================================================== */
function toggleSection(key) {
  collapsed[key] = !collapsed[key];
  debouncedSave();

  const enc = encodeURIComponent(key).replace(/'/g, '%27');
  const sec = document.querySelector(`.section[data-skey="${enc}"]`);
  if (!sec) return;
  const list = sec.querySelector('.problem-list');
  const isCollapsed = !!collapsed[key];
  sec.classList.toggle('collapsed', isCollapsed);
  if (isCollapsed) {
    list.classList.add('hidden');
    list.style.maxHeight = '0px';
  } else {
    list.classList.remove('hidden');
    list.style.maxHeight = 'none';
    list.style.maxHeight = list.scrollHeight + 'px';
  }
}

/* =====================================================================
   RESET MODAL
   ===================================================================== */
let resetTarget = 'todo';
function openResetModal(target) {
  resetTarget = target;
  const t   = document.getElementById('modal-title');
  const b   = document.getElementById('modal-body');
  const btn = document.getElementById('modal-confirm');
  if (target === 'todo') {
    t.textContent = 'Reset all to Todo?';
    b.innerHTML   = 'Every problem will be set back to <strong>Todo</strong>. Code and resources stay intact.';
    btn.className = 'modal-btn confirm'; btn.textContent = 'Reset all';
  } else {
    t.textContent = 'Mark all as Solved?';
    b.innerHTML   = 'Every problem will be marked as <strong>Solved</strong>.';
    btn.className = 'modal-btn danger'; btn.textContent = 'Mark all done';
  }
  document.getElementById('reset-modal').classList.add('open');
}
function closeModal() { document.getElementById('reset-modal').classList.remove('open'); }
function confirmReset() {
  const ns = resetTarget === 'todo' ? 'pending' : 'done';
  PROBLEMS.forEach(p => { statuses[p.id] = ns; });
  debouncedSave(); closeModal(); updateStats(); render();
}
document.getElementById('reset-modal').addEventListener('click', e => {
  if (e.target.id === 'reset-modal') closeModal();
});

function topicReset(key, ns) {
  PROBLEMS.forEach(p => { if (p.topic === key) statuses[p.id] = ns; });
  debouncedSave(); updateStats(); render();
}

/* =====================================================================
   SIDE PANEL
   ===================================================================== */
let panelId  = null;
let panelTab = 'code';
let monacoEditor = null;
let monacoReady  = false;

function openPanel(id) {
  panelId = id;
  const p        = PROBLEMS.find(x => x.id === id);
  const codeData = codes[id] || { text: '', lang: getEditedLang(p) || '' };
  const lang     = codeData.lang || getEditedLang(p) || '';

  document.getElementById('panel-title').textContent  = getEditedName(p);
  document.getElementById('panel-lang-sel').value      = lang;
  switchPanelTab(panelTab);

  if (panelTab === 'notes') document.getElementById('panel-notes').value = notes[id] || '';
  document.getElementById('panel-overlay').classList.add('open');

  if (monacoReady && monacoEditor) {
    const model = monaco.editor.createModel(codeData.text || '', lang || 'plaintext');
    monacoEditor.setModel(model);
    monaco.editor.setTheme('vs-dark');
  }
}
function closePanel() { document.getElementById('panel-overlay').classList.remove('open'); }

function switchPanelTab(tab) {
  panelTab = tab;
  ['code', 'resource', 'notes'].forEach(t => {
    document.getElementById('pane-'  + t).classList.toggle('hidden', tab !== t);
    document.getElementById('ptab-' + t).classList.toggle('active',  tab === t);
  });
  if (tab === 'resource' && panelId !== null) renderResList(panelId);
  if (tab === 'notes'    && panelId !== null) document.getElementById('panel-notes').value = notes[panelId] || '';
  if (tab === 'code'     && monacoEditor) setTimeout(() => monacoEditor.layout(), 50);
}

document.getElementById('panel-lang-sel').addEventListener('change', function() {
  if (monacoEditor && monacoReady) {
    monaco.editor.setModelLanguage(monacoEditor.getModel(), this.value || 'plaintext');
  }
  if (panelId !== null) handleLangChange(panelId, this.value);
});

function saveCode() {
  if (panelId === null) return;
  const text = monacoReady && monacoEditor ? monacoEditor.getValue() : '';
  const lang = document.getElementById('panel-lang-sel').value;
  codes[panelId] = { text, lang };
  if (lang) setEdit(panelId, 'lang', lang);
  debouncedSave();
  const btn = document.getElementById('save-btn');
  const orig = btn.textContent; btn.textContent = 'saved ✓';
  setTimeout(() => btn.textContent = orig, 1400);
  reRenderRow(panelId);
}

function copyCode() {
  const text = monacoReady && monacoEditor ? monacoEditor.getValue() : '';
  const btn  = document.getElementById('copy-btn');
  if (!text) { btn.textContent = 'empty!'; setTimeout(() => btn.textContent = 'copy', 1200); return; }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  if (!ok && navigator.clipboard) { navigator.clipboard.writeText(text).catch(() => {}); ok = true; }
  btn.textContent = ok ? 'copied ✓' : 'failed!';
  setTimeout(() => btn.textContent = 'copy', 1400);
}

function renderResList(id) {
  const list = document.getElementById('resource-list');
  const res  = resources[id] || [];
  if (!res.length) { list.innerHTML = '<div class="resource-empty">no resources yet</div>'; return; }
  list.innerHTML = res.map((url, i) => {
    const disp = url.replace(/^https?:\/\//, '').substring(0, 58);
    return `<div class="resource-item">
      <span style="font-size:11px;flex-shrink:0">⬡</span>
      <a class="resource-link" href="${url}" target="_blank" rel="noopener">${disp}</a>
      <button class="resource-del" onclick="removeResource(${id},${i})">×</button>
    </div>`;
  }).join('');
}

function addResource() {
  const inp = document.getElementById('resource-url-inp');
  let url = inp.value.trim();
  if (!url) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  if (!resources[panelId]) resources[panelId] = [];
  resources[panelId].push(url);
  debouncedSave(); inp.value = '';
  renderResList(panelId); reRenderRow(panelId);
}

function saveNotes() {
  if (panelId === null) return;
  notes[panelId] = document.getElementById('panel-notes').value;
  debouncedSave();
  const btn  = document.querySelector('.notes-save-btn');
  const orig = btn.textContent; btn.textContent = 'saved ✓';
  setTimeout(() => btn.textContent = orig, 1300);
  reRenderRow(panelId);
}

function removeResource(id, idx) {
  if (resources[id]) {
    resources[id].splice(idx, 1);
    debouncedSave(); renderResList(id); reRenderRow(id);
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePanel(); closeModal(); }
});

/* =====================================================================
   MONACO EDITOR INIT
   ===================================================================== */
function initMonaco() {
  if (typeof require === 'undefined') { setTimeout(initMonaco, 50); return; }
  require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
  require(['vs/editor/editor.main'], function() {
    monacoReady  = true;
    monacoEditor = monaco.editor.create(document.getElementById('monaco-container'), {
      value:              '',
      language:           'cpp',
      theme:              'vs-dark',
      fontSize:           12,
      fontFamily:         "'JetBrains Mono',monospace",
      minimap:            { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers:        'on',
      glyphMargin:        false,
      folding:            true,
      renderLineHighlight:'line',
      padding:            { top: 12, bottom: 12 },
      automaticLayout:    true,
      wordWrap:           'off',
      suggest:            { showWords: false },
      quickSuggestions:   true,
      tabSize:            2,
    });
    // Restore content if panel was opened before Monaco loaded
    if (panelId !== null) {
      const codeData = codes[panelId] || { text: '', lang: '' };
      const lang = codeData.lang || getEditedLang(PROBLEMS.find(x => x.id === panelId)) || 'cpp';
      const model = monaco.editor.createModel(codeData.text || '', lang || 'plaintext');
      monacoEditor.setModel(model);
      document.getElementById('panel-lang-sel').value = lang;
    }
  });
}
initMonaco();

/* =====================================================================
   STATS
   ===================================================================== */
function updateStats() {
  const done  = PROBLEMS.filter(p => getStatus(p.id) === 'done').length;
  const rev   = PROBLEMS.filter(p => getStatus(p.id) === 'review').length;
  const skip  = PROBLEMS.filter(p => getStatus(p.id) === 'skip').length;
  const tot   = PROBLEMS.length;
  document.getElementById('stat-solved').textContent    = done;
  document.getElementById('stat-review').textContent    = rev;
  document.getElementById('stat-skip').textContent      = skip;
  document.getElementById('stat-remaining').textContent = tot - done - skip;
  bowlTargetPct = Math.round(done / tot * 100);

  // Update per-topic % badges on tabs
  document.querySelectorAll('.topic-tab[data-topic]').forEach(tab => {
    const key   = tab.dataset.topic; if (key === 'all') return;
    const tot_t = PROBLEMS.filter(p => p.topic === key).length;
    const don_t = PROBLEMS.filter(p => p.topic === key && getStatus(p.id) === 'done').length;
    const s = tab.querySelector('.tab-pct');
    if (s) s.textContent = Math.round(don_t / tot_t * 100) + '%';
  });
  buildMiniTopicBars();
}

function buildMiniTopicBars() {
  const mini = document.getElementById('topic-mini-bars');
  mini.innerHTML = '';
  TOPICS.forEach(t => {
    const tot = PROBLEMS.filter(p => p.topic === t.key).length;
    const don = PROBLEMS.filter(p => p.topic === t.key && getStatus(p.id) === 'done').length;
    const pct = Math.round(don / tot * 100);
    mini.innerHTML += `<div class="topic-mini">
      <span class="topic-mini-label" title="${t.key}">${t.short}</span>
      <div class="topic-mini-track">
        <div class="topic-mini-fill" style="width:${pct}%;background:${t.color}"></div>
      </div>
      <span class="topic-mini-count">${don}/${tot}</span>
    </div>`;
  });
}

/* =====================================================================
   TOPIC TABS
   ===================================================================== */
function buildTabs() {
  const c = document.getElementById('topic-tabs');
  c.innerHTML = `<div class="topic-tab-wrap">
    <button class="topic-tab active" data-topic="all" onclick="setTopic('all')">
      <span class="dot" style="background:#7c6ff7"></span>all topics
    </button>
  </div>`;
  TOPICS.forEach(t => {
    const tot  = PROBLEMS.filter(p => p.topic === t.key).length;
    const don  = PROBLEMS.filter(p => p.topic === t.key && getStatus(p.id) === 'done').length;
    const pct  = Math.round(don / tot * 100);
    const safe = t.key.replace(/'/g, "\\'");
    c.innerHTML += `<div class="topic-tab-wrap">
      <button class="topic-tab" data-topic="${t.key}" style="--topic-color:${t.color}" onclick="setTopic('${safe}')">
        <span class="dot"></span>${t.short}<span class="tab-pct">${pct}%</span>
      </button>
      <div class="topic-tab-actions">
        <button class="tab-act t" onclick="topicReset('${safe}','pending')">↺ reset</button>
        <button class="tab-act d" onclick="topicReset('${safe}','done')">✓ all done</button>
      </div>
    </div>`;
  });
}

/* =====================================================================
   RENDER
   ===================================================================== */
function render() {
  const filtered = PROBLEMS.filter(p => {
    const s = getStatus(p.id);
    if (activeTopic !== 'all' && p.topic !== activeTopic) return false;
    if (activeFilter !== 'all' && s !== activeFilter)     return false;
    if (searchVal) {
      const lbl = getEditedName(p).toLowerCase();
      return lbl.includes(searchVal)
          || p.url.toLowerCase().includes(searchVal)
          || p.subtopic.toLowerCase().includes(searchVal)
          || p.topic.toLowerCase().includes(searchVal);
    }
    return true;
  });

  const groups = {};
  filtered.forEach(p => {
    if (!groups[p.subtopic]) groups[p.subtopic] = [];
    groups[p.subtopic].push(p);
  });

  const container = document.getElementById('problem-list');
  if (!filtered.length) { container.innerHTML = '<div class="empty">// no problems match</div>'; return; }

  const topicColors = {};
  TOPICS.forEach(t => topicColors[t.key] = t.color);

  let html = '';
  Object.entries(groups).forEach(([sub, probs]) => {
    const color    = topicColors[probs[0].topic] || '#7c6ff7';
    const dn       = probs.filter(p => getStatus(p.id) === 'done').length;
    const pct      = Math.round((dn / probs.length) * 100);
    const isColl   = collapsed[sub] === true;
    const encSub   = encodeURIComponent(sub).replace(/'/g, '%27');

    html += `
      <div class="section${isColl ? ' collapsed' : ''}" data-skey="${encSub}">
        <div class="section-header">
          <div class="section-marker" style="background:${color}"></div>
          <span class="section-title">${sub}</span>
          <div class="section-bar">
            <div class="section-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="section-meta">${dn}/${probs.length}</span>
          <div class="section-actions">
            <button class="sec-act t" data-skey="${encSub}" data-act="pending">↺</button>
            <button class="sec-act d" data-skey="${encSub}" data-act="done">✓</button>
          </div>
          <span class="collapse-icon">▾</span>
        </div>
        <div class="problem-list${isColl ? ' hidden' : ''}">
          ${probs.map(p => buildRowHTML(p)).join('')}
        </div>
      </div>`;
  });
  container.innerHTML = html;

  // Fix heights after paint
  requestAnimationFrame(() => {
    document.querySelectorAll('.section').forEach(sec => {
      const list = sec.querySelector('.problem-list');
      const key  = decodeURIComponent(sec.dataset.skey);
      if (collapsed[key]) {
        list.style.maxHeight = '0px';
      } else {
        list.style.maxHeight = 'none';
        list.style.maxHeight = list.scrollHeight + 'px';
      }
    });
  });
  syncSelectColors();
}

function buildRowHTML(p) {
  const id       = p.id;
  const s        = getStatus(id);
  const label    = getEditedName(p).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const lang     = getEditedLang(p);
  const plat     = getPlatform(p.url);
  const hasCode  = !!(codes[id]?.text);
  const hasRes   = !!(resources[id]?.length);
  const hasNotes = !!(notes[id]);

  const langOpts = ['', 'cpp', 'python', 'java', 'javascript', 'typescript', 'c', 'csharp', 'go', 'rust', 'kotlin', 'swift', 'ruby', 'scala']
    .map(v => `<option value="${v}"${lang === v ? ' selected' : ''}>${LANG_LABELS[v] || v || '—'}</option>`)
    .join('');

  return `<div class="problem-row ${s}" data-id="${id}">
    <button class="status-btn ${s}" onclick="cycleStatus(${id})">${STATUS_ICONS[s]}</button>
    <input class="editable-name" type="text" value="${label}"
      onblur="handleNameEdit(${id},this.value)"
      onkeydown="if(event.key==='Enter'||event.key==='Escape')this.blur();"
      onclick="event.stopPropagation()">
    <div class="badges">
      <select class="lang-select" onchange="handleLangChange(${id},this.value)" onclick="event.stopPropagation()">${langOpts}</select>
      <a class="plat-badge plat-${plat}" href="${p.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${PLAT[plat]}</a>
    </div>
    <div class="row-actions">
      <button class="row-btn${hasCode  ? ' has-code'     : ''}" onclick="event.stopPropagation();openPanel(${id})">&lt;/&gt;</button>
      <button class="row-btn${hasRes   ? ' has-resource' : ''}" onclick="event.stopPropagation();openPanel(${id});switchPanelTab('resource')">⬡</button>
      <button class="row-btn${hasNotes ? ' has-resource' : ''}" onclick="event.stopPropagation();openPanel(${id});switchPanelTab('notes')" title="${hasNotes ? 'View notes' : 'Add notes'}">✎</button>
    </div>
    <select class="status-select ${s}" onchange="setStatus(${id},this.value)" onclick="event.stopPropagation()">
      <option value="pending"${s === 'pending' ? ' selected' : ''}>todo</option>
      <option value="done"   ${s === 'done'    ? ' selected' : ''}>solved</option>
      <option value="review" ${s === 'review'  ? ' selected' : ''}>review</option>
      <option value="skip"   ${s === 'skip'    ? ' selected' : ''}>skip</option>
    </select>
  </div>`;
}

function reRenderRow(id) {
  const el = document.querySelector(`.problem-row[data-id="${id}"]`);
  if (!el) return;
  const p = PROBLEMS.find(x => x.id === id);
  if (!p) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = buildRowHTML(p);
  el.replaceWith(tmp.firstChild);
  syncSelectColors();
}

function syncSelectColors() {
  document.querySelectorAll('.status-select').forEach(el => el.className = 'status-select ' + el.value);
}

/* =====================================================================
   EVENT DELEGATION
   ===================================================================== */
document.getElementById('problem-list').addEventListener('click', function(e) {
  // Inline section reset
  const actBtn = e.target.closest('.sec-act');
  if (actBtn) {
    e.stopPropagation();
    const key = decodeURIComponent(actBtn.dataset.skey);
    const ns  = actBtn.dataset.act;
    PROBLEMS.forEach(p => { if (p.subtopic === key) statuses[p.id] = ns; });
    debouncedSave(); updateStats(); render(); return;
  }
  // Section collapse
  const hdr = e.target.closest('.section-header');
  if (hdr && !e.target.closest('button,select,input,a')) {
    const sec = hdr.closest('[data-skey]');
    if (sec) toggleSection(decodeURIComponent(sec.dataset.skey));
  }
});

document.getElementById('search').addEventListener('input', e => {
  searchVal = e.target.value.toLowerCase();
  render();
});

/* =====================================================================
   INTRO COUNT-UP ANIMATION
   ===================================================================== */
function animateIntro() {
  const done = PROBLEMS.filter(p => getStatus(p.id) === 'done').length;
  const rev  = PROBLEMS.filter(p => getStatus(p.id) === 'review').length;
  const skip = PROBLEMS.filter(p => getStatus(p.id) === 'skip').length;
  const tot  = PROBLEMS.length;
  const targetPct = Math.round(done / tot * 100);

  function countUp(elId, target, dur) {
    if (!target) return;
    const el    = document.getElementById(elId);
    const start = performance.now();
    function step(now) {
      const t    = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(ease * target);
      if (t < 1) requestAnimationFrame(step); else el.textContent = target;
    }
    requestAnimationFrame(step);
  }
  countUp('stat-solved',    done,       1100);
  countUp('stat-review',    rev,         900);
  countUp('stat-skip',      skip,        750);
  countUp('stat-remaining', tot - done - skip, 1100);

  // Bowl fills in sync with counters
  const dur = 1300, start = performance.now();
  function bowlIn(now) {
    const t    = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    bowlTargetPct = ease * targetPct;
    if (t < 1) requestAnimationFrame(bowlIn); else bowlTargetPct = targetPct;
  }
  requestAnimationFrame(bowlIn);
}

/* =====================================================================
   BOOT — runs on page load
   ===================================================================== */
window.addEventListener('load', async () => {
  // 1. Check if GitHub redirected back with a token in the URL hash
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('token')) {
    githubToken = hash.get('token');
    localStorage.setItem('gh_token', githubToken);
    history.replaceState(null, '', location.pathname); // clean the URL
  } else {
    githubToken = localStorage.getItem('gh_token');
  }

  // 2. If we have a token, fetch the user and their saved data
  if (githubToken) {
    githubUser = await fetchGitHubUser();
    if (!githubUser) {
      // Token is stale — clear it
      githubToken = null;
      localStorage.removeItem('gh_token');
    } else {
      // Update auth UI
      document.getElementById('login-btn').style.display = 'none';
      const ui = document.getElementById('user-info');
      ui.style.display = 'flex';
      document.getElementById('user-name').textContent = '@' + githubUser.login;
      if (githubUser.avatar_url) {
        document.getElementById('user-avatar-wrap').innerHTML =
          `<img src="${githubUser.avatar_url}" alt="${githubUser.login}">`;
      }
      await loadFromGitHub();
    }
  }

  // 3. Build UI and render
  buildTabs();
  render();
  setTimeout(animateIntro, 250);
});
