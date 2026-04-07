const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Referral = require('../models/Referral');
const Transaction = require('../models/Transaction');

const checkAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  next();
};

router.get('/', checkAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const referrals = await Referral.find({ referrerId: user._id }).populate('referredUserId');

    const joinedCount = referrals.filter(r => r.status === 'joined').length;
    const pendingCount = referrals.filter(r => r.status === 'pending').length;

    const referralLink = `${req.get('host')}/auth/signup?ref=${user.referralCode}`;

    res.render('referrals', {
      user,
      referralCode: user.referralCode,
      referralLink,
      joinedCount,
      pendingCount,
      referrals,
      message: ''
    });
  } catch (error) {
    res.redirect('/dashboard');
  }
});

router.post('/check-bonus', checkAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const joinedCount = await Referral.countDocuments({
      referrerId: user._id,
      status: 'joined'
    });

    if (joinedCount >= 5 && user.referralBonusReceived === 0) {
      user.balance += 300;
      user.referralBonusReceived += 1;

      await Transaction.create({
        userId: user._id,
        type: 'bonus',
        amount: 300,
        status: 'completed',
        description: 'Referral bonus: 5 friends joined'
      });

      await user.save();

      return res.json({
        success: true,
        message: 'Bonus awarded!',
        bonusAmount: 300,
        balance: user.balance
      });
    }

    res.json({
      success: false,
      message: `Need ${5 - joinedCount} more referrals for bonus`,
      joinedCount
    });
  } catch (error) {
    res.json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
