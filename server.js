const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase config (from Render env)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ✅ TEST ROUTE
app.get("/", (req, res) => {
  res.send("BITREX API is running 🚀");
});

// ✅ LOGIN ROUTE
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

// ✅ CREATE DEPOSIT (TRANSACTION)
app.post("/deposit", async (req, res) => {
  const { userId, amount } = req.body;

  if (!userId || !amount) {
    return res.status(400).json({ error: "userId and amount required" });
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert([
      {
        userId,
        amount,
        status: "pending",
      },
    ]);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    message: "Deposit request created",
    data,
  });
});

// ✅ START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
