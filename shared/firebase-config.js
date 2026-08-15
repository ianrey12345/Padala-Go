/* =========================================================
   Padala Go — Firebase config
   Replace the values below with YOUR Firebase project's config
   (Firebase Console → Project Settings → General → Your apps → SDK config).
   The same config is used by both the customer app and the rider app —
   they are one Firebase project, distinguished by a "role" field on
   each user's document in the `users` collection.
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyD8diVzeo7X7ck26T-Y4ymVfmtuNm9D1mQ",
  authDomain: "rideandgo-c9775.firebaseapp.com",
  projectId: "rideandgo-c9775",
  storageBucket: "rideandgo-c9775.firebasestorage.app",
  messagingSenderId: "659700217264",
  appId: "1:659700217264:web:61451da0e7eee37cfb9275"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ---------------------------------------------------------
   Pricing config — tune these two numbers for your rates.
   "12 pesos per succeeding kilometer" is interpreted as:
   the first kilometer is covered by BASE_FARE, every
   kilometer after that costs PER_KM_RATE.
   --------------------------------------------------------- */
const BASE_FARE = 18.2;      // covers the first kilometer — adjust as needed
const PER_KM_RATE = 12;    // pesos per km after the first

function computeFare(distanceKm){
  if (distanceKm <= 1) return BASE_FARE;
  const extraKm = distanceKm - 1;
  return Math.round(BASE_FARE + extraKm * PER_KM_RATE);
}

/* Haversine straight-line distance in km between two {lat,lng} points.
   Note: this is straight-line distance, not actual road distance.
   For road-accurate distance, swap this out for the Google Directions API. */
function distanceKmBetween(a, b){
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI/180;
  const dLng = (b.lng - a.lng) * Math.PI/180;
  const lat1 = a.lat * Math.PI/180;
  const lat2 = b.lat * Math.PI/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

/* ---------------------------------------------------------
   Real road routing via OSRM's free public routing server —
   no API key required. Shared by the rider's Map tab (live
   tracking) and the rider's order-preview page (ETA to pickup
   before requesting a delivery), so both show a real road path
   and a real road-based ETA instead of a straight-line guess.
   Fair-use note: this is a shared community demo server, not a
   production SLA — keep calls infrequent (see ROUTE_REFRESH_MS
   pattern in the pages that use this).
   --------------------------------------------------------- */
async function fetchRoadRoute(origin, dest){
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  if(!data.routes || !data.routes.length) throw new Error('No route found');
  const route = data.routes[0];
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]); // GeoJSON is [lng,lat]
  return { coords, distanceKm: route.distance / 1000, durationMin: route.duration / 60 };
}

/* Closest point on a single segment to a {lat,lng} point — treats the
   small local area as planar, which is accurate enough at city scale. */
function closestPointOnSegment(p1, p2, p){
  const [y1, x1] = p1, [y2, x2] = p2;
  const px = p.lng, py = p.lat;
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx*dx + dy*dy;
  let t = lenSq === 0 ? 0 : ((px - x1)*dx + (py - y1)*dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return [y1 + t*dy, x1 + t*dx];
}

/* Projects a live position onto a route polyline — lets callers draw a
   genuine "distance covered" overlay instead of a straight-line guess. */
function projectOntoRoute(coords, pos){
  let bestDistKm = Infinity, bestIdx = 0, bestPoint = coords[0];
  for(let i=0; i<coords.length-1; i++){
    const cand = closestPointOnSegment(coords[i], coords[i+1], pos);
    const d = distanceKmBetween({ lat: cand[0], lng: cand[1] }, pos);
    if(d < bestDistKm){ bestDistKm = d; bestIdx = i; bestPoint = cand; }
  }
  return { index: bestIdx, point: bestPoint, offRouteKm: bestDistKm };
}

function routeLengthKm(coords){
  let total = 0;
  for(let i=0; i<coords.length-1; i++){
    total += distanceKmBetween({ lat: coords[i][0], lng: coords[i][1] }, { lat: coords[i+1][0], lng: coords[i+1][1] });
  }
  return total;
}

/* Formats a duration given in seconds as "Xm Ys" (or "Xh Ym" once past an
   hour). Used both for the live "time on this delivery" ticker (fed a
   growing seconds count) and for the final recorded delivery duration
   shown once an order is completed (fed a fixed seconds count). */
function formatDuration(totalSecs){
  const secs = Math.max(0, Math.round(totalSecs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if(h > 0) return `${h}h ${m.toString().padStart(2,'0')}m`;
  return `${m}m ${s.toString().padStart(2,'0')}s`;
}

/* Formats the time elapsed since `startMs` — shared by the rider's Map
   tab and Current tab for the running "time on this delivery" timer
   shown after pickup, in place of the ETA-to-destination countdown used
   before pickup. */
function formatElapsedSince(startMs){
  const secs = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  return formatDuration(secs);
}

function requireAuth(onReady){
  auth.onAuthStateChanged(async user=>{
    if(!user){
      window.location.href = "index.html";
      return;
    }
    // Reload before checking emailVerified — the flag on the cached user
    // object can be stale if verification happened in another tab/session
    // since this one last signed in. This is what makes "closed the app
    // and came back later while still unverified" correctly re-check
    // every time, not just right after signup.
    await user.reload().catch(()=>{});
    if(!user.emailVerified){
      window.location.href = "verify-email.html";
      return;
    }
    onReady(user);
  });
}

function fmtPeso(n){
  return "\u20B1" + n.toLocaleString('en-PH');
}

// Total the customer actually pays / rider actually collects in cash —
// base fare plus whatever the customer added on top (see addedAmount,
// which the rider keeps 100% of; commission is calculated on o.fare
// alone, never on the added portion — see statistics.html).
function totalFare(o){
  return (o.fare || 0) + (o.addedAmount || 0);
}

// Small "↑ +₱10" pill shown next to a fare-tag whenever the customer has
// added extra on top of the base fare. Returns '' (nothing rendered)
// when there's no added amount, so it's safe to splice into any card
// template unconditionally.
function addedBadgeHtml(o){
  if(!o.addedAmount) return '';
  return `<span class="added-badge">\u2191 +${fmtPeso(o.addedAmount)}</span>`;
}

/* ---------------------------------------------------------
   Rider wallet — a separate platform balance from the cash
   fare the rider collects in person. The rider tops this up
   (Refill Account), and the platform automatically deducts a
   10% commission from it every time a delivery is completed.
   Every change is logged to users/{riderId}/walletTransactions
   so the Statistics page can show a full breakdown.
   --------------------------------------------------------- */
const COMMISSION_RATE = 0.12;       // 12% of the fare, deducted from wallet on completion
const LOW_BALANCE_THRESHOLD = 50;   // header shows a low-balance warning below this — also the minimum wallet balance to receive Auto Mode orders

/* ---------------------------------------------------------
   Auto Mode — every municipality across Panay's four provinces,
   grouped for the filter checklist. An empty selection on a rider's
   profile (autoModeMunicipalities: []) means "all of them", not "none".
   --------------------------------------------------------- */
const PANAY_MUNICIPALITIES = {
  "Iloilo": ["Iloilo City","Passi City","Ajuy","Alimodian","Anilao","Badiangan","Balasan","Banate","Barotac Nuevo","Barotac Viejo","Batad","Bingawan","Cabatuan","Calinog","Carles","Concepcion","Dingle","Dueñas","Dumangas","Estancia","Guimbal","Igbaras","Janiuay","Lambunao","Leganes","Lemery","Leon","Maasin","Miagao","Mina","New Lucena","Oton","Pavia","Pototan","San Dionisio","San Enrique","San Joaquin","San Miguel","San Rafael","Santa Barbara","Sara","Tigbauan","Tubungan","Zarraga"],
  "Aklan": ["Altavas","Balete","Banga","Batan","Buruanga","Ibajay","Kalibo","Lezo","Libacao","Madalag","Makato","Malay","Malinao","Nabas","New Washington","Numancia","Tangalan"],
  "Capiz": ["Roxas City","Cuartero","Dao","Dumalag","Dumarao","Ivisan","Jamindan","Maayon","Mambusao","Panay","Panitan","Pilar","Pontevedra","President Roxas","Sapian","Sigma","Tapaz"],
  "Antique": ["Anini-y","Barbaza","Belison","Bugasong","Caluya","Culasi","Hamtic","Laua-an","Libertad","Pandan","Patnongon","San Jose de Buenavista","San Remigio","Sebaste","Sibalom","Tibiao","Tobias Fornier","Valderrama"]
};

// True if this order's pickup falls in one of the rider's selected
// municipalities — or always true if they haven't restricted to any
// (empty array = all municipalities). Checks the geocoded municipality
// field first, falling back to a substring check against the full
// address, since free reverse-geocoding data is occasionally missing
// or oddly categorized for a given point.
function orderMatchesMunicipalities(order, selectedMunicipalities){
  if(!selectedMunicipalities || selectedMunicipalities.length === 0) return true;
  const geoMuni = (order.pickup && order.pickup.municipality || '').toLowerCase();
  const fullAddress = (order.pickup && order.pickup.address || '').toLowerCase();
  return selectedMunicipalities.some(m=>{
    const ml = m.toLowerCase();
    return geoMuni === ml || fullAddress.includes(ml);
  });
}

// Auto Mode's matching engine — client-side only (see the Auto Mode
// settings UI on orders.html for the full explanation of why). Runs on
// every rider page alongside the other background watchers below.
// Whenever a pending, unassigned order changes, every rider currently
// running this listener with Auto Mode on independently re-checks
// eligibility and, if they're the nearest eligible candidate who hasn't
// already been offered this specific order, attempts to claim it via a
// transaction. Losing that race is a normal, expected outcome, not an
// error — whoever's transaction actually lands first wins; everyone
// else's claim attempt is simply rejected because the order is no
// longer pending by the time theirs runs.
let autoModeUnsub = null;
function watchAutoModeMatching(riderId){
  if(autoModeUnsub) autoModeUnsub();
  autoModeUnsub = db.collection('orders')
    .where('status','==','pending')
    .where('riderId','==', null)
    .onSnapshot(snap=>{
      snap.docChanges().forEach(change=>{
        if(change.type === 'added' || change.type === 'modified'){
          tryAutoClaim(riderId, change.doc.id, change.doc.data());
        }
      });
    }, ()=>{ /* ignore transient listener errors — next snapshot retries */ });
}

async function tryAutoClaim(riderId, orderId, order){
  try{
    const meDoc = await db.collection('users').doc(riderId).get();
    if(!meDoc.exists) return;
    const me = meDoc.data();
    if(!me.autoModeOn) return;
    if(me.verificationStatus !== 'approved') return;
    if((me.walletBalance || 0) < LOW_BALANCE_THRESHOLD) return;
    if((order.autoOfferedRiderIds || []).includes(riderId)) return; // already offered & declined/timed out
    if(me.autoModeMinFare && order.fare < me.autoModeMinFare) return;
    if(!orderMatchesMunicipalities(order, me.autoModeMunicipalities)) return;
    if(!me.liveLocation) return; // no known position to rank distance from

    // 1.3km eligibility radius from the pickup point.
    const myDistanceKm = distanceKmBetween(me.liveLocation, order.pickup);
    if(myDistanceKm > 1.3) return;

    // Am I the nearest currently-eligible candidate? Fetch every other
    // auto-mode rider and compare — this is the piece that fundamentally
    // can't be enforced server-side (see the rules comment on the
    // matching Firestore rule), so it's trusted client computation.
    const candidatesSnap = await db.collection('users')
      .where('role','==','rider')
      .where('verificationStatus','==','approved')
      .where('autoModeOn','==', true)
      .get();

    let iAmNearest = true;
    const twoMinutesAgo = Date.now() - 120000;
    candidatesSnap.forEach(doc=>{
      if(doc.id === riderId) return;
      const c = doc.data();
      if((c.walletBalance || 0) < LOW_BALANCE_THRESHOLD) return;
      if((order.autoOfferedRiderIds || []).includes(doc.id)) return;
      if(c.autoModeMinFare && order.fare < c.autoModeMinFare) return;
      if(!orderMatchesMunicipalities(order, c.autoModeMunicipalities)) return;
      if(!c.liveLocation) return;
      if(!c.liveLocationUpdatedAt || c.liveLocationUpdatedAt.toMillis() < twoMinutesAgo) return; // stale/offline
      const theirDistanceKm = distanceKmBetween(c.liveLocation, order.pickup);
      if(theirDistanceKm > 1.3) return;
      if(theirDistanceKm < myDistanceKm) iAmNearest = false;
    });
    if(!iAmNearest) return;

    // Claim it — same shape as a customer confirming a rider manually,
    // so the existing accept/decline countdown (watchForRiderConfirmations
    // + showDecisionModal) picks it up with no changes needed there.
    const orderRef = db.collection('orders').doc(orderId);
    await db.runTransaction(async (t)=>{
      const fresh = await t.get(orderRef);
      if(!fresh.exists) return;
      const f = fresh.data();
      if(f.status !== 'pending' || f.riderId) return; // someone else won the race, or a customer already confirmed a manual request
      t.update(orderRef, {
        status: 'confirmed',
        riderId: riderId,
        riderAccepted: null,
        riderDecisionDeadline: firebase.firestore.Timestamp.fromMillis(Date.now() + 15000),
        autoOfferedRiderIds: firebase.firestore.FieldValue.arrayUnion(riderId)
      });
    });
  } catch(err){ /* a lost race or a transient error — next snapshot will try again */ }
}
const MIN_BALANCE_TO_TAKE_ORDERS = 30; // riders can't request/accept a new delivery below this

/* Marks an order completed AND deducts the 12% commission from the
   rider's wallet balance, atomically, so the two can never drift apart.
   Also writes a walletTransactions record for the Statistics page.
   deliveryDurationSecs (optional) is how long the order sat in_progress —
   pickup ("Lets Go!") to this exact moment — so it can be shown on the
   completed order everywhere (rider's Current tab, customer's My Orders
   and Order Status pages) instead of only living as a live ticker that
   disappears once the delivery is done. */
async function completeOrderWithCommission(orderId, riderId, fare, deliveryDurationSecs, addedAmount){
  const commission = Math.round(fare * COMMISSION_RATE);
  const orderRef = db.collection('orders').doc(orderId);
  const riderRef = db.collection('users').doc(riderId);
  const txnRef = riderRef.collection('walletTransactions').doc();

  const orderUpdate = {
    status: 'completed',
    completedAt: firebase.firestore.FieldValue.serverTimestamp(),
    commissionDeducted: commission
  };
  if(typeof deliveryDurationSecs === 'number' && !isNaN(deliveryDurationSecs)){
    orderUpdate.deliveryDurationSecs = Math.max(0, Math.round(deliveryDurationSecs));
  }

  await db.runTransaction(async (t)=>{
    const riderSnap = await t.get(riderRef);
    const currentBalance = (riderSnap.exists && riderSnap.data().walletBalance) || 0;
    const newBalance = currentBalance - commission;

    t.update(orderRef, orderUpdate);
    t.update(riderRef, { walletBalance: newBalance });
    // fare + addedAmount together are what statistics.html now sums for
    // "Earned" — captured here so that total survives even if an admin
    // later deletes the order document itself (see order-history.html).
    t.set(txnRef, {
      type: 'commission',
      amount: -commission,
      fare: fare,
      addedAmount: addedAmount || 0,
      orderId: orderId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  return commission;
}

/* Rider submits a top-up amount plus their GCash reference number and
   the sender name on the GCash account they paid from (which may not
   match their rider account name, e.g. a family member's GCash) — this
   does NOT credit the wallet yet. It creates a pending request that an
   admin must check against their own GCash transaction history before
   approving. */
async function submitRefillRequest(riderId, riderName, amount, gcashRef, gcashSenderName){
  return db.collection('refillRequests').add({
    riderId, riderName, amount,
    gcashRef, gcashSenderName,
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/* Rider can cancel their own request while it's still pending. */
async function cancelRefillRequest(requestId){
  return db.collection('refillRequests').doc(requestId).delete();
}

/* Admin approves a pending request: credits the rider's wallet and logs
   the transaction, atomically, so a request can never be double-approved
   or approved without actually crediting the balance. */
async function approveRefillRequest(requestId, adminUid){
  const reqRef = db.collection('refillRequests').doc(requestId);

  await db.runTransaction(async (t)=>{
    const reqSnap = await t.get(reqRef);
    if(!reqSnap.exists) throw new Error('Request not found.');
    const req = reqSnap.data();
    if(req.status !== 'pending') throw new Error('This request was already reviewed.');

    const riderRef = db.collection('users').doc(req.riderId);
    const riderSnap = await t.get(riderRef);
    const currentBalance = (riderSnap.exists && riderSnap.data().walletBalance) || 0;
    const txnRef = riderRef.collection('walletTransactions').doc();

    t.update(reqRef, {
      status: 'approved',
      reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
      reviewedBy: adminUid
    });
    t.update(riderRef, { walletBalance: currentBalance + req.amount });
    t.set(txnRef, {
      type: 'refill',
      amount: req.amount,
      requestId: requestId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
}

/* Admin rejects a pending request — no wallet change, just marks it reviewed. */
async function rejectRefillRequest(requestId, adminUid){
  return db.collection('refillRequests').doc(requestId).update({
    status: 'rejected',
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedBy: adminUid
  });
}

/* Gate for admin-only pages. Redirects non-admins back to admin sign-in. */
function requireAdminAuth(onReady){
  auth.onAuthStateChanged(async user=>{
    if(!user){ window.location.href = "index.html"; return; }
    const doc = await db.collection('users').doc(user.uid).get();
    if(!doc.exists || doc.data().role !== 'admin'){
      await auth.signOut();
      window.location.href = "index.html";
      return;
    }
    onReady(user, doc.data());
  });
}

/* Live-updates a header element with the rider's current wallet balance.
   Call once per page; returns the Firestore unsubscribe function. */
function watchWalletBalance(elId, riderId, onUpdate){
  return db.collection('users').doc(riderId).onSnapshot(doc=>{
    const bal = (doc.exists && doc.data().walletBalance) || 0;
    const el = document.getElementById(elId);
    if(el) el.textContent = fmtPeso(bal);
    if(onUpdate) onUpdate(bal);
  });
}

/* Gate for any action that lets a rider take on a new delivery (requesting
   a pending order, accepting a confirmed one, etc). A balance below the
   minimum means the rider needs to refill before taking on more — keeps
   them from running their wallet down to (or past) zero mid-delivery.
   Returns { allowed, balance }. */
async function checkRiderCanTakeOrders(riderId){
  const riderSnap = await db.collection('users').doc(riderId).get();
  const balance = (riderSnap.exists && riderSnap.data().walletBalance) || 0;
  return { allowed: balance >= MIN_BALANCE_TO_TAKE_ORDERS, balance };
}

function timeAgo(ts){
  if(!ts) return "";
  const secs = Math.floor((Date.now() - ts.toDate().getTime())/1000);
  if(secs < 60) return "just now";
  if(secs < 3600) return Math.floor(secs/60)+"m ago";
  if(secs < 86400) return Math.floor(secs/3600)+"h ago";
  return Math.floor(secs/86400)+"d ago";
}

/* ---------------------------------------------------------
   Rider alert helpers — synthesized ringtone (no external
   sound file needed), an on-screen toast banner, and an
   optional browser notification.
   --------------------------------------------------------- */
function playRingtone(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ring = (freq, start, dur)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    // Two short "ring-ring" bursts
    ring(880, 0,    0.15);
    ring(880, 0.2,  0.15);
    ring(880, 0.55, 0.15);
    ring(880, 0.75, 0.15);
  } catch(e){ /* audio not available — ignore */ }
}

const toastQueue = [];
let toastShowing = false;

function showToast(message){
  toastQueue.push(message);
  processToastQueue();
}

function processToastQueue(){
  if(toastShowing || toastQueue.length === 0) return;
  toastShowing = true;
  const message = toastQueue.shift();

  let toast = document.getElementById('padalaToast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'padalaToast';
    toast.style.cssText = `
      position:fixed; top:14px; left:50%; transform:translateX(-50%) translateY(-20px);
      max-width:440px; width:calc(100% - 32px);
      background:var(--teal-dark, #082F2B); color:#fff; padding:14px 18px; border-radius:14px;
      box-shadow:0 8px 24px rgba(0,0,0,0.25); font-family:'Inter',sans-serif; font-size:13.5px;
      font-weight:600; z-index:9999; opacity:0; transition:opacity .25s ease, transform .25s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  requestAnimationFrame(()=>{
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(()=>{
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
    // Give the fade-out transition time to finish before showing the next
    // queued toast, so back-to-back messages don't look like one flicker.
    setTimeout(()=>{
      toastShowing = false;
      processToastQueue();
    }, 250);
  }, 5000);
}

function requestNotificationPermission(){
  if('Notification' in window && Notification.permission === 'default'){
    Notification.requestPermission();
  }
}

function showBrowserNotification(title, body){
  if('Notification' in window && Notification.permission === 'granted'){
    try{ new Notification(title, { body }); } catch(e){ /* ignore */ }
  }
}

/* ---------------------------------------------------------
   Rider "request accepted" alert + 15-second Accept/Decline
   countdown. The countdown deadline is stored on the order
   itself (riderDecisionDeadline), set by the customer app at
   the moment of confirming — so the countdown stays accurate
   even if the rider's page reloads mid-countdown.
   --------------------------------------------------------- */
let activeDecisionOrderId = null;
let activeDecisionTimer = null;

function showDecisionModal(orderId, order){
  if(activeDecisionOrderId === orderId) return; // already showing for this order
  activeDecisionOrderId = orderId;

  const deadlineMs = order.riderDecisionDeadline
    ? order.riderDecisionDeadline.toMillis()
    : Date.now() + 15000;

  const remainingNow = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000));
  if(remainingNow <= 0){
    // Timed out while the rider was away — auto-decline quietly.
    declineConfirmedOrder(orderId);
    activeDecisionOrderId = null;
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'padalaDecisionModal';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(8,47,43,0.75); z-index:10000;
    display:flex; align-items:center; justify-content:center; padding:20px;
  `;
  overlay.innerHTML = `
    <div style="background:#fff; border-radius:18px; padding:26px 24px; max-width:360px; width:100%; text-align:center; font-family:'Inter',sans-serif;">
      <div style="font-size:34px; margin-bottom:6px;">🎉</div>
      <div style="font-weight:700; font-size:17px; color:#082F2B; margin-bottom:4px;">Request Accepted!</div>
      <div style="font-size:13.5px; color:#586866; margin-bottom:16px; line-height:1.4;">
        📍 ${order.pickup.address}<br>🎯 ${order.dropoff.address}
      </div>
      <div style="font-family:'Space Mono',monospace; font-size:36px; font-weight:700; color:#0C4A45; margin-bottom:18px;" id="padalaCountdownNum">${remainingNow}</div>
      <div style="display:flex; gap:10px;">
        <button id="padalaDeclineBtn" style="flex:1; padding:13px; border-radius:12px; border:1.5px solid #D64545; background:#fff; color:#D64545; font-weight:600; font-size:14px;">Decline</button>
        <button id="padalaAcceptBtn" style="flex:1; padding:13px; border-radius:12px; border:none; background:#F0A93A; color:#082F2B; font-weight:700; font-size:14px;">Accept</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const numEl = overlay.querySelector('#padalaCountdownNum');
  const timer = setInterval(()=>{
    const remaining = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000));
    numEl.textContent = remaining;
    if(remaining <= 0){
      cleanup();
      declineConfirmedOrder(orderId);
    }
  }, 250);
  activeDecisionTimer = timer;

  function cleanup(){
    clearInterval(timer);
    if(activeDecisionTimer === timer) activeDecisionTimer = null;
    overlay.remove();
    activeDecisionOrderId = null;
  }

  overlay.querySelector('#padalaAcceptBtn').addEventListener('click', async ()=>{
    const acceptBtn = overlay.querySelector('#padalaAcceptBtn');
    const declineBtn = overlay.querySelector('#padalaDeclineBtn');
    acceptBtn.disabled = true;
    declineBtn.disabled = true;
    acceptBtn.textContent = 'Checking wallet…';

    // A balance below the minimum means the rider needs to refill before
    // taking on another delivery — block them from accepting, rather than
    // letting them start a trip they can't cover commission on.
    const riderId = auth.currentUser ? auth.currentUser.uid : null;
    let gate = { allowed: true, balance: 0 };
    try{
      gate = await checkRiderCanTakeOrders(riderId);
    } catch(e){ /* if this fails, fall through and allow — don't hard-block on a network blip */ }

    if(!gate.allowed){
      cleanup();
      showToast(`⚠️ Your wallet balance is ${fmtPeso(gate.balance)} — refill to at least ${fmtPeso(MIN_BALANCE_TO_TAKE_ORDERS)} before accepting new deliveries.`);
      declineConfirmedOrder(orderId);
      return;
    }

    cleanup();
    db.collection('orders').doc(orderId).update({ riderAccepted: true }).then(()=>{
      // Send the rider straight into the Map tab so their live location
      // starts broadcasting immediately — waiting for them to navigate
      // there manually is exactly why the customer's map was stuck on
      // "Waiting for your rider's location…". The Map tab finds this
      // order itself (it queries for the rider's own active delivery),
      // so no id param is needed.
      window.location.href = 'map.html';
    });
  });

  overlay.querySelector('#padalaDeclineBtn').addEventListener('click', ()=>{
    cleanup();
    declineConfirmedOrder(orderId);
  });
}

async function declineConfirmedOrder(orderId){
  const riderId = auth.currentUser ? auth.currentUser.uid : null;
  const orderRef = db.collection('orders').doc(orderId);

  // Guard against a stale countdown (e.g. a timer left running on another
  // open tab/page) firing AFTER the rider already accepted or declined
  // this same order elsewhere. Only revert to pending if the decision is
  // still genuinely pending on the server.
  try{
    await db.runTransaction(async (t)=>{
      const snap = await t.get(orderRef);
      if(!snap.exists) return;
      const o = snap.data();
      if(o.riderAccepted !== null && o.riderAccepted !== undefined) return; // already resolved — do nothing
      t.update(orderRef, {
        status: 'pending',
        riderId: null,
        riderAccepted: null,
        riderDecisionDeadline: null,
        // Recorded regardless of whether this was a manual confirm or an
        // Auto Mode claim — harmless either way, and it's what lets Auto
        // Mode's fallback chain skip straight to the next-nearest rider
        // instead of re-offering this same order to someone who just
        // turned it down.
        autoOfferedRiderIds: firebase.firestore.FieldValue.arrayUnion(riderId)
      });
    });
  } catch(e){ /* if this fails, leave the order as-is rather than risk corrupting it */ }

  if(riderId){
    // Mark this rider's own request as declined so it isn't offered to them again automatically.
    db.collection('orders').doc(orderId).collection('requests').doc(riderId)
      .set({ status: 'declined_by_rider' }, { merge: true });
  }
}

function dismissDecisionModal(orderId){
  if(activeDecisionOrderId !== orderId) return;
  if(activeDecisionTimer){
    clearInterval(activeDecisionTimer);
    activeDecisionTimer = null;
  }
  const existing = document.getElementById('padalaDecisionModal');
  if(existing) existing.remove();
  activeDecisionOrderId = null;
}

/* ---------------------------------------------------------
   Rider "order cancelled by customer" alert. Same popup
   treatment as the Accept/Decline countdown above, but this
   one is just an acknowledgement — there's nothing left for
   the rider to decide once the customer has already cancelled.
   --------------------------------------------------------- */
function showCancelledModal(orderId, order){
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(8,47,43,0.75); z-index:10000;
    display:flex; align-items:center; justify-content:center; padding:20px;
  `;
  overlay.innerHTML = `
    <div style="background:#fff; border-radius:18px; padding:26px 24px; max-width:360px; width:100%; text-align:center; font-family:'Inter',sans-serif;">
      <div style="font-size:34px; margin-bottom:6px;">🚫</div>
      <div style="font-weight:700; font-size:17px; color:#082F2B; margin-bottom:4px;">Order Cancelled</div>
      <div style="font-size:13.5px; color:#586866; margin-bottom:18px; line-height:1.4;">
        The customer cancelled this delivery:<br>📍 ${order.pickup.address}<br>🎯 ${order.dropoff.address}
      </div>
      <button id="padalaCancelAckBtn" style="width:100%; padding:13px; border-radius:12px; border:none; background:#0C4A45; color:#fff; font-weight:700; font-size:14px;">OK, Got It</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#padalaCancelAckBtn').addEventListener('click', ()=> overlay.remove());
}

/* Call once, after confirming the signed-in user is a rider, from any
   rider page — same as watchForRiderConfirmations. Fires a sound + toast
   + browser notification + popup the moment a delivery the rider was on
   gets cancelled by the customer. Only fires for cancellations the
   customer made (cancelledBy: 'customer') — a rider cancelling their own
   order shouldn't pop up a notice to themselves. */
function watchForOrderCancellations(riderId){
  requestNotificationPermission();
  db.collection('orders')
    .where('riderId','==', riderId)
    .where('status','==','cancelled')
    .onSnapshot(snap=>{
      snap.docChanges().forEach(change=>{
        if(change.type !== 'added') return; // the moment status flips into 'cancelled', this query sees it as newly-added
        const o = change.doc.data();
        if(o.cancelledBy !== 'customer') return;

        const seenKey = 'padalaGoSeenCancel_' + change.doc.id;
        if(localStorage.getItem(seenKey)) return;
        localStorage.setItem(seenKey, '1');

        dismissDecisionModal(change.doc.id); // in case the 5s accept/decline popup was still showing
        playRingtone();
        showToast('🚫 A customer cancelled their delivery.');
        showBrowserNotification('Order Cancelled', 'A customer cancelled a delivery you were assigned to.');
        showCancelledModal(change.doc.id, o);
      });
    });
}

/* Call once, after confirming the signed-in user is a rider, from any
   rider page. Fires a sound + toast + browser notification the moment
   one of the rider's requests gets confirmed, and shows the 15-second
   Accept/Decline countdown modal while a decision is still pending. */
function watchForRiderConfirmations(riderId){
  requestNotificationPermission();
  db.collection('orders')
    .where('riderId','==', riderId)
    .where('status','==','confirmed')
    .onSnapshot(snap=>{
      snap.docChanges().forEach(change=>{
        if(change.type === 'added'){
          const seenKey = 'padalaGoSeenConfirm_' + change.doc.id;
          if(!localStorage.getItem(seenKey)){
            localStorage.setItem(seenKey, '1');
            playRingtone();
            showToast('🎉 Your delivery request was accepted! Accept it within 15 seconds.');
            showBrowserNotification('Delivery Confirmed!', 'A customer accepted your request — open the app to accept or decline.');
          }
        }
      });

      snap.forEach(doc=>{
        const o = doc.data();
        if(o.riderAccepted === null || o.riderAccepted === undefined){
          showDecisionModal(doc.id, o);
        } else {
          // Already accepted (or declined) — most likely from another tab/
          // page, since every rider page runs this same listener. Close any
          // countdown modal still open on THIS page for it, and make sure
          // its interval is actually stopped (dismissDecisionModal handles
          // that) so it can't fire a stale decline after the fact.
          dismissDecisionModal(doc.id);
        }
      });
    });
}

/* ---------------------------------------------------------
   Rider "new message from customer" alerts. Same call pattern
   as watchForRiderConfirmations / watchForOrderCancellations —
   call once, from any rider page, after confirming the user is
   a rider.

   How "unread" is tracked: a per-order "last read" timestamp
   lives in localStorage, updated whenever the rider actually
   opens that order's chat thread (see markChatRead(), wired up
   in rider/chat-thread.html). Comparing the latest message's
   server timestamp against that value means:
     - A message that arrives while the rider is off the app
       still triggers a notification the next time ANY rider
       page loads — it isn't silently treated as "already seen"
       just because it existed before this listener attached.
     - Re-opening a page doesn't re-notify for messages already
       read.
     - If the rider currently has that exact thread open
       (window.padalaGoOpenChatOrderId), we mark it read instead
       of buzzing them for a conversation they're already in.
   --------------------------------------------------------- */
function chatLastReadKey(orderId){ return 'padalaGoChatLastRead_' + orderId; }

function markChatRead(orderId){
  localStorage.setItem(chatLastReadKey(orderId), Date.now().toString());
}

function getChatLastRead(orderId){
  const v = localStorage.getItem(chatLastReadKey(orderId));
  return v ? parseInt(v, 10) : 0;
}

const activeMessageListeners = new Map(); // orderId -> unsubscribe function

function watchForNewMessages(riderId, onUnreadChange){
  requestNotificationPermission();
  const unreadOrderIds = new Set();

  function reportUnread(){
    if(onUnreadChange) onUnreadChange(unreadOrderIds.size);
  }

  db.collection('orders')
    .where('riderId','==', riderId)
    .where('status','in', ['confirmed','in_progress','completed'])
    .onSnapshot(snap=>{
      const currentOrderIds = new Set();
      snap.forEach(doc=>{
        currentOrderIds.add(doc.id);
        if(!activeMessageListeners.has(doc.id)){
          activeMessageListeners.set(
            doc.id,
            attachMessageListener(doc.id, riderId, unreadOrderIds, reportUnread)
          );
        }
      });
      // Stop listening to orders that dropped out of this query
      // (e.g. cancelled) so listeners don't leak.
      for(const orderId of Array.from(activeMessageListeners.keys())){
        if(!currentOrderIds.has(orderId)){
          activeMessageListeners.get(orderId)();
          activeMessageListeners.delete(orderId);
          unreadOrderIds.delete(orderId);
        }
      }
      reportUnread();
    }, err=>{
      // Without this, a missing composite index (riderId == + status in [...])
      // fails completely silently — the listener never fires again, and the
      // rider just sees stale/incomplete chat notifications with nothing in
      // the UI to explain why. Log it loudly and check the console for a
      // Firestore "create index" link.
      console.error('watchForNewMessages: Firestore query failed — check for a missing composite index link above.', err);
    });
}

function attachMessageListener(orderId, riderId, unreadOrderIds, reportUnread){
  // Firestore delivers the current latest message immediately when this
  // listener first attaches (which happens on every fresh page load, since
  // activeMessageListeners is just an in-memory Map that resets on
  // navigation). To avoid replaying an OLD message as a brand-new alert
  // every time a rider page loads, we track the ID of whichever message
  // was on top the first time this listener sees data, as a baseline —
  // and only alert once the top message's ID actually changes to
  // something different from that baseline. This avoids comparing
  // timestamps across client/server clocks (which can silently misfire
  // if the device's clock is off), and still correctly alerts for a
  // message sent right as the page finishes loading, since a genuinely
  // new message always gets a new document ID.
  let baselineMsgId = undefined; // undefined = not established yet

  return db.collection('orders').doc(orderId).collection('messages')
    .orderBy('createdAt','desc')
    .limit(1)
    .onSnapshot(snap=>{
      if(snap.empty) return;
      const topDoc = snap.docs[0];
      const m = topDoc.data();
      if(!m.createdAt) return; // still waiting on the server timestamp to resolve

      if(baselineMsgId === undefined){
        // First delivery from this listener — record it as the baseline,
        // but only alert-worthy logic below applies to actual CHANGES.
        baselineMsgId = topDoc.id;
      }
      const isNewSinceListening = topDoc.id !== baselineMsgId;
      baselineMsgId = topDoc.id;

      if(m.senderId === riderId) return; // the rider's own message — ignore

      const lastRead = getChatLastRead(orderId);
      const isUnread = m.createdAt.toMillis() > lastRead;

      if(!isUnread){
        unreadOrderIds.delete(orderId);
        reportUnread();
        return;
      }

      if(window.padalaGoOpenChatOrderId === orderId){
        // Rider already has this exact thread open — count as read,
        // don't interrupt them with a notification for it.
        markChatRead(orderId);
        unreadOrderIds.delete(orderId);
        reportUnread();
        return;
      }

      // Still reflect it in the unread badge count regardless of when it
      // was sent — a genuinely unread message should still show as unread.
      // It's only the sound/toast/browser-notification "alert" that's
      // conditional on this being a message that arrived after this
      // listener attached.
      unreadOrderIds.add(orderId);
      reportUnread();

      if(!isNewSinceListening) return; // pre-existing unread message from before this page load — don't alert

      playRingtone();
      showToast('💬 You have a message from the customer');
      showBrowserNotification('New Message', 'You have a message from the customer.');
    });
}

/* ---------------------------------------------------------
   Customer alert helpers — sound + toast + browser notification,
   same treatment as the rider-side alerts above. Call each of
   these once, from any customer page, right after requireAuth
   confirms the signed-in user (see home.html / my-orders.html /
   chat.html / order-status.html / order.html for wiring).

   Each fires exactly once per event thanks to a localStorage
   "seen" key, so reloading a page or having multiple customer
   tabs open doesn't replay the same alert.
   --------------------------------------------------------- */

/* 1) A rider sends a request on one of the customer's still-pending
   orders. Requests live in a subcollection per order, so this keeps
   a listener attached per pending order (same attach/detach pattern
   as watchForNewMessages) and alerts on each newly-added pending
   request. */
const activeCustomerRequestListeners = new Map(); // orderId -> unsubscribe

function watchForNewRequests(customerId){
  requestNotificationPermission();
  db.collection('orders')
    .where('customerId','==', customerId)
    .where('status','==','pending')
    .onSnapshot(snap=>{
      const currentOrderIds = new Set();
      snap.forEach(doc=>{
        currentOrderIds.add(doc.id);
        if(!activeCustomerRequestListeners.has(doc.id)){
          activeCustomerRequestListeners.set(doc.id, attachRequestListener(doc.id));
        }
      });
      // Order left the "pending" query (confirmed/cancelled/etc.) —
      // stop listening to its requests so listeners don't leak.
      for(const orderId of Array.from(activeCustomerRequestListeners.keys())){
        if(!currentOrderIds.has(orderId)){
          activeCustomerRequestListeners.get(orderId)();
          activeCustomerRequestListeners.delete(orderId);
        }
      }
    }, err=>{
      console.error('watchForNewRequests: Firestore query failed.', err);
    });
}

function attachRequestListener(orderId){
  return db.collection('orders').doc(orderId).collection('requests')
    .where('status','==','pending')
    .onSnapshot(snap=>{
      snap.docChanges().forEach(change=>{
        if(change.type !== 'added') return;
        const seenKey = 'padalaGoSeenRequest_' + change.doc.id;
        if(localStorage.getItem(seenKey)) return;
        localStorage.setItem(seenKey, '1');

        const r = change.doc.data();
        const riderName = r.riderName || 'A rider';
        playRingtone();
        showToast(`🏍️ ${riderName} wants to deliver your order`);
        showBrowserNotification('New Delivery Request', `${riderName} requested to deliver your order.`);
      });
    });
}

/* 2) The confirmed rider marks themselves as arrived at the pickup
   point (arrivedAtPickup flips to true on the order doc). */
function watchForRiderArrival(customerId){
  requestNotificationPermission();
  db.collection('orders')
    .where('customerId','==', customerId)
    .where('status','==','confirmed')
    .where('arrivedAtPickup','==', true)
    .onSnapshot(snap=>{
      snap.docChanges().forEach(change=>{
        if(change.type !== 'added') return; // the moment arrivedAtPickup flips true, this query sees it as newly-added
        const seenKey = 'padalaGoSeenArrival_' + change.doc.id;
        if(localStorage.getItem(seenKey)) return;
        localStorage.setItem(seenKey, '1');

        playRingtone();
        showToast('🛵 Your rider has arrived at the pickup point');
        showBrowserNotification('Rider Arrived', 'Your rider has arrived at the pickup point.');
      });
    }, err=>{
      console.error('watchForRiderArrival: Firestore query failed.', err);
    });
}

/* 3) The order is marked completed (rider finishes the delivery). */
function watchForOrderCompletion(customerId){
  requestNotificationPermission();
  db.collection('orders')
    .where('customerId','==', customerId)
    .where('status','==','completed')
    .onSnapshot(snap=>{
      snap.docChanges().forEach(change=>{
        if(change.type !== 'added') return;
        const seenKey = 'padalaGoSeenComplete_' + change.doc.id;
        if(localStorage.getItem(seenKey)) return;
        localStorage.setItem(seenKey, '1');

        playRingtone();
        showToast('✅ Your delivery has been completed');
        showBrowserNotification('Delivery Completed', 'Your order has been marked as completed.');
      });
    }, err=>{
      console.error('watchForOrderCompletion: Firestore query failed.', err);
    });
}