'use strict';

const STORAGE_KEY = 'uretane.v1';
const LEGACY_STORAGE_KEY = 'shitehoshii.v1';
const MAX_TEXT_LENGTH = 120;
const MAX_SHARED_ITEMS = 100;
const MAX_SHARE_HASH_LENGTH = 60000;

const urgencyMeta = {
  today: { label: '今日', className: 'urgency-today', weight: 3 },
  soon: { label: '近々', className: 'urgency-soon', weight: 2 },
  anytime: { label: 'いつでも', className: 'urgency-anytime', weight: 1 }
};

const defaultState = () => ({
  schemaVersion: 1,
  deviceId: crypto.randomUUID(),
  myItems: [],
  partnerItems: [],
  history: []
});

let state = loadState();
let activeRequestTab = 'mine';
let currentPartnerMissionId = null;
let currentSelfMissionId = null;
let pendingImport = null;
let cachedShareUrl = '';
let pendingCompletionItem = null;
let toastTimer = null;
let bloomTimer = null;

const $ = (id) => document.getElementById(id);

const elements = {
  appHeader: $('appHeader'),
  bottomNav: $('bottomNav'),
  homeContent: $('homeContent'),
  dateLabel: $('dateLabel'),
  homeFlowerPill: $('homeFlowerPill'),
  homeFlowerCount: $('homeFlowerCount'),
  openAddButton: $('openAddButton'),
  onboardingCard: $('onboardingCard'),
  onboardingAddButton: $('onboardingAddButton'),
  nextStepCard: $('nextStepCard'),
  nextStepShareButton: $('nextStepShareButton'),
  growthCard: $('growthCard'),
  monthFlowerCount: $('monthFlowerCount'),
  grownKindsCount: $('grownKindsCount'),
  totalKindsCount: $('totalKindsCount'),
  growthProgress: $('growthProgress'),
  addRequestButton: $('addRequestButton'),
  requestDialog: $('requestDialog'),
  requestForm: $('requestForm'),
  requestDialogTitle: $('requestDialogTitle'),
  editingId: $('editingId'),
  requestText: $('requestText'),
  charCount: $('charCount'),
  saveRequestButton: $('saveRequestButton'),
  mineList: $('mineList'),
  partnerList: $('partnerList'),
  minePanel: $('minePanel'),
  partnerPanel: $('partnerPanel'),
  shareButton: $('shareButton'),
  shareDialog: $('shareDialog'),
  sharePreview: $('sharePreview'),
  closeShareDialog: $('closeShareDialog'),
  copyShareButton: $('copyShareButton'),
  nativeShareButton: $('nativeShareButton'),
  shareStatus: $('shareStatus'),
  importDialog: $('importDialog'),
  importPreview: $('importPreview'),
  importSummary: $('importSummary'),
  importStatus: $('importStatus'),
  importButton: $('importButton'),
  cancelImportButton: $('cancelImportButton'),
  closeImportDialog: $('closeImportDialog'),
  resetButton: $('resetButton'),
  resetDialog: $('resetDialog'),
  confirmResetButton: $('confirmResetButton'),
  cancelResetButton: $('cancelResetButton'),
  closeResetDialog: $('closeResetDialog'),
  historyList: $('historyList'),
  partnerHero: $('partnerHero'),
  selfHero: $('selfHero'),
  partnerCount: $('partnerCount'),
  selfCount: $('selfCount'),
  partnerMissionEmpty: $('partnerMissionEmpty'),
  partnerMissionCard: $('partnerMissionCard'),
  partnerMissionUrgency: $('partnerMissionUrgency'),
  partnerMissionText: $('partnerMissionText'),
  drawPartnerButton: $('drawPartnerButton'),
  partnerDoneButton: $('partnerDoneButton'),
  partnerRerollButton: $('partnerRerollButton'),
  selfMissionEmpty: $('selfMissionEmpty'),
  selfMissionCard: $('selfMissionCard'),
  selfMissionUrgency: $('selfMissionUrgency'),
  selfMissionText: $('selfMissionText'),
  drawSelfButton: $('drawSelfButton'),
  selfDoneButton: $('selfDoneButton'),
  selfRerollButton: $('selfRerollButton'),
  completionDialog: $('completionDialog'),
  completionText: $('completionText'),
  closeCompletionButton: $('closeCompletionButton'),
  shareCompletionButton: $('shareCompletionButton'),
  bloomOverlay: $('bloomOverlay'),
  toast: $('toast')
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== 1) return defaultState();
    return {
      schemaVersion: 1,
      deviceId: typeof parsed.deviceId === 'string' ? parsed.deviceId : crypto.randomUUID(),
      myItems: Array.isArray(parsed.myItems) ? parsed.myItems.filter(isValidLocalItem) : [],
      partnerItems: Array.isArray(parsed.partnerItems) ? parsed.partnerItems.filter(isValidPartnerItem) : [],
      history: Array.isArray(parsed.history) ? parsed.history.filter(isValidHistoryItem).slice(0, 500) : []
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast('保存できませんでした。ブラウザの保存設定を確認してください。');
  }
}

function isValidLocalItem(item) {
  return item && typeof item.id === 'string' && isSafeText(item.text) && ['partner', 'self'].includes(item.executor) && urgencyMeta[item.urgency];
}

function isValidPartnerItem(item) {
  return item && typeof item.id === 'string' && typeof item.sourceId === 'string' && isSafeText(item.text) && urgencyMeta[item.urgency];
}

function isValidHistoryItem(item) {
  return item && typeof item.id === 'string' && isSafeText(item.text) && ['partner', 'self'].includes(item.kind) && urgencyMeta[item.urgency];
}

function isSafeText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TEXT_LENGTH;
}

function nowIso() {
  return new Date().toISOString();
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function setView(name) {
  document.querySelectorAll('.view').forEach((view) => {
    const active = view.dataset.view === name;
    view.hidden = !active;
    view.classList.toggle('is-active', active);
  });
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.nav === name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  renderMyList();
  renderPartnerList();
  renderHistory();
  renderSummary();
  renderMission('partner');
  renderMission('self');
}

function renderMyList() {
  elements.mineList.replaceChildren();
  const items = [...state.myItems].sort(sortItems);
  if (!items.length) {
    elements.mineList.append(createEmptyCard('まだタネがありません。まずは「これができたらうれしい」を1つまいてみましょう。'));
    return;
  }
  items.forEach((item) => elements.mineList.append(createRequestCard(item, 'mine')));
}

function renderPartnerList() {
  elements.partnerList.replaceChildren();
  const items = [...state.partnerItems].sort(sortItems);
  if (!items.length) {
    elements.partnerList.append(createEmptyCard('まだ届いたタネはありません。共有リンクを開くと、ここに取り込めます。'));
    return;
  }
  items.forEach((item) => elements.partnerList.append(createRequestCard(item, 'partner')));
}

function sortItems(a, b) {
  const urgencyDiff = urgencyMeta[b.urgency].weight - urgencyMeta[a.urgency].weight;
  if (urgencyDiff !== 0) return urgencyDiff;
  return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

function createEmptyCard(text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';
  wrapper.classList.add('list-empty');
  const p = document.createElement('p');
  p.textContent = text;
  wrapper.append(p);
  return wrapper;
}

function createRequestCard(item, type) {
  const card = document.createElement('article');
  card.className = 'request-card';
  const cardKind = type === 'partner' || (type === 'mine' && item.executor === 'partner') ? 'partner' : 'self';
  card.classList.add(`request-${cardKind}`);

  const top = document.createElement('div');
  top.className = 'request-meta';

  const metaLeft = document.createElement('div');
  metaLeft.className = 'meta-left';
  metaLeft.append(createUrgencyChip(item.urgency));

  if (type === 'mine') {
    const typeChip = document.createElement('span');
    typeChip.className = `type-chip ${item.executor === 'partner' ? 'type-partner' : 'type-self'}`;
    typeChip.textContent = item.executor === 'partner' ? '相手に届ける' : '自分で育てる';
    metaLeft.append(typeChip);
  } else {
    const typeChip = document.createElement('span');
    typeChip.className = 'type-chip type-partner';
    typeChip.textContent = '届いたタネ';
    metaLeft.append(typeChip);
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  if (type === 'mine') {
    const edit = document.createElement('button');
    edit.className = 'text-button';
    edit.type = 'button';
    edit.textContent = '編集';
    edit.addEventListener('click', () => openRequestDialog(item));
    actions.append(edit);
  }

  const remove = document.createElement('button');
  remove.className = 'text-button danger';
  remove.type = 'button';
  remove.textContent = '削除';
  remove.addEventListener('click', () => deleteItem(item.id, type));
  actions.append(remove);

  top.append(metaLeft, actions);

  const text = document.createElement('p');
  text.textContent = item.text;

  const date = document.createElement('div');
  date.className = 'meta-date';
  date.textContent = type === 'mine' ? `更新 ${formatDate(item.updatedAt)}` : `受取 ${formatDate(item.importedAt)}`;

  card.append(top, text, date);

  const canTrack = type === 'partner' || (type === 'mine' && item.executor === 'self');
  if (canTrack) {
    const kind = type === 'partner' ? 'partner' : 'self';
    const completions = state.history
      .filter((entry) => entry.kind === kind && entry.sourceItemId === item.id)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const progress = document.createElement('div');
    progress.className = 'item-progress';
    const count = document.createElement('strong');
    count.textContent = completions.length ? `${completions.length}回育てた` : 'まだ育てていません';
    const last = document.createElement('span');
    last.textContent = completions.length ? `最後 ${formatDate(completions[0].completedAt)}` : '育てると花が咲きます';
    progress.append(count, last);
    card.append(progress);
  }
  return card;
}

function createUrgencyChip(urgency) {
  const chip = document.createElement('span');
  const meta = urgencyMeta[urgency];
  chip.className = `urgency-chip ${meta.className}`;
  chip.textContent = meta.label;
  return chip;
}

function renderHistory() {
  elements.historyList.replaceChildren();
  if (!state.history.length) {
    elements.historyList.append(createEmptyCard('「育てた！」を押すと、ここに花の記録が残ります。'));
    return;
  }
  const sorted = [...state.history].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  sorted.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'history-card';

    const meta = document.createElement('div');
    meta.className = 'history-meta';

    const left = document.createElement('div');
    left.className = 'meta-left';
    left.append(createUrgencyChip(item.urgency));
    const kind = document.createElement('span');
    kind.className = `type-chip ${item.kind === 'partner' ? 'type-partner' : 'type-self'}`;
    kind.textContent = item.kind === 'partner' ? '届いたタネ' : '自分のタネ';
    left.append(kind);

    const date = document.createElement('span');
    date.className = 'meta-date';
    date.textContent = formatDate(item.completedAt);
    meta.append(left, date);

    const text = document.createElement('p');
    text.textContent = item.text;
    card.append(meta, text);
    elements.historyList.append(card);
  });
}

function renderSummary() {
  elements.partnerCount.textContent = `${state.partnerItems.length}件`;
  const selfItems = state.myItems.filter((item) => item.executor === 'self');
  const partnerTargetItems = state.myItems.filter((item) => item.executor === 'partner');
  elements.selfCount.textContent = `${selfItems.length}件`;

  const visibleItems = [...state.partnerItems, ...selfItems];
  const hasAnySeeds = state.myItems.length > 0 || state.partnerItems.length > 0;
  const hasAnyData = hasAnySeeds || state.history.length > 0;
  const hasActionableSeeds = visibleItems.length > 0;

  const now = new Date();
  const weekday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()];
  elements.dateLabel.textContent = `${now.getMonth() + 1}/${now.getDate()} ${weekday}`;

  const monthFlowers = state.history.filter((item) => {
    const date = new Date(item.completedAt);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
  const availableIds = new Set(visibleItems.map((item) => item.id));
  const grownIds = new Set(state.history.filter((item) => availableIds.has(item.sourceItemId)).map((item) => item.sourceItemId));
  const totalKinds = visibleItems.length;
  const grownKinds = grownIds.size;
  const progress = totalKinds ? Math.round((grownKinds / totalKinds) * 100) : 0;

  elements.monthFlowerCount.textContent = String(monthFlowers);
  elements.homeFlowerCount.textContent = String(monthFlowers);
  elements.grownKindsCount.textContent = String(grownKinds);
  elements.totalKindsCount.textContent = String(totalKinds);
  elements.growthProgress.value = progress;
  elements.growthProgress.textContent = `${progress}%`;

  // 初回はプロトタイプと同じく「まず1つまく」だけに集中させる。
  elements.onboardingCard.hidden = hasAnySeeds;
  elements.homeContent.hidden = !hasAnySeeds;
  elements.appHeader.hidden = !hasAnyData;
  elements.bottomNav.hidden = !hasAnyData;
  elements.openAddButton.hidden = !hasAnySeeds;
  elements.homeFlowerPill.hidden = state.history.length === 0;
  elements.growthCard.hidden = state.history.length === 0;
  elements.partnerHero.hidden = state.partnerItems.length === 0;
  elements.selfHero.hidden = selfItems.length === 0;
  elements.nextStepCard.hidden = !(partnerTargetItems.length > 0 && !hasActionableSeeds);

  elements.drawPartnerButton.disabled = state.partnerItems.length === 0;
  elements.drawSelfButton.disabled = selfItems.length === 0;

  if (!hasAnyData) {
    const activeView = document.querySelector('.view.is-active');
    if (activeView?.dataset.view !== 'home') setView('home');
  }
}

function renderMission(kind) {
  const isPartner = kind === 'partner';
  let id = isPartner ? currentPartnerMissionId : currentSelfMissionId;
  const source = isPartner ? state.partnerItems : state.myItems.filter((item) => item.executor === 'self');
  let item = source.find((entry) => entry.id === id);
  const empty = isPartner ? elements.partnerMissionEmpty : elements.selfMissionEmpty;
  const card = isPartner ? elements.partnerMissionCard : elements.selfMissionCard;
  const chip = isPartner ? elements.partnerMissionUrgency : elements.selfMissionUrgency;
  const text = isPartner ? elements.partnerMissionText : elements.selfMissionText;
  const drawButton = isPartner ? elements.drawPartnerButton : elements.drawSelfButton;
  const rerollButton = isPartner ? elements.partnerRerollButton : elements.selfRerollButton;

  // タネがあれば、ホームを開いた時点で「今日の1つ」を見せる。
  if (!item && source.length) {
    const pool = getPriorityPool(source);
    item = pool[Math.floor(Math.random() * pool.length)];
    id = item.id;
    if (isPartner) currentPartnerMissionId = id;
    else currentSelfMissionId = id;
  }

  if (!item) {
    empty.hidden = false;
    card.hidden = true;
    drawButton.hidden = false;
    rerollButton.hidden = true;
    return;
  }

  empty.hidden = true;
  card.hidden = false;
  drawButton.hidden = true;
  rerollButton.hidden = source.length < 2;
  chip.className = `urgency-chip ${urgencyMeta[item.urgency].className}`;
  chip.textContent = urgencyMeta[item.urgency].label;
  text.textContent = item.text;
}

function drawMission(kind) {
  const source = kind === 'partner' ? state.partnerItems : state.myItems.filter((item) => item.executor === 'self');
  if (!source.length) return;
  const selectedPool = getPriorityPool(source);
  const selected = selectedPool[Math.floor(Math.random() * selectedPool.length)];
  if (kind === 'partner') currentPartnerMissionId = selected.id;
  else currentSelfMissionId = selected.id;
  renderMission(kind);
}

function getPriorityPool(items) {
  const today = items.filter((item) => item.urgency === 'today');
  if (today.length) return today;
  const soon = items.filter((item) => item.urgency === 'soon');
  if (soon.length) return soon;
  return items.filter((item) => item.urgency === 'anytime');
}

function completeMission(kind) {
  const isPartner = kind === 'partner';
  const id = isPartner ? currentPartnerMissionId : currentSelfMissionId;
  const source = isPartner ? state.partnerItems : state.myItems;
  const item = source.find((entry) => entry.id === id);
  if (!item) return;

  state.history.unshift({
    id: crypto.randomUUID(),
    sourceItemId: item.id,
    text: item.text,
    urgency: item.urgency,
    kind,
    completedAt: nowIso()
  });
  state.history = state.history.slice(0, 500);
  saveState();
  renderHistory();
  renderSummary();
  showBloom();

  if (isPartner) {
    currentPartnerMissionId = null;
    renderMission('partner');
    pendingCompletionItem = item;
    elements.completionText.textContent = item.text;
    setTimeout(() => {
      if (!elements.completionDialog.open) elements.completionDialog.showModal();
    }, 1250);
  } else {
    currentSelfMissionId = null;
    renderMission('self');
    showToast('自分のタネを育てた記録を残しました。');
  }
}

async function shareCompletion() {
  const item = pendingCompletionItem;
  if (!item) return;
  elements.completionDialog.close();
  pendingCompletionItem = null;
  const text = `うれタネ「${item.text}」を育てたよ。花がひとつ咲きました。`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'うれタネを育てたよ', text });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        showToast('育てた記録を残しました。');
        return;
      }
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('育てた記録を残し、伝える文をコピーしました。');
  } catch {
    showToast('育てた記録を残しました。');
  }
}

function openRequestDialog(item = null) {
  elements.requestForm.reset();
  elements.editingId.value = item?.id || '';
  elements.requestDialogTitle.textContent = item ? 'うれタネを編集' : 'タネをまく';
  elements.requestText.value = item?.text || '';
  elements.charCount.textContent = String(elements.requestText.value.length);

  const executor = item?.executor || 'partner';
  const urgency = item?.urgency || 'today';
  const executorInput = elements.requestForm.querySelector(`input[name="executor"][value="${executor}"]`);
  const urgencyInput = elements.requestForm.querySelector(`input[name="urgency"][value="${urgency}"]`);
  if (executorInput) executorInput.checked = true;
  if (urgencyInput) urgencyInput.checked = true;

  elements.requestDialog.showModal();
  setTimeout(() => elements.requestText.focus(), 50);
}

function saveRequest() {
  const text = elements.requestText.value.trim();
  if (!isSafeText(text)) {
    elements.requestText.focus();
    showToast(`1〜${MAX_TEXT_LENGTH}文字で入力してください。`);
    return;
  }

  const executor = elements.requestForm.querySelector('input[name="executor"]:checked')?.value;
  const urgency = elements.requestForm.querySelector('input[name="urgency"]:checked')?.value;
  if (!['partner', 'self'].includes(executor) || !urgencyMeta[urgency]) return;

  const editingId = elements.editingId.value;
  const timestamp = nowIso();

  if (editingId) {
    const index = state.myItems.findIndex((item) => item.id === editingId);
    if (index >= 0) {
      state.myItems[index] = { ...state.myItems[index], text, executor, urgency, updatedAt: timestamp };
    }
  } else {
    state.myItems.push({
      id: crypto.randomUUID(),
      text,
      executor,
      urgency,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  saveState();
  elements.requestDialog.close();
  currentSelfMissionId = null;
  renderAll();
  showToast(editingId ? 'うれタネを更新しました。' : 'うれタネをまきました。');
}

function deleteItem(id, type) {
  const list = type === 'mine' ? state.myItems : state.partnerItems;
  const item = list.find((entry) => entry.id === id);
  if (!item) return;
  const message = type === 'mine' ? 'このうれタネを削除しますか？' : 'この届いたタネを、この端末から削除しますか？';
  if (!window.confirm(message)) return;

  if (type === 'mine') {
    state.myItems = state.myItems.filter((entry) => entry.id !== id);
    if (currentSelfMissionId === id) currentSelfMissionId = null;
  } else {
    state.partnerItems = state.partnerItems.filter((entry) => entry.id !== id);
    if (currentPartnerMissionId === id) currentPartnerMissionId = null;
  }
  saveState();
  renderAll();
  showToast('うれタネを削除しました。');
}

function setRequestTab(tab) {
  activeRequestTab = tab;
  document.querySelectorAll('[data-request-tab]').forEach((button) => {
    const active = button.dataset.requestTab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  elements.minePanel.hidden = tab !== 'mine';
  elements.partnerPanel.hidden = tab !== 'partner';
}

function buildSharePreview(container, items) {
  container.replaceChildren();
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'preview-item';
    row.append(createUrgencyChip(item.urgency));
    const text = document.createElement('p');
    text.textContent = item.text;
    row.append(text);
    container.append(row);
  });
}

async function openShareDialog() {
  const items = state.myItems.filter((item) => item.executor === 'partner').sort(sortItems);
  if (!items.length) {
    showToast('「相手に届ける」うれタネを1件以上まいてください。');
    return;
  }

  buildSharePreview(elements.sharePreview, items);
  elements.shareStatus.textContent = `${items.length}件のうれタネを届けます。共有前に内容を確認してください。`;
  elements.copyShareButton.disabled = true;
  elements.nativeShareButton.disabled = true;
  elements.shareDialog.showModal();

  try {
    cachedShareUrl = await createEncryptedShareUrl(items);
    elements.copyShareButton.disabled = false;
    elements.nativeShareButton.disabled = false;
  } catch {
    elements.shareStatus.textContent = '共有リンクを作成できませんでした。対応ブラウザでお試しください。';
  }
}

async function createEncryptedShareUrl(items) {
  if (!crypto.subtle) throw new Error('Web Crypto unsupported');
  const payload = {
    v: 1,
    sourceId: state.deviceId,
    generatedAt: nowIso(),
    items: items.slice(0, MAX_SHARED_ITEMS).map((item) => ({
      id: item.id,
      text: item.text,
      urgency: item.urgency,
      updatedAt: item.updatedAt
    }))
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));

  const shareHash = `share=v1.${toBase64Url(rawKey)}.${toBase64Url(iv)}.${toBase64Url(encrypted)}`;
  const base = location.href.split('#')[0];
  return `${base}#${shareHash}`;
}

function toBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function copyShareLink() {
  if (!cachedShareUrl) return;
  try {
    await navigator.clipboard.writeText(cachedShareUrl);
    elements.shareStatus.textContent = '共有リンクをコピーしました。LINEなどで相手に送れます。';
  } catch {
    elements.shareStatus.textContent = 'コピーできませんでした。ブラウザの権限設定をご確認ください。';
  }
}

async function nativeShareLink() {
  if (!cachedShareUrl) return;
  if (!navigator.share) {
    await copyShareLink();
    return;
  }
  try {
    await navigator.share({
      title: 'うれタネが届いています',
      text: 'うれタネを届けました。リンクを開いて取り込んでください。',
      url: cachedShareUrl
    });
    elements.shareStatus.textContent = '共有画面を開きました。';
  } catch (error) {
    if (error?.name !== 'AbortError') elements.shareStatus.textContent = '共有できませんでした。リンクコピーをお試しください。';
  }
}

async function detectIncomingShare() {
  const hash = location.hash;
  if (!hash.startsWith('#share=')) return;
  if (hash.length > MAX_SHARE_HASH_LENGTH) {
    clearShareHash();
    showToast('共有データが大きすぎます。');
    return;
  }

  try {
    const payload = await decryptShareHash(hash.slice(7));
    pendingImport = validateSharePayload(payload);
    if (!pendingImport) throw new Error('Invalid payload');
    showImportDialog(pendingImport);
  } catch {
    clearShareHash();
    showToast('共有リンクを読み取れませんでした。');
  }
}

async function decryptShareHash(value) {
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid format');
  const keyBytes = fromBase64Url(parts[1]);
  const iv = fromBase64Url(parts[2]);
  const encrypted = fromBase64Url(parts[3]);
  if (keyBytes.length !== 32 || iv.length !== 12 || encrypted.length < 17) throw new Error('Invalid crypto data');

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(decrypted);
  return JSON.parse(text);
}

function validateSharePayload(payload) {
  if (!payload || payload.v !== 1 || typeof payload.sourceId !== 'string' || payload.sourceId.length > 80) return null;
  if (!Array.isArray(payload.items) || payload.items.length > MAX_SHARED_ITEMS) return null;
  const ids = new Set();
  const items = [];
  for (const item of payload.items) {
    if (!item || typeof item.id !== 'string' || item.id.length > 80 || ids.has(item.id)) return null;
    if (!isSafeText(item.text) || !urgencyMeta[item.urgency]) return null;
    ids.add(item.id);
    items.push({
      id: item.id,
      text: item.text.trim(),
      urgency: item.urgency,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : payload.generatedAt
    });
  }
  return {
    sourceId: payload.sourceId,
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : nowIso(),
    items
  };
}

function showImportDialog(payload) {
  buildSharePreview(elements.importPreview, payload.items);
  const existing = state.partnerItems.filter((item) => item.sourceId === payload.sourceId);
  const newIds = new Set(payload.items.map((item) => item.id));
  const addCount = payload.items.filter((item) => !existing.some((old) => old.id === item.id)).length;
  const updateCount = payload.items.filter((item) => existing.some((old) => old.id === item.id && (old.text !== item.text || old.urgency !== item.urgency))).length;
  const removeCount = existing.filter((item) => !newIds.has(item.id)).length;
  elements.importSummary.textContent = `受信 ${payload.items.length}件 / 追加 ${addCount}件 / 更新 ${updateCount}件 / 削除 ${removeCount}件`;
  elements.importStatus.textContent = '取り込むまで、この端末のデータは変更されません。';
  elements.importDialog.showModal();
}

function importPendingShare() {
  if (!pendingImport) return;
  const sourceId = pendingImport.sourceId;
  const importedAt = nowIso();
  const otherSources = state.partnerItems.filter((item) => item.sourceId !== sourceId);
  const incoming = pendingImport.items.map((item) => ({
    id: item.id,
    sourceId,
    text: item.text,
    urgency: item.urgency,
    updatedAt: item.updatedAt,
    importedAt
  }));
  state.partnerItems = [...otherSources, ...incoming];
  saveState();
  currentPartnerMissionId = null;
  pendingImport = null;
  clearShareHash();
  elements.importDialog.close();
  renderAll();
  setRequestTab('partner');
  setView('requests');
  showToast('届いたうれタネを取り込みました。');
}

function clearShareHash() {
  try {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  } catch {
    location.hash = '';
  }
}

function resetAllData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  state = defaultState();
  saveState();
  currentPartnerMissionId = null;
  currentSelfMissionId = null;
  pendingImport = null;
  cachedShareUrl = '';
  pendingCompletionItem = null;
  if (elements.completionDialog.open) elements.completionDialog.close();
  clearShareHash();
  elements.resetDialog.close();
  renderAll();
  setRequestTab('mine');
  setView('home');
  showToast('この端末のうれタネを初期化しました。');
}

function showBloom() {
  clearTimeout(bloomTimer);
  elements.bloomOverlay.hidden = false;
  bloomTimer = setTimeout(() => {
    elements.bloomOverlay.hidden = true;
  }, 1650);
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 3000);
}

function attachEvents() {
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.nav));
  });
  document.querySelectorAll('[data-request-tab]').forEach((button) => {
    button.addEventListener('click', () => setRequestTab(button.dataset.requestTab));
  });

  elements.openAddButton.addEventListener('click', () => openRequestDialog());
  elements.onboardingAddButton.addEventListener('click', () => openRequestDialog());
  elements.nextStepShareButton.addEventListener('click', openShareDialog);
  elements.addRequestButton.addEventListener('click', () => openRequestDialog());
  elements.requestText.addEventListener('input', () => {
    elements.charCount.textContent = String(elements.requestText.value.length);
  });
  elements.saveRequestButton.addEventListener('click', saveRequest);

  elements.shareButton.addEventListener('click', openShareDialog);
  elements.closeShareDialog.addEventListener('click', () => elements.shareDialog.close());
  elements.copyShareButton.addEventListener('click', copyShareLink);
  elements.nativeShareButton.addEventListener('click', nativeShareLink);

  elements.importButton.addEventListener('click', importPendingShare);
  elements.cancelImportButton.addEventListener('click', () => elements.importDialog.close());
  elements.closeImportDialog.addEventListener('click', () => elements.importDialog.close());

  elements.closeCompletionButton.addEventListener('click', () => {
    pendingCompletionItem = null;
    elements.completionDialog.close();
  });
  elements.shareCompletionButton.addEventListener('click', shareCompletion);

  elements.resetButton.addEventListener('click', () => elements.resetDialog.showModal());
  elements.confirmResetButton.addEventListener('click', resetAllData);
  elements.cancelResetButton.addEventListener('click', () => elements.resetDialog.close());
  elements.closeResetDialog.addEventListener('click', () => elements.resetDialog.close());

  elements.drawPartnerButton.addEventListener('click', () => drawMission('partner'));
  elements.partnerRerollButton.addEventListener('click', () => drawMission('partner'));
  elements.partnerDoneButton.addEventListener('click', () => completeMission('partner'));

  elements.drawSelfButton.addEventListener('click', () => drawMission('self'));
  elements.selfRerollButton.addEventListener('click', () => drawMission('self'));
  elements.selfDoneButton.addEventListener('click', () => completeMission('self'));
}

async function boot() {
  attachEvents();
  renderAll();
  setRequestTab(activeRequestTab);
  await detectIncomingShare();
}

boot();
