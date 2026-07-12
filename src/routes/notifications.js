const express = require('express');
const { db } = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/notifications', requireLogin, (req, res) => {
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC')
    .all(req.session.user.id);
  res.render('notifications/list', { title: 'Thông báo', notifications });
});

// Bấm vào 1 thông báo: đánh dấu đã đọc rồi chuyển tới đơn hàng liên quan (nếu có)
router.get('/notifications/:id', requireLogin, (req, res) => {
  const notification = db
    .prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.session.user.id);
  if (!notification) {
    req.session.flash = { type: 'error', message: 'Không tìm thấy thông báo.' };
    return res.redirect('/notifications');
  }
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notification.id);
  if (notification.order_id) {
    const orderPath =
      req.session.user.role === 'admin'
        ? `/admin/orders/${notification.order_id}`
        : `/orders/${notification.order_id}`;
    return res.redirect(orderPath);
  }
  res.redirect('/notifications');
});

module.exports = router;
