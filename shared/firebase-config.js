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
const BASE_FARE = 40;      // covers the first kilometer — adjust as needed
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

function requireAuth(onReady){
  auth.onAuthStateChanged(user=>{
    if(!user){
      window.location.href = "index.html";
    } else {
      onReady(user);
    }
  });
}

function fmtPeso(n){
  return "\u20B1" + n.toLocaleString('en-PH');
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

function showToast(message){
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
      clearInterval(timer);
      cleanup();
      declineConfirmedOrder(orderId);
    }
  }, 250);

  function cleanup(){
    clearInterval(timer);
    overlay.remove();
    activeDecisionOrderId = null;
  }

  overlay.querySelector('#padalaAcceptBtn').addEventListener('click', ()=>{
    cleanup();
    db.collection('orders').doc(orderId).update({ riderAccepted: true });
  });

  overlay.querySelector('#padalaDeclineBtn').addEventListener('click', ()=>{
    cleanup();
    declineConfirmedOrder(orderId);
  });
}

function declineConfirmedOrder(orderId){
  const riderId = auth.currentUser ? auth.currentUser.uid : null;
  db.collection('orders').doc(orderId).update({
    status: 'pending',
    riderId: null,
    riderAccepted: null,
    riderDecisionDeadline: null
  });
  if(riderId){
    // Mark this rider's own request as declined so it isn't offered to them again automatically.
    db.collection('orders').doc(orderId).collection('requests').doc(riderId)
      .set({ status: 'declined_by_rider' }, { merge: true });
  }
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
        }
      });
    });
}