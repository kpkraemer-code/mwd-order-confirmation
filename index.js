require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.raw({ type: 'application/json' }));

const EMAIL_TO = 'kpkraemer@gmail.com';

// Nodemailer Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// ====================== VERIFY EBAY SIGNATURE ======================
async function verifySignature(signatureHeader, body) {
  try {
    const signature = JSON.parse(signatureHeader);
    const response = await axios.get(`https://api.ebay.com/commerce/notification/v1/public_key/${signature.kid}`);
    const publicKey = response.data.key;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(body);
    return verifier.verify(publicKey, signature.signature, 'base64');
  } catch (err) {
    console.error('Signature verification error:', err.message);
    return false;
  }
}

// ====================== MAIN WEBHOOK ======================
app.post('/webhook', async (req, res) => {
  const body = req.body.toString();
  const signatureHeader = req.headers['x-ebay-signature'];
  const challengeCode = req.headers['x-ebay-challenge-code'];

  // Handle eBay Challenge (Very Important!)
  if (challengeCode) {
    console.log('✅ Responding to eBay Challenge');
    return res.status(200).send(challengeCode);
  }

  // Normal Notification
  if (!signatureHeader) {
    console.error('No signature header received');
    return res.status(401).send('No signature');
  }

  if (!(await verifySignature(signatureHeader, body))) {
    console.error('❌ Signature verification FAILED');
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
    console.log(`✅ New Order Received: ${order?.orderId}`);

    const mailOptions = {
      from: `"eBay Orders" <${process.env.EMAIL_USER}>`,
      to: EMAIL_TO,
      subject: `🛒 New eBay Order #${order?.orderId}`,
      html: `
        <h2>New Order on eBay</h2>
        <p><strong>Order ID:</strong> ${order?.orderId}</p>
        <p><strong>Event Time:</strong> ${payload.notification?.eventDate}</p>
        <h3>Items:</h3>
        <ul>
          ${order?.orderLineItems?.map(item => `
            <li>Listing ID: ${item.listingId} | Quantity: ${item.quantity}</li>
          `).join('') || '<li>No items found</li>'}
        </ul>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('📧 Email sent to', EMAIL_TO);
    } catch (err) {
      console.error('Failed to send email:', err);
    }
  }

  res.status(200).send('OK');
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log(`🚀 eBay Webhook running on port ${PORT}`);
});
