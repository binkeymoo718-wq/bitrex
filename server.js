const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`)
});
const upload = multer({ storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/uploads', express.static(uploadDir));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: 'bitrex-722-secret',
    resave: false,
    saveUninitialized: false
  })
);

const CITY_CONFIG = {
  A: { city: 'CITY A', amount: 1500, tasksPerDay: 1, dailyIncome: 50 },
  B: { city: 'CITY B', amount: 3200, tasksPerDay: 2, dailyIncome: 100 },
  C: { city: 'CITY C', amount: 7200, tasksPerDay: 4, dailyIncome: 200 },
  D: { city: 'CITY D', amount: 12000, tasksPerDay: 8, dailyIncome: 400 },
  E: { city: 'CITY E', amount: 15000, tasksPerDay: 10, dailyIncome: 500 }
};

const TASKS = [
  '2.5L Vacuum Flask', 'Mini massage gun', 'Blood glucose machine', 'Electric blender',
  'Modern soldering gun', 'Television set', 'Electric meter', 'Smart phones',
  'HD Camera High pixel', 'Iron sheets', 'Plumbing tools', 'Furniture', 'Wi-Fi systems',
  'Laptops', 'Textiles', 'Paints', 'Cosmetics', 'Electrical tools', 'Shoes', 'Gas cookers',
  'Electric heater', 'Air Fryer (4L or 5L)', 'Electric Pressure Cooker', 'Microwave Oven',
  'Non-stick Cookware Set', 'Water Dispenser (Hot & Cold)', 'Rechargeable Juicer Cup',
  'Electric Kettle (Stainless Steel)', 'Subwoofer System (Bluetooth)', 'Android TV Box',
  'Rechargeable Bluetooth Speaker', 'Gaming Console (Handheld)', 'Smart Watch (Series 8/9)',
  'Wireless Earbuds (Airpods Pro)', 'Solar Lighting System'
];

const users = new Map();

function generateReferralCode(phone) {
  return `REF${phone.slice(-4)}${Math.floor(Math.random() * 900 + 100)}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDailyReset(user) {
  const today = todayKey();
  if (user.lastTaskDate !== today) {
    user.lastTaskDate = today;
    user.tasksCompletedToday = 0;
    user.todayIncome = 0;
  }
}

function cityDays(joinedAt) {
  const diff = Date.now() - new Date(joinedAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

function totalTaskLimit(user) {
  return user.activeCities.reduce((sum, code) => sum + CITY_CONFIG[code].tasksPerDay, 0);
}

function totalDailyCityIncome(user) {
  return user.activeCities.reduce((sum, code) => sum + CITY_CONFIG[code].dailyIncome, 0);
}

function auth(req, res, next) {
  if (!req.session.userId || !users.has(req.session.userId)) {
    return res.redirect('/');
  }
  next();
}

app.get('/', (req, res) => {
  const user = req.session.userId ? users.get(req.session.userId) : null;
  if (user) {
    ensureDailyReset(user);
  }
  res.render('index', {
    user,
    cityConfig: CITY_CONFIG,
    tasks: TASKS,
    message: req.query.message || '',
    error: req.query.error || ''
  });
});

app.post('/signup', (req, res) => {
  const { phone, email, password, referralCode } = req.body;
  if (!phone || !email || !password || password.length < 6 || password.length > 8) {
    return res.redirect('/?error=Provide valid signup details. Password must be 6-8 characters.');
  }
  if (users.has(phone)) {
    return res.redirect('/?error=Phone number already registered.');
  }

  const code = generateReferralCode(phone);
  const newUser = {
    id: phone,
    phone,
    email,
    password,
    referralCode: code,
    referredCount: 0,
    referralBonusEarned: false,
    balance: 0,
    totalEarnings: 0,
    todayIncome: 0,
    tasksCompletedToday: 0,
    lastTaskDate: todayKey(),
    activeCities: [],
    cityJoinDates: {},
    transactions: [],
    withdrawalPassword: password
  };

  if (referralCode) {
    for (const refUser of users.values()) {
      if (refUser.referralCode === referralCode) {
        refUser.referredCount += 1;
        if (refUser.referredCount >= 5 && !refUser.referralBonusEarned) {
          refUser.balance += 300;
          refUser.totalEarnings += 300;
          refUser.referralBonusEarned = true;
          refUser.transactions.unshift({
            type: 'REFERRAL BONUS',
            amount: 300,
            date: new Date().toISOString(),
            detail: 'One-time bonus for 5 successful referrals'
          });
        }
        break;
      }
    }
  }

  users.set(phone, newUser);
  req.session.userId = phone;
  res.redirect('/?message=Signup successful. Welcome!');
});

app.post('/login', (req, res) => {
  const { phone, password } = req.body;
  const user = users.get(phone);
  if (!user || user.password !== password) {
    return res.redirect('/?error=Invalid phone or password.');
  }
  req.session.userId = user.id;
  res.redirect('/?message=Login successful.');
});

app.post('/logout', auth, (req, res) => {
  req.session.destroy(() => res.redirect('/?message=Logged out successfully.'));
});

app.post('/invest/:cityCode', auth, (req, res) => {
  const user = users.get(req.session.userId);
  const cityCode = req.params.cityCode;
  const city = CITY_CONFIG[cityCode];
  if (!city) {
    return res.redirect('/?error=Invalid city package selected.');
  }
  if (user.activeCities.includes(cityCode)) {
    return res.redirect('/?error=You already joined this city.');
  }
  if (user.balance < city.amount) {
    return res.redirect('/?error=Insufficient balance. Please deposit first.');
  }

  user.balance -= city.amount;
  user.activeCities.push(cityCode);
  user.cityJoinDates[cityCode] = new Date().toISOString();
  user.transactions.unshift({
    type: 'INVESTMENT',
    amount: city.amount,
    date: new Date().toISOString(),
    detail: `Joined ${city.city}`
  });

  res.redirect('/?message=City investment activated successfully.');
});

app.post('/task', auth, (req, res) => {
  const user = users.get(req.session.userId);
  ensureDailyReset(user);

  const hourUtc = new Date().getUTCHours();
  if (hourUtc < 0) {
    return res.redirect('/?error=Tasks accessible after midnight.');
  }

  if (!user.activeCities.length) {
    return res.redirect('/?error=No task allowed without city investments.');
  }

  const limit = totalTaskLimit(user);
  if (user.tasksCompletedToday >= limit) {
    return res.redirect('/?error=number of task limit reached');
  }

  const selectedTask = req.body.taskName;
  if (!TASKS.includes(selectedTask)) {
    return res.redirect('/?error=Invalid task selected.');
  }

  const reward = 50;
  user.tasksCompletedToday += 1;
  user.todayIncome += reward;
  user.balance += reward;
  user.totalEarnings += reward;

  user.transactions.unshift({
    type: 'TASK INCOME',
    amount: reward,
    date: new Date().toISOString(),
    detail: selectedTask
  });

  res.redirect('/?message=Task completed. KSH 50 added to your balance.');
});

app.post('/deposit', auth, upload.single('evidence'), (req, res) => {
  const user = users.get(req.session.userId);
  const amount = Number(req.body.amount);
  const phone = req.body.phone;

  if (!phone || Number.isNaN(amount) || amount < 300) {
    return res.redirect('/?error=Minimum deposit is KSH 300 and phone number is required.');
  }

  user.balance += amount;
  user.transactions.unshift({
    type: 'DEPOSIT',
    amount,
    date: new Date().toISOString(),
    detail: `Send money to 0733319700. Evidence: ${req.file ? req.file.filename : 'none'}`
  });

  res.redirect('/?message=Deposit recorded and reflected to your account.');
});

app.post('/withdraw', auth, (req, res) => {
  const user = users.get(req.session.userId);
  const amount = Number(req.body.amount);
  const phone = req.body.phone;
  const withdrawalPassword = req.body.withdrawalPassword;

  if (!phone || Number.isNaN(amount) || amount < 500) {
    return res.redirect('/?error=Minimum withdrawal is KSH 500.');
  }
  if (withdrawalPassword !== user.withdrawalPassword) {
    return res.redirect('/?error=Invalid withdrawal password.');
  }
  if (user.balance < amount) {
    return res.redirect('/?error=Insufficient balance.');
  }

  user.balance -= amount;
  user.transactions.unshift({
    type: 'WITHDRAWAL',
    amount,
    date: new Date().toISOString(),
    detail: `Withdrawal request to ${phone}`
  });

  res.redirect('/?message=Withdrawal request submitted successfully.');
});

app.get('/api/dashboard', auth, (req, res) => {
  const user = users.get(req.session.userId);
  ensureDailyReset(user);

  const joinedCities = user.activeCities.map((code) => ({
    code,
    city: CITY_CONFIG[code].city,
    days: cityDays(user.cityJoinDates[code]),
    amount: CITY_CONFIG[code].amount,
    tasksPerDay: CITY_CONFIG[code].tasksPerDay,
    dailyIncome: CITY_CONFIG[code].dailyIncome
  }));

  res.json({
    phone: user.phone,
    balance: user.balance,
    todayIncome: user.todayIncome,
    totalEarnings: user.totalEarnings,
    tasksCompletedToday: user.tasksCompletedToday,
    tasksLimitToday: totalTaskLimit(user),
    expectedDailyIncomeFromCities: totalDailyCityIncome(user),
    joinedCities,
    referralCode: user.referralCode,
    referredCount: user.referredCount,
    referralBonusEarned: user.referralBonusEarned,
    transactions: user.transactions
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
