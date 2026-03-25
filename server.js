const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Supabase config
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ✅ TEST ROUTE
app.get("/", (req, res) => {
  res.send("BITREX API is running 🚀");
});

// ✅ REGISTER
app.post("/register", async (req, res) => {
  const { phone, password } = req.body;

  const { data, error } = await supabase
    .from("users")
    .insert([{ phone, password }])
    .select();

  if (error) return res.status(400).json({ error });

  res.json(data[0]);
});

// ✅ LOGIN
app.post("/login", async (req, res) => {
  const { phone, password } = req.body;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone)
    .eq("password", password)
    .single();

  if (error || !data) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json(data);
});

// ✅ TASK (adds 50 to balance)
app.post("/task", async (req, res) => {
  const { userId } = req.body;

  // get current balance
  const { data: user, error: fetchError } = await supabase
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();

  if (fetchError) return res.status(400).json({ error: fetchError });

  const newBalance = user.balance + 50;

  const { error: updateError } = await supabase
    .from("users")
    .update({ balance: newBalance })
    .eq("id", userId);

  if (updateError) return res.status(400).json({ error: updateError });

  res.json({ message: "Task completed", newBalance });
});

// ✅ DEPOSIT (NEW CORRECT LOGIC)
app.post("/deposit", async (req, res) => {
  const { userId, amount } = req.body;

  const { data, error } = await supabase
    .from("transactions")
    .insert([
      {
        userId,
        amount,
        status: "pending",
      },
    ])
    .select();

  if (error) return res.status(400).json({ error });

  res.json({
    message: "Deposit submitted, waiting for approval",
    data,
  });
});

// 🚀 START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
