
const express = require("express");
const router = express.Router();
const Program = require("../models/Program");
const Task = require("../models/Task");
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new program (Admin only, scoped to their organization)
router.post("/", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { name, description } = req.body;
    const organizationId = req.user.organizationId;

    if (!name || !description) {
      return res.status(400).json({ success: false, message: "Program name and description are required." });
    }
    // Check if program name already exists for this organization
    const existingProgram = await Program.findOne({ name, organizationId });
    if (existingProgram) {
        return res.status(400).json({ success: false, message: 'Program name already exists in your organization.' });
    }

    const newProgram = new Program({ name, description, organizationId });
    const savedProgram = await newProgram.save();
    res.status(201).json(savedProgram.toJSON());
  } catch (err) {
    console.error("Error creating program:", err);
    if (err.code === 11000) { // Should be caught by pre-check now
        return res.status(400).json({ success: false, message: 'Program name already exists in your organization (concurrent request?).' });
    }
    res.status(500).json({ success: false, message: "Server error while creating program.", error: err.message });
  }
});

// Get all programs (Protected, scoped to user's organization)
router.get("/", verifyToken, async (req, res) => {
  try {
    const programs = await Program.find({ organizationId: req.user.organizationId }).sort({ name: 1 });
    res.json(programs.map(program => program.toJSON()));
  } catch (err) {
    console.error("Error fetching programs:", err);
    res.status(500).json({ success: false, message: "Server error while fetching programs.", error: err.message });
  }
});

// Get a specific program by ID (Protected, scoped)
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const program = await Program.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!program) {
      return res.status(404).json({ success: false, message: "Program not found in your organization." });
    }
    res.json(program.toJSON());
  } catch (err) {
    console.error("Error fetching program by ID:", err);
    res.status(500).json({ success: false, message: "Server error while fetching program.", error: err.message });
  }
});

// Update a program (Admin only, scoped)
router.put("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { name, description } = req.body;
    const organizationId = req.user.organizationId;

    const programToUpdate = await Program.findOne({ _id: req.params.id, organizationId });
    if (!programToUpdate) {
        return res.status(404).json({ success: false, message: "Program not found in your organization." });
    }

    if (name && name !== programToUpdate.name) {
        const existingProgram = await Program.findOne({ name, organizationId });
        if (existingProgram) {
            return res.status(400).json({ success: false, message: 'Another program with this name already exists in your organization.' });
        }
    }

    const updatedProgram = await Program.findByIdAndUpdate(
      req.params.id,
      { name, description }, // organizationId does not change
      { new: true, runValidators: true }
    );
    
    if (name && name !== programToUpdate.name) { // If name changed
        await Task.updateMany({ programId: updatedProgram.id, organizationId }, { programName: name });
    }
    res.json(updatedProgram.toJSON());
  } catch (err) {
    console.error("Error updating program:", err);
     if (err.code === 11000) { // Should be caught by pre-check
        return res.status(400).json({ success: false, message: 'Program name already exists in your organization (concurrent request?).' });
    }
    res.status(500).json({ success: false, message: "Server error while updating program.", error: err.message });
  }
});

// Delete a program (Admin only, scoped)
router.delete("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const program = await Program.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!program) {
      return res.status(404).json({ success: false, message: "Program not found in your organization." });
    }
    await Task.updateMany({ programId: req.params.id, organizationId: req.user.organizationId }, { $set: { programId: null, programName: null } });
    res.json({ success: true, message: "Program deleted and associated tasks updated." });
  } catch (err) {
    console.error("Error deleting program:", err);
    res.status(500).json({ success: false, message: "Server error while deleting program.", error: err.message });
  }
});

module.exports = router;