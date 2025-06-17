
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // For ObjectId generation
const User = require('../models/User');
const PendingUser = require('../models/PendingUser'); // For general registration pending flow
const jwt = require('jsonwebtoken');
const { verifyToken, isAdmin } = require('../middleware/auth');
const emailService = require('../utils/emailService');

// User Registration
router.post('/register', async (req, res) => {
  const { email, uniqueId, password, displayName, role, position, userInterests, phone, notificationPreference, referringAdminId, companyName } = req.body; // Changed organizationName to companyName

  if (!email || !uniqueId || !password || !displayName) {
    return res.status(400).json({ success: false, message: 'Email, Unique ID, Password, and Display Name are required.' });
  }

  try {
    let finalRole = role || 'user';
    let organizationIdToSet;
    let newAdminCompanyName = ''; // For email, changed from newAdminSiteName

    if (finalRole === 'admin') {
      if (!companyName) { // Changed organizationName to companyName
        return res.status(400).json({ success: false, message: 'Company Name is required for admin registration.' });
      }
      // The organizationId is now a unique ObjectId string, not derived from companyName directly for uniqueness.
      organizationIdToSet = new mongoose.Types.ObjectId().toString(); // Generate unique Org ID
      newAdminCompanyName = companyName; // Use companyName for email

      // Ensure no user (admin or otherwise) already exists with this email or uniqueId system-wide if it's a new admin
      let existingUserGlobal = await User.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }] });
      if (existingUserGlobal) {
        return res.status(400).json({ success: false, message: 'User with this email or unique ID already exists globally. Cannot register new admin.' });
      }

    } else { // Role is 'user'
      if (req.body.organizationId) { // Admin creating user directly
          organizationIdToSet = req.body.organizationId;
          const orgAdmin = await User.findOne({_id: referringAdminId, organizationId: organizationIdToSet, role: 'admin'});
          if (!orgAdmin) return res.status(400).json({success: false, message: "Referring admin does not belong to the specified organization or is not an admin."});
      } else if (referringAdminId) { // User pre-registration via link
          const refAdmin = await User.findById(referringAdminId);
          if (!refAdmin || !refAdmin.organizationId) {
              return res.status(400).json({ success: false, message: 'Referring admin not found or has no organization.' });
          }
          organizationIdToSet = refAdmin.organizationId;
      } else {
         // General public registration for 'user' role without referral creates a PendingUser
         const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }] });
         if (existingUser) {
           return res.status(409).json({ success: false, message: 'Email or Unique ID already registered as an active user.' });
         }
         const existingPendingUser = await PendingUser.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }]});
         if (existingPendingUser) {
           return res.status(409).json({ success: false, message: 'Email or Unique ID already pending approval.' });
         }

         const newPendingPublicUser = new PendingUser({
            displayName, email, password, role: 'user', uniqueId,
            organizationId: "NEEDS_ASSIGNMENT_BY_SYSTEM_ADMIN"
         });
         await newPendingPublicUser.save();
         
         emailService.sendRegistrationPendingToUserEmail(email, displayName)
            .catch(err => console.error("EmailJS Error (sendRegistrationPendingToUserEmail):", err));

         if (process.env.SYSTEM_ADMIN_EMAIL) {
             emailService.sendNewPendingRegistrationToAdminEmail(process.env.SYSTEM_ADMIN_EMAIL, "System Admin", displayName, email, "NEEDS_ASSIGNMENT_BY_SYSTEM_ADMIN")
                .catch(err => console.error("EmailJS Error (sendNewPendingRegistrationToAdminEmail to system admin):", err));
         }
         
         return res.status(201).json({ success: true, message: 'Registration submitted. It is pending administrator review and assignment to an organization.', user: { displayName, email, role: 'user' } });
      }
    }
    
    if (!organizationIdToSet) { 
        return res.status(400).json({ success: false, message: 'Organization ID could not be determined for the user.' });
    }

    const existingUserInOrg = await User.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }], organizationId: organizationIdToSet });
    if (existingUserInOrg) {
      return res.status(400).json({ success: false, message: 'User with this email or unique ID already exists in this organization.' });
    }
     const existingPendingInOrg = await PendingUser.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }], organizationId: organizationIdToSet });
     if (existingPendingInOrg) {
        return res.status(400).json({ success: false, message: 'An account with this email or unique ID is already pending approval for this organization.' });
     }

    const newUser = new User({
      email, uniqueId, password, displayName,
      role: finalRole,
      position: position || (finalRole === 'admin' ? 'Administrator' : 'User'),
      userInterests, phone, notificationPreference,
      referringAdminId: finalRole === 'user' ? referringAdminId : null,
      organizationId: organizationIdToSet
    });

    await newUser.save();

    emailService.sendWelcomeRegistrationEmail(newUser.email, newUser.displayName, newUser.role, newAdminCompanyName) // Pass companyName
      .catch(err => console.error("EmailJS Error (sendWelcomeRegistrationEmail):", err));
      
    res.status(201).json({ success: true, message: 'User registered successfully.', user: newUser.toJSON() });

  } catch (error) {
    console.error("User registration error:", error);
    if (error.code === 11000) { 
        return res.status(400).json({ success: false, message: 'Email or Unique ID already exists (unique constraint violation).' });
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
      organizationId: user.organizationId
    };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
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
    
    if (req.user.role === 'admin' && role && user.id !== req.user.id) { 
        if (user.role === 'admin' && role === 'user') { 
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
      user.password = password; // Pre-save hook will hash
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
    // TODO: Cascade delete assignments, etc.
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
        if (!user) { // Don't reveal if user exists for security
            return res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
        }
        
        if (!process.env.JWT_SECRET || !process.env.FRONTEND_URL) {
            console.error("FATAL ERROR: JWT_SECRET or FRONTEND_URL for password reset is not defined.");
            return res.status(500).json({ success: false, message: 'Server configuration error for password reset.' });
        }
        const resetToken = jwt.sign(
            { id: user.id, type: 'password_reset', organizationId: user.organizationId }, 
            process.env.JWT_SECRET, 
            { expiresIn: '15m' }
        ); 
        
        const resetLink = `${process.env.FRONTEND_URL}#PasswordReset?token=${resetToken}`;
        
        emailService.sendPasswordResetEmail(user.email, user.displayName, resetLink)
          .catch(err => console.error("EmailJS Error (sendPasswordResetEmail):", err));

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
             return res.status(400).json({ success: false, message: 'Invalid token type or payload.' });
        }
        const user = await User.findOne({ _id: decoded.id, organizationId: decoded.organizationId });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset token (user not found or org mismatch).' });
        }
        user.password = newPassword; // Pre-save hook will hash
        await user.save();
        res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (error) {
        console.error("Reset password error:", error);
        if (error.name === 'TokenExpiredError') {
             return res.status(400).json({ success: false, message: 'Password reset token has expired.' });
        }
        if (error.name === 'JsonWebTokenError') {
             return res.status(400).json({ success: false, message: 'Invalid password reset token.' });
        }
        res.status(500).json({ success: false, message: 'Server error during password reset.' });
    }
});

module.exports = router;
