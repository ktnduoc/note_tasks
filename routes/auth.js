const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken, authenticate } = require('../middleware/auth');

// POST /api/auth/login - Đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập username và password'
      });
    }

    // Tìm user (có thể dùng email hoặc username)
    const user = await User.findOne({
      $or: [{ email: username }, { username }]
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Thông tin đăng nhập không chính xác'
      });
    }

    // Kiểm tra password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Thông tin đăng nhập không chính xác'
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        user,
        token
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me - Lấy thông tin user hiện tại
router.get('/me', authenticate, async (req, res) => {
  res.json({
    success: true,
    data: req.user
  });
});

// POST /api/auth/verify - Xác thực token
router.post('/verify', authenticate, async (req, res) => {
  res.json({
    success: true,
    message: 'Token hợp lệ',
    data: {
      user: req.user
    }
  });
});

module.exports = router;
