
const express = require('express');
const router = express.Router();
const AdminLog = require('../models/AdminLog');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new admin log entry (Admin only)
router.post('/', [verifyToken, isAdmin], async (req, res) => {
  try {
    const { logText, imagePreviewUrl } = req.body;
    const adminId = req.user.id; // From JWT
    const adminDisplayName = req.user.displayName; // From JWT

    if (!logText) {
      return res.status(400).json({ success: false, message: "Log text is required." });
    }

    const newLog = new AdminLog({
      adminId,
      adminDisplayName,
      logText,
      imagePreviewUrl
    });

    const savedLog = await newLog.save();
    res.status(201).json(savedLog.toJSON());
  } catch (err) {
    console.error("Error creating admin log:", err);
    res.status(500).json({ success: false, message: "Server error while creating admin log.", error: err.message });
  }
});

// Get all admin logs (Admin only, sorted by most recent)
router.get('/', [verifyToken, isAdmin], async (req, res) => {
  try {
    const logs = await AdminLog.find().sort({ timestamp: -1 });
    res.json(logs.map(log => log.toJSON()));
  } catch (err) {
    console.error("Error fetching admin logs:", err);
    res.status(500).json({ success: false, message: "Server error while fetching admin logs.", error: err.message });
  }
});

module.exports = router;