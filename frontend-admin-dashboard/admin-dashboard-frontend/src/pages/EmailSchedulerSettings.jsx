import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEmailSchedulerSettings, updateEmailSchedulerSettings } from "../services/api";
import Card from "../components/Card";

export default function EmailSchedulerSettings() {
  const queryClient = useQueryClient();
  const [scheduledReports, setScheduledReports] = useState({
    enabled: true,
    intervalMinutes: 60,
    runTimes: [],
  });
  const [scheduleEmails, setScheduleEmails] = useState({
    enabled: true,
    intervalMinutes: 360,
    runTimes: [],
  });

  // Fetch settings
  const { data: settingsData, isLoading, error: fetchError } = useQuery({
    queryKey: ["emailSchedulerSettings"],
    queryFn: async () => {
      const response = await getEmailSchedulerSettings();
      return response.data;
    },
    retry: 1,
  });

  // Initialize state when data loads
  useEffect(() => {
    if (settingsData) {
      if (settingsData.scheduledReports) {
        setScheduledReports({
          enabled: settingsData.scheduledReports.enabled !== false,
          intervalMinutes: settingsData.scheduledReports.intervalMinutes || 60,
          runTimes: settingsData.scheduledReports.runTimes || [],
        });
      }
      if (settingsData.scheduleEmails) {
        setScheduleEmails({
          enabled: settingsData.scheduleEmails.enabled !== false,
          intervalMinutes: settingsData.scheduleEmails.intervalMinutes || 360,
          runTimes: settingsData.scheduleEmails.runTimes || [],
        });
      }
    }
  }, [settingsData]);

  // Update mutations
  const updateScheduledReportsMutation = useMutation({
    mutationFn: async (data) => {
      const response = await updateEmailSchedulerSettings({
        settingType: "scheduled_reports",
        ...data,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailSchedulerSettings"] });
    },
  });

  const updateScheduleEmailsMutation = useMutation({
    mutationFn: async (data) => {
      const response = await updateEmailSchedulerSettings({
        settingType: "schedule_emails",
        ...data,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailSchedulerSettings"] });
    },
  });

  const handleSaveScheduledReports = () => {
    updateScheduledReportsMutation.mutate(scheduledReports);
  };

  const handleSaveScheduleEmails = () => {
    updateScheduleEmailsMutation.mutate(scheduleEmails);
  };

  const formatInterval = (minutes) => {
    if (minutes < 60) return `${minutes} minutes`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hours`;
    return `${Math.floor(minutes / 1440)} days`;
  };

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ opacity: 0.7 }}>Loading settings...</div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={{ padding: 40 }}>
        <div style={{ color: "#ef4444", marginBottom: 20 }}>
          Error loading settings: {fetchError?.response?.data?.message || fetchError?.message || "Unknown error"}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ margin: 0, marginBottom: 8, fontSize: 28, fontWeight: 800 }}>
          Email Scheduler Settings
        </h1>
        <div style={{ opacity: 0.7, fontSize: 14 }}>
          Configure automated email sending times and enable/disable features
        </div>
      </div>

      {/* Scheduled Reports Settings */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, marginBottom: 8, fontSize: 20, fontWeight: 800 }}>
            Scheduled Reports
          </h2>
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            Automatically send scheduled reports via email
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={scheduledReports.enabled}
              onChange={(e) =>
                setScheduledReports({ ...scheduledReports, enabled: e.target.checked })
              }
              style={{ width: 20, height: 20, cursor: "pointer" }}
            />
            <span style={{ fontWeight: 600 }}>Enable Scheduled Reports</span>
          </label>

          {scheduledReports.enabled && (
            <>
              <div>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                  Check Interval (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  value={scheduledReports.intervalMinutes}
                  onChange={(e) =>
                    setScheduledReports({
                      ...scheduledReports,
                      intervalMinutes: parseInt(e.target.value) || 60,
                    })
                  }
                  style={{
                    width: "100%",
                    maxWidth: 200,
                    padding: "8px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 15,
                  }}
                />
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.7 }}>
                  Currently: {formatInterval(scheduledReports.intervalMinutes)}
                </div>
              </div>
            </>
          )}

          <button
            onClick={handleSaveScheduledReports}
            disabled={updateScheduledReportsMutation.isPending}
            style={{
              padding: "10px 20px",
              background: "#22c55e",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 14,
              opacity: updateScheduledReportsMutation.isPending ? 0.5 : 1,
            }}
          >
            {updateScheduledReportsMutation.isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </Card>

      {/* Schedule Emails Settings */}
      <Card>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, marginBottom: 8, fontSize: 20, fontWeight: 800 }}>
            Schedule Emails to Guards
          </h2>
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            Automatically send guard schedule emails based on their preferences
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={scheduleEmails.enabled}
              onChange={(e) =>
                setScheduleEmails({ ...scheduleEmails, enabled: e.target.checked })
              }
              style={{ width: 20, height: 20, cursor: "pointer" }}
            />
            <span style={{ fontWeight: 600 }}>Enable Schedule Emails</span>
          </label>

          {scheduleEmails.enabled && (
            <>
              <div>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                  Check Interval (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  value={scheduleEmails.intervalMinutes}
                  onChange={(e) =>
                    setScheduleEmails({
                      ...scheduleEmails,
                      intervalMinutes: parseInt(e.target.value) || 360,
                    })
                  }
                  style={{
                    width: "100%",
                    maxWidth: 200,
                    padding: "8px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 15,
                  }}
                />
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.7 }}>
                  Currently: {formatInterval(scheduleEmails.intervalMinutes)}
                </div>
              </div>
            </>
          )}

          <button
            onClick={handleSaveScheduleEmails}
            disabled={updateScheduleEmailsMutation.isPending}
            style={{
              padding: "10px 20px",
              background: "#22c55e",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 14,
              opacity: updateScheduleEmailsMutation.isPending ? 0.5 : 1,
            }}
          >
            {updateScheduleEmailsMutation.isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </Card>
    </div>
  );
}
