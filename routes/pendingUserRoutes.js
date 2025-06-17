
const express = require('express');
const router = express.Router();
const PendingUser = require('../models/PendingUser');
const User = require('../models/User'); 
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new pending user registration
router.post('/', async (req, res) => {
  let { displayName, email, password, role, uniqueId, referringAdminId, organizationIdFromReferrer } = req.body;

  if (!displayName || !email || !password || !role || !uniqueId) {
    return res.status(400).json({ success: false, error: 'Missing required fields for pending user.' });
  }

  try {
    // Check against active users in the target organization if organizationIdFromReferrer is provided
    // Or globally if not (though this might need refinement for strict multi-tenancy)
    let query = { $or: [{ email: email.toLowerCase() }, { uniqueId }] };
    if (organizationIdFromReferrer) {
        query = { $or: [{ email: email.toLowerCase(), organizationId: organizationIdFromReferrer }, { uniqueId, organizationId: organizationIdFromReferrer }] };
    }
    
    const existingUser = await User.findOne(query);
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already registered as an active user in this context.' });
    }
    
    const existingPendingUser = await PendingUser.findOne(query); // Check pending users also with org context
    if (existingPendingUser) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already pending approval in this context.' });
    }
    
    let finalOrganizationId = organizationIdFromReferrer;
    if (referringAdminId && !organizationIdFromReferrer) {
        const referrer = await User.findById(referringAdminId);
        if (referrer && referrer.organizationId) {
            finalOrganizationId = referrer.organizationId;
        } else {
             return res.status(400).json({ success: false, error: 'Referring admin invalid or has no organization.' });
        }
    }
    if(!finalOrganizationId && role !== 'admin') { // Non-admin pending users must have an org context
        return res.status(400).json({ success: false, error: 'Organization context required for pending user.' });
    }


    const newPendingUser = new PendingUser({
      displayName,
      email,
      password, 
      role,
      uniqueId,
      referringAdminId: referringAdminId || null,
      organizationId: finalOrganizationId // Set organizationId for the pending user
    });

    const savedPendingUser = await newPendingUser.save();
    res.status(201).json({ success: true, user: savedPendingUser.toJSON() });
  } catch (err) {
    console.error("Error creating pending user:", err);
    if (err.code === 11000) { // Mongoose duplicate key error
        return res.status(409).json({ success: false, error: 'Duplicate email or uniqueId for pending user (within org if specified).' });
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

    // Double check active users in this specific organization
    const existingUser = await User.findOne({ 
        $or: [{ email: pendingUser.email }, { uniqueId: pendingUser.uniqueId }],
        organizationId: req.user.organizationId 
    });
    if (existingUser) {
      await PendingUser.deleteOne({ _id: pendingUserId, organizationId: req.user.organizationId });
      return res.status(409).json({ success: false, error: 'User with this email or unique ID already exists in this organization. Pending entry removed.' });
    }
    
    // Check referral constraint if applicable (within the same organization)
    if (pendingUser.referringAdminId && pendingUser.referringAdminId.toString() !== req.user.id) {
        const referrer = await User.findById(pendingUser.referringAdminId);
        if (!referrer || referrer.organizationId.toString() !== req.user.organizationId) {
             return res.status(403).json({ success: false, message: "Forbidden: Referral mismatch or referrer not in your organization." });
        }
        // If referrer is valid and in same org, current admin can still approve.
    }
    
    let finalApprovedRole = pendingUser.role; // Default to pending user's intended role
    if (req.user.role === 'admin' && requestedApprovedRole) { // If admin explicitly sets a role during approval
        if (requestedApprovedRole === 'admin') {
            // Allow approving as admin within their own organization.
            finalApprovedRole = 'admin';
        } else {
            finalApprovedRole = 'user';
        }
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
      organizationId: req.user.organizationId // User becomes part of the approving admin's organization
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
