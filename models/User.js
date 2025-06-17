
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  uniqueId: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], required: true, default: 'user' },
  displayName: { type: String, required: true, trim: true },
  position: { type: String, trim: true, default: '' },
  userInterests: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  notificationPreference: { type: String, enum: ['email', 'phone', 'none'], default: 'none' },
  referringAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  organizationId: { type: String, required: true, trim: true }, // Changed from ObjectId to String for simplicity, can be admin's own ID initially
  createdAt: { type: Date, default: Date.now }
});

// Pre-save hook to hash password
userSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  // Prevent re-hashing if password already looks like a bcrypt hash
  // Common bcrypt hash prefixes: $2a$, $2b$, $2y$
  if (this.password && (this.password.startsWith('$2a$') || this.password.startsWith('$2b$') || this.password.startsWith('$2y$'))) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    // Pass error to Mongoose to handle (e.g., during validation phase or save operation)
    next(error);
  }
});

// Method to compare password for login
userSchema.methods.comparePassword = async function (candidatePassword) {
  // Ensure candidatePassword is a string before comparing
  if (typeof candidatePassword !== 'string') {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Ensure virtual 'id' is included and sensitive data is excluded
userSchema.set('toJSON', {
  virtuals: true, // map `_id` to `id`
  versionKey: false, // exclude `__v`
  transform: function (doc, ret) {
    delete ret._id; // remove _id as id is already included
    delete ret.password; // Do not send password hash
  }
});

module.exports = mongoose.model('User', userSchema);
