const express = require('express');
const router = express.Router();
const AdminLog = require('../models/AdminLog');

router.get('/', async (req, res) => {
try {
const logs = await AdminLog.find();
res.json(logs);
} catch (err) {
res.status(500).json({ error: 'Server error' });
}
});
module.exports = router;