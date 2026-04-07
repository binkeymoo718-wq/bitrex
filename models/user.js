const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  referralCode: { type: String, unique: true, required: true },
  balance: { type: Number, default: 0 },
  investedCities: [{
    city: String,
    investmentAmount: Number,
    joinedDate: { type: Date, default: Date.now },
    dailyIncome: Number
  }],
  totalEarnings: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },
  referralBonusReceived: { type: Number, default: 0 },
  tasksCompletedToday: { type: Number, default: 0 },
  lastTaskDate: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare passwords
userSchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
