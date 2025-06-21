
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // For ObjectId generation
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { verifyToken, isAdmin } = require('../middleware/auth');

// User Registration
router.post('/register', async (req, res) => {
  const { email, uniqueId, password, displayName, role, position, userInterests, phone, notificationPreference, referringAdminId, organizationName } = req.body;

  if (!email || !uniqueId || !password || !displayName) {
    return res.status(400).json({ success: false, message: 'Email, Unique ID, Password, and Display Name are required.' });
  }

  try {
    let existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email or unique ID already exists.' });
    }

    let finalRole = role || 'user';
    let organizationIdToSet;

    if (finalRole === 'admin') {
      if (!organizationName) {
        return res.status(400).json({ success: false, message: 'Organization Name is required for admin registration.' });
      }
      // For new admin, generate a new organization ID.
      organizationIdToSet = new mongoose.Types.ObjectId().toString();
      // Potentially create an Organization record here if you have an Organization model.
      // For now, the ID is just associated with the admin user.
    } else { // Role is 'user'
      // For general user registration, organizationId must be provided or derived.
      // Current frontend public registration for 'user' doesn't provide organizationId or referringAdminId.
      // This path will likely fail unless frontend is changed or this type of registration is disallowed.
      // Admins creating users or pre-registration are the primary paths for users to get an orgId.
      if (req.body.organizationId) { // If admin is creating user and passing orgId directly
          organizationIdToSet = req.body.organizationId;
      } else if (referringAdminId) {
          const refAdmin = await User.findById(referringAdminId);
          if (!refAdmin || !refAdmin.organizationId) {
              return res.status(400).json({ success: false, message: 'Referring admin not found or has no organization.' });
          }
          organizationIdToSet = refAdmin.organizationId;
      } else {
         // If a general user tries to register without an admin creating them or a referral,
         // they cannot be assigned to an organization.
         // This flow needs to be handled: either disallow, or create a pending user without org for later assignment.
         // For now, making organizationId required on User model means this will fail if not set.
         return res.status(400).json({ success: false, message: 'User registration requires an organization context (e.g., created by an admin or via referral).' });
      }
    }
    
    if (!organizationIdToSet) {
        return res.status(400).json({ success: false, message: 'Organization ID could not be determined for the user.' });
    }

    const newUser = new User({
      email,
      uniqueId,
      password,
      displayName,
      role: finalRole,
      position,
      userInterests,
      phone,
      notificationPreference,
      referringAdminId: finalRole === 'user' ? referringAdminId : null,
      organizationId: organizationIdToSet
    });

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
        return res.status(500).json({ success: false, message: 'Server configuration error.' });
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
      user: { // Also include organizationId in the user object in response
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        uniqueId: user.uniqueId,
        organizationId: user.organizationId,
        position: user.position,
        userInterests: user.userInterests,
        phone: user.phone,
        notificationPreference: user.notificationPreference
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully (client-side action required).' });
});

router.get('/current', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
     if (user.organizationId !== req.user.organizationId) {
      return res.status(403).json({ success: false, message: 'Token organization does not match user record.' });
    }
    res.json(user.toJSON());
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Get all users (Admin only, scoped to their organization)
router.get('/', [verifyToken, isAdmin], async (req, res) => {
  try {
    const users = await User.find({ organizationId: req.user.organizationId }).select('-password');
    res.json(users.map(u => u.toJSON()));
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.get('/all-for-status-check', async (req, res) => {
  try {
    // This endpoint should ideally not expose all users.
    // For "admin exists" check, a count is better.
    const adminCount = await User.countDocuments({ role: 'admin' });
    res.json({ adminExists: adminCount > 0 });
  } catch (error) {
    console.error("Error fetching admin status:", error);
    res.status(500).json({ success: false, message: 'Server error while checking admin status.' });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    // Security: User can only get their own, or admin can get any within their org.
    if (user.id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    if (user.organizationId !== req.user.organizationId) {
        return res.status(403).json({ success: false, message: 'Forbidden: User not in your organization.' });
    }
    res.json(user.toJSON());
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  const { email, uniqueId, displayName, position, userInterests, phone, notificationPreference, role, password } = req.body;
  const userIdToUpdate = req.params.id;

  if (req.user.id !== userIdToUpdate && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden: You can only update your own profile or an admin can update any profile.' });
  }

  try {
    const user = await User.findById(userIdToUpdate);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (user.organizationId !== req.user.organizationId) {
        return res.status(403).json({ success: false, message: 'Forbidden: Cannot modify users outside your organization.' });
    }

    if (email && email.toLowerCase() !== user.email) {
        const existingByEmail = await User.findOne({ email: email.toLowerCase(), organizationId: user.organizationId });
        if (existingByEmail && existingByEmail.id !== userIdToUpdate) {
            return res.status(400).json({ success: false, message: 'Email already in use within organization.' });
        }
        user.email = email.toLowerCase();
    }
    if (uniqueId && uniqueId !== user.uniqueId) {
        const existingByUniqueId = await User.findOne({ uniqueId, organizationId: user.organizationId });
        if (existingByUniqueId && existingByUniqueId.id !== userIdToUpdate) {
            return res.status(400).json({ success: false, message: 'Unique ID already in use within organization.' });
        }
        user.uniqueId = uniqueId;
    }

    if (displayName) user.displayName = displayName;
    if (position) user.position = position;
    if (userInterests !== undefined) user.userInterests = userInterests;
    if (phone !== undefined) user.phone = phone;
    if (notificationPreference) user.notificationPreference = notificationPreference;
    
    if (req.user.role === 'admin' && role && user.id !== req.user.id) { // Admin changing another user's role
        if (user.role === 'admin' && role === 'user') { // Demoting an admin
            const adminCountInOrg = await User.countDocuments({ role: 'admin', organizationId: user.organizationId });
            if (adminCountInOrg <= 1) {
                return res.status(400).json({ success: false, message: 'Cannot demote the sole administrator of the organization.' });
            }
        }
        user.role = role;
    } else if (role && user.role !== role) {
         return res.status(403).json({ success: false, message: 'Role modification not permitted for yourself or by non-admins for others.' });
    }

    if (password) {
      user.password = password;
    }

    const updatedUser = await user.save();
    res.json({ success: true, message: 'User updated successfully.', user: updatedUser.toJSON() });
  } catch (error) {
    console.error("Update user error:", error);
    if (error.code === 11000) {
        return res.status(400).json({ success: false, message: 'Email or Unique ID already exists.' });
    }
    res.status(500).json({ success: false, message: 'Server error while updating user.', error: error.message });
  }
});

router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
  try {
    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (userToDelete.organizationId !== req.user.organizationId) {
        return res.status(403).json({ success: false, message: 'Forbidden: Cannot delete users outside your organization.' });
    }
    if (req.user.id === req.params.id) {
        return res.status(400).json({ success: false, message: "Admins cannot delete their own account via this route." });
    }
    if (userToDelete.role === 'admin') {
        const adminCountInOrg = await User.countDocuments({ role: 'admin', organizationId: userToDelete.organizationId });
        if (adminCountInOrg <= 1) {
            return res.status(400).json({ success: false, message: "Cannot delete the sole administrator of the organization." });
        }
    }
    
    await User.findByIdAndDelete(req.params.id);
    // TODO: Cascade delete assignments, etc. or handle re-assignment.
    // For now, assignments will be orphaned if not handled by a cleanup task or frontend logic.
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: 'Server error while deleting user.', error: error.message });
  }
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
        }
        
        if (!process.env.JWT_SECRET) {
            console.error("FATAL ERROR: JWT_SECRET for password reset is not defined.");
            return res.status(500).json({ success: false, message: 'Server configuration error.' });
        }
        const resetToken = jwt.sign({ id: user.id, type: 'password_reset', organizationId: user.organizationId }, process.env.JWT_SECRET, { expiresIn: '15m' }); 
        console.log(`Password reset requested for ${email} (Org: ${user.organizationId}). Token: ${resetToken}. Link: /reset-password?token=${resetToken}`);
        res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    try {
        if (!process.env.JWT_SECRET) {
            console.error("FATAL ERROR: JWT_SECRET for password reset verification is not defined.");
            return res.status(500).json({ success: false, message: 'Server configuration error.' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.type !== 'password_reset' || !decoded.id || !decoded.organizationId) {
             return res.status(400).json({ success: false, message: 'Invalid token.' });
        }
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