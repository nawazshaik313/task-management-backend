
const mongoose = require("mongoose");

const programSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // Name should be unique within an organization
  description: { type: String, required: true, trim: true },
  organizationId: { type: String, required: true, index: true }, // Added organizationId
  createdAt: { type: Date, default: Date.now }
});

// Ensure name is unique per organization
programSchema.index({ name: 1, organizationId: 1 }, { unique: true });

programSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  }
});

module.exports = mongoose.model("Program", programSchema);