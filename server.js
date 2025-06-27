
require('dotenv').config(); // MUST BE AT THE VERY TOP

// Startup check for critical environment variables
if (!process.env.MONGO_URI) {
  console.error("FATAL ERROR: MONGO_URI environment variable is not defined.");
  console.log("Please ensure MONGO_URI is set in your .env file or deployment environment.");
  process.exit(1); // Exit if DB connection string is missing
} else {
  console.log("INFO: MONGO_URI is loaded.");
}

if (!process.env.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET environment variable is not defined.");
  console.log("Please ensure JWT_SECRET is set in your .env file or deployment environment. This is critical for authentication.");
  process.exit(1); // Exit if JWT secret is missing
} else {
  console.log("INFO: JWT_SECRET is loaded.");
}

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
// const currentUserRoutes = require('./routes/currentUserRoutes'); // This was problematic and likely not needed

const app = express();

// Core Middleware
app.use(cors()); // Configure CORS appropriately for your production environment
app.use(express.json()); // To parse JSON request bodies

// Connect to MongoDB
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
// app.use('/current-user', currentUserRoutes); // If re-introducing, ensure it's necessary and correct

// Basic Test Route
app.get('/', (req, res) => {
  res.send('Task Assignment Assistant Backend API is running...');
});

// Global Error Handler (optional, for unhandled errors)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(500).json({ success: false, message: 'Something broke on the server!', error: err.message });
});

// Start Server
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Listen on all available network interfaces

app.listen(PORT, HOST, () => {
  console.log(`✅ Server is running on port ${PORT}`);
  if(process.env.NODE_ENV !== 'production'){
    console.log(`   Development server accessible at: http://localhost:${PORT}`);
  }
});
