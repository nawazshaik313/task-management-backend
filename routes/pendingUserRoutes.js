
const express = require("express");
const router = express.Router();
const PendingUser = require("../models/PendingUser");

router.get("/", async (req, res) => {
  const pendingUsers = await PendingUser.find();
  res.json(pendingUsers);
});

router.post("/", async (req, res) => {
  try {
    await PendingUser.deleteMany({});
    await PendingUser.insertMany(req.body);
    res.json({ message: "Pending users saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
