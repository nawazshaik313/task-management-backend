
const mongoose = require("mongoose");

const assignmentStatusEnum = [
  'pending_acceptance',
  'accepted_by_user',
  'declined_by_user',
  'submitted_on_time',
  'submitted_late',
  'completed_admin_approved'
];

const assignmentSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  personId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  taskTitle: { type: String, required: true, trim: true }, // Denormalized for convenience
  personName: { type: String, required: true, trim: true }, // Denormalized for convenience
  justification: { type: String, trim: true },
  status: { type: String, enum: assignmentStatusEnum, required: true, default: 'pending_acceptance' },
  deadline: { type: Date }, // Specific deadline for this assignment instance
  userSubmissionDate: { type: Date },
  userDelayReason: { type: String, trim: true },
  organizationId: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

// Compound index to prevent duplicate assignments of the same task to the same person within an organization
assignmentSchema.index({ taskId: 1, personId: 1, organizationId: 1 }, { unique: true });

assignmentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  }
});

module.exports = mongoose.model("Assignment", assignmentSchema);
