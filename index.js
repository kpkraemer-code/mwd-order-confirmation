require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.raw({ type: 'application/json' }));

const EMAIL_TO = 'kpkraemer@gmail.com';

// Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

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

app.post('/webhook', async (req, res) => {
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
  }

  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook running on port ${PORT}`);
});
