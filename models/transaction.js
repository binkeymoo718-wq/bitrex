const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'bonus', 'task_income'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
  description: String,
  paymentMethod: String,
  evidenceImage: String,
  phone: String,
  createdAt: { type: Date, default: Date.now },
  approvedAt: Date
});

module.exports = mongoose.model('Transaction', transactionSchema);
