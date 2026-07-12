const express = require('express');
const { db, markDelivered } = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/orders', requireLogin, (req, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC')
    .all(req.session.user.id);
  res.render('orders/list', { title: 'Lịch sử đơn hàng', orders });
});

router.get('/orders/:id', requireLogin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order || (order.user_id !== req.session.user.id && req.session.user.role !== 'admin')) {
    req.session.flash = { type: 'error', message: 'Không tìm thấy đơn hàng.' };
    return res.redirect('/orders');
  }

  const items = db
    .prepare(
      `SELECT oi.*, p.name, p.image_emoji FROM order_items oi
       JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
    )
    .all(order.id);
  const history = db
    .prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id')
    .all(order.id);

  res.render('orders/detail', { title: `Đơn hàng #${order.id}`, order, items, history });
});

// Khách tự xác nhận đã nhận hàng khi đơn đang giao (dang_giao → da_giao).
// changeOrderStatus() bên trong markDelivered() vẫn kiểm tra transition hợp lệ.
router.post('/orders/:id/confirm-received', requireLogin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order || order.user_id !== req.session.user.id) {
    req.session.flash = { type: 'error', message: 'Không tìm thấy đơn hàng.' };
    return res.redirect('/orders');
  }
  if (order.status !== 'dang_giao') {
    req.session.flash = { type: 'error', message: 'Chỉ có thể xác nhận khi đơn đang được giao.' };
    return res.redirect(`/orders/${order.id}`);
  }
  try {
    db.transaction(() => {
      markDelivered(order.id, req.session.user.id, 'Khách hàng xác nhận đã nhận hàng');
      // Thông báo cho tất cả admin để họ biết mà không cần tự bấm hoàn tất
      const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
      const insertNoti = db.prepare(
        'INSERT INTO notifications (user_id, order_id, message) VALUES (?, ?, ?)'
      );
      for (const admin of admins) {
        insertNoti.run(admin.id, order.id, `Khách hàng đã xác nhận nhận hàng cho đơn #${order.id}.`);
      }
    })();
    req.session.flash = { type: 'success', message: `Cảm ơn bạn! Đơn #${order.id} đã hoàn tất.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/orders/${order.id}`);
});

module.exports = router;
