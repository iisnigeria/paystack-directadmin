const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json({
    verify: (req, res, buf) => { req.rawBody = buf; }
}));

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const DIRECTADMIN_URL = process.env.DIRECTADMIN_URL;
const DIRECTADMIN_USER = process.env.DIRECTADMIN_USER;
const DIRECTADMIN_KEY = process.env.DIRECTADMIN_KEY;

app.post('/paystack-webhook', async (req, res) => {
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
                       .update(req.rawBody)
                       .digest('hex');
                       
    if (hash !== req.headers['x-paystack-signature']) {
        return res.status(401).send('Signature verification failed');
    }

    res.sendStatus(200);

    const event = req.body;

    if (event.event === 'charge.success') {
        const customerEmail = event.data.customer.email;
        const metadata = event.data.metadata || {};
        
        // Clean up email to generate a standard unique username
        const baseUser = customerEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const username = baseUser.substring(0, 8) + Math.floor(100 + Math.random() * 900);
        const domain = metadata.domain || `${username}.com`;
        const packagePlan = metadata.plan_package || 'Default'; 

        try {
            const password = crypto.randomBytes(6).toString('hex') + 'A1!';
            const payload = new URLSearchParams({
                action: 'create',
                username: username,
                email: customerEmail,
                passwd: password,
                passwd2: password,
                domain: domain,
                package: packagePlan,
                ip: 'shared',
                notify: 'yes'
            });

            const authBuffer = Buffer.from(`${DIRECTADMIN_USER}:${DIRECTADMIN_KEY}`).toString('base64');
            const config = {
                headers: {
                    'Authorization': `Basic ${authBuffer}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };

            const response = await axios.post(`${DIRECTADMIN_URL}/CMD_API_ACCOUNT_USER`, payload.toString(), config);
            console.log(`DirectAdmin Response: ${response.data}`);
        } catch (error) {
            console.error('Error creating account:', error.message);
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
