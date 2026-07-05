# Quick Start Guide

## What you have

✅ Complete React frontend with all pages:
- Home page with feature highlights
- Subscription tiers listing (with monthly/yearly toggle)
- Sell gold interface with dynamic pricing quotes
- User dashboard with balance, subscription status, and transaction history
- Admin panel (access-controlled)
- Responsive design with gold theme

✅ Firebase integration ready (just needs config)
✅ Auth system scaffolding (Google login implemented, Discord ready)
✅ Styling and UI components complete

## Immediate next steps

### Step 1: Deploy the skeleton to Netlify (5 min)
1. Create a GitHub repo: `gold-marketplace`
2. Push the code
3. Connect to Netlify
4. Your site goes live (without Firebase/auth working yet)

**Why**: Start getting a live URL, set up custom domain, SSL, etc. while you work on the backend.

### Step 2: Set up Firebase (15 min)
1. Go to https://console.firebase.google.com/
2. Create a new project named "gold-marketplace"
3. Copy the Web SDK config
4. Paste it into `src/index.html` lines 137-145 (where it says `firebaseConfig`)
5. Go to **Authentication** and enable:
   - Google (quick test)
   - Discord (main auth)
6. Go to **Realtime Database** and create a database in US (test mode for now)
7. Redeploy to Netlify

**Result**: You can now log in and the app talks to Firebase

### Step 3: Build out the click handlers (30 min)
Right now clicking buttons doesn't do anything. Hook these up:
- "Subscribe Now" button → Redirects to Stripe checkout (or shows payment modal)
- "Claim Daily Gold" button → Adds gold to user balance (calls Cloud Function)
- "Get Quote" / "Confirm Sale" → Processes the sale
- "Manage Subscription" → Takes you to Stripe customer portal

**Files to modify**: `src/index.html` - Add click handlers in the component functions

### Step 4: Stripe integration (1 hour)
This is where subscriptions actually charge money:
1. Create a Stripe account
2. Add Stripe publishable key to the app
3. Create products for Bronze/Silver/Gold
4. Implement checkout flow
5. Set up webhooks to sync Stripe → Firebase

**Resources**:
- https://stripe.com/docs/billing/subscriptions
- https://stripe.com/docs/payments/checkout/custom-integration-prefilled

### Step 5: Cloud Functions for server-side logic (1-2 hours)
Things that must NOT be handled client-side:
- Crediting gold when subscription renews
- Processing gold sales (deduct from user, add to site)
- Applying daily allowance claims
- Admin operations

**Files to create**:
- `functions/claimDailyGold.js` - Validates user has subscription, credits gold
- `functions/sellGold.js` - Deducts gold, processes payout
- `functions/applySubscription.js` - Webhook from Stripe
- `functions/index.js` - Cloud Function deploy config

## File map

```
src/index.html - Everything is here for now
  ├─ App() - Main component, page routing
  ├─ HomePage() - Landing page
  ├─ SubscriptionsPage() - Browse & subscribe
  ├─ SellGoldPage() - Sell interface
  ├─ DashboardPage() - User stats & history
  ├─ AdminPanel() - Admin controls
  └─ Auth setup, Firebase, Stripe
```

## What each page needs

### SubscriptionsPage
- [ ] "Subscribe Now" → Stripe Checkout
- [ ] Monthly/yearly toggle (✓ UI done)
- [ ] Load tiers from `/tiers/` in Firebase
- [ ] Show user's current subscription if logged in

### SellGoldPage
- [ ] Load user's balance from Firebase
- [ ] Load sell prices from `/sellPrices/`
- [ ] "Confirm Sale" → Call Cloud Function
- [ ] Show loading/success/error states

### DashboardPage
- [ ] Real-time balance sync (✓ Started)
- [ ] "Claim Daily Gold" button → Cloud Function
- [ ] Show next claim time if already claimed today
- [ ] Link to Stripe portal for subscription management

### AdminPanel
- [ ] Edit tier prices & daily allowances
- [ ] Edit sell-back prices
- [ ] View/search users
- [ ] Gift gold to users

## Testing checklist

- [ ] App loads at your Netlify URL
- [ ] Can log in with Discord
- [ ] User profile persists in Firebase
- [ ] Can navigate between pages
- [ ] Responsive on mobile
- [ ] Subscriptions page shows tiers (from Firebase)
- [ ] Dashboard loads user data
- [ ] Admin panel blocks non-admins

## Common issues

**"Firebase not initializing"**
- Check that firebaseConfig is filled in correctly
- Check that Firebase SDK scripts loaded (inspect Network tab)

**"Stripe not loading"**
- Stripe script needs internet access
- Check CSP headers on your hosting

**"Buttons don't do anything"**
- Many click handlers are stubs - start here for Step 3

**"Discord auth doesn't work"**
- Need to set up OAuth in Discord Developer Portal
- Need to add redirect URIs for your Netlify domain

---

**Ready to code?** Start with Step 1 above, or let me know if you want help with any particular step!
