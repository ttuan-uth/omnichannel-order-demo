function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', message: 'Vui lòng đăng nhập để tiếp tục.' };
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', message: 'Vui lòng đăng nhập để tiếp tục.' };
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'admin') {
    req.session.flash = { type: 'error', message: 'Bạn không có quyền truy cập trang quản trị.' };
    return res.redirect('/');
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
