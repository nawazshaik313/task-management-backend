
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { verifyToken, isAdmin } = require('../middleware/auth'); // Correct path to middleware

// User Registration (Primarily for initial admin, or if general registration directly creates users)
// For a flow where users are approved from PendingUsers, this might be less used or admin-only.
router.post('/register', async (req, res) => {
  const { email, uniqueId, password, displayName, role, position, userInterests, phone, notificationPreference } = req.body;

  if (!email || !uniqueId || !password || !displayName) {
    return res.status(400).json({ success: false, message: 'Email, Unique ID, Password, and Display Name are required.' });
  }

  try {
    let existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { uniqueId }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email or unique ID already exists.' });
    }

    // Determine role: if no admins exist, first user is admin, otherwise default or provided role.
    const adminCount = await User.countDocuments({ role: 'admin' });
    const finalRole = (adminCount === 0) ? 'admin' : (role || 'user');

    const newUser = new User({
      email,
      uniqueId,
      password, // Password will be hashed by pre-save hook in model
      displayName,
      role: finalRole,
      position,
      userInterests,
      phone,
      notificationPreference
    });

    await newUser.save();
    
    // Don't send token on registration, user should log in.
    res.status(201).json({ success: true, message: 'User registered successfully.', user: newUser.toJSON() });

  } catch (error) {
    console.error("User registration error:", error);
    if (error.code === 11000) { // MongoDB duplicate key error
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

    // Explicitly check for JWT_SECRET before attempting to sign a token
    if (!process.env.JWT_SECRET) {
        console.error("FATAL ERROR: JWT_SECRET environment variable is not defined.");
        // Do not expose details of the error to the client, keep it generic.
        return res.status(500).json({ success: false, message: 'Server configuration error. Please contact administrator.' });
    }

    const tokenPayload = {
      id: user.id, // Use virtual 'id'
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
      user: tokenPayload // Send back the payload as user object
    });
  } catch (error) {
    console.error("Login error:", error); // Log the actual error on the server
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// User Logout (Conceptual - JWTs are managed client-side)
router.post('/logout', (req, res) => {
  // For JWT, logout is primarily a client-side action (deleting the token).
  // Backend can have a route for completeness or if using refresh tokens/blacklisting.
  res.json({ success: true, message: 'Logged out successfully (client-side action required).' });
});

// Get Current Logged-in User
router.get('/current', verifyToken, async (req, res) => {
  try {
    // req.user is populated by verifyToken middleware
    const user = await User.findById(req.user.id).select('-password'); // Exclude password
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

// Get user by ID (Protected)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    // Admin can get any user, regular user can only get their own profile via /current
    // or if specific logic allows viewing other profiles (not implemented here)
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
// Users can update their own profile. Admins can update any profile.
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

    // Check for unique fields if changed
    if (email && email.toLowerCase() !== user.email) { // compare lowercase
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
    
    // Role can only be changed by an admin, and not for their own account via this specific check
    if (req.user.role === 'admin' && role && user.id !== req.user.id) { // Admin changing other user's role
        user.role = role;
    } else if (req.user.role === 'admin' && role && user.id === req.user.id && user.role !== role) { // Admin trying to change their own role
        return res.status(400).json({ success: false, message: 'Admins cannot change their own role here. Use specific admin tools if available.' });
    } else if (role && user.role !== role) { // Non-admin trying to change role
        return res.status(403).json({ success: false, message: 'Role modification not permitted for this user or by this user.' });
    }


    if (password) { // If password is being updated
      user.password = password; // The pre-save hook will hash it
    }

    const updatedUser = await user.save();
    res.json({ success: true, message: 'User updated successfully.', user: updatedUser.toJSON() });
  } catch (error) {
    console.error("Update user error:", error);
    if (error.code === 11000) { // MongoDB duplicate key error
        return res.status(400).json({ success: false, message: 'Email or Unique ID already exists.' });
    }
    res.status(500).json({ success: false, message: 'Server error while updating user.', error: error.message });
  }
});

// Delete user by ID (Admin only)
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
  try {
    // Prevent admin from deleting their own account
    if (req.user.id === req.params.id) {
        return res.status(400).json({ success: false, message: "Admins cannot delete their own account." });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    // TODO: Consider what happens to assignments or other related data.
    // For now, just deleting the user.
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});


// Forgot Password Request (generates a token, sends email - actual email sending not implemented here)
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // Still return a generic message to prevent email enumeration
            return res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
        }
        
        if (!process.env.JWT_SECRET) {
            console.error("FATAL ERROR: JWT_SECRET for password reset is not defined.");
            return res.status(500).json({ success: false, message: 'Server configuration error for password reset.' });
        }

        // Create a short-lived reset token (example, not cryptographically secure for production without more)
        // In a real app, use a crypto-secure random string, store its hash with an expiry in the DB.
        const resetToken = jwt.sign({ id: user.id, type: 'password_reset' }, process.env.JWT_SECRET, { expiresIn: '15m' }); 
        
        // TODO: Implement actual email sending here with the resetToken
        console.log(`Password reset requested for ${email}. Token: ${resetToken}. Link should be: /reset-password?token=${resetToken}`);
        // Example: await sendPasswordResetEmail(user.email, resetToken);

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
        // Verify this token was intended for password reset (if you add a 'type' field during signing)
        if (decoded.type !== 'password_reset') {
             return res.status(400).json({ success: false, message: 'Invalid token type.' });
        }

        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset token (user not found).' });
        }

        user.password = newPassword; // Pre-save hook will hash
        await user.save();

        res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (error) { // Catches JWT errors (expired, invalid) and DB errors
        console.error("Reset password error:", error);
        res.status(400).json({ success: false, message: 'Invalid or expired reset token, or server error.' });
    }
});


module.exports = router;