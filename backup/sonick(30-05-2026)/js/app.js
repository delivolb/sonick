/* ===================================================
   SONICK DELIVERY SYSTEM — Firebase, Auth, Roles, State
   =================================================== */

// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
  apiKey: "AIzaSyDZXyidFBKqyKLuQP-zrRP-YBZ0ncr_tNc",
  authDomain: "sonick-1e7a9.firebaseapp.com",
  databaseURL: "https://sonick-1e7a9-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "sonick-1e7a9",
  storageBucket: "sonick-1e7a9.firebasestorage.app",
  messagingSenderId: "273325585946",
  appId: "1:273325585946:web:c986cfe80220f4bdd5c3a3"
};

// ===== APP STATE =====
let app_fb, db, auth;
let currentUser     = null;
let currentUserData = null;
let currentPage     = 'dashboard';
let editingId       = null;
let dollPrice       = 0;

let companies_cache  = [];
let drivers_cache    = [];
let billtypes_cache  = [];

// ===== ROLES & PERMISSIONS =====
const ROLES = {
  admin: {
    label: 'Admin',
    canViewShipments: true, canCreateShipments: true, canEditShipments: true,
    canDeleteShipments: true, canArchive: true, canViewFinance: true,
    canViewProfit: true, canManageCompanies: true, canManageDrivers: true,
    canManageUsers: true, canViewGeneral: true, canViewDebts: true, canExport: true
  },
  manager: {
    label: 'Manager',
    canViewShipments: true, canCreateShipments: true, canEditShipments: true,
    canDeleteShipments: false, canArchive: true, canViewFinance: true,
    canViewProfit: false, canManageCompanies: true, canManageDrivers: true,
    canManageUsers: false, canViewGeneral: true, canViewDebts: true, canExport: true
  },
  operator: {
    label: 'Operator',
    canViewShipments: true, canCreateShipments: true, canEditShipments: false,
    canDeleteShipments: false, canArchive: false, canViewFinance: false,
    canViewProfit: false, canManageCompanies: false, canManageDrivers: false,
    canManageUsers: false, canViewGeneral: false, canViewDebts: false, canExport: false
  },
  viewer: {
    label: 'Viewer',
    canViewShipments: true, canCreateShipments: false, canEditShipments: false,
    canDeleteShipments: false, canArchive: false, canViewFinance: false,
    canViewProfit: false, canManageCompanies: false, canManageDrivers: false,
    canManageUsers: false, canViewGeneral: false, canViewDebts: false, canExport: false
  }
};

/** Check if current user has a given permission */
function can(permission) {
  if (!currentUserData) return false;
  const role = ROLES[currentUserData.role] || ROLES.viewer;
  return !!role[permission];
}

// ===== FIREBASE INIT =====
function initFirebase() {
  try {
    app_fb = firebase.initializeApp(firebaseConfig);
    db     = firebase.firestore();
    auth   = firebase.auth();

    auth.onAuthStateChanged(async (user) => {
      hideLoading();
      if (user) {
        await loadUserData(user);
      } else {
        showLogin();
      }
    });
  } catch (e) {
    hideLoading();
    console.warn('Firebase not configured — running in demo mode');
    showLogin();
  }
}

async function loadUserData(user) {
  try {
    const userDoc = await db.collection('sonick_users').doc(user.uid).get();
    if (!userDoc.exists) {
      await auth.signOut();
      showLogin();
      toast(t('userNotFound'), 'error');
      return;
    }
    const data = userDoc.data();
    if (!data.active) {
      await auth.signOut();
      showLogin();
      toast(t('accountDisabled'), 'error');
      return;
    }
    currentUser     = user;
    currentUserData = { id: user.uid, ...data };
    await loadCaches();
    showApp();
  } catch (e) {
    console.error('loadUserData error:', e);
    // Demo mode fallback
    currentUser     = user;
    currentUserData = { id: user.uid, displayName: user.displayName || user.email, email: user.email, role: 'admin', active: true };
    await loadCaches();
    showApp();
  }
}

// ===== AUTH =====
async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const errEl    = document.getElementById('login-error');

  errEl.classList.add('hidden');
  btn.textContent = t('signingIn');
  btn.disabled    = true;

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    let msg = t('loginFailed');
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')
      msg = t('invalidCreds');
    if (err.code === 'auth/too-many-requests')
      msg = t('tooManyAttempts');
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
    btn.textContent = t('signIn');
    btn.disabled    = false;
  }
}

async function handleLogout() {
  try {
    if (auth) await auth.signOut();
    currentUser     = null;
    currentUserData = null;
    showLogin();
  } catch (e) {
    toast(t('logoutFailed'), 'error');
  }
}

// ===== DATA CACHES =====
async function loadCaches() {
  if (!db) return;
  try {
    const [compSnap, drvSnap, btSnap, settSnap] = await Promise.all([
      db.collection('sonick_companies').orderBy('name').get(),
      db.collection('sonick_drivers').orderBy('name').get(),
      db.collection('sonick_billtypes').get(),
      db.collection('sonick_settings').doc('general').get()
    ]);
    companies_cache = compSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    drivers_cache   = drvSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    billtypes_cache = btSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (settSnap.exists) dollPrice = settSnap.data().dollarRate || 0;
  } catch (e) {
    console.warn('Cache load error — using demo data:', e.message);
    companies_cache = [
      { id: 'c1', name: 'Alpha Logistics', phones: '01-123456', deliveryCost: 5 },
      { id: 'c2', name: 'Beta Express',    phones: '03-654321', deliveryCost: 7 },
    ];
    drivers_cache = [
      { id: 'd1', name: 'Ahmad Khalil', phones: '70-111222', active: true },
      { id: 'd2', name: 'Samir Nasr',   phones: '03-333444', active: true },
    ];
    billtypes_cache = [
      { id: 'bt1', name: 'Delivered' },
      { id: 'bt2', name: 'Pending'   },
      { id: 'bt3', name: 'Returned'  },
      { id: 'bt4', name: 'Cancelled' },
    ];
    dollPrice = 89500;
  }
}

// ===== DEMO DATA =====
function getDemoShipments() {
  return [
    { id: 's1', shipNumber: 1001, customerName: 'Ali Hassan',     customerPhone: '03-111222', customerAddress: 'Beirut, Hamra',      companyName: 'Alpha Logistics', driverName: 'Ahmad Khalil', contractorName: 'Beta Express', status: 'Delivered', priceDollar: 150, priceLeb: 13425000, deliveryCost: 10, driverDeliveryCost: 5, contractorDeliveryCost: 3, deliveryProfit: 132, date: '2026-05-20', description: 'Fragile items' },
    { id: 's2', shipNumber: 1002, customerName: 'Rima Khoury',    customerPhone: '70-333444', customerAddress: 'Tripoli, Al Mina',   companyName: 'Beta Express',    driverName: 'Samir Nasr',   contractorName: '',             status: 'Pending',   priceDollar:  85, priceLeb:  7607500, deliveryCost:  7, driverDeliveryCost: 4, contractorDeliveryCost: 0, deliveryProfit:  74, date: '2026-05-22', description: '' },
    { id: 's3', shipNumber: 1003, customerName: 'Omar Faraj',     customerPhone: '01-555666', customerAddress: 'Sidon, Downtown',    companyName: 'Alpha Logistics', driverName: 'Ahmad Khalil', contractorName: '',             status: 'Returned',  priceDollar: 200, priceLeb: 17900000, deliveryCost: 12, driverDeliveryCost: 6, contractorDeliveryCost: 0, deliveryProfit: 182, date: '2026-05-18', description: 'Customer not available' },
    { id: 's4', shipNumber: 1004, customerName: 'Lara Mansour',   customerPhone: '03-777888', customerAddress: 'Jounieh, Old Town',  companyName: 'Beta Express',    driverName: 'Samir Nasr',   contractorName: '',             status: 'Delivered', priceDollar: 320, priceLeb: 28640000, deliveryCost: 15, driverDeliveryCost: 8, contractorDeliveryCost: 0, deliveryProfit: 297, date: '2026-05-25', description: '' },
    { id: 's5', shipNumber: 1005, customerName: 'Georges Haddad', customerPhone: '70-999000', customerAddress: 'Baabda',            companyName: 'Alpha Logistics', driverName: 'Ahmad Khalil', contractorName: 'Beta Express', status: 'In Transit',priceDollar: 450, priceLeb: 40275000, deliveryCost: 20, driverDeliveryCost:10, contractorDeliveryCost: 5, deliveryProfit: 415, date: '2026-05-27', description: 'Priority delivery' },
  ];
}

function getDemoUsers() {
  return [
    { id: 'u1', displayName: 'Admin User',     email: 'admin@sonick.com', role: 'admin',    active: true  },
    { id: 'u2', displayName: 'Manager Karim',  email: 'karim@sonick.com', role: 'manager',  active: true  },
    { id: 'u3', displayName: 'Operator Maya',  email: 'maya@sonick.com',  role: 'operator', active: true  },
    { id: 'u4', displayName: 'Viewer Sara',    email: 'sara@sonick.com',  role: 'viewer',   active: false },
  ];
}

function getDemoPayments() {
  return [
    { id: 'p1', entityName: 'Alpha Logistics', type: 'Payment', amount: 500, direction:  1, date: '2026-05-15', notes: 'Monthly settlement' },
    { id: 'p2', entityName: 'Ahmad Khalil',    type: 'Payment', amount: 200, direction: -1, date: '2026-05-20', notes: 'Driver salary'      },
    { id: 'p3', entityName: 'Beta Express',    type: 'Advance', amount: 300, direction:  1, date: '2026-05-22', notes: ''                    },
  ];
}
