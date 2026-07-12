const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/account', requireLogin, (req, res) => {
  const account = db
    .prepare('SELECT username, full_name FROM users WHERE id = ?')
    .get(req.session.user.id);

  // Lịch sử xem hàng: gộp theo sản phẩm, lấy lần xem gần nhất, mới nhất trước
  const viewedProducts = db
    .prepare(
      `SELECT p.id, p.name, p.image_emoji, p.price, MAX(pv.viewed_at) AS last_viewed
       FROM product_views pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.user_id = ?
       GROUP BY p.id
       ORDER BY MAX(pv.id) DESC
       LIMIT 20`
    )
    .all(req.session.user.id);

  // Lịch sử giao dịch: tái dùng dữ liệu đơn hàng của user
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC')
    .all(req.session.user.id);

  res.render('account/index', { title: 'Tài khoản của tôi', account, viewedProducts, orders });
});

// Đổi họ tên hiển thị + tên đăng nhập (kiểm tra trùng với user khác)
router.post('/account/profile', requireLogin, (req, res) => {
  const fullName = (req.body.full_name || '').trim();
  const username = (req.body.username || '').trim();

  if (!fullName || !username) {
    req.session.flash = { type: 'error', message: 'Họ tên và tên đăng nhập không được để trống.' };
    return res.redirect('/account');
  }

  const existing = db
    .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
    .get(username, req.session.user.id);
  if (existing) {
    req.session.flash = { type: 'error', message: 'Tên đăng nhập đã được người khác sử dụng.' };
    return res.redirect('/account');
  }

  db.prepare('UPDATE users SET full_name = ?, username = ? WHERE id = ?').run(
    fullName,
    username,
    req.session.user.id
  );
  // Cập nhật session để không bị đăng xuất và header hiển thị đúng ngay
  req.session.user.full_name = fullName;
  req.session.user.username = username;

  req.session.flash = { type: 'success', message: 'Đã cập nhật thông tin tài khoản.' };
  res.redirect('/account');
});

// Đổi mật khẩu: bắt nhập mật khẩu hiện tại để xác nhận trước khi đổi
router.post('/account/password', requireLogin, (req, res) => {
  const currentPassword = req.body.current_password || '';
  const newPassword = req.body.new_password || '';
  const confirmPassword = req.body.confirm_password || '';

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    req.session.flash = { type: 'error', message: 'Mật khẩu hiện tại không đúng.' };
    return res.redirect('/account');
  }
  if (newPassword.length < 6) {
    req.session.flash = { type: 'error', message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };
    return res.redirect('/account');
  }
  if (newPassword !== confirmPassword) {
    req.session.flash = { type: 'error', message: 'Xác nhận mật khẩu mới không khớp.' };
    return res.redirect('/account');
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.session.user.id);

  req.session.flash = { type: 'success', message: 'Đã đổi mật khẩu thành công.' };
  res.redirect('/account');
});

module.exports = router;
