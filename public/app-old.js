// ===== API Base =====
const API = '/api';

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

// ===== API Calls =====
async function fetchCategories(date = '') {
  try {
    let url = `${API}/categories`;
    if (date) url += `?date=${date}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.success) { categories = json.data; window._categories = json.data; }
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
    const res = await fetch(url);
    const json = await res.json();
    if (json.success) tasks = json.data;
    return tasks;
  } catch (err) {
    console.error('Lỗi fetch tasks:', err);
  }
}

async function createCategory(data) {
  const res = await fetch(`${API}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

async function deleteCategory(id) {
  const res = await fetch(`${API}/categories/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json;
}

async function updateCategory(id, data) {
  const res = await fetch(`${API}/categories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

async function createTask(data) {
  const res = await fetch(`${API}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

async function updateTask(id, data) {
  const res = await fetch(`${API}/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

async function deleteTask(id) {
  const res = await fetch(`${API}/tasks/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json;
}

// ===== Render =====
function renderCategories() {
  const catSelect = document.getElementById('quickCategory');
  const filterCat = document.getElementById('filterCategory');
  const delBtn = document.getElementById('btnDelCategory');

  const opts = categories.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
  catSelect.innerHTML = `<option value="">-- Chọn danh mục --</option>${opts}`;
  filterCat.innerHTML = `<option value="">Tất cả danh mục</option>${opts}`;

  // Hiện/ẩn nút xoá danh mục
  if (delBtn) {
    delBtn.style.display = selectedCategoryId ? '' : 'none';
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

  const priorityLabels = { high: 'Cao', medium: 'Vừa', low: 'Thấp' };
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

    return `
      <tr class="${doneClass}">
        <td class="td-check"><input type="checkbox" ${checkedAttr} onchange="toggleTask('${t._id}', this.checked)" title="Hoàn thành"></td>
        <td class="td-name">${escapeHtml(t.name)}</td>
        <td class="td-reason">${escapeHtml(t.reason || '—')}</td>
        <td><span class="cat-tag" style="background:${catColor}20;color:${catColor}">${escapeHtml(catName)}</span></td>
        <td class="td-date">${dateLabel}</td>
        <td>${priorityBadge[t.priority] || priorityBadge.medium}</td>
        <td class="td-actions">
          <button class="btn btn-xs btn-outline" onclick="editTask('${t._id}')" title="Sửa">${editIcon}</button>
          <button class="btn btn-xs btn-danger" onclick="handleDeleteTask('${t._id}')" title="Xoá">${trashIcon}</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table class="task-table">
        <thead>
          <tr>
            <th style="width:40px">✓</th>
            <th>Tên task</th>
            <th style="width:30%">Lý do</th>
            <th>Danh mục</th>
            <th>Ngày</th>
            <th style="width:70px">Ưu tiên</th>
            <th style="width:80px">Thao tác</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Actions =====
function selectCategory(id) {
  selectedCategoryId = id;
  document.getElementById('filterCategory').value = id;
  renderCategories();
  applyFilters();
}

async function handleDeleteCategory(id) {
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
  try {
    await updateTask(id, { completed });
    await loadAll();
  } catch (err) {
    showToast(err.message, 'error');
    await loadAll();
  }
}

async function handleDeleteTask(id) {
  if (!confirm('Xoá task này?')) return;
  try {
    await deleteTask(id);
    showToast('Đã xoá task');
    await loadAll();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function editTask(id) {
  const task = tasks.find(t => t._id === id);
  if (!task) return;
  const newName = prompt('Sửa tên task:', task.name);
  if (newName === null) return;
  const newReason = prompt('Sửa lý do:', task.reason || '');
  if (newReason === null) return;
  updateTask(id, { name: newName.trim(), reason: newReason.trim() })
    .then(() => loadAll())
    .then(() => showToast('Đã cập nhật task'))
    .catch(err => showToast(err.message, 'error'));
}

// ===== Filter =====
function applyFilters() {
  const date = document.getElementById('filterDate').value;
  const category = document.getElementById('filterCategory').value;
  const completed = document.getElementById('filterStatus').value;
  const search = document.getElementById('filterSearch').value;

  const filters = {};
  if (date) filters.date = date;
  if (category) filters.category = category;
  if (completed !== '') filters.completed = completed;
  if (search) filters.search = search;

  fetchTasks(filters).then(renderTasks);
}

// ===== Load All =====
async function loadAll() {
  const filterDate = document.getElementById('filterDate').value;
  await Promise.all([fetchCategories(filterDate), fetchTasks()]);
  renderCategories();
  renderTasks();
}

// ===== Form Handlers =====
document.getElementById('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('catName').value.trim();
  const date = document.getElementById('catDate').value;
  const color = document.getElementById('catColor').value;
  const description = document.getElementById('catDesc').value.trim();

  if (!name || !date) return showToast('Vui lòng nhập tên và ngày', 'error');

  try {
    await createCategory({ name, date, color, description });
    showToast('Đã thêm danh mục');
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryForm').classList.add('hidden');
    await loadAll();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('quickAddForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('quickName').value.trim();
  const reason = document.getElementById('quickReason').value.trim();
  const category = document.getElementById('quickCategory').value;
  const date = document.getElementById('quickDate').value;
  const priority = document.getElementById('quickPriority').value;

  if (!name || !category || !date) return showToast('Vui lòng điền đầy đủ thông tin', 'error');

  try {
    await createTask({ name, reason, category, date, priority });
    showToast('Đã thêm task');
    document.getElementById('quickAddForm').reset();
    document.getElementById('quickDate').value = new Date().toISOString().split('T')[0];
    await loadAll();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('btnAddCategory').addEventListener('click', () => {
  document.getElementById('categoryForm').classList.toggle('hidden');
  document.getElementById('catDate').value = document.getElementById('filterDate').value || new Date().toISOString().split('T')[0];
});

document.getElementById('btnCancelCat').addEventListener('click', () => {
  document.getElementById('categoryForm').classList.add('hidden');
});

// Filter event listeners
document.getElementById('filterDate').addEventListener('change', applyFilters);
document.getElementById('filterCategory').addEventListener('change', (e) => {
  selectedCategoryId = e.target.value || null;
  renderCategories();
  applyFilters();
});
document.getElementById('btnDelCategory').addEventListener('click', async () => {
  if (!selectedCategoryId) return showToast('Chưa chọn danh mục', 'error');
  await handleDeleteCategory(selectedCategoryId);
  selectedCategoryId = null;
  document.getElementById('filterCategory').value = '';
  await loadAll();
});
document.getElementById('filterStatus').addEventListener('change', applyFilters);
document.getElementById('filterSearch').addEventListener('input', debounce(applyFilters, 300));

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('quickDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('filterDate').value = new Date().toISOString().split('T')[0];
  loadAll();
  applyFilters();
});
