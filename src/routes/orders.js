const express = require('express');
const { db, markDelivered, changeOrderStatus, notifyAllAdmins } = require('../db');
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
      notifyAllAdmins(order.id, `Khách hàng đã xác nhận nhận hàng cho đơn #${order.id}.`);
    })();
    req.session.flash = { type: 'success', message: `Cảm ơn bạn! Đơn #${order.id} đã hoàn tất.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/orders/${order.id}`);
});

// Khách tự hủy đơn — CHỈ khi còn `cho_xac_nhan` (admin chưa xử lý, chưa trừ kho nên không hoàn kho).
// Tách biệt hoàn toàn với route admin /admin/orders/:id/cancel (admin bắt buộc lý do, hủy nhiều
// trạng thái + hoàn kho). Lý do ở đây không bắt buộc, mặc định "Khách hàng tự hủy đơn".
router.post('/orders/:id/cancel', requireLogin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order || order.user_id !== req.session.user.id) {
    req.session.flash = { type: 'error', message: 'Không tìm thấy đơn hàng.' };
    return res.redirect('/orders');
  }
  if (order.status !== 'cho_xac_nhan') {
    req.session.flash = {
      type: 'error',
      message: 'Đơn hàng đã được xử lý, không thể tự hủy — vui lòng liên hệ để được hỗ trợ.',
    };
    return res.redirect(`/orders/${order.id}`);
  }
  const reason = (req.body.reason || '').trim() || 'Khách hàng tự hủy đơn';
  try {
    db.transaction(() => {
      changeOrderStatus(
        order.id,
        'da_huy',
        req.session.user.id,
        `Khách hàng tự hủy đơn trước khi được xác nhận. Lý do: ${reason}`
      );
      db.prepare('UPDATE orders SET cancel_reason = ? WHERE id = ?').run(reason, order.id);
      // Báo cho tất cả admin biết khách đã tự hủy
      notifyAllAdmins(order.id, `Khách hàng đã tự hủy đơn #${order.id}. Lý do: ${reason}`);
    })();
    req.session.flash = { type: 'success', message: `Đã hủy đơn #${order.id}.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/orders/${order.id}`);
});

module.exports = router;
