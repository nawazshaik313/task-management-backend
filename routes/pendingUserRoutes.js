
const express = require('express');
const router = express.Router();
const PendingUser = require('../models/PendingUser');
const User = require('../models/User'); 
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new pending user registration
router.post('/', async (req, res) => {
  let { displayName, email, password, role, uniqueId, referringAdminId } = req.body;

  if (!displayName || !email || !password || !uniqueId) { // Role not strictly required here, will default to user for pre-reg
    return res.status(400).json({ success: false, error: 'Missing required fields for pending user (displayName, email, password, uniqueId).' });
  }

  // Pre-registrations should always be for 'user' role.
  const finalRole = 'user';

  let finalOrganizationId;

  if (referringAdminId) {
    try {
      const referrer = await User.findById(referringAdminId);
      if (referrer && referrer.organizationId && referrer.role === 'admin') {
          finalOrganizationId = referrer.organizationId;
      } else {
           return res.status(400).json({ success: false, error: 'Referring admin invalid, not an admin, or has no organization.' });
      }
    } catch (findAdminErr) {
        console.error("Error finding referring admin:", findAdminErr);
        return res.status(500).json({ success: false, error: 'Server error validating referring admin.' });
    }
  } else {
    // This case should ideally not be hit for a pre-registration flow which implies a referring admin.
    // If it's a general registration flow that creates pending users, it needs its own org context logic.
    return res.status(400).json({ success: false, error: 'Pre-registration requires a referring admin.' });
  }


  try {
    // Check against active users and pending users in the target organization
    const existingUserInOrg = await User.findOne({ 
        $or: [{ email: email.toLowerCase() }, { uniqueId }],
        organizationId: finalOrganizationId 
    });
    if (existingUserInOrg) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already registered as an active user in this organization.' });
    }
    
    const existingPendingInOrg = await PendingUser.findOne({ 
        $or: [{ email: email.toLowerCase() }, { uniqueId }],
        organizationId: finalOrganizationId
     });
    if (existingPendingInOrg) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already pending approval in this organization.' });
    }
    
    const newPendingUser = new PendingUser({
      displayName,
      email,
      password, 
      role: finalRole, // Force to 'user'
      uniqueId,
      referringAdminId: referringAdminId || null,
      organizationId: finalOrganizationId 
    });

    const savedPendingUser = await newPendingUser.save();
    res.status(201).json({ success: true, user: savedPendingUser.toJSON() });
  } catch (err) {
    console.error("Error creating pending user:", err);
    if (err.code === 11000) { 
        return res.status(409).json({ success: false, error: 'Duplicate email or uniqueId for pending user (within organization).' });
    }
    res.status(500).json({ success: false, error: 'Failed to save pending user: ' + err.message });
  }
});

// Get all pending users (Admin only, scoped to their organization)
router.get('/', [verifyToken, isAdmin], async (req, res) => {
  try {
    if (!req.user.organizationId) {
        return res.status(403).json({ success: false, error: 'Admin organization context missing.' });
    }
    const pendingUsers = await PendingUser.find({ organizationId: req.user.organizationId }).sort({ submissionDate: -1 });
    res.json(pendingUsers.map(pu => pu.toJSON()));
  } catch (err) {
    console.error("Error fetching pending users:", err);
    res.status(500).json({ success: false, error: 'Server error while fetching pending users.' });
  }
});

// Delete a pending user (Admin only - for rejection, scoped to organization)
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
  try {
    if (!req.user.organizationId) {
        return res.status(403).json({ success: false, error: 'Admin organization context missing.' });
    }
    const pendingUser = await PendingUser.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!pendingUser) {
      return res.status(404).json({ success: false, error: 'Pending user not found in your organization.' });
    }
    res.json({ success: true, message: 'Pending user rejected and removed successfully.' });
  } catch (err) {
    console.error("Error deleting pending user:", err);
    res.status(500).json({ success: false, error: 'Server error while deleting pending user.' });
  }
});

// Approve a pending user (Admin only, scoped to organization)
router.post('/approve/:id', [verifyToken, isAdmin], async (req, res) => {
  const pendingUserId = req.params.id;
  const { position, userInterests, phone, notificationPreference, role: requestedApprovedRole } = req.body;

  if (!req.user.organizationId) {
    return res.status(403).json({ success: false, error: 'Admin organization context missing.' });
  }

  try {
    const pendingUser = await PendingUser.findOne({ _id: pendingUserId, organizationId: req.user.organizationId });
    if (!pendingUser) {
      return res.status(404).json({ success: false, error: 'Pending user not found in your organization.' });
    }

    const existingUser = await User.findOne({ 
        $or: [{ email: pendingUser.email }, { uniqueId: pendingUser.uniqueId }],
        organizationId: req.user.organizationId 
    });
    if (existingUser) {
      await PendingUser.deleteOne({ _id: pendingUserId, organizationId: req.user.organizationId });
      return res.status(409).json({ success: false, error: 'User with this email or unique ID already exists in this organization. Pending entry removed.' });
    }
    
    if (pendingUser.referringAdminId && pendingUser.referringAdminId.toString() !== req.user.id) {
        const referrer = await User.findById(pendingUser.referringAdminId);
        if (!referrer || referrer.organizationId.toString() !== req.user.organizationId) {
             return res.status(403).json({ success: false, message: "Forbidden: Referral mismatch or referrer not in your organization." });
        }
    }
    
    let finalApprovedRole = pendingUser.role; 
    if (req.user.role === 'admin' && requestedApprovedRole) {
        if (requestedApprovedRole === 'admin') {
            finalApprovedRole = 'admin';
        } else {
            finalApprovedRole = 'user';
        }
    } else { // Ensure it defaults to 'user' if not explicitly set by admin or from pending record
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
      referringAdminId: pendingUser.referringAdminId || req.user.id,
      organizationId: req.user.organizationId 
    });
    
    const createdUser = await newUser.save(); 
    await PendingUser.deleteOne({ _id: pendingUserId, organizationId: req.user.organizationId }); 

    res.status(201).json({ success: true, message: 'User approved and account activated.', user: createdUser.toJSON() });

  } catch (err) {
    console.error("Error approving pending user:", err);
    res.status(500).json({ success: false, error: 'Server error while approving user: ' + err.message });
  }
});

module.exports = router;
