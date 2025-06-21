
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pendingUserSchema = new mongoose.Schema({
  displayName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true }, // Removed unique:true
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], required: true, default: 'user' },
  uniqueId: { type: String, required: true, trim: true }, // Removed unique:true
  submissionDate: { type: Date, default: Date.now },
  referringAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  organizationId: { type: String, required: true }
});

// Compound unique indexes
pendingUserSchema.index({ email: 1, organizationId: 1 }, { unique: true });
pendingUserSchema.index({ uniqueId: 1, organizationId: 1 }, { unique: true });


pendingUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

pendingUserSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
    delete ret.password; 
  }
});

module.exports = mongoose.model('PendingUser', pendingUserSchema);