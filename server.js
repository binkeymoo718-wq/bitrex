const express = require('express');
const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/income_platform', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected')).catch(err => console.log(err));

// ==================== SCHEMAS ====================

// User Schema
const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  referralCode: { type: String, unique: true },
  referredBy: String,
  balance: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  dailyIncome: { type: Number, default: 0 },
  citiesJoined: [{
    city: String,
    investmentAmount: Number,
    joinedDate: { type: Date, default: Date.now },
    tasksCompletedToday: { type: Number, default: 0 },
    maxTasksPerDay: Number,
    dailyEarning: Number
  }],
  referralCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  type: String, // 'deposit', 'withdrawal', 'bonus', 'task_income'
  amount: Number,
  status: { type: String, default: 'pending' }, // 'pending', 'completed', 'failed'
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

// Deposit Evidence Schema
const depositEvidenceSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  amount: Number,
  phoneNumber: String,
  evidenceUrl: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Task = mongoose.model('Task', taskSchema);
const DepositEvidence = mongoose.model('DepositEvidence', depositEvidenceSchema);

// ==================== UTILITY FUNCTIONS ====================

const generateReferralCode = () => {
  return 'REF' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

const cityData = {
  'CITY A': { investment: 1500, maxTasks: 1, dailyIncome: 50 },
  'CITY B': { investment: 3200, maxTasks: 2, dailyIncome: 100 },
  'CITY C': { investment: 7200, maxTasks: 4, dailyIncome: 200 },
  'CITY D': { investment: 12000, maxTasks: 8, dailyIncome: 400 },
  'CITY E': { investment: 15000, maxTasks: 10, dailyIncome: 500 }
};

const taskList = [
  '2.5L Vaccum Flask',
  'Mini massage gun',
  'Blood glucose machine',
  'Electric blender',
  'Modern soldering gun',
  'Television set',
  'Electric meter',
  'Smart phones',
  'HD Camera High pixel',
  'Iron sheets',
  'Plumbing tools',
  'Furniture',
  'Wi-Fi systems',
  'Laptops',
  'Textiles',
  'Paints',
  'Cosmetics',
  'Electrical tools',
  'Shoes',
  'Gas cookers',
  'Electric heater',
  'Air Fryer (4L or 5L)',
  'Electric Pressure Cooker',
  'Microwave Oven',
  'Non-stick Cookware Set',
  'Water Dispenser (Hot & Cold)',
  'Rechargeable Juicer Cup',
  'Electric Kettle (Stainless Steel)',
  'Subwoofer System (Bluetooth)',
  'Android TV Box',
  'Rechargeable Bluetooth Speaker',
  'Gaming Console (Handheld)',
  'Smart Watch (Series 8/9)',
  'Wireless Earbuds (Airpods Pro)',
  'Solar Lighting System'
];

// ==================== ROUTES ====================

// Signup Route
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { phone, email, password, confirmPassword, referralCode } = req.body;

    // Validation
    if (!phone || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (password.length < 6 || password.length > 8) {
      return res.status(400).json({ message: 'Password must be 6-8 characters' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Generate referral code
    const newReferralCode = generateReferralCode();

    // Create user
    const newUser = new User({
      phone,
      email,
      password: hashedPassword,
      referralCode: newReferralCode,
      referredBy: referralCode || null
    });

    await newUser.save();

    // Update referrer's count
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        referrer.referralCount += 1;
        if (referrer.referralCount % 5 === 0) {
          referrer.balance += 300;
          const transaction = new Transaction({
            userId: referrer._id,
            type: 'bonus',
            amount: 300,
            description: 'Referral Bonus - 5 friends joined',
            status: 'completed'
          });
          await transaction.save();
        }
        await referrer.save();
      }
    }

    res.status(201).json({ 
      message: 'Account created successfully',
      userId: newUser._id,
      referralCode: newReferralCode
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login Route
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password are required' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcryptjs.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, 'secret-key', { expiresIn: '7d' });

    req.session.userId = user._id;
    req.session.token = token;

    res.json({ 
      message: 'Login successful',
      token,
      userId: user._id
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Dashboard Data
app.get('/api/dashboard/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Reset daily income at midnight
    const now = new Date();
    const lastReset = new Date(user.createdAt);
    if (now.toDateString() !== lastReset.toDateString()) {
      user.dailyIncome = 0;
      await user.save();
    }

    res.json({
      phone: user.phone,
      balance: user.balance,
      totalEarnings: user.totalEarnings,
      dailyIncome: user.dailyIncome,
      citiesJoined: user.citiesJoined,
      referralCode: user.referralCode,
      referralCount: user.referralCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get All Cities
app.get('/api/cities', (req, res) => {
  res.json(cityData);
});

// Get All Tasks
app.get('/api/tasks', (req, res) => {
  res.json(taskList.map(task => ({ name: task, amount: 50 })));
});

// Invest in City
app.post('/api/invest', async (req, res) => {
  try {
    const { userId, city } = req.body;

    if (!userId || !city) {
      return res.status(400).json({ message: 'User ID and city are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const cityInfo = cityData[city];
    if (!cityInfo) {
      return res.status(400).json({ message: 'Invalid city' });
    }

    // Check if already invested in this city
    const alreadyInvested = user.citiesJoined.find(c => c.city === city);
    if (alreadyInvested) {
      return res.status(400).json({ message: 'Already invested in this city' });
    }

    // Check balance
    if (user.balance < cityInfo.investment) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Deduct investment from balance
    user.balance -= cityInfo.investment;

    // Add city to user's joined cities
    user.citiesJoined.push({
      city,
      investmentAmount: cityInfo.investment,
      maxTasksPerDay: cityInfo.maxTasks,
      dailyEarning: cityInfo.dailyIncome
    });

    await user.save();

    // Log transaction
    const transaction = new Transaction({
      userId: user._id,
      type: 'investment',
      amount: cityInfo.investment,
      description: `Invested in ${city}`,
      status: 'completed'
    });
    await transaction.save();

    res.json({ 
      message: 'Investment successful',
      citiesJoined: user.citiesJoined,
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Complete Task
app.post('/api/complete-task', async (req, res) => {
  try {
    const { userId, city, taskName } = req.body;

    if (!userId || !city || !taskName) {
      return res.status(400).json({ message: 'User ID, city, and task name are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the city in user's joined cities
    const userCity = user.citiesJoined.find(c => c.city === city);
    if (!userCity) {
      return res.status(400).json({ message: 'User has not invested in this city' });
    }

    // Check if task limit reached for today
    if (userCity.tasksCompletedToday >= userCity.maxTasksPerDay) {
      return res.status(400).json({ message: 'Number of task limit reached' });
    }

    // Increment completed tasks
    userCity.tasksCompletedToday += 1;

    // Add daily income
    user.dailyIncome += userCity.dailyEarning;
    user.balance += userCity.dailyEarning;
    user.totalEarnings += userCity.dailyEarning;

    await user.save();

    // Log task
    const task = new Task({
      userId: user._id,
      city,
      taskName
    });
    await task.save();

    // Log transaction
    const transaction = new Transaction({
      userId: user._id,
      type: 'task_income',
      amount: userCity.dailyEarning,
      description: `Task completed: ${taskName} in ${city}`,
      status: 'completed'
    });
    await transaction.save();

    res.json({
      message: 'Task completed successfully',
      dailyIncome: user.dailyIncome,
      balance: user.balance,
      tasksCompletedToday: userCity.tasksCompletedToday,
      maxTasks: userCity.maxTasksPerDay
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Deposit Money
app.post('/api/deposit', async (req, res) => {
  try {
    const { userId, amount, phoneNumber, evidenceUrl } = req.body;

    if (!userId || !amount || !phoneNumber) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (amount < 300) {
      return res.status(400).json({ message: 'Minimum deposit is KSH 300' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create deposit evidence record
    const depositEvidence = new DepositEvidence({
      userId,
      amount,
      phoneNumber,
      evidenceUrl,
      status: 'pending'
    });
    await depositEvidence.save();

    // Log transaction
    const transaction = new Transaction({
      userId,
      type: 'deposit',
      amount,
      description: 'Deposit pending verification',
      status: 'pending'
    });
    await transaction.save();

    res.json({ 
      message: 'Deposit submitted for verification',
      evidenceId: depositEvidence._id
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Withdraw Money
app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, amount, phoneNumber, withdrawalPassword } = req.body;

    if (!userId || !amount || !phoneNumber || !withdrawalPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (amount < 500) {
      return res.status(400).json({ message: 'Minimum withdrawal is KSH 500' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Deduct from balance
    user.balance -= amount;
    await user.save();

    // Log transaction
    const transaction = new Transaction({
      userId,
      type: 'withdrawal',
      amount,
      description: `Withdrawal to ${phoneNumber}`,
      status: 'completed'
    });
    await transaction.save();

    res.json({
      message: 'Withdrawal successful',
      balance: user.balance,
      withdrawnAmount: amount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Transaction History
app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== RENDER PAGES ====================

// Home Page
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.render('index');
  }
});

// Dashboard
app.get('/dashboard', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }

  const user = await User.findById(req.session.userId);
  res.render('dashboard', { user });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
