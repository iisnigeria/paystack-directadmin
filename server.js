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

    // Trigger on successful charge or successful subscription creation
    if (event.event === 'charge.success' || event.event === 'subscription.create') {
        const customerEmail = event.data.customer.email;
        const metadata = event.data.metadata || {};
        
        // 1. Get the domain name typed by the customer in the extra field
        let domain = '';
        if (metadata.custom_fields && metadata.custom_fields.length > 0) {
            const domainField = metadata.custom_fields.find(f => f.variable_name === 'domain' || f.display_name.toLowerCase() === 'domain');
            if (domainField) domain = domainField.value;
        }

        // 2. Automatically get the Plan Name directly from Paystack's Subscription settings
        let packagePlan = 'Default';
        if (event.data.plan && event.data.plan.name) {
            packagePlan = event.data.plan.name; // This grabs "Test", "Essential", etc.
        } else if (metadata.plan_package) {
            packagePlan = metadata.plan_package;
        }

        // Clean up email to generate a standard unique username
        const baseUser = customerEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const username = baseUser.substring(0, 8) + Math.floor(100 + Math.random() * 900);
        
        if (!domain) {
            domain = `${username}.com`;
        }

        console.log(`Attempting to provision Plan: "${packagePlan}" for Domain: "${domain}"`);

        try {
            const password = crypto.randomBytes(6).toString('hex') + 'A1!';
            const payload = new URLSearchParams({
                action: 'create',
                username: username,
                email: customerEmail,
                passwd: password,
                passwd2: password,
                domain: domain,
                package: packagePlan, // Matches your exact DirectAdmin package name
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
