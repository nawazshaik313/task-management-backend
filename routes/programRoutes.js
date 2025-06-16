
const express = require("express");
const router = express.Router();
const Program = require("../models/Program");
const Task = require("../models/Task"); // To handle tasks when a program is deleted
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new program (Admin only)
router.post("/", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !description) {
      return res.status(400).json({ success: false, message: "Program name and description are required." });
    }
    const newProgram = new Program({ name, description });
    const savedProgram = await newProgram.save();
    res.status(201).json(savedProgram.toJSON());
  } catch (err) {
    console.error("Error creating program:", err);
    if (err.code === 11000) {
        return res.status(400).json({ success: false, message: 'Program name already exists.' });
    }
    res.status(500).json({ success: false, message: "Server error while creating program.", error: err.message });
  }
});

// Get all programs (Protected)
router.get("/", verifyToken, async (req, res) => {
  try {
    const programs = await Program.find().sort({ name: 1 });
    res.json(programs.map(program => program.toJSON()));
  } catch (err) {
    console.error("Error fetching programs:", err);
    res.status(500).json({ success: false, message: "Server error while fetching programs.", error: err.message });
  }
});

// Get a specific program by ID (Protected)
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const program = await Program.findById(req.params.id);
    if (!program) {
      return res.status(404).json({ success: false, message: "Program not found." });
    }
    res.json(program.toJSON());
  } catch (err) {
    console.error("Error fetching program by ID:", err);
    res.status(500).json({ success: false, message: "Server error while fetching program.", error: err.message });
  }
});

// Update a program (Admin only)
router.put("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { name, description } = req.body;
    const updatedProgram = await Program.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true, runValidators: true }
    );
    if (!updatedProgram) {
      return res.status(404).json({ success: false, message: "Program not found." });
    }
    // If program name changed, update tasks linked to this program
    if (name) {
        await Task.updateMany({ programId: updatedProgram.id }, { programName: name });
    }
    res.json(updatedProgram.toJSON());
  } catch (err) {
    console.error("Error updating program:", err);
     if (err.code === 11000) {
        return res.status(400).json({ success: false, message: 'Program name already exists.' });
    }
    res.status(500).json({ success: false, message: "Server error while updating program.", error: err.message });
  }
});

// Delete a program (Admin only)
router.delete("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const program = await Program.findByIdAndDelete(req.params.id);
    if (!program) {
      return res.status(404).json({ success: false, message: "Program not found." });
    }
    // Option: Set programId to null for tasks associated with this program
    await Task.updateMany({ programId: req.params.id }, { $set: { programId: null, programName: null } });
    res.json({ success: true, message: "Program deleted and associated tasks updated." });
  } catch (err) {
    console.error("Error deleting program:", err);
    res.status(500).json({ success: false, message: "Server error while deleting program.", error: err.message });
  }
});

module.exports = router;