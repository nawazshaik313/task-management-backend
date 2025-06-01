
const mongoose = require("mongoose");

const adminLogSchema = new mongoose.Schema({
  action: String,
  user: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AdminLog", adminLogSchema);
