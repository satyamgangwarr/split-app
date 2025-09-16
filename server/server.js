require('dotenv').config();
const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET || !DATABASE_URL) {
    console.error("FATAL ERROR: JWT_SECRET and DATABASE_URL environment variables are required.");
    process.exit(1);
}

const dbPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));


const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required." });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { rows } = await dbPool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id",
      [username, email, hashedPassword]
    );
    res
      .status(201)
      .json({
        message: "User registered successfully",
        userId: rows[0].id,
      });
  } catch (error) {
    console.error("Registration Error:", error);
    res
      .status(500)
      .json({ message: "Error registering user. The username or email might already be taken." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }
  try {
    const { rows } = await dbPool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    res.json({
      message: "Login successful",
      token,
      userId: user.id,
      username: user.username,
    });
  } catch (error) {
    console.error("Login Error:", error);
    res
      .status(500)
      .json({ message: "Server error during login" });
  }
});

app.get("/api/users/search", authenticateToken, async (req, res) => {
  const { username } = req.query;
  try {
    const { rows } = await dbPool.query(
      "SELECT id, username FROM users WHERE username ILIKE $1 AND id != $2",
      [`%${username}%`, req.user.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Error searching for users" });
  }
});

app.post("/api/groups", authenticateToken, async (req, res) => {
  const { name, members } = req.body;
  const created_by_user_id = req.user.id;
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const groupResult = await client.query(
        'INSERT INTO "groups" (name, created_by_user_id) VALUES ($1, $2) RETURNING id',
        [name, created_by_user_id]
    );
    const groupId = groupResult.rows[0].id;

    const allMemberIds = [...new Set([created_by_user_id, ...members])];
    const memberInsertPromises = allMemberIds.map((userId) => {
      return client.query(
        "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)",
        [groupId, userId]
      );
    });
    await Promise.all(memberInsertPromises);

    await client.query('COMMIT');
    res.status(201).json({ message: "Group created successfully", groupId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error creating group:", error);
    res.status(500).json({ message: "Error creating group" });
  } finally {
    client.release();
  }
});

app.get("/api/groups", authenticateToken, async (req, res) => {
  try {
    const { rows } = await dbPool.query(
      'SELECT g.id, g.name FROM "groups" g JOIN group_members gm ON g.id = gm.group_id WHERE gm.user_id = $1',
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Error fetching groups" });
  }
});

app.get("/api/groups/:groupId", authenticateToken, async (req, res) => {
  const { groupId } = req.params;
  try {
    const groupRes = await dbPool.query(
      'SELECT * FROM "groups" WHERE id = $1',
      [groupId]
    );
    const memberRes = await dbPool.query(
      "SELECT u.id, u.username FROM users u JOIN group_members gm ON u.id = gm.user_id WHERE gm.group_id = $1",
      [groupId]
    );
    const expenseRes = await dbPool.query(
      `
            SELECT e.*, u.username as paid_by_username
            FROM expenses e
            JOIN users u ON e.paid_by_user_id = u.id
            WHERE e.group_id = $1
            ORDER BY e.created_at DESC
        `,
      [groupId]
    );

    res.json({
      details: groupRes.rows[0],
      members: memberRes.rows,
      expenses: expenseRes.rows,
    });
  } catch (error) {
    console.error("Error fetching group details:", error);
    res.status(500).json({ message: "Error fetching group details" });
  }
});

app.delete("/api/groups/:groupId", authenticateToken, async (req, res) => {
  const { groupId } = req.params;
  try {
    await dbPool.query('DELETE FROM "groups" WHERE id = $1', [groupId]);
    res.status(200).json({ message: "Group deleted successfully." });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({ message: "Error deleting group" });
  }
});

app.post(
  "/api/groups/:groupId/members",
  authenticateToken,
  async (req, res) => {
    const { groupId } = req.params;
    const { userId } = req.body;
    try {
      await dbPool.query(
        "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)",
        [groupId, userId]
      );
      res.status(201).json({ message: "Member added successfully." });
    } catch (error) {
      console.error("Error adding member:", error);
      res.status(500).json({ message: "Error adding member to group" });
    }
  }
);


app.post("/api/expenses", authenticateToken, async (req, res) => {
  const { groupId, description, amount, paidByUserId, splits } = req.body;
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const expenseResult = await client.query(
      "INSERT INTO expenses (group_id, description, amount, paid_by_user_id) VALUES ($1, $2, $3, $4) RETURNING id",
      [groupId, description, amount, paidByUserId]
    );
    const expenseId = expenseResult.rows[0].id;

    const splitPromises = splits.map((split) => {
      return client.query(
        "INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES ($1, $2, $3)",
        [expenseId, split.userId, split.amountOwed]
      );
    });

    await Promise.all(splitPromises);
    await client.query('COMMIT');
    res.status(201).json({ message: "Expense added successfully", expenseId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error adding expense:", error);
    res.status(500).json({ message: "Error adding expense" });
  } finally {
    client.release();
  }
});

app.delete("/api/expenses/:expenseId", authenticateToken, async (req, res) => {
  const { expenseId } = req.params;
  try {
    await dbPool.query("DELETE FROM expenses WHERE id = $1", [expenseId]);
    res.status(200).json({ message: "Expense deleted successfully." });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ message: "Error deleting expense" });
  }
});


app.post("/api/settle", authenticateToken, async (req, res) => {
  const { groupId, payerId, payeeId, amount } = req.body;
  try {
    await dbPool.query(
      "INSERT INTO settlements (group_id, payer_id, payee_id, amount) VALUES ($1, $2, $3, $4)",
      [groupId, payerId, payeeId, amount]
    );
    res.status(201).json({ message: "Settlement recorded." });
  } catch (err) {
    console.error("Error settling up:", err);
    res.status(500).json({ message: "Error settling up." });
  }
});

app.get("/api/groups/:groupId/summary", authenticateToken, async (req, res) => {
    const { groupId } = req.params;
    try {
        const { rows: members } = await dbPool.query(
            "SELECT u.id, u.username FROM users u JOIN group_members gm ON u.id = gm.user_id WHERE gm.group_id = $1",
            [groupId]
        );
        const balances = {};
        const memberMap = {};
        members.forEach((m) => {
            balances[m.id] = 0;
            memberMap[m.id] = m.username;
        });

        const { rows: paidTotals } = await dbPool.query(
            "SELECT paid_by_user_id, SUM(amount) as total_paid FROM expenses WHERE group_id = $1 GROUP BY paid_by_user_id",
            [groupId]
        );
        paidTotals.forEach((p) => {
            if (balances[p.paid_by_user_id] !== undefined) {
                balances[p.paid_by_user_id] += parseFloat(p.total_paid);
            }
        });

        const { rows: owedTotals } = await dbPool.query(
            "SELECT es.user_id, SUM(es.amount_owed) as total_owed FROM expense_splits es JOIN expenses e ON es.expense_id = e.id WHERE e.group_id = $1 GROUP BY es.user_id",
            [groupId]
        );
        owedTotals.forEach((o) => {
            if (balances[o.user_id] !== undefined) {
                balances[o.user_id] -= parseFloat(o.total_owed);
            }
        });

        const { rows: settlements } = await dbPool.query(
            "SELECT payer_id, payee_id, amount FROM settlements WHERE group_id = $1",
            [groupId]
        );
        settlements.forEach((s) => {
            if (balances[s.payer_id] !== undefined)
                balances[s.payer_id] += parseFloat(s.amount);
            if (balances[s.payee_id] !== undefined)
                balances[s.payee_id] -= parseFloat(s.amount);
        });

        const debtors = [];
        const creditors = [];
        Object.keys(balances).forEach((userId) => {
            if (balances[userId] < -0.01) {
                debtors.push({ id: userId, amount: balances[userId] });
            } else if (balances[userId] > 0.01) {
                creditors.push({ id: userId, amount: balances[userId] });
            }
        });

        const transactions = [];
        while (debtors.length > 0 && creditors.length > 0) {
            const debtor = debtors[0];
            const creditor = creditors[0];
            const amount = Math.min(-debtor.amount, creditor.amount);

            transactions.push({
                from: memberMap[debtor.id],
                to: memberMap[creditor.id],
                amount: amount.toFixed(2),
            });

            debtor.amount += amount;
            creditor.amount -= amount;

            if (Math.abs(debtor.amount) < 0.01) debtors.shift();
            if (Math.abs(creditor.amount) < 0.01) creditors.shift();
        }

        res.json(transactions);
    } catch (error) {
        console.error("Error calculating summary:", error);
        res.status(500).json({ message: "Error calculating summary." });
    }
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

