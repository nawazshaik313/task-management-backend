
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pendingUserSchema = new mongoose.Schema({
  displayName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true }, // Store hashed password
  role: { type: String, enum: ['admin', 'user'], required: true, default: 'user' },
  uniqueId: { type: String, required: true, unique: true, trim: true },
  submissionDate: { type: Date, default: Date.now },
  referringAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

// Pre-save hook to hash password for pending users as well
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

// Ensure virtual 'id' is included
pendingUserSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
    // Password hash might be needed by admin approval process to create final user
    // but generally should not be exposed if listing pending users.
    // For now, let's keep it for the approval process.
  }
});

module.exports = mongoose.model('PendingUser', pendingUserSchema);
