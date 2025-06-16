
const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const Assignment = require('../models/Assignment'); // To handle cascading deletes
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new task (Admin only)
router.post("/", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { title, description, requiredSkills, programId, programName, deadline } = req.body;
    if (!title || !description || !requiredSkills) {
      return res.status(400).json({ success: false, message: "Title, description, and required skills are required." });
    }
    const newTask = new Task({ title, description, requiredSkills, programId, programName, deadline });
    const savedTask = await newTask.save();
    res.status(201).json(savedTask.toJSON());
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ success: false, message: "Server error while creating task.", error: err.message });
  }
});

// Get all tasks (Protected)
router.get("/", verifyToken, async (req, res) => {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    res.json(tasks.map(task => task.toJSON()));
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ success: false, message: "Server error while fetching tasks.", error: err.message });
  }
});

// Get a specific task by ID (Protected)
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }
    res.json(task.toJSON());
  } catch (err) {
    console.error("Error fetching task by ID:", err);
    res.status(500).json({ success: false, message: "Server error while fetching task.", error: err.message });
  }
});

// Update a task (Admin only)
router.put("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { title, description, requiredSkills, programId, programName, deadline } = req.body;
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { title, description, requiredSkills, programId, programName, deadline },
      { new: true, runValidators: true }
    );
    if (!updatedTask) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }
    res.json(updatedTask.toJSON());
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ success: false, message: "Server error while updating task.", error: err.message });
  }
});

// Delete a task (Admin only)
router.delete("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }
    // Also delete assignments related to this task
    await Assignment.deleteMany({ taskId: req.params.id });
    res.json({ success: true, message: "Task and related assignments deleted successfully." });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ success: false, message: "Server error while deleting task.", error: err.message });
  }
});

module.exports = router;