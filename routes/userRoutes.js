
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { verifyToken, isAdmin } = require('../middleware/auth'); // Correct path to middleware
const mongoose = require('mongoose'); // For generating ObjectId

// User Registration
router.post('/register', async (req, res) => {
  const { email, uniqueId, password, displayName, role, position, userInterests, phone, notificationPreference, referringAdminId, organizationName /* For UI, not directly for org ID logic */ } = req.body;

  if (!email || !uniqueId || !password || !displayName) {
    return res.status(400).json({ success: false, message: 'Email, Unique ID, Password, and Display Name are required.' });
  }

  try {
    let existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }] });
    if (existingUser) {
      // Check if the existing user is within the same potential organization context if applicable
      // For now, global uniqueness for email/uniqueId is simpler to maintain initially.
      return res.status(400).json({ success: false, message: 'User with this email or unique ID already exists globally.' });
    }

    let finalRole = role || 'user';
    let organizationIdToSet;
    let isNewOrganization = false;

    if (finalRole === 'admin') {
      // A new admin registration implies creating a new organization/site.
      // The organizationId will be this new admin's own userId.
      organizationIdToSet = new mongoose.Types.ObjectId().toString(); // Placeholder, will be replaced by newUser.id
      isNewOrganization = true;
    } else if (referringAdminId) {
      // User is being registered via referral or by an existing admin.
      // They should inherit the referring admin's organizationId.
      const referrer = await User.findById(referringAdminId);
      if (!referrer || !referrer.organizationId) {
        return res.status(400).json({ success: false, message: 'Referring admin not found or has no organization.' });
      }
      organizationIdToSet = referrer.organizationId;
    } else {
      // General user registration without a referrer - this flow needs careful consideration in multi-tenancy.
      // For now, disallow general user registration without an organization context.
      // Or, have a default organization, or require an organization selection.
      // To keep it simple: assume users are either admins creating their own org, or referred into one.
      return res.status(400).json({ success: false, message: 'User registration requires an organizational context (e.g., referral or admin setup).' });
    }

    const newUser = new User({
      email,
      uniqueId,
      password, // Password will be hashed by pre-save hook in model
      displayName,
      role: finalRole,
      position,
      userInterests,
      phone,
      notificationPreference,
      referringAdminId: finalRole === 'user' ? referringAdminId : null, // Only relevant for users under an admin
      organizationId: isNewOrganization ? "" : organizationIdToSet // Temporary for new admin, will update post-save
    });

    if (isNewOrganization) {
        newUser.organizationId = newUser.id; // New admin's ID becomes their organization ID
    }
    
    await newUser.save();
    
    res.status(201).json({ success: true, message: 'User registered successfully.', user: newUser.toJSON() });

  } catch (error) {
    console.error("User registration error:", error);
    if (error.code === 11000) { 
        return res.status(400).json({ success: false, message: 'Email or Unique ID already exists.' });
    }
    res.status(500).json({ success: false, message: 'Server error during registration.', error: error.message });
  }
});


// User Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    if (!process.env.JWT_SECRET) {
        console.error("FATAL ERROR: JWT_SECRET environment variable is not defined.");
        return res.status(500).json({ success: false, message: 'Server configuration error. Please contact administrator.' });
    }

    const tokenPayload = {
      id: user.id, 
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      uniqueId: user.uniqueId,
      organizationId: user.organizationId // Include organizationId in token
    };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: tokenPayload // Send user details including organizationId
    });
  } catch (error) {
    console.error("Login error:", error); 
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// User Logout (Conceptual - JWTs are managed client-side)
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully (client-side action required).' });
});

// Get Current Logged-in User
router.get('/current', verifyToken, async (req, res) => {
  try {
    // req.user from token already has id, role, organizationId etc.
    // Fetch from DB to get latest full profile, excluding password
    const user = await User.findById(req.user.id).select('-password'); 
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    // Ensure the organizationId from DB matches token, or send what's in DB.
    // For consistency, user.toJSON() will use the DB version.
    res.json(user.toJSON());
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Get all users (Admin only, scoped to their organization)
router.get('/', [verifyToken, isAdmin], async (req, res) => {
  try {
    if (!req.user.organizationId) {
        return res.status(403).json({ success: false, message: 'Organization context missing for admin.' });
    }
    const users = await User.find({ organizationId: req.user.organizationId }).select('-password');
    res.json(users.map(u => u.toJSON()));
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// This endpoint is problematic in multi-tenant. Each org has its own admin state.
// Removing for now, as "global admin status" doesn't fit.
// Client-side logic for "first admin" hints would need to be re-evaluated.
/*
router.get('/all-for-status-check', async (req, res) => {
  try {
    // This needs to be rethought for multi-tenancy.
    // Perhaps it checks if ANY admin exists in ANY org, or a specific org.
    // For now, returning an empty array or an error might be safest.
    res.status(501).json({ success: false, message: 'Endpoint under review for multi-tenancy compatibility.' });
  } catch (error) {
    console.error("Error fetching users for status check:", error);
    res.status(500).json({ success: false, message: 'Server error while checking user status.' });
  }
});
*/


// Get user by ID (Protected, scoped to organization)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!req.user.organizationId) {
        return res.status(403).json({ success: false, message: 'Organization context missing.' });
    }
    const user = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found in your organization.' });
    }
     // Admin can view any user in their org. Non-admin can only view their own.
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only view your own profile.' });
    }
    res.json(user.toJSON());
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Update user by ID (Protected, scoped to organization)
router.put('/:id', verifyToken, async (req, res) => {
  const { email, uniqueId, displayName, position, userInterests, phone, notificationPreference, role, password } = req.body;
  const userIdToUpdate = req.params.id;

  if (!req.user.organizationId) {
    return res.status(403).json({ success: false, message: 'Organization context missing.' });
  }
  // User can update their own profile. Admin can update any user in their org.
  if (req.user.id !== userIdToUpdate && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions.' });
  }

  try {
    const user = await User.findOne({ _id: userIdToUpdate, organizationId: req.user.organizationId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found in your organization.' });
    }

    // Prevent non-admins from updating other users in the same org, even if they somehow bypass client checks
    if (req.user.role !== 'admin' && req.user.id !== user.id.toString()) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only update your own profile.' });
    }


    if (email && email.toLowerCase() !== user.email) { 
        const existingByEmail = await User.findOne({ email: email.toLowerCase(), organizationId: req.user.organizationId });
        if (existingByEmail && existingByEmail.id !== userIdToUpdate) {
            return res.status(400).json({ success: false, message: 'Email already in use within your organization.' });
        }
        user.email = email.toLowerCase();
    }
    if (uniqueId && uniqueId !== user.uniqueId) {
        const existingByUniqueId = await User.findOne({ uniqueId, organizationId: req.user.organizationId });
        if (existingByUniqueId && existingByUniqueId.id !== userIdToUpdate) {
            return res.status(400).json({ success: false, message: 'Unique ID already in use within your organization.' });
        }
        user.uniqueId = uniqueId;
    }

    if (displayName) user.displayName = displayName;
    if (position) user.position = position;
    if (userInterests !== undefined) user.userInterests = userInterests;
    if (phone !== undefined) user.phone = phone;
    if (notificationPreference) user.notificationPreference = notificationPreference;
    
    if (req.user.role === 'admin' && role) {
        if (role === 'user' && user.role === 'admin') {
            const adminCountInOrg = await User.countDocuments({ role: 'admin', organizationId: req.user.organizationId });
            if (adminCountInOrg <= 1 && user.id === userIdToUpdate) { 
                return res.status(400).json({ success: false, message: 'The sole administrator of this organization cannot be demoted.' });
            }
        }
        user.role = role;
    } else if (role && user.role !== role && req.user.id === userIdToUpdate) {
        return res.status(403).json({ success: false, message: 'Role modification not permitted for your own account here.' });
    }

    if (password) { 
      user.password = password; 
    }

    const updatedUser = await user.save();
    res.json({ success: true, message: 'User updated successfully.', user: updatedUser.toJSON() });
  } catch (error) {
    console.error("Update user error:", error);
    if (error.code === 11000) { 
        return res.status(400).json({ success: false, message: 'Email or Unique ID already exists within the organization.' });
    }
    res.status(500).json({ success: false, message: 'Server error while updating user.', error: error.message });
  }
});

// Delete user by ID (Admin only, scoped to organization)
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
  try {
    if (!req.user.organizationId) {
        return res.status(403).json({ success: false, message: 'Organization context missing for admin.' });
    }
    const userToDelete = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!userToDelete) {
      return res.status(404).json({ success: false, message: 'User not found in your organization.' });
    }
    if (req.user.id === req.params.id) {
        return res.status(400).json({ success: false, message: "Admins cannot delete their own account." });
    }
    if (userToDelete.role === 'admin') {
        const adminCountInOrg = await User.countDocuments({ role: 'admin', organizationId: req.user.organizationId });
        if (adminCountInOrg <= 1) {
            return res.status(400).json({ success: false, message: "Cannot delete the sole administrator of this organization." });
        }
    }
    
    await User.deleteOne({ _id: req.params.id, organizationId: req.user.organizationId });
    // TODO: Consider deleting related assignments or other user-specific data from this organization.
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: 'Server error while deleting user.', error: error.message });
  }
});


// Forgot Password Request (scoped to organization if possible, or global for simplicity)
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    // For multi-tenancy, you might require an organization identifier here too,
    // or assume email is globally unique for password reset.
    // Simpler: assume email is the primary lookup.
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // Standard practice: don't reveal if email exists or not for security.
            return res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
        }
        
        if (!process.env.JWT_SECRET) {
            console.error("FATAL ERROR: JWT_SECRET for password reset is not defined.");
            return res.status(500).json({ success: false, message: 'Server configuration error for password reset.' });
        }

        // Token includes user ID and org ID for context if needed in reset form.
        const resetToken = jwt.sign(
            { id: user.id, organizationId: user.organizationId, type: 'password_reset' }, 
            process.env.JWT_SECRET, 
            { expiresIn: '15m' }
        ); 
        
        console.log(`Password reset requested for ${email} in org ${user.organizationId}. Token: ${resetToken}. Link should be: /reset-password?token=${resetToken}`);
        // Here you would send an email with the reset link.

        res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});


// Reset Password (requires token from forgot password flow)
router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    try {
        if (!process.env.JWT_SECRET) {
            console.error("FATAL ERROR: JWT_SECRET for password reset verification is not defined.");
            return res.status(500).json({ success: false, message: 'Server configuration error for password reset.' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.type !== 'password_reset' || !decoded.id || !decoded.organizationId) {
             return res.status(400).json({ success: false, message: 'Invalid or malformed reset token.' });
        }

        // Find user by ID AND organizationId to ensure context.
        const user = await User.findOne({ _id: decoded.id, organizationId: decoded.organizationId });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset token (user not found or org mismatch).' });
        }

        user.password = newPassword; 
        await user.save();

        res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (error) { 
        console.error("Reset password error:", error);
        res.status(400).json({ success: false, message: 'Invalid or expired reset token, or server error.' });
    }
});


module.exports = router;
