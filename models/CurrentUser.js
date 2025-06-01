
const mongoose = require("mongoose");

const currentUserSchema = new mongoose.Schema({
  email: String,
  password: String,
  displayName: String,
  role: String
});

module.exports = mongoose.model("CurrentUser", currentUserSchema);
