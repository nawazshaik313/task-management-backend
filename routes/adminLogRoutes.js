
const express = require('express');
const router = express.Router();
const AdminLog = require('../models/AdminLog');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new admin log entry (Admin only, scoped to organization)
router.post('/', [verifyToken, isAdmin], async (req, res) => {
  try {
    const { logText, imagePreviewUrl } = req.body;
    const adminId = req.user.id; 
    const adminDisplayName = req.user.displayName;
    const organizationId = req.user.organizationId;

    if (!organizationId) {
      return res.status(403).json({ success: false, message: "Organization context missing for admin." });
    }
    if (!logText) {
      return res.status(400).json({ success: false, message: "Log text is required." });
    }

    const newLog = new AdminLog({
      adminId,
      adminDisplayName,
      logText,
      imagePreviewUrl,
      organizationId
    });

    const savedLog = await newLog.save();
    res.status(201).json(savedLog.toJSON());
  } catch (err) {
    console.error("Error creating admin log:", err);
    res.status(500).json({ success: false, message: "Server error while creating admin log.", error: err.message });
  }
});

// Get all admin logs (Admin only, sorted by most recent, scoped to organization)
router.get('/', [verifyToken, isAdmin], async (req, res) => {
  try {
    if (!req.user.organizationId) {
      return res.status(403).json({ success: false, message: "Organization context missing for admin." });
    }
    const logs = await AdminLog.find({ organizationId: req.user.organizationId }).sort({ timestamp: -1 });
    res.json(logs.map(log => log.toJSON()));
  } catch (err) {
    console.error("Error fetching admin logs:", err);
    res.status(500).json({ success: false, message: "Server error while fetching admin logs.", error: err.message });
  }
});

module.exports = router;
