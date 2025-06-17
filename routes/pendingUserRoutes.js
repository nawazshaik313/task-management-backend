
const express = require('express');
const router = express.Router();
const PendingUser = require('../models/PendingUser');
const User = require('../models/User');
const { verifyToken, isAdmin } = require('../middleware/auth');
const emailService = require('../utils/emailService');

// Create a new pending user registration (typically from pre-registration link)
router.post('/', async (req, res) => {
  let { displayName, email, password, role, uniqueId, referringAdminId } = req.body;

  if (!displayName || !email || !password || !uniqueId) { 
    return res.status(400).json({ success: false, error: 'Display Name, Email, Password, and Unique ID are required.' });
  }
  if (!referringAdminId) {
      return res.status(400).json({ success: false, error: 'Pre-registration requires a referring administrator ID.'});
  }
  
  role = role || 'user'; 

  try {
    const refAdmin = await User.findById(referringAdminId);
    if (!refAdmin || !refAdmin.organizationId) {
        return res.status(400).json({ success: false, error: 'Referring administrator not found or has no organization.'});
    }
    const organizationIdToSet = refAdmin.organizationId;

    const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }], organizationId: organizationIdToSet });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already registered as an active user in this organization.' });
    }
    const existingPendingUser = await PendingUser.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }], organizationId: organizationIdToSet });
    if (existingPendingUser) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already pending approval in this organization.' });
    }
    
    const newPendingUser = new PendingUser({
      displayName, email, password, role, uniqueId,
      referringAdminId,
      organizationId: organizationIdToSet
    });

    const savedPendingUser = await newPendingUser.save();
    
    // Notify user of submission
    emailService.sendPreRegistrationSubmittedToUserEmail(savedPendingUser.email, savedPendingUser.displayName, refAdmin.displayName)
        .catch(err => console.error("EmailJS Error (sendPreRegistrationSubmittedToUserEmail):", err));

    // Notify referring admin
    if (refAdmin.email && refAdmin.notificationPreference === 'email') {
        emailService.sendPreRegistrationNotificationToAdminEmail(refAdmin.email, refAdmin.displayName, savedPendingUser.displayName, savedPendingUser.uniqueId)
            .catch(err => console.error("EmailJS Error (sendPreRegistrationNotificationToAdminEmail):", err));
    }

    const responseUser = { ...savedPendingUser.toJSON() };
    delete responseUser.password;
    res.status(201).json({ success: true, user: responseUser });

  } catch (err) {
    console.error("Error creating pending user:", err);
    if (err.code === 11000) { 
        return res.status(409).json({ success: false, error: 'Duplicate email or uniqueId for pending user within the organization.' });
    }
    res.status(500).json({ success: false, error: 'Failed to save pending user: ' + err.message });
  }
});

// Get all pending users (Admin only, scoped to their organization)
router.get('/', [verifyToken, isAdmin], async (req, res) => {
  try {
    const pendingUsers = await PendingUser.find({ organizationId: req.user.organizationId }).sort({ submissionDate: -1 });
    res.json(pendingUsers.map(pu => pu.toJSON())); 
  } catch (err) {
    console.error("Error fetching pending users:", err);
    res.status(500).json({ success: false, error: 'Server error while fetching pending users.' });
  }
});

// Delete/Reject a pending user (Admin only, scoped)
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
  try {
    const pendingUser = await PendingUser.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!pendingUser) {
      return res.status(404).json({ success: false, error: 'Pending user not found in your organization or already processed.' });
    }
    await PendingUser.findByIdAndDelete(req.params.id);
    // Optionally send rejection email to user:
    // emailService.sendAccountRejectedEmail(pendingUser.email, pendingUser.displayName, req.user.displayName);
    res.json({ success: true, message: 'Pending user rejected and removed successfully.' });
  } catch (err) {
    console.error("Error deleting pending user:", err);
    res.status(500).json({ success: false, error: 'Server error while deleting pending user.' });
  }
});

// Approve a pending user (Admin only, scoped)
router.post('/approve/:id', [verifyToken, isAdmin], async (req, res) => {
  const pendingUserId = req.params.id;
  const { position, userInterests, phone, notificationPreference, role: requestedApprovedRole } = req.body;

  try {
    const pendingUserDoc = await PendingUser.findById(pendingUserId); 
    if (!pendingUserDoc) {
      return res.status(404).json({ success: false, error: 'Pending user not found.' });
    }
    if (pendingUserDoc.organizationId !== req.user.organizationId) {
        return res.status(403).json({ success: false, error: 'Cannot approve users outside your organization.'});
    }

    const existingUser = await User.findOne({ 
        $or: [{ email: pendingUserDoc.email }, { uniqueId: pendingUserDoc.uniqueId }], 
        organizationId: pendingUserDoc.organizationId 
    });
    if (existingUser) {
      await PendingUser.findByIdAndDelete(pendingUserId);
      return res.status(409).json({ success: false, error: 'User with this email or unique ID already exists in your organization. Pending entry removed.' });
    }
    
    let finalApprovedRole = requestedApprovedRole || pendingUserDoc.role || 'user';
    if (finalApprovedRole === 'admin') {
        const adminCountInOrg = await User.countDocuments({ role: 'admin', organizationId: pendingUserDoc.organizationId });
        if (adminCountInOrg > 0) {
            console.warn(`Attempt to approve pending user ${pendingUserDoc.email} as 'admin' in org ${pendingUserDoc.organizationId}, but an admin already exists. Role will be 'user'.`);
            finalApprovedRole = 'user';
        }
    }
    
    const newUser = new User({
      email: pendingUserDoc.email,
      uniqueId: pendingUserDoc.uniqueId,
      password: pendingUserDoc.password, 
      displayName: pendingUserDoc.displayName,
      role: finalApprovedRole,
      position: position || 'Default Position',
      userInterests: userInterests || '',
      phone: phone || '',
      notificationPreference: notificationPreference || 'email',
      referringAdminId: pendingUserDoc.referringAdminId || req.user.id, 
      organizationId: pendingUserDoc.organizationId
    });
    
    const createdUser = await newUser.save(); 
    await PendingUser.findByIdAndDelete(pendingUserId);

    // Send activation email to user
    emailService.sendAccountActivatedByAdminEmail(createdUser.email, createdUser.displayName, req.user.displayName)
        .catch(err => console.error("EmailJS Error (sendAccountActivatedByAdminEmail):", err));

    res.status(201).json({ success: true, message: 'User approved and account activated.', user: createdUser.toJSON() });

  } catch (err) {
    console.error("Error approving pending user:", err);
    if (err.code === 11000 && err.keyPattern && err.keyPattern.password === 1) {
        return res.status(409).json({ success: false, error: 'User approval conflict, possibly already approved or concurrent request.' });
    }
    res.status(500).json({ success: false, error: 'Server error while approving user: ' + err.message });
  }
});

module.exports = router;
