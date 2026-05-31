require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/tasks', require('./routes/tasks'));

// Chatbot config - đọc API keys từ .env, không lộ ra client file
app.get('/api/chatbot/config', (req, res) => {
  const keys = [];
  if (process.env.CHATBOT_API_KEY) keys.push(process.env.CHATBOT_API_KEY);
  if (process.env.CHATBOT_API_KEY_V2) keys.push(process.env.CHATBOT_API_KEY_V2);
  if (process.env.CHATBOT_API_KEY_V3) keys.push(process.env.CHATBOT_API_KEY_V3);
  if (process.env.CHATBOT_API_KEY_V4) keys.push(process.env.CHATBOT_API_KEY_V4);
  if (process.env.CHATBOT_API_KEY_V5) keys.push(process.env.CHATBOT_API_KEY_V5);
  res.json({
    success: true,
    data: {
      keys,
      model: process.env.CHATBOT_MODEL || 'gpt-oss-120b',
      apiBase: process.env.CHATBOT_API_BASE || 'https://api.cerebras.ai/v1',
      cooldown: parseInt(process.env.CHATBOT_COOLDOWN) || 30000,
      kimiKey: process.env.KIMI_API_KEY || '',
    },
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Kết nối MongoDB và khởi động server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Đã kết nối MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Lỗi kết nối MongoDB:', err.message);
    process.exit(1);
  });
