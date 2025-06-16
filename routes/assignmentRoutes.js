
const express = require("express");
const router = express.Router();
const Assignment = require("../models/Assignment");
const Task = require('../models/Task');
const User = require('../models/User');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new assignment (Admin only)
router.post("/", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { taskId, personId, taskTitle, personName, justification, status, deadline } = req.body;

    if (!taskId || !personId || !taskTitle || !personName) {
      return res.status(400).json({ success: false, message: "Task ID, Person ID, Task Title, and Person Name are required." });
    }

    // Verify task and person exist
    const taskExists = await Task.findById(taskId);
    const personExists = await User.findById(personId);
    if (!taskExists || !personExists) {
        return res.status(404).json({ success: false, message: "Task or Person not found."});
    }

    const newAssignment = new Assignment({
      taskId,
      personId,
      taskTitle: taskExists.title, // Use title from actual task
      personName: personExists.displayName, // Use name from actual user
      justification,
      status: status || 'pending_acceptance',
      deadline: deadline || taskExists.deadline // Use specific or task's deadline
    });

    const savedAssignment = await newAssignment.save();
    res.status(201).json(savedAssignment.toJSON());
  } catch (err) {
    console.error("Error creating assignment:", err);
    if (err.code === 11000) { // MongoError: E11000 duplicate key error
        return res.status(409).json({ success: false, message: "This task is already assigned to this person." });
    }
    res.status(500).json({ success: false, message: "Server error while creating assignment.", error: err.message });
  }
});

// Get all assignments (Protected)
// Admins see all, users see only their own.
router.get("/", verifyToken, async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      query.personId = req.user.id;
    }
    const assignments = await Assignment.find(query).populate('taskId', 'title description requiredSkills').sort({ createdAt: -1 });
    res.json(assignments.map(assignment => assignment.toJSON()));
  } catch (err) {
    console.error("Error fetching assignments:", err);
    res.status(500).json({ success: false, message: "Server error while fetching assignments.", error: err.message });
  }
});

// Update assignment status or details (Protected)
// User can update their own (e.g., accept, decline, submit). Admin can approve.
router.patch("/", verifyToken, async (req, res) => {
  try {
    const { taskId, personId, status, userSubmissionDate, userDelayReason } = req.body;

    if (!taskId || !personId) {
        return res.status(400).json({ success: false, message: "taskId and personId are required in the body to identify the assignment." });
    }
    
    const assignment = await Assignment.findOne({ taskId, personId });
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found." });
    }

    // Authorization: User can only modify their own assignments, Admin can modify any for approval.
    if (req.user.role !== 'admin' && assignment.personId.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: "Forbidden: You can only update your own assignments." });
    }
    if (req.user.role === 'admin' && status !== 'completed_admin_approved' && assignment.personId.toString() === req.user.id) {
        // Admin trying to update their own task not as an admin approval action
         if (status && status !== 'completed_admin_approved') assignment.status = status;

    } else if (req.user.role === 'admin' && status === 'completed_admin_approved') {
        assignment.status = status; // Admin approving
    } else if (req.user.role !== 'admin') { // Regular user actions
        if (status) assignment.status = status;
    }


    if (userSubmissionDate) assignment.userSubmissionDate = userSubmissionDate;
    if (userDelayReason !== undefined) assignment.userDelayReason = userDelayReason; // Allow clearing reason

    const updatedAssignment = await assignment.save();
    res.json(updatedAssignment.toJSON());
  } catch (err) {
    console.error("Error updating assignment:", err);
    res.status(500).json({ success: false, message: "Server error while updating assignment.", error: err.message });
  }
});


// Delete an assignment (Admin only - generally not recommended, prefer status changes)
router.delete("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const assignment = await Assignment.findByIdAndDelete(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found." });
    }
    res.json({ success: true, message: "Assignment deleted successfully." });
  } catch (err) {
    console.error("Error deleting assignment:", err);
    res.status(500).json({ success: false, message: "Server error while deleting assignment.", error: err.message });
  }
});


module.exports = router;