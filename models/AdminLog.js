
const mongoose = require("mongoose");

const adminLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminDisplayName: { type: String, required: true, trim: true },
  timestamp: { type: Date, default: Date.now },
  logText: { type: String, required: true, trim: true },
  imagePreviewUrl: { type: String, trim: true },
  organizationId: { type: String, required: true, index: true } // Added organizationId
});

adminLogSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  }
});

module.exports = mongoose.model("AdminLog", adminLogSchema);