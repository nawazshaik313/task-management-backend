
const mongoose = require("mongoose");

const programSchema = new mongoose.Schema({
  name: String,
  description: String,
});

module.exports = mongoose.model("Program", programSchema);
