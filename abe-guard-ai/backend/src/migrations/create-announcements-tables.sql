-- Create announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'COMPANY_WIDE',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMP,
  created_by_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  meta JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_category CHECK (category IN ('COMPANY_WIDE', 'SITE_SPECIFIC', 'POLICY_UPDATE', 'SHIFT_CHANGE', 'EMERGENCY_ALERT', 'TRAINING_NOTICE', 'SYSTEM_UPDATE')),
  CONSTRAINT valid_priority CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'))
);

-- Create announcement_reads table
CREATE TABLE IF NOT EXISTS announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  read_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, guard_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_announcements_tenant ON announcements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcements_site ON announcements(site_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_expires ON announcements(expires_at);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_guard ON announcement_reads(guard_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement ON announcement_reads(announcement_id);
