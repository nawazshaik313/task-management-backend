
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { verifyToken, isAdmin } = require('../middleware/auth'); // Correct path to middleware

// User Registration
router.post('/register', async (req, res) => {
  const { email, uniqueId, password, displayName, role, position, userInterests, phone, notificationPreference, referringAdminId } = req.body;

  if (!email || !uniqueId || !password || !displayName) {
    return res.status(400).json({ success: false, message: 'Email, Unique ID, Password, and Display Name are required.' });
  }

  try {
    let existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email or unique ID already exists.' });
    }

    const adminCount = await User.countDocuments({ role: 'admin' });
    let finalRole = role || 'user'; 

    // If it's the very first user registering (no admins exist) and they specified 'admin' or no role (defaulting to admin for first user),
    // set role to admin. Otherwise, allow 'admin' role if explicitly requested by form.
    if (finalRole === 'admin') {
      // Allow creating an admin
    } else if (adminCount === 0 && !role) { 
      // If no admins exist AND no role was specified by the registration form,
      // then this is the first user, make them admin.
      finalRole = 'admin';
    }
    // Otherwise, the role is 'user' or an explicitly set 'admin' for subsequent admins.

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
      referringAdminId
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
        return res.status(500).json({ success: false, message: 'Server configuration error. Please contact administrator.' });
    }

    const tokenPayload = {
      id: user.id, 
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      uniqueId: user.uniqueId
    };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: tokenPayload 
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
    const user = await User.findById(req.user.id).select('-password'); 
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json(user.toJSON());
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Get all users (Admin only)
router.get('/', [verifyToken, isAdmin], async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users.map(u => u.toJSON()));
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.get('/all-for-status-check', async (req, res) => {
  try {
    const users = await User.find().select('role'); 
    res.json(users.map(u => ({ role: u.role, id: u.id }))); 
  } catch (error) {
    console.error("Error fetching users for status check:", error);
    res.status(500).json({ success: false, message: 'Server error while checking user status.' });
  }
});


// Get user by ID (Protected)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only view your own profile or an admin can view any profile.' });
    }
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json(user.toJSON());
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Update user by ID (Protected)
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

    if (email && email.toLowerCase() !== user.email) { 
        const existingByEmail = await User.findOne({ email: email.toLowerCase() });
        if (existingByEmail && existingByEmail.id !== userIdToUpdate) {
            return res.status(400).json({ success: false, message: 'Email already in use.' });
        }
        user.email = email.toLowerCase();
    }
    if (uniqueId && uniqueId !== user.uniqueId) {
        const existingByUniqueId = await User.findOne({ uniqueId });
        if (existingByUniqueId && existingByUniqueId.id !== userIdToUpdate) {
            return res.status(400).json({ success: false, message: 'Unique ID already in use.' });
        }
        user.uniqueId = uniqueId;
    }

    if (displayName) user.displayName = displayName;
    if (position) user.position = position;
    if (userInterests !== undefined) user.userInterests = userInterests;
    if (phone !== undefined) user.phone = phone;
    if (notificationPreference) user.notificationPreference = notificationPreference;
    
    if (req.user.role === 'admin' && role) { 
        // Admin can set role. If demoting the sole admin, it might be an issue.
        // For now, allow admin to set role as requested.
        // More complex rules (like preventing demotion of last admin) can be added if needed.
        if (role === 'user' && user.role === 'admin') {
            // Check if this is the SOLE admin
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount === 1 && user.id === userIdToUpdate) { 
                return res.status(400).json({ success: false, message: 'The sole administrator cannot be demoted to user.' });
            }
        }
        user.role = role;
    } else if (role && user.role !== role && req.user.id === userIdToUpdate) {
        return res.status(403).json({ success: false, message: 'Role modification not permitted for your own account here or by non-admins.' });
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

// Delete user by ID (Admin only)
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
  try {
    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (req.user.id === req.params.id) {
        return res.status(400).json({ success: false, message: "Admins cannot delete their own account." });
    }
    // Prevent deletion if the user is the sole admin
    // This check is good to keep even in multi-admin if you want at least one admin.
    // However, if the goal is truly "any admin can delete any other admin", this could be removed.
    // For safety, keeping it to prevent removing *all* admin capabilities.
    if (userToDelete.role === 'admin') {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount === 1) {
            return res.status(400).json({ success: false, message: "Cannot delete the sole administrator account." });
        }
    }
    
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: 'Server error while deleting user.', error: error.message });
  }
});


// Forgot Password Request
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
            return res.status(500).json({ success: false, message: 'Server configuration error for password reset.' });
        }

        const resetToken = jwt.sign({ id: user.id, type: 'password_reset' }, process.env.JWT_SECRET, { expiresIn: '15m' }); 
        
        console.log(`Password reset requested for ${email}. Token: ${resetToken}. Link should be: /reset-password?token=${resetToken}`);

        res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});


// (Optional) Route to handle actual password reset with a token
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
        if (decoded.type !== 'password_reset') {
             return res.status(400).json({ success: false, message: 'Invalid token type.' });
        }

        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset token (user not found).' });
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
      