const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const PendingUser = require('../models/PendingUser');

router.post('/', async (req, res) => {
  const { displayName, email, password, role, uniqueId } = req.body;

  if (!displayName || !email || !password || !role || !uniqueId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = await PendingUser.findOne({ $or: [{ email }, { uniqueId }] });
  if (existing) return res.status(409).json({ error: 'User already exists' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new PendingUser({ displayName, email, password: hashedPassword, role, uniqueId });

  try {
    const savedUser = await newUser.save();
    res.status(201).json(savedUser);
} catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save user' });
}
});

module.exports = router;
