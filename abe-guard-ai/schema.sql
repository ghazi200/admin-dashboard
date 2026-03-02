-- =========================================================
-- ABE SECURITY COMPANY
-- Full Database Schema + Seed Data
-- PostgreSQL
-- =========================================================

-- ---------- EXTENSIONS ----------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- TENANTS ----------
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ---------- ADMIN -----------
INSERT INTO admins (tenant_id, name, email, password_hash)

VALUES ( 
    '2f45b637-05fe-4c17-9ca2-ac79cd7cddf',
    'Main Admin',
    'admin@abe.com',
    '$2b$10$6z6K8T7YhJbT7O0hN.kv2Oa5n6QYk611u5h9G0Q9tT3qN5bR9jH.G'
)
ON CONFLICT (email) DO NOTHING;
-- ---------- GUARDS ----------
CREATE TABLE IF NOT EXISTS guards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN DEFAULT true,
    weekly_hours INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ---------- SHIFTS ----------
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    guard_id UUID REFERENCES guards(id),
    shift_date DATE NOT NULL,
    shift_start TIME NOT NULL,
    shift_end TIME NOT NULL,
    status TEXT CHECK (status IN ('SCHEDULED', 'OPEN', 'CLOSED')) DEFAULT 'OPEN',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ---------- CALLOUTS ----------
CREATE TABLE IF NOT EXISTS callouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    guard_id UUID NOT NULL REFERENCES guards(id),
    reason TEXT CHECK (reason IN ('SICK', 'EMERGENCY', 'PERSONAL')) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ---------- NOTIFICATIONS ----------
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guard_id UUID REFERENCES guards(id),
    shift_id UUID REFERENCES shifts(id),
    channel TEXT CHECK (channel IN ('SMS', 'EMAIL', 'CALL', 'APP')) NOT NULL,
    status TEXT CHECK (status IN ('SENT', 'ACCEPTED', 'DECLINED')) DEFAULT 'SENT',
    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- SEED DATA
-- =========================================================

-- Insert Tenant
INSERT INTO tenants (name)
SELECT 'ABE Security Company'
WHERE NOT EXISTS (
    SELECT 1 FROM tenants WHERE name = 'ABE Security Company'
);

-- ---------- INSERT GUARDS ----------
WITH t AS (
    SELECT id FROM tenants WHERE name = 'ABE Security Company'
)
INSERT INTO guards (tenant_id, name, phone, email, weekly_hours)
SELECT t.id, g.name, g.phone, g.email, g.hours
FROM t,
(
    VALUES
    ('Alice Johnson', '555-111-0001', 'alice@abe.com', 40),
    ('Bob Smith', '555-111-0002', 'bob@abe.com', 40),
    ('Charlie Davis', '555-111-0003', 'charlie@abe.com', 40),
    ('David Lee', '555-111-0004', 'david@abe.com', 16),
    ('Emma White', '555-111-0005', 'emma@abe.com', 16),
    ('Frank Harris', '555-111-0006', 'frank@abe.com', 16)
) AS g(name, phone, email, hours)
WHERE NOT EXISTS (
    SELECT 1 FROM guards WHERE email = g.email
);

-- ---------- CREATE SHIFTS (7 DAYS, 3 SHIFTS / DAY) ----------
WITH tenant AS (
    SELECT id FROM tenants WHERE name = 'ABE Security Company'
),
dates AS (
    SELECT generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '6 days', INTERVAL '1 day')::date AS shift_date
),
shift_times AS (
    SELECT '07:00'::time AS start_time, '15:00'::time AS end_time
    UNION ALL
    SELECT '15:00'::time, '23:00'::time
    UNION ALL
    SELECT '23:00'::time, '07:00'::time
)
INSERT INTO shifts (tenant_id, shift_date, shift_start, shift_end, status)
SELECT
    tenant.id,
    d.shift_date,
    s.start_time,
    s.end_time,
    'OPEN'
FROM tenant
CROSS JOIN dates d
CROSS JOIN shift_times s
WHERE NOT EXISTS (
    SELECT 1 FROM shifts
    WHERE shift_date = d.shift_date
      AND shift_start = s.start_time
);

-- =========================================================
-- END OF FILE
-- =========================================================
