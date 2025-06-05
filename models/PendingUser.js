// models/PendingUser.js
const mongoose = require('mongoose');

const pendingUserSchema = new mongoose.Schema({
  displayName: String,
  email: String,
  password: String,
  role: String,
  uniqueId: String,
  submissionDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PendingUser', pendingUserSchema);
