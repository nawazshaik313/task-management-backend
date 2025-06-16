
require('dotenv').config(); // MUST BE AT THE VERY TOP

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Import Routers
const userRoutes = require('./routes/userRoutes');
const pendingUserRoutes = require('./routes/pendingUserRoutes');
const taskRoutes = require('./routes/taskRoutes');
const programRoutes = require('./routes/programRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const adminLogRoutes = require('./routes/adminLogRoutes');
// Import currentUserRoutes if still needed, though its functionality might be covered by /users/current
// const currentUserRoutes = require('./routes/currentUserRoutes');


const app = express();

// Core Middleware
app.use(cors()); // Configure CORS appropriately for your production environment
app.use(express.json()); // To parse JSON request bodies

// Connect to MongoDB
// Check if MONGO_URI is set
if (!process.env.MONGO_URI) {
  console.error("FATAL ERROR: MONGO_URI environment variable is not defined.");
  process.exit(1); // Exit if DB connection string is missing
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully."))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1); // Exit if DB connection fails
  });

// Mount API Routes
app.use('/users', userRoutes);
app.use('/pending-users', pendingUserRoutes);
app.use('/tasks', taskRoutes);
app.use('/programs', programRoutes);
app.use('/assignments', assignmentRoutes);
app.use('/admin-logs', adminLogRoutes);
// app.use('/current-user', currentUserRoutes); // If used

// Basic Test Route
app.get('/', (req, res) => {
  res.send('Task Assignment Assistant Backend API is running...');
});

// Global Error Handler (optional, for unhandled errors)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(500).send('Something broke!');
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});