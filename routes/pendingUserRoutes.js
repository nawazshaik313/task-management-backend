
const express = require('express');
const router = express.Router();
const PendingUser = require('../models/PendingUser');
const User = require('../models/User'); // For creating user upon approval
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create a new pending user registration
router.post('/', async (req, res) => {
  let { displayName, email, password, role, uniqueId, referringAdminId } = req.body;

  if (!displayName || !email || !password || !role || !uniqueId) {
    return res.status(400).json({ success: false, error: 'Missing required fields for pending user.' });
  }

  try {
    // Check if email or uniqueId already exists in User or PendingUser collections
    const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }] });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already registered as an active user.' });
    }
    const existingPendingUser = await PendingUser.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }] });
    if (existingPendingUser) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already pending approval.' });
    }
    
    // Enforce single admin policy for pending user's role
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (role === 'admin' && adminCount > 0) {
        console.warn(`Attempt to create pending user ${email} with role 'admin', but an admin already exists. Downgrading to 'user'.`);
        role = 'user'; // Downgrade role if an admin exists
    } else if (role === 'admin' && adminCount === 0) {
        // This is fine, could be the first admin being set up via a pending route (if workflow supports)
    } else if (role !== 'admin' && adminCount === 0) {
        // If it's the first user and they are not registering as admin, this is also fine.
        // The approval step or first general registration might make them admin.
    }


    // Password will be hashed by the pre-save hook in PendingUser model
    const newPendingUser = new PendingUser({
      displayName,
      email,
      password, 
      role, // Use the potentially adjusted role
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
  // Admin might provide updated details during approval, e.g., position.
  const { position, userInterests, phone, notificationPreference, role: requestedApprovedRole } = req.body;

  try {
    const pendingUser = await PendingUser.findById(pendingUserId);
    if (!pendingUser) {
      return res.status(404).json({ success: false, error: 'Pending user not found.' });
    }

    // Check if user with this email or uniqueId already exists in main User collection
    const existingUser = await User.findOne({ $or: [{ email: pendingUser.email }, { uniqueId: pendingUser.uniqueId }] });
    if (existingUser) {
      // If user somehow got created, delete pending and inform admin
      await PendingUser.findByIdAndDelete(pendingUserId);
      return res.status(409).json({ success: false, error: 'User with this email or unique ID already exists. Pending entry removed.' });
    }

    // Authorization: If pre-registered, only referring admin can approve.
    // req.user.id is the ID of the admin making the request.
    if (pendingUser.referringAdminId && pendingUser.referringAdminId.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: "Forbidden: You can only approve users you referred or general registrations." });
    }
    
    // Determine final role for the approved user
    const adminCount = await User.countDocuments({ role: 'admin' });
    let finalApprovedRole = 'user'; // Default to user

    // If the pending user was intended to be an admin OR admin requests to approve as admin
    if (pendingUser.role === 'admin' || requestedApprovedRole === 'admin') {
        if (adminCount === 0) { // And no active admin exists
            finalApprovedRole = 'admin';
        } else { // An active admin exists, so this pending 'admin' must be downgraded or request denied
            console.warn(`Attempt to approve user ${pendingUser.email} as 'admin', but an admin already exists. Role will be 'user'.`);
            finalApprovedRole = 'user'; // Force to user
        }
    }
    
    const newUser = new User({
      email: pendingUser.email,
      uniqueId: pendingUser.uniqueId,
      password: pendingUser.password, // This is already hashed from PendingUser model. User model's pre-save MUST handle this.
      displayName: pendingUser.displayName,
      role: finalApprovedRole,
      position: position || 'Default Position', // Set default or from request
      userInterests: userInterests || '',
      phone: phone || '',
      notificationPreference: notificationPreference || 'email',
      referringAdminId: pendingUser.referringAdminId || req.user.id // Admin who approved or original referrer
    });
    
    // The User model's pre-save hook is expected to be smart enough not to re-hash an already hashed password.
    // (e.g., by checking if `this.password` starts with bcrypt's pattern like $2a$, $2b$)
    const createdUser = await newUser.save(); 

    await PendingUser.findByIdAndDelete(pendingUserId); // Remove from pending

    res.status(201).json({ success: true, message: 'User approved and account activated.', user: createdUser.toJSON() });

  } catch (err) {
    console.error("Error approving pending user:", err);
    res.status(500).json({ success: false, error: 'Server error while approving user: ' + err.message });
  }
});


module.exports = router;
