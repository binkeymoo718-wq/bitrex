const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Supabase connection
const supabase = createClient(
  "https://mpasnmqayaunhxdqlpsp.supabase.co",
  "sb_publishable_T7Yk4Z3zxOjLh-wFMJfAtw_76iXk_qY"
);

// ✅ TEST ROUTE
app.get("/", (req, res) => {
  res.send("BITREX API is running 🚀");
});


// =========================
// REGISTER
// =========================
app.post("/register", async (req, res) => {
  const { phone, password } = req.body;

  const { data, error } = await supabase
    .from("users")
    .insert([{ phone, password, balance: 0, invested_amount: 0 }])
    .select();

  if (error) return res.status(400).json({ error });

  res.json(data[0]);
});


// =========================
// LOGIN
// =========================
app.post("/login", async (req, res) => {
  const { phone, password } = req.body;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone)
    .eq("password", password)
    .single();

  if (error) return res.status(400).json({ error: "Invalid login" });

  res.json(data);
});


// =========================
// COMPLETE TASK
// =========================
app.post("/complete-task", async (req, res) => {
  const { userId } = req.body;

  const { data: user } = await supabase
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();

  const newBalance = user.balance + 50;

  await supabase
    .from("users")
    .update({ balance: newBalance })
    .eq("id", userId);

  res.json({ message: "Task completed", balance: newBalance });
});


// =========================
// DEPOSIT
// =========================
app.post("/deposit", async (req, res) => {
  const { userId, amount } = req.body;

  await supabase
    .from("users")
    .update({ balance: amount })
    .eq("id", userId);

  res.json({ message: "Deposit successful" });
});


// =========================
// START SERVER
// =========================
app.listen(process.env.PORT || 3000, () => {
  console.log("BITREX API running...");
});
