
const mongoose = require("mongoose");

const pendingUserSchema = new mongoose.Schema({
  email: String,
  password: String,
  displayName: String,
  role: String
});

module.exports = mongoose.model("PendingUser", pendingUserSchema);
