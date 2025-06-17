
const express = require('express');
const router = express.Router();
const PendingUser = require('../models/PendingUser');
const User = require('../models/User'); 
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new pending user registration
router.post('/', async (req, res) => {
  let { displayName, email, password, role, uniqueId, referringAdminId } = req.body;

  if (!displayName || !email || !password || !role || !uniqueId) {
    return res.status(400).json({ success: false, error: 'Missing required fields for pending user.' });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }] });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already registered as an active user.' });
    }
    const existingPendingUser = await PendingUser.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }] });
    if (existingPendingUser) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already pending approval.' });
    }
    
    // Allow 'admin' role for pending user directly. Approval logic will handle final creation.
    // The role from req.body will be used directly for the PendingUser document.
    
    const newPendingUser = new PendingUser({
      displayName,
      email,
      password, 
      role, // Use role from request; no downgrade here
      uniqueId,
      referringAdminId: referringAdminId || null
    });

    const savedPendingUser = await newPendingUser.save();
    res.status(201).json({ success: true, user: savedPendingUser.toJSON() });
  } catch (err) {
    console.error("Error creating pending user:", err);
    if (err.code === 11000) {
        return res.status(409).json({ success: false, error: 'Duplicate email or uniqueId for pending user.' });
    }
    res.status(500).json({ success: false, error: 'Failed to save pending user: ' + err.message });
  }
});

// Get all pending users (Admin only)
router.get('/', [verifyToken, isAdmin], async (req, res) => {
  try {
    const pendingUsers = await PendingUser.find().sort({ submissionDate: -1 });
    res.json(pendingUsers.map(pu => pu.toJSON()));
  } catch (err) {
    console.error("Error fetching pending users:", err);
    res.status(500).json({ success: false, error: 'Server error while fetching pending users.' });
  }
});

// Delete a pending user (Admin only - for rejection)
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
  try {
    const pendingUser = await PendingUser.findByIdAndDelete(req.params.id);
    if (!pendingUser) {
      return res.status(404).json({ success: false, error: 'Pending user not found.' });
    }
    res.json({ success: true, message: 'Pending user rejected and removed successfully.' });
  } catch (err) {
    console.error("Error deleting pending user:", err);
    res.status(500).json({ success: false, error: 'Server error while deleting pending user.' });
  }
});

// Approve a pending user (Admin only)
router.post('/approve/:id', [verifyToken, isAdmin], async (req, res) => {
  const pendingUserId = req.params.id;
  const { position, userInterests, phone, notificationPreference, role: requestedApprovedRole } = req.body;

  try {
    const pendingUser = await PendingUser.findById(pendingUserId);
    if (!pendingUser) {
      return res.status(404).json({ success: false, error: 'Pending user not found.' });
    }

    const existingUser = await User.findOne({ $or: [{ email: pendingUser.email }, { uniqueId: pendingUser.uniqueId }] });
    if (existingUser) {
      await PendingUser.findByIdAndDelete(pendingUserId);
      return res.status(409).json({ success: false, error: 'User with this email or unique ID already exists. Pending entry removed.' });
    }

    if (pendingUser.referringAdminId && pendingUser.referringAdminId.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: "Forbidden: You can only approve users you referred or general registrations." });
    }
    
    // Determine final role for the approved user
    const adminCount = await User.countDocuments({ role: 'admin' });
    let finalApprovedRole = 'user'; // Default to user

    // If the pending user was intended to be an admin OR admin explicitly requests to approve as admin
    if (pendingUser.role === 'admin' || requestedApprovedRole === 'admin') {
        if (adminCount === 0) { // And no active admin exists, make this the first admin
            finalApprovedRole = 'admin';
        } else { // Other admins exist, allow creating another admin
            finalApprovedRole = 'admin';
        }
    } else { // If pending user role was 'user' and no explicit request to upgrade to admin, keep as 'user'
        finalApprovedRole = 'user';
    }
    
    const newUser = new User({
      email: pendingUser.email,
      uniqueId: pendingUser.uniqueId,
      password: pendingUser.password, 
      displayName: pendingUser.displayName,
      role: finalApprovedRole,
      position: position || 'Default Position', 
      userInterests: userInterests || '',
      phone: phone || '',
      notificationPreference: notificationPreference || 'email',
      referringAdminId: pendingUser.referringAdminId || req.user.id 
    });
    
    const createdUser = await newUser.save(); 

    await PendingUser.findByIdAndDelete(pendingUserId); 

    res.status(201).json({ success: true, message: 'User approved and account activated.', user: createdUser.toJSON() });

  } catch (err) {
    console.error("Error approving pending user:", err);
    res.status(500).json({ success: false, error: 'Server error while approving user: ' + err.message });
  }
});


module.exports = router;
    