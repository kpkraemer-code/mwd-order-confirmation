const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.raw({ type: 'application/json' }));

// CRITICAL: Challenge Handler - Must be first
app.post('/webhook', (req, res) => {
  const challengeCode = req.headers['x-ebay-challenge-code'];

  if (challengeCode) {
    console.log("✅ CHALLENGE RECEIVED → Responding with:", challengeCode);
    return res.status(200).send(challengeCode);
  }

  // For normal notifications
  console.log("📨 Notification received");
  res.status(200).send('OK');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
