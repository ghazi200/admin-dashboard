// src/components/OvertimeBreakdown.jsx
import React from "react";
import "./OvertimeBreakdown.css";

/**
 * OvertimeBreakdown Component
 * Displays regular, overtime, and double-time hours breakdown
 */
export default function OvertimeBreakdown({ 
  regularHours = 0, 
  overtimeHours = 0, 
  doubleTimeHours = 0,
  totalHours = null,
  showLabels = true,
  compact = false,
}) {
  const reg = parseFloat(regularHours) || 0;
  const ot = parseFloat(overtimeHours) || 0;
  const dt = parseFloat(doubleTimeHours) || 0;
  const total = totalHours !== null ? parseFloat(totalHours) : (reg + ot + dt);
  const hasOvertime = ot > 0 || dt > 0;

  if (compact) {
    // Always show regular hours if we have any hours
    const showRegular = reg > 0 || (total > 0 && reg === 0 && !hasOvertime);
    
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
        {showRegular && (
          <span 
            className="ot-badge regular" 
            title="Regular hours"
            style={{ 
              display: 'inline-block',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              background: '#22c55e',
              color: 'white',
              border: '1px solid #16a34a',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
            }}
          >
            {reg > 0 ? `${reg.toFixed(1)}h` : (hasOvertime ? '0.0h' : `${total.toFixed(1)}h`)} Regular
          </span>
        )}
        {(ot > 0 || dt > 0) && (
          <>
            {ot > 0 && (
              <span 
                className="ot-badge overtime" 
                title="Overtime hours (1.5x pay)"
                style={{ 
                  display: 'inline-block',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: '#f97316',
                  color: 'white',
                  border: '1px solid #ea580c',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }}
              >
                {ot.toFixed(1)}h OT
              </span>
            )}
            {dt > 0 && (
              <span 
                className="ot-badge double-time" 
                title="Double-time hours (2.0x pay)"
                style={{ 
                  display: 'inline-block',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: '#ef4444',
                  color: 'white',
                  border: '1px solid #dc2626',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }}
              >
                {dt.toFixed(1)}h DT
              </span>
            )}
          </>
        )}
        {!hasOvertime && reg === 0 && total === 0 && (
          <span 
            className="ot-badge no-data" 
            title="No overtime data available"
            style={{ 
              display: 'inline-block',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'rgba(107, 114, 128, 0.1)',
              color: '#6b7280',
              fontStyle: 'italic'
            }}
          >
            No data
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="overtime-breakdown">
      {showLabels && (
        <div className="ot-label" style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          Hours Breakdown:
        </div>
      )}
      <div className="ot-bars">
        {reg > 0 && (
          <div className="ot-bar-container">
            <div className="ot-bar regular" style={{ width: `${(reg / total) * 100}%` }}>
              <span className="ot-bar-label">{reg.toFixed(1)}h</span>
            </div>
          </div>
        )}
        {ot > 0 && (
          <div className="ot-bar-container">
            <div className="ot-bar overtime" style={{ width: `${(ot / total) * 100}%` }}>
              <span className="ot-bar-label">{ot.toFixed(1)}h OT</span>
            </div>
          </div>
        )}
        {dt > 0 && (
          <div className="ot-bar-container">
            <div className="ot-bar double-time" style={{ width: `${(dt / total) * 100}%` }}>
              <span className="ot-bar-label">{dt.toFixed(1)}h DT</span>
            </div>
          </div>
        )}
        {!hasOvertime && reg === 0 && total === 0 && (
          <div className="ot-bar-container">
            <div className="ot-bar no-data" style={{ width: "100%" }}>
              <span className="ot-bar-label">No data</span>
            </div>
          </div>
        )}
      </div>
      {hasOvertime && (
        <div className="ot-summary" style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
          Total: {total.toFixed(1)}h ({reg > 0 && `${reg.toFixed(1)}h reg`} {ot > 0 && `+ ${ot.toFixed(1)}h OT`} {dt > 0 && `+ ${dt.toFixed(1)}h DT`})
        </div>
      )}
    </div>
  );
}
