const express = require('express');
const {
  db,
  changeOrderStatus,
  markDelivered,
  LOW_STOCK_THRESHOLD,
  STATUS_LABELS,
  STOCK_DEDUCTED_STATUSES,
} = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use('/admin', requireAdmin);

function generateTrackingCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `VD-${code}`;
}

// Gửi thông báo cho chủ đơn (tái dùng cơ chế notifications + badge sẵn có).
// Gọi bên trong cùng transaction với thao tác đổi trạng thái để đảm bảo nhất quán.
function notifyCustomer(userId, orderId, message) {
  db.prepare('INSERT INTO notifications (user_id, order_id, message) VALUES (?, ?, ?)').run(
    userId,
    orderId,
    message
  );
}

function getOrderOr404(req, res) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) {
    req.session.flash = { type: 'error', message: 'Không tìm thấy đơn hàng.' };
    res.redirect('/admin');
    return null;
  }
  return order;
}

router.get('/admin', (req, res) => {
  const statusFilter = req.query.status;
  const counts = {};
  for (const status of Object.keys(STATUS_LABELS)) counts[status] = 0;
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all()) {
    counts[row.status] = row.n;
  }

  let orders;
  if (statusFilter && STATUS_LABELS[statusFilter]) {
    orders = db
      .prepare(
        `SELECT o.*, u.full_name AS customer_name FROM orders o
         JOIN users u ON u.id = o.user_id WHERE o.status = ? ORDER BY o.id DESC`
      )
      .all(statusFilter);
  } else {
    orders = db
      .prepare(
        `SELECT o.*, u.full_name AS customer_name FROM orders o
         JOIN users u ON u.id = o.user_id ORDER BY o.id DESC`
      )
      .all();
  }

  const lowStockProducts = db
    .prepare('SELECT * FROM products WHERE stock < ? ORDER BY stock')
    .all(LOW_STOCK_THRESHOLD);

  res.render('admin/dashboard', {
    title: 'Quản trị đơn hàng (OMS)',
    counts,
    orders,
    statusFilter: statusFilter && STATUS_LABELS[statusFilter] ? statusFilter : null,
    lowStockProducts,
  });
});

router.get('/admin/orders/:id', (req, res) => {
  const order = getOrderOr404(req, res);
  if (!order) return;
  const customer = db.prepare('SELECT * FROM users WHERE id = ?').get(order.user_id);
  const items = db
    .prepare(
      `SELECT oi.*, p.name, p.image_emoji, p.stock FROM order_items oi
       JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
    )
    .all(order.id);
  const history = db
    .prepare(
      `SELECT h.*, u.full_name AS changed_by_name FROM order_status_history h
       LEFT JOIN users u ON u.id = h.changed_by WHERE h.order_id = ? ORDER BY h.id`
    )
    .all(order.id);

  res.render('admin/order-detail', { title: `Đơn hàng #${order.id}`, order, customer, items, history });
});

// OMS xác nhận + WMS kiểm tra & trừ kho
router.post('/admin/orders/:id/confirm', (req, res) => {
  const order = getOrderOr404(req, res);
  if (!order) return;

  const items = db
    .prepare(
      `SELECT oi.*, p.name, p.stock FROM order_items oi
       JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
    )
    .all(order.id);

  const shortages = items.filter((it) => it.quantity > it.stock);
  if (shortages.length > 0) {
    const detail = shortages
      .map((it) => `"${it.name}" (cần ${it.quantity}, còn ${it.stock})`)
      .join(', ');
    req.session.flash = {
      type: 'error',
      message: `WMS: thiếu tồn kho — ${detail}. Hãy nhập thêm kho hoặc hủy đơn.`,
    };
    return res.redirect(`/admin/orders/${order.id}`);
  }

  try {
    db.transaction(() => {
      const deduct = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      for (const it of items) deduct.run(it.quantity, it.product_id);
      changeOrderStatus(order.id, 'da_xac_nhan', req.session.user.id, 'OMS xác nhận; WMS đủ tồn kho, đã trừ kho');
      notifyCustomer(order.user_id, order.id, `Đơn hàng #${order.id} đã được xác nhận.`);
    })();
    req.session.flash = { type: 'success', message: `Đã xác nhận đơn #${order.id}, tồn kho đã được trừ.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/admin/orders/${order.id}`);
});

router.post('/admin/orders/:id/pick', (req, res) => {
  const order = getOrderOr404(req, res);
  if (!order) return;
  try {
    db.transaction(() => {
      changeOrderStatus(order.id, 'dang_lay_hang', req.session.user.id, 'Bắt đầu lấy hàng tại kho (picking)');
      notifyCustomer(order.user_id, order.id, `Đơn hàng #${order.id} đang được lấy hàng.`);
    })();
    req.session.flash = { type: 'success', message: `Đơn #${order.id} chuyển sang lấy hàng.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/admin/orders/${order.id}`);
});

router.post('/admin/orders/:id/pack', (req, res) => {
  const order = getOrderOr404(req, res);
  if (!order) return;
  try {
    db.transaction(() => {
      changeOrderStatus(order.id, 'da_dong_goi', req.session.user.id, 'Đóng gói hoàn tất (packing)');
      notifyCustomer(order.user_id, order.id, `Đơn hàng #${order.id} đã được đóng gói xong.`);
    })();
    req.session.flash = { type: 'success', message: `Đơn #${order.id} đã đóng gói xong.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/admin/orders/${order.id}`);
});

// TMS bắt đầu giao: sinh mã vận đơn giả lập VD-XXXXXX
router.post('/admin/orders/:id/ship', (req, res) => {
  const order = getOrderOr404(req, res);
  if (!order) return;
  if (order.receive_method !== 'giao_tan_noi') {
    req.session.flash = {
      type: 'error',
      message: 'Đơn nhận tại nhà thuốc không cần giao — dùng nút "Khách đã nhận hàng".',
    };
    return res.redirect(`/admin/orders/${order.id}`);
  }
  try {
    const trackingCode = generateTrackingCode();
    db.transaction(() => {
      changeOrderStatus(order.id, 'dang_giao', req.session.user.id, `TMS bắt đầu giao, mã vận đơn ${trackingCode}`);
      db.prepare('UPDATE orders SET tracking_code = ? WHERE id = ?').run(trackingCode, order.id);
      notifyCustomer(order.user_id, order.id, `Đơn hàng #${order.id} đang được giao, mã vận đơn ${trackingCode}.`);
    })();
    req.session.flash = { type: 'success', message: `Đơn #${order.id} đang giao, mã vận đơn ${trackingCode}.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/admin/orders/${order.id}`);
});

router.post('/admin/orders/:id/complete', (req, res) => {
  const order = getOrderOr404(req, res);
  if (!order) return;
  const note =
    order.receive_method === 'nhan_tai_quay'
      ? 'Khách đã nhận hàng tại nhà thuốc'
      : 'Giao hàng thành công';
  try {
    db.transaction(() => {
      markDelivered(order.id, req.session.user.id, note);
      notifyCustomer(order.user_id, order.id, `Đơn hàng #${order.id} đã giao thành công. Cảm ơn bạn đã mua hàng!`);
    })();
    req.session.flash = { type: 'success', message: `Đơn #${order.id} đã hoàn tất.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/admin/orders/${order.id}`);
});

// Các trạng thái đơn được phép thu tiền COD: chỉ khi hàng đã/đang tới tay khách.
const COD_PAYABLE_STATUSES = ['dang_giao', 'da_giao'];

// Admin xác nhận đã thu tiền COD: chỉ đổi payment_status (không đổi status đơn).
// Chỉ áp dụng cho đơn COD chưa thanh toán — đơn online đã da_thanh_toan từ lúc checkout.
router.post('/admin/orders/:id/mark-paid', (req, res) => {
  const order = getOrderOr404(req, res);
  if (!order) return;
  if (order.payment_method !== 'cod') {
    req.session.flash = { type: 'error', message: 'Chỉ đơn COD mới cần xác nhận thu tiền thủ công.' };
    return res.redirect(`/admin/orders/${order.id}`);
  }
  if (order.payment_status !== 'chua_thanh_toan') {
    req.session.flash = { type: 'error', message: 'Đơn này đã được đánh dấu đã thanh toán.' };
    return res.redirect(`/admin/orders/${order.id}`);
  }
  if (!COD_PAYABLE_STATUSES.includes(order.status)) {
    req.session.flash = { type: 'error', message: 'Chỉ thu tiền COD khi đơn đang giao hoặc đã giao.' };
    return res.redirect(`/admin/orders/${order.id}`);
  }
  try {
    db.transaction(() => {
      db.prepare("UPDATE orders SET payment_status = 'da_thanh_toan' WHERE id = ?").run(order.id);
      // Ghi lại sự kiện thu tiền vào lịch sử, giữ nguyên status hiện tại của đơn.
      db.prepare(
        'INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES (?, ?, ?, ?)'
      ).run(order.id, order.status, 'Admin xác nhận đã thu tiền COD', req.session.user.id);
    })();
    req.session.flash = { type: 'success', message: `Đã xác nhận thu tiền COD cho đơn #${order.id}.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/admin/orders/${order.id}`);
});

// Admin hoàn tác xác nhận thu tiền COD: đưa payment_status về chua_thanh_toan.
// Chỉ cho đơn COD — đơn online tự động đã thanh toán từ lúc đặt, không phải admin xác nhận tay.
router.post('/admin/orders/:id/unmark-paid', (req, res) => {
  const order = getOrderOr404(req, res);
  if (!order) return;
  if (order.payment_method !== 'cod') {
    req.session.flash = { type: 'error', message: 'Không thể hoàn tác thanh toán của đơn online.' };
    return res.redirect(`/admin/orders/${order.id}`);
  }
  if (order.payment_status !== 'da_thanh_toan') {
    req.session.flash = { type: 'error', message: 'Đơn này chưa được đánh dấu đã thanh toán.' };
    return res.redirect(`/admin/orders/${order.id}`);
  }
  try {
    db.transaction(() => {
      db.prepare("UPDATE orders SET payment_status = 'chua_thanh_toan' WHERE id = ?").run(order.id);
      db.prepare(
        'INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES (?, ?, ?, ?)'
      ).run(order.id, order.status, 'Admin hoàn tác xác nhận thu tiền COD', req.session.user.id);
    })();
    req.session.flash = { type: 'success', message: `Đã hoàn tác xác nhận thu tiền COD cho đơn #${order.id}.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/admin/orders/${order.id}`);
});

// Hủy đơn: bắt buộc có lý do, hoàn kho nếu đã trừ, tạo thông báo cho khách
router.post('/admin/orders/:id/cancel', (req, res) => {
  const order = getOrderOr404(req, res);
  if (!order) return;
  const reason = (req.body.reason || '').trim();
  if (!reason) {
    req.session.flash = { type: 'error', message: 'Vui lòng nhập lý do hủy đơn.' };
    return res.redirect(`/admin/orders/${order.id}`);
  }
  const needRestock = STOCK_DEDUCTED_STATUSES.includes(order.status);
  try {
    db.transaction(() => {
      if (needRestock) {
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
        const restock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
        for (const it of items) restock.run(it.quantity, it.product_id);
      }
      changeOrderStatus(
        order.id,
        'da_huy',
        req.session.user.id,
        `${needRestock ? 'Hủy đơn, đã hoàn tồn kho' : 'Hủy đơn (chưa trừ kho)'}. Lý do: ${reason}`
      );
      db.prepare('UPDATE orders SET cancel_reason = ? WHERE id = ?').run(reason, order.id);
      db.prepare(
        'INSERT INTO notifications (user_id, order_id, message) VALUES (?, ?, ?)'
      ).run(order.user_id, order.id, `Đơn hàng #${order.id} của bạn đã bị hủy. Lý do: ${reason}`);
    })();
    req.session.flash = { type: 'success', message: `Đã hủy đơn #${order.id}${needRestock ? ', tồn kho đã hoàn lại' : ''}. Đã gửi thông báo cho khách hàng.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/admin/orders/${order.id}`);
});

router.get('/admin/inventory', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY stock, name').all();
  const lowStockProducts = db
    .prepare('SELECT * FROM products WHERE stock < ? ORDER BY stock')
    .all(LOW_STOCK_THRESHOLD);
  res.render('admin/inventory', { title: 'Quản lý tồn kho (WMS)', products, lowStockProducts });
});

router.post('/admin/inventory/:id', (req, res) => {
  const productId = Number(req.params.id);
  const stock = Number(req.body.stock);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) {
    req.session.flash = { type: 'error', message: 'Không tìm thấy sản phẩm.' };
    return res.redirect('/admin/inventory');
  }
  if (!Number.isInteger(stock) || stock < 0) {
    req.session.flash = { type: 'error', message: 'Số lượng tồn phải là số nguyên không âm.' };
    return res.redirect('/admin/inventory');
  }
  db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, productId);
  req.session.flash = { type: 'success', message: `Đã cập nhật tồn kho "${product.name}" = ${stock}.` };
  res.redirect('/admin/inventory');
});

module.exports = router;
