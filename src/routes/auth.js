const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../db');

const router = express.Router();

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/register', { title: 'Đăng ký' });
});

router.post('/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const fullName = (req.body.full_name || '').trim();

  if (!username || !password || !fullName) {
    req.session.flash = { type: 'error', message: 'Vui lòng điền đầy đủ thông tin.' };
    return res.redirect('/register');
  }
  if (password.length < 6) {
    req.session.flash = { type: 'error', message: 'Mật khẩu phải có ít nhất 6 ký tự.' };
    return res.redirect('/register');
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    req.session.flash = { type: 'error', message: 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác.' };
    return res.redirect('/register');
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, 'customer')")
    .run(username, hash, fullName);

  req.session.user = { id: info.lastInsertRowid, username, full_name: fullName, role: 'customer' };
  req.session.flash = { type: 'success', message: `Đăng ký thành công. Xin chào ${fullName}!` };
  res.redirect('/');
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/');
  res.render('auth/login', { title: 'Đăng nhập' });
});

router.post('/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    req.session.flash = { type: 'error', message: 'Sai tên đăng nhập hoặc mật khẩu.' };
    return res.redirect('/login');
  }

  req.session.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
  req.session.flash = { type: 'success', message: `Xin chào ${user.full_name}!` };
  res.redirect(user.role === 'admin' ? '/admin' : '/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
