
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pendingUserSchema = new mongoose.Schema({
  displayName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, index: true }, // unique:true removed
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], required: true, default: 'user' },
  uniqueId: { type: String, required: true, trim: true, index: true }, // unique:true removed
  submissionDate: { type: Date, default: Date.now },
  referringAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  organizationId: { type: String, required: true, index: true } // Index added for consistency
});

// Compound unique indexes for multi-tenancy
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
    // Do not send password hash in listings, but it's needed for approval.
    // This toJSON is for general listings. Approval route will have access to the document.
    delete ret.password;
  }
});

module.exports = mongoose.model('PendingUser', pendingUserSchema);