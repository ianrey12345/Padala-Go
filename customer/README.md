# Padala Go — Delivery App

A two-sided delivery app: a **customer app** (place orders) and a **rider app**
(accept orders), sharing one Firebase project.

```
padala-go/
├── customer/
│   ├── index.html            Sign in
│   ├── signup.html           Create account
│   ├── forgot-password.html  Reset password
│   ├── home.html             Choose Bike Delivery or Padala/Pabili
│   ├── order.html            Map: set pickup/drop-off, notes, fare, place order
│   ├── order-status.html     Track one order, confirm a rider's request
│   └── my-orders.html        List of all your orders
├── rider/
│   ├── index.html            Rider sign in
│   ├── signup.html           Rider sign up
│   └── orders.html           Map + list of pending orders, send request, active delivery
└── shared/
    ├── firebase-config.js    Firebase init + fare/distance logic (EDIT THIS)
    └── styles.css            Shared design system
```

## 1. Set up Firebase (5–10 min)

1. Go to the [Firebase Console](https://console.firebase.google.com) → **Add project**.
2. In your project: **Build → Authentication → Get started → Email/Password → Enable**.
3. **Build → Firestore Database → Create database** (start in production mode).
4. **Project settings → General → Your apps → Add app → Web (`</>`)**. Copy the config object.
5. Paste it into `shared/firebase-config.js`, replacing the placeholder values:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Both apps use the **same** Firebase project. A signed-up user is stored once in
the `users` collection with a `role` field of `"customer"` or `"rider"` — so
one email/password login belongs to one role. If someone wants to be both a
customer and a rider, they'd sign up twice with two different emails.

### Firestore security rules
Paste this into **Firestore → Rules** (tighten further before going live):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /orders/{orderId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.customerId == request.auth.uid;
      allow update: if request.auth != null;

      match /requests/{riderId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == riderId;
        allow update: if request.auth != null;
      }
    }
  }
}
```

### Firestore indexes
The first time you use the app, Firestore will throw an error in the browser
console with a direct link to auto-create any missing composite index (used
for queries like "my orders, newest first" and "pending orders near me").
Just click the link it gives you — takes about a minute to build.

## 2. Set up Google Maps (5 min)

1. Go to [Google Cloud Console](https://console.cloud.google.com/google/maps-apis) →
   enable **Maps JavaScript API** and **Geocoding API**.
2. Create an API key (APIs & Services → Credentials).
3. Replace `YOUR_GOOGLE_MAPS_API_KEY` in two files:
   - `customer/order.html` (bottom of file)
   - `rider/orders.html` (bottom of file)
4. Restrict the key to your domain once you deploy (HTTP referrer restriction).

**Note on distance:** the fare calculator uses straight-line (haversine)
distance between pickup and drop-off, not actual road distance — simplest
to set up with no extra billing. If you want road-accurate distance later,
swap `distanceKmBetween()` in `shared/firebase-config.js` for a call to the
Directions API.

## 3. Fare logic

In `shared/firebase-config.js`:

```js
const BASE_FARE = 40;      // covers the first kilometer
const PER_KM_RATE = 12;    // pesos per km after the first
```

You said "₱12 per succeeding kilometer" — this is interpreted as: the first
km is covered by a base fare (set to ₱40 as a placeholder), then ₱12 for
every km after that. **Adjust `BASE_FARE` to whatever your real base rate is**
— that number wasn't specified, so it's a placeholder you should change.

## 4. How the request/confirm flow works

1. Customer places an order → `orders/{id}` doc created with `status: "pending"`.
2. Riders see all `pending` orders on their map + list.
3. A rider taps **Send Request** → writes `orders/{id}/requests/{riderId}`.
4. The customer's order-status page listens for requests in real time and
   shows a **Confirm** button per rider.
5. Customer taps Confirm → order becomes `status: "confirmed"` with that
   `riderId`, and all other pending requests on that order are auto-declined.
6. Rider marks **Picked Up** (`in_progress`) then **Delivered** (`completed`)
   from their active-delivery card.

## 5. Running it locally

Open `customer/index.html` or `rider/index.html` with VS Code's Live Server
(or any static server — Firebase Auth needs `http://` or `https://`, not
`file://`). Deploy the whole `padala-go/` folder to Vercel same as your other
projects; no build step needed, it's static HTML/JS.
