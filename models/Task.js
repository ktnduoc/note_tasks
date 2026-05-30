const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên task là bắt buộc'],
    trim: true,
    maxlength: [200, 'Tên task tối đa 200 ký tự']
  },
  reason: {
    type: String,
    trim: true,
    maxlength: [1000, 'Lý do tối đa 1000 ký tự']
  },
  deletedAt: {
    type: Date,
    default: null
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Mô tả chi tiết tối đa 2000 ký tự']
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Danh mục là bắt buộc']
  },
  date: {
    type: Date,
    required: [true, 'Ngày là bắt buộc'],
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: false
  },
  completed: {
    type: Boolean,
    default: false
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, {
  timestamps: true
});

// Index cho các query phổ biến
taskSchema.index({ date: 1 });
taskSchema.index({ category: 1 });
taskSchema.index({ completed: 1 });
taskSchema.index({ deletedAt: 1 });

// Middleware: tự động lọc task chưa xoá
taskSchema.pre(/^find/, function () {
  if (!this.getQuery()._includeDeleted) {
    this.where({ deletedAt: null });
  }
});

module.exports = mongoose.model('Task', taskSchema);
