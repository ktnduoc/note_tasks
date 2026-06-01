// ===== API Base =====
const API = '/api';

// ===== Auth State =====
let currentUser = null;
let authToken = null;

// ===== State =====
let categories = [];
let tasks = [];
let selectedCategoryId = null;

// ===== Helpers =====
function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateInput(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toISOString().split('T')[0];
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

// ===== Auth Functions =====
function getAuthHeaders() {
  if (authToken) {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
  }
  return { 'Content-Type': 'application/json' };
}

function saveAuth(token, user) {
  authToken = token;
  currentUser = user;
  localStorage.setItem('authToken', token);
  localStorage.setItem('currentUser', JSON.stringify(user));
  updateAuthUI();
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  updateAuthUI();
}

function loadAuth() {
  const token = localStorage.getItem('authToken');
  const userStr = localStorage.getItem('currentUser');
  if (token && userStr) {
    authToken = token;
    currentUser = JSON.parse(userStr);
    verifyToken();
  }
  updateAuthUI();
}

async function verifyToken() {
  try {
    const res = await fetch(`${API}/auth/verify`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const json = await res.json();
    if (!json.success) {
      clearAuth();
    } else {
      currentUser = json.data.user;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      updateAuthUI();
    }
  } catch (err) {
    clearAuth();
  }
}

function updateAuthUI() {
  const authBar = document.getElementById('authBar');
  const authUsername = document.getElementById('authUsername');
  const authRole = document.getElementById('authRole');
  const viewerNotice = document.getElementById('viewerNotice');
  const app = document.querySelector('.app');

  if (currentUser) {
    authBar.style.display = 'flex';
    authUsername.textContent = currentUser.username;
    authRole.textContent = currentUser.role;
    app.classList.add('authenticated');

    if (currentUser.role === 'viewer') {
      viewerNotice.style.display = 'block';
    } else {
      viewerNotice.style.display = 'none';
    }
  } else {
    authBar.style.display = 'none';
    app.classList.remove('authenticated');
    viewerNotice.style.display = 'none';
  }

  // Update chatbot auth state
  if (window.updateChatbotAuth) {
    window.updateChatbotAuth(currentUser, authToken);
  }
}

function canWrite() {
  return currentUser && currentUser.role !== 'viewer';
}

function showAuthModal(mode = 'login') {
  const modal = document.getElementById('authModal');
  const title = document.getElementById('authModalTitle');
  const subtitle = document.getElementById('authModalSubtitle');
  const submitBtn = document.getElementById('authSubmitBtn');
  const switchText = document.getElementById('authSwitchText');
  const switchLink = document.getElementById('authSwitchLink');
  const emailGroup = document.getElementById('authEmailGroup');
  const usernameGroup = document.getElementById('authUsernameGroup');
  const usernameLabel = usernameGroup.querySelector('.auth-form-label');

  // Chỉ có login mode
  title.textContent = 'Đăng nhập';
  subtitle.textContent = 'Đăng nhập để quản lý task của bạn';
  submitBtn.textContent = 'Đăng nhập';
  emailGroup.style.display = 'none';
  usernameLabel.textContent = 'Username hoặc Email';

  // Ẩn link chuyển đổi
  switchText.style.display = 'none';
  switchLink.style.display = 'none';

  modal.classList.add('active');
  modal.dataset.mode = 'login';
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.remove('active');
  document.getElementById('authForm').reset();
  document.getElementById('authError').style.display = 'none';
}

async function handleAuth(e) {
  e.preventDefault();
  const username = document.getElementById('authUsernameInput').value.trim();
  const password = document.getElementById('authPasswordInput').value;
  const errorDiv = document.getElementById('authError');
  const submitBtn = document.getElementById('authSubmitBtn');

  errorDiv.style.display = 'none';
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const json = await res.json();

    if (!json.success) {
      errorDiv.textContent = json.message;
      errorDiv.style.display = 'block';
      submitBtn.disabled = false;
      return;
    }

    saveAuth(json.data.token, json.data.user);
    hideAuthModal();
    showToast('Đăng nhập thành công!');
    await loadAll();
  } catch (err) {
    errorDiv.textContent = 'Có lỗi xảy ra. Vui lòng thử lại.';
    errorDiv.style.display = 'block';
    submitBtn.disabled = false;
  }
}

function handleLogout() {
  clearAuth();
  showToast('Đã đăng xuất');
  loadAll();
}

// ===== API Calls =====
async function fetchCategories(date = '') {
  try {
    let url = `${API}/categories`;
    if (date) url += `?date=${date}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    const json = await res.json();
    if (json.success) {
      categories = json.data;
      window._categories = json.data;
    }
    return categories;
  } catch (err) {
    console.error('Lỗi fetch categories:', err);
  }
}

async function fetchTasks(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.date) params.set('date', filters.date);
    if (filters.category) params.set('category', filters.category);
    if (filters.completed !== undefined && filters.completed !== '') params.set('completed', filters.completed);
    if (filters.search) params.set('search', filters.search);

    const url = `${API}/tasks?${params.toString()}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    const json = await res.json();
    if (json.success) { tasks = json.data; window._tasks = json.data; }
    return tasks;
  } catch (err) {
    console.error('Lỗi fetch tasks:', err);
  }
}

async function createCategory(data) {
  if (!canWrite()) {
    showToast('Bạn không có quyền thực hiện thao tác này', 'error');
    throw new Error('Không có quyền');
  }
  const res = await fetch(`${API}/categories`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

async function deleteCategory(id) {
  if (!canWrite()) {
    showToast('Bạn không có quyền thực hiện thao tác này', 'error');
    throw new Error('Không có quyền');
  }
  const res = await fetch(`${API}/categories/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json;
}

async function updateCategory(id, data) {
  if (!canWrite()) {
    showToast('Bạn không có quyền thực hiện thao tác này', 'error');
    throw new Error('Không có quyền');
  }
  const res = await fetch(`${API}/categories/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

async function createTask(data) {
  if (!canWrite()) {
    showToast('Bạn không có quyền thực hiện thao tác này', 'error');
    throw new Error('Không có quyền');
  }
  const res = await fetch(`${API}/tasks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

async function updateTask(id, data) {
  if (!canWrite()) {
    showToast('Bạn không có quyền thực hiện thao tác này', 'error');
    throw new Error('Không có quyền');
  }
  const res = await fetch(`${API}/tasks/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

async function deleteTask(id) {
  if (!canWrite()) {
    showToast('Bạn không có quyền thực hiện thao tác này', 'error');
    throw new Error('Không có quyền');
  }
  const res = await fetch(`${API}/tasks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json;
}

// ===== Render =====
function renderCategories() {
  const catSelect = document.getElementById('quickCategory');
  const filterCat = document.getElementById('filterCategory');
  const delBtn = document.getElementById('btnDelCategory');

  const prevQuickVal = catSelect?.value;
  const prevFilterVal = filterCat?.value;

  const opts = categories.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
  if (catSelect) {
    catSelect.innerHTML = `<option value="">-- Chọn danh mục --</option>${opts}`;
    if (prevQuickVal) catSelect.value = prevQuickVal;
  }
  filterCat.innerHTML = `<option value="">Tất cả danh mục</option>${opts}`;
  if (prevFilterVal) filterCat.value = prevFilterVal;

  if (delBtn) {
    delBtn.style.display = (selectedCategoryId && canWrite()) ? '' : 'none';
  }
}

function renderTasks() {
  renderBoard();
}

// ===== Kanban Board =====
function statusFromProgress(progress) {
  const p = Number(progress) || 0;
  if (p >= 100) return 'done';
  if (p > 0) return 'doing';
  return 'todo';
}

function progressFromStatus(status, currentProgress) {
  if (status === 'done') return 100;
  if (status === 'todo') return 0;
  const p = Number(currentProgress) || 0;
  return (p > 0 && p < 100) ? p : 50;
}

function stripHtmlPlain(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function isHtmlContent(str) {
  return typeof str === 'string' && /<\/?[a-z][\s\S]*>/i.test(str);
}

function renderBoard() {
  const lists = {
    todo: document.querySelector('.kanban-list[data-status="todo"]'),
    doing: document.querySelector('.kanban-list[data-status="doing"]'),
    done: document.querySelector('.kanban-list[data-status="done"]'),
  };
  if (!lists.todo) return;

  const buckets = { todo: [], doing: [], done: [] };
  tasks.forEach(t => {
    const s = statusFromProgress(t.progress);
    buckets[s].push(t);
  });

  Object.keys(lists).forEach(s => {
    lists[s].innerHTML = buckets[s].length
      ? buckets[s].map(t => stickyNoteHtml(t)).join('')
      : `<div class="kanban-empty">Kéo task vào đây</div>`;
  });

  document.getElementById('countTodo').textContent = buckets.todo.length;
  document.getElementById('countDoing').textContent = buckets.doing.length;
  document.getElementById('countDone').textContent = buckets.done.length;

  bindStickyEvents();
}

function stickyNoteHtml(t) {
  const catColor = t.category?.color || '#6366f1';
  const catName = escapeHtml(t.category?.name || 'Không có');
  const prio = t.priority || 'medium';
  const draggable = canWrite() ? 'draggable="true"' : '';
  const isDone = (t.progress || 0) >= 100 || t.completed;

  // Màu sticky note: ưu tiên task.color, fallback theo priority
  let bgColor = t.color || '';
  if (!bgColor) {
    if (prio === 'high') bgColor = '#fee2e2';
    else if (prio === 'low') bgColor = '#dcfce7';
    else bgColor = '#fef9c3';
  }

  let bodyHtml = '';
  if (t.description) {
    if (isHtmlContent(t.description)) {
      bodyHtml = `<div class="sticky-body">${t.description}</div>`;
    } else {
      bodyHtml = `<div class="sticky-body">${escapeHtml(t.description).replace(/\n/g, '<br>')}</div>`;
    }
  }

  const dueLabel = t.dueDate ? formatDate(t.dueDate) : '';
  const overdueClass = (t.dueDate && isOverdue(t.dueDate) && !isDone) ? 'overdue' : '';
  const dueHtml = dueLabel
    ? `<span class="sticky-due ${overdueClass}">📅 ${dueLabel}</span>`
    : '<span class="sticky-due"></span>';

  const progress = Number(t.progress) || 0;

  return `
    <article class="sticky-note ${isDone ? 'is-done' : ''}"
             style="--note-accent:${catColor};background:${bgColor}"
             data-id="${t._id}"
             ${draggable}>
      <div class="sticky-header">
        <div class="sticky-title">${escapeHtml(t.name)}</div>
        <span class="sticky-cat" style="background:${catColor}20;color:${catColor}">${catName}</span>
      </div>
      ${bodyHtml}
      <div class="sticky-progress-wrap"><div class="sticky-progress-fill" style="width:${progress}%"></div></div>
      <div class="sticky-footer">
        <span class="sticky-prio-badge ${prio}" title="Ưu tiên ${prio}"></span>
        ${dueHtml}
        <span>${progress}%</span>
      </div>
    </article>`;
}

let dragTaskId = null;

function bindStickyEvents() {
  document.querySelectorAll('.sticky-note').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (id) viewTaskDetail(id);
    });
    el.addEventListener('dragstart', (e) => {
      dragTaskId = el.dataset.id;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragTaskId); } catch (_) {}
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      dragTaskId = null;
      document.querySelectorAll('.kanban-column.drag-over').forEach(c => c.classList.remove('drag-over'));
    });
  });

  document.querySelectorAll('.kanban-column').forEach(col => {
    col.addEventListener('dragover', (e) => {
      if (!dragTaskId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', (e) => {
      if (e.target === col) col.classList.remove('drag-over');
    });
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id = dragTaskId;
      if (!id) return;
      const newStatus = col.dataset.status;
      const task = tasks.find(t => t._id === id);
      if (!task) return;
      const currentStatus = statusFromProgress(task.progress);
      if (currentStatus === newStatus) return;
      if (!canWrite()) {
        showToast('Bạn không có quyền chuyển task', 'error');
        return;
      }
      const newProgress = progressFromStatus(newStatus, task.progress);

      // Optimistic UI: di chuyển ngay sang cột mới + spinner cho biết đang đồng bộ
      const cardEl = document.querySelector(`.sticky-note[data-id="${id}"]`);
      const targetList = col.querySelector('.kanban-list');
      if (cardEl && targetList) {
        const emptyEl = targetList.querySelector('.kanban-empty');
        if (emptyEl) emptyEl.remove();
        targetList.appendChild(cardEl);
        cardEl.classList.add('is-syncing');
        cardEl.setAttribute('draggable', 'false');
        if (!cardEl.querySelector('.sticky-loading')) {
          const sp = document.createElement('div');
          sp.className = 'sticky-loading';
          sp.innerHTML = '<div class="sticky-spinner"></div>';
          cardEl.appendChild(sp);
        }
      }
      col.classList.add('is-syncing');

      try {
        await updateTask(id, { progress: newProgress, completed: newProgress >= 100 });
        await loadAll();
        showToast('Đã chuyển task');
      } catch (err) {
        showToast(err.message, 'error');
        await loadAll();
      } finally {
        col.classList.remove('is-syncing');
      }
    });
  });

  document.querySelectorAll('.kanban-add-btn').forEach(btn => {
    btn.onclick = () => {
      const status = btn.dataset.status;
      openAddTaskModal({ initialStatus: status });
    };
  });
}

// ===== Copy Task ID =====
function copyTaskId(id) {
  navigator.clipboard.writeText(id).then(() => {
    showToast('Đã copy mã task!');
  }).catch(() => {
    // Fallback
    const el = document.createElement('textarea');
    el.value = id;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('Đã copy mã task!');
  });
}

// ===== Task Detail Modal =====
async function viewTaskDetail(id) {
  // Luôn fetch lại từ server để có data mới nhất
  let task = null;
  try {
    const res = await fetch(`${API}/tasks/${id}`, { headers: getAuthHeaders() });
    const json = await res.json();
    if (json.success) task = json.data;
  } catch (e) { /* fallback */ }
  if (!task) task = tasks.find(t => t._id === id);
  if (!task) return;

  const modal = document.getElementById('taskModal');
  const name = document.getElementById('taskModalName');
  const category = document.getElementById('taskModalCategory');
  const status = document.getElementById('taskModalStatus');
  const description = document.getElementById('taskModalDescription');
  const descSection = document.getElementById('taskModalDescSection');
  const progressBar = document.getElementById('taskModalProgressBar');
  const progressText = document.getElementById('taskModalProgressText');
  const createdDate = document.getElementById('taskModalCreatedDate');
  const dueDate = document.getElementById('taskModalDueDate');
  const dueDateItem = document.getElementById('taskModalDueDateItem');
  const editBtn = document.getElementById('taskModalEdit');

  name.textContent = task.name;

  if (task.description) {
    if (isHtmlContent(task.description)) {
      description.innerHTML = task.description;
      description.classList.add('rich-content');
    } else {
      description.textContent = task.description;
      description.classList.remove('rich-content');
    }
    descSection.style.display = 'block';
  } else {
    description.innerHTML = '<span class="task-empty-description">Chưa có mô tả chi tiết</span>';
    description.classList.remove('rich-content');
    descSection.style.display = 'block';
  }

  const catDot = category.querySelector('.task-category-dot');
  const catText = category.querySelector('span:last-child');
  catDot.style.background = task.category?.color || '#6366f1';
  catText.textContent = task.category?.name || 'Không có';

  if (task.completed) {
    status.className = 'task-status-badge completed';
    status.textContent = '✓ Đã hoàn thành';
  } else {
    status.className = 'task-status-badge pending';
    status.textContent = '⏳ Đang thực hiện';
  }

  const progress = task.progress || 0;
  progressBar.style.width = `${progress}%`;
  progressText.textContent = `${progress}%`;

  createdDate.textContent = formatDate(task.date);

  if (task.dueDate) {
    dueDate.textContent = formatDate(task.dueDate);
    if (isOverdue(task.dueDate) && !task.completed) {
      dueDateItem.classList.add('overdue');
    } else {
      dueDateItem.classList.remove('overdue');
    }
  } else {
    dueDate.textContent = 'Chưa đặt';
    dueDateItem.classList.remove('overdue');
  }

  if (canWrite()) {
    editBtn.style.display = 'inline-block';
    editBtn.onclick = () => {
      modal.classList.remove('active');
      openEditModal(id);
    };
  } else {
    editBtn.style.display = 'none';
  }

  modal.classList.add('active');
}

// ===== Edit Task Modal =====
let editingTaskId = null;
let editQuill = null;
let addQuill = null;

const QUILL_TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  [{ font: [] }, { size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
  [{ align: [] }],
  ['blockquote', 'code-block', 'link'],
  ['clean']
];

function ensureEditQuill() {
  if (editQuill || typeof Quill === 'undefined') return editQuill;
  const el = document.getElementById('editTaskDescEditor');
  if (!el) return null;
  editQuill = new Quill(el, {
    theme: 'snow',
    placeholder: 'Nhập mô tả chi tiết...',
    modules: { toolbar: QUILL_TOOLBAR }
  });
  return editQuill;
}

function ensureAddQuill() {
  if (addQuill || typeof Quill === 'undefined') return addQuill;
  const el = document.getElementById('addTaskDescEditor');
  if (!el) return null;
  addQuill = new Quill(el, {
    theme: 'snow',
    placeholder: 'Nhập mô tả chi tiết...',
    modules: { toolbar: QUILL_TOOLBAR }
  });
  return addQuill;
}

function quillIsEmpty(q) {
  if (!q) return true;
  const text = q.getText().trim();
  return text === '';
}

function openEditModal(id) {
  if (!canWrite()) {
    showToast('Bạn cần đăng nhập để sửa task', 'error');
    showAuthModal('login');
    return;
  }
  const task = tasks.find(t => t._id === id);
  if (!task) return;

  editingTaskId = id;
  document.getElementById('editTaskName').value = task.name;
  const q = ensureEditQuill();
  if (q) {
    if (task.description && isHtmlContent(task.description)) {
      q.root.innerHTML = task.description;
    } else {
      q.setText(task.description || '');
    }
  }
  const taskColor = task.color || '';
  document.getElementById('editTaskColorValue').value = taskColor;
  syncTaskColorSwatches('edit', taskColor);
  document.getElementById('editTaskProgress').value = task.progress || 0;
  document.getElementById('editProgressLabel').textContent = task.progress || 0;
  document.getElementById('editTaskDueDate').value = task.dueDate ? formatDateInput(task.dueDate) : '';
  document.getElementById('editTaskModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editTaskModal').classList.remove('active');
  editingTaskId = null;
}

function openAddTaskModal(opts = {}) {
  if (!canWrite()) {
    showToast('Bạn cần đăng nhập để tạo task', 'error');
    showAuthModal('login');
    return;
  }
  document.getElementById('addTaskDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('addTaskName').value = '';
  const q = ensureAddQuill();
  if (q) q.setText('');
  document.getElementById('addTaskPriority').value = 'medium';
  document.getElementById('addTaskColorValue').value = '';
  syncTaskColorSwatches('add', '');

  let initialProgress = 0;
  if (opts.initialStatus === 'doing') initialProgress = 50;
  else if (opts.initialStatus === 'done') initialProgress = 100;
  document.getElementById('addTaskProgress').value = initialProgress;
  document.getElementById('addProgressLabel').textContent = initialProgress;
  document.getElementById('addTaskDueDate').value = '';
  // Đổ danh sách danh mục
  const catSelect = document.getElementById('addTaskCategory');
  catSelect.innerHTML = (categories || []).map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
  document.getElementById('addTaskModal').classList.add('active');
}
window.openAddTaskModal = openAddTaskModal;

function closeAddModal() {
  document.getElementById('addTaskModal').classList.remove('active');
}

// ===== Category Modal (Add / Edit) =====
let editingCategoryId = null;

function openCategoryModal(mode, categoryId = null) {
  if (!canWrite()) {
    showToast('Bạn cần đăng nhập để quản lý danh mục', 'error');
    showAuthModal('login');
    return;
  }
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('categoryModalTitle');
  const nameInput = document.getElementById('categoryModalName');
  const colorInput = document.getElementById('categoryModalColor');
  const colorHex = document.getElementById('categoryModalColorHex');
  const delBtn = document.getElementById('categoryModalDelete');

  if (mode === 'edit') {
    const cat = categories.find(c => c._id === categoryId);
    if (!cat) {
      showToast('Không tìm thấy danh mục', 'error');
      return;
    }
    editingCategoryId = categoryId;
    title.textContent = 'Sửa danh mục';
    nameInput.value = cat.name || '';
    const color = cat.color || '#6366f1';
    colorInput.value = color;
    colorHex.value = color;
    delBtn.style.display = '';
  } else {
    editingCategoryId = null;
    title.textContent = 'Thêm danh mục';
    nameInput.value = '';
    colorInput.value = '#6366f1';
    colorHex.value = '#6366f1';
    delBtn.style.display = 'none';
  }
  syncCategoryColorPresets(colorInput.value);
  modal.classList.add('active');
  setTimeout(() => nameInput.focus(), 50);
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('active');
  editingCategoryId = null;
}

function syncCategoryColorPresets(activeColor) {
  document.querySelectorAll('.cat-color-preset').forEach(b => {
    b.classList.toggle('active', (b.dataset.color || '').toLowerCase() === (activeColor || '').toLowerCase());
  });
}

function repopulateAddTaskCategorySelect(selectedId) {
  const catSelect = document.getElementById('addTaskCategory');
  if (!catSelect) return;
  catSelect.innerHTML = (categories || []).map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
  if (selectedId) catSelect.value = selectedId;
}

function syncTaskColorSwatches(mode, activeColor) {
  const modal = mode === 'edit' ? 'editTaskModal' : 'addTaskModal';
  document.querySelectorAll(`#${modal} .task-color-swatch`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === activeColor);
  });
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  // Close detail modal
  document.getElementById('taskModalClose').addEventListener('click', () => {
    document.getElementById('taskModal').classList.remove('active');
  });
  document.getElementById('taskModalCloseBtn').addEventListener('click', () => {
    document.getElementById('taskModal').classList.remove('active');
  });
  document.getElementById('taskModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('taskModal')) {
      document.getElementById('taskModal').classList.remove('active');
    }
  });

  // Edit modal events
  document.getElementById('editTaskModalClose').addEventListener('click', closeEditModal);
  document.getElementById('editTaskCancel').addEventListener('click', closeEditModal);
  document.getElementById('editTaskModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('editTaskModal')) closeEditModal();
  });

  document.getElementById('editTaskDelete')?.addEventListener('click', async () => {
    if (!editingTaskId) return;
    if (!canWrite()) {
      showToast('Bạn không có quyền xoá task', 'error');
      return;
    }
    if (!confirm('Xoá task này?')) return;
    try {
      await deleteTask(editingTaskId);
      showToast('Đã xoá task');
      closeEditModal();
      await loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('editTaskSave').addEventListener('click', async () => {
    if (!editingTaskId) return;
    const q = ensureEditQuill();
    const desc = (q && !quillIsEmpty(q)) ? q.root.innerHTML : '';
    const colorValue = document.getElementById('editTaskColorValue').value.trim();
    const updates = {
      name: document.getElementById('editTaskName').value.trim(),
      description: desc,
      color: colorValue || null,
      progress: Math.min(100, Math.max(0, parseInt(document.getElementById('editTaskProgress').value) || 0)),
      dueDate: document.getElementById('editTaskDueDate').value || null,
    };
    updates.completed = updates.progress >= 100;
    if (!updates.name) return showToast('Tên task không được để trống', 'error');
    try {
      await updateTask(editingTaskId, updates);
      showToast('Đã cập nhật task');
      closeEditModal();
      await loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Add modal events
  document.getElementById('addTaskModalClose').addEventListener('click', closeAddModal);
  document.getElementById('addTaskCancel').addEventListener('click', closeAddModal);
  document.getElementById('addTaskModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('addTaskModal')) closeAddModal();
  });
  document.getElementById('addTaskSave').addEventListener('click', async () => {
    const name = document.getElementById('addTaskName').value.trim();
    const q = ensureAddQuill();
    const desc = (q && !quillIsEmpty(q)) ? q.root.innerHTML : '';
    const category = document.getElementById('addTaskCategory').value;
    const priority = document.getElementById('addTaskPriority').value;
    const date = document.getElementById('addTaskDate').value;
    const dueDate = document.getElementById('addTaskDueDate').value;
    const progress = Math.min(100, Math.max(0, parseInt(document.getElementById('addTaskProgress').value) || 0));
    const colorValue = document.getElementById('addTaskColorValue').value.trim();
    if (!name || !category || !date) return showToast('Vui lòng điền tên, danh mục và ngày', 'error');
    try {
      await createTask({ name, description: desc, category, priority, date, dueDate: dueDate || null, progress, completed: progress >= 100, color: colorValue || null });
      showToast('Đã thêm task');
      closeAddModal();
      await loadAll();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Category modal trigger từ icon trong Add Task
  document.getElementById('btnAddCategory')?.addEventListener('click', () => openCategoryModal('create'));
  document.getElementById('btnEditCategory')?.addEventListener('click', () => {
    const id = document.getElementById('addTaskCategory').value;
    if (!id) return showToast('Hãy chọn danh mục cần sửa', 'error');
    openCategoryModal('edit', id);
  });

  // Category modal events
  document.getElementById('categoryModalClose')?.addEventListener('click', closeCategoryModal);
  document.getElementById('categoryModalCancel')?.addEventListener('click', closeCategoryModal);
  document.getElementById('categoryModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('categoryModal')) closeCategoryModal();
  });

  const catColorInput = document.getElementById('categoryModalColor');
  const catColorHex = document.getElementById('categoryModalColorHex');
  catColorInput?.addEventListener('input', (e) => {
    catColorHex.value = e.target.value;
    syncCategoryColorPresets(e.target.value);
  });
  catColorHex?.addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      catColorInput.value = v;
      syncCategoryColorPresets(v);
    }
  });
  document.querySelectorAll('.cat-color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      catColorInput.value = color;
      catColorHex.value = color;
      syncCategoryColorPresets(color);
    });
  });

  document.getElementById('categoryModalSave')?.addEventListener('click', async () => {
    const name = document.getElementById('categoryModalName').value.trim();
    const color = document.getElementById('categoryModalColor').value;
    if (!name) return showToast('Tên danh mục không được trống', 'error');
    try {
      let saved;
      if (editingCategoryId) {
        saved = await updateCategory(editingCategoryId, { name, color });
        showToast('Đã cập nhật danh mục');
      } else {
        saved = await createCategory({ name, color, date: new Date().toISOString() });
        showToast('Đã thêm danh mục');
      }
      const savedId = saved?._id || editingCategoryId;
      closeCategoryModal();
      await fetchCategories();
      renderCategories();
      repopulateAddTaskCategorySelect(savedId);
      renderBoard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('categoryModalDelete')?.addEventListener('click', async () => {
    if (!editingCategoryId) return;
    if (!confirm('Xoá danh mục này? Tất cả task thuộc danh mục cũng sẽ bị xoá.')) return;
    try {
      await deleteCategory(editingCategoryId);
      showToast('Đã xoá danh mục');
      closeCategoryModal();
      await loadAll();
      repopulateAddTaskCategorySelect();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Task color swatch handlers
  document.querySelectorAll('.task-color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      const modal = btn.closest('.task-modal-overlay');
      const isEdit = modal && modal.id === 'editTaskModal';
      const hiddenInput = document.getElementById(isEdit ? 'editTaskColorValue' : 'addTaskColorValue');
      if (hiddenInput) {
        hiddenInput.value = color;
        syncTaskColorSwatches(isEdit ? 'edit' : 'add', color);
      }
    });
  });

  document.getElementById('editTaskColorReset')?.addEventListener('click', () => {
    document.getElementById('editTaskColorValue').value = '';
    syncTaskColorSwatches('edit', '');
    showToast('Sẽ dùng màu mặc định theo priority');
  });

  document.getElementById('addTaskColorReset')?.addEventListener('click', () => {
    document.getElementById('addTaskColorValue').value = '';
    syncTaskColorSwatches('add', '');
    showToast('Sẽ dùng màu mặc định theo priority');
  });

  // Init
  loadAuth();
  document.getElementById('authForm')?.addEventListener('submit', handleAuth);
  document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
  document.getElementById('authTogglePw')?.addEventListener('click', () => {
    const input = document.getElementById('authPasswordInput');
    const eyeOpen = document.querySelector('#authTogglePw .eye-open');
    const eyeClosed = document.querySelector('#authTogglePw .eye-closed');
    if (input.type === 'password') {
      input.type = 'text';
      eyeOpen.style.display = 'none';
      eyeClosed.style.display = 'block';
    } else {
      input.type = 'password';
      eyeOpen.style.display = 'block';
      eyeClosed.style.display = 'none';
    }
  });
  document.getElementById('authModalCloseBtn')?.addEventListener('click', hideAuthModal);

  // Quick add form - removed, use /add in chat instead

  // Filter events
  document.getElementById('filterDate').addEventListener('change', applyFilters);
  document.getElementById('filterCategory').addEventListener('change', (e) => { selectedCategoryId = e.target.value || null; renderCategories(); applyFilters(); });
  document.getElementById('filterStatus').addEventListener('change', applyFilters);
  document.getElementById('filterSearch').addEventListener('input', debounce(applyFilters, 300));
  document.getElementById('btnDelCategory')?.addEventListener('click', () => { if (selectedCategoryId) handleDeleteCategory(selectedCategoryId); });

  await loadAll();
  applyFilters();
});

// ===== Actions =====
function selectCategory(id) {
  selectedCategoryId = id;
  document.getElementById('filterCategory').value = id;
  renderCategories();
  applyFilters();
}

async function handleDeleteCategory(id) {
  if (!canWrite()) {
    showToast('Bạn không có quyền thực hiện thao tác này', 'error');
    return;
  }
  if (!confirm('Xoá danh mục này? Các task thuộc danh mục cũng sẽ bị xoá.')) return;
  try {
    await deleteCategory(id);
    if (selectedCategoryId === id) selectedCategoryId = null;
    showToast('Đã xoá danh mục');
    await loadAll();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleTask(id, completed) {
  if (!canWrite()) {
    showToast('Bạn không có quyền thực hiện thao tác này', 'error');
    return;
  }
  try {
    const progress = completed ? 100 : (tasks.find(t => t._id === id)?.progress || 0);
    await updateTask(id, { completed, progress });
    await loadAll();
  } catch (err) {
    showToast(err.message, 'error');
    await loadAll();
  }
}

async function handleDeleteTask(id) {
  if (!canWrite()) {
    showToast('Bạn không có quyền thực hiện thao tác này', 'error');
    return;
  }
  if (!confirm('Xoá task này?')) return;
  try {
    await deleteTask(id);
    showToast('Đã xoá task');
    await loadAll();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function applyFilters() {
  const date = document.getElementById('filterDate').value;
  const category = document.getElementById('filterCategory').value;
  const completed = document.getElementById('filterStatus').value;
  const search = document.getElementById('filterSearch').value.trim();

  await fetchTasks({ date, category, completed, search });
  renderTasks();
}

async function loadAll() {
  await fetchCategories();
  await fetchTasks();
  renderCategories();
  renderTasks();
}

// ===== Auth Modal Handlers =====
window.showLoginModal = () => showAuthModal('login');
window.getCurrentUser = () => currentUser;
window.getAuthToken = () => authToken;
window.handleLogout = handleLogout;
window.clearAuth = clearAuth;
window.loadAll = loadAll;
