const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const userRoutes = require("./routes/userRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const programRoutes = require("./routes/programRoutes");
const pendingUserRoutes = require("./routes/pendingUserRoutes");
const adminLogRoutes = require("./routes/adminLogRoutes");
const currentUserRoutes = require("./routes/currentUserRoutes");

app.use("/api/users", userRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/pending-users", pendingUserRoutes);
app.use("/api/admin-logs", adminLogRoutes);
app.use("/api/current-user", currentUserRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid'); // for generating unique IDs

// If using a database like MongoDB:
const users = []; // Temporary in-memory storage
const pendingUsers = [];

const app = express();
app.use(cors());
app.use(express.json()); // Middleware to parse JSON bodies

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
app.get('/', (req, res) => {
res.send('Backend API is running...');
});
app.post('/pending-users', async (req, res) => {
const { displayName, email, password, role, uniqueId } = req.body;

// Validate required fields
if (!displayName || !email || !password || !role || !uniqueId) {
return res.status(400).json({ error: 'Missing required fields' });
}

// Check if email or uniqueId already exists in either active or pending users
const emailExists = users.some(u => u.email === email) || pendingUsers.some(p => p.email === email);
const idExists = users.some(u => u.uniqueId === uniqueId) || pendingUsers.some(p => p.uniqueId === uniqueId);

if (emailExists || idExists) {
return res.status(409).json({ error: 'Email or Unique ID already exists' });
}

// Hash the password
const hashedPassword = await bcrypt.hash(password, 10);

const newPendingUser = {
id: uuidv4(),
displayName,
email,
password: hashedPassword,
role,
uniqueId,
submissionDate: new Date().toISOString(),
};

// Save to in-memory array (replace this with DB save)
pendingUsers.push(newPendingUser);

// Respond with created user
res.status(201).json(newPendingUser);
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
console.log(✅ Server running on port ${PORT});
});
POST https://your-backend-url.com/pending-users

Request Body (JSON):
{
"displayName": "John Doe",
"email": "john@example.com",
"password": "secure123",
"role": "user",
"uniqueId": "U123"
}