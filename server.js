const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User'); // Import User model

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ✅ Define PendingUser schema and model
const pendingUserSchema = new mongoose.Schema({
  displayName: String,
  email: { type: String, unique: true },
  password: String,
  role: String,
  uniqueId: { type: String, unique: true },
  submissionDate: { type: Date, default: Date.now },
});

const PendingUser = mongoose.model("PendingUser", pendingUserSchema);

// Middleware to verify JWT token
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Get token after 'Bearer '

  if (!token) return res.status(401).json({ success: false, message: 'Access token missing' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// ✅ Route: Register User or PendingUser
app.post('/pending-users', async (req, res) => {
  const { displayName, email, password, role, uniqueId } = req.body;

  if (!displayName || !email || !password || !role || !uniqueId) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const existingUser = await User.findOne({ email });
    const existingPending = await PendingUser.findOne({ $or: [{ email }, { uniqueId }] });

    if (existingUser || existingPending) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ If first user and role is admin, auto-approve
    const userCount = await User.countDocuments();
    if (userCount === 0 && role === 'admin') {
      const newAdmin = new User({
        displayName,
        email,
        password: hashedPassword,
        role,
        uniqueId
      });

      await newAdmin.save();

      return res.status(201).json({
        success: true,
        message: "Admin registered successfully",
        user: newAdmin
      });
    }

    // ❗ All other users → pending approval
    const newPendingUser = new PendingUser({
      displayName,
      email,
      password: hashedPassword,
      role,
      uniqueId,
    });

    await newPendingUser.save();

    res.status(201).json({
      success: true,
      message: "Registration submitted and pending approval",
      user: newPendingUser
    });

  } catch (err) {
    console.error("❌ Error saving user:", err.message || err);
    res.status(500).json({ success: false, error: err.message || "Server error while registering." });
  }
});

// ✅ Route: User Login
app.post('/users/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or user does not exist' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,  // <-- Send token here
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        uniqueId: user.uniqueId
      }
    });

  } catch (err) {
    console.error("❌ Login error:", err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// ✅ Protected Route example (requires valid JWT)
app.get('/secure-data', verifyToken, (req, res) => {
  // req.user contains the decoded JWT payload
  res.json({
    success: true,
    message: 'This is protected data only visible to authenticated users.',
    user: req.user
  });
});

// ✅ Your requested admin-only route (protected)
app.get('/admin-only', verifyToken, (req, res) => {
  res.send('Hello Admin');
});

// ✅ Test Route
app.get('/', (req, res) => {
  res.send('Backend API is running...');
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
