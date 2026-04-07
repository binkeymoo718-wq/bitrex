const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const checkAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  next();
};

router.get('/', checkAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 });
    res.render('wallet', { user, balance: user.balance, transactions, message: '' });
  } catch (error) {
    res.redirect('/dashboard');
  }
});

router.post('/deposit', checkAuth, async (req, res) => {
  try {
    const { amount, phone, evidence } = req.body;

    if (amount < 300) {
      return res.json({ success: false, message: 'Minimum deposit is KSH 300' });
    }

    const transaction = new Transaction({
      userId: req.session.userId,
      type: 'deposit',
      amount,
      status: 'pending',
      phone,
      evidenceImage: evidence,
      paymentMethod: 'M-Pesa'
    });

    await transaction.save();
    res.json({ success: true, message: 'Deposit submitted for approval' });
  } catch (error) {
    res.json({ success: false, message: 'Server error' });
  }
});

router.post('/withdraw', checkAuth, async (req, res) => {
  try {
    const { amount, phone } = req.body;
    const user = await User.findById(req.session.userId);

    if (amount < 500) {
      return res.json({ success: false, message: 'Minimum withdrawal is KSH 500' });
    }

    if (amount > user.balance) {
      return res.json({ success: false, message: 'Insufficient balance' });
    }

    const transaction = new Transaction({
      userId: user._id,
      type: 'withdrawal',
      amount,
      status: 'pending',
      phone,
      paymentMethod: 'M-Pesa'
    });

    await transaction.save();
    res.json({ success: true, message: 'Withdrawal request submitted' });
  } catch (error) {
    res.json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
