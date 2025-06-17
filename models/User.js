
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
  uniqueId: { type: String, required: true, unique: true, trim: true, index: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], required: true, default: 'user' },
  displayName: { type: String, required: true, trim: true },
  position: { type: String, trim: true, default: '' },
  userInterests: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  notificationPreference: { type: String, enum: ['email', 'phone', 'none'], default: 'none' },
  referringAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  organizationId: { type: String, required: true, index: true }, // Added organizationId
  createdAt: { type: Date, default: Date.now }
});

// Pre-save hook to hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  // Check if password looks like a hash already ONLY if it's not a new document
  // For new documents or when password is explicitly set, always hash.
  if (!this.isNew && this.password && (this.password.startsWith('$2a$') || this.password.startsWith('$2b$') || this.password.startsWith('$2y$'))) {
    // This check is a bit tricky. If an admin resets a password for a user,
    // they might pass a new plain text password.
    // The safest is to always re-hash if `isModified('password')` is true and it's not from `pendingUser` approval.
    // For simplicity here, if modified, hash it.
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password for login
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (typeof candidatePassword !== 'string') {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
    delete ret.password;
  }
});

module.exports = mongoose.model('User', userSchema);