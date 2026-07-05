# Complete Setup Guide

Follow these steps to get your Gold Marketplace live with Firebase and connected to Stripe.

## Phase 1: Prepare the Repository

### 1.1 Create GitHub Repository
```bash
# Already in /home/claude/gold-marketplace with git initialized
git remote add origin https://github.com/YOUR_USERNAME/gold-marketplace.git
git branch -M main
git push -u origin main
```

### 1.2 Verify project structure
```bash
tree -L 2
# Should show:
# gold-marketplace/
# ├── src/
# │   └── index.html
# ├── package.json
# ├── .gitignore
# ├── README.md
# ├── QUICKSTART.md
# └── SETUP.md
```

---

## Phase 2: Firebase Setup

### 2.1 Create Firebase Project
1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Name it: `gold-marketplace`
4. Click "Create project" (wait for it to finish)

### 2.2 Add Firebase to your app
1. In Firebase Console, click the **Web** icon (</> )
2. App name: `Gold Marketplace Web`
3. Check "Also set up Firebase hosting for this app" (optional but recommended)
4. Click "Register app"
5. Copy the config object:
```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "gold-marketplace-xxx.firebaseapp.com",
  projectId: "gold-marketplace-xxx",
  databaseURL: "https://gold-marketplace-xxx-default-rtdb.firebaseio.com",
  storageBucket: "gold-marketplace-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

### 2.3 Update your app with Firebase config
1. Open `src/index.html`
2. Find the line `const firebaseConfig = {` (around line 137)
3. Replace the entire config object with your copied values
4. Save the file

### 2.4 Enable Realtime Database
1. In Firebase Console, go to **Build** → **Realtime Database**
2. Click "Create Database"
3. Location: `us-central1` (or closest to you)
4. Security rules: Start in **Test Mode** for now
5. Click "Enable"

### 2.5 Set Database Rules
Copy these rules into your Realtime Database → Rules tab:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid",
        "goldBalance": {
          ".write": "root.child('admins').child(auth.uid).exists()"
        }
      }
    },
    "tiers": {
      ".read": true,
      ".write": "root.child('admins').child(auth.uid).exists()"
    },
    "sellPrices": {
      ".read": true,
      ".write": "root.child('admins').child(auth.uid).exists()"
    },
    "transactions": {
      ".read": "root.child('admins').child(auth.uid).exists()",
      ".write": "root.child('admins').child(auth.uid).exists()"
    },
    "admins": {
      ".read": false,
      ".write": false
    }
  }
}
```

6. Click "Publish"

### 2.6 Enable Authentication
1. In Firebase Console, go to **Build** → **Authentication**
2. Click "Get started"
3. Click "Email/Password" and enable it
4. Click "Google" and enable it
5. Click "Custom providers..." (or scroll down) and set up **Discord OAuth** (optional for now, focus on Google)

### 2.7 Create sample data
1. In Realtime Database, click the **+** icon next to "Database name"
2. Create the following structure:

**tiers**
```json
{
  "bronze": {
    "name": "Bronze",
    "monthlyPrice": 2.99,
    "yearlyPrice": 29.99,
    "dailyAllowance": 100,
    "description": "Great for casual players"
  },
  "silver": {
    "name": "Silver",
    "monthlyPrice": 9.99,
    "yearlyPrice": 99.99,
    "dailyAllowance": 300,
    "description": "Perfect for regular players"
  },
  "gold": {
    "name": "Gold",
    "monthlyPrice": 19.99,
    "yearlyPrice": 199.99,
    "dailyAllowance": 1000,
    "description": "For serious collectors"
  }
}
```

**sellPrices**
```json
{
  "standard": {
    "name": "Standard (0-10k)",
    "minAmount": 0,
    "maxAmount": 10000,
    "pricePerGold": 0.03
  },
  "bulk": {
    "name": "Bulk (10k+)",
    "minAmount": 10000,
    "pricePerGold": 0.05
  }
}
```

---

## Phase 3: Netlify Deployment

### 3.1 Connect to Netlify
1. Go to https://app.netlify.com/
2. Click "Add new site" → "Import an existing project"
3. Choose GitHub
4. Authorize Netlify with GitHub
5. Select your `gold-marketplace` repo
6. Build settings:
   - **Build command**: (leave empty, static site)
   - **Publish directory**: `src`
7. Click "Deploy site"

### 3.2 Configure for SPA
1. In Netlify, go to **Site configuration** → **Build & deploy**
2. In the **Deploy contexts** section, scroll to **Post processing**
3. Create a `_redirects` file in your `src/` folder:

```
# _redirects
/*    /index.html   200
```

Push this to GitHub:
```bash
echo "/*    /index.html   200" > src/_redirects
git add src/_redirects
git commit -m "Add Netlify redirects for SPA routing"
git push origin main
```

### 3.3 Wait for deployment
Netlify should automatically redeploy. Check the **Deploys** tab to see the status.

Your site is now live at: `https://YOUR_SITE_NAME.netlify.app`

### 3.4 Update Firebase OAuth redirect URLs
1. In Firebase Console, go to **Authentication** → **Settings**
2. Scroll to "Authorized domains"
3. Add your Netlify domain: `YOUR_SITE_NAME.netlify.app`

---

## Phase 4: Test the Frontend

### 4.1 Test on live site
1. Open your Netlify URL in a browser
2. Click "Home" — should load the landing page
3. Click "Login with Discord" (or Google if Discord not set up yet)
4. You should be redirected to login, then back to the app
5. Check Firebase Console → **Authentication** to see your user created

### 4.2 Test pages
- [ ] Home page loads
- [ ] Can log in
- [ ] Can navigate to Subscriptions
- [ ] Can navigate to Sell Gold
- [ ] Can navigate to Dashboard (shows user data from Firebase)
- [ ] Responsive on mobile

### 4.3 Check browser console
1. Open DevTools (F12)
2. Go to Console tab
3. Should be no red errors (warnings are OK)
4. If Firebase errors appear, double-check your config in step 2.3

---

## Phase 5: Stripe Setup (Ready for next session)

### 5.1 Create Stripe account
1. Go to https://stripe.com
2. Sign up for a new account
3. Verify your email

### 5.2 Get API keys
1. Go to **Developers** → **API keys**
2. Copy your **Publishable key** and **Secret key**
3. You'll add these to your frontend and backend in the next build phase

### 5.3 Create products (manual for now)
1. Go to **Products**
2. Click "Add product"
3. Create one for each tier:
   - **Bronze** — $2.99/month
   - **Silver** — $9.99/month
   - **Gold** — $19.99/month
4. Note the Product IDs (you'll use them when hooking up checkout)

---

## What's Next

✅ **Frontend is live**
✅ **Firebase is configured**
✅ **User auth works**
✅ **Database schema is set up**

⏭️ **Next session:**
1. Hook up Stripe checkout button
2. Create Cloud Functions for:
   - Claiming daily gold
   - Processing gold sales
   - Handling subscription webhooks
3. Add admin panel functionality

---

## Troubleshooting

### "Firebase SDK not loading"
- Check that CDN URLs are correct in `src/index.html`
- Check Network tab in DevTools — should see `https://www.gstatic.com/firebasejs/...`

### "Config object errors"
- Double-check you pasted the entire config object
- Make sure all keys have values (no placeholders like `YOUR_API_KEY`)
- Check for typos in the JSON

### "Auth redirect not working"
- Make sure your Netlify domain is in Firebase authorized domains
- Clear browser cache and try again
- Check that Google authentication is enabled in Firebase

### "Database rules blocking writes"
- Temporarily switch to test mode (insecure, dev only):
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
- After testing, revert to the secure rules above

### "Page won't load after deployment"
- Check Netlify deploy logs (Deploys tab)
- Make sure `_redirects` file exists in src/
- Verify no build errors in Netlify console

---

## Quick Reference

| Service | Key Credentials |
|---------|-----------------|
| Firebase | Project ID: `gold-marketplace-xxx` |
| Firebase | Database URL: `https://gold-marketplace-xxx-default-rtdb.firebaseio.com` |
| Netlify | Site: `your-site-name.netlify.app` |
| Stripe | Publishable key: `pk_test_...` |
| Stripe | Secret key: `sk_test_...` (keep secret!) |

---

Ready to go live? Push to GitHub and Netlify will auto-deploy!
