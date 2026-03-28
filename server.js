const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* ================= SIGNUP ================= */
app.post("/signup", async (req, res) => {
  const { phone, password } = req.body;

  const { error } = await supabase.from("users").insert([
    { phone, password, balance: 0 }
  ]);

  if (error) return res.status(500).json({ message: "Signup failed" });

  res.json({ message: "User created" });
});

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  const { phone, password } = req.body;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone);

  if (!data || data.length === 0)
    return res.status(404).json({ message: "User not found" });

  const user = data[0];

  if (user.password !== password)
    return res.status(401).json({ message: "Invalid credentials" });

  res.json({
    phone: user.phone,
    balance: user.balance
  });
});

/* ================= DEPOSIT ================= */
app.post("/deposit", async (req, res) => {
  const { phone, amount } = req.body;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone);

  const user = data[0];
  const newBalance = Number(user.balance) + Number(amount);

  await supabase
    .from("users")
    .update({ balance: newBalance })
    .eq("phone", phone);

  await supabase.from("transactions").insert([
    { phone, type: "deposit", amount }
  ]);

  res.json({ balance: newBalance });
});

/* ================= WITHDRAW ================= */
app.post("/withdraw", async (req, res) => {
  const { phone, amount } = req.body;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone);

  const user = data[0];

  if (user.balance < amount)
    return res.status(400).json({ message: "Insufficient funds" });

  const newBalance = user.balance - Number(amount);

  await supabase
    .from("users")
    .update({ balance: newBalance })
    .eq("phone", phone);

  await supabase.from("transactions").insert([
    { phone, type: "withdraw", amount }
  ]);

  res.json({ balance: newBalance });
});

/* ================= HISTORY ================= */
app.post("/history", async (req, res) => {
  const { phone } = req.body;

  const { data
