const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@bitrex123';

const checkAdmin = (req, res, next) => {
  if (req.session.isAdmin) return next();
  
  if (req.body.adminPassword === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return next();
  }

  if (!req.session.isAdmin) return res.redirect('/admin/login');
  next();
};

router.get('/login', (req, res) => {
  res.render('admin-login', { message: '' });
});

router.post('/login', (req, res) => {
  if (req.body.adminPassword === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin/dashboard');
  }
  res.render('admin-login', { message: 'Invalid password' });
});

router.get('/dashboard', checkAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const deposits = await Transaction.find({ type: 'deposit' }).populate('userId', 'name phone');
    const withdrawals = await Transaction.find({ type: 'withdrawal' }).populate('userId', 'name phone');
    const bonuses = await Transaction.find({ type: 'bonus' }).populate('userId', 'name phone');

    const totalBalance = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);

    res.render('admin-dashboard', {
      totalUsers,
      totalBalance: totalBalance[0]?.total || 0,
      deposits,
      withdrawals,
      bonuses
    });
  } catch (error) {
    res.status(500).send('Error loading dashboard');
  }
});

router.post('/approve/:id', checkAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.json({ success: false });

    if (transaction.type === 'deposit') {
      const user = await User.findById(transaction.userId);
      user.balance += transaction.amount;
      await user.save();
    }

    transaction.status = 'completed';
    transaction.approvedAt = new Date();
    await transaction.save();

    res.json({ success: true });
  } catch (error) {
    res.json({ success: false });
  }
});

router.post('/reject/:id', checkAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.json({ success: false });

    transaction.status = 'rejected';
    await transaction.save();

    res.json({ success: true });
  } catch (error) {
    res.json({ success: false });
  }
});

router.get('/logout', (req, res) => {
  req.session.isAdmin = false;
  res.redirect('/admin/login');
});

module.exports = router;
