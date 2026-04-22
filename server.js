const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'timothy@254';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_STATE_ROW_ID = 'main';

const uploadDir = path.join(__dirname, 'uploads');
const storageDir = path.join(__dirname, 'storage');
const dataFile = path.join(storageDir, 'data.json');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

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
const txRequests = new Map();
let txCounter = 1;
const stats = {
  totalUsersJoined: 0,
  totalRequestsCreated: 0,
  totalApproved: 0,
  totalRejected: 0
};
let isSyncingSupabase = false;
let needsResyncSupabase = false;

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/\s+/g, '').replace(/^\+/, '');
}

function persistData() {
  const data = getSerializableData();
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, dataFile);
  void flushStateToSupabase();
}

function getSerializableData() {
  return {
    users: [...users.entries()],
    txRequests: [...txRequests.entries()],
    txCounter,
    stats
  };
}

function applyStateData(raw) {
  if (!raw || typeof raw !== 'object') {
    return;
  }
  users.clear();
  txRequests.clear();

  if (Array.isArray(raw.users)) {
    raw.users.forEach(([key, value]) => users.set(key, value));
  }
  if (Array.isArray(raw.txRequests)) {
    raw.txRequests.forEach(([key, value]) => txRequests.set(Number(key), value));
  }
  if (Number.isInteger(raw.txCounter)) {
    txCounter = raw.txCounter;
  }
  if (raw.stats && typeof raw.stats === 'object') {
    stats.totalUsersJoined = Number(raw.stats.totalUsersJoined || 0);
    stats.totalRequestsCreated = Number(raw.stats.totalRequestsCreated || 0);
    stats.totalApproved = Number(raw.stats.totalApproved || 0);
    stats.totalRejected = Number(raw.stats.totalRejected || 0);
  }
}

async function flushStateToSupabase() {
  if (!supabase) {
    return;
  }

  if (isSyncingSupabase) {
    needsResyncSupabase = true;
    return;
  }

  isSyncingSupabase = true;
  try {
    do {
      needsResyncSupabase = false;
      const payload = getSerializableData();
      const { error } = await supabase
        .from('app_state')
        .upsert(
          { id: SUPABASE_STATE_ROW_ID, payload, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        );
      if (error) {
        console.error('Supabase sync error:', error.message);
        break;
      }
    } while (needsResyncSupabase);
  } finally {
    isSyncingSupabase = false;
  }
}

async function loadData() {
  if (supabase) {
    const { data, error } = await supabase
      .from('app_state')
      .select('payload')
      .eq('id', SUPABASE_STATE_ROW_ID)
      .maybeSingle();

    if (!error && data?.payload) {
      applyStateData(data.payload);
      // refresh local backup snapshot
      const snapshot = getSerializableData();
      const tempFile = `${dataFile}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2));
      fs.renameSync(tempFile, dataFile);
      return;
    }
    if (error) {
      console.error('Supabase load error, falling back to local file:', error.message);
    }
  }

  if (!fs.existsSync(dataFile)) {
    return;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    applyStateData(raw);
  } catch (error) {
    console.error('Failed to load persisted data:', error.message);
  }
}

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
    persistData();
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

function pendingWithdrawTotal(user) {
  return [...txRequests.values()]
    .filter((tx) => tx.userId === user.id && tx.type === 'WITHDRAWAL' && tx.status === 'PENDING')
    .reduce((sum, tx) => sum + tx.amount, 0);
}

function auth(req, res, next) {
  if (!req.session.userId || !users.has(req.session.userId)) {
    return res.redirect('/');
  }
  next();
}

function adminAuth(req, res, next) {
  if (!req.session.isAdmin) {
    return res.redirect('/admin?error=Please login as admin first.');
  }
  next();
}

function pushTxRequest({ userId, type, amount, detail, evidence }) {
  const id = txCounter++;
  const reqTx = {
    id,
    userId,
    type,
    amount,
    detail,
    evidence: evidence || null,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    resolvedAt: null
  };
  txRequests.set(id, reqTx);

  const user = users.get(userId);
  user.transactions.unshift({
    id,
    type: `${type} REQUEST`,
    amount,
    date: reqTx.createdAt,
    detail,
    status: 'PENDING'
  });
  stats.totalRequestsCreated += 1;
  persistData();
}

app.get('/', (req, res) => {
  const user = req.session.userId ? users.get(req.session.userId) : null;
  const referralFromQuery = req.query.ref ? String(req.query.ref) : '';
  if (user) {
    ensureDailyReset(user);
  }
  res.render('index', {
    user,
    cityConfig: CITY_CONFIG,
    tasks: TASKS,
    message: req.query.message || '',
    error: req.query.error || '',
    referralFromQuery,
    referralLink: user ? `${req.protocol}://${req.get('host')}/?ref=${user.referralCode}` : ''
  });
});

app.post('/signup', (req, res) => {
  const { email, password, referralCode } = req.body;
  const phone = normalizePhone(req.body.phone);
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
    withdrawalPassword: password,
    createdAt: new Date().toISOString(),
    active: true
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
            detail: 'One-time bonus for 5 successful referrals',
            status: 'APPROVED'
          });
        }
        break;
      }
    }
  }

  users.set(phone, newUser);
  stats.totalUsersJoined += 1;
  persistData();
  req.session.userId = phone;
  res.redirect('/?message=Signup successful. Welcome!');
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  const phone = normalizePhone(req.body.phone);
  const user = users.get(phone);
  if (!user || user.password !== password) {
    return res.redirect('/?error=Invalid phone or password.');
  }
  if (user.active === false) {
    return res.redirect('/?error=Your account is inactive. Contact support.');
  }
  req.session.userId = user.id;
  res.redirect('/?message=Login successful.');
});

app.post('/logout', auth, (req, res) => {
  req.session.destroy(() => res.redirect('/?message=Logged out successfully.'));
});

app.post('/profile/password', auth, (req, res) => {
  const user = users.get(req.session.userId);
  const { currentPassword, newPassword } = req.body;

  if (user.password !== currentPassword) {
    return res.redirect('/?error=Current password is incorrect.');
  }
  if (!newPassword || newPassword.length < 6 || newPassword.length > 8) {
    return res.redirect('/?error=New password must be 6 to 8 characters.');
  }

  user.password = newPassword;
  user.withdrawalPassword = newPassword;
  user.transactions.unshift({
    type: 'PROFILE UPDATE',
    amount: 0,
    date: new Date().toISOString(),
    detail: 'Password changed successfully',
    status: 'APPROVED'
  });

  persistData();
  res.redirect('/?message=Password changed successfully.');
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
    detail: `Joined ${city.city}`,
    status: 'APPROVED'
  });

  persistData();
  res.redirect('/?message=City investment activated successfully.');
});

app.post('/task', auth, (req, res) => {
  const user = users.get(req.session.userId);
  ensureDailyReset(user);

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
    detail: selectedTask,
    status: 'APPROVED'
  });

  persistData();
  res.redirect('/?message=Task completed. KSH 50 added to your balance.');
});

app.post('/deposit', auth, upload.single('evidence'), (req, res) => {
  const user = users.get(req.session.userId);
  const amount = Number(req.body.amount);
  const phone = normalizePhone(req.body.phone);

  if (!phone || Number.isNaN(amount) || amount < 300) {
    return res.redirect('/?error=Minimum deposit is KSH 300 and phone number is required.');
  }

  pushTxRequest({
    userId: user.id,
    type: 'DEPOSIT',
    amount,
    detail: `Send money to 0733319700 from ${phone}`,
    evidence: req.file ? req.file.filename : null
  });

  res.redirect('/?message=Deposit request submitted. Awaiting admin approval.');
});

app.post('/withdraw', auth, (req, res) => {
  const user = users.get(req.session.userId);
  const amount = Number(req.body.amount);
  const phone = normalizePhone(req.body.phone);
  const withdrawalPassword = req.body.withdrawalPassword;

  if (!phone || Number.isNaN(amount) || amount < 500) {
    return res.redirect('/?error=Minimum withdrawal is KSH 500.');
  }
  if (withdrawalPassword !== user.withdrawalPassword) {
    return res.redirect('/?error=Invalid withdrawal password.');
  }

  const availableAfterPending = user.balance - pendingWithdrawTotal(user);
  if (availableAfterPending < amount) {
    return res.redirect('/?error=Insufficient available balance after pending withdrawals.');
  }

  pushTxRequest({
    userId: user.id,
    type: 'WITHDRAWAL',
    amount,
    detail: `Withdrawal request to ${phone}`
  });

  res.redirect('/?message=Withdrawal request submitted. Awaiting admin approval.');
});

app.get('/admin', (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin-login', {
    message: req.query.message || '',
    error: req.query.error || ''
  });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.redirect('/admin?error=Invalid admin credentials.');
  }
  req.session.isAdmin = true;
  res.redirect('/admin/dashboard');
});

app.post('/admin/logout', adminAuth, (req, res) => {
  req.session.isAdmin = false;
  res.redirect('/admin?message=Logged out from admin dashboard.');
});

app.get('/admin/dashboard', adminAuth, (req, res) => {
  const pending = [...txRequests.values()].filter((tx) => tx.status === 'PENDING');
  const resolved = [...txRequests.values()].filter((tx) => tx.status !== 'PENDING').slice(-30).reverse();
  const usersList = [...users.values()]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  res.render('admin-dashboard', {
    pending,
    resolved,
    users,
    usersList,
    stats,
    message: req.query.message || '',
    error: req.query.error || ''
  });
});

app.post('/admin/users/:id/toggle', adminAuth, (req, res) => {
  const user = users.get(req.params.id);
  if (!user) {
    return res.redirect('/admin/dashboard?error=User not found.');
  }
  user.active = user.active === false ? true : false;
  user.transactions.unshift({
    type: 'ADMIN ACTION',
    amount: 0,
    date: new Date().toISOString(),
    detail: user.active ? 'Account re-activated by admin' : 'Account suspended by admin',
    status: 'APPROVED'
  });
  persistData();
  res.redirect('/admin/dashboard?message=User status updated.');
});

app.post('/admin/transactions/:id/approve', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const tx = txRequests.get(id);
  if (!tx || tx.status !== 'PENDING') {
    return res.redirect('/admin/dashboard?error=Transaction not found or already handled.');
  }

  const user = users.get(tx.userId);
  if (!user) {
    return res.redirect('/admin/dashboard?error=User not found for this transaction.');
  }

  if (tx.type === 'DEPOSIT') {
    user.balance += tx.amount;
  }

  if (tx.type === 'WITHDRAWAL') {
    if (user.balance < tx.amount) {
      return res.redirect('/admin/dashboard?error=Cannot approve withdrawal due to insufficient user balance.');
    }
    user.balance -= tx.amount;
  }

  tx.status = 'APPROVED';
  tx.resolvedAt = new Date().toISOString();
  stats.totalApproved += 1;

  const userTx = user.transactions.find((item) => item.id === tx.id && item.status === 'PENDING');
  if (userTx) {
    userTx.status = 'APPROVED';
    userTx.detail = `${userTx.detail} (Approved by admin)`;
  }

  persistData();
  res.redirect('/admin/dashboard?message=Transaction approved successfully.');
});

app.post('/admin/transactions/:id/reject', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const tx = txRequests.get(id);
  if (!tx || tx.status !== 'PENDING') {
    return res.redirect('/admin/dashboard?error=Transaction not found or already handled.');
  }

  const user = users.get(tx.userId);
  tx.status = 'REJECTED';
  tx.resolvedAt = new Date().toISOString();
  stats.totalRejected += 1;

  if (user) {
    const userTx = user.transactions.find((item) => item.id === tx.id && item.status === 'PENDING');
    if (userTx) {
      userTx.status = 'REJECTED';
      userTx.detail = `${userTx.detail} (Rejected by admin)`;
    }
  }

  persistData();
  res.redirect('/admin/dashboard?message=Transaction rejected.');
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
    email: user.email,
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

async function startServer() {
  await loadData();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (supabase) {
      console.log('Supabase persistence enabled (table: app_state).');
    } else {
      console.log('Supabase persistence disabled; using local storage/data.json.');
    }
  });
}

startServer().catch((error) => {
  console.error('Startup failed:', error.message);
  process.exit(1);
});
