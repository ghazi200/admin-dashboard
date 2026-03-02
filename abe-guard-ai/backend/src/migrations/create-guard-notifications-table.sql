-- Create guard_notifications table for shift change alerts
CREATE TABLE IF NOT EXISTS public.guard_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guard_id UUID NOT NULL REFERENCES public.guards(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_guard_notifications_guard_id ON public.guard_notifications(guard_id);
CREATE INDEX IF NOT EXISTS idx_guard_notifications_shift_id ON public.guard_notifications(shift_id);
CREATE INDEX IF NOT EXISTS idx_guard_notifications_read_at ON public.guard_notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_guard_notifications_created_at ON public.guard_notifications(created_at DESC);

-- Add comment
COMMENT ON TABLE public.guard_notifications IS 'Notifications for guards about shift changes, assignments, cancellations, etc.';
