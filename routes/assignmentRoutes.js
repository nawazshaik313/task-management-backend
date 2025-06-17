
const express = require("express");
const router = express.Router();
const Assignment = require("../models/Assignment");
const Task = require('../models/Task');
const User = require('../models/User');
const { verifyToken, isAdmin } = require('../middleware/auth');
const emailService = require('../utils/emailService');

// Create a new assignment (Admin only, scoped to their organization)
router.post("/", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { taskId, personId, justification, status, deadline } = req.body;
    const organizationId = req.user.organizationId; // Admin's org

    if (!taskId || !personId) {
      return res.status(400).json({ success: false, message: "Task ID and Person ID are required." });
    }

    const taskExists = await Task.findOne({ _id: taskId, organizationId });
    const personToAssign = await User.findOne({ _id: personId, organizationId });
    if (!taskExists || !personToAssign) {
        return res.status(404).json({ success: false, message: "Task or Person not found in your organization."});
    }

    const newAssignment = new Assignment({
      taskId,
      personId,
      taskTitle: taskExists.title,
      personName: personToAssign.displayName,
      justification,
      status: status || 'pending_acceptance',
      deadline: deadline || taskExists.deadline,
      organizationId
    });

    const savedAssignment = await newAssignment.save();

    // Send email notification to the assigned user
    if (personToAssign.email && personToAssign.notificationPreference === 'email') {
        emailService.sendTaskProposalEmail(
            personToAssign.email,
            personToAssign.displayName,
            taskExists.title,
            req.user.displayName, // Admin's name
            savedAssignment.deadline
        ).catch(err => console.error("EmailJS Error (sendTaskProposalEmail):", err));
    }

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
router.get("/", verifyToken, async (req, res) => {
  try {
    let query = { organizationId: req.user.organizationId };
    if (req.user.role !== 'admin') {
      query.personId = req.user.id;
    }
    const assignments = await Assignment.find(query)
        .populate({ path: 'taskId', select: 'title description requiredSkills deadline', match: { organizationId: req.user.organizationId }})
        .sort({ createdAt: -1 });
    
    const validAssignments = assignments.filter(a => a.taskId); 
    res.json(validAssignments.map(assignment => assignment.toJSON()));
  } catch (err) {
    console.error("Error fetching assignments:", err);
    res.status(500).json({ success: false, message: "Server error while fetching assignments.", error: err.message });
  }
});

// Update assignment status or details (Protected, scoped)
router.patch("/", verifyToken, async (req, res) => {
  try {
    const { taskId, personId, status, userSubmissionDate, userDelayReason } = req.body;
    const organizationId = req.user.organizationId;

    if (!taskId || !personId) {
        return res.status(400).json({ success: false, message: "taskId and personId are required to identify the assignment." });
    }
    
    const assignment = await Assignment.findOne({ taskId, personId, organizationId })
        .populate('taskId', 'title') // For email notification
        .populate('personId', 'email displayName notificationPreference referringAdminId'); // For email notification

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found in your organization." });
    }

    // Authorization check
    let canUpdate = false;
    if (req.user.role === 'admin') { // Admin can approve, or update their own
        if (status === 'completed_admin_approved' || assignment.personId._id.toString() === req.user.id) {
            canUpdate = true;
        }
    } else if (assignment.personId._id.toString() === req.user.id) { // User updating their own
        if (['accepted_by_user', 'declined_by_user', 'submitted_on_time', 'submitted_late'].includes(status)) {
            canUpdate = true;
        }
    }

    if (!canUpdate) {
         return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to perform this status update." });
    }
    
    if (status) assignment.status = status;
    if (userSubmissionDate && assignment.personId._id.toString() === req.user.id) assignment.userSubmissionDate = userSubmissionDate;
    if (userDelayReason !== undefined && assignment.personId._id.toString() === req.user.id) assignment.userDelayReason = userDelayReason;

    const updatedAssignment = await assignment.save();
    const populatedUpdatedAssignment = await Assignment.findById(updatedAssignment._id)
        .populate('taskId', 'title')
        .populate('personId', 'email displayName notificationPreference referringAdminId');


    // Email Notifications
    const assignedUser = populatedUpdatedAssignment.personId;
    const taskTitle = populatedUpdatedAssignment.taskId.title;
    const currentUserPerformingAction = await User.findById(req.user.id).select('displayName email notificationPreference organizationId');


    if (status === 'completed_admin_approved' && assignedUser.email && assignedUser.notificationPreference === 'email') {
        emailService.sendTaskCompletionApprovedToUserEmail(
            assignedUser.email, assignedUser.displayName, taskTitle, currentUserPerformingAction.displayName
        ).catch(err => console.error("EmailJS Error (sendTaskCompletionApprovedToUserEmail):", err));
    } else if (['accepted_by_user', 'declined_by_user', 'submitted_on_time', 'submitted_late'].includes(status)) {
        // Notify admin(s)
        const adminsToNotify = await User.find({ role: 'admin', organizationId: currentUserPerformingAction.organizationId, notificationPreference: 'email' });
        
        // Prefer notifying referring admin if set and different from current user
        let specificAdminNotified = false;
        if (assignedUser.referringAdminId && assignedUser.referringAdminId.toString() !== currentUserPerformingAction._id.toString()) {
            const referringAdmin = await User.findById(assignedUser.referringAdminId).select('email displayName notificationPreference');
            if (referringAdmin && referringAdmin.email && referringAdmin.notificationPreference === 'email') {
                 emailService.sendTaskStatusUpdateToAdminEmail(
                    referringAdmin.email, referringAdmin.displayName, assignedUser.displayName, taskTitle, status.replace(/_/g, ' ')
                ).catch(err => console.error("EmailJS Error (sendTaskStatusUpdateToAdminEmail - referring):", err));
                specificAdminNotified = true;
            }
        }

        // If no specific admin was notified (or current user is the referring admin), notify all other admins in the org
        if (!specificAdminNotified) {
            adminsToNotify.forEach(admin => {
                if (admin.email && admin._id.toString() !== currentUserPerformingAction._id.toString()) { // Don't notify self if admin is the one making the change on their own task
                    emailService.sendTaskStatusUpdateToAdminEmail(
                        admin.email, admin.displayName, assignedUser.displayName, taskTitle, status.replace(/_/g, ' ')
                    ).catch(err => console.error("EmailJS Error (sendTaskStatusUpdateToAdminEmail - general admin):", err));
                }
            });
        }
    }
    res.json(populatedUpdatedAssignment.toJSON());
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
