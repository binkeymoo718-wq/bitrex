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

// Session configuration
app.use(session({
  secret: process.env.JWT_SECRET || 'bitrex-secret',
  resave: false,
  saveUninitialized: false,
  store: new MongoStore({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/bitrex_platform',
    collection: 'sessions',
    ttl: 24 * 60 * 60
  }),
  cookie: { 
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Request timeout
app.use((req, res, next) => {
  res.setTimeout(60000, () => {
    console.log('Request timed out');
    res.status(503).json({ message: 'Server timeout' });
  });
  next();
});

// ==================== MONGODB CONNECTION ====================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bitrex_platform', {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB connected successfully');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

// ==================== SCHEMAS ====================

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

const transactionSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  type: String, // 'deposit', 'withdrawal', 'bonus', 'task_income'
  amount: Number,
  status: { type: String, default: 'completed' },
  description: String,
  createdAt: { type: Date, default: Date.now }
});

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

// ==================== UTILITY FUNCTIONS ====================

const generateReferralCode = () => {
  return 'BITREX' + Math.random().toString(36).substr(2, 8).toUpperCase();
};

const resetDailyIncome = async (user) => {
  const now = new Date();
  const lastReset = new Date(user.lastDailyReset);
  
  if (now.toDateString() !== lastReset.toDateString()) {
    user.dailyIncome = 0;
    user.lastDailyReset = now;
    
    // Reset task counters for all cities
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

// ==================== AUTH ROUTES ====================

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { phone, email, password, confirmPassword, referralCode } = req.body;

    // Validation
    if (!phone || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\s+/g, '');
    const cleanEmail = email.toLowerCase().trim();

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (password.length < 6 || password.length > 8) {
      return res.status(400).json({ message: 'Password must be 6-8 characters' });
    }

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ phone: cleanPhone }, { email: cleanEmail }]
    });

    if (existingUser) {
      if (existingUser.phone === cleanPhone) {
        return res.status(400).json({ message: 'Phone number already registered' });
      }
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 10);
    const newReferralCode = generateReferralCode();

    // Create user
    const newUser = new User({
      phone: cleanPhone,
      email: cleanEmail,
      password: hashedPassword,
      referralCode: newReferralCode,
      referredBy: referralCode || null
    });

    await newUser.save();

    // Update referrer's count if valid referral code
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        referrer.referralCount += 1;
        
        // Award bonus every 5 referrals
        if (referrer.referralCount % 5 === 0) {
          referrer.balance += 300;
          const transaction = new Transaction({
            userId: referrer._id,
            type: 'bonus',
            amount: 300,
            description: '🎁 Referral Bonus - 5 friends joined',
            status: 'completed'
          });
          await transaction.save();
        }
        await referrer.save();
      }
    }

    res.status(201).json({
      message: 'Account created successfully!',
      userId: newUser._id,
      referralCode: newReferralCode,
      phone: cleanPhone
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: error.message || 'Signup failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password are required' });
    }

    const cleanPhone = phone.replace(/\s+/g, '');
    const user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    const isPasswordValid = await bcryptjs.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    // Reset daily income if needed
    await resetDailyIncome(user);

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'bitrex-secret', { expiresIn: '7d' });
    req.session.userId = user._id;

    res.json({
      message: 'Login successful!',
      token,
      userId: user._id,
      phone: user.phone
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message || 'Login failed' });
  }
});

// ==================== DASHBOARD ROUTES ====================

app.get('/api/dashboard/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Reset daily income if it's a new day
    await resetDailyIncome(user);
    const updatedUser = await User.findById(user._id);

    res.json({
      _id: updatedUser._id,
      phone: updatedUser.phone,
      email: updatedUser.email,
      balance: updatedUser.balance,
      totalEarnings: updatedUser.totalEarnings,
      dailyIncome: updatedUser.dailyIncome,
      citiesJoined: updatedUser.citiesJoined,
      referralCode: updatedUser.referralCode,
      referralCount: updatedUser.referralCount,
      createdAt: updatedUser.createdAt
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

// ==================== INVESTMENT ROUTES ====================

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
      return res.status(400).json({ message: `❌ You have already invested in ${city}. You cannot invest twice in the same city.` });
    }

    // Check balance
    if (user.balance < cityInfo.investment) {
      return res.status(400).json({ message: `❌ Insufficient balance. You need KSH ${cityInfo.investment} to invest in ${city}` });
    }

    // Deduct investment from balance
    user.balance -= cityInfo.investment;

    // Add city to user's joined cities
    const now = new Date();
    user.citiesJoined.push({
      city,
      investmentAmount: cityInfo.investment,
      maxTasksPerDay: cityInfo.maxTasks,
      dailyEarning: cityInfo.dailyIncome,
      tasksCompletedToday: 0,
      lastTaskReset: now
    });

    await user.save();

    // Log transaction
    const transaction = new Transaction({
      userId: user._id,
      type: 'investment',
      amount: cityInfo.investment,
      description: `💼 Invested in ${city}`,
      status: 'completed'
    });
    await transaction.save();

    res.json({
      message: `✅ Successfully invested in ${city}!`,
      citiesJoined: user.citiesJoined,
      balance: user.balance
    });
  } catch (error) {
    console.error('Investment error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== TASK ROUTES ====================

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

    // Reset daily income if needed
    await resetDailyIncome(user);
    const updatedUser = await User.findById(userId);

    // Find the city in user's joined cities
    const userCity = updatedUser.citiesJoined.find(c => c.city === city);
    if (!userCity) {
      return res.status(400).json({ message: `❌ You have not invested in ${city}` });
    }

    // Check if task limit reached for today
    if (userCity.tasksCompletedToday >= userCity.maxTasksPerDay) {
      return res.status(400).json({ 
        message: `⚠️ Task limit reached! You can only complete ${userCity.maxTasksPerDay} task(s) per day in ${city}. Try again after midnight.` 
      });
    }

    // Increment completed tasks
    userCity.tasksCompletedToday += 1;

    // Add daily income
    updatedUser.dailyIncome += userCity.dailyEarning;
    updatedUser.balance += userCity.dailyEarning;
    updatedUser.totalEarnings += userCity.dailyEarning;

    await updatedUser.save();

    // Log task
    const task = new Task({
      userId: updatedUser._id,
      city,
      taskName
    });
    await task.save();

    // Log transaction
    const transaction = new Transaction({
      userId: updatedUser._id,
      type: 'task_income',
      amount: userCity.dailyEarning,
      description: `✅ Task completed: ${taskName} in ${city}`,
      status: 'completed'
    });
    await transaction.save();

    res.json({
      message: '✅ Task completed! Income added to your balance.',
      dailyIncome: updatedUser.dailyIncome,
      balance: updatedUser.balance,
      tasksCompletedToday: userCity.tasksCompletedToday,
      maxTasks: userCity.maxTasksPerDay
    });
  } catch (error) {
    console.error('Task completion error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== DEPOSIT ROUTES ====================

app.post('/api/deposit', async (req, res) => {
  try {
    const { userId, amount, phoneNumber } = req.body;

    if (!userId || !amount || !phoneNumber) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const numAmount = parseFloat(amount);
    if (numAmount < 300) {
      return res.status(400).json({ message: 'Minimum deposit is KSH 300' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Automatically add deposit (in real app, verify M-Pesa first)
    user.balance += numAmount;
    await user.save();

    // Log transaction
    const transaction = new Transaction({
      userId,
      type: 'deposit',
      amount: numAmount,
      description: `💰 Deposit of KSH ${numAmount} verified`,
      status: 'completed'
    });
    await transaction.save();

    res.json({
      message: `✅ Deposit of KSH ${numAmount} received! Added to your balance.`,
      balance: user.balance
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== WITHDRAWAL ROUTES ====================

app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, amount, phoneNumber, withdrawalPassword } = req.body;

    if (!userId || !amount || !phoneNumber || !withdrawalPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const numAmount = parseFloat(amount);
    if (numAmount < 500) {
      return res.status(400).json({ message: 'Minimum withdrawal is KSH 500' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.balance < numAmount) {
      return res.status(400).json({ message: `❌ Insufficient balance. You have KSH ${user.balance}` });
    }

    // Deduct from balance
    user.balance -= numAmount;
    await user.save();

    // Log transaction
    const transaction = new Transaction({
      userId,
      type: 'withdrawal',
      amount: numAmount,
      description: `💸 Withdrawal to ${phoneNumber}`,
      status: 'completed'
    });
    await transaction.save();

    res.json({
      message: `✅ Withdrawal of KSH ${numAmount} initiated to ${phoneNumber}. You will receive it within 1-2 minutes.`,
      balance: user.balance
    });
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== TRANSACTION ROUTES ====================

app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(50);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== PAGE ROUTES ====================

app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.render('index');
  }
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }

  try {
    const user = await User.findById(req.session.userId);
    res.render('dashboard', { user });
  } catch (error) {
    res.redirect('/');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/');
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️ Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 BITREX Platform running on http://localhost:${PORT}`);
  console.log(`📊 Visit http://localhost:${PORT} to start earning!\n`);
});
