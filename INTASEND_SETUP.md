# IntaSend STK Push Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add these environment variables on your server:

   ```bash
   INTASEND_PUBLISHABLE_KEY=your_publishable_key
   INTASEND_SECRET_KEY=your_secret_key
   INTASEND_TEST_MODE=false
   INTASEND_WEBHOOK_CHALLENGE=your_webhook_challenge
   PUBLIC_BASE_URL=https://your-domain.example
   ```

3. For live payments, set:

   ```bash
   INTASEND_TEST_MODE=false
   NODE_ENV=production
   ```

4. In the IntaSend dashboard, add this webhook URL:

   ```text
   https://your-domain.example/intasend/webhook
   ```

5. Use the same webhook challenge value in IntaSend and in `INTASEND_WEBHOOK_CHALLENGE`.

Deposits now work like this:

- User enters M-Pesa phone number and amount.
- Server sends an IntaSend M-Pesa STK Push.
- Transaction remains pending until IntaSend calls `/intasend/webhook`.
- When webhook state is `COMPLETE`, the user balance is credited once.
- Admin approval is still used for withdrawals, but not for IntaSend deposits.

Important: rotate any live secret key that has been pasted into chat before deploying.
