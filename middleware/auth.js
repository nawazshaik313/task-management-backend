
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Required for fetching user details to confirm org

async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch user from DB to ensure they still exist and org matches token (if applicable)
    // This adds a DB hit but increases security against stale tokens or org changes.
    const userFromDb = await User.findById(decoded.id).select('role organizationId');
    if (!userFromDb) {
        return res.status(403).json({ success: false, message: 'User not found or token invalid.' });
    }

    // Ensure the organizationId from token matches the one in DB (critical for context)
    if (decoded.organizationId !== userFromDb.organizationId) {
        return res.status(403).json({ success: false, message: 'Organization context mismatch.' });
    }
    // Ensure role from token matches DB, user could have been demoted.
    if (decoded.role !== userFromDb.role) {
         return res.status(403).json({ success: false, message: 'User role changed, please re-login.' });
    }


    req.user = { // Reconstruct req.user from verified sources
        id: decoded.id,
        email: decoded.email, // email and displayName could also be fetched from DB for max freshness
        displayName: decoded.displayName,
        uniqueId: decoded.uniqueId,
        role: userFromDb.role,
        organizationId: userFromDb.organizationId
    };
    next();
  } catch (err) {
    console.error("Token verification error:", err.name, err.message);
    let message = 'Invalid or expired token';
    if (err.name === 'TokenExpiredError') {
        message = 'Token expired, please log in again.';
    } else if (err.name === 'JsonWebTokenError') {
        message = 'Invalid token format.';
    }
    return res.status(403).json({ success: false, message });
  }
}

function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
}

module.exports = { verifyToken, isAdmin };