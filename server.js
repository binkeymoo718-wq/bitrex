const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

/* ================= SUPABASE ================= */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone);

    if (error) {
      console.log(error);
      return res.status(500).json({ message: "Database error" });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = data[0];

    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      id: user.id,
      phone: user.phone,
      balance: user.balance
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= DEPOSIT ================= */
app.post("/deposit", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone);

    if (error) {
      console.log(error);
      return res.status(500).json({ message: "Database error" });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = data[0];
    const newBalance = Number(user.balance || 0) + Number(amount);

    const { error: updateError } = await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("phone", phone);

    if (updateError) {
      console.log(updateError);
      return res.status(500).json({ message: "Update failed" });
    }

    // ✅ SAVE TRANSACTION
    await supabase.from("transactions").insert([
      { phone, type: "deposit", amount }
    ]);

    res.json({ balance: newBalance });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Deposit error" });
  }
});

/* ================= WITHDRAW ================= */
app.post("/withdraw", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone);

    if (error) {
      console.log(error);
      return res.status(500).json({ message: "Database error" });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = data[0];

    if (Number(user.balance) < Number(amount)) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const newBalance = Number(user.balance) - Number(amount);

    const { error: updateError } = await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("phone", phone);

    if (updateError) {
      console.log(updateError);
      return res.status(500).json({ message: "Update failed" });
    }

    // ✅ SAVE TRANSACTION
    await supabase.from("transactions").insert([
      { phone, type: "withdraw", amount }
    ]);

    res.json({ balance: newBalance });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Withdraw error" });
  }
});

/* ================= HISTORY ================= */
app.post("/history", async (req, res) => {
  try {
    const { phone } = req.body;

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: false });

    if (error) {
      console.log(error);
      return res.status(500).json({ message: "History error" });
    }

    res.json(data);

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= ADMIN: USERS ================= */
app.get("/users", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("phone, balance");

    if (error) {
      console.log(error);
      return res.status(500).json({ message: "Users error" });
    }

    res.json(data);

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= ADMIN: ANALYTICS ================= */
app.get("/analytics", async (req, res) => {
  try {
    const { data: users } = await supabase.from("users").select("*");
    const { data: transactions } = await supabase.from("transactions").select("*");

    const totalUsers = users.length;

    const totalBalance = users.reduce(
      (sum, u) => sum + Number(u.balance || 0),
      0
    );

    const totalDeposits = transactions
      .filter(t => t.type === "deposit")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalWithdrawals = transactions
      .filter(t => t.type === "withdraw")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    res.json({
      totalUsers,
      totalBalance,
      totalDeposits,
      totalWithdrawals
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Analytics error" });
  }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
