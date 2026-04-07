const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const DailyIncome = require('../models/DailyIncome');

const checkAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  next();
};

router.get('/', checkAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const today = new Date().toDateString();
    const dailyIncome = await DailyIncome.findOne({
      userId: user._id,
      date: { $gte: new Date(today) }
    });

    const transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10);

    res.render('dashboard', {
      user,
      balance: user.balance,
      totalEarnings: user.totalEarnings,
      investedCities: user.investedCities,
      todayIncome: dailyIncome ? dailyIncome.totalIncome : 0,
      transactions
    });
  } catch (error) {
    console.error(error);
    res.redirect('/');
  }
});

module.exports = router;
