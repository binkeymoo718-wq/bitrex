const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

/* ================= SUPABASE ================= */
const supabase = createClient(
  "https://mpasmnqayaunhxdqlpsp.supabase.co",
  "sb_publishable_7Yk4Z3zx0jLh-wFMJfAtw_761Xk_qY"
);

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    console.log("LOGIN:", phone, password);

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone);

    if (error) {
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

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = data[0];
    const newBalance = user.balance + Number(amount);

    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("phone", phone);

    res.json({ balance: newBalance });

  } catch (err) {
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

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = data[0];

    if (user.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const newBalance = user.balance - Number(amount);

    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("phone", phone);

    res.json({ balance: newBalance });

  } catch (err) {
    res.status(500).json({ message: "Withdraw error" });
  }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
