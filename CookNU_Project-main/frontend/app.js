import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, where, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";



const firebaseConfig = {
  apiKey: "AIzaSyCmiVV-bI93EdwMznoPgIxRs8gwnJNg7QM",
  authDomain: "cooknu-741d7.firebaseapp.com",
  projectId: "cooknu-741d7",
  storageBucket: "cooknu-741d7.firebasestorage.app",
  messagingSenderId: "82331744232",
  appId: "1:82331744232:web:aa2b48b020c2deba8d165d"
};


const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function uploadImageIfNeeded(base64DataUrl, path) {
  if (!base64DataUrl || !base64DataUrl.startsWith('data:')) return base64DataUrl || '';
  return await compressImage(base64DataUrl, 600);
}

function compressImage(base64, maxWidthPx = 600) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxWidthPx) { h = Math.round(h * maxWidthPx / w); w = maxWidthPx; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      // Start at quality 0.6, then shrink further if still too large
      let quality = 0.6;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > 200000 && quality > 0.2) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.src = base64;
  });
}

// STATE

let currentUser      = null;  
let selectedCats     = [];
let searchQuery      = '';
let profileTab       = 'recipes';
let currentRecipe    = null;
let editingRecipeId = null;
let previousPage     = 'home';
let recipesUnsubscribe = null;


// AUTH STATE LISTENER

onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    const userDoc = await getUserDoc(firebaseUser.uid);
    currentUser = {
      id:     firebaseUser.uid,
      email:  firebaseUser.email,
      name:   userDoc?.name  || firebaseUser.displayName || 'Chef',
      avatar: userDoc?.avatar || firebaseUser.photoURL   || null,
    };
    hideAuthPage();
    updateNavForUser();
    showPage('home');
    subscribeRecipes();
  } else {
    currentUser = null;
    if (recipesUnsubscribe) { recipesUnsubscribe(); recipesUnsubscribe = null; }
    showAuthPage();
    updateNavForUser();
  }
});


// NAVIGATION

const authPage = document.getElementById('page-auth');
authPage.style.display = 'none';

function showAuthPage() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  authPage.style.display = 'flex';
}
function hideAuthPage() {
  authPage.style.display = 'none';
}
function showPage(name) {
  const current = document.querySelector('.page.active');
  if (current) previousPage = current.id.replace('page-', '');
  hideAuthPage();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
  document.getElementById('burgerBtn').style.display =
  currentUser ? 'flex' : 'none';
}

document.getElementById('logoBtn').addEventListener('click', () => {
  if (currentUser) { showPage('home'); }
});


// NAVBAR USER STATE

function updateNavForUser() {
  const pBtn = document.getElementById('profileBtn');
  if (currentUser?.avatar) {
    pBtn.innerHTML = `<img src="${currentUser.avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover">`;
  } else {
    pBtn.innerHTML = `<i data-lucide="user" class="icon-md"></i>`;
    lucide.createIcons({ nodes: [pBtn] });
  }
  document.getElementById('notifDot').style.display = currentUser ? 'block' : 'none';
}


// AUTH — SIGN UP

document.getElementById('signupBtn').addEventListener('click', async () => {

  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim().toLowerCase();
  const pass  = document.getElementById('signup-password').value;

  const err = document.getElementById('signup-error');

  if (!name || !email || !pass) {
    showErr(err, 'Please fill all fields.');
    return;
  }

  const passErr = validatePassword(pass);

  if (passErr) {
    showErr(err, passErr);
    return;
  }

  err.style.display = 'none';

  document.getElementById('signupBtn').disabled = true;
  document.getElementById('signupBtn').textContent = 'Sending Code...';

  try {

    _pendingName  = name;
    _pendingEmail = email;
    _pendingPass  = pass;

    _generatedOTP = generateOTP();

    await sendOTPEmail(email, _generatedOTP);

    showSignupOTPStep(email);

  } catch(e) {

    showErr(err, e.message);

  } finally {

    document.getElementById('signupBtn').disabled = false;
    document.getElementById('signupBtn').textContent = 'Create Account';

  }

});


// AUTH — SIGN IN (with OTP email verification)

let _pendingName  = '';
let _pendingEmail = '';
let _pendingPass  = '';
let _generatedOTP = '';
let _otpTimer     = null;

function getOTPExpiry() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1);
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function sendOTPEmail(toEmail, code) {
  try {
    await emailjs.send(
      'service_8gl1qoq',
      'template_rmevdt7',
      {
        to_email: toEmail,
        passcode: code,
        time: getOTPExpiry()
      }
    );
    return true;
 } catch(e) {
    console.error('EmailJS error status:', e.status);
    console.error('EmailJS error text:', e.text);
    console.error('EmailJS full error:', e);
    throw new Error('Failed to send verification email. Please try again.');
  }
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function startOTPTimer(secs) {
  secs = secs || 60;
  clearInterval(_otpTimer);
  var resendBtn = document.getElementById('signupOtpResendBtn');
  var timerEl   = document.getElementById('otpTimerEl');
  resendBtn.disabled = true;
  var remaining = secs;
  timerEl.textContent = 'Code expires in ' + remaining + 's';
  _otpTimer = setInterval(function() {
    remaining--;
    if (remaining <= 0) {
      clearInterval(_otpTimer);
      timerEl.textContent = 'Code expired. Please resend.';
      resendBtn.disabled = false;
      _generatedOTP = '';
    } else {
      timerEl.textContent = 'Code expires in ' + remaining + 's';
    }
  }, 1000);
}

function showOTPStep(email) {
  document.getElementById('signup-fields-step').style.display = 'none';
  document.getElementById('signup-otp-step').style.display = 'block';
  document.getElementById('otp-email-display').textContent = email;
  document.getElementById('signup-otp-error').style.display = 'none';
  for (var i = 0; i < 6; i++) {
    var el = document.getElementById('signupOtp' + i);
    if (el) el.value = '';
  }
  document.getElementById('signupOtp0').focus();
  startOTPTimer(60);
}

function hideOTPStep() {
  document.getElementById('signup-fields-step').style.display = 'block';
  document.getElementById('signup-otp-step').style.display = 'none';
  clearInterval(_otpTimer);
}

function showSignupOTPStep(email) {
  // Make sure the Sign Up tab is active
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector('[data-tab="signup"]').classList.add('active');
  document.getElementById('form-signup').classList.add('active');

  // Hide signup fields, show OTP step
  document.getElementById('signup-fields-step').style.display = 'none';
  document.getElementById('signup-otp-step').style.display = 'block';

  document.getElementById('otp-email-display').textContent = email;
  document.getElementById('signup-otp-error').style.display = 'none';

  // Clear OTP inputs and focus first
  for (var i = 0; i < 6; i++) {
    var el = document.getElementById('signupOtp' + i);
    if (el) el.value = '';
  }
  document.getElementById('signupOtp0').focus();

  startOTPTimer(60);
}

// OTP digit navigation
(function() {

  for (let idx = 0; idx < 6; idx++) {

    const inp =
      document.getElementById('signupOtp' + idx);

    if (!inp) continue;

    inp.addEventListener('input', function() {

      this.value =
        this.value.replace(/\D/g,'').slice(-1);

      if(this.value && idx < 5){

        document
          .getElementById(
            'signupOtp' + (idx + 1)
          )
          .focus();

      }

    });

    inp.addEventListener('keydown', function(e){

      if(
        e.key === 'Backspace' &&
        !this.value &&
        idx > 0
      ){

        document
          .getElementById(
            'signupOtp' + (idx - 1)
          )
          .focus();

      }

      if(e.key === 'Enter'){

        document
          .getElementById(
            'signupOtpVerifyBtn'
          )
          .click();

      }

    });

  }

})();

document.getElementById('signinBtn').addEventListener('click', async () => {

  const email =
    document.getElementById('signin-email')
      .value.trim()
      .toLowerCase();

  const pass =
    document.getElementById('signin-password')
      .value;

  const err =
    document.getElementById('signin-error');

  err.style.display = 'none';

  try {

    await signInWithEmailAndPassword(
      auth,
      email,
      pass
    );

  } catch(e) {

    showErr(
      err,
      firebaseErrMsg(e.code)
    );

  }

});

document.getElementById('signupOtpVerifyBtn')
.addEventListener('click', async () => {

  let entered = '';

for(let i=0;i<6;i++){
  entered += document.getElementById(
    'signupOtp' + i
  ).value;
}

  const err =
    document.getElementById('signup-otp-error');

  err.style.display = 'none';

  if(entered !== _generatedOTP){
    showErr(err,'Incorrect code.');
    return;
  }

  try {

    const cred =
      await createUserWithEmailAndPassword(
        auth,
        _pendingEmail,
        _pendingPass
      );

    // Update profile and Firestore BEFORE signing out
    await updateProfile(cred.user, { displayName: _pendingName });

    const { setDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );

    await setDoc(doc(db, 'users', cred.user.uid), {
      name: _pendingName,
      avatar: null,
      createdAt: serverTimestamp()
    });

    // Sign out immediately so onAuthStateChanged doesn't redirect to home.
    // The user will log in manually after the success popup.
    await signOut(auth);

    document.getElementById('signupSuccessPopup').classList.add('open');

  } catch(e){

    showErr(err, firebaseErrMsg(e.code));

  }

});

document.getElementById('signupOtpResendBtn').addEventListener('click', async () => {
  _generatedOTP = generateOTP();
  await sendOTPEmail(_pendingEmail, _generatedOTP);
  startOTPTimer(60);
  for (var i = 0; i < 6; i++) {
    var el = document.getElementById('signupOtp' + i);
    if (el) el.value = '';
  }
  document.getElementById('signupOtp0').focus();
});

document.getElementById('otpBackBtn').addEventListener('click', function() {
  hideOTPStep();
  _pendingEmail = ''; _pendingPass = ''; _generatedOTP = '';
});

// AUTH — SIGN OUT

document.getElementById('drawerLogout').addEventListener('click', async () => {
  closeDrawer();
  await signOut(auth);

  // Reset OTP state and restore signup fields
  _pendingEmail = ''; _pendingPass = ''; _generatedOTP = '';
  clearInterval(_otpTimer);
  document.getElementById('signup-otp-step').style.display = 'none';
  document.getElementById('signup-fields-step').style.display = 'block';

  // Clear sign in form
  document.getElementById('signin-email').value = '';
  document.getElementById('signin-password').value = '';
  document.getElementById('signin-error').style.display = 'none';
  document.getElementById('signup-otp-error').style.display = 'none';

  // Clear sign up form
  document.getElementById('signup-name').value = '';
  document.getElementById('signup-email').value = '';
  document.getElementById('signup-password').value = '';
  document.getElementById('signup-error').style.display = 'none';

  // Reset password hints
  ['hint-len','hint-cap','hint-sym'].forEach(function(id) {
    document.getElementById(id).style.cssText = 'color:var(--text-light)';
  });

  // Force Sign In tab active
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector('[data-tab="signin"]').classList.add('active');
  document.getElementById('form-signin').classList.add('active');
});

function firebaseErrMsg(code) {
  const map = {
    'auth/email-already-in-use':    'Email already registered.',
    'auth/invalid-email':           'Invalid email address.',
    'auth/weak-password':           'Password is too weak.',
    'auth/user-not-found':          'No account with that email.',
    'auth/wrong-password':          'Incorrect password.',
    'auth/invalid-credential':      'Invalid email or password.',
    'auth/too-many-requests':       'Too many attempts. Try again later.',
  };
  return map[code] || 'Something went wrong. Try again.';
}

function showErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }

function validatePassword(pass) {
  if (pass.length < 6)             return 'Password must be at least 6 characters.';
  if (!/[A-Z]/.test(pass))         return 'Password must include at least 1 capital letter.';
  if (!/[^A-Za-z0-9]/.test(pass)) return 'Password must include at least 1 symbol (e.g. ! @ # $).';
  return null;
}

// Enter key shortcuts for auth
['signin-email','signin-password'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('signinBtn').click(); }));

// FORGOT PASSWORD
document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
  const email = document.getElementById('signin-email').value.trim().toLowerCase();
  const err = document.getElementById('signin-error');
  const success = document.getElementById('signin-success');
  err.style.display = 'none';
  success.style.display = 'none';

  if (!email) {
    showErr(err, 'Please enter your email address first.');
    return;
  }

  import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js").then(({ sendPasswordResetEmail }) => {
    sendPasswordResetEmail(auth, email)
      .then(() => {
        success.textContent = `Password reset email sent to ${email}. Check your inbox.`;
        success.style.display = 'block';
      })
      .catch(e => {
        showErr(err, firebaseErrMsg(e.code));
      });
  });
});

// FORGOT PASSWORD
document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
  const email = document.getElementById('signin-email').value.trim().toLowerCase();
  const err = document.getElementById('signin-error');
  const success = document.getElementById('signin-success');
  err.style.display = 'none';
  success.style.display = 'none';

  if (!email) {
    showErr(err, 'Please enter your email address first.');
    return;
  }

  import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js").then(({ sendPasswordResetEmail }) => {
    sendPasswordResetEmail(auth, email)
      .then(() => {
        success.textContent = `Password reset email sent to ${email}. Check your inbox.`;
        success.style.display = 'block';
      })
      .catch(e => {
        showErr(err, firebaseErrMsg(e.code));
      });
  });
});
['signup-name','signup-email','signup-password'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('signupBtn').click(); }));

// Live password strength hints
document.getElementById('signup-password').addEventListener('input', function() {
  var p = this.value;
  var ok = 'color:#5a8a4a;font-weight:600';
  var no = 'color:var(--text-light)';
  document.getElementById('hint-len').style.cssText = p.length >= 6            ? ok : no;
  document.getElementById('hint-cap').style.cssText = /[A-Z]/.test(p)          ? ok : no;
  document.getElementById('hint-sym').style.cssText = /[^A-Za-z0-9]/.test(p)  ? ok : no;
});

// AUTH TABS

document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('form-' + btn.dataset.tab).classList.add('active');
  });
});


// SLIDESHOWS

function startSlideshow(slides) {
  let idx = 0;
  setInterval(() => {
    slides[idx].classList.remove('active');
    idx = (idx + 1) % slides.length;
    slides[idx].classList.add('active');
  }, 4000);
}
startSlideshow(document.querySelectorAll('#heroSlides .hero-slide'));
startSlideshow(document.querySelectorAll('.auth-bg .auth-slide'));
// Category pill selector — multi-select
document.querySelectorAll('.cat-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    pill.classList.toggle('selected');
    const selected = [...document.querySelectorAll('.cat-pill.selected')]
      .map(p => p.dataset.cat);
    document.getElementById('newCategory').value = selected.join(',');
  });
});

// ═══════════════════════════════════════════════════════════
// CATEGORY FILTER
// ═══════════════════════════════════════════════════════════
document.getElementById('browseCatBtn').addEventListener('click', () => {
  document.getElementById('categorySection').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => document.getElementById('catDropBtn').click(), 400);
});
document.getElementById('catDropBtn').addEventListener('click', () => {
  document.getElementById('catDropMenu').classList.toggle('open');
  lucide.createIcons();
});
document.querySelectorAll('.cat-option').forEach(opt => {
  opt.addEventListener('click', () => {
    const cat = opt.dataset.cat;
    if (!selectedCats.includes(cat)) { selectedCats.push(cat); renderCatTags(); renderRecipes(); }
    document.getElementById('catDropMenu').classList.remove('open');
  });
});

function renderCatTags() {
  const wrap = document.getElementById('activeCatTags');
  wrap.innerHTML = '';
  selectedCats.forEach(cat => {
    const tag = document.createElement('div');
    tag.className = 'cat-tag';
    tag.innerHTML = `<span>${cat.toUpperCase()}</span><button class="cat-tag-remove" data-cat="${cat}">×</button>`;
    tag.querySelector('.cat-tag-remove').addEventListener('click', () => {
      selectedCats = selectedCats.filter(c => c !== cat); renderCatTags(); renderRecipes();
    });
    wrap.appendChild(tag);
  });
}

// ═══════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════
document.getElementById('navSearch').addEventListener('input', e => {
  searchQuery = e.target.value.trim().toLowerCase();
  const header = document.getElementById('searchResultsHeader');
  if (searchQuery) {
    header.classList.remove('hidden');
    document.getElementById('searchResultsLabel').textContent = `SEARCH RESULTS — "${e.target.value.trim().toUpperCase()}"`;
  } else {
    header.classList.add('hidden');
  }
  if (document.getElementById('page-home').classList.contains('active')) renderRecipes();
  else { showPage('home'); renderRecipes(); }
});

// ═══════════════════════════════════════════════════════════
// REAL-TIME RECIPES SUBSCRIPTION (Firestore)
// ═══════════════════════════════════════════════════════════
let allRecipes = [];  // in-memory cache updated by listener

function subscribeRecipes() {
  if (recipesUnsubscribe) recipesUnsubscribe();
  const q = query(collection(db, 'recipes'), orderBy('createdAt', 'desc'));
  recipesUnsubscribe = onSnapshot(q, snap => {
    allRecipes = snap.docs.map(d => ({ id: d.id, hearts_by: [], hearts: 0, ...d.data() }));
    if (document.getElementById('page-home').classList.contains('active')) renderRecipes();
    if (document.getElementById('page-profile').classList.contains('active')) renderProfileGrid(profileTab);
  });
}

// ═══════════════════════════════════════════════════════════
// RENDER RECIPES
// ═══════════════════════════════════════════════════════════
function renderRecipes() {
  const grid  = document.getElementById('recipesGrid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  let recipes = [...allRecipes];
  if (searchQuery) {
    recipes = recipes.filter(r => r.title?.toLowerCase().includes(searchQuery));
  } else if (selectedCats.length) {
    recipes = recipes.filter(r => {
      const recipeCats = (r.category || '').split(',').map(c => c.trim());
      return selectedCats.some(sc => recipeCats.includes(sc));
    });
  }

  if (!recipes.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  recipes.forEach((r, i) => {
    const tile = makeRecipeTile(r, false);
    tile.style.animationDelay = `${i * 40}ms`;
    grid.appendChild(tile);
  });
}

// ═══════════════════════════════════════════════════════════
// TILE BUILDER
// ═══════════════════════════════════════════════════════════
function makeRecipeTile(recipe, profileMode) {
  const isHearted = currentUser && recipe.hearts_by?.includes(currentUser.id);

  const div = document.createElement('div');
  div.className = 'recipe-tile';

  div.innerHTML = `
    ${recipe.image
      ? `<img class="tile-img" src="${recipe.image}" alt="${recipe.title}" loading="lazy">`
      : `<div class="tile-img-placeholder">
           <i data-lucide="image" style="width:28px;height:28px;opacity:0.3"></i>
         </div>`
    }

    <div class="tile-title">${recipe.title}</div>

    <div class="tile-bottom">
      <div class="tile-time">
        <svg xmlns="http://www.w3.org/2000/svg"
             width="12"
             height="12"
             viewBox="0 0 24 24"
             fill="none"
             stroke="currentColor"
             stroke-width="2.5"
             stroke-linecap="round"
             stroke-linejoin="round">

          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>

        <span>${recipe.prepTime || '–'}</span>
      </div>
    </div>

    <button class="tile-heart-btn ${isHearted ? 'hearted' : ''}"
            data-id="${recipe.id}">

      <svg xmlns="http://www.w3.org/2000/svg"
           width="12"
           height="12"
           viewBox="0 0 24 24"
           fill="${isHearted ? 'currentColor' : 'none'}"
           stroke="currentColor"
           stroke-width="2.5"
           stroke-linecap="round"
           stroke-linejoin="round">

        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>

    </button>
  `;

  div.addEventListener('click', e => {
    if (e.target.closest('.tile-heart-btn')) return;

    openRecipeDetail(recipe.id);
  });

  const hb = div.querySelector('.tile-heart-btn');

  if (hb) {
    hb.addEventListener('click', e => {
      e.stopPropagation();

      toggleHeart(recipe.id, hb);
    });
  }

  lucide.createIcons({ nodes: [div] });

  return div;
}

// ═══════════════════════════════════════════════════════════
// HEART TOGGLE (Firestore atomic update)
// ═══════════════════════════════════════════════════════════
async function toggleHeart(recipeId, btn) {
  if (!currentUser) { showAuthPage(); return; }
  const rRef    = doc(db, 'recipes', recipeId);
  const recipe  = allRecipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const uid     = currentUser.id;
  const wasH    = recipe.hearts_by?.includes(uid);
  const heartSvg = btn.querySelector('svg');

  if (wasH) {
    recipe.hearts_by = (recipe.hearts_by || []).filter(id => id !== uid);
    recipe.hearts = Math.max(0, (recipe.hearts || 1) - 1);
    btn.classList.remove('hearted');
    if (heartSvg) heartSvg.setAttribute('fill', 'none');
    await updateDoc(rRef, { hearts_by: arrayRemove(uid), hearts: increment(-1) });
  } else {
    recipe.hearts_by = [...(recipe.hearts_by || []), uid];
    recipe.hearts = (recipe.hearts || 0) + 1;
    btn.classList.add('hearted');
    if (heartSvg) heartSvg.setAttribute('fill', 'currentColor');
    btn.classList.add('heart-pop');
    btn.addEventListener('animationend', () => btn.classList.remove('heart-pop'), { once: true });
    await updateDoc(rRef, { hearts_by: arrayUnion(uid), hearts: increment(1) });
    await addNotification(recipe.authorId, currentUser.name, recipe.title);
  }
}

async function addNotification(authorId, likerName, recipeTitle) {
  if (!authorId || currentUser?.id === authorId) return;

  await addDoc(collection(db, 'users', authorId, 'notifications'), {
    text: `${likerName} liked your recipe "${recipeTitle}"`,
    likerName: likerName,
    recipeTitle: recipeTitle,
    createdAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════
// RECIPE DETAIL
// ═══════════════════════════════════════════════════════════
function openRecipeDetail(id) {
  const r = allRecipes.find(r => r.id === id);
  if (!r) return;
  currentRecipe = r;

  document.getElementById('detailTitle').textContent = r.title;
  const imgEl = document.getElementById('detailImg');
  if (r.image) { imgEl.src = r.image; imgEl.style.display = 'block'; } else imgEl.style.display = 'none';

  const authAvEl = document.getElementById('detailAuthorAvatar');
  if (r.authorAvatar) authAvEl.innerHTML = `<img src="${r.authorAvatar}" alt="">`;
  else authAvEl.innerHTML = `<i data-lucide="user" style="width:16px;height:16px"></i>`;
  document.getElementById('detailAuthorName').textContent = r.authorName;

  const meta = document.getElementById('detailMeta');
  meta.innerHTML = `
    <div class="detail-meta-item"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Prep: ${r.prepTime || '–'}</div>
    <div class="detail-meta-item"><i data-lucide="users" class="icon-sm"></i> Serves: ${r.servings || '–'}</div>
    <div class="detail-meta-item"><i data-lucide="tag" class="icon-sm"></i> ${(r.category || '–').split(',').map(c => c.trim()).join(' · ')}</div>
    <div class="detail-meta-item" id="detailHeartsCount"><i data-lucide="heart" class="icon-sm"></i> ${r.hearts || 0}</div>
  `;

  const ingWrap = document.getElementById('detailIngredients');
  ingWrap.innerHTML = '';
  (r.ingredients || '').split('\n').filter(Boolean).forEach(line => {
    const d = document.createElement('div');
    d.className = 'detail-ingredient';
    d.innerHTML = `<div class="ingredient-dot"></div><span>${line}</span>`;
    ingWrap.appendChild(d);
  });
  document.getElementById('detailInstructions').textContent = r.instructions || '';

  const hb = document.getElementById('detailHeartBtn');
  const isHearted = currentUser && r.hearts_by?.includes(currentUser.id);
  hb.classList.toggle('hearted', !!isHearted);
  hb.onclick = () => toggleHeartDetail(r.id, hb);

  const deleteBtn = document.getElementById('detailDeleteBtn');
  const editBtn = document.getElementById('detailEditBtn');
  if (currentUser && r.authorId === currentUser.id) {

  deleteBtn.classList.remove('hidden');
  editBtn.classList.remove('hidden');

} else {

  deleteBtn.classList.add('hidden');
  editBtn.classList.add('hidden');

}

  showPage('detail');
  lucide.createIcons();
}

async function toggleHeartDetail(recipeId, hb) {
  if (!currentUser) { showAuthPage(); return; }
  const rRef   = doc(db, 'recipes', recipeId);
  const recipe = allRecipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const uid    = currentUser.id;
  const wasH   = recipe.hearts_by?.includes(uid);

  if (wasH) {
    recipe.hearts_by = (recipe.hearts_by || []).filter(id => id !== uid);
    recipe.hearts = Math.max(0, (recipe.hearts || 1) - 1);
    hb.classList.remove('hearted');
    await updateDoc(rRef, { hearts_by: arrayRemove(uid), hearts: increment(-1) });
  } else {
    recipe.hearts_by = [...(recipe.hearts_by || []), uid];
    recipe.hearts = (recipe.hearts || 0) + 1;
    hb.classList.add('hearted');
    await updateDoc(rRef, { hearts_by: arrayUnion(uid), hearts: increment(1) });
    await addNotification(recipe.authorId, currentUser.name, recipe.title);
  }
}

document.getElementById('detailEditBtn').addEventListener('click', () => {

  if (!currentRecipe) return;
  editingRecipeId = currentRecipe.id;

  document.getElementById('newTitle').value =
    currentRecipe.title || '';

  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('selected'));
  const cats = (currentRecipe.category || '').split(',').map(c => c.trim());
  cats.forEach(cat => {
    const pill = document.querySelector(`.cat-pill[data-cat="${cat}"]`);
    if (pill) pill.classList.add('selected');
  });
  document.getElementById('newCategory').value = currentRecipe.category || '';

  document.getElementById('newIngredients').value =
    currentRecipe.ingredients || '';

  document.getElementById('newInstructions').value =
    currentRecipe.instructions || '';

  document.getElementById('newPrepTime').value =
    (currentRecipe.prepTime || '').replace(/\D/g, '');

  document.getElementById('newServings').value =
    currentRecipe.servings || '';

  if (currentRecipe.image) {

    const prev = document.getElementById('imagePreview');

    prev.src = currentRecipe.image;

    prev.classList.remove('hidden');

    document.getElementById('uploadIcon')
      .classList.add('hidden');

    document.getElementById('uploadLabel')
      .classList.add('hidden');
  }

  document.getElementById('createPageTitle').textContent =
  'Edit Your Recipe';

  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('selected'));
  document.getElementById('newCategory').value = '';
document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('selected'));

  lucide.createIcons();

  showPage('create');

});
document.getElementById('createPageTitle').textContent =
  'Create New Post';

document.getElementById('detailBackBtn').addEventListener('click', () => {
  if (previousPage === 'profile') { showPage('profile'); renderProfilePage(); }
  else { showPage('home'); renderRecipes(); }
});
document.getElementById('createBackBtn').addEventListener('click', () => showPage('home'));

// ═══════════════════════════════════════════════════════════
// CREATE RECIPE
// ═══════════════════════════════════════════════════════════
document.getElementById('addBtn').addEventListener('click', () => {

  if (!currentUser) {
    showAuthPage();
    return;
  }

  // Reset edit mode
  editingRecipeId = null;

  // Reset page title
  document.getElementById('createPageTitle').textContent =
    'Create New Recipe';

  // Reset publish button text
  document.getElementById('publishBtn').innerHTML =
    `<i data-lucide="send" class="icon-sm"></i> Publish Recipe`;

  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('selected'));
  document.getElementById('newCategory').value = '';

  showPage('create');

});

document.getElementById('newPrepTime').addEventListener('input', e => {
  const val     = e.target.value;
  const cleaned = val.replace(/\D/g, '');
  const err     = document.getElementById('prepTimeError');
  if (val !== cleaned) {
    e.target.value = cleaned;
    e.target.classList.add('error');
    err.style.display = 'block';
    setTimeout(() => { e.target.classList.remove('error'); err.style.display = 'none'; }, 2500);
  }
});

document.getElementById('newServings').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/[^0-9]/g, '');
});

// Image upload preview
document.getElementById('imageFileInput').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const prev = document.getElementById('imagePreview');
    prev.src = ev.target.result; prev.classList.remove('hidden');
    document.getElementById('uploadIcon').classList.add('hidden');
    document.getElementById('uploadLabel').classList.add('hidden');
  };
  reader.readAsDataURL(file);
});

document.getElementById('publishBtn').addEventListener('click', async () => {
  const title        = document.getElementById('newTitle').value.trim();
  const category     = document.getElementById('newCategory').value;
  const ingredients  = document.getElementById('newIngredients').value.trim();
  const instructions = document.getElementById('newInstructions').value.trim();
  const prepRaw      = document.getElementById('newPrepTime').value.trim();
  const servings     = document.getElementById('newServings').value.trim();
  const imgPrev      = document.getElementById('imagePreview');
  const imageBase64  = imgPrev.classList.contains('hidden') ? '' : imgPrev.src;

  if (!title) { alert('Please enter a recipe title.'); return; }

  const btn = document.getElementById('publishBtn');
  btn.textContent = 'Publishing…';
  btn.disabled = true;

  try {
    let imageUrl = '';
    if (imageBase64 && imageBase64.startsWith('data:')) {
      imageUrl = await uploadImageIfNeeded(imageBase64, `recipes/${currentUser.id}_${Date.now()}`);
    } else if (imageBase64) {
      imageUrl = imageBase64;
    }

    const prepTime = prepRaw ? `${prepRaw.replace(/\D/g, '')} mins` : '';

    let updatedRecipeId = null;

if (editingRecipeId) {

  updatedRecipeId = editingRecipeId;

  await updateDoc(doc(db, 'recipes', editingRecipeId), {

    title,
    category,
    ingredients,
    instructions,
    prepTime,
    servings,
    image: imageUrl,

    updatedAt: serverTimestamp(),

  });

} else {

  const newDoc = await addDoc(collection(db, 'recipes'), {

    authorId: currentUser.id,
    authorName: currentUser.name,
    authorAvatar: currentUser.avatar || null,

    title,
    category,
    ingredients,
    instructions,
    prepTime,
    servings,
    image: imageUrl,

    hearts: 0,
    hearts_by: [],

    createdAt: serverTimestamp(),

  });

  updatedRecipeId = newDoc.id;
}

    // Reset form
    ['newTitle','newIngredients','newInstructions','newPrepTime','newServings']
  .forEach(id => document.getElementById(id).value = '');

document.getElementById('newCategory').value = '';

imgPrev.src = '';
imgPrev.classList.add('hidden');

document.getElementById('uploadIcon').classList.remove('hidden');
document.getElementById('uploadLabel').classList.remove('hidden');

editingRecipeId = null;

document.getElementById('createPageTitle').textContent =
  'Create New Recipe';

openRecipeDetail(updatedRecipeId);

} catch(e) {
  console.error(e);
  alert('Failed to publish. Check Firestore/Storage rules.');
} finally {

  btn.innerHTML =
    `<i data-lucide="send" class="icon-sm"></i> Publish Recipe`;

  btn.disabled = false;

  lucide.createIcons({ nodes: [btn] });
}
});

// ═══════════════════════════════════════════════════════════
// DELETE RECIPE
// ═══════════════════════════════════════════════════════════
let deleteRecipeId = null;

document.getElementById('detailDeleteBtn').addEventListener('click', () => {
  deleteRecipeId = currentRecipe.id;
  document.getElementById('deletePopup').classList.add('open');
});
document.getElementById('cancelDeleteBtn').addEventListener('click', () =>
  document.getElementById('deletePopup').classList.remove('open'));
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (!deleteRecipeId) return;
  try {
    await deleteDoc(doc(db, 'recipes', deleteRecipeId));
  } catch(e) { alert('Delete failed — check Firestore rules.'); }
  document.getElementById('deletePopup').classList.remove('open');
  showPage('home');
  renderRecipes();
});

// ═══════════════════════════════════════════════════════════
// PROFILE PAGE
// ═══════════════════════════════════════════════════════════
document.getElementById('profileBtn').addEventListener('click', () => {
  if (!currentUser) { showAuthPage(); return; }
  renderProfilePage(); showPage('profile');
});

function renderProfilePage() {
  if (!currentUser) return;
  const myRecipes  = allRecipes.filter(r => r.authorId === currentUser.id);
  const favRecipes = allRecipes.filter(r => r.hearts_by?.includes(currentUser.id));

  document.getElementById('profileNameEl').textContent  = currentUser.name;
  document.getElementById('profileStatsEl').textContent = `${myRecipes.length} Recipe${myRecipes.length !== 1 ? 's' : ''} | ${favRecipes.length} Heart${favRecipes.length !== 1 ? 's' : ''}`;

  const avatarEl = document.getElementById('profileAvatarEl');
  if (currentUser.avatar) avatarEl.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.name}">`;
  else { avatarEl.innerHTML = `<i data-lucide="user" style="width:32px;height:32px"></i>`; lucide.createIcons({ nodes: [avatarEl] }); }

  const drawerAv = document.getElementById('drawerAvatar');
  if (currentUser.avatar) drawerAv.innerHTML = `<img src="${currentUser.avatar}" alt="">`;
  else { drawerAv.innerHTML = `<i data-lucide="user" style="width:22px;height:22px"></i>`; lucide.createIcons({ nodes: [drawerAv] }); }
  document.getElementById('drawerName').textContent = currentUser.name;

  renderProfileGrid(profileTab);
}

function renderProfileGrid(tab) {
  profileTab = tab;
  document.querySelectorAll('.profile-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const grid = document.getElementById('profileGrid');
  grid.innerHTML = '';
  const list = tab === 'recipes'
    ? allRecipes.filter(r => r.authorId === currentUser?.id)
    : allRecipes.filter(r => r.hearts_by?.includes(currentUser?.id));
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon"><i data-lucide="chef-hat" style="width:40px;height:40px"></i></div><div class="empty-state-text">${tab === 'recipes' ? 'No recipes posted yet' : 'No favorites yet'}</div></div>`;
    lucide.createIcons({ nodes: [grid] }); return;
  }
  list.forEach((r, i) => {
    const tile = makeRecipeTile(r, true);
    tile.style.animationDelay = `${i * 40}ms`;
    grid.appendChild(tile);
  });
}

document.getElementById('tabMyRecipes').addEventListener('click',  () => renderProfileGrid('recipes'));
document.getElementById('tabFavorites').addEventListener('click', () => renderProfileGrid('favorites'));

// ═══════════════════════════════════════════════════════════
// EDIT PROFILE
// ═══════════════════════════════════════════════════════════
document.getElementById('profileAvatarWrap').addEventListener('click', () => {
  document.getElementById('editNameInput').value = currentUser.name;
  const ep = document.getElementById('editAvatarPreview');
  if (currentUser.avatar) ep.innerHTML = `<img src="${currentUser.avatar}" alt=""><div class="edit-avatar-overlay"><i data-lucide="camera" class="icon-sm"></i></div><input type="file" accept="image/*" id="editAvatarInput">`;
  else ep.innerHTML = `<i data-lucide="user" style="width:32px;height:32px"></i><div class="edit-avatar-overlay"><i data-lucide="camera" class="icon-sm"></i></div><input type="file" accept="image/*" id="editAvatarInput">`;
  lucide.createIcons({ nodes: [ep] });
  bindEditAvatarInput();
  document.getElementById('editProfileOverlay').classList.add('open');
});

function bindEditAvatarInput() {
  const inp = document.getElementById('editAvatarInput');
  if (!inp) return;
  inp.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const ep = document.getElementById('editAvatarPreview');
      ep.innerHTML = `<img src="${ev.target.result}" alt=""><div class="edit-avatar-overlay"><i data-lucide="camera" class="icon-sm"></i></div><input type="file" accept="image/*" id="editAvatarInput">`;
      lucide.createIcons({ nodes: [ep] }); bindEditAvatarInput();
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById('editSaveBtn').addEventListener('click', async () => {
  const name = document.getElementById('editNameInput').value.trim();
  const ep   = document.getElementById('editAvatarPreview');
  const img  = ep.querySelector('img');
  if (!name) { alert('Name cannot be empty.'); return; }

  document.getElementById('editSaveBtn').textContent = 'Saving…';
  try {
    let avatarUrl = currentUser.avatar || null;
    if (img?.src && img.src.startsWith('data:')) {
      avatarUrl = await uploadImageIfNeeded(img.src, `avatars/${currentUser.id}`);
    } else if (img?.src && !img.src.startsWith('blob:')) {
      avatarUrl = img.src;
    }

    // Update Firestore user doc (merge:true creates it if missing)
    const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(db, 'users', currentUser.id), { name, avatar: avatarUrl }, { merge: true });

    // Update Firebase Auth display name
    await updateProfile(auth.currentUser, { displayName: name });

    // Update recipes in background (non-blocking)
    const myRecipes = allRecipes.filter(r => r.authorId === currentUser.id);
    Promise.all(myRecipes.map(r =>
      updateDoc(doc(db, 'recipes', r.id), { authorName: name, authorAvatar: avatarUrl })
    )).catch(e => console.warn('Recipe author update partial fail:', e));

    currentUser = { ...currentUser, name, avatar: avatarUrl };
    document.getElementById('editProfileOverlay').classList.remove('open');
    renderProfilePage(); updateNavForUser();
  } catch(e) {
    console.error(e);
    alert('Save failed: ' + e.message);
  } finally {
    document.getElementById('editSaveBtn').textContent = 'Save Changes';
  }
});
document.getElementById('editCancelBtn').addEventListener('click', () => document.getElementById('editProfileOverlay').classList.remove('open'));

// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
document.getElementById('notifBtn').addEventListener('click', async e => {
  e.stopPropagation();
  const popup = document.getElementById('notifPopup');
  popup.classList.toggle('open');
if (popup.classList.contains('open') && currentUser) {
    document.getElementById('notifDot').style.display = 'none';
    const list = document.getElementById('notifList');
    list.innerHTML = `<div class="notif-empty">Loading…</div>`;
    try {
      const snap = await getDocs(collection(db, 'users', currentUser.id, 'notifications'));
      if (snap.empty) {
        list.innerHTML = `<div class="notif-empty">No notifications yet</div>`;
        return;
      }
      const sorted = snap.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      list.innerHTML = sorted.slice(0, 10).map(d => `
        <div class="notif-item">
          <div class="notif-avatar"><i data-lucide="user" style="width:14px;height:14px"></i></div>
          <div class="notif-text">${d.text || ''}</div>
        </div>`).join('');
      lucide.createIcons({ nodes: [list] });
    } catch(err) {
      console.error('Notif error:', err);
      list.innerHTML = `<div class="notif-empty">Could not load notifications.</div>`;
    }
  }
});

// ═══════════════════════════════════════════════════════════
// SIDE DRAWER
// ═══════════════════════════════════════════════════════════
document.getElementById('burgerBtn').addEventListener('click', () => {
  document.getElementById('sideDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
});
function closeDrawer() {
  document.getElementById('sideDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}
document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
document.getElementById('drawerHome').addEventListener('click', () => { closeDrawer(); showPage('home'); renderRecipes(); });
document.getElementById('drawerProfile').addEventListener('click', () => { closeDrawer(); renderProfilePage(); showPage('profile'); });
document.getElementById('drawerMyRecipes').addEventListener('click', () => { closeDrawer(); renderProfileGrid('recipes'); showPage('profile'); });
document.getElementById('drawerFavorites').addEventListener('click', () => { closeDrawer(); renderProfileGrid('favorites'); showPage('profile'); });

// Close popups on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#notifBtn') && !e.target.closest('#notifPopup'))
    document.getElementById('notifPopup').classList.remove('open');
  if (!e.target.closest('#catDropBtn') && !e.target.closest('#catDropMenu'))
    document.getElementById('catDropMenu').classList.remove('open');
});

// ═══════════════════════════════════════════════════════════
// INIT ICONS
// ═══════════════════════════════════════════════════════════
document.getElementById('successPopupBtn').addEventListener('click', () => {
  document.getElementById('signupSuccessPopup').classList.remove('open');

  // Reset signup form back to fields view
  document.getElementById('signup-otp-step').style.display = 'none';
  document.getElementById('signup-fields-step').style.display = 'block';
  document.getElementById('signup-name').value = '';
  document.getElementById('signup-email').value = '';
  document.getElementById('signup-password').value = '';
  document.getElementById('signup-error').style.display = 'none';
  _pendingName = ''; _pendingEmail = ''; _pendingPass = ''; _generatedOTP = '';
  clearInterval(_otpTimer);

  // Switch to Sign In tab so user can log in with their new account
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector('[data-tab="signin"]').classList.add('active');
  document.getElementById('form-signin').classList.add('active');

  // Make sure auth page is visible (signOut already triggered showAuthPage via onAuthStateChanged)
  showAuthPage();
});
window.addEventListener('DOMContentLoaded', () => lucide.createIcons());
setTimeout(() => lucide.createIcons(), 200);
