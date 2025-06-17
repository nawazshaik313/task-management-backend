
const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  requiredSkills: { type: String, required: true, trim: true },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', default: null },
  programName: { type: String, trim: true }, // Denormalized for convenience
  deadline: { type: Date },
  organizationId: { type: String, required: true, index: true }, // Added organizationId
  createdAt: { type: Date, default: Date.now }
});

taskSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  }
});

module.exports = mongoose.model("Task", taskSchema);