
const mongoose = require("mongoose");

const programSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // Name should be unique within an organization
  description: { type: String, required: true, trim: true },
  organizationId: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

programSchema.index({ name: 1, organizationId: 1 }, { unique: true }); // Ensure program name is unique per organization

programSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  }
});

module.exports = mongoose.model("Program", programSchema);
