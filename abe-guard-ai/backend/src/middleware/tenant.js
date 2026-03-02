module.exports = function tenant(req, res, next) {
  if (!req.user?.tenant_id) {
    return res.status(403).json({ error: 'Tenant missing' });
  }
  req.tenant_id = req.user.tenant_id;
  next();
};
