const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const CITIES = {
  'CITY A': { investment: 1500, maxTasks: 1, dailyIncome: 50 },
  'CITY B': { investment: 3200, maxTasks: 2, dailyIncome: 100 },
  'CITY C': { investment: 7200, maxTasks: 4, dailyIncome: 200 },
  'CITY D': { investment: 12000, maxTasks: 8, dailyIncome: 400 },
  'CITY E': { investment: 15000, maxTasks: 10, dailyIncome: 500 }
};

const checkAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  next();
};

router.get('/', checkAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const cities = Object.keys(CITIES).map(cityName => ({
      name: cityName,
      ...CITIES[cityName],
      isInvested: user.investedCities.some(c => c.city === cityName)
    }));

    res.render('cities', { user, cities, message: '' });
  } catch (error) {
    res.redirect('/dashboard');
  }
});

router.post('/invest', checkAuth, async (req, res) => {
  try {
    const { city } = req.body;
    const user = await User.findById(req.session.userId);

    if (!CITIES[city]) {
      return res.json({ success: false, message: 'Invalid city' });
    }

    if (user.investedCities.some(c => c.city === city)) {
      return res.json({ success: false, message: 'Already invested in this city' });
    }

    const cityData = CITIES[city];

    if (user.balance < cityData.investment) {
      return res.json({ success: false, message: 'Insufficient balance' });
    }

    user.balance -= cityData.investment;
    user.investedCities.push({
      city,
      investmentAmount: cityData.investment,
      joinedDate: new Date(),
      dailyIncome: cityData.dailyIncome
    });

    await Transaction.create({
      userId: user._id,
      type: 'withdrawal',
      amount: cityData.investment,
      status: 'completed',
      description: `Investment in ${city}`
    });

    await user.save();

    res.json({
      success: true,
      message: 'Investment successful!',
      balance: user.balance,
      investedCities: user.investedCities
    });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
