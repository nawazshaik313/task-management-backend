
const express = require("express");
const router = express.Router();
const Assignment = require("../models/Assignment");
const Task = require('../models/Task');
const User = require('../models/User');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new assignment (Admin only, scoped to their organization)
router.post("/", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { taskId, personId, justification, status, deadline } = req.body;
    const organizationId = req.user.organizationId;

    if (!taskId || !personId) {
      return res.status(400).json({ success: false, message: "Task ID and Person ID are required." });
    }

    const taskExists = await Task.findOne({ _id: taskId, organizationId });
    const personExists = await User.findOne({ _id: personId, organizationId });
    if (!taskExists || !personExists) {
        return res.status(404).json({ success: false, message: "Task or Person not found in your organization."});
    }

    const newAssignment = new Assignment({
      taskId,
      personId,
      taskTitle: taskExists.title,
      personName: personExists.displayName,
      justification,
      status: status || 'pending_acceptance',
      deadline: deadline || taskExists.deadline,
      organizationId
    });

    const savedAssignment = await newAssignment.save();
    res.status(201).json(savedAssignment.toJSON());
  } catch (err) {
    console.error("Error creating assignment:", err);
    if (err.code === 11000) {
        return res.status(409).json({ success: false, message: "This task is already assigned to this person in your organization." });
    }
    res.status(500).json({ success: false, message: "Server error while creating assignment.", error: err.message });
  }
});

// Get all assignments (Protected, scoped)
// Admins see all for their org, users see only their own.
router.get("/", verifyToken, async (req, res) => {
  try {
    let query = { organizationId: req.user.organizationId };
    if (req.user.role !== 'admin') {
      query.personId = req.user.id;
    }
    const assignments = await Assignment.find(query)
        .populate({ path: 'taskId', select: 'title description requiredSkills', match: { organizationId: req.user.organizationId }})
        .sort({ createdAt: -1 });
    
    // Filter out assignments where populated taskId is null (due to organization mismatch, though query should handle)
    const validAssignments = assignments.filter(a => a.taskId); 
    res.json(validAssignments.map(assignment => assignment.toJSON()));
  } catch (err) {
    console.error("Error fetching assignments:", err);
    res.status(500).json({ success: false, message: "Server error while fetching assignments.", error: err.message });
  }
});

// Update assignment status or details (Protected, scoped)
router.patch("/:id", verifyToken, async (req, res) => {
  try {
    const { status, userSubmissionDate, userDelayReason } = req.body;
    const organizationId = req.user.organizationId;
    const assignmentId = req.params.id;

    const assignment = await Assignment.findOne({ _id: assignmentId, organizationId });
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found in your organization." });
    }

    if (req.user.role !== 'admin' && assignment.personId.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: "Forbidden: You can only update your own assignments." });
    }
    
    // Allow admin to approve, or user to change their own status
    if (status) {
        if (req.user.role === 'admin' && status === 'completed_admin_approved') {
            assignment.status = status;
        } else if (assignment.personId.toString() === req.user.id && ['accepted_by_user', 'declined_by_user', 'submitted_on_time', 'submitted_late'].includes(status) ) {
            assignment.status = status;
        } else if (req.user.role === 'admin' && assignment.personId.toString() === req.user.id && status !== 'completed_admin_approved'){
            // Admin updating their own task status (not as an approval)
             assignment.status = status;
        }
         else if (req.user.role === 'admin' && status !== 'completed_admin_approved') {
            // Admin trying to change status other than approval for another user - disallow or handle carefully
            // For now, only user or admin-approval changes status for others.
            return res.status(403).json({ success: false, message: "Admins can only approve completion for other users' assignments or manage their own." });
        }
    }

    if (userSubmissionDate && assignment.personId.toString() === req.user.id) assignment.userSubmissionDate = userSubmissionDate;
    if (userDelayReason !== undefined && assignment.personId.toString() === req.user.id) assignment.userDelayReason = userDelayReason;

    const savedAssignment = await assignment.save();
    const populatedAssignment = await savedAssignment.populate({
        path: 'taskId', 
        select: 'title description requiredSkills', 
        match: { organizationId: req.user.organizationId }
    });
    res.json(populatedAssignment.toJSON());
  } catch (err) {
    console.error("Error updating assignment:", err);
    res.status(500).json({ success: false, message: "Server error while updating assignment.", error: err.message });
  }
});

// Delete an assignment (Admin only - generally not recommended, prefer status changes, scoped)
router.delete("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const assignment = await Assignment.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found in your organization." });
    }
    res.json({ success: true, message: "Assignment deleted successfully." });
  } catch (err) {
    console.error("Error deleting assignment:", err);
    res.status(500).json({ success: false, message: "Server error while deleting assignment.", error: err.message });
  }
});

module.exports = router;
