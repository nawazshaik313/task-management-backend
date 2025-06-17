
const express = require("express");
const router = express.Router();
const Assignment = require("../models/Assignment");
const Task = require('../models/Task');
const User = require('../models/User');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new assignment (Admin only, scoped to organization)
router.post("/", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { taskId, personId, justification, status, deadline } = req.body;
    const organizationId = req.user.organizationId;

    if (!organizationId) {
      return res.status(403).json({ success: false, message: "Organization context missing for admin." });
    }
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

// Get all assignments (Protected, scoped to organization)
router.get("/", verifyToken, async (req, res) => {
  try {
    if (!req.user.organizationId) {
      return res.status(403).json({ success: false, message: "Organization context missing." });
    }
    let query = { organizationId: req.user.organizationId };
    if (req.user.role !== 'admin') {
      query.personId = req.user.id;
    }
    const assignments = await Assignment.find(query)
        .populate({ path: 'taskId', select: 'title description requiredSkills', match: { organizationId: req.user.organizationId } })
        .sort({ createdAt: -1 });
    
    // Filter out assignments where taskId might be null after populate if task was from different org (shouldn't happen with correct query)
    const validAssignments = assignments.filter(a => a.taskId); 
    res.json(validAssignments.map(assignment => assignment.toJSON()));
  } catch (err) {
    console.error("Error fetching assignments:", err);
    res.status(500).json({ success: false, message: "Server error while fetching assignments.", error: err.message });
  }
});

// Update assignment status or details (Protected, scoped to organization)
router.patch("/", verifyToken, async (req, res) => {
  try {
    const { taskId, personId, status, userSubmissionDate, userDelayReason } = req.body;
    const organizationId = req.user.organizationId;

    if (!organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing." });
    }
    if (!taskId || !personId) {
        return res.status(400).json({ success: false, message: "taskId and personId are required." });
    }
    
    const assignment = await Assignment.findOne({ taskId, personId, organizationId });
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found in your organization." });
    }

    if (req.user.role !== 'admin' && assignment.personId.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: "Forbidden: You can only update your own assignments." });
    }
    
    if (req.user.role === 'admin' && status === 'completed_admin_approved') {
        assignment.status = status; 
    } else if (req.user.role !== 'admin') { 
        if (status && (status === 'accepted_by_user' || status === 'declined_by_user' || status === 'submitted_on_time' || status === 'submitted_late')) {
            assignment.status = status;
        } else if (status) {
            return res.status(400).json({ success: false, message: "Invalid status update for user." });
        }
    } else if (status) { // Admin trying to set other statuses (e.g. if they were assigned a task themselves)
         assignment.status = status;
    }


    if (userSubmissionDate) assignment.userSubmissionDate = userSubmissionDate;
    if (userDelayReason !== undefined) assignment.userDelayReason = userDelayReason; 

    const updatedAssignment = await assignment.save();
    res.json(updatedAssignment.toJSON());
  } catch (err) {
    console.error("Error updating assignment:", err);
    res.status(500).json({ success: false, message: "Server error while updating assignment.", error: err.message });
  }
});


// Delete an assignment (Admin only - generally not recommended, prefer status changes, scoped to organization)
router.delete("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
     if (!req.user.organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing for admin." });
    }
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
