const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên danh mục là bắt buộc'],
    trim: true,
    maxlength: [100, 'Tên danh mục tối đa 100 ký tự']
  },
  date: {
    type: Date,
    required: [true, 'Ngày là bắt buộc'],
    default: Date.now
  },
  color: {
    type: String,
    default: '#6366f1'
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Mô tả tối đa 500 ký tự']
  }
}, {
  timestamps: true
});

// Index để query theo ngày nhanh hơn
categorySchema.index({ date: 1 });

module.exports = mongoose.model('Category', categorySchema);
