const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Supabase config
const supabase = createClient(
  "https://mpasmnqayaunhxdqlpsp.supabase.co",   // your URL
  "YOUR_SUPABASE_ANON_KEY"                     // ⚠️ put your real key
);

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    console.log("LOGIN ATTEMPT:", phone, password);

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone)   // MUST match column name EXACTLY
      .single();

    if (error || !data) {
      return res.status(400).json({ message: "User not found" });
    }

    if (data.password !== password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.json(data);

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================= DEPOSIT =================
app.post("/deposit", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    const newBalance = user.balance + amount;

    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    await supabase.from("transactions").insert([
      {
        userId,
        amount,
        status: "completed",
        type: "deposit"
      }
    ]);

    res.json({ message: "Deposit successful", balance: newBalance });

  } catch (err) {
    res.status(500).json({ message: "Deposit error" });
  }
});

// ================= WITHDRAW =================
app.post("/withdraw", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (user.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const newBalance = user.balance - amount;

    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    await supabase.from("transactions").insert([
      {
        userId,
        amount,
        status: "completed",
        type: "withdraw"
      }
    ]);

    res.json({ message: "Withdraw successful", balance: newBalance });

  } catch (err) {
    res.status(500).json({ message: "Withdraw error" });
  }
});

// ================= TRANSACTIONS =================
app.get("/transactions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("userId", userId)
      .order("created_at", { ascending: false });

    res.json({ data });

  } catch (err) {
    res.status(500).json({ message: "Error fetching transactions" });
  }
});

// ================= SERVER =================
app.listen(3000, () => {
  console.log("Server running on port 3000");
});
