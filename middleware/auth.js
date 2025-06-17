
const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token missing' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decodedUserPayload) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    // decodedUserPayload should include id, email, role, displayName, uniqueId, organizationId
    req.user = decodedUserPayload; 
    if (!req.user.organizationId) {
        // This case should ideally not happen if login/registration correctly include organizationId in token.
        // As a fallback, one might try to fetch it, but it's better to ensure token integrity.
        console.warn(`WARN: organizationId missing from token for user ${req.user.id}. Data scoping might be incomplete.`);
        // return res.status(403).json({ success: false, message: 'Token is missing organization information.' });
    }
    next();
  });
}

function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
}

module.exports = { verifyToken, isAdmin };
