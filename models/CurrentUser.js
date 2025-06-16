
const mongoose = require("mongoose");

const currentUserSchema = new mongoose.Schema({
  email: String,
  password: String, // Storing plain password here is a security risk.
  displayName: String,
  role: String
});

// It's generally not recommended to have a separate "CurrentUser" model that stores
// potentially sensitive information like passwords, especially if it's for *the* current user.
// User authentication and session management (JWT) along with the main User model
// should handle current user data. This model seems redundant and potentially insecure.
// module.exports = mongoose.model("CurrentUser", currentUserSchema);
console.warn("WARNING: backend/models/CurrentUser.js is likely redundant and not recommended for use. User data should be managed via the User model and JWT sessions.");
module.exports = {}; // Export empty object to prevent errors if still imported, but signals deprecation.
