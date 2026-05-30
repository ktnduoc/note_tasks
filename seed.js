require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('./models/Category');
const Task = require('./models/Task');

const categories = [
  { name: 'Công việc', color: '#6366f1' },
  { name: 'Học tập', color: '#22c55e' },
  { name: 'Cá nhân', color: '#f59e0b' },
  { name: 'Sức khỏe', color: '#ef4444' },
  { name: 'Giải trí', color: '#8b5cf6' },
];

const taskNames = [
  'Họp team định kỳ', 'Viết báo cáo tháng', 'Review code', 'Học React', 
  'Chạy bộ 5km', 'Đọc sách', 'Gọi khách hàng', 'Làm slide thuyết trình',
  'Dọn dẹp bàn làm việc', 'Backup dữ liệu', 'Học tiếng Anh', 'Tập gym',
  'Nấu ăn', 'Sửa bug', 'Viết unit test', 'Lên kế hoạch tuần',
  'Đi siêu thị', 'Họp với đối tác', 'Training nhân viên mới', 'Kiểm tra email',
];

const reasons = [
  'Cần hoàn thành trước deadline', 'Sếp yêu cầu', 'Quan trọng',
  'Định kỳ hàng tuần', 'Cần gấp', 'Đã hứa với đồng nghiệp',
  '', 'Để cải thiện kỹ năng', 'Chuẩn bị cho dự án mới',
];

const priorities = ['high', 'medium', 'low'];

function random(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomDate() {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 11, 31);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Đã kết nối MongoDB');

  // Tạo categories
  const catDocs = [];
  for (const c of categories) {
    let cat = await Category.findOne({ name: c.name });
    if (!cat) {
      cat = await Category.create({ ...c, date: new Date() });
      console.log(`  + Tạo danh mục: ${c.name}`);
    }
    catDocs.push(cat);
  }

  // Tạo 20 tasks
  for (let i = 0; i < 20; i++) {
    const name = taskNames[i];
    const cat = random(catDocs);
    const date = randomDate();
    const progress = Math.floor(Math.random() * 101);
    const completed = progress === 100;
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14) + 1);

    await Task.create({
      name,
      reason: random(reasons),
      description: `Mô tả chi tiết cho task: ${name}`,
      category: cat._id,
      date,
      dueDate,
      completed,
      progress,
      priority: random(priorities),
    });
    console.log(`  + Task: ${name} | ${cat.name} | ${date.toISOString().split('T')[0]} | ${progress}%`);
  }

  console.log('✅ Đã tạo 20 task ngẫu nhiên!');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
