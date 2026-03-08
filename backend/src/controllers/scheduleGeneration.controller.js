/**
 * Schedule Generation Controller
 * Handles API endpoints for automatic schedule generation
 */

const scheduleGenerationService = require('../services/scheduleGeneration.service');

/**
 * POST /api/admin/schedule-generation/generate
 * Generate shifts automatically
 */
exports.generate = async (req, res) => {
  try {
    const {
      tenantId,
      startDate,
      endDate,
      timeSlots,
      constraints = {}
    } = req.body;

    if (!tenantId || !startDate || !endDate) {
      return res.status(400).json({
        message: 'tenantId, startDate, and endDate are required'
      });
    }

    if (!timeSlots || timeSlots.length === 0) {
      return res.status(400).json({
        message: 'At least one time slot is required'
      });
    }

    const results = await scheduleGenerationService.generateSchedule({
      tenantId,
      startDate,
      endDate,
      timeSlots,
      constraints
    }, req.app.locals.models);

    const emitToRealtime = req.app.locals.emitToRealtime;
    if (emitToRealtime) {
      emitToRealtime(req.app, `tenant:${tenantId}`, "schedule_generated", {
        totalShifts: results.totalShifts,
        assignedShifts: results.assignedShifts.length
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: `Generated ${results.totalShifts} shifts`,
      results
    });
  } catch (error) {
    console.error('generate error:', error);
    return res.status(500).json({
      message: 'Failed to generate schedule',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/schedule-generation/generate-from-template
 * Generate schedule from a template
 */
exports.generateFromTemplate = async (req, res) => {
  try {
    const template = req.body;

    if (!template.tenantId || !template.startDate || !template.endDate) {
      return res.status(400).json({
        message: 'Template must include tenantId, startDate, and endDate'
      });
    }

    if (!template.timeSlots || template.timeSlots.length === 0) {
      return res.status(400).json({
        message: 'Template must include at least one time slot'
      });
    }

    const results = await scheduleGenerationService.generateFromTemplate(
      template,
      req.app.locals.models
    );

    const emitToRealtime = req.app.locals.emitToRealtime;
    if (emitToRealtime) {
      emitToRealtime(req.app, `tenant:${template.tenantId}`, "schedule_generated", {
        totalShifts: results.totalShifts,
        assignedShifts: results.assignedShifts.length,
        weeks: results.weeks?.length || 0
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: `Generated schedule from template`,
      results
    });
  } catch (error) {
    console.error('generateFromTemplate error:', error);
    return res.status(500).json({
      message: 'Failed to generate schedule from template',
      error: error.message
    });
  }
};
