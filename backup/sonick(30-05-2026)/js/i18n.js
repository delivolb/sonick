/* ===================================================
   SONICK DELIVERY SYSTEM — Translations (i18n)
   =================================================== */

const TRANSLATIONS = {
  en: {
    dir: 'ltr',
    langBtn: 'AR',
    appName: 'Sonick Delivery',
    appSub: 'Delivery Management System',
    deliverySystem: 'DELIVERY SYSTEM',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    signOut: 'Sign Out',
    loginFailed: 'Login failed. Check your credentials.',
    invalidCreds: 'Incorrect email or password.',
    tooManyAttempts: 'Too many attempts. Try again later.',
    userNotFound: 'User data not found. Contact admin.',
    accountDisabled: 'Your account is disabled. Contact admin.',
    overview: 'Overview',
    dashboard: 'Dashboard',
    operations: 'Operations',
    shipments: 'Shipments',
    newShipment: 'New Shipment',
    archive: 'Archive',
    finance: 'Finance',
    debtsPayments: 'Debts & Payments',
    generalReport: 'General Report',
    management: 'Management',
    companies: 'Companies',
    drivers: 'Drivers',
    users: 'Users',
    system: 'System',
    settings: 'Settings',
    newShipmentBtn: '+ New Shipment',
    dollarRateLabel: '$ Rate:',
    totalShipments: 'Total Shipments',
    pending: 'Pending',
    delivered: 'Delivered',
    revenue: 'Revenue ($)',
    profit: 'Profit ($)',
    quickActions: 'Quick Actions',
    viewShipments: 'View Shipments',
    payments: 'Payments',
    recentShipments: 'Recent Shipments',
    latestActivity: 'Latest activity across all operations',
    viewAll: 'View All',
    view: 'View',
    shipNum: '#Ship',
    customer: 'Customer',
    company: 'Company',
    driver: 'Driver',
    contractor: 'Contractor',
    priceUSD: 'Price ($)',
    priceLL: 'Price (L.L.)',
    profitCol: 'Profit ($)',
    status: 'Status',
    date: 'Date',
    actions: 'Actions',
    phone: 'Phone',
    address: 'Address',
    searchShipments: 'Search shipments...',
    searchArchive: 'Search archive...',
    searchCompanies: 'Search companies...',
    searchDrivers: 'Search drivers...',
    createNewShipment: '📦 Create New Shipment',
    descPlaceholder: 'Any notes about this shipment...',
    cancel: 'Cancel',
    saveShipmentBtn: 'Save Shipment',
    shipNumRequired: 'Ship number is required',
    shipmentUpdated: 'Shipment updated ✅',
    shipmentCreated: 'Shipment created ✅',
    errorSaving: 'Error saving: ',
    shipmentNotFound: 'Shipment not found',
    noPermission: 'No permission',
    shipmentDetails: 'Shipment Details',
    close: 'Close',
    edit: '✏️ Edit',
    archiveBtn: '🗄️ Archive',
    deleteShipmentConfirm: 'Delete this shipment?',
    cannotUndo: 'This action cannot be undone.',
    archiveShipmentConfirm: 'Archive this shipment?',
    archiveMsg: 'Shipment will be moved to archive.',
    shipmentDeleted: 'Shipment deleted',
    shipmentArchived: 'Shipment archived 🗄️',
    archivedShipments: 'archived shipments',
    totalReceived: 'Total Received',
    totalPaidOut: 'Total Paid Out',
    balance: 'Balance',
    recordPayment: '+ Record Payment',
    entity: 'Entity',
    dirIn: '↑ In',
    dirOut: '↓ Out',
    paymentNote: 'Notes',
    entityRequired: 'Entity and amount required',
    paymentRecorded: 'Payment recorded ✅',
    count: 'Count',
    revenueCol: 'Revenue ($)',
    revenueLL: 'Revenue (L.L.)',
    companyName: 'Company Name',
    deliveryCostCol: 'Delivery Cost ($)',
    newCompany: 'New Company',
    companyAdded: 'Company added ✅',
    companyUpdated: 'Company updated ✅',
    deleteCompanyConfirm: 'Delete this company?',
    driverName: 'Driver Name',
    activeStatus: 'Status',
    newDriver: 'New Driver',
    driverAdded: 'Driver added ✅',
    driverUpdated: 'Driver updated ✅',
    deleteDriverConfirm: 'Delete this driver?',
    activeLabel: 'Active',
    inactiveLabel: 'Inactive',
    newUser: 'Add User',
    editUser: 'Edit User',
    userUpdated: 'User updated ✅',
    userCreated: 'User created ✅',
    nameEmailRequired: 'Name and email required',
    passRequired: 'Password must be 6+ characters',
    authNote: 'New users must also be created in Firebase Authentication.',
    rateUpdated: 'Exchange rate updated ✅',
    profileUpdated: 'Profile updated ✅',
    resetSent: 'Reset email sent to ',
    nameRequired: 'Name required',
    rateRequired: 'Enter a valid rate',
    deleted: 'Deleted',
    error: 'Error: ',
    showing: 'Showing',
    of: 'of',
    total: 'Total:',
    confirm: 'Confirm',
    csvExported: 'CSV exported ✅',
    logoutFailed: 'Logout failed',
    statusDelivered: 'Delivered',
    statusPending: 'Pending',
    statusReturned: 'Returned',
    statusCancelled: 'Cancelled',
    statusInTransit: 'In Transit',
    statusProcessing: 'Processing',
    profitF: 'Profit',
    byStatus: 'By Status',
    byDriver: 'By Driver',
    byCompany: 'By Company',
  },
  ar: {
    dir: 'rtl',
    langBtn: 'EN',
    appName: 'سونيك للتوصيل',
    appSub: 'نظام إدارة التوصيل',
    deliverySystem: 'نظام التوصيل',
    emailLabel: 'البريد الإلكتروني',
    passwordLabel: 'كلمة المرور',
    signIn: 'تسجيل الدخول',
    signingIn: 'جارٍ الدخول...',
    signOut: 'تسجيل الخروج',
    loginFailed: 'فشل تسجيل الدخول. تحقق من بياناتك.',
    invalidCreds: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    tooManyAttempts: 'محاولات كثيرة. حاول لاحقاً.',
    userNotFound: 'بيانات المستخدم غير موجودة. تواصل مع المسؤول.',
    accountDisabled: 'حسابك معطّل. تواصل مع المسؤول.',
    overview: 'نظرة عامة',
    dashboard: 'لوحة التحكم',
    operations: 'العمليات',
    shipments: 'الشحنات',
    newShipment: 'شحنة جديدة',
    archive: 'الأرشيف',
    finance: 'المالية',
    debtsPayments: 'الديون والمدفوعات',
    generalReport: 'التقرير العام',
    management: 'الإدارة',
    companies: 'الشركات',
    drivers: 'السائقون',
    users: 'المستخدمون',
    system: 'النظام',
    settings: 'الإعدادات',
    newShipmentBtn: '+ شحنة جديدة',
    dollarRateLabel: 'سعر $:',
    totalShipments: 'إجمالي الشحنات',
    pending: 'قيد الانتظار',
    delivered: 'تم التوصيل',
    revenue: 'الإيرادات ($)',
    profit: 'الربح ($)',
    quickActions: 'إجراءات سريعة',
    viewShipments: 'عرض الشحنات',
    payments: 'المدفوعات',
    recentShipments: 'الشحنات الأخيرة',
    latestActivity: 'آخر النشاطات عبر جميع العمليات',
    viewAll: 'عرض الكل',
    view: 'عرض',
    shipNum: '#رقم الشحنة',
    customer: 'العميل',
    company: 'الشركة',
    driver: 'السائق',
    contractor: 'المقاول',
    priceUSD: 'السعر ($)',
    priceLL: 'السعر (ل.ل.)',
    profitCol: 'الربح ($)',
    status: 'الحالة',
    date: 'التاريخ',
    actions: 'الإجراءات',
    phone: 'الهاتف',
    address: 'العنوان',
    searchShipments: 'بحث في الشحنات...',
    searchArchive: 'بحث في الأرشيف...',
    searchCompanies: 'بحث في الشركات...',
    searchDrivers: 'بحث في السائقين...',
    createNewShipment: '📦 إنشاء شحنة جديدة',
    descPlaceholder: 'أي ملاحظات حول هذه الشحنة...',
    cancel: 'إلغاء',
    saveShipmentBtn: 'حفظ الشحنة',
    shipNumRequired: 'رقم الشحنة مطلوب',
    shipmentUpdated: 'تم تحديث الشحنة ✅',
    shipmentCreated: 'تم إنشاء الشحنة ✅',
    errorSaving: 'خطأ في الحفظ: ',
    shipmentNotFound: 'الشحنة غير موجودة',
    noPermission: 'لا توجد صلاحية',
    shipmentDetails: 'تفاصيل الشحنة',
    close: 'إغلاق',
    edit: '✏️ تعديل',
    archiveBtn: '🗄️ أرشفة',
    deleteShipmentConfirm: 'حذف هذه الشحنة؟',
    cannotUndo: 'لا يمكن التراجع عن هذا الإجراء.',
    archiveShipmentConfirm: 'أرشفة هذه الشحنة؟',
    archiveMsg: 'سيتم نقل الشحنة إلى الأرشيف.',
    shipmentDeleted: 'تم حذف الشحنة',
    shipmentArchived: 'تمت أرشفة الشحنة 🗄️',
    archivedShipments: 'شحنة مؤرشفة',
    totalReceived: 'إجمالي المستلم',
    totalPaidOut: 'إجمالي المدفوع',
    balance: 'الرصيد',
    recordPayment: '+ تسجيل دفعة',
    entity: 'الجهة',
    dirIn: '↑ وارد',
    dirOut: '↓ صادر',
    paymentNote: 'الملاحظات',
    entityRequired: 'الجهة والمبلغ مطلوبان',
    paymentRecorded: 'تم تسجيل الدفعة ✅',
    count: 'العدد',
    revenueCol: 'الإيرادات ($)',
    revenueLL: 'الإيرادات (ل.ل.)',
    companyName: 'اسم الشركة',
    deliveryCostCol: 'تكلفة التوصيل ($)',
    newCompany: 'شركة جديدة',
    companyAdded: 'تمت إضافة الشركة ✅',
    companyUpdated: 'تم تحديث الشركة ✅',
    deleteCompanyConfirm: 'حذف هذه الشركة؟',
    driverName: 'اسم السائق',
    activeStatus: 'الحالة',
    newDriver: 'سائق جديد',
    driverAdded: 'تمت إضافة السائق ✅',
    driverUpdated: 'تم تحديث السائق ✅',
    deleteDriverConfirm: 'حذف هذا السائق؟',
    activeLabel: 'نشط',
    inactiveLabel: 'غير نشط',
    newUser: 'إضافة مستخدم',
    editUser: 'تعديل المستخدم',
    userUpdated: 'تم تحديث المستخدم ✅',
    userCreated: 'تم إنشاء المستخدم ✅',
    nameEmailRequired: 'الاسم والبريد الإلكتروني مطلوبان',
    passRequired: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
    authNote: 'يجب إنشاء المستخدمين الجدد في Firebase Authentication أيضاً.',
    rateUpdated: 'تم تحديث سعر الصرف ✅',
    profileUpdated: 'تم تحديث الملف الشخصي ✅',
    resetSent: 'تم إرسال بريد إعادة التعيين إلى ',
    nameRequired: 'الاسم مطلوب',
    rateRequired: 'أدخل سعرًا صحيحًا',
    deleted: 'تم الحذف',
    error: 'خطأ: ',
    showing: 'عرض',
    of: 'من',
    total: 'الإجمالي:',
    confirm: 'تأكيد',
    csvExported: 'تم تصدير CSV ✅',
    logoutFailed: 'فشل تسجيل الخروج',
    statusDelivered: 'تم التوصيل',
    statusPending: 'قيد الانتظار',
    statusReturned: 'مرتجع',
    statusCancelled: 'ملغي',
    statusInTransit: 'في الطريق',
    statusProcessing: 'قيد المعالجة',
    profitF: 'الربح',
    byStatus: 'حسب الحالة',
    byDriver: 'حسب السائق',
    byCompany: 'حسب الشركة',
  }
};

let currentLang = localStorage.getItem('sonick_lang') || 'en';

/** Translate a key using the current language, falling back to English */
function t(key) {
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) ||
         (TRANSLATIONS['en'] && TRANSLATIONS['en'][key]) ||
         key;
}

/** Toggle EN ↔ AR and re-render current page */
function toggleLang() {
  currentLang = currentLang === 'en' ? 'ar' : 'en';
  localStorage.setItem('sonick_lang', currentLang);
  applyLang();
  navigate(currentPage);
}

/** Apply language strings to all static DOM elements */
function applyLang() {
  const lang = TRANSLATIONS[currentLang];
  const html = document.documentElement;
  html.setAttribute('dir', lang.dir);
  html.setAttribute('lang', currentLang);

  const langBtn = document.getElementById('lang-btn');
  if (langBtn) langBtn.textContent = lang.langBtn;

  const loginLogoH1 = document.querySelector('.login-logo h1');
  const loginLogoP  = document.querySelector('.login-logo p');
  if (loginLogoH1) loginLogoH1.textContent = lang.appName;
  if (loginLogoP)  loginLogoP.textContent  = lang.appSub;

  const lblEmail = document.getElementById('label-email');
  const lblPass  = document.getElementById('label-password');
  if (lblEmail) lblEmail.textContent = lang.emailLabel;
  if (lblPass)  lblPass.textContent  = lang.passwordLabel;

  const loginBtn = document.getElementById('login-btn');
  if (loginBtn && !loginBtn.disabled) loginBtn.textContent = lang.signIn;

  const logoText = document.querySelector('.sidebar-logo .logo-text');
  const logoSub  = document.querySelector('.sidebar-logo .logo-sub');
  if (logoText) logoText.textContent = lang.appName;
  if (logoSub)  logoSub.textContent  = lang.deliverySystem;

  const navLabelMap = {
    dashboard: 'dashboard', shipments: 'shipments',
    'new-shipment': 'newShipment', archive: 'archive',
    debts: 'debtsPayments', general: 'generalReport',
    companies: 'companies', drivers: 'drivers',
    users: 'users', settings: 'settings'
  };
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.dataset.page;
    const span = el.querySelector('[data-nav-label]');
    if (span && navLabelMap[page] && lang[navLabelMap[page]]) {
      span.textContent = lang[navLabelMap[page]];
    }
  });

  document.querySelectorAll('[data-nav-section]').forEach(el => {
    const key = el.dataset.navSection;
    if (lang[key]) el.textContent = lang[key];
  });

  const signoutLabel = document.getElementById('signout-label');
  if (signoutLabel) signoutLabel.textContent = lang.signOut;

  const topbarNewShip = document.getElementById('topbar-new-ship');
  if (topbarNewShip) topbarNewShip.textContent = lang.newShipmentBtn;

  const topbarDollarLabel = document.getElementById('topbar-dollar-label');
  if (topbarDollarLabel) topbarDollarLabel.textContent = lang.dollarRateLabel;

  const pageTitleEl = document.getElementById('page-title');
  if (pageTitleEl && navLabelMap[currentPage] && lang[navLabelMap[currentPage]]) {
    pageTitleEl.textContent = lang[navLabelMap[currentPage]];
  }
}
