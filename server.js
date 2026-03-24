const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const ADMIN_TOKEN = "BITREX_ADMIN_123";

const pool = new Pool({
  connectionString: "YOUR_SUPABASE_DB_URL",
  ssl: { rejectUnauthorized: false }
});

// Signup
app.post("/signup", async (req, res) => {
  const { phone, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    "INSERT INTO users (phone,email,password) VALUES ($1,$2,$3)",
    [phone, email, hash]
  );

  res.send("Signup successful");
});

// Login
app.post("/login", async (req, res) => {
  const { phone, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE phone=$1",
    [phone]
  );

  const user = result.rows[0];
  if (!user) return res.send("User not found");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.send("Wrong password");

  res.json(user);
});

// Get user
app.get("/user/:id", async (req, res) => {
  const result = await pool.query(
    "SELECT balance, invested_amount FROM users WHERE id=$1",
    [req.params.id]
  );

  res.json(result.rows[0]);
});

// Join city
app.post("/join-city", async (req, res) => {
  const { userId, city, amount } = req.body;

  await pool.query(
    "UPDATE users SET invested_amount = invested_amount + $1 WHERE id=$2",
    [amount, userId]
  );

  await pool.query(
    "INSERT INTO user_plans (user_id, city_name) VALUES ($1,$2)",
    [userId, city]
  );

  res.send("City joined");
});

// Task
app.post("/complete-task", async (req, res) => {
  const { userId } = req.body;

  await pool.query(
    "UPDATE users SET balance = balance + 50 WHERE id=$1",
    [userId]
  );

  res.send("Task completed");
});

// Deposit
app.post("/deposit", async (req, res) => {
  const { userId, amount } = req.body;

  await pool.query(
    "INSERT INTO transactions (user_id,type,amount,status) VALUES ($1,'deposit',$2,'pending')",
    [userId, amount]
  );

  res.send("Deposit submitted");
});

// Withdraw
app.post("/withdraw", async (req, res) => {
  const { userId, amount } = req.body;

  const result = await pool.query(
    "SELECT balance FROM users WHERE id=$1",
    [userId]
  );

  if (result.rows[0].balance < amount) {
    return res.send("Insufficient balance");
  }

  await pool.query(
    "UPDATE users SET balance = balance - $1 WHERE id=$2",
    [amount, userId]
  );

  await pool.query(
    "INSERT INTO transactions (user_id,type,amount,status) VALUES ($1,'withdraw',$2,'pending')",
    [userId, amount]
  );

  res.send("Withdrawal requested");
});

// Admin auth
function adminAuth(req, res, next) {
  if (req.headers.authorization !== ADMIN_TOKEN) {
    return res.status(403).send("Unauthorized");
  }
  next();
}

// Admin routes
app.get("/admin/users", adminAuth, async (req, res) => {
  const users = await pool.query("SELECT * FROM users");
  res.json(users.rows);
});

app.get("/admin/deposits", adminAuth, async (req, res) => {
  const data = await pool.query(
    "SELECT * FROM transactions WHERE type='deposit' AND status='pending'"
  );
  res.json(data.rows);
});

app.post("/admin/approve-deposit", adminAuth, async (req, res) => {
  const { id, userId, amount } = req.body;

  await pool.query("UPDATE transactions SET status='approved' WHERE id=$1", [id]);

  await pool.query(
    "UPDATE users SET balance = balance + $1 WHERE id=$2",
    [amount, userId]
  );

  res.send("Deposit approved");
});

// Start server
app.get("/", (req, res) => {
  res.send("BITREX is running successfully 🚀");
});
app.listen(process.env.PORT || 3000, () => {
  console.log("BITREX running...");
});
