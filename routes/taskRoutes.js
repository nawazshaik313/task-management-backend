
const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const Program = require("../models/Program");
const Assignment = require('../models/Assignment');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new task (Admin only, scoped to their organization)
router.post("/", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { title, description, requiredSkills, programId, deadline } = req.body;
    const organizationId = req.user.organizationId;

    if (!title || !description || !requiredSkills) {
      return res.status(400).json({ success: false, message: "Title, description, and required skills are required." });
    }

    let programName;
    const finalProgramId = programId || null; // Coerce empty string/falsy values to null

    if (finalProgramId) {
        const program = await Program.findOne({ _id: finalProgramId, organizationId });
        if (!program) return res.status(404).json({ success: false, message: "Program not found in your organization." });
        programName = program.name;
    }

    const newTask = new Task({ 
        title, 
        description, 
        requiredSkills, 
        programId: finalProgramId, 
        programName, 
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
    const tasks = await Task.find({ organizationId: req.user.organizationId }).sort({ createdAt: -1 });
    res.json(tasks.map(task => task.toJSON()));
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ success: false, message: "Server error while fetching tasks.", error: err.message });
  }
});

// Get a specific task by ID (Protected, scoped)
router.get("/:id", verifyToken, async (req, res) => {
  try {
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

// Update a task (Admin only, scoped)
router.put("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { title, description, requiredSkills, programId, deadline } = req.body;
    const organizationId = req.user.organizationId;

    const taskToUpdate = await Task.findOne({ _id: req.params.id, organizationId });
    if (!taskToUpdate) {
        return res.status(404).json({ success: false, message: "Task not found in your organization." });
    }
    
    let programName;
    if (programId) {
        const program = await Program.findOne({ _id: programId, organizationId });
        if (!program) return res.status(404).json({ success: false, message: "Program not found in your organization." });
        programName = program.name;
    } else if (programId === null || programId === '') { // Explicitly clearing program
        programName = null;
    }


    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { title, description, requiredSkills, programId: programId || null, programName, deadline },
      { new: true, runValidators: true }
    );
    // findByIdAndUpdate doesn't need second check for org because findOne already did.
    res.json(updatedTask.toJSON());
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ success: false, message: "Server error while updating task.", error: err.message });
  }
});

// Delete a task (Admin only, scoped)
router.delete("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found in your organization." });
    }
    await Assignment.deleteMany({ taskId: req.params.id, organizationId: req.user.organizationId });
    res.json({ success: true, message: "Task and related assignments deleted successfully." });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ success: false, message: "Server error while deleting task.", error: err.message });
  }
});

module.exports = router;