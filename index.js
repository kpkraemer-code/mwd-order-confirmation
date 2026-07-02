const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const VERIFICATION_TOKEN = "MiDwEsT_dIeSeL_Kyle_kRaEmEr_ThisIsWild";
const ENDPOINT = "https://midwesttest-production.up.railway.app/webhook";   // Must match exactly what you send in createDestination

app.post('/webhook', (req, res) => {
  const challenge = req.headers['x-ebay-challenge-code'];
  
  if (challenge) {
    console.log("Challenge received:", challenge);
    return res.status(200).send(challenge);
  }

  console.log("Normal request received");
  res.status(200).send("OK");
});

app.get('/health', (req, res) => res.send("OK"));

app.listen(PORT, () => console.log(`Running on port ${PORT}`));
