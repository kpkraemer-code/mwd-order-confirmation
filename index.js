const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.raw({ type: 'application/json' }));

const EMAIL_TO = 'kpkraemer@gmail.com';

// Replace with your own secret
const VERIFICATION_TOKEN = "MiDwEsT_dIeSeL_Kyle_kRaEmEr_ThisIsWild";
const ENDPOINT = "https://mwd-order-confirmation-production.up.railway.app/webhook/ebay";   // Must match exactly what you send in createDestination

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ======================
// EBAY WEBHOOK ENDPOINT
// ======================
app.get('/webhook/ebay', (req, res) => {          // ← Challenge (GET request)
    const challengeCode = req.query.challenge_code;

    if (!challengeCode) {
        return res.status(400).send('Missing challenge_code');
    }

    try {
        const hash = crypto.createHash('sha256');
        hash.update(challengeCode);
        hash.update(VERIFICATION_TOKEN);
        hash.update(ENDPOINT);

        const challengeResponse = hash.digest('hex');

        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json({ challengeResponse });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Error processing challenge');
    }
});

// Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// VERIFICATION?????????????????
async function getEbayPublicKey(keyId) {
  try {
    const res = await axios.get(`https://api.ebay.com/commerce/notification/v1/public_key/${keyId}`);
    return res.data.key;
  } catch (err) {
    console.error('Failed to fetch public key:', err.message);
    return null;
  }
}

async function verifySignature(signatureHeader, body) {
  try {
    const signature = JSON.parse(signatureHeader);
    const publicKeyPem = await getEbayPublicKey(signature.kid);
    if (!publicKeyPem) return false;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(body);
    return verifier.verify(publicKeyPem, signature.signature, 'base64');
  } catch (err) {
    console.error('Signature verification failed:', err);
    return false;
  }
}


app.post('/webhook/ebay', (req, res) => {         // ← Actual notifications (POST)
    console.log('=== eBay Notification Received ===');
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    // TODO: Add signature verification here (highly recommended)
    // Use eBay's official Node.js SDK for easier validation

    // BEGIN MAIL FUNCTION
  const body = req.body.toString();
  const signatureHeader = req.headers['x-ebay-signature'];

  if (!signatureHeader || !(await verifySignature(signatureHeader, body))) {
    console.error('❌ Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }

  if (payload.metadata?.topic === 'ORDER_CONFIRMATION') {
    const order = payload.notification?.data?.order;
    const user = payload.notification?.data?.user;

    console.log(`✅ New Order: ${order?.orderId}`);

    const mailOptions = {
      from: `"eBay Bot" <${process.env.EMAIL_USER}>`,
      to: EMAIL_TO,
      subject: `🛒 New eBay Order #${order?.orderId}`,
      html: `
        <h2>New eBay Order Received</h2>
        <p><strong>Order ID:</strong> ${order?.orderId}</p>
        <p><strong>Time:</strong> ${payload.notification?.eventDate}</p>
        <p><strong>Seller:</strong> ${user?.username || user?.userId}</p>
        
        <h3>Items:</h3>
        <ul>
          ${order?.orderLineItems?.map(item => `
            <li>Listing: ${item.listingId} | Qty: ${item.quantity}</li>
          `).join('') || '<li>No items</li>'}
        </ul>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('📧 Email sent');
    } catch (err) {
      console.error('Email failed:', err);
    }

	//END MAIL FUNCTION

    // Always return 200 OK quickly
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`eBay webhook listening on port ${PORT}`);
});
