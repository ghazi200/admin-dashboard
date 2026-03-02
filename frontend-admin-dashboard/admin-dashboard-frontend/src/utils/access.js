export function getAdminInfo() {
  try {
    // Check both adminInfo and adminUser (login stores as adminUser)
    const raw = localStorage.getItem("adminInfo") || localStorage.getItem("adminUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Check if current user has access to a permission
 * 
 * ✅ ADMINS AND SUPER-ADMINS HAVE ALL PERMISSIONS BY DEFAULT
 * - Admins and Super-Admins bypass all permission checks
 * - Admins can grant permissions to others via the Users page
 * 
 * For non-admins:
 * - Permissions are checked against the user's permission array
 */
export function hasAccess(perm) {
  const info = getAdminInfo();
  if (!info) return false;

  // ✅ ADMIN/SUPER-ADMIN BYPASS (critical) - Admins and Super-Admins have all permissions by default
  if (info.role === "admin" || info.role === "super_admin") return true;

  const perms = Array.isArray(info.permissions) ? info.permissions : [];
  return perms.includes(perm);
}
