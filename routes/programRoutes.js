
const express = require("express");
const router = express.Router();
const Program = require("../models/Program");
const Task = require("../models/Task"); 
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new program (Admin only, scoped to organization)
router.post("/", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { name, description } = req.body;
    const organizationId = req.user.organizationId;

    if (!organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing for admin." });
    }
    if (!name || !description) {
      return res.status(400).json({ success: false, message: "Program name and description are required." });
    }
    const newProgram = new Program({ name, description, organizationId });
    const savedProgram = await newProgram.save();
    res.status(201).json(savedProgram.toJSON());
  } catch (err) {
    console.error("Error creating program:", err);
    if (err.code === 11000) { // Handles unique index {name, organizationId}
        return res.status(400).json({ success: false, message: 'Program name already exists within your organization.' });
    }
    res.status(500).json({ success: false, message: "Server error while creating program.", error: err.message });
  }
});

// Get all programs (Protected, scoped to organization)
router.get("/", verifyToken, async (req, res) => {
  try {
     if (!req.user.organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing." });
    }
    const programs = await Program.find({ organizationId: req.user.organizationId }).sort({ name: 1 });
    res.json(programs.map(program => program.toJSON()));
  } catch (err) {
    console.error("Error fetching programs:", err);
    res.status(500).json({ success: false, message: "Server error while fetching programs.", error: err.message });
  }
});

// Get a specific program by ID (Protected, scoped to organization)
router.get("/:id", verifyToken, async (req, res) => {
  try {
    if (!req.user.organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing." });
    }
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

// Update a program (Admin only, scoped to organization)
router.put("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const { name, description } = req.body;
    const organizationId = req.user.organizationId;
     if (!organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing for admin." });
    }

    const updatedProgram = await Program.findOneAndUpdate(
      { _id: req.params.id, organizationId },
      { name, description, organizationId }, // ensure orgId is part of update if needed, though query scopes it
      { new: true, runValidators: true }
    );
    if (!updatedProgram) {
      return res.status(404).json({ success: false, message: "Program not found in your organization." });
    }
    // If program name changed, update tasks linked to this program within the same organization
    if (name) {
        await Task.updateMany({ programId: updatedProgram.id, organizationId }, { programName: name });
    }
    res.json(updatedProgram.toJSON());
  } catch (err) {
    console.error("Error updating program:", err);
     if (err.code === 11000) {
        return res.status(400).json({ success: false, message: 'Program name already exists within your organization.' });
    }
    res.status(500).json({ success: false, message: "Server error while updating program.", error: err.message });
  }
});

// Delete a program (Admin only, scoped to organization)
router.delete("/:id", [verifyToken, isAdmin], async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    if (!organizationId) {
        return res.status(403).json({ success: false, message: "Organization context missing for admin." });
    }
    const program = await Program.findOneAndDelete({ _id: req.params.id, organizationId });
    if (!program) {
      return res.status(404).json({ success: false, message: "Program not found in your organization." });
    }
    // Set programId to null for tasks associated with this program within the same organization
    await Task.updateMany({ programId: req.params.id, organizationId }, { $set: { programId: null, programName: null } });
    res.json({ success: true, message: "Program deleted and associated tasks updated." });
  } catch (err) {
    console.error("Error deleting program:", err);
    res.status(500).json({ success: false, message: "Server error while deleting program.", error: err.message });
  }
});

module.exports = router;
