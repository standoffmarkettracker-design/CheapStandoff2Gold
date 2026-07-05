# Gold Marketplace

A standalone gold subscription and marketplace platform. Users can subscribe to tiers to receive daily gold allowances, and sell gold back to the site at tiered prices.

## Features

- **Subscription tiers** (Bronze, Silver, Gold) with monthly/yearly billing
- **Daily gold claims** - Subscribers receive allowances each day
- **Gold marketplace** - Users can sell gold to the site at admin-set prices
- **User dashboard** - Track balance, subscriptions, and transaction history
- **Admin panel** - Manage tiers, prices, and user balances
- **Discord authentication** - Secure login with Discord OAuth

## Tech Stack

- **Frontend**: React 18 (Babel Standalone + CDN)
- **Backend**: Firebase Realtime Database
- **Payments**: Stripe (for subscriptions)
- **Deployment**: Netlify

## Project Structure

```
gold-marketplace/
├── src/
│   └── index.html          # Main app (React + Babel inline)
├── package.json
├── .gitignore
└── README.md
```

## Setup Instructions

### 1. Firebase Configuration

1. Create a Firebase project at https://console.firebase.google.com/
2. Enable Realtime Database (start in test mode)
3. Enable Authentication (Discord OAuth + Google)
4. Copy your config and replace the placeholder in `src/index.html`:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  databaseURL: "YOUR_DATABASE_URL",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 2. Firebase Database Rules

Set up these rules in Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "tiers": {
      ".read": true
    },
    "sellPrices": {
      ".read": true
    },
    "transactions": {
      "$transactionId": {
        ".read": "root.child('users').child(data.child('uid').val()).child($transactionId).exists() || root.child('admins').child(auth.uid).exists()",
        ".write": "root.child('admins').child(auth.uid).exists()"
      }
    },
    "admins": {
      ".read": "auth.uid === $uid",
      ".write": false
    }
  }
}
```

### 3. Stripe Configuration

1. Create a Stripe account at https://stripe.com
2. Get your publishable and secret keys
3. Create products for each subscription tier
4. (Backend setup needed for webhook handling)

### 4. Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm start
```

The app will be available at http://localhost:1234

### 5. Deployment to Netlify

```bash
# Build for production
npm run build

# The dist/ folder is ready to deploy to Netlify
```

Or connect your GitHub repo to Netlify for automatic deployments.

## Database Schema

### `/users/{uid}/`
```json
{
  "username": "string",
  "discordId": "string",
  "goldBalance": number,
  "subscriptionTier": "bronze|silver|gold|none",
  "subscriptionExpiry": timestamp,
  "lastClaimDate": "YYYY-MM-DD",
  "lastClaimTime": timestamp
}
```

### `/tiers/`
```json
{
  "bronze": {
    "name": "Bronze",
    "monthlyPrice": 2.99,
    "yearlyPrice": 29.99,
    "dailyAllowance": 100
  }
}
```

### `/sellPrices/`
```json
{
  "standard": {
    "minAmount": 0,
    "maxAmount": 10000,
    "pricePerGold": 0.03
  },
  "bulk": {
    "minAmount": 10000,
    "pricePerGold": 0.05
  }
}
```

### `/transactions/{transactionId}/`
```json
{
  "uid": "string",
  "type": "claim|sell|gift",
  "amount": number,
  "timestamp": timestamp,
  "notes": "string"
}
```

## Next Steps

- [ ] Set up Stripe integration for subscription payments
- [ ] Implement Cloud Functions for server-side transaction handling
- [ ] Connect Discord OAuth for authentication
- [ ] Add email notifications for important events
- [ ] Implement admin dashboard features
- [ ] Add transaction history export
- [ ] Set up analytics and monitoring

## Support

For questions or issues, contact support@goldmarketplace.com

---

**Status**: Frontend MVP complete. Backend integration in progress.
