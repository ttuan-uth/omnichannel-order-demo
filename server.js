const path = require('path');
const express = require('express');
const session = require('express-session');

const {
  db,
  LOW_STOCK_THRESHOLD,
  STATUS_LABELS,
  ORDER_CHANNEL_LABELS,
  RECEIVE_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'omnichannel-demo-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 giờ
  })
);

// Biến dùng chung cho mọi view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.cartCount = Object.values(req.session.cart || {}).reduce((sum, q) => sum + q, 0);
  res.locals.unreadNotifications = req.session.user
    ? db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0').get(req.session.user.id).n
    : 0;
  res.locals.STATUS_LABELS = STATUS_LABELS;
  res.locals.ORDER_CHANNEL_LABELS = ORDER_CHANNEL_LABELS;
  res.locals.RECEIVE_METHOD_LABELS = RECEIVE_METHOD_LABELS;
  res.locals.PAYMENT_METHOD_LABELS = PAYMENT_METHOD_LABELS;
  res.locals.PAYMENT_STATUS_LABELS = PAYMENT_STATUS_LABELS;
  res.locals.LOW_STOCK_THRESHOLD = LOW_STOCK_THRESHOLD;
  res.locals.formatVND = (n) => Number(n).toLocaleString('vi-VN') + ' ₫';
  next();
});

app.use(require('./src/routes/auth'));
app.use(require('./src/routes/shop'));
app.use(require('./src/routes/orders'));
app.use(require('./src/routes/account'));
app.use(require('./src/routes/notifications'));
app.use(require('./src/routes/admin'));

app.use((req, res) => {
  res.status(404).render('404', { title: 'Không tìm thấy trang' });
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
