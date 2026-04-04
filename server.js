const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

app.set("view engine", "ejs");

//  DATABASE CONFIGURATION
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_KEY
);

// ================= AUTH =================

// SIGNUP
app.post("/auth/signup", async (req, res) => {
  const { phone, email, password, referral } = req.body;

  const referral_code = "REF" + Math.floor(Math.random() * 1000000);

  const { error } = await supabase.from("users").insert([
    {
      phone,
      email,
      password,
      referral_code,
      referred_by: referral || null,
      balance: 0,
      total_earnings: 0
    }
  ]);

  if (error) return res.json({ success: false, message: error.message });

  res.json({ success: true, message: "Account created" });
});

// LOGIN
app.post("/auth/login", async (req, res) => {
  const { phone, password } = req.body;

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone)
    .single();

  if (!user) return res.json({ success: false, message: "User not found" });

  if (user.password !== password)
    return res.json({ success: false, message: "Wrong password" });

  res.json({ success: true, user });
});

// ================= INVEST =================

app.post("/invest", async (req, res) => {
  const { userId, city, cost } = req.body;

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (user.balance < cost)
    return res.json({ success: false, message: "Insufficient balance" });

  await supabase.from("investments").insert([
    {
      user_id: userId,
      city,
      cost,
      created_at: new Date()
    }
  ]);

  await supabase
    .from("users")
    .update({ balance: user.balance - cost })
    .eq("id", userId);

  res.json({ success: true, message: "Investment successful" });
});

// ================= TASK =================

const cityLimits = {
  "CITY A": 1,
  "CITY B": 2,
  "CITY C": 4,
  "CITY D": 8,
  "CITY E": 10
};

app.post("/task", async (req, res) => {
  const { userId } = req.body;

  const { data: investments } = await supabase
    .from("investments")
    .select("*")
    .eq("user_id", userId);

  if (!investments.length)
    return res.json({ success: false, message: "No city invested" });

  let totalLimit = 0;
  investments.forEach(i => totalLimit += cityLimits[i.city]);

  const { data: todayTasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId);

  if (todayTasks.length >= totalLimit)
    return res.json({ success: false, message: "Task limit reached" });

  await supabase.from("tasks").insert([{ user_id: userId }]);

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  await supabase
    .from("users")
    .update({
      balance: user.balance + 50,
      total_earnings: user.total_earnings + 50
    })
    .eq("id", userId);

  res.json({ success: true, message: "Task completed +50 Ksh" });
});

// ================= DEPOSIT =================

app.post("/deposit", async (req, res) => {
  const { userId, amount, evidence } = req.body;

  if (amount < 300)
    return res.json({ success: false, message: "Min deposit 300" });

  await supabase.from("transactions").insert([
    {
      user_id: userId,
      amount,
      evidence,
      status: "pending"
    }
  ]);

  res.json({ success: true, message: "Pending admin approval" });
});

// ================= WITHDRAW =================

app.post("/withdraw", async (req, res) => {
  const { userId, amount } = req.body;

  if (amount < 500)
    return res.json({ success: false, message: "Min withdraw 500" });

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (user.balance < amount)
    return res.json({ success: false, message: "Insufficient balance" });

  await supabase
    .from("users")
    .update({ balance: user.balance - amount })
    .eq("id", userId);

  await supabase.from("transactions").insert([
    {
      user_id: userId,
      amount,
      type: "withdraw",
      status: "pending"
    }
  ]);

  res.json({ success: true, message: "Withdrawal requested" });
});

// ================= ADMIN =================

app.post("/admin/approve", async (req, res) => {
  const { id } = req.body;

  const { data: tx } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single();

  await supabase.rpc("increment_balance", {
    user_id: tx.user_id,
    amount_to_add: tx.amount
  });

  await supabase
    .from("transactions")
    .update({ status: "approved" })
    .eq("id", id);

  res.json({ success: true });
});

// ================= START =================

app.listen(3000, () => console.log("Server running"));
