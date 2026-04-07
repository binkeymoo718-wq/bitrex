const mongoose = require('mongoose');

const dailyIncomeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  taskIncome: { type: Number, default: 0 },
  totalIncome: { type: Number, default: 0 },
  tasksCompleted: [{
    taskName: String,
    amount: Number,
    city: String,
    completedAt: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('DailyIncome', dailyIncomeSchema);
