const express = require('express');
const { db } = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// Sắp xếp sản phẩm ở trang chủ — whitelist an toàn để nhúng vào ORDER BY
const SORT_OPTIONS = {
  name_asc: 'name ASC',
  name_desc: 'name DESC',
  price_asc: 'price ASC',
  price_desc: 'price DESC',
};
const DEFAULT_SORT = 'name_asc';

// Số điện thoại VN: bắt đầu 0 hoặc +84, đầu số di động 3/5/7/8/9, đủ 9-10 chữ số
const PHONE_RE = /^(0|\+84)[35789][0-9]{8}$/;
const PHONE_ERROR = 'Số điện thoại không đúng định dạng (VD: 0912345678 hoặc +84912345678)';

function getCart(req) {
  if (!req.session.cart) req.session.cart = {}; // { productId: quantity }
  return req.session.cart;
}

function buildCartItems(cart) {
  const items = [];
  let total = 0;
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
  for (const [productId, quantity] of Object.entries(cart)) {
    const product = getProduct.get(Number(productId));
    if (!product) continue;
    const lineTotal = product.price * quantity;
    total += lineTotal;
    items.push({ product, quantity, lineTotal });
  }
  return { items, total };
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const sort = SORT_OPTIONS[req.query.sort] ? req.query.sort : DEFAULT_SORT;
  const orderBy = SORT_OPTIONS[sort];

  let products;
  if (q) {
    products = db
      .prepare(`SELECT * FROM products WHERE LOWER(name) LIKE LOWER(?) ORDER BY ${orderBy}`)
      .all(`%${q}%`);
  } else {
    products = db.prepare(`SELECT * FROM products ORDER BY ${orderBy}`).all();
  }
  res.render('shop/index', { title: 'Sản phẩm', products, q, sort });
});

router.get('/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
  if (!product) {
    req.session.flash = { type: 'error', message: 'Sản phẩm không tồn tại.' };
    return res.redirect('/');
  }
  // Ghi lượt xem chỉ khi user đã đăng nhập (khách vãng lai vẫn xem được, không ghi)
  if (req.session.user) {
    db.prepare('INSERT INTO product_views (user_id, product_id) VALUES (?, ?)').run(
      req.session.user.id,
      product.id
    );
  }
  res.render('shop/detail', { title: product.name, product });
});

router.post('/cart/add', requireLogin, (req, res) => {
  const productId = Number(req.body.product_id);
  const quantity = Math.max(1, Number(req.body.quantity) || 1);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) {
    req.session.flash = { type: 'error', message: 'Sản phẩm không tồn tại.' };
    return res.redirect('/');
  }
  if (product.stock < 1) {
    req.session.flash = { type: 'error', message: `"${product.name}" đã hết hàng.` };
    return res.redirect('/');
  }
  // Không cho tổng số lượng trong giỏ vượt quá tồn kho hiện tại
  const cart = getCart(req);
  const desired = (cart[productId] || 0) + quantity;
  if (desired > product.stock) {
    cart[productId] = product.stock;
    req.session.flash = {
      type: 'warning',
      message: `Chỉ còn ${product.stock} sản phẩm trong kho, đã điều chỉnh số lượng trong giỏ về ${product.stock}.`,
    };
  } else {
    cart[productId] = desired;
    req.session.flash = { type: 'success', message: `Đã thêm "${product.name}" vào giỏ hàng.` };
  }
  res.redirect('/');
});

router.get('/cart', requireLogin, (req, res) => {
  const { items, total } = buildCartItems(getCart(req));
  res.render('shop/cart', { title: 'Giỏ hàng', items, total });
});

router.post('/cart/update', requireLogin, (req, res) => {
  const productId = String(Number(req.body.product_id));
  const quantity = Number(req.body.quantity);
  const cart = getCart(req);
  if (cart[productId] !== undefined) {
    if (!(quantity >= 1)) {
      delete cart[productId];
    } else {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(productId));
      const stock = product ? product.stock : 0;
      if (quantity > stock) {
        if (stock < 1) {
          delete cart[productId];
          req.session.flash = {
            type: 'warning',
            message: `"${product ? product.name : 'Sản phẩm'}" đã hết hàng, đã xóa khỏi giỏ.`,
          };
        } else {
          cart[productId] = stock;
          req.session.flash = {
            type: 'warning',
            message: `Chỉ còn ${stock} sản phẩm trong kho, đã điều chỉnh số lượng trong giỏ về ${stock}.`,
          };
        }
      } else {
        cart[productId] = quantity;
      }
    }
  }
  res.redirect('/cart');
});

router.post('/cart/remove', requireLogin, (req, res) => {
  const productId = String(Number(req.body.product_id));
  delete getCart(req)[productId];
  res.redirect('/cart');
});

router.get('/checkout', requireLogin, (req, res) => {
  const { items, total } = buildCartItems(getCart(req));
  if (items.length === 0) {
    req.session.flash = { type: 'error', message: 'Giỏ hàng trống, hãy chọn sản phẩm trước.' };
    return res.redirect('/');
  }
  res.render('shop/checkout', { title: 'Đặt hàng', items, total });
});

router.post('/checkout', requireLogin, (req, res) => {
  const cart = getCart(req);
  const { items, total } = buildCartItems(cart);
  if (items.length === 0) {
    req.session.flash = { type: 'error', message: 'Giỏ hàng trống, hãy chọn sản phẩm trước.' };
    return res.redirect('/');
  }

  const receiverName = (req.body.receiver_name || '').trim();
  const receiverPhone = (req.body.receiver_phone || '').replace(/\s+/g, '');
  const orderChannel = req.body.order_channel;
  const receiveMethod = req.body.receive_method;
  const paymentMethod = req.body.payment_method;
  const address = (req.body.address || '').trim();

  const validChannels = ['online', 'app', 'fanpage', 'tai_quay'];
  const validMethods = ['giao_tan_noi', 'nhan_tai_quay'];
  const validPayments = ['cod', 'online'];
  if (
    !receiverName ||
    !receiverPhone ||
    !validChannels.includes(orderChannel) ||
    !validMethods.includes(receiveMethod) ||
    !validPayments.includes(paymentMethod)
  ) {
    req.session.flash = { type: 'error', message: 'Vui lòng điền đầy đủ thông tin nhận hàng.' };
    return res.redirect('/checkout');
  }
  // Không tin client — validate lại định dạng số điện thoại ở server
  if (!PHONE_RE.test(receiverPhone)) {
    req.session.flash = { type: 'error', message: PHONE_ERROR };
    return res.redirect('/checkout');
  }
  if (receiveMethod === 'giao_tan_noi' && !address) {
    req.session.flash = { type: 'error', message: 'Vui lòng nhập địa chỉ khi chọn giao tận nơi.' };
    return res.redirect('/checkout');
  }

  // Thanh toán online (demo): validate định dạng thẻ nhưng TUYỆT ĐỐI KHÔNG lưu
  // bất kỳ thông tin thẻ nào vào DB — chỉ set payment_status = da_thanh_toan.
  if (paymentMethod === 'online') {
    const cardNumber = (req.body.card_number || '').replace(/\s+/g, '');
    const cardName = (req.body.card_name || '').trim();
    const cardExpiry = (req.body.card_expiry || '').trim();
    const cardCvv = (req.body.card_cvv || '').trim();
    const okCard =
      /^\d{16}$/.test(cardNumber) &&
      cardName.length > 0 &&
      /^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry) &&
      /^\d{3,4}$/.test(cardCvv);
    if (!okCard) {
      req.session.flash = {
        type: 'error',
        message: 'Thông tin thẻ không hợp lệ (số thẻ 16 số, ngày hết hạn MM/YY, CVV 3-4 số).',
      };
      return res.redirect('/checkout');
    }
    // Cố ý không gán các biến thẻ vào đâu khác — chúng bị bỏ sau block này.
  }
  const paymentStatus = paymentMethod === 'online' ? 'da_thanh_toan' : 'chua_thanh_toan';

  // Kiểm tra sơ bộ tồn kho lúc đặt (kiểm tra + trừ kho chính thức khi admin xác nhận)
  for (const { product, quantity } of items) {
    if (quantity > product.stock) {
      req.session.flash = {
        type: 'error',
        message: `"${product.name}" chỉ còn ${product.stock} sản phẩm trong kho, vui lòng giảm số lượng.`,
      };
      return res.redirect('/cart');
    }
  }

  const createOrder = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO orders (user_id, status, order_channel, receive_method, receiver_name, receiver_phone, address, total, payment_method, payment_status)
         VALUES (?, 'cho_xac_nhan', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.session.user.id,
        orderChannel,
        receiveMethod,
        receiverName,
        receiverPhone,
        address || null,
        total,
        paymentMethod,
        paymentStatus
      );
    const orderId = info.lastInsertRowid;

    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
    );
    for (const { product, quantity } of items) {
      insertItem.run(orderId, product.id, quantity, product.price);
    }

    db.prepare(
      'INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES (?, ?, ?, ?)'
    ).run(orderId, 'cho_xac_nhan', 'Khách đặt hàng, chờ OMS xác nhận', req.session.user.id);

    return orderId;
  });

  const orderId = createOrder();
  req.session.cart = {};
  req.session.flash = { type: 'success', message: `Đặt hàng thành công! Mã đơn hàng của bạn là #${orderId}.` };
  res.redirect(`/orders/${orderId}`);
});

module.exports = router;
