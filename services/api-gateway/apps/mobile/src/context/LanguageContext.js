import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LanguageContext = createContext();

const labels = {
  en: {
    appName: 'LipaSafe', tagline: 'Lipa Salama. Daima.',
    home: 'Home', pay: 'Pay', activity: 'Activity', profile: 'Profile',
    balance: 'Balance', recent: 'Recent', seeAll: 'See All',
    phone: 'Phone Number', name: 'Full Name', otp: 'Enter OTP',
    pin: 'PIN', confirmPin: 'Confirm PIN', login: 'Login',
    register: 'Register', next: 'Next', back: 'Back', submit: 'Submit',
    continue: 'Continue', cancel: 'Cancel', confirm: 'Confirm',
    amount: 'Amount', description: 'Description', deadline: 'Deadline',
    seller: 'Seller', buyer: 'Buyer', status: 'Status', date: 'Date',
    processing: 'Processing...', success: 'Success!', failed: 'Failed',
    dispute: 'Dispute', release: 'Release Funds', upload: 'Upload Photo',
    settings: 'Settings', language: 'Language', notifications: 'Notifications',
    english: 'English', swahili: 'Swahili', logout: 'Logout',
    escrowFee: 'Escrow Fee', total: 'Total', feeBreakdown: 'Fee Breakdown',
    bundles: 'Bundles', secondhand: 'Second Hand', fundi: 'Fundi',
    delivery: 'Delivery', house: 'House', custom: 'Custom',
    onlineShopping: 'Online Shopping', pasteLink: 'Paste Link',
    itemDescription: 'Item Description', sellerNumber: 'Seller Number',
    deliveryNumber: 'Delivery Person Number', contractor: 'Contractor',
    milestones: 'Milestones', houseHunting: 'House Hunting',
    agentNumber: 'Agent Number', propertyDesc: 'Property Description',
    viewingFee: 'Viewing Fee', transactionId: 'Transaction ID',
    done: 'Done', reputation: 'Reputation Score', verified: 'Verified',
    pending: 'Pending', completed: 'Completed', all: 'All', disputed: 'Disputed',
    noTransactions: 'No transactions yet', welcome: 'Welcome',
    selectService: 'Select Service',
    onboarding1Title: 'Safe Payments',
    onboarding1: 'Pay safely for goods and services',
    onboarding2Title: 'Money in Escrow',
    onboarding2: 'Your money is held safely until you confirm delivery',
    onboarding3Title: 'We Have Your Back',
    onboarding3: 'Dispute resolution when things go wrong',
    getStarted: 'Get Started', skip: 'Skip',
    enterPhone: 'Enter your phone number', enterName: 'Enter your name',
    enterOTP: 'Enter 6-digit code sent to', enterPIN: 'Enter your 4-digit PIN',
    setPIN: 'Set your 4-digit PIN', wrongPIN: 'Wrong PIN',
    pinMismatch: 'PINs do not match', createAccount: 'Create Account',
    haveAccount: 'Already have an account?', noAccount: 'No account?',
    forgotPIN: 'Forgot PIN?', changePIN: 'Change PIN',
    enableNotif: 'Enable Notifications', bioAuth: 'Biometric Authentication',
    idUpload: 'Upload ID', faceVerify: 'Face Verification',
    businessDesc: 'Business Description', verifyMe: 'Verify as Seller',
    sellerDash: 'Seller Dashboard', deliveryOrders: 'My Deliveries', pendingDeliveries: 'Pending Deliveries',
    moneyWaiting: 'Money Waiting', markDelivered: 'Mark Delivered',
    uploadProof: 'Upload Proof', proofRequired: 'Photo proof required',
    problemDesc: 'Describe the problem', openDispute: 'Open Dispute',
    transactionDetails: 'Transaction Details', timeline: 'Timeline',
    waitingBuyer: 'Waiting for buyer confirmation',
    fundsReleased: 'Funds released to seller',
    escrowed: 'Money held in escrow', paid: 'Paid',
    service: 'Service', category: 'Category',
  },
  sw: {
    appName: 'LipaSafe', tagline: 'Lipa Salama. Daima.',
    home: 'Nyumbani', pay: 'Lipa', activity: 'Shughuli', profile: 'Wasifu',
    balance: 'Salio', recent: 'Hivi Karibuni', seeAll: 'Tazama Zote',
    phone: 'Namba ya Simu', name: 'Jina Kamili', otp: 'Weka OTP',
    pin: 'PIN', confirmPin: 'Thibitisha PIN', login: 'Ingia',
    register: 'Jisajili', next: 'Endelea', back: 'Rudi', submit: 'Tuma',
    continue: 'Endelea', cancel: 'Ghairi', confirm: 'Thibitisha',
    amount: 'Kiasi', description: 'Maelezo', deadline: 'Tarehe ya Mwisho',
    seller: 'Muuzaji', buyer: 'Mnunuzi', status: 'Hali', date: 'Tarehe',
    processing: 'Inachakata...', success: 'Imefanikiwa!', failed: 'Imeshindwa',
    dispute: 'Mizozo', release: 'Toa Pesa', upload: 'Pakia Picha',
    settings: 'Mipangilio', language: 'Lugha', notifications: 'Arifa',
    english: 'Kiingereza', swahili: 'Kiswahili', logout: 'Toka',
    escrowFee: 'Ada ya Escrow', total: 'Jumla', feeBreakdown: 'Vigezo vya Ada',
    bundles: 'Vifurushi', secondhand: 'Bidhaa za Mkono wa Pili', fundi: 'Fundi',
    delivery: 'Usafirishaji', house: 'Nyumba', custom: 'Maalum',
    onlineShopping: 'Manunuzi Mtandaoni', pasteLink: 'Bandika Kiungo',
    itemDescription: 'Maelezo ya Bidhaa', sellerNumber: 'Namba ya Muuzaji',
    deliveryNumber: 'Namba ya Mwasilishaji', contractor: 'Mkandarasi',
    milestones: 'Hatua', houseHunting: 'Kutafuta Nyumba',
    agentNumber: 'Namba ya Wakala', propertyDesc: 'Maelezo ya Mali',
    viewingFee: 'Ada ya Kutazama', transactionId: 'Namba ya Shughuli',
    done: 'Maliza', reputation: 'Sifa', verified: 'Imethibitishwa',
    pending: 'Inasubiri', completed: 'Imekamilika', all: 'Zote', disputed: 'Mizozo',
    noTransactions: 'Hakuna shughuli bado', welcome: 'Karibu',
    selectService: 'Chagua Huduma',
    onboarding1Title: 'Malipo Salama',
    onboarding1: 'Lipa kwa usalama kwa bidhaa na huduma',
    onboarding2Title: 'Pesa Inahifadhiwa',
    onboarding2: 'Pesa yako inahifadhiwa kwa usalama hadi uthibitishe utoaji',
    onboarding3Title: 'Tuko Nawe',
    onboarding3: 'Suluhisho la mzozo mambo yakienda vibaya',
    getStarted: 'Anza', skip: 'Ruka',
    enterPhone: 'Weka namba yako ya simu', enterName: 'Weka jina lako',
    enterOTP: 'Weka namba 6-tarifu iliyotumwa kwa', enterPIN: 'Weka PIN yako ya tarifu 4',
    setPIN: 'Weka PIN yako ya tarifu 4', wrongPIN: 'PIN sio sahihi',
    pinMismatch: 'PIN hazilingani', createAccount: 'Tengeneza Akaunti',
    haveAccount: 'Tayari una akaunti?', noAccount: 'Huna akaunti?',
    forgotPIN: 'Umesahau PIN?', changePIN: 'Badilisha PIN',
    enableNotif: 'Wezesha Arifa', bioAuth: 'Uthibitishaji wa Kibayolojia',
    idUpload: 'Pakia Kitambulisho', faceVerify: 'Uthibitishaji wa Uso',
    businessDesc: 'Maelezo ya Biashara', verifyMe: 'Thibitisha kama Muuzaji',
    sellerDash: 'Dashibodi ya Muuzaji', deliveryOrders: 'Usafirishaji Wangu', pendingDeliveries: 'Usafirishaji Unaosubiri',
    moneyWaiting: 'Pesa Inayosubiri', markDelivered: 'Weka Imetolewa',
    uploadProof: 'Pakia Ushahidi', proofRequired: 'Picha ya ushahidi inahitajika',
    problemDesc: 'Eleza shida', openDispute: 'Fungua Mizozo',
    transactionDetails: 'Maelezo ya Shughuli', timeline: 'Mstari wa Wakati',
    waitingBuyer: 'Inasubiri mteja kuthibitisha',
    fundsReleased: 'Pesa zimetolewa kwa muuzaji',
    escrowed: 'Pesa imewekwa kuhifadhiwa', paid: 'Imelipwa',
    service: 'Huduma', category: 'Kategoria',
  }
};

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en');
  useEffect(() => {
    AsyncStorage.getItem('language').then(l => l && setLang(l));
  }, []);
  const t = labels[lang];
  const toggleLang = () => {
    const newLang = lang === 'en' ? 'sw' : 'en';
    setLang(newLang);
    AsyncStorage.setItem('language', newLang);
  };
  return (
    <LanguageContext.Provider value={{ lang, t, toggleLang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
