const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
require("dotenv").config();

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

// Validate required fields
if (!displayName || !email || !password || !role || !uniqueId) {
return res.status(400).json({ error: 'Missing required fields' });
}

try {
// Check if email or uniqueId already exists
const existing = await PendingUser.findOne({ $or: [{ email }, { uniqueId }] });
if (existing) {
return res.status(409).json({ error: 'Email or Unique ID already exists' });
}


// Hash password
const hashedPassword = await bcrypt.hash(password, 10);

// Create and save
const newPendingUser = new PendingUser({
  displayName,
  email,
  password: hashedPassword,
  role,
  uniqueId,
});

await newPendingUser.save();
res.status(201).json({ success: true, user: newPendingUser });


} catch (err) {
console.error("❌ Error saving pending user:", err);
res.status(500).json({ error: "Server error while registering." });
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

