const express = require('express');
const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
require('dotenv').config();

const app = express();

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session Configuration
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/bitrex_platform';

app.use(session({
  secret: process.env.JWT_SECRET || 'bitrex-secret',
  resave: false,
  saveUninitialized: false,
  store: new MongoStore({
    mongoUrl: mongoUrl,
    collection: 'sessions',
    ttl: 24 * 60 * 60
  }),
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ==================== DATABASE CONNECTION ====================
mongoose.connect(mongoUrl, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => {
  console.error('❌ MongoDB Error:', err.message);
  process.exit(1);
});

// ==================== SCHEMAS ====================

// User Schema
const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: String, default: null },
  balance: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  dailyIncome: { type: Number, default: 0 },
  lastDailyReset: { type: Date, default: Date.now },
  citiesJoined: [{
    city: String,
    investmentAmount: Number,
    joinedDate: { type: Date, default: Date.now },
    tasksCompletedToday: { type: Number, default: 0 },
    lastTaskReset: { type: Date, default: Date.now },
    maxTasksPerDay: Number,
    dailyEarning: Number
  }],
  referralCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  type: String,
  amount: Number,
  status: { type: String, default: 'completed' },
  description: String,
  createdAt: { type: Date, default: Date.now }
});

// Task Schema
const taskSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  city: String,
  taskName: String,
  taskAmount: { type: Number, default: 50 },
  completedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Task = mongoose.model('Task', taskSchema);

// ==================== UTILITIES ====================

const generateReferralCode = () => {
  return 'BITREX' + Math.random().toString(36).substr(2, 8).toUpperCase();
};

const resetDailyIncome = async (user) => {
  const now = new Date();
  const lastReset = new Date(user.lastDailyReset);
  
  if (now.toDateString() !== lastReset.toDateString()) {
    user.dailyIncome = 0;
    user.lastDailyReset = now;
    
    user.citiesJoined.forEach(city => {
      city.tasksCompletedToday = 0;
      city.lastTaskReset = now;
    });
    
    await user.save();
  }
};

const cityData = {
  'CITY A': { investment: 1500, maxTasks: 1, dailyIncome: 50 },
  'CITY B': { investment: 3200, maxTasks: 2, dailyIncome: 100 },
  'CITY C': { investment: 7200, maxTasks: 4, dailyIncome: 200 },
  'CITY D': { investment: 12000, maxTasks: 8, dailyIncome: 400 },
  'CITY E': { investment: 15000, maxTasks: 10, dailyIncome: 500 }
};

const taskList = [
  '2.5L Vaccum Flask', 'Mini massage gun', 'Blood glucose machine', 'Electric blender',
  'Modern soldering gun', 'Television set', 'Electric meter', 'Smart phones',
  'HD Camera High pixel', 'Iron sheets', 'Plumbing tools', 'Furniture', 'Wi-Fi systems',
  'Laptops', 'Textiles', 'Paints', 'Cosmetics', 'Electrical tools', 'Shoes',
  'Gas cookers', 'Electric heater', 'Air Fryer (4L or 5L)', 'Electric Pressure Cooker',
  'Microwave Oven', 'Non-stick Cookware Set', 'Water Dispenser (Hot & Cold)',
  'Rechargeable Juicer Cup', 'Electric Kettle (Stainless Steel)', 'Subwoofer System (Bluetooth)',
  'Android TV Box', 'Rechargeable Bluetooth Speaker', 'Gaming Console (Handheld)',
  'Smart Watch (Series 8/9)', 'Wireless Earbuds (Airpods Pro)', 'Solar Lighting System'
];

// ==================== AUTH ROUTES ====================

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { phone, email, password, confirmPassword, referralCode } = req.body;

    if (!phone || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const cleanPhone = phone.replace(/\s+/g, '').trim();
    const cleanEmail = email.toLowerCase().trim();

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (password.length < 6 || password.length > 8) {
      return res.status(400).json({ message: 'Password must be 6-8 characters' });
    }

    const existing = await User.findOne({ $or: [{ phone: cleanPhone }, { email: cleanEmail }] });
    if (existing) {
      return res.status(400).json({ message: 'Phone or Email already registered' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    const newReferralCode = generateReferralCode();

    const newUser = new User({
      phone: cleanPhone,
      email: cleanEmail,
      password: hashedPassword,
      referralCode: newReferralCode,
      referredBy: referralCode || null
    });

    await newUser.save();

    // Update referrer
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        referrer.referralCount += 1;
        if (referrer.referralCount % 5 === 0) {
          referrer.balance += 300;
          await new Transaction({
            userId: referrer._id,
            type: 'bonus',
            amount: 300,
            description: '🎁 Referral Bonus',
            status: 'completed'
          }).save();
        }
        await referrer.save();
      }
    }

    res.status(201).json({
      message: 'Account created!',
      referralCode: newReferralCode
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password required' });
    }

    const cleanPhone = phone.replace(/\s+/g, '').trim();
    const user = await User.findOne({ phone: cleanPhone });

    if (!user || !(await bcryptjs.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await resetDailyIncome(user);

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'bitrex-secret', { expiresIn: '7d' });
    req.session.userId = user._id;

    res.json({
      message: 'Login successful!',
      token,
      userId: user._id
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== DASHBOARD ====================

app.get('/api/dashboard/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await resetDailyIncome(user);
    const updated = await User.findById(user._id);

    res.json({
      _id: updated._id,
      phone: updated.phone,
      email: updated.email,
      balance: updated.balance,
      totalEarnings: updated.totalEarnings,
      dailyIncome: updated.dailyIncome,
      citiesJoined: updated.citiesJoined,
      referralCode: updated.referralCode,
      referralCount: updated.referralCount,
      createdAt: updated.createdAt
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/cities', (req, res) => {
  res.json(cityData);
});

app.get('/api/tasks', (req, res) => {
  res.json(taskList.map(task => ({ name: task, amount: 50 })));
});

// ==================== INVESTMENT ====================

app.post('/api/invest', async (req, res) => {
  try {
    const { userId, city } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const cityInfo = cityData[city];
    if (!cityInfo) return res.status(400).json({ message: 'Invalid city' });

    if (user.citiesJoined.find(c => c.city === city)) {
      return res.status(400).json({ message: `❌ You already invested in ${city}` });
    }

    if (user.balance < cityInfo.investment) {
      return res.status(400).json({ message: `❌ Insufficient balance` });
    }

    user.balance -= cityInfo.investment;
    user.citiesJoined.push({
      city,
      investmentAmount: cityInfo.investment,
      maxTasksPerDay: cityInfo.maxTasks,
      dailyEarning: cityInfo.dailyIncome,
      tasksCompletedToday: 0,
      lastTaskReset: new Date()
    });

    await user.save();

    await new Transaction({
      userId,
      type: 'investment',
      amount: cityInfo.investment,
      description: `💼 Invested in ${city}`,
      status: 'completed'
    }).save();

    res.json({ message: `✅ Invested in ${city}!`, citiesJoined: user.citiesJoined, balance: user.balance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== TASKS ====================

app.post('/api/complete-task', async (req, res) => {
  try {
    const { userId, city, taskName } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await resetDailyIncome(user);
    const updated = await User.findById(userId);

    const userCity = updated.citiesJoined.find(c => c.city === city);
    if (!userCity) return res.status(400).json({ message: `Not invested in ${city}` });

    if (userCity.tasksCompletedToday >= userCity.maxTasksPerDay) {
      return res.status(400).json({ message: `⚠️ Task limit reached (${userCity.maxTasksPerDay}/day)` });
    }

    userCity.tasksCompletedToday += 1;
    updated.dailyIncome += userCity.dailyEarning;
    updated.balance += userCity.dailyEarning;
    updated.totalEarnings += userCity.dailyEarning;

    await updated.save();

    await new Task({
      userId,
      city,
      taskName
    }).save();

    await new Transaction({
      userId,
      type: 'task_income',
      amount: userCity.dailyEarning,
      description: `✅ ${taskName}`,
      status: 'completed'
    }).save();

    res.json({
      message: '✅ Task completed!',
      dailyIncome: updated.dailyIncome,
      balance: updated.balance,
      tasksCompleted: userCity.tasksCompletedToday,
      maxTasks: userCity.maxTasksPerDay
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== DEPOSIT ====================

app.post('/api/deposit', async (req, res) => {
  try {
    const { userId, amount, phoneNumber } = req.body;

    if (parseFloat(amount) < 300) {
      return res.status(400).json({ message: 'Minimum KSH 300' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.balance += parseFloat(amount);
    await user.save();

    await new Transaction({
      userId,
      type: 'deposit',
      amount: parseFloat(amount),
      description: '💰 Deposit verified',
      status: 'completed'
    }).save();

    res.json({ message: `✅ KSH ${amount} added!`, balance: user.balance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== WITHDRAWAL ====================

app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, amount, phoneNumber, withdrawalPassword } = req.body;

    const numAmount = parseFloat(amount);
    if (numAmount < 500) {
      return res.status(400).json({ message: 'Minimum KSH 500' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.balance < numAmount) {
      return res.status(400).json({ message: `Insufficient balance (KSH ${user.balance})` });
    }

    user.balance -= numAmount;
    await user.save();

    await new Transaction({
      userId,
      type: 'withdrawal',
      amount: numAmount,
      description: `💸 To ${phoneNumber}`,
      status: 'completed'
    }).save();

    res.json({ message: `✅ KSH ${numAmount} withdrawn!`, balance: user.balance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== TRANSACTIONS ====================

app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId })
      .sort({ createdAt: -1 }).limit(50);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== PAGES ====================

app.get('/', (req, res) => {
  if (req.session.userId) res.redirect('/dashboard');
  else res.render('index');
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.userId) return res.redirect('/');
  try {
    const user = await User.findById(req.session.userId);
    res.render('dashboard', { user });
  } catch (error) {
    res.redirect('/');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'Server error' });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 BITREX Platform running on http://localhost:${PORT}`);
  console.log(`📊 Database: MongoDB\n`);
});

process.on('SIGINT', async () => {
  console.log('\n⏹️ Shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});
