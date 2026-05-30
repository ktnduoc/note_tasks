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
  const container = document.getElementById('taskList');
  if (!tasks.length) {
    container.innerHTML = `<div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg><p>Chưa có task nào</p></div>`;
    return;
  }

  const editIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const trashIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
  const viewIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

  const priorityBadge = {
    high: '<span class="badge badge-high">Cao</span>',
    medium: '<span class="badge badge-medium">Vừa</span>',
    low: '<span class="badge badge-low">Thấp</span>',
  };

  const rows = tasks.map(t => {
    const catName = t.category?.name || '';
    const catColor = t.category?.color || '#6366f1';
    const doneClass = t.completed ? 'row-done' : '';
    const checkedAttr = t.completed ? 'checked' : '';
    const dateLabel = formatDate(t.date);
    const progress = t.progress || 0;
    const dueDate = t.dueDate ? formatDate(t.dueDate) : '—';
    const dueDateClass = (t.dueDate && isOverdue(t.dueDate) && !t.completed) ? 'overdue' : '';

    const progressBar = `
      <div style="display:flex;align-items:center;min-width:80px;" title="${progress}%">
        <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:3px;transition:width 0.3s;"></div>
        </div>
      </div>
    `;

    const shortId = t._id ? t._id.slice(-6) : '';
    const copyIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="cursor:pointer;opacity:0.5;vertical-align:-2px" onclick="event.stopPropagation();copyTaskId('${t._id}')" title="Copy mã"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;

    const checkbox = canWrite()
      ? `<input type="checkbox" ${checkedAttr} onchange="toggleTask('${t._id}', this.checked)" title="Hoàn thành">`
      : `<input type="checkbox" ${checkedAttr} disabled title="Chỉ xem">`;

    return `
      <tr class="${doneClass}" onclick="viewTaskDetail('${t._id}')" style="cursor:pointer;">
        <td class="td-check" onclick="event.stopPropagation()">${checkbox}</td>
        <td class="td-id"><code style="font-size:0.7rem;color:#6366f1;cursor:pointer;" onclick="event.stopPropagation();copyTaskId('${t._id}')" title="Click để copy mã">#${shortId}</code></td>
        <td class="td-name">${escapeHtml(t.name)}</td>
        <td class="td-reason">${escapeHtml(t.reason || '—')}</td>
        <td><span class="cat-tag" style="background:${catColor}20;color:${catColor}">${escapeHtml(catName)}</span></td>
        <td class="td-date">${dateLabel}</td>
        <td class="td-date ${dueDateClass}">${dueDate}</td>
        <td>${progressBar}</td>
        <td>${priorityBadge[t.priority] || priorityBadge.medium}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table class="task-table">
        <thead>
          <tr>
            <th style="width:40px">✓</th>
            <th style="width:70px">Mã</th>
            <th>Tên task</th>
            <th style="width:25%">Lý do</th>
            <th>Danh mục</th>
            <th style="width:90px">Ngày tạo</th>
            <th style="width:90px">Dự kiến</th>
            <th style="width:100px">Tiến độ</th>
            <th style="width:70px">Ưu tiên</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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
  const reason = document.getElementById('taskModalReason');
  const description = document.getElementById('taskModalDescription');
  const descSection = document.getElementById('taskModalDescSection');
  const progressBar = document.getElementById('taskModalProgressBar');
  const progressText = document.getElementById('taskModalProgressText');
  const createdDate = document.getElementById('taskModalCreatedDate');
  const dueDate = document.getElementById('taskModalDueDate');
  const dueDateItem = document.getElementById('taskModalDueDateItem');
  const editBtn = document.getElementById('taskModalEdit');

  name.textContent = task.name;
  reason.textContent = task.reason || '—';

  if (task.description) {
    description.textContent = task.description;
    descSection.style.display = 'block';
  } else {
    description.innerHTML = '<span class="task-empty-description">Chưa có mô tả chi tiết</span>';
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

function openEditModal(id) {
  const task = tasks.find(t => t._id === id);
  if (!task) return;

  editingTaskId = id;
  document.getElementById('editTaskName').value = task.name;
  document.getElementById('editTaskReason').value = task.reason || '';
  document.getElementById('editTaskDesc').value = task.description || '';
  document.getElementById('editTaskProgress').value = task.progress || 0;
  document.getElementById('editProgressLabel').textContent = task.progress || 0;
  document.getElementById('editTaskDueDate').value = task.dueDate ? formatDateInput(task.dueDate) : '';
  document.getElementById('editTaskModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editTaskModal').classList.remove('active');
  editingTaskId = null;
}

function openAddTaskModal() {
  document.getElementById('addTaskDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('addTaskName').value = '';
  document.getElementById('addTaskReason').value = '';
  document.getElementById('addTaskDesc').value = '';
  document.getElementById('addTaskPriority').value = 'medium';
  document.getElementById('addTaskProgress').value = 0;
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

  document.getElementById('editTaskSave').addEventListener('click', async () => {
    if (!editingTaskId) return;
    const updates = {
      name: document.getElementById('editTaskName').value.trim(),
      reason: document.getElementById('editTaskReason').value.trim(),
      description: document.getElementById('editTaskDesc').value.trim(),
      progress: Math.min(100, Math.max(0, parseInt(document.getElementById('editTaskProgress').value) || 0)),
      dueDate: document.getElementById('editTaskDueDate').value || null,
    };
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
    const reason = document.getElementById('addTaskReason').value.trim();
    const desc = document.getElementById('addTaskDesc').value.trim();
    const category = document.getElementById('addTaskCategory').value;
    const priority = document.getElementById('addTaskPriority').value;
    const date = document.getElementById('addTaskDate').value;
    const dueDate = document.getElementById('addTaskDueDate').value;
    const progress = Math.min(100, Math.max(0, parseInt(document.getElementById('addTaskProgress').value) || 0));
    if (!name || !category || !date) return showToast('Vui lòng điền tên, danh mục và ngày', 'error');
    try {
      await createTask({ name, reason, description: desc, category, priority, date, dueDate: dueDate || null, progress });
      showToast('Đã thêm task');
      closeAddModal();
      await loadAll();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Init
  loadAuth();
  document.getElementById('authForm')?.addEventListener('submit', handleAuth);
  document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
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
