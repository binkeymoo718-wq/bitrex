const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase config (FIXED)
const supabase = createClient(
  "https://mpasmnqayaunhxdqlpsp.supabase.co",
  "sb_publishable_T7Yk4Z3zxOjLh-wFMJfAtw_761Xk_qY"
);

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone)
      .single();

    if (error || !data) {
      return res.status(400).json({ message: "User not found" });
    }

    if (data.password !== password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================= DEPOSIT =================
app.post("/deposit", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ message: "Missing data" });
    }

    // get current user
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    const newBalance = user.balance + Number(amount);

    // update balance
    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    // insert transaction
    await supabase.from("transactions").insert([
      {
        user_id: userId,
        amount: amount,
        type: "deposit",
      },
    ]);

    res.json({ message: "Deposit successful", balance: newBalance });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error depositing" });
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

    const newBalance = user.balance - Number(amount);

    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    await supabase.from("transactions").insert([
      {
        user_id: userId,
        amount: amount,
        type: "withdraw",
      },
    ]);

    res.json({ message: "Withdraw successful", balance: newBalance });

  } catch (err) {
    res.status(500).json({ message: "Error withdrawing" });
  }
});

// ================= TRANSACTIONS =================
app.get("/transactions/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("id", { ascending: false });

    res.json({ data });

  } catch (err) {
    res.status(500).json({ message: "Error fetching transactions" });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
