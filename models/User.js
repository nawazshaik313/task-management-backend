
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true }, // Removed unique:true here
  uniqueId: { type: String, required: true, trim: true }, // Removed unique:true here
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], required: true, default: 'user' },
  displayName: { type: String, required: true, trim: true },
  position: { type: String, trim: true, default: '' },
  userInterests: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  notificationPreference: { type: String, enum: ['email', 'phone', 'none'], default: 'none' },
  referringAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  organizationId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

// Compound unique indexes
userSchema.index({ email: 1, organizationId: 1 }, { unique: true });
userSchema.index({ uniqueId: 1, organizationId: 1 }, { unique: true });

// Pre-save hook to hash password
userSchema.pre('save', async function (next) {
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