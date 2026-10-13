# Mandla's Tech...

```
mandlas-tech/
├── backend/
│   ├── config/        env.js (settings), db.js (MongoDB), constants.js (tech types, limits, banks)
│   ├── controllers/   the logic: auth, security (Face ID), settings, products, stores, delivery,
│   │                  offers, orders, wallet, messages, favourites, admin
│   ├── middlewares/   login check, rate limits, security headers, error handling
│   ├── models/        User, Avatar, Passkey, SecurityState, BankAccount, Store, Product, ProductImage,
│   │                  Order, Offer, Wallet, WalletTx, Payout, Message, Favourite
│   ├── routes/        which URL goes to which controller
│   ├── utils/         crypto (bank encryption), step-up ticket, wallet, payouts, order flow, migrations
│   ├── app.js  server.js  package.json  .env (YOUR secrets, copy from .env.example)
└── frontend/
    ├── index.html  style.css
    ├── vendor/   fonts (Poppins) + icons (Font Awesome) bundled here, so nothing loads from the internet
    └── js/   core.js (shop, cart, login) · lightbox.js (zoom/swipe photos) · verify.js (password + Face ID)
              orders.js · storetools.js · offers.js · checkout.js · wallet.js · settings.js · start.js
```

## Speed and phone behaviour
- Fonts and icons are bundled in `frontend/vendor`, so pages no longer wait for outside servers.
- The animated frame around the screen only moves its position (cheap for phones). Cards use a still border.
- Product lists use small preview pictures; the full photos load only inside the product window.
- The Back button (or swipe) closes the top pop-up first (photo viewer, cart, product window, dialogs),
  then goes to the previous page and returns you to the same spot. Inner pages also have a back arrow.

## Run it
1. `cd backend`
2. Copy `.env.example` to `.env` and fill in `MONGO_URI`, `JWT_SECRET` and `DATA_ENCRYPTION_KEY`
3. `npm install`
4. `npm start`  (or `npm run dev`)
5. Open http://localhost:5000

## Testing on your phone
- **Over home Wi-Fi** (`http://192.168.x.x:5000`) everything works EXCEPT Face ID and the live selfie camera.
  Browsers only allow those on a secure address (https:// or localhost). Without Face ID the site refuses
  settings changes, by design.
- **To test settings on the phone over Wi-Fi**, add `DEV_SKIP_FACE_ID=true` to `.env`. Your password is
  still required, Face ID is skipped. This is ignored when `NODE_ENV=production`. Never deploy with it.
- **To test real Face ID on the phone**, open the site through an https tunnel (VS Code Ports tab set to
  Public, Cloudflare Tunnel or ngrok) and set in `.env`:
  `WEBAUTHN_ORIGIN=https://your-tunnel-address` and `TRUST_PROXY=1`. Face ID is tied to that address:
  a new address means setting Face ID up again.

## Money (read this before using real money)
- Payment is **test mode**: "Card / EFT (test mode)" marks an order paid without charging anyone, and the
  seller's money then moves through the real wallet flow (on hold -> released -> withdraw).
- To take real money you must connect a payment provider (e.g. PayFast, Yoco, Ozow). Holding customers'
  money can be regulated, so use your provider's escrow / split-payment features and get advice.
- Withdrawals are requests that an admin pays by EFT at `#/admin`. Add your email to `ADMIN_EMAILS`.
- `PLATFORM_FEE_PERCENT` in `backend/config/constants.js` is 0. Set it to keep a percentage of every sale.

## Security design
- Every settings change, withdrawal and payout switch needs password + Face ID. The check gives a
  one-time ticket (3 minutes) that the first change uses up.
- Bank account numbers are encrypted (AES-256-GCM) and only the last 4 digits are ever shown.
- Withdrawals pause for 24 hours after a bank account change (`BANK_COOLDOWN_HOURS`).
- The bank account holder must match the profile name.
- 5 wrong passwords in the identity check lock it for 15 minutes.
- The "Verified photo" tick means the photo was taken live in the app straight after a Face ID check. It is
  NOT a government ID check. For real identity verification, add a KYC provider.

## Where do I change things?
- Technology types, delivery types, banks, limits: `backend/config/constants.js`
- Colours and layout: `frontend/style.css`
- A new feature: model in `models/`, logic in `controllers/`, URL in `routes/`, screen in `frontend/js/`
