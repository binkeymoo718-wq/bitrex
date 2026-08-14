const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = 'timothy';
const ADMIN_PASSWORD = 'Timothy@254';
const ADMIN_PHONE_NUMBERS = ['0727814209', '0733319700', '0780535898'];
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_STATE_ROW_ID = 'main';
const INTASEND_PUBLISHABLE_KEY = process.env.INTASEND_PUBLISHABLE_KEY || '';
const INTASEND_SECRET_KEY = process.env.INTASEND_SECRET_KEY || '';
const INTASEND_TEST_MODE = String(
  process.env.INTASEND_TEST_MODE || (process.env.NODE_ENV === 'production' ? 'false' : 'true')
).toLowerCase() === 'true';
const INTASEND_WEBHOOK_CHALLENGE = process.env.INTASEND_WEBHOOK_CHALLENGE || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';

const uploadDir = path.join(__dirname, 'uploads');
const storageDir = path.join(__dirname, 'storage');
const publicDir = path.join(__dirname, 'public');
const dataFile = path.join(storageDir, 'data.json');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
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
app.use(express.static(publicDir));
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
  INTERN: { city: 'INTERN', amount: 0, tasksPerDay: 1, dailyIncome: 50, durationDays: 4, free: true, image: 'https://source.unsplash.com/1200x760/?internship,office' },
  A: { city: 'TOKYO', amount: 1500, tasksPerDay: 1, dailyIncome: 50, durationDays: 365, image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80' },
  B: { city: 'OSAKA', amount: 3200, tasksPerDay: 2, dailyIncome: 100, durationDays: 365, image: 'https://source.unsplash.com/1200x760/?osaka,japan,city' },
  C: { city: 'KYOTO', amount: 7200, tasksPerDay: 4, dailyIncome: 200, durationDays: 365, image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80' },
  D: { city: 'YOKOHAMA', amount: 12000, tasksPerDay: 8, dailyIncome: 400, durationDays: 365, image: 'https://source.unsplash.com/1200x760/?yokohama,japan,skyline' },
  E: { city: 'NAGOYA', amount: 15000, tasksPerDay: 10, dailyIncome: 500, durationDays: 365, image: 'https://source.unsplash.com/1200x760/?nagoya,japan,city' }
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
  return String(phone || '').trim().replace(/\D/g, '');
}

function toIntasendPhone(phone) {
  const normalized = normalizePhone(phone);
  const lastNine = phoneLastNine(normalized);
  return lastNine ? `254${lastNine}` : '';
}

function phoneLastNine(phone) {
  return normalizePhone(phone).replace(/^2540/, '254').replace(/^254/, '').replace(/^0/, '').slice(-9);
}

function isAdminPhone(phone) {
  const lastNine = phoneLastNine(phone);
  return Boolean(lastNine) && ADMIN_PHONE_NUMBERS.some((adminPhone) => phoneLastNine(adminPhone) === lastNine);
}

function sessionAdminPhone(req) {
  const sessionUser = req.session.userId ? users.get(req.session.userId) : null;
  return sessionUser?.phone || req.session.adminPhone || '';
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
    cityConfig: CITY_CONFIG,
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
    raw.users.forEach(([key, value]) => {
      ensureUserDefaults(value);
      users.set(key, value);
    });
  }
  if (Array.isArray(raw.txRequests)) {
    raw.txRequests.forEach(([key, value]) => txRequests.set(Number(key), value));
  }
  if (raw.cityConfig && typeof raw.cityConfig === 'object') {
    Object.keys(raw.cityConfig).forEach((code) => {
      if (CITY_CONFIG[code]) {
        Object.assign(CITY_CONFIG[code], raw.cityConfig[code]);
      }
    });
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

function ensureUserDefaults(user) {
  if (!user) return;
  user.name = user.name || (user.email ? String(user.email).split('@')[0] : 'Investor');
  user.emailVerified = Boolean(user.emailVerified);
  if (!Array.isArray(user.transactions)) user.transactions = [];
  if (!Array.isArray(user.activeCities)) user.activeCities = [];
  if (!user.cityJoinDates || typeof user.cityJoinDates !== 'object') user.cityJoinDates = {};
  if (!user.citySignatures || typeof user.citySignatures !== 'object') user.citySignatures = {};
  if (!Array.isArray(user.claimedTasksToday)) user.claimedTasksToday = [];
  user.gems = Number(user.gems || 0);
  user.freeSpins = Number.isInteger(user.freeSpins) ? user.freeSpins : 1;
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
      }
      await syncUserTablesToSupabase();
    } while (needsResyncSupabase);
  } finally {
    isSyncingSupabase = false;
  }
}

async function syncUserTablesToSupabase() {
  if (!supabase) {
    return;
  }

  const profiles = [...users.values()].map((user) => ({
    user_id: user.id,
    phone: user.phone,
    email: user.email || null,
    balance: Number(user.balance || 0),
    total_earnings: Number(user.totalEarnings || 0),
    today_income: Number(user.todayIncome || 0),
    tasks_completed_today: Number(user.tasksCompletedToday || 0),
    referral_code: user.referralCode || null,
    referred_count: Number(user.referredCount || 0),
    gems: Number(user.gems || 0),
    free_spins: Number(user.freeSpins || 0),
    city_signatures: user.citySignatures || {},
    referral_bonus_earned: Boolean(user.referralBonusEarned),
    active: user.active !== false,
    created_at: user.createdAt || null,
    last_login_at: user.lastLoginAt || null,
    last_task_date: user.lastTaskDate || null,
    updated_at: new Date().toISOString()
  }));

  if (profiles.length) {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profiles, { onConflict: 'user_id' });
    if (profileError) {
      console.error('Supabase profiles sync error:', profileError.message);
    }
  }

  for (const user of users.values()) {
    const { error: deleteError } = await supabase
      .from('user_cities')
      .delete()
      .eq('user_id', user.id);
    if (deleteError) {
      console.error('Supabase user_cities delete error:', deleteError.message);
      continue;
    }
    const cityRows = (user.activeCities || []).map((code) => ({
      user_id: user.id,
      city_code: code,
      joined_at: user.cityJoinDates?.[code] || new Date().toISOString(),
      signature: user.citySignatures?.[code] || null
    }));
    if (cityRows.length) {
      const { error: cityError } = await supabase
        .from('user_cities')
        .insert(cityRows);
      if (cityError) {
        console.error('Supabase user_cities insert error:', cityError.message);
      }
    }
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
    user.claimedTasksToday = [];
    persistData();
  }
}

function cityDays(joinedAt) {
  const diff = Date.now() - new Date(joinedAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

function isCityExpired(user, code) {
  const joinedAt = user.cityJoinDates?.[code];
  const city = CITY_CONFIG[code];
  if (!joinedAt || !city) {
    return true;
  }
  return cityDays(joinedAt) > (city.durationDays || 365);
}

function isInternExpired(user) {
  return isCityExpired(user, 'INTERN');
}

function isCityTaskActive(user, code) {
  return !isCityExpired(user, code);
}

function totalTaskLimit(user) {
  return user.activeCities.reduce((sum, code) => {
    if (!CITY_CONFIG[code] || !isCityTaskActive(user, code)) {
      return sum;
    }
    return sum + CITY_CONFIG[code].tasksPerDay;
  }, 0);
}

function totalDailyCityIncome(user) {
  return user.activeCities.reduce((sum, code) => {
    if (!CITY_CONFIG[code] || !isCityTaskActive(user, code)) {
      return sum;
    }
    return sum + CITY_CONFIG[code].dailyIncome;
  }, 0);
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
  const adminPhone = sessionAdminPhone(req);
  if (!isAdminPhone(adminPhone)) {
    req.session.isAdmin = false;
    req.session.adminPhone = null;
    return res.redirect('/admin?error=Admin portal is only available to approved admin phone numbers.');
  }
  req.session.adminPhone = adminPhone;
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
  return reqTx;
}

function getUserTx(user, txId) {
  return user?.transactions.find((item) => item.id === txId);
}

function markTxFailed(tx, reason) {
  if (!tx || tx.status !== 'PENDING') {
    return;
  }
  tx.status = 'REJECTED';
  tx.resolvedAt = new Date().toISOString();
  tx.failedReason = reason;
  stats.totalRejected += 1;

  const user = users.get(tx.userId);
  const userTx = getUserTx(user, tx.id);
  if (userTx) {
    userTx.status = 'REJECTED';
    userTx.detail = `${userTx.detail} (${reason})`;
  }
  persistData();
}

function creditCompletedDeposit(tx, sourceDetail) {
  if (!tx || tx.status === 'APPROVED') {
    return false;
  }
  if (tx.status !== 'PENDING' || tx.type !== 'DEPOSIT') {
    return false;
  }

  const user = users.get(tx.userId);
  if (!user) {
    tx.status = 'REJECTED';
    tx.resolvedAt = new Date().toISOString();
    tx.failedReason = 'User not found during payment confirmation';
    stats.totalRejected += 1;
    persistData();
    return false;
  }

  user.balance += tx.amount;
  tx.status = 'APPROVED';
  tx.resolvedAt = new Date().toISOString();
  stats.totalApproved += 1;

  const userTx = getUserTx(user, tx.id);
  if (userTx) {
    userTx.status = 'APPROVED';
    userTx.detail = sourceDetail || 'Deposit completed by IntaSend';
  }

  persistData();
  return true;
}

function findTxByIntasendPayload(payload) {
  const apiRef = payload.api_ref || payload.apiRef || payload.reference;
  const invoiceId = payload.invoice_id || payload.invoiceId;
  return [...txRequests.values()].find((tx) => (
    tx.type === 'DEPOSIT'
    && tx.provider === 'INTASEND'
    && ((apiRef && tx.intasendApiRef === apiRef) || (invoiceId && tx.intasendInvoiceId === invoiceId))
  ));
}

async function requestIntasendStkPush({ req, user, tx, phone, amount }) {
  if (!INTASEND_PUBLISHABLE_KEY || !INTASEND_SECRET_KEY) {
    throw new Error('IntaSend keys are not configured.');
  }

  console.log('Starting IntaSend STK Push:', {
    txId: tx.id,
    amount,
    phone,
    testMode: INTASEND_TEST_MODE,
    hasPublishableKey: Boolean(INTASEND_PUBLISHABLE_KEY),
    hasSecretKey: Boolean(INTASEND_SECRET_KEY),
    publicBaseUrl: PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
  });

  const IntaSend = require('intasend-node');
  const intasend = new IntaSend(INTASEND_PUBLISHABLE_KEY, INTASEND_SECRET_KEY, INTASEND_TEST_MODE);
  const collection = intasend.collection();
  const host = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

  return collection.mpesaStkPush({
    first_name: 'BITREX',
    last_name: 'User',
    email: user.email || 'customer@bitrex.local',
    host,
    amount,
    phone_number: phone,
    api_ref: tx.intasendApiRef
  });
}

app.get('/', (req, res) => {
  const user = req.session.userId ? users.get(req.session.userId) : null;
  const referralFromQuery = req.query.ref ? String(req.query.ref) : '';
  const authMode = ['signup', 'forgot', 'verify'].includes(req.query.auth) ? req.query.auth : 'login';
  if (user) {
    ensureDailyReset(user);
  }
  res.render('index', {
    user,
    cityConfig: CITY_CONFIG,
    tasks: TASKS,
    taskLimitToday: user ? totalTaskLimit(user) : 0,
    internExpired: user ? isInternExpired(user) : false,
    activeTab: req.query.tab || 'home',
    authMode,
    message: req.query.message || '',
    error: req.query.error || '',
    referralFromQuery,
    referralLink: user ? `${req.protocol}://${req.get('host')}/?ref=${user.referralCode}` : '',
    isAdminPhone: user ? isAdminPhone(user.phone) : false
  });
});

app.post('/signup', (req, res) => {
  const { email, password, referralCode } = req.body;
  const name = String(req.body.name || '').trim();
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
    name: name || String(email).split('@')[0],
    phone,
    email,
    emailVerified: false,
    password,
    referralCode: code,
    referredByCode: referralCode || '',
    referredCount: 0,
    referralBonusEarned: false,
    gems: 0,
    freeSpins: 1,
    balance: 0,
    totalEarnings: 0,
    todayIncome: 0,
    tasksCompletedToday: 0,
    claimedTasksToday: [],
    lastTaskDate: todayKey(),
    activeCities: [],
    cityJoinDates: {},
    citySignatures: {},
    transactions: [],
    withdrawalPassword: password,
    createdAt: new Date().toISOString(),
    active: true
  };

  users.set(phone, newUser);
  stats.totalUsersJoined += 1;
  persistData();
  req.session.userId = phone;
  res.redirect('/?auth=verify&message=Signup successful. Please verify your email to complete account setup.');
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
  user.lastLoginAt = new Date().toISOString();
  persistData();
  res.redirect('/?message=Login successful.');
});

app.post('/forgot-password', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const newPassword = String(req.body.newPassword || '');
  const confirmNewPassword = String(req.body.confirmNewPassword || '');
  if (!email || !newPassword || !confirmNewPassword) {
    return res.redirect('/?auth=login&error=Please fill all forgot-password fields.');
  }
  if (newPassword !== confirmNewPassword) {
    return res.redirect('/?auth=login&error=Passwords do not match.');
  }
  if (newPassword.length < 6 || newPassword.length > 8) {
    return res.redirect('/?auth=login&error=New password must be 6-8 characters.');
  }
  const user = [...users.values()].find((u) => String(u.email || '').toLowerCase() === email);
  if (!user) {
    return res.redirect('/?auth=login&error=No account found with that email.');
  }
  user.password = newPassword;
  user.withdrawalPassword = newPassword;
  user.transactions.unshift({
    type: 'PASSWORD RESET',
    amount: 0,
    date: new Date().toISOString(),
    detail: 'Password reset using registered email',
    status: 'APPROVED'
  });
  persistData();
  return res.redirect('/?auth=login&message=Password reset successful. Please log in.');
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
    if (cityCode === 'INTERN' && isInternExpired(user)) {
      return res.redirect('/?error=INTERN city already completed (4 days reached).');
    }
    return res.redirect('/?error=You already joined this city.');
  }
  const signature = String(req.body.signature || '').trim();
  if (!signature) {
    return res.redirect('/?tab=city&error=Please sign the city contract before joining.');
  }
  if (city.amount > 0 && user.balance < city.amount) {
    return res.redirect('/?error=Insufficient balance. Please deposit first.');
  }

  if (city.amount > 0) {
    user.balance -= city.amount;
  }
  user.activeCities.push(cityCode);
  user.cityJoinDates[cityCode] = new Date().toISOString();
  user.citySignatures = user.citySignatures || {};
  user.citySignatures[cityCode] = signature;
  user.transactions.unshift({
    type: 'INVESTMENT',
    amount: city.amount,
    date: new Date().toISOString(),
    detail: `Joined ${city.city} with contract signature: ${signature}`,
    status: 'APPROVED'
  });

  if (cityCode !== 'INTERN' && user.referredByCode && !user.referralJoinCredited) {
    for (const refUser of users.values()) {
      if (refUser.referralCode === user.referredByCode) {
        refUser.referredCount += 1;
        refUser.gems = Number(refUser.gems || 0) + 1;
        user.referralJoinCredited = true;
        if (refUser.referredCount >= 5 && !refUser.referralBonusEarned) {
          refUser.balance += 300;
          refUser.totalEarnings += 300;
          refUser.referralBonusEarned = true;
          refUser.transactions.unshift({
            type: 'REFERRAL BONUS',
            amount: 300,
            date: new Date().toISOString(),
            detail: 'One-time bonus for 5 referrals who joined a city',
            status: 'APPROVED'
          });
        }
        break;
      }
    }
  }

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
  if (limit <= 0) {
    return res.redirect('/?error=No available tasks right now. INTERN may be expired.');
  }
  if (user.tasksCompletedToday >= limit) {
    return res.redirect('/?tab=task&error=task limit reached');
  }

  const selectedTask = req.body.taskName;
  if (!TASKS.includes(selectedTask)) {
    return res.redirect('/?tab=task&error=Invalid task selected.');
  }
  if (user.claimedTasksToday?.includes(selectedTask)) {
    return res.redirect('/?tab=task&error=Task already claimed today.');
  }

  const reward = 50;
  user.tasksCompletedToday += 1;
  user.claimedTasksToday = user.claimedTasksToday || [];
  user.claimedTasksToday.push(selectedTask);
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
  res.redirect('/?tab=task&message=Task completed. KSH 50 added to your balance.');
});

app.post('/api/task/claim', auth, (req, res) => {
  const user = users.get(req.session.userId);
  ensureDailyReset(user);

  if (!user.activeCities.length) {
    return res.status(400).json({ ok: false, error: 'No task allowed without city investments.' });
  }

  const limit = totalTaskLimit(user);
  if (limit <= 0) {
    return res.status(400).json({ ok: false, error: 'No available tasks right now. INTERN may be expired.' });
  }
  if (user.tasksCompletedToday >= limit) {
    return res.status(400).json({ ok: false, error: 'task limit reached' });
  }

  const selectedTask = req.body.taskName;
  if (!TASKS.includes(selectedTask)) {
    return res.status(400).json({ ok: false, error: 'Invalid task selected.' });
  }
  if (user.claimedTasksToday?.includes(selectedTask)) {
    return res.status(400).json({ ok: false, error: 'Task already claimed today.' });
  }

  const reward = 50;
  user.tasksCompletedToday += 1;
  user.claimedTasksToday = user.claimedTasksToday || [];
  user.claimedTasksToday.push(selectedTask);
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

  return res.json({
    ok: true,
    message: 'Task completed. KSH 50 added to your balance.',
    tasksCompletedToday: user.tasksCompletedToday,
    taskLimitToday: limit
  });
});


app.post('/deposit', auth, async (req, res) => {
  const user = users.get(req.session.userId);
  const amount = Number(req.body.amount);
  const phone = toIntasendPhone(req.body.phone);

  if (!phone || Number.isNaN(amount) || amount < 200) {
    return res.redirect('/?error=Minimum deposit is KSH 200 and phone number is required.');
  }

  const tx = pushTxRequest({
    userId: user.id,
    type: 'DEPOSIT',
    amount,
    detail: `IntaSend STK Push sent to ${phone}`
  });
  tx.provider = 'INTASEND';
  tx.intasendApiRef = `BITREX-DEPOSIT-${tx.id}`;
  tx.intasendPhone = phone;

  try {
    const response = await requestIntasendStkPush({ req, user, tx, phone, amount });
    console.log('IntaSend STK Push response:', JSON.stringify(response));
    tx.intasendResponse = response;
    tx.intasendInvoiceId = response?.invoice?.invoice_id || response?.invoice_id || response?.id || null;

    const userTx = getUserTx(user, tx.id);
    if (userTx) {
      userTx.detail = `M-Pesa STK Push sent to ${phone}. Enter PIN to complete.`;
    }

    persistData();
    return res.redirect('/?message=M-Pesa STK Push sent. Enter your PIN to complete the deposit.');
  } catch (error) {
    console.error('IntaSend STK Push failed:', error);
    markTxFailed(tx, `IntaSend STK Push failed: ${error.message}`);
    return res.redirect(`/?error=${encodeURIComponent(`Could not send STK Push: ${error.message}`)}`);
  }
});

app.post('/verify-email', auth, (req, res) => {
  const user = users.get(req.session.userId);
  user.emailVerified = true;
  user.transactions.unshift({
    type: 'EMAIL VERIFICATION',
    amount: 0,
    date: new Date().toISOString(),
    detail: 'Email address verified',
    status: 'APPROVED'
  });
  persistData();
  res.redirect('/?message=Email verified successfully.');
});

app.post('/intasend/webhook', (req, res) => {
  const payload = req.body || {};
  if (INTASEND_WEBHOOK_CHALLENGE && payload.challenge !== INTASEND_WEBHOOK_CHALLENGE) {
    return res.status(401).json({ ok: false, error: 'Invalid challenge.' });
  }

  const tx = findTxByIntasendPayload(payload);
  if (!tx) {
    return res.status(202).json({ ok: true, ignored: true });
  }

  tx.intasendLastWebhook = payload;
  const state = String(payload.state || payload.status || '').toUpperCase();

  if (state === 'COMPLETE' || state === 'COMPLETED' || state === 'SUCCESSFUL') {
    creditCompletedDeposit(tx, `Deposit completed by IntaSend${payload.invoice_id ? ` (${payload.invoice_id})` : ''}`);
  } else if (state === 'FAILED') {
    markTxFailed(tx, payload.failed_reason || 'IntaSend payment failed');
  } else {
    persistData();
  }

  return res.json({ ok: true });
});

app.post('/withdraw', auth, (req, res) => {
  const user = users.get(req.session.userId);
  const amount = Number(req.body.amount);
  const phone = normalizePhone(req.body.phone);
  const withdrawalPassword = req.body.withdrawalPassword;

  if (!phone || Number.isNaN(amount) || amount < 300) {
    return res.redirect('/?error=Minimum withdrawal is KSH 300.');
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

function executeRouletteSpin(user) {
  user.gems = Number(user.gems || 0);
  user.freeSpins = Number.isInteger(user.freeSpins) ? user.freeSpins : 0;

  if (user.freeSpins <= 0 && user.gems < 2) {
    return { ok: false, error: 'You need at least 2 Gems to spin.' };
  }

  if (user.freeSpins > 0) {
    user.freeSpins -= 1;
  } else {
    user.gems -= 2;
  }

  const weighted = [
    { label: '3 Gems', type: 'gem', value: 3, weight: 76 },
    { label: '1 Gem', type: 'gem', value: 1, weight: 10 },
    { label: '2 Gems', type: 'gem', value: 2, weight: 7 },
    { label: 'KSH 50', type: 'cash', value: 50, weight: 4 },
    { label: 'KSH 100', type: 'cash', value: 100, weight: 2 },
    { label: 'KSH 150', type: 'cash', value: 150, weight: 1 }
  ];
  const totalWeight = weighted.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.floor(Math.random() * totalWeight);
  let prize = weighted[0];
  for (const item of weighted) {
    roll -= item.weight;
    if (roll < 0) {
      prize = item;
      break;
    }
  }

  if (prize.type === 'cash') {
    user.balance += prize.value;
    user.totalEarnings += prize.value;
  } else {
    user.gems += prize.value;
  }

  user.transactions.unshift({
    type: 'ROULETTE',
    amount: prize.type === 'cash' ? prize.value : 0,
    date: new Date().toISOString(),
    detail: `Roulette reward: ${prize.label}`,
    status: 'APPROVED'
  });

  persistData();
  return {
    ok: true,
    prize,
    message: `Spin complete: ${prize.label}`,
    gems: user.gems,
    freeSpins: user.freeSpins,
    balance: user.balance
  };
}

app.post('/api/spin-roulette', auth, (req, res) => {
  const user = users.get(req.session.userId);
  const result = executeRouletteSpin(user);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

app.post('/spin-roulette', auth, (req, res) => {
  const user = users.get(req.session.userId);
  const result = executeRouletteSpin(user);
  if (!result.ok) {
    return res.redirect(`/?tab=menu&error=${encodeURIComponent(result.error)}`);
  }
  return res.redirect(`/?tab=menu&message=${encodeURIComponent(result.message)}`);
});

app.get('/admin', (req, res) => {
  const adminPhone = sessionAdminPhone(req);
  if (req.session.isAdmin && isAdminPhone(adminPhone)) {
    req.session.adminPhone = adminPhone;
    return res.redirect('/admin/dashboard');
  }
  res.render('admin-login', {
    message: req.query.message || '',
    error: req.query.error || '',
    adminPhoneSuggestion: isAdminPhone(adminPhone) ? adminPhone : ''
  });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const phone = normalizePhone(req.body.phone || sessionAdminPhone(req));
  if (!isAdminPhone(phone)) {
    return res.redirect('/admin?error=This phone number is not allowed to access the admin portal. Use 0727814209, 0733319700, or 0780535898.');
  }
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.redirect('/admin?error=Invalid admin credentials.');
  }
  req.session.isAdmin = true;
  req.session.adminPhone = phone;
  res.redirect('/admin/dashboard');
});

app.post('/admin/logout', adminAuth, (req, res) => {
  req.session.isAdmin = false;
  req.session.adminPhone = null;
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
    cityConfig: CITY_CONFIG,
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

  if (tx.type === 'DEPOSIT' && tx.provider === 'INTASEND') {
    return res.redirect('/admin/dashboard?error=IntaSend deposits are approved automatically after payment confirmation.');
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

app.post('/admin/packages/:code', adminAuth, (req, res) => {
  const code = req.params.code;
  const city = CITY_CONFIG[code];
  if (!city) {
    return res.redirect('/admin/dashboard?error=Investment package not found.');
  }

  city.city = String(req.body.city || city.city).trim().toUpperCase();
  city.amount = Math.max(0, Number(req.body.amount || city.amount));
  city.tasksPerDay = Math.max(0, Number(req.body.tasksPerDay || city.tasksPerDay));
  city.dailyIncome = Math.max(0, Number(req.body.dailyIncome || city.dailyIncome));
  city.durationDays = Math.max(1, Number(req.body.durationDays || city.durationDays || 365));

  persistData();
  res.redirect('/admin/dashboard?message=Investment package updated.');
});
