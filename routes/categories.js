const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { optional, authenticate, requireWrite } = require('../middleware/auth');

// GET /api/categories - Lấy tất cả danh mục (public, không cần đăng nhập)
router.get('/', optional, async (req, res) => {
  try {
    const { date } = req.query;
    const filter = {};
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }
    const categories = await Category.find(filter).sort({ date: -1 });
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/categories/:id - Lấy danh mục theo ID (public)
router.get('/:id', optional, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy danh mục' });
    }
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/categories - Tạo danh mục mới (cần đăng nhập và quyền write)
router.post('/', authenticate, requireWrite, async (req, res) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/categories/:id - Cập nhật danh mục (cần đăng nhập và quyền write)
router.put('/:id', authenticate, requireWrite, async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!category) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy danh mục' });
    }
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/categories/:id - Xóa danh mục (cần đăng nhập và quyền write)
router.delete('/:id', authenticate, requireWrite, async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy danh mục' });
    }
    // Xóa tất cả task thuộc danh mục này
    const Task = require('../models/Task');
    await Task.updateMany({ category: req.params.id }, { deletedAt: new Date() });
    res.json({ success: true, message: 'Đã xóa danh mục và các task liên quan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/categories/query - Truy vấn động (cho chatbot)
router.post('/query', optional, async (req, res) => {
  try {
    const { filter, projection, sort, limit } = req.body;
    const query = Category.find(filter || {});
    if (projection) query.select(projection);
    if (sort) query.sort(sort);
    if (limit) query.limit(Math.min(limit, 200));
    else query.limit(100);
    const cats = await query.lean();
    res.json({ success: true, data: cats, count: cats.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
