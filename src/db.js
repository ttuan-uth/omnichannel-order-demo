const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const LOW_STOCK_THRESHOLD = 10;

/**
 * Bỏ dấu tiếng Việt + lowercase để tìm kiếm không phân biệt hoa/thường, có/không dấu.
 * Dùng NFD tách dấu rồi loại các ký tự dấu (U+0300–U+036F); xử lý riêng đ/Đ vì
 * normalize không tách được ký tự này.
 */
function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

// Luồng trạng thái đơn hàng (xem CLAUDE.md)
const STATUS_LABELS = {
  cho_xac_nhan: 'Chờ xác nhận',
  da_xac_nhan: 'Đã xác nhận (đủ kho)',
  dang_lay_hang: 'Đang lấy hàng (picking)',
  da_dong_goi: 'Đã đóng gói (packing)',
  dang_giao: 'Đang giao hàng (TMS)',
  da_giao: 'Đã giao / hoàn tất',
  da_huy: 'Đã hủy',
};

const ORDER_CHANNEL_LABELS = {
  online: 'Website (online)',
  app: 'Ứng dụng (app)',
  fanpage: 'Fanpage',
  tai_quay: 'Tại quầy',
};

const RECEIVE_METHOD_LABELS = {
  giao_tan_noi: 'Giao tận nơi',
  nhan_tai_quay: 'Nhận tại nhà thuốc',
};

const PAYMENT_METHOD_LABELS = {
  cod: 'Thanh toán khi nhận hàng (COD)',
  online: 'Thanh toán online',
};

const PAYMENT_STATUS_LABELS = {
  chua_thanh_toan: 'Chưa thanh toán',
  da_thanh_toan: 'Đã thanh toán',
};

const ALLOWED_TRANSITIONS = {
  cho_xac_nhan: ['da_xac_nhan', 'da_huy'],
  da_xac_nhan: ['dang_lay_hang', 'da_huy'],
  dang_lay_hang: ['da_dong_goi', 'da_huy'],
  da_dong_goi: ['dang_giao', 'da_giao', 'da_huy'],
  dang_giao: ['da_giao'],
  da_giao: [],
  da_huy: [],
};

// Các trạng thái mà tồn kho đã bị trừ (trừ khi xác nhận) — hủy ở đây phải hoàn kho
const STOCK_DEDUCTED_STATUSES = ['da_xac_nhan', 'dang_lay_hang', 'da_dong_goi'];

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'admin')),
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  sold_count INTEGER NOT NULL DEFAULT 0,
  image_emoji TEXT,
  name_normalized TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  order_channel TEXT NOT NULL CHECK (order_channel IN ('online', 'app', 'fanpage', 'tai_quay')),
  receive_method TEXT NOT NULL CHECK (receive_method IN ('giao_tan_noi', 'nhan_tai_quay')),
  tracking_code TEXT,
  cancel_reason TEXT,
  receiver_name TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  address TEXT,
  total INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cod' CHECK (payment_method IN ('cod', 'online')),
  payment_status TEXT NOT NULL DEFAULT 'chua_thanh_toan' CHECK (payment_status IN ('chua_thanh_toan', 'da_thanh_toan')),
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  note TEXT,
  changed_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER REFERENCES orders(id),
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS product_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  viewed_at TEXT DEFAULT (datetime('now', 'localtime'))
);
`);

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return;

  const insertUser = db.prepare(
    'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)'
  );
  insertUser.run('admin', bcrypt.hashSync('admin123', 10), 'Quản trị viên', 'admin');
  insertUser.run('khach1', bcrypt.hashSync('khach123', 10), 'Nguyễn Văn Khách', 'customer');

  const insertProduct = db.prepare(
    'INSERT INTO products (name, description, price, stock, image_emoji) VALUES (?, ?, ?, ?, ?)'
  );
  const products = [
    ['Panadol Extra (vỉ 12 viên)', 'Giảm đau, hạ sốt', 24000, 120, '💊'],
    ['Vitamin C 500mg (hộp 100 viên)', 'Tăng đề kháng', 85000, 60, '🍊'],
    ['Khẩu trang y tế 4 lớp (hộp 50 cái)', 'Kháng khuẩn, lọc bụi', 45000, 200, '😷'],
    ['Nước muối sinh lý 0.9% (chai 500ml)', 'Súc miệng, rửa vết thương', 12000, 8, '🧴'],
    ['Berberin (lọ 100 viên)', 'Hỗ trợ tiêu hóa', 18000, 45, '💊'],
    ['Dầu gió xanh Con Ó (chai 24ml)', 'Giảm đau nhức, cảm lạnh', 55000, 30, '🌿'],
    ['Băng cá nhân Urgo (hộp 100 miếng)', 'Bảo vệ vết thương nhỏ', 38000, 5, '🩹'],
    ['Siro ho Prospan (chai 100ml)', 'Giảm ho cho trẻ em và người lớn', 78000, 25, '🍯'],
    ['Máy đo huyết áp điện tử Omron', 'Đo huyết áp bắp tay tự động', 850000, 7, '🩺'],
    ['Viên sủi Effervescent Multivitamin', 'Bổ sung vitamin tổng hợp', 95000, 40, '🫧'],
  ];
  const insertAll = db.transaction(() => {
    for (const p of products) insertProduct.run(...p);
  });
  insertAll();
  console.log('Đã seed dữ liệu mẫu (2 tài khoản, 10 sản phẩm).');
}
seed();

// Migration: đảm bảo cột products.name_normalized tồn tại cho DB cũ (SQLite không có ADD COLUMN IF NOT EXISTS)
const productCols = db.prepare('PRAGMA table_info(products)').all();
if (!productCols.some((c) => c.name === 'name_normalized')) {
  db.exec('ALTER TABLE products ADD COLUMN name_normalized TEXT');
}
// Backfill name_normalized (tên bỏ dấu, lowercase) cho các dòng chưa có — chạy cho cả seed mới lẫn DB cũ
const needNormalize = db.prepare('SELECT id, name FROM products WHERE name_normalized IS NULL').all();
if (needNormalize.length > 0) {
  const upd = db.prepare('UPDATE products SET name_normalized = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const p of needNormalize) upd.run(removeVietnameseTones(p.name), p.id);
  });
  tx();
  console.log(`Đã cập nhật name_normalized cho ${needNormalize.length} sản phẩm.`);
}

/**
 * Hàm chung duy nhất để chuyển trạng thái đơn hàng:
 * kiểm tra transition hợp lệ + cập nhật orders.status + ghi order_status_history.
 * Gọi bên trong transaction nếu kèm thao tác kho.
 */
function changeOrderStatus(orderId, newStatus, changedBy, note) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error(`Không tìm thấy đơn hàng #${orderId}`);
  const allowed = ALLOWED_TRANSITIONS[order.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Không thể chuyển đơn #${orderId} từ "${STATUS_LABELS[order.status]}" sang "${STATUS_LABELS[newStatus]}"`
    );
  }
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(newStatus, orderId);
  db.prepare(
    'INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES (?, ?, ?, ?)'
  ).run(orderId, newStatus, note || null, changedBy || null);
  return { ...order, status: newStatus };
}

/**
 * Thông báo cho KHÁCH liên quan tới 1 đơn hàng — gộp theo đơn: mỗi (user_id, order_id)
 * chỉ giữ TỐI ĐA 1 dòng, luôn phản ánh trạng thái mới nhất. Nếu đã có thì UPDATE lại
 * message + reset is_read = 0 + đẩy created_at lên now (lên đầu danh sách); chưa có thì INSERT.
 * KHÔNG dùng cho thông báo của admin (nhiều admin cùng nhận 1 sự kiện — vẫn INSERT mới).
 * Gọi bên trong cùng transaction với thao tác đổi trạng thái để đảm bảo nhất quán.
 */
function upsertOrderNotification(userId, orderId, message) {
  const existing = db
    .prepare('SELECT id FROM notifications WHERE user_id = ? AND order_id = ?')
    .get(userId, orderId);
  if (existing) {
    db.prepare(
      "UPDATE notifications SET message = ?, is_read = 0, created_at = datetime('now', 'localtime') WHERE id = ?"
    ).run(message, existing.id);
  } else {
    db.prepare('INSERT INTO notifications (user_id, order_id, message) VALUES (?, ?, ?)').run(
      userId,
      orderId,
      message
    );
  }
}

/**
 * Chuyển đơn sang `da_giao` + cộng dồn sold_count cho từng sản phẩm trong đơn.
 * Dùng chung cho admin "hoàn tất" và khách "xác nhận đã nhận hàng".
 * Vẫn đi qua changeOrderStatus() nên transition được kiểm tra hợp lệ như cũ.
 * Caller phải gọi bên trong một db.transaction.
 */
function markDelivered(orderId, changedBy, note) {
  changeOrderStatus(orderId, 'da_giao', changedBy, note);
  const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
  const inc = db.prepare('UPDATE products SET sold_count = sold_count + ? WHERE id = ?');
  for (const it of items) inc.run(it.quantity, it.product_id);
}

module.exports = {
  db,
  changeOrderStatus,
  markDelivered,
  upsertOrderNotification,
  removeVietnameseTones,
  LOW_STOCK_THRESHOLD,
  STATUS_LABELS,
  ORDER_CHANNEL_LABELS,
  RECEIVE_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  ALLOWED_TRANSITIONS,
  STOCK_DEDUCTED_STATUSES,
};
