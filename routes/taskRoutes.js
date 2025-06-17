
const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const Assignment = require('../models/Assignment'); // To handle cascading deletes
const Program = require('../models/Program'); // To validate program belongs to org
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new task (Admin only, scoped to organization)
router.post("/", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { title, description, requiredSkills, programId, deadline } = req.body;
    const organizationId = req.user.organizationId;

    if (!organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing for admin." });
    }
    if (!title || !description || !requiredSkills) {
      return res.status(400).json({ success: false, message: "Title, description, and required skills are required." });
    }

    let programName;
    if (programId) {
        const program = await Program.findOne({ _id: programId, organizationId });
        if (!program) {
            return res.status(400).json({ success: false, message: "Program not found or does not belong to your organization." });
        }
        programName = program.name;
    }

    const newTask = new Task({ 
        title, description, requiredSkills, 
        programId: programId || null, 
        programName: programName || null, 
        deadline, 
        organizationId 
    });
    const savedTask = await newTask.save();
    res.status(201).json(savedTask.toJSON());
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ success: false, message: "Server error while creating task.", error: err.message });
  }
});

// Get all tasks (Protected, scoped to user's organization)
router.get("/", verifyToken, async (req, res) => {
  try {
    if (!req.user.organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing." });
    }
    const tasks = await Task.find({ organizationId: req.user.organizationId }).sort({ createdAt: -1 });
    res.json(tasks.map(task => task.toJSON()));
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ success: false, message: "Server error while fetching tasks.", error: err.message });
  }
});

// Get a specific task by ID (Protected, scoped to organization)
router.get("/:id", verifyToken, async (req, res) => {
  try {
    if (!req.user.organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing." });
    }
    const task = await Task.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found in your organization." });
    }
    res.json(task.toJSON());
  } catch (err) {
    console.error("Error fetching task by ID:", err);
    res.status(500).json({ success: false, message: "Server error while fetching task.", error: err.message });
  }
});

// Update a task (Admin only, scoped to organization)
router.put("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { title, description, requiredSkills, programId, deadline } = req.body;
    const organizationId = req.user.organizationId;

    if (!organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing for admin." });
    }

    let programName;
    if (programId) {
        const program = await Program.findOne({ _id: programId, organizationId });
        if (!program) {
            return res.status(400).json({ success: false, message: "Program not found or does not belong to your organization." });
        }
        programName = program.name;
    }


    const updatedTask = await Task.findOneAndUpdate(
      { _id: req.params.id, organizationId },
      { title, description, requiredSkills, programId: programId || null, programName: programName || null, deadline, organizationId }, // Ensure orgId is part of update
      { new: true, runValidators: true }
    );
    if (!updatedTask) {
      return res.status(404).json({ success: false, message: "Task not found in your organization or update failed." });
    }
    res.json(updatedTask.toJSON());
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ success: false, message: "Server error while updating task.", error: err.message });
  }
});

// Delete a task (Admin only, scoped to organization)
router.delete("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    if (!req.user.organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing for admin." });
    }
    const task = await Task.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found in your organization." });
    }
    // Also delete assignments related to this task within the same organization
    await Assignment.deleteMany({ taskId: req.params.id, organizationId: req.user.organizationId });
    res.json({ success: true, message: "Task and related assignments deleted successfully." });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ success: false, message: "Server error while deleting task.", error: err.message });
  }
});

module.exports = router;
