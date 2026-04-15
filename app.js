/* =====================================================================
   AUTH — token lives in httpOnly cookie, managed by Vercel functions
   ===================================================================== */
let githubUser = null;    // { login, name, avatar_url }
let fileSha    = null;    // SHA of progress.json in user's repo
let saveTimer  = null;    // debounce handle

function handleLogin() {
  window.location.href = '/api/auth';
}

async function handleLogout() {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();    // full page refresh clears all state
}

function setSyncStatus(msg) {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = msg;
}

async function fetchSession() {
  // Cookie is sent automatically — no credentials in JS
  const r = await fetch('/api/me');
  if (!r.ok) return null;
  const { user } = await r.json();
  return user || null;
}

async function loadFromGitHub() {
  if (!githubUser) return;
  setSyncStatus('loading…');
  try {
    const repo = `${githubUser.login}/dsa-sheet`;
    const r    = await fetch(`/api/load?repo=${encodeURIComponent(repo)}`);
    // Cookie sent automatically — no Authorization header needed from client
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { data, sha } = await r.json();
    fileSha = sha;
    if (data) {
      statuses       = data.statuses       || {};
      edits          = data.edits          || {};
      codes          = data.codes          || {};
      resources      = data.resources      || {};
      collapsed      = data.collapsed      || {};
      notes          = data.notes          || {};
      customProblems = data.customProblems || [];
    }
    setSyncStatus('synced');
  } catch (err) {
    console.error('Load error:', err);
    setSyncStatus('load failed');
  }
}

function debouncedSave() {
  if (!githubUser) return;
  clearTimeout(saveTimer);
  setSyncStatus('unsaved…');
  saveTimer = setTimeout(saveToGitHub, 1500);
}

async function saveToGitHub() {
  if (!githubUser) return;
  setSyncStatus('saving…');
  try {
    const repo = `${githubUser.login}/dsa-sheet`;
    const r = await fetch('/api/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      // Cookie sent automatically — NO token in body or headers
      body: JSON.stringify({
        repo, sha: fileSha,
        data: { statuses, edits, codes, resources, collapsed, notes, customProblems },
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const result = await r.json();
    fileSha = result.sha;
    setSyncStatus('saved');
  } catch (err) {
    console.error('Save error:', err);
    setSyncStatus('save failed');
  }
}

/* =====================================================================
   STATE
   ===================================================================== */
let statuses       = {};
let edits          = {};
let codes          = {};
let resources      = {};
let collapsed      = {};
let notes          = {};
let customProblems = [];  // user-added problems

let activeTopic  = 'all';
let activeFilter = 'all';
let searchVal    = '';

/* Merge built-in and custom problems */
function getAllProblems() {
  return [...PROBLEMS, ...customProblems];
}

/* =====================================================================
   STATUS
   ===================================================================== */
function getStatus(id)    { return statuses[id] || 'pending'; }
function setStatus(id, s) { statuses[id] = s; debouncedSave(); updateStats(); reRenderRow(id); }
function cycleStatus(id)  {
  const c = getStatus(id);
  setStatus(id, STATUS_CYCLE[(STATUS_CYCLE.indexOf(c) + 1) % STATUS_CYCLE.length]);
}

/* =====================================================================
   EDITS (name / lang overrides per problem)
   ===================================================================== */
function getEditedName(p) {
  return edits[p.id]?.name !== undefined ? edits[p.id].name : getLabel(p);
}
function getEditedLang(p) {
  if (edits[p.id]?.lang !== undefined) return edits[p.id].lang;
  return (p.lang && p.lang !== '-' && p.lang !== 'nan') ? normLang(p.lang) : '';
}
function normLang(s) {
  const m = {
    'c++':'cpp','py3':'python','py':'python','python3':'python',
    java:'java',javascript:'javascript',js:'javascript',
    ts:'typescript',typescript:'typescript','c#':'csharp',
    go:'go',rust:'rust',kotlin:'kotlin',swift:'swift',
    ruby:'ruby',scala:'scala',c:'c',
  };
  return m[(s || '').toLowerCase()] || '';
}
function setEdit(id, field, val) {
  if (!edits[id]) edits[id] = {};
  edits[id][field] = val;
  debouncedSave();
}
function handleNameEdit(id, val)   { setEdit(id, 'name', val.trim()); }
function handleLangChange(id, val) { setEdit(id, 'lang', val); }

/* =====================================================================
   PLATFORM / LABEL HELPERS
   ===================================================================== */
function getPlatform(url) {
  if (!url) return 'oj';
  if (url.includes('leetcode'))                            return 'lc';
  if (url.includes('codeforces') || url.includes('cses')) return 'cf';
  if (url.includes('geeksforgeeks'))                       return 'gfg';
  if (url.includes('spoj'))                                return 'spoj';
  if (url.includes('codechef'))                            return 'cc';
  return 'oj';
}
const PLAT = { lc:'LC', cf:'CF', gfg:'GFG', spoj:'SPOJ', cc:'CC', oj:'OJ' };

function getLabel(p) {
  if (p.name) return p.name;
  try {
    const u = new URL(p.url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1]
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .substring(0, 52) || p.url;
  } catch { return (p.url || '').substring(0, 52); }
}

/* =====================================================================
   FILTER / TOPIC / SEARCH
   ===================================================================== */
function setFilter(f, el) {
  activeFilter = f;
  ['all','done','review','skip','pending'].forEach(k => {
    const b = document.getElementById('fb-' + k);
    if (b) { b.style.background = ''; b.style.borderColor = ''; b.style.color = ''; }
  });
  const b = el || document.getElementById('fb-' + f);
  if (b) {
    if      (f==='done')    { b.style.background='var(--green)';  b.style.borderColor='var(--green)';  b.style.color='var(--bg)'; }
    else if (f==='review')  { b.style.background='var(--amber)';  b.style.borderColor='var(--amber)';  b.style.color='var(--bg)'; }
    else if (f==='skip')    { b.style.background='var(--muted2)'; b.style.borderColor='var(--muted2)'; b.style.color='var(--text)'; }
    else                    { b.style.background='var(--accent)'; b.style.borderColor='var(--accent)'; b.style.color='#fff'; }
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
  const isC  = !!collapsed[key];
  sec.classList.toggle('collapsed', isC);
  if (isC) {
    list.classList.add('hidden');
    list.style.maxHeight = '0px';
  } else {
    list.classList.remove('hidden');
    list.style.maxHeight = 'none';
    list.style.maxHeight = list.scrollHeight + 'px';
  }
}

/* =====================================================================
   RESET — clears code when resetting to todo, keeps resources & notes
   ===================================================================== */
let resetTarget = 'todo';
function openResetModal(target) {
  resetTarget = target;
  const t   = document.getElementById('modal-title');
  const b   = document.getElementById('modal-body');
  const btn = document.getElementById('modal-confirm');
  if (target === 'todo') {
    t.textContent = 'Reset everything to To-do?';
    b.innerHTML   = 'Status → <strong>todo</strong> + saved code cleared. Resources and notes are kept.';
    btn.className = 'modal-btn confirm'; btn.textContent = 'Reset all';
  } else {
    t.textContent = 'Mark all as Solved?';
    b.innerHTML   = 'Every problem will be marked <strong>solved</strong>. Code is unchanged.';
    btn.className = 'modal-btn danger'; btn.textContent = 'Mark all done';
  }
  document.getElementById('reset-modal').classList.add('open');
}
function closeModal() { document.getElementById('reset-modal').classList.remove('open'); }
function confirmReset() {
  const ns = resetTarget === 'todo' ? 'pending' : 'done';
  getAllProblems().forEach(p => {
    statuses[p.id] = ns;
    if (ns === 'pending') delete codes[p.id];   // clear code on to-do reset only
  });
  debouncedSave(); closeModal(); updateStats(); render();
}
document.getElementById('reset-modal').addEventListener('click', e => {
  if (e.target.id === 'reset-modal') closeModal();
});

/* Section-level reset (by subtopic) */
function sectionReset(subtopic, ns) {
  getAllProblems().forEach(p => {
    if (p.subtopic === subtopic) {
      statuses[p.id] = ns;
      if (ns === 'pending') delete codes[p.id];
    }
  });
  debouncedSave(); updateStats(); render();
}

/* Topic-level reset (by topic tab) */
function topicReset(key, ns) {
  getAllProblems().forEach(p => {
    if (p.topic === key) {
      statuses[p.id] = ns;
      if (ns === 'pending') delete codes[p.id];
    }
  });
  debouncedSave(); updateStats(); render();
}

/* =====================================================================
   ADD PROBLEM
   ===================================================================== */
let addModalState = { subtopic: '', topic: '' };

function openAddModal(subtopic, topic) {
  addModalState = { subtopic, topic };
  document.getElementById('add-modal-section-label').textContent = 'Section: ' + subtopic;
  document.getElementById('add-prob-name').value = '';
  document.getElementById('add-prob-url').value  = '';
  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => document.getElementById('add-prob-url').focus(), 80);
}
function closeAddModal() { document.getElementById('add-modal').classList.remove('open'); }

function confirmAddProblem() {
  const url  = document.getElementById('add-prob-url').value.trim();
  const name = document.getElementById('add-prob-name').value.trim();
  if (!url) {
    document.getElementById('add-prob-url').style.borderColor = 'var(--red)';
    document.getElementById('add-prob-url').focus();
    return;
  }
  document.getElementById('add-prob-url').style.borderColor = '';

  const newP = {
    id:       'cp_' + Date.now(),
    topic:    addModalState.topic,
    subtopic: addModalState.subtopic,
    name,
    url:      url.startsWith('http') ? url : 'https://' + url,
    lang:     '',
    solution: '',
    custom:   true,
  };
  customProblems.push(newP);
  debouncedSave(); closeAddModal(); render(); updateStats();
}

function deleteCustomProblem(id) {
  const idx = customProblems.findIndex(p => p.id === id);
  if (idx === -1) return;
  customProblems.splice(idx, 1);
  // Clean up all state for this problem
  delete statuses[id];
  delete edits[id];
  delete codes[id];
  delete resources[id];
  delete notes[id];
  debouncedSave(); render(); updateStats();
}

document.getElementById('add-modal').addEventListener('click', e => {
  if (e.target.id === 'add-modal') closeAddModal();
});

/* =====================================================================
   SIDE PANEL
   ===================================================================== */
let panelId      = null;
let panelTab     = 'code';
let monacoEditor = null;
let monacoReady  = false;

function openPanel(id) {
  panelId = id;
  const p        = getAllProblems().find(x => x.id == id);
  const codeData = codes[id] || { text: '', lang: getEditedLang(p) || '' };
  const lang     = codeData.lang || getEditedLang(p) || '';
  document.getElementById('panel-title').textContent = getEditedName(p);
  document.getElementById('panel-lang-sel').value    = lang;
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
  ['code','resource','notes'].forEach(t => {
    document.getElementById('pane-'  + t).classList.toggle('hidden', tab !== t);
    document.getElementById('ptab-' + t).classList.toggle('active',  tab === t);
  });
  if (tab === 'resource' && panelId !== null) renderResList(panelId);
  if (tab === 'notes'    && panelId !== null) document.getElementById('panel-notes').value = notes[panelId] || '';
  if (tab === 'code'     && monacoEditor)     setTimeout(() => monacoEditor.layout(), 50);
}

document.getElementById('panel-lang-sel').addEventListener('change', function() {
  if (monacoEditor && monacoReady) monaco.editor.setModelLanguage(monacoEditor.getModel(), this.value || 'plaintext');
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
  const orig = btn.textContent; btn.textContent = 'saved';
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
  try { ok = document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
  if (!ok && navigator.clipboard) { navigator.clipboard.writeText(text).catch(()=>{}); ok = true; }
  btn.textContent = ok ? 'copied' : 'failed!';
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
      <button class="resource-del" onclick="removeResource('${id}',${i})">x</button>
    </div>`;
  }).join('');
}

function addResource() {
  const inp = document.getElementById('resource-url-inp');
  let url   = inp.value.trim();
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
  const btn = document.querySelector('.notes-save-btn');
  const orig = btn.textContent; btn.textContent = 'saved';
  setTimeout(() => btn.textContent = orig, 1300);
  reRenderRow(panelId);
}

function removeResource(id, idx) {
  if (resources[id]) { resources[id].splice(idx, 1); debouncedSave(); renderResList(id); reRenderRow(id); }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePanel(); closeModal(); closeAddModal(); }
});

/* =====================================================================
   MONACO INIT
   ===================================================================== */
function initMonaco() {
  if (typeof require === 'undefined') { setTimeout(initMonaco, 50); return; }
  require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
  require(['vs/editor/editor.main'], function() {
    monacoReady  = true;
    monacoEditor = monaco.editor.create(document.getElementById('monaco-container'), {
      value:'', language:'cpp', theme:'vs-dark', fontSize:12,
      fontFamily:"'JetBrains Mono',monospace",
      minimap:{enabled:false}, scrollBeyondLastLine:false,
      lineNumbers:'on', glyphMargin:false, folding:true,
      renderLineHighlight:'line', padding:{top:12,bottom:12},
      automaticLayout:true, wordWrap:'off',
      suggest:{showWords:false}, quickSuggestions:true, tabSize:2,
    });
    if (panelId !== null) {
      const codeData = codes[panelId] || { text:'', lang:'' };
      const lang = codeData.lang || getEditedLang(getAllProblems().find(x => x.id == panelId)) || 'cpp';
      monacoEditor.setModel(monaco.editor.createModel(codeData.text || '', lang || 'plaintext'));
      document.getElementById('panel-lang-sel').value = lang;
    }
  });
}
initMonaco();

/* =====================================================================
   STATS + MINI BARS
   ===================================================================== */
function updateStats() {
  const all  = getAllProblems();
  const done = all.filter(p => getStatus(p.id) === 'done').length;
  const rev  = all.filter(p => getStatus(p.id) === 'review').length;
  const skip = all.filter(p => getStatus(p.id) === 'skip').length;
  const tot  = all.length;
  document.getElementById('stat-solved').textContent    = done;
  document.getElementById('stat-review').textContent    = rev;
  document.getElementById('stat-skip').textContent      = skip;
  document.getElementById('stat-remaining').textContent = tot - done - skip;
  bowlTargetPct = Math.round(done / tot * 100);

  document.querySelectorAll('.topic-tab[data-topic]').forEach(tab => {
    const key   = tab.dataset.topic; if (key === 'all') return;
    const probs = all.filter(p => p.topic === key);
    const don_t = probs.filter(p => getStatus(p.id) === 'done').length;
    const s     = tab.querySelector('.tab-pct');
    if (s) s.textContent = Math.round(don_t / probs.length * 100) + '%';
  });
  buildMiniTopicBars();
}

function buildMiniTopicBars() {
  const mini = document.getElementById('topic-mini-bars');
  if (!mini) return;
  const all = getAllProblems();
  mini.innerHTML = TOPICS.map(t => {
    const probs = all.filter(p => p.topic === t.key);
    const don   = probs.filter(p => getStatus(p.id) === 'done').length;
    const pct   = probs.length ? Math.round(don / probs.length * 100) : 0;
    return `<div class="topic-mini">
      <span class="topic-mini-label" title="${t.key}">${t.short}</span>
      <div class="topic-mini-track"><div class="topic-mini-fill" style="width:${pct}%;background:${t.color}"></div></div>
      <span class="topic-mini-count">${don}/${probs.length}</span>
    </div>`;
  }).join('');
}

/* =====================================================================
   TOPIC TABS
   ===================================================================== */
function buildTabs() {
  const all = getAllProblems();
  const c   = document.getElementById('topic-tabs');
  c.innerHTML = `<div class="topic-tab-wrap">
    <button class="topic-tab active" data-topic="all" onclick="setTopic('all')">
      <span class="dot" style="background:#7c6ff7"></span>all topics
    </button>
  </div>`;
  TOPICS.forEach(t => {
    const probs = all.filter(p => p.topic === t.key);
    const don   = probs.filter(p => getStatus(p.id) === 'done').length;
    const pct   = Math.round(don / probs.length * 100);
    const safe  = t.key.replace(/'/g, "\\'");
    c.innerHTML += `<div class="topic-tab-wrap">
      <button class="topic-tab" data-topic="${t.key}" style="--topic-color:${t.color}" onclick="setTopic('${safe}')">
        <span class="dot"></span>${t.short}<span class="tab-pct">${pct}%</span>
      </button>
      <div class="topic-tab-actions">
        <button class="tab-act t" onclick="topicReset('${safe}','pending')">reset</button>
        <button class="tab-act d" onclick="topicReset('${safe}','done')">all done</button>
      </div>
    </div>`;
  });
}

/* =====================================================================
   RENDER
   ===================================================================== */
function render() {
  const all      = getAllProblems();
  const filtered = all.filter(p => {
    const s = getStatus(p.id);
    if (activeTopic  !== 'all' && p.topic  !== activeTopic)  return false;
    if (activeFilter !== 'all' && s !== activeFilter)         return false;
    if (searchVal) {
      const lbl = getEditedName(p).toLowerCase();
      return lbl.includes(searchVal)
          || (p.url      || '').toLowerCase().includes(searchVal)
          || (p.subtopic || '').toLowerCase().includes(searchVal)
          || (p.topic    || '').toLowerCase().includes(searchVal);
    }
    return true;
  });

  const groups = {};
  filtered.forEach(p => {
    if (!groups[p.subtopic]) groups[p.subtopic] = { topic: p.topic, probs: [] };
    groups[p.subtopic].probs.push(p);
  });

  const container = document.getElementById('problem-list');
  if (!filtered.length) { container.innerHTML = '<div class="empty">// no problems match</div>'; return; }

  const topicColors = {};
  TOPICS.forEach(t => topicColors[t.key] = t.color);

  let html = '';
  Object.entries(groups).forEach(([sub, { topic, probs }]) => {
    const color  = topicColors[topic] || '#7c6ff7';
    const dn     = probs.filter(p => getStatus(p.id) === 'done').length;
    const pct    = Math.round(dn / probs.length * 100);
    const isColl = collapsed[sub] === true;
    const encSub = encodeURIComponent(sub).replace(/'/g, '%27');
    const encTop = encodeURIComponent(topic).replace(/'/g, '%27');

    html += `
      <div class="section${isColl ? ' collapsed' : ''}" data-skey="${encSub}">
        <div class="section-header">
          <div class="section-marker" style="background:${color}"></div>
          <span class="section-title">${sub}</span>
          <div class="section-bar"><div class="section-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <span class="section-meta">${dn}/${probs.length}</span>
          <div class="section-actions">
            <button class="sec-act t" data-skey="${encSub}" data-act="pending">reset</button>
            <button class="sec-act d" data-skey="${encSub}" data-act="done">done</button>
            <button class="sec-act a" onclick="event.stopPropagation();openAddModal(decodeURIComponent('${encSub}'),decodeURIComponent('${encTop}'))">+ add</button>
          </div>
          <span class="collapse-icon">v</span>
        </div>
        <div class="problem-list${isColl ? ' hidden' : ''}">
          ${probs.map(p => buildRowHTML(p)).join('')}
        </div>
      </div>`;
  });
  container.innerHTML = html;

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
  const sid      = JSON.stringify(String(id)); // safe for inline onclick (handles both numeric + string ids)
  const s        = getStatus(id);
  const label    = getEditedName(p).replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const lang     = getEditedLang(p);
  const plat     = getPlatform(p.url);
  const hasCode  = !!(codes[id]?.text);
  const hasRes   = !!(resources[id]?.length);
  const hasNotes = !!(notes[id]);

  const langOpts = ['','cpp','python','java','javascript','typescript','c','csharp','go','rust','kotlin','swift','ruby','scala']
    .map(v => `<option value="${v}"${lang===v?' selected':''}>${LANG_LABELS[v]||v||'none'}</option>`)
    .join('');

  const deleteBtn = p.custom
    ? `<button class="row-btn" title="Delete custom problem" style="color:var(--red);border-color:rgba(255,107,107,0.3)"
         onclick="event.stopPropagation();if(confirm('Delete this problem?'))deleteCustomProblem(${sid})">x</button>`
    : '';

  return `<div class="problem-row ${s}" data-id="${id}">
    <button class="status-btn ${s}" onclick="cycleStatus(${sid})">${STATUS_ICONS[s]}</button>
    <input class="editable-name" type="text" value="${label}"
      onblur="handleNameEdit(${sid},this.value)"
      onkeydown="if(event.key==='Enter'||event.key==='Escape')this.blur();"
      onclick="event.stopPropagation()">
    <div class="badges">
      <select class="lang-select" onchange="handleLangChange(${sid},this.value)" onclick="event.stopPropagation()">${langOpts}</select>
      <a class="plat-badge plat-${plat}" href="${p.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${PLAT[plat]}</a>
    </div>
    <div class="row-actions">
      <button class="row-btn${hasCode  ? ' has-code'     :''}" onclick="event.stopPropagation();openPanel(${sid})">&lt;/&gt;</button>
      <button class="row-btn${hasRes   ? ' has-resource' :''}" onclick="event.stopPropagation();openPanel(${sid});switchPanelTab('resource')">res</button>
      <button class="row-btn${hasNotes ? ' has-resource' :''}" onclick="event.stopPropagation();openPanel(${sid});switchPanelTab('notes')"  title="${hasNotes?'View notes':'Add notes'}">n</button>
      ${deleteBtn}
    </div>
    <select class="status-select ${s}" onchange="setStatus(${sid},this.value)" onclick="event.stopPropagation()">
      <option value="pending"${s==='pending'?' selected':''}>todo</option>
      <option value="done"   ${s==='done'   ?' selected':''}>solved</option>
      <option value="review" ${s==='review' ?' selected':''}>review</option>
      <option value="skip"   ${s==='skip'   ?' selected':''}>skip</option>
    </select>
  </div>`;
}

function reRenderRow(id) {
  const el = document.querySelector(`.problem-row[data-id="${id}"]`);
  if (!el) return;
  const p = getAllProblems().find(x => x.id == id);
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
  const actBtn = e.target.closest('.sec-act');
  if (actBtn && actBtn.dataset.act && actBtn.dataset.act !== 'add') {
    e.stopPropagation();
    const key = decodeURIComponent(actBtn.dataset.skey);
    sectionReset(key, actBtn.dataset.act);
    return;
  }
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
   COUNT-UP INTRO ANIMATION
   ===================================================================== */
function animateIntro() {
  const all  = getAllProblems();
  const done = all.filter(p => getStatus(p.id) === 'done').length;
  const rev  = all.filter(p => getStatus(p.id) === 'review').length;
  const skip = all.filter(p => getStatus(p.id) === 'skip').length;
  const tot  = all.length;
  const targetPct = Math.round(done / tot * 100);

  function countUp(elId, target, dur) {
    if (!target) return;
    const el = document.getElementById(elId);
    const t0 = performance.now();
    function step(now) {
      const t    = Math.min((now - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(ease * target);
      if (t < 1) requestAnimationFrame(step); else el.textContent = target;
    }
    requestAnimationFrame(step);
  }
  countUp('stat-solved',    done,           1100);
  countUp('stat-review',    rev,             900);
  countUp('stat-skip',      skip,            750);
  countUp('stat-remaining', tot-done-skip,  1100);

  const dur = 1300, t0 = performance.now();
  function bowlIn(now) {
    const t    = Math.min((now - t0) / dur, 1);
    bowlTargetPct = (1 - Math.pow(1 - t, 3)) * targetPct;
    if (t < 1) requestAnimationFrame(bowlIn); else bowlTargetPct = targetPct;
  }
  requestAnimationFrame(bowlIn);
}

/* =====================================================================
   BOOT
   ===================================================================== */
window.addEventListener('load', async () => {
  // Check if GitHub just redirected us back after login
  const params = new URLSearchParams(location.search);
  if (params.get('login') === 'success') {
    // Clean up the URL without triggering a reload
    history.replaceState(null, '', '/');
  }

  // Try to restore session from httpOnly cookie via /api/me
  githubUser = await fetchSession();

  if (githubUser) {
    // Show auth UI
    document.getElementById('login-btn').style.display = 'none';
    const ui = document.getElementById('user-info');
    ui.style.display = 'flex';
    document.getElementById('user-name').textContent = '@' + githubUser.login;
    if (githubUser.avatar_url) {
      document.getElementById('user-avatar-wrap').innerHTML =
        `<img src="${githubUser.avatar_url}" alt="${githubUser.login}" style="width:20px;height:20px;border-radius:50%;border:1px solid var(--border2)">`;
    }
    await loadFromGitHub();
  }

  // Build UI — updateStats() called first so mini bars appear immediately
  buildTabs();
  updateStats();   // <-- fixes mini bars missing on first open
  render();
  setTimeout(animateIntro, 250);
});
