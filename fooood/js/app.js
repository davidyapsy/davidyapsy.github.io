import {
  CONFIG_IS_MISSING,
  fetchListsWithItemSummaries,
  fetchList,
  fetchFoodItems,
  insertList,
  updateListDoc,
  deleteListCascade,
  insertFoodItem,
  updateFoodItemDoc,
  deleteFoodItemDoc,
  updateFoodItemRanks,
  uploadImage,
} from './firebase-client.js';

/* ----------------------------- constants ------------------------------ */

const STORE_PRESETS = ['FamilyMart', '7-Eleven', 'Lawson', 'MyNews', 'KK Mart', 'Other'];
const EMOJI_PRESETS = ['🍙', '🍱', '🍰', '🍩', '🥤', '🍜', '🍫', '🍿', '🧋', '🍡', '🍔', '🍕', '🥟', '🍪', '🍧'];

const ADD_FOOD_TOASTS = ['Added to the food archives 📖', 'Noted! Another one for the record 🍙', 'Logged 💕'];
const ADD_LIST_TOASTS = ['New list started ✨', 'A fresh ranking begins 🍽️'];
const REORDER_TOASTS = ['Ranking updated 👀', 'Ooh, shuffled things up'];

function randomOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
function escapeAttr(str) { return escapeHtml(str); }

// Renders a list's icon as either its uploaded photo (shrunk client-side
// at upload time) or its emoji, in a consistently-sized chip.
function iconChipHtml(entity, sizeClass) {
  if (entity && entity.iconUrl) {
    return `<span class="icon-chip ${sizeClass} has-img"><img src="${escapeAttr(entity.iconUrl)}" alt=""></span>`;
  }
  return `<span class="icon-chip ${sizeClass}">${escapeHtml((entity && entity.emoji) || '🍽️')}</span>`;
}

/* -------------------------------- dom ---------------------------------- */

const appEl = document.getElementById('app');
const fabEl = document.getElementById('fab');
const modalRoot = document.getElementById('modal-root');
const toastEl = document.getElementById('toast');

/* ------------------------------- router -------------------------------- */

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (!hash) return { name: 'home' };
  const listMatch = hash.match(/^list\/([^/]+)$/);
  if (listMatch) return { name: 'list', id: listMatch[1] };
  return { name: 'home' };
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

async function render() {
  closeModal();
  if (CONFIG_IS_MISSING) {
    renderSetupNotice();
    fabEl.hidden = true;
    return;
  }
  fabEl.hidden = false;
  const route = currentRoute();
  if (route.name === 'list') {
    await renderListDetail(route.id);
  } else {
    await renderHome();
  }
}

function renderSetupNotice() {
  appEl.innerHTML = `
    <div class="setup-notice">
      <div style="font-size:2.4rem">🍙</div>
      <h2>Almost there!</h2>
      <p>This site needs to be connected to a Firebase project before it can save anything.</p>
      <p>Copy <code>js/config.example.js</code> to <code>js/config.js</code> and fill in your project's Firebase config values — see the README for the full walkthrough.</p>
    </div>`;
}

/* -------------------------------- home ---------------------------------- */

async function renderHome() {
  fabEl.onclick = () => openAddListModal();
  appEl.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Her food hall of fame</h1>
      <p class="page-subtitle">Every list, every ranking, all in one place.</p>
    </div>
    <div id="home-body" class="loading"><div class="spinner"></div>Loading your food universe…</div>
  `;

  const { data: lists, error } = await fetchListsWithItemSummaries();

  const bodyEl = document.getElementById('home-body');
  if (error) {
    bodyEl.className = 'empty-state';
    bodyEl.innerHTML = `<span class="emoji">😵</span><h3>Couldn't load your lists</h3><p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!lists || lists.length === 0) {
    bodyEl.className = 'empty-state';
    bodyEl.innerHTML = `
      <span class="emoji">🍙</span>
      <h3>No rankings yet</h3>
      <p>Tap the + button to start your first list — what did you try most recently?</p>`;
    return;
  }

  bodyEl.className = '';
  bodyEl.innerHTML = `<div class="list-grid">${lists.map(listCardHtml).join('')}</div>`;
  bodyEl.querySelectorAll('.list-card').forEach((card) => {
    card.addEventListener('click', () => { location.hash = `#/list/${card.dataset.id}`; });
  });
}

function listCardHtml(list) {
  const items = list.food_items || [];
  const top = items.slice().sort((a, b) => a.rank - b.rank)[0];
  const metaParts = [list.store, list.category].filter(Boolean);
  return `
    <div class="list-card" data-id="${list.id}">
      ${iconChipHtml(list, 'icon-chip-lg')}
      <div class="name">${escapeHtml(list.name)}</div>
      ${metaParts.length ? `<div class="meta">${escapeHtml(metaParts.join(' · '))}</div>` : ''}
      <div class="meta">${items.length} item${items.length === 1 ? '' : 's'}</div>
      ${top ? `<div class="top-pick">${MEDAL_ICON} <b>${escapeHtml(top.name)}</b></div>` : ''}
    </div>`;
}

/* ---------------------------- list detail -------------------------------- */

let currentListItems = [];
let sortableInstance = null;
let isDragging = false; // true while a card drag is in progress (and briefly after),
                         // so the trailing click from the same gesture doesn't also open the edit modal

async function renderListDetail(listId) {
  fabEl.onclick = () => openAddFoodModal(listId);
  appEl.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`;

  const [{ data: list, error: listErr }, { data: items, error: itemsErr }] = await Promise.all([
    fetchList(listId),
    fetchFoodItems(listId),
  ]);

  if (listErr || !list) {
    appEl.innerHTML = `
      <div class="list-toolbar">
        <button class="icon-btn" id="back-btn" title="Back to all lists"><i class="fa-solid fa-arrow-left"></i></button>
      </div>
      <div class="empty-state"><span class="emoji">🤔</span><h3>List not found</h3></div>`;
    document.getElementById('back-btn').addEventListener('click', () => { location.hash = '#/'; });
    return;
  }

  currentListItems = items || [];

  const metaParts = [list.store, list.category].filter(Boolean);
  appEl.innerHTML = `
    <div class="list-toolbar">
      <button class="icon-btn" id="back-btn" title="Back to all lists"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="list-menu">
        <button class="icon-btn" id="list-menu-btn" title="List options" aria-haspopup="true" aria-expanded="false"><i class="fa-solid fa-ellipsis"></i></button>
        <div class="list-menu-actions" id="list-menu-actions">
          <button class="icon-btn" id="edit-list-btn" type="button" title="Edit list"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn icon-btn-danger" id="delete-list-btn" type="button" title="Delete list"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>
    <div class="list-detail-title">
      ${iconChipHtml(list, 'icon-chip-lg')}
      <div>
        <h1>${escapeHtml(list.name)}</h1>
        ${metaParts.length ? `<div class="meta">${escapeHtml(metaParts.join(' · '))}</div>` : ''}
      </div>
    </div>
    ${currentListItems.length > 1 ? `<input id="local-search" class="local-search" type="text" placeholder="Filter ${escapeAttr(list.name)}…">` : ''}
    <div id="food-list-container"></div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => { location.hash = '#/'; });
  const listMenuBtn = document.getElementById('list-menu-btn');
  const listMenuActions = document.getElementById('list-menu-actions');
  listMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !listMenuActions.classList.contains('open');
    listMenuActions.classList.toggle('open', willOpen);
    listMenuBtn.setAttribute('aria-expanded', String(willOpen));
  });
  document.getElementById('edit-list-btn').addEventListener('click', () => { listMenuActions.classList.remove('open'); openEditListModal(list); });
  document.getElementById('delete-list-btn').addEventListener('click', () => { listMenuActions.classList.remove('open'); confirmDeleteList(list); });
  const searchInput = document.getElementById('local-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderFoodList(list, searchInput.value));
  }

  if (itemsErr) {
    document.getElementById('food-list-container').innerHTML = `<div class="empty-state"><span class="emoji">😵</span><h3>Couldn't load items</h3><p>${escapeHtml(itemsErr.message)}</p></div>`;
    return;
  }

  renderFoodList(list, '');
}

function renderFoodList(list, filter) {
  const container = document.getElementById('food-list-container');
  const term = (filter || '').trim().toLowerCase();
  const filtered = term ? currentListItems.filter((i) => i.name.toLowerCase().includes(term)) : currentListItems;

  if (currentListItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="emoji">🍽️</span>
        <h3>Nothing ranked yet</h3>
        <p>Tap + to add the first food to ${escapeHtml(list.name)}.</p>
      </div>`;
    return;
  }
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="emoji">🔎</span><p>No matches for "${escapeHtml(filter)}"</p></div>`;
    return;
  }

  container.innerHTML = `<ul class="food-list" id="food-list">${filtered.map((item) => foodCardHtml(item, currentListItems.indexOf(item))).join('')}</ul>`;

  container.querySelectorAll('.food-card').forEach((card) => {
    const id = card.dataset.id;
    card.addEventListener('click', () => {
      if (isDragging) return;
      const item = currentListItems.find((i) => i.id === id);
      openEditFoodModal(list, item);
    });
  });

  // Drag-to-reorder only makes sense on the full, unfiltered list — dragging
  // within a filtered subset would produce a confusing/incorrect rank.
  if (!term) {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(document.getElementById('food-list'), {
      // No dedicated drag handle anymore — the whole card is draggable. A
      // short delay (both mouse and touch) is what lets a quick tap still
      // open the edit modal while a press-and-hold starts a drag instead.
      delay: 150,
      delayOnTouchOnly: false,
      touchStartThreshold: 6,
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onStart: () => { isDragging = true; },
      onEnd: () => {
        handleReorder(list);
        // Keep the flag set a little past drag-end so the click that fires
        // right after the drop doesn't reopen the item as an "edit".
        setTimeout(() => { isDragging = false; }, 150);
      },
    });
  }
}

const MEDAL_ICON = '<i class="fa-solid fa-medal"></i>';
function medalFor(rankPosition) {
  if (rankPosition === 0) return { badge: MEDAL_ICON, cls: 'r1' };
  if (rankPosition === 1) return { badge: MEDAL_ICON, cls: 'r2' };
  if (rankPosition === 2) return { badge: MEDAL_ICON, cls: 'r3' };
  return { badge: `#${rankPosition + 1}`, cls: '' };
}

// The higher the rank, the bigger the card — top 3 get their own size,
// everyone else shares a smaller "regular" tile so long lists stay usable.
function tierClass(rankPosition) {
  if (rankPosition === 0) return 'food-card--gold';
  if (rankPosition === 1) return 'food-card--silver';
  if (rankPosition === 2) return 'food-card--bronze';
  return 'food-card--regular';
}

function foodCardHtml(item, position) {
  const medal = medalFor(position);
  const tier = tierClass(position);
  const hasPhoto = !!item.photoUrl;
  const subParts = [];
  if (item.price !== null && item.price !== undefined && item.price !== '') subParts.push(`<span>💰 ${escapeHtml(String(item.price))}</span>`);
  return `
    <li class="food-card ${tier}${hasPhoto ? ' has-photo' : ''}" data-id="${item.id}">
      ${hasPhoto
        ? `<img class="food-card-photo" src="${escapeAttr(item.photoUrl)}" alt="">`
        : `<span class="food-card-photo-empty">🍴</span>`}
      <div class="food-card-badge ${medal.cls}">${medal.badge}</div>
      <div class="food-card-scrim">
        <div class="food-card-name">${escapeHtml(item.name)}</div>
        ${subParts.length ? `<div class="food-card-sub">${subParts.join('')}</div>` : ''}
        ${item.notes ? `<div class="food-card-notes">${escapeHtml(item.notes)}</div>` : ''}
      </div>
    </li>`;
}

async function handleReorder(list) {
  const container = document.getElementById('food-list');
  const newOrderIds = Array.from(container.querySelectorAll('.food-card')).map((el) => el.dataset.id);
  const byId = new Map(currentListItems.map((i) => [i.id, i]));
  currentListItems = newOrderIds.map((id) => byId.get(id));

  // Renumber everyone in the new order. Simple, always-correct, and at
  // personal-collection scale (a handful to a few dozen items) the extra
  // writes are trivial — no fragile fractional-index math to worry about.
  const RANK_STEP = 1024;
  currentListItems.forEach((item, idx) => { item.rank = (idx + 1) * RANK_STEP; });
  renderFoodList(list, '');

  const { error } = await updateFoodItemRanks(currentListItems);
  if (error) {
    toast(`Couldn't save the new order — ${error.message}`);
  } else {
    toast(randomOf(REORDER_TOASTS));
  }
}

/* -------------------------------- modal ---------------------------------- */

function openModal(innerHtml, onMount) {
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal" role="dialog" aria-modal="true">${innerHtml}</div>
    </div>`;
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  if (onMount) onMount(modalRoot.querySelector('.modal'));
}

function closeModal() {
  modalRoot.innerHTML = '';
}

let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
}

/* --------------------------- add / edit list ------------------------------ */

function openAddListModal() { renderListFormModal({ mode: 'create' }); }
function openEditListModal(list) { renderListFormModal({ mode: 'edit', list }); }

function renderListFormModal({ mode, list }) {
  const isEdit = mode === 'edit';
  const storeVal = list?.store || '';
  const nameVal = list?.name || '';
  const categoryVal = list?.category || '';
  const emojiVal = list?.emoji || EMOJI_PRESETS[0];

  const html = `
    <h2>${isEdit ? escapeHtml(list.name) : 'New ranking list'}</h2>
    ${isEdit ? '' : `<p class="modal-subtitle">e.g. "FamilyMart Onigiri" or "7-Eleven Desserts"</p>`}
    <div class="field">
      <label for="f-name">List name *</label>
      <input id="f-name" type="text" value="${escapeAttr(nameVal)}" placeholder="FamilyMart Onigiri" maxlength="80">
    </div>
    <div class="field">
      <label for="f-store">Store</label>
      <input id="f-store" type="text" list="store-presets" value="${escapeAttr(storeVal)}" placeholder="FamilyMart">
      <datalist id="store-presets">${STORE_PRESETS.map((s) => `<option value="${escapeAttr(s)}">`).join('')}</datalist>
    </div>
    <div class="field">
      <label for="f-category">Category</label>
      <input id="f-category" type="text" value="${escapeAttr(categoryVal)}" placeholder="Onigiri">
    </div>
    <div class="field">
      <label>Icon</label>
      <div class="icon-editor">
        <div class="icon-editor-preview" id="icon-editor-preview">${
          list?.iconUrl ? `<img src="${escapeAttr(list.iconUrl)}" alt="">` : escapeHtml(emojiVal)
        }</div>
        <div class="icon-editor-options">
          <div class="emoji-picker" id="emoji-picker">
            ${EMOJI_PRESETS.map((e) => `<button type="button" class="emoji-choice${(!list?.iconUrl && e === emojiVal) ? ' selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
          </div>
          <div class="icon-upload-actions">
            <label class="file-btn">
              <i class="fa-solid fa-image"></i> Gallery
              <input id="f-list-icon" type="file" accept="image/*" style="display:none">
            </label>
            <label class="file-btn">
              <i class="fa-solid fa-camera"></i> Camera
              <input id="f-list-icon-camera" type="file" accept="image/*" capture="environment" style="display:none">
            </label>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="cancel-btn" type="button">Cancel</button>
      <button class="btn btn-primary" id="save-btn" type="button">${isEdit ? 'Save' : 'Create list'}</button>
    </div>
  `;

  openModal(html, (modalEl) => {
    let selectedEmoji = emojiVal;
    let pendingIconFile = null;
    let existingIconUrl = list?.iconUrl || null;
    let iconCleared = false; // true once the user actively picks an emoji, dropping any photo

    const iconPreview = modalEl.querySelector('#icon-editor-preview');

    modalEl.querySelectorAll('.emoji-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedEmoji = btn.dataset.emoji;
        pendingIconFile = null;
        iconCleared = true;
        modalEl.querySelectorAll('.emoji-choice').forEach((b) => b.classList.toggle('selected', b === btn));
        iconPreview.textContent = selectedEmoji;
      });
    });

    const iconFileInput = modalEl.querySelector('#f-list-icon');
    const iconCameraInput = modalEl.querySelector('#f-list-icon-camera');
    const handleIconFile = (file) => {
      if (!file) return;
      pendingIconFile = file;
      iconCleared = false;
      modalEl.querySelectorAll('.emoji-choice').forEach((b) => b.classList.remove('selected'));
      const reader = new FileReader();
      reader.onload = () => {
        iconPreview.innerHTML = `<img src="${reader.result}" alt="">`;
      };
      reader.readAsDataURL(file);
    };
    iconFileInput.addEventListener('change', () => handleIconFile(iconFileInput.files[0]));
    iconCameraInput.addEventListener('change', () => handleIconFile(iconCameraInput.files[0]));

    modalEl.querySelector('#cancel-btn').addEventListener('click', closeModal);
    modalEl.querySelector('#save-btn').addEventListener('click', async () => {
      const name = modalEl.querySelector('#f-name').value.trim();
      if (!name) { toast('Give the list a name first 🍙'); return; }
      const store = modalEl.querySelector('#f-store').value.trim();
      const category = modalEl.querySelector('#f-category').value.trim();
      const saveBtn = modalEl.querySelector('#save-btn');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';

      let iconUrl = existingIconUrl;
      if (pendingIconFile) {
        saveBtn.textContent = 'Uploading icon…';
        try {
          iconUrl = await uploadListIcon(pendingIconFile);
        } catch (err) {
          saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Save' : 'Create list';
          toast(`Icon upload failed — ${err.message}`);
          return;
        }
      } else if (iconCleared) {
        iconUrl = null;
      }
      saveBtn.textContent = 'Saving…';

      const payload = { name, store: store || null, category: category || null, emoji: selectedEmoji, iconUrl };

      if (isEdit) {
        const { error } = await updateListDoc(list.id, payload);
        if (error) {
          saveBtn.disabled = false; saveBtn.textContent = 'Save';
          toast(`Couldn't save — ${error.message}`);
          return;
        }
        closeModal();
        toast('Updated ✨');
        render();
      } else {
        const { data, error } = await insertList(payload);
        if (error) {
          saveBtn.disabled = false; saveBtn.textContent = 'Create list';
          toast(`Couldn't save — ${error.message}`);
          return;
        }
        closeModal();
        toast(randomOf(ADD_LIST_TOASTS));
        location.hash = `#/list/${data.id}`;
      }
    });
  });
}

function confirmDeleteList(list) {
  openModal(`
    <h2>Delete "${escapeHtml(list.name)}"?</h2>
    <p class="modal-subtitle">This removes all ${currentListItems.length} item${currentListItems.length === 1 ? '' : 's'} in it too. This can't be undone.</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="cancel-btn" type="button">Cancel</button>
      <button class="btn btn-danger" id="confirm-btn" type="button">Delete</button>
    </div>
  `, (modalEl) => {
    modalEl.querySelector('#cancel-btn').addEventListener('click', closeModal);
    modalEl.querySelector('#confirm-btn').addEventListener('click', async () => {
      const { error } = await deleteListCascade(list.id);
      closeModal();
      if (error) { toast(`Couldn't delete — ${error.message}`); return; }
      toast('List deleted');
      location.hash = '#/';
    });
  });
}

/* --------------------------- add / edit food ------------------------------ */

function openAddFoodModal(listId) { renderFoodFormModal({ mode: 'create', listId }); }
function openEditFoodModal(list, item) { renderFoodFormModal({ mode: 'edit', listId: list.id, item }); }

function renderFoodFormModal({ mode, listId, item }) {
  const isEdit = mode === 'edit';
  const nameVal = item?.name || '';
  const priceVal = item?.price ?? '';
  const notesVal = item?.notes || '';
  const photoVal = item?.photoUrl || '';

  const html = `
    <h2>${isEdit ? escapeHtml(item.name) : 'Add food'}</h2>
    ${isEdit ? '' : `<p class="modal-subtitle">The essentials only — you can add more later.</p>`}
    <div class="field">
      <label for="f-food-name">Name *</label>
      <input id="f-food-name" type="text" value="${escapeAttr(nameVal)}" placeholder="Egg Mayo Onigiri" maxlength="100">
    </div>
    <div class="field">
      <label>Photo</label>
      <div class="photo-field">
        <div class="photo-preview" id="photo-preview">${photoVal ? `<img src="${escapeAttr(photoVal)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : '🍴'}</div>
        <div class="photo-field-actions">
          <label class="file-btn">
            <i class="fa-solid fa-image"></i> Gallery
            <input id="f-food-photo" type="file" accept="image/*" style="display:none">
          </label>
          <label class="file-btn">
            <i class="fa-solid fa-camera"></i> Camera
            <input id="f-food-photo-camera" type="file" accept="image/*" capture="environment" style="display:none">
          </label>
        </div>
      </div>
    </div>
    <div class="field">
      <label for="f-food-price">Price</label>
      <input id="f-food-price" type="number" step="0.01" min="0" value="${escapeAttr(priceVal)}" placeholder="e.g. 5.90">
    </div>
    <div class="field">
      <label for="f-food-notes">Notes</label>
      <textarea id="f-food-notes" placeholder="How was it? 😋" maxlength="300">${escapeHtml(notesVal)}</textarea>
    </div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="delete-food-btn" type="button">Delete</button>` : `<button class="btn btn-secondary" id="cancel-btn" type="button">Cancel</button>`}
      <button class="btn btn-primary" id="save-food-btn" type="button">${isEdit ? 'Save' : 'Add'}</button>
    </div>
  `;

  openModal(html, (modalEl) => {
    let pendingFile = null;
    const fileInput = modalEl.querySelector('#f-food-photo');
    const cameraInput = modalEl.querySelector('#f-food-photo-camera');
    const preview = modalEl.querySelector('#photo-preview');
    const handlePhotoFile = (file) => {
      if (!file) return;
      pendingFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        preview.innerHTML = `<img src="${reader.result}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
      };
      reader.readAsDataURL(file);
    };
    fileInput.addEventListener('change', () => handlePhotoFile(fileInput.files[0]));
    cameraInput.addEventListener('change', () => handlePhotoFile(cameraInput.files[0]));

    if (isEdit) {
      modalEl.querySelector('#delete-food-btn').addEventListener('click', () => confirmDeleteFood(listId, item));
    } else {
      modalEl.querySelector('#cancel-btn').addEventListener('click', closeModal);
    }

    modalEl.querySelector('#save-food-btn').addEventListener('click', async () => {
      const name = modalEl.querySelector('#f-food-name').value.trim();
      if (!name) { toast('Give it a name first 🍙'); return; }
      const priceRaw = modalEl.querySelector('#f-food-price').value;
      const price = priceRaw === '' ? null : Number(priceRaw);
      const notes = modalEl.querySelector('#f-food-notes').value.trim();

      const saveBtn = modalEl.querySelector('#save-food-btn');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';

      let photoUrl = photoVal || null;
      if (pendingFile) {
        saveBtn.textContent = 'Uploading photo…';
        try {
          photoUrl = await uploadFoodPhoto(pendingFile);
        } catch (err) {
          saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Save' : 'Add';
          toast(`Photo upload failed — ${err.message}`);
          return;
        }
      }

      saveBtn.textContent = 'Saving…';
      if (isEdit) {
        const { error } = await updateFoodItemDoc(item.id, { name, price, notes: notes || null, photoUrl });
        if (error) {
          saveBtn.disabled = false; saveBtn.textContent = 'Save';
          toast(`Couldn't save — ${error.message}`);
          return;
        }
        closeModal();
        toast('Updated ✨');
        render();
      } else {
        const maxRank = currentListItems.length ? Math.max(...currentListItems.map((i) => i.rank)) : 0;
        const { error } = await insertFoodItem({
          listId, name, price, notes: notes || null, photoUrl,
          rank: maxRank + 1024,
        });
        if (error) {
          saveBtn.disabled = false; saveBtn.textContent = 'Add';
          toast(`Couldn't save — ${error.message}`);
          return;
        }
        closeModal();
        toast(randomOf(ADD_FOOD_TOASTS));
        render();
      }
    });
  });
}

function confirmDeleteFood(listId, item) {
  openModal(`
    <h2>Delete "${escapeHtml(item.name)}"?</h2>
    <p class="modal-subtitle">This can't be undone.</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="cancel-btn" type="button">Cancel</button>
      <button class="btn btn-danger" id="confirm-btn" type="button">Delete</button>
    </div>
  `, (modalEl) => {
    modalEl.querySelector('#cancel-btn').addEventListener('click', () => renderFoodFormModal({ mode: 'edit', listId, item }));
    modalEl.querySelector('#confirm-btn').addEventListener('click', async () => {
      const { error } = await deleteFoodItemDoc(item.id);
      closeModal();
      if (error) { toast(`Couldn't delete — ${error.message}`); return; }
      toast('Removed');
      render();
    });
  });
}

/* ------------------------------ photo upload ------------------------------- */

function resizeImage(file, maxDim = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => { img.src = reader.result; };
    img.onerror = () => reject(new Error('Could not read image'));
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else { width = Math.round(width * (maxDim / height)); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Could not process image')); return; }
        resolve(blob);
      }, 'image/jpeg', quality);
    };
    reader.readAsDataURL(file);
  });
}

async function uploadFoodPhoto(file) {
  const blob = await resizeImage(file);
  const path = `food-photos/${crypto.randomUUID()}.jpg`;
  return uploadImage(path, blob, 'image/jpeg');
}

// Small square icons don't need the full 900px food-photo size — a
// smaller source keeps storage tiny while still looking sharp at the
// ~40-64px this renders at.
async function uploadListIcon(file) {
  const blob = await resizeImage(file, 240, 0.85);
  const path = `icons/${crypto.randomUUID()}.jpg`;
  return uploadImage(path, blob, 'image/jpeg');
}

// Delegated so it keeps working across every list-detail render without
// piling up a fresh listener per visit.
document.addEventListener('click', (e) => {
  if (e.target.closest('.list-menu')) return;
  const openActions = document.querySelector('.list-menu-actions.open');
  if (openActions) {
    openActions.classList.remove('open');
    const btn = openActions.parentElement?.querySelector('#list-menu-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
});
