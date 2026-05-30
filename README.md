# NoteTasks - Hệ thống Quản lý Task với Authentication

## Tổng quan

Hệ thống quản lý task với phân quyền người dùng, chatbot AI, và giao diện hiện đại.

## Tính năng mới

### 1. Authentication & Authorization
- **Đăng ký/Đăng nhập**: JWT-based authentication
- **3 loại quyền**:
  - `admin`: Toàn quyền
  - `user`: Tạo, sửa, xóa task và danh mục
  - `viewer`: Chỉ xem, không thể thay đổi dữ liệu

### 2. Task Model nâng cao
- **Tiến độ hoàn thành**: Progress bar 0-100%
- **Ngày dự kiến**: Due date với cảnh báo quá hạn
- **Mô tả chi tiết**: Thêm description cho task
- **Người tạo**: Tracking user tạo task

### 3. UI/UX cải tiến
- **Bảng task đẹp hơn**: 
  - Cột tiến độ với progress bar
  - Cột ngày dự kiến (màu đỏ nếu quá hạn)
  - Click vào task để xem chi tiết
- **Modal chi tiết task**:
  - Hiển thị đầy đủ thông tin
  - Tiến độ hoàn thành
  - Ngày tạo và ngày dự kiến
  - Mô tả chi tiết
- **Auth bar**: Hiển thị user đang đăng nhập và role

### 4. Chatbot tích hợp Authentication
- **Lệnh /login**: Mở form đăng nhập từ chatbot
- **Phân quyền thông minh**: 
  - Viewer: Chỉ xem và thống kê
  - User/Admin: Tạo, sửa, xóa task
- **Hướng dẫn đăng nhập**: Bot tự động nhắc khi user chưa đăng nhập

## Cài đặt

```bash
# Cài đặt dependencies
npm install

# Cấu hình .env
MONGO_URI=mongodb://localhost:27017/note_tasks
PORT=3000
JWT_SECRET=your-secret-key-change-in-production

# Chạy server
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Đăng ký tài khoản
- `POST /api/auth/login` - Đăng nhập
- `GET /api/auth/me` - Lấy thông tin user hiện tại
- `POST /api/auth/verify` - Xác thực token

### Tasks (Public GET, Auth required cho POST/PUT/DELETE)
- `GET /api/tasks` - Lấy danh sách task (public)
- `GET /api/tasks/:id` - Lấy task theo ID (public)
- `POST /api/tasks` - Tạo task mới (cần auth + write permission)
- `PUT /api/tasks/:id` - Cập nhật task (cần auth + write permission)
- `DELETE /api/tasks/:id` - Xóa task (cần auth + write permission)
- `PATCH /api/tasks/:id/toggle` - Toggle completed (cần auth + write permission)

### Categories (Public GET, Auth required cho POST/PUT/DELETE)
- `GET /api/categories` - Lấy danh sách danh mục (public)
- `GET /api/categories/:id` - Lấy danh mục theo ID (public)
- `POST /api/categories` - Tạo danh mục (cần auth + write permission)
- `PUT /api/categories/:id` - Cập nhật danh mục (cần auth + write permission)
- `DELETE /api/categories/:id` - Xóa danh mục (cần auth + write permission)

## Sử dụng

### 1. Tạo tài khoản admin đầu tiên

```javascript
// Sử dụng MongoDB shell hoặc Compass
db.users.insertOne({
  username: "admin",
  email: "admin@example.com",
  password: "$2a$10$...", // Hash password bằng bcrypt
  role: "admin",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Hoặc đăng ký qua API và sau đó update role:
```bash
# Đăng ký
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"123456"}'

# Update role trong MongoDB
db.users.updateOne({username: "admin"}, {$set: {role: "admin"}})
```

### 2. Đăng nhập

- Click nút "Đăng nhập" trên thanh auth bar
- Hoặc gõ `/login` trong chatbot
- Nhập username/email và password

### 3. Tạo task với tiến độ

```javascript
{
  "name": "Hoàn thành báo cáo",
  "reason": "Deadline cuối tuần",
  "description": "Báo cáo tháng 5 về doanh số",
  "category": "60a7c...",
  "date": "2026-05-30",
  "dueDate": "2026-06-05",
  "progress": 50,
  "priority": "high"
}
```

### 4. Phân quyền viewer (chỉ xem)

Tạo link chia sẻ cho người chỉ xem:
1. Tạo user với role `viewer`
2. Chia sẻ thông tin đăng nhập
3. User viewer chỉ có thể xem, không thể tạo/sửa/xóa

## Cấu trúc File

```
note_tasks/
├── models/
│   ├── User.js          # Model user với authentication
│   ├── Task.js          # Model task với progress, dueDate
│   └── Category.js      # Model category
├── routes/
│   ├── auth.js          # Routes authentication
│   ├── tasks.js         # Routes tasks với authorization
│   └── categories.js    # Routes categories với authorization
├── middleware/
│   └── auth.js          # Middleware authentication & authorization
├── public/
│   ├── index.html       # HTML với auth UI và task modal
│   ├── app.js           # Frontend logic với auth integration
│   ├── style.css        # Styles chính
│   ├── auth-ui.css      # Styles cho auth UI
│   ├── task-modal.css   # Styles cho task detail modal
│   ├── chatbot-ui.js    # Chatbot với auth integration
│   └── chatbot-ui.css   # Chatbot styles
├── server.js            # Express server
├── package.json
└── .env
```

## Security Notes

1. **JWT Secret**: Đổi `JWT_SECRET` trong production
2. **Password**: Minimum 6 ký tự, được hash bằng bcrypt
3. **Token expiry**: 7 ngày
4. **CORS**: Cấu hình CORS phù hợp với domain của bạn

## Chatbot Commands

- `/login` - Mở form đăng nhập
- Tạo task: "Tạo task học React"
- Xem task: "Xem task hôm nay"
- Thống kê: "Thống kê task tuần này"

## Troubleshooting

### Lỗi "Không có quyền"
- Kiểm tra đã đăng nhập chưa
- Kiểm tra role của user (viewer không thể tạo/sửa/xóa)

### Token hết hạn
- Đăng nhập lại
- Token có thời hạn 7 ngày

### Chatbot không tạo được task
- Kiểm tra đã đăng nhập chưa
- Gõ `/login` để đăng nhập qua chatbot

## Roadmap

- [ ] Forgot password
- [ ] Email verification
- [ ] Task assignment (gán task cho user khác)
- [ ] Task comments
- [ ] File attachments
- [ ] Notifications
- [ ] Activity log

## License

MIT
