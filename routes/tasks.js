const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const { optional, authenticate, requireWrite } = require('../middleware/auth');

// GET /api/tasks/stats/overview - Thống kê tổng quan - Public
router.get('/stats/overview', optional, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const match = {};
    if (dateFrom || dateTo) {
      match.date = {};
      if (dateFrom) match.date.$gte = new Date(dateFrom);
      if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59,999); match.date.$lte = d; }
    }
    const stats = await Task.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: ['$completed', 1, 0] } },
          pending: { $sum: { $cond: ['$completed', 0, 1] } },
          high: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ['$priority', 'medium'] }, 1, 0] } },
          low: { $sum: { $cond: [{ $eq: ['$priority', 'low'] }, 1, 0] } },
        },
      },
    ]);
    res.json({ success: true, data: stats[0] || { total: 0, completed: 0, pending: 0, high: 0, medium: 0, low: 0 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tasks/stats/by-category - Thống kê theo danh mục - Public
router.get('/stats/by-category', optional, async (req, res) => {
  try {
    const stats = await Task.aggregate([
      { $group: { _id: '$category', total: { $sum: 1 }, completed: { $sum: { $cond: ['$completed', 1, 0] } } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'cat' } },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $project: { category: '$cat.name', total: 1, completed: 1, pending: { $subtract: ['$total', '$completed'] } } },
    ]);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tasks/search/advanced - Tìm kiếm nâng cao - Public
router.get('/search/advanced', optional, async (req, res) => {
  try {
    const { q, priority, completed, dateFrom, dateTo, category } = req.query;
    const filter = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { reason: { $regex: q, $options: 'i' } },
      ];
    }
    if (priority) filter.priority = priority;
    if (completed !== undefined) filter.completed = completed === 'true';
    if (category) filter.category = category;
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = new Date(dateFrom);
      if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59,999); filter.date.$lte = d; }
    }
    const tasks = await Task.find(filter).populate('category', 'name color').sort({ date: -1 });
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tasks - Lấy tất cả task (có filter) - Public
router.get('/', optional, async (req, res) => {
  try {
    const { date, category, completed, search } = req.query;
    const filter = {};

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }
    if (category) filter.category = category;
    if (completed !== undefined) {
      // Lọc theo tiến độ thay vì trường completed: progress=100 là "đã xong"
      filter.progress = completed === 'true' ? 100 : { $ne: 100 };
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } }
      ];
    }

    const tasks = await Task.find(filter)
      .populate('category', 'name color')
      .sort({ date: -1, createdAt: -1 });

    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tasks/:id - Lấy task theo ID - Public
router.get('/:id', optional, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate('category', 'name color');
    if (!task) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy task' });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tasks - Tạo task mới (cần đăng nhập và quyền write)
router.post('/', authenticate, requireWrite, async (req, res) => {
  try {
    const taskData = { ...req.body };
    if (req.user) {
      taskData.createdBy = req.user._id;
    }
    const task = await Task.create(taskData);
    const populated = await task.populate('category', 'name color');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/tasks/:id - Cập nhật task (cần đăng nhập và quyền write)
router.put('/:id', authenticate, requireWrite, async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('category', 'name color');
    if (!task) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy task' });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /api/tasks/:id/toggle - Toggle trạng thái hoàn thành (cần đăng nhập và quyền write)
router.patch('/:id/toggle', authenticate, requireWrite, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy task' });
    }
    task.completed = !task.completed;
    await task.save();
    const populated = await task.populate('category', 'name color');
    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/tasks/:id - Soft delete task
router.delete('/:id', authenticate, requireWrite, async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { deletedAt: new Date() },
      { new: true }
    );
    if (!task) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy task' });
    }
    res.json({ success: true, message: 'Đã xóa task (soft delete)', data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/tasks/:id/restore - Khôi phục task đã xoá
router.patch('/:id/restore', authenticate, requireWrite, async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { deletedAt: null },
      { new: true }
    );
    if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy task' });
    res.json({ success: true, message: 'Đã khôi phục task', data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tasks/deleted - Xem task đã xoá
router.get('/deleted', optional, async (req, res) => {
  try {
    const tasks = await Task.find({ deletedAt: { $ne: null } })
      .populate('category', 'name color')
      .sort({ deletedAt: -1 })
      .limit(50);
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tasks/query - Truy vấn động (cho chatbot)
router.post('/query', optional, async (req, res) => {
  try {
    const { filter, projection, sort, limit, skip, includeDeleted } = req.body;
    const query = Task.find(filter || {});
    if (includeDeleted) {
      query.setQuery({ ...query.getQuery(), _includeDeleted: true });
    }
    if (projection) query.select(projection);
    if (sort) query.sort(sort);
    if (skip) query.skip(skip);
    if (limit) query.limit(Math.min(limit, 500));
    else query.limit(200);
    const tasks = await query.populate('category', 'name color').lean();
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
