const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const PendingUser = require('./models/PendingUser');
const User = require('./models/User'); // ✅ Add this line

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// Define PendingUser schema and model
const pendingUserSchema = new mongoose.Schema({
displayName: String,
email: { type: String, unique: true },
password: String,
role: String,
uniqueId: { type: String, unique: true },
submissionDate: { type: Date, default: Date.now },
});

const PendingUser = mongoose.model("PendingUser", pendingUserSchema);

// Route: Register Pending User
app.post('/pending-users', async (req, res) => {
  const { displayName, email, password, role, uniqueId } = req.body;

  if (!displayName || !email || !password || !role || !uniqueId) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    // Check if email or uniqueId already exists in users or pending users
    const existingUser = await User.findOne({ email });
    const existingPending = await PendingUser.findOne({ $or: [{ email }, { uniqueId }] });

    if (existingUser || existingPending) {
      return res.status(409).json({ success: false, error: 'Email or Unique ID already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Check if this is the first user (admin)
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

    // Otherwise register as pending user
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
      message: "Registration successful",
      user: newPendingUser
    });

  } catch (err) {
  console.error("❌ Error saving user:", err.message || err);
  res.status(500).json({ success: false, error: err.message || "Server error while registering." });
}

});


// Test route
app.get('/', (req, res) => {
res.send('Backend API is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

