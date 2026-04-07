const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

function generateReferralCode() {
  return 'BX' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// SIGNUP
router.post('/signup', [
  body('name').notEmpty().withMessage('Name is required'),
  body('phone').isMobilePhone().withMessage('Invalid phone number'),
  body('email').isEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 6, max: 8 }).withMessage('Password must be 6-8 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('index', { message: errors.array()[0].msg });
  }

  try {
    const { name, phone, email, password, referralCode } = req.body;

    let user = await User.findOne({ $or: [{ email }, { phone }] });
    if (user) {
      return res.status(400).render('index', { message: 'User already exists' });
    }

    const newReferralCode = generateReferralCode();
    user = new User({
      name,
      phone,
      email,
      password,
      referralCode: newReferralCode
    });

    await user.save();

    req.session.userId = user._id;
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    
    return res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).render('index', { message: 'Server error' });
  }
});

// LOGIN
router.post('/login', [
  body('phone').isMobilePhone().withMessage('Invalid phone number'),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('index', { message: errors.array()[0].msg });
  }

  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).render('index', { message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).render('index', { message: 'Invalid credentials' });
    }

    req.session.userId = user._id;
    return res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).render('index', { message: 'Server error' });
  }
});

module.exports = router;
