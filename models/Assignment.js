
const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema({
  title: String,
  description: String,
  assignedTo: String,
  dueDate: Date,
});

module.exports = mongoose.model("Assignment", assignmentSchema);
