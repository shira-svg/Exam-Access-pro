import React from 'react';
import { 
  BookOpen, User, GraduationCap, Download, Edit3, Eye, Link, LogOut, 
  CreditCard, ChevronLeft, Star, Key, Settings, MessageCircle, 
  X as CloseIcon, Volume2, Loader2, CheckCircle2, AlertCircle, Save, 
  Eraser, Upload, Image, Trash2, Info 
} from 'lucide-react';
import { auth, db } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy,
  getDoc,
  setDoc
} from 'firebase/firestore';
import TeacherView from './components/TeacherView';
import StudentView from './components/StudentView';
import ContactPage from './components/ContactPage';
import PrivacyPolicy from './components/PrivacyPolicy';
import PricingPage from './components/PricingPage';
import { TestData, generateSpeech, hasApiKey, setManualApiKey } from './services/gemini';
import { motion, AnimatePresence } from 'motion/react';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = React.useState<'teacher' | 'student' | 'admin' | 'contact' | 'privacy' | 'pricing'>('teacher');
  const [adminUsers, setAdminUsers] = React.useState<any[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = React.useState(false);
  const [testData, setTestData] = React.useState<TestData | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = React.useState(false);
  const [generatingQuestionIndex, setGeneratingQuestionIndex] = React.useState<number | null>(null);
  const [audioProgress, setAudioProgress] = React.useState(0);
  const [isLoadingTest, setIsLoadingTest] = React.useState(false);
  const [systemKeyAvailable, setSystemKeyAvailable] = React.useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = React.useState(false);
  const [smtpSettings, setSmtpSettings] = React.useState({
    SMTP_HOST: '',
    SMTP_PORT: '587',
    SMTP_USER: '',
    SMTP_PASS: '',
    LOGO_URL: '',
    GATE_LOGO_URL: '',
    APP_NAME: 'ExamAccess Pro',
    SUPPORT_EMAIL: 'shira@lomdot.org',
    GEMINI_API_KEY: ''
  });

  const [appUrl, setAppUrl] = React.useState('');
  const [accessCode, setAccessCode] = React.useState(localStorage.getItem('accessCode') || '');
  const [userEmail, setUserEmail] = React.useState(localStorage.getItem('userEmail') || '');
  const [userName, setUserName] = React.useState('');
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  const [credits, setCredits] = React.useState<number | null>(null);
  const [subscriptionType, setSubscriptionType] = React.useState<'free' | 'monthly' | 'admin'>('free');
  const [userTests, setUserTests] = React.useState<any[]>([]);
  const [isLoadingTests, setIsLoadingTests] = React.useState(false);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [testLanguage, setTestLanguage] = React.useState('Hebrew');
  const [loginError, setLoginError] = React.useState('');
  const [isGoogleLoggingIn, setIsGoogleLoggingIn] = React.useState(false);
  const [authMode, setAuthMode] = React.useState<'login' | 'register' | 'accessCode'>('login');
  const [loginEmail, setLoginEmail] = React.useState('');
  const [loginPassword, setLoginPassword] = React.useState('');
  const [loginName, setLoginName] = React.useState('');
  const [isAuthReady, setIsAuthReady] = React.useState(false);

  React.useEffect(() => {
    // Set persistence to local to ensure session survives refresh
    setPersistence(auth, browserLocalPersistence).catch(err => console.error("Persistence error:", err));

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsLoggedIn(true);
        setUserEmail(user.email || '');
        setUserName(user.displayName || '');
        localStorage.setItem('userEmail', user.email || '');
        localStorage.setItem('userName', user.displayName || '');
      } else {
        setIsLoggedIn(false);
        setUserEmail('');
        setUserName('');
        setCredits(null);
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        localStorage.removeItem('accessCode');
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!isLoggedIn || !userEmail) return;

    const userRef = doc(db, 'users', userEmail.toLowerCase().trim());
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setCredits(data.credits);
        setSubscriptionType(data.subscription_type || 'free');
      }
    });

    return () => unsubscribe();
  }, [isLoggedIn, userEmail]);

  React.useEffect(() => {
    if (!isLoggedIn || !userEmail) return;
    if (subscriptionType !== 'monthly' && userEmail !== 'shira@lomdot.org' && userEmail !== 'shiraroth.z@gmail.com') return;

    const testsQuery = query(
      collection(db, 'tests'), 
      where('ownerEmail', '==', userEmail.toLowerCase().trim()),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(testsQuery, (snapshot) => {
      const tests = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id,
          title: JSON.parse(data.data).title || "מבחן ללא כותרת",
          created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
        };
      });
      setUserTests(tests);
    });

    return () => unsubscribe();
  }, [isLoggedIn, userEmail, subscriptionType]);

  React.useEffect(() => {
    if (!isLoggedIn || !userEmail) return;

    const codesQuery = query(
      collection(db, 'access_codes'), 
      where('redeemedBy', '==', userEmail.toLowerCase().trim()),
      orderBy('redeemedAt', 'desc')
    );

    const unsubscribe = onSnapshot(codesQuery, (snapshot) => {
      const codes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUserCodes(codes);
    });

    return () => unsubscribe();
  }, [isLoggedIn, userEmail]);

  // Sync apiKeyConfigured with settings and system availability
  React.useEffect(() => {
    const hasKey = systemKeyAvailable || (!!smtpSettings.GEMINI_API_KEY && smtpSettings.GEMINI_API_KEY.length > 10);
    setApiKeyConfigured(hasKey);
    if (smtpSettings.GEMINI_API_KEY) {
      setManualApiKey(smtpSettings.GEMINI_API_KEY);
    }
  }, [systemKeyAvailable, smtpSettings.GEMINI_API_KEY]);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        setSystemKeyAvailable(data.systemKeyAvailable);
        setAppUrl(data.appUrl);
        if (data.apiKey) {
          setManualApiKey(data.apiKey);
          // Also update smtpSettings so the UI shows it if needed
          setSmtpSettings(prev => ({ ...prev, GEMINI_API_KEY: data.apiKey }));
        }
      }
    } catch (e) {
      console.error("Failed to fetch system config", e);
    }
  };
  
  // Redemption States
  const [redeemCode, setRedeemCode] = React.useState('');
  const [isRedeeming, setIsRedeeming] = React.useState(false);
  const [redeemError, setRedeemError] = React.useState('');
  const [redeemSuccess, setRedeemSuccess] = React.useState(false);
  const [userCodes, setUserCodes] = React.useState<any[]>([]);
  const [showCreditsModal, setShowCreditsModal] = React.useState(false);
  const [showProfileModal, setShowProfileModal] = React.useState(false);

  // Niqqud Picker States
  const [niqqudTarget, setNiqqudTarget] = React.useState<{ 
    element: HTMLTextAreaElement | HTMLInputElement, 
    pos: number,
    type: 'intro' | 'question',
    index?: number
  } | null>(null);
  const [niqqudPos, setNiqqudPos] = React.useState({ x: 100, y: 100 });

  const niqqudChars = [
    { char: '\u05B0', name: 'שווא' },
    { char: '\u05B4', name: 'חיריק' },
    { char: '\u05B5', name: 'צירה' },
    { char: '\u05B6', name: 'סגול' },
    { char: '\u05B7', name: 'פתח' },
    { char: '\u05B8', name: 'קמץ' },
    { char: '\u05B9', name: 'חולם' },
    { char: '\u05BB', name: 'קובוץ' },
    { char: '\u05BC', name: 'דגש/שורוק' },
    { char: '\u05C1', name: 'שין ימנית' },
    { char: '\u05C2', name: 'שין שמאלית' },
  ];

  const [isNiqqudOpen, setIsNiqqudOpen] = React.useState(false);

  const [isSimulating, setIsSimulating] = React.useState(false);
  const [isSavingSettings, setIsSavingSettings] = React.useState(false);
  const [logoError, setLogoError] = React.useState(false);

  const [showSuccessModal, setShowSuccessModal] = React.useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success') {
      setShowSuccessModal(true);
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  React.useEffect(() => {
    fetchConfig();
  }, []);

  React.useEffect(() => {
    fetchSettings();
  }, [userEmail]);

  const fetchSettings = async () => {
    try {
      const pubResponse = await fetch('/api/public/settings');
      if (pubResponse.ok) {
        const pubData = await pubResponse.json();
        setSmtpSettings(prev => ({ 
          ...prev, 
          ...pubData
        }));
        
        if (pubData.GEMINI_API_KEY) {
          setManualApiKey(pubData.GEMINI_API_KEY);
        }
      }
    } catch (e) {
      console.error("Failed to fetch public settings", e);
    }
  };

  // Real-time settings for admins
  React.useEffect(() => {
    if (!userEmail || (userEmail !== 'shiraroth.z@gmail.com' && userEmail !== 'shira@lomdot.org')) {
      return;
    }

    const unsubscribe = onSnapshot(collection(db, 'settings'), (snapshot) => {
      const newSettings: any = { ...smtpSettings };
      snapshot.forEach(doc => {
        newSettings[doc.id] = doc.data().value;
      });
      setSmtpSettings(prev => ({ ...prev, ...newSettings }));
      
      if (newSettings.GEMINI_API_KEY) {
        setManualApiKey(newSettings.GEMINI_API_KEY);
      }
    });

    return () => unsubscribe();
  }, [userEmail]);

  const saveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, settings: smtpSettings })
      });
      if (response.ok) {
        if (smtpSettings.GEMINI_API_KEY) {
          setManualApiKey(smtpSettings.GEMINI_API_KEY);
        }
        alert('הגדרות המייל נשמרו בהצלחה!');
      }
    } catch (e) {
      console.error("Failed to save settings", e);
      alert('שגיאה בשמירת ההגדרות');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'LOGO_URL' | 'GATE_LOGO_URL' = 'LOGO_URL') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('הקובץ גדול מדי. אנא העלה תמונה עד 2MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadstart = () => setIsSavingSettings(true);
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result && result.startsWith('data:image')) {
          setSmtpSettings(prev => ({ ...prev, [field]: result }));
          setLogoError(false);
        }
        setIsSavingSettings(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const fetchAdminUsers = async () => {
    if (userEmail !== 'shiraroth.z@gmail.com' && userEmail !== 'shira@lomdot.org') return;
    setIsLoadingAdmin(true);
    try {
      const response = await fetch(`/api/admin/users?email=${userEmail}`);
      if (response.ok) {
        const data = await response.json();
        setAdminUsers(data);
      }
    } catch (e) {
      console.error("Failed to fetch admin users", e);
    } finally {
      setIsLoadingAdmin(false);
    }
  };

  const updateCredits = async (targetEmail: string, newCredits: number) => {
    try {
      const response = await fetch('/api/admin/update-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: userEmail, targetEmail, credits: newCredits })
      });
      if (response.ok) {
        setAdminUsers(prev => prev.map(u => u.email === targetEmail ? { ...u, credits: newCredits } : u));
      }
    } catch (e) {
      console.error("Failed to update credits", e);
    }
  };

  const simulatePurchase = async () => {
    try {
      const response = await fetch('/api/admin/simulate-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, amount: "50", adminEmail: userEmail })
      });
      if (response.ok) {
        const data = await response.json();
        alert(`רכישה סומלצה בהצלחה! קוד חדש: ${data.code}. הקוד נשלח גם למייל שלך.`);
        fetchUserInfo(userEmail);
        if (activeTab === 'admin') fetchAdminUsers();
      }
    } catch (e) {
      console.error("Failed to simulate purchase", e);
      alert('שגיאה בסימולציית רכישה');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('accessCode'); 
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userName');
      setIsLoggedIn(false); 
      setAccessCode('');
      setUserName('');
      setUserEmail('');
      setCredits(null);
      setShowProfileModal(false);
      setActiveTab('teacher');
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const fetchUserInfo = async (code: string) => {
    setIsVerifying(true);
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (response.ok) {
        const data = await response.json();
        setCredits(data.credits);
        setSubscriptionType(data.subscriptionType || 'free');
        setIsLoggedIn(true);
        setAccessCode(code);
        setUserEmail(data.email);
        setUserName(data.name || '');
        localStorage.setItem('accessCode', code);
        localStorage.setItem('userEmail', data.email);
        localStorage.setItem('userName', data.name || '');
        if (data.subscriptionType === 'monthly' || data.email === 'shira@lomdot.org' || data.email === 'shiraroth.z@gmail.com') {
          fetchUserTests(data.email);
        }
      } else {
        const isEmail = code.includes('@');
        console.warn("Verification failed for code:", code);
        if (isEmail) {
          setLoginError('משתמש לא נמצא. אם זו הפעם הראשונה, התחברי עם גוגל או הירשמי.');
        } else {
          setLoginError('קוד גישה לא תקין או שכבר נוצל');
        }
        setIsLoggedIn(false);
        localStorage.removeItem('accessCode');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        setAccessCode('');
        setUserName('');
      }
    } catch (e) {
      console.error("Failed to fetch user info", e);
      setLoginError('שגיאת תקשורת');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLogin = async () => {
    if (authMode === 'accessCode') {
      if (!accessCode.trim()) return;
      setIsVerifying(true);
      setLoginError('');
      await fetchUserInfo(accessCode.trim());
    } else if (authMode === 'login') {
      if (!loginEmail || !loginPassword) return;
      setIsVerifying(true);
      setLoginError('');
      try {
        await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
        // onAuthStateChanged will handle the state update
      } catch (error: any) {
        console.error("Login error:", error);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
          setLoginError('אימייל או סיסמה לא נכונים');
        } else {
          setLoginError('שגיאה בהתחברות. נסה שוב מאוחר יותר.');
        }
      } finally {
        setIsVerifying(false);
      }
    } else if (authMode === 'register') {
      if (!loginEmail || !loginPassword) return;
      setIsVerifying(true);
      setLoginError('');
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
        await updateProfile(userCredential.user, { displayName: loginName });
        
        // Create user document in Firestore
        await setDoc(doc(db, 'users', loginEmail.toLowerCase().trim()), {
          email: loginEmail.toLowerCase().trim(),
          name: loginName,
          credits: 5,
          createdAt: new Date(),
          last_renewal_date: new Date()
        });
        
        // onAuthStateChanged will handle the state update
      } catch (error: any) {
        console.error("Registration error:", error);
        if (error.code === 'auth/email-already-in-use') {
          setLoginError('האימייל כבר נמצא בשימוש');
        } else {
          setLoginError('שגיאה בהרשמה. נסה שוב מאוחר יותר.');
        }
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleGuestLogin = async () => {
    setIsVerifying(true);
    setLoginError('');
    try {
      const response = await fetch('/api/auth/guest-login', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('accessCode', data.email);
        localStorage.setItem('userEmail', data.email);
        localStorage.setItem('userName', data.name);
        setIsLoggedIn(true);
        setUserEmail(data.email);
        setUserName(data.name);
        setCredits(data.credits);
        setAccessCode(data.email);
      } else {
        setLoginError('שגיאה בכניסת אורח');
      }
    } catch (error) {
      setLoginError('שגיאת תקשורת');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoggingIn(true);
    setLoginError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Update state immediately to avoid flicker
      setIsLoggedIn(true);
      setUserEmail(user.email || '');
      setUserName(user.displayName || '');
      localStorage.setItem('userEmail', user.email || '');
      localStorage.setItem('userName', user.displayName || '');

      // Ensure user document exists in Firestore
      const userRef = doc(db, 'users', user.email!.toLowerCase().trim());
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          email: user.email!.toLowerCase().trim(),
          name: user.displayName,
          credits: 5,
          createdAt: new Date(),
          last_renewal_date: new Date()
        });
      }
      
      // onAuthStateChanged will handle the state update
    } catch (error: any) {
      console.error("Google Login error:", error);
      setLoginError('שגיאה בהתחברות עם גוגל');
    } finally {
      setIsGoogleLoggingIn(false);
    }
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim() || !userEmail) return;
    setIsRedeeming(true);
    setRedeemError('');
    setRedeemSuccess(false);
    try {
      const response = await fetch('/api/auth/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, code: redeemCode.trim() })
      });
      const data = await response.json();
      if (response.ok) {
        setRedeemSuccess(true);
        setRedeemCode('');
      } else {
        setRedeemError(data.error || 'שגיאה במימוש הקוד');
      }
    } catch (e) {
      setRedeemError('שגיאת תקשורת');
    } finally {
      setIsRedeeming(false);
    }
  };

  const fetchUserCodes = async () => {
    // Handled by onSnapshot
  };

  const fetchUserTests = async (email: string) => {
    // Handled by onSnapshot
  };

  const handleNiqqudSelect = (char: string) => {
    if (!niqqudTarget || !testData) return;
    const { element, type, index } = niqqudTarget;
    
    const val = element.value;
    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    
    let newVal;
    let nextPos;
    
    if (char === 'DELETE') {
      let deleteStart = start;
      let deleteEnd = end;
      
      if (start === end) {
        while (deleteStart > 0 && val[deleteStart-1] >= '\u05B0' && val[deleteStart-1] <= '\u05C7') {
          deleteStart--;
        }
        while (deleteEnd < val.length && val[deleteEnd] >= '\u05B0' && val[deleteEnd] <= '\u05C7') {
          deleteEnd++;
        }
        // If still no niqqud found at cursor, try to delete niqqud of previous char
        if (deleteStart === deleteEnd && deleteStart > 0) {
           // Look back for niqqud
           let lookBack = deleteStart - 1;
           while (lookBack >= 0 && val[lookBack] >= '\u05B0' && val[lookBack] <= '\u05C7') {
             lookBack--;
           }
           // deleteStart is where the char is, lookBack is before niqqud
           // This is getting complex, let's just delete the niqqud immediately before cursor
           if (val[deleteStart-1] >= '\u05B0' && val[deleteStart-1] <= '\u05C7') {
             deleteStart--;
           }
        }
      }
      
      newVal = val.substring(0, deleteStart) + val.substring(deleteEnd);
      nextPos = deleteStart;
    } else {
      if (start !== end) {
        // Highlighted: apply to first char of selection
        const firstChar = val.substring(start, start + 1);
        newVal = val.substring(0, start) + firstChar + char + val.substring(start + 1);
        nextPos = start + 2;
      } else {
        // No selection: insert at cursor
        newVal = val.substring(0, start) + char + val.substring(start);
        nextPos = start + 1;
      }
    }
    
    if (type === 'intro') {
      setTestData({ ...testData, introduction: newVal });
    } else if (type === 'question' && index !== undefined) {
      const newQuestions = [...testData.questions];
      newQuestions[index] = { ...newQuestions[index], text: newVal };
      setTestData({ ...testData, questions: newQuestions });
    }
    
    setTimeout(() => {
      element.focus();
      element.setSelectionRange(nextPos, nextPos);
      setNiqqudTarget({ ...niqqudTarget, pos: nextPos });
    }, 10);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // If we click inside the picker, don't do anything (let drag handle it)
    const isPickerClick = target.closest('.niqqud-picker');
    if (isPickerClick) return;

    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      const el = target as HTMLTextAreaElement | HTMLInputElement;
      if (el.dataset.niqqud === 'true') {
        const type = el.getAttribute('data-type') as 'intro' | 'question';
        const indexStr = el.getAttribute('data-index');
        const index = indexStr ? parseInt(indexStr) : undefined;
        
        setNiqqudTarget({ element: el, pos: el.selectionStart || 0, type, index });
        
        // Only update position if the picker is not already open
        if (!isNiqqudOpen) {
          const centerX = window.innerWidth / 2 - 160;
          const centerY = window.innerHeight / 2 - 200;
          setNiqqudPos({ x: Math.max(20, centerX), y: Math.max(20, centerY) });
          setIsNiqqudOpen(true);
        }
      }
    } else {
      // Clicked outside everything - we can close if we want, but let's keep it open if it's already open
      // Unless the user explicitly clicks away from an input
    }
  };

  const copyStudentLink = async () => {
    if (!testData) return;
    try {
      const response = await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: testData, email: userEmail })
      });
      if (response.ok) {
        const { id } = await response.json();
        fetchUserInfo(userEmail); // Refresh credits
        
        let url;
        if (appUrl) {
          url = new URL(appUrl);
        } else {
          url = new URL(window.location.href);
        }
        
        url.searchParams.set('mode', 'student');
        url.searchParams.set('id', id);
        navigator.clipboard.writeText(url.toString());
        alert('הקישור לתלמיד הועתק ללוח!');
      }
    } catch (error) {
      alert('חלה שגיאה ביצירת הקישור.');
    }
  };

  const generateIntroAudio = async () => {
    if (!testData || !testData.introduction) return;
    setIsGeneratingAudio(true);
    try {
      const { url, base64 } = await generateSpeech(testData.introduction, testLanguage);
      setTestData({ ...testData, introAudioUrl: url, introAudioBase64: base64 });
    } catch (error) {
      console.error("Failed to generate intro audio:", error);
      alert("חלה שגיאה בהפקת הקול להקדמה.");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const generateSingleAudio = async (index: number) => {
    if (!testData) return;
    setGeneratingQuestionIndex(index);
    const newQuestions = [...testData.questions];
    const q = newQuestions[index];
    try {
      const { url, base64 } = await generateSpeech(q.text, testLanguage);
      newQuestions[index] = { ...q, audioUrl: url, audioBase64: base64 };
      setTestData({ ...testData, questions: newQuestions });
    } catch (error) {
      console.error("Failed to generate audio:", error);
      alert("חלה שגיאה בהפקת הקול לשאלה זו.");
    } finally {
      setGeneratingQuestionIndex(null);
    }
  };

  const preGenerateAudio = async () => {
    if (!testData) return;
    setIsGeneratingAudio(true);
    setAudioProgress(0);
    
    try {
      const totalItems = testData.questions.length + (testData.introduction ? 1 : 0);
      let completedItems = 0;

      // Generate intro audio first if exists
      if (testData.introduction && !testData.introAudioBase64) {
        const { url, base64 } = await generateSpeech(testData.introduction, testLanguage);
        testData.introAudioUrl = url;
        testData.introAudioBase64 = base64;
        completedItems++;
        setAudioProgress(Math.round((completedItems / totalItems) * 100));
      }

      const newQuestions = [...testData.questions];
      for (let i = 0; i < newQuestions.length; i++) {
        const q = newQuestions[i];
        if (!q.audioBase64) {
          const { url, base64 } = await generateSpeech(q.text, testLanguage);
          newQuestions[i] = { ...q, audioUrl: url, audioBase64: base64 };
          // Update state incrementally
          setTestData({ ...testData, questions: [...newQuestions] });
        }
        completedItems++;
        setAudioProgress(Math.round((completedItems / totalItems) * 100));
      }
    } catch (error) {
      console.error("Pre-generation error:", error);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const downloadTest = () => {
    if (!testData) return;
    const htmlContent = `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${testData.title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Assistant', sans-serif; }</style>
</head>
<body class="p-6 bg-slate-50">
    <div class="max-w-3xl mx-auto space-y-6">
        <h1 class="text-3xl font-bold text-slate-900 border-b pb-4">${testData.title}</h1>
        ${testData.questions.map((q, i) => `
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div class="flex items-start gap-4">
                <button onclick="playAudio('${q.id}')" class="w-12 h-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                </button>
                <div class="flex-1">
                    <div class="text-xs font-bold text-slate-400 mb-1">שאלה ${i+1}</div>
                    <div class="text-lg">${q.text}</div>
                    ${q.options ? `<div class="mt-4 space-y-2">${q.options.map(o => `<div class="p-3 bg-slate-50 rounded-xl border border-slate-100">${o}</div>`).join('')}</div>` : ''}
                </div>
            </div>
            ${q.audioBase64 ? `<audio id="audio-${q.id}" src="data:audio/wav;base64,${q.audioBase64}"></audio>` : ''}
        </div>
        `).join('')}
    </div>
    <script>
        function playAudio(id) {
            const a = document.getElementById('audio-' + id);
            if (a) a.play();
        }
    </script>
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${testData.title}-נגיש.html`;
    a.click();
  };

  React.useEffect(() => {
    const savedEmail = localStorage.getItem('userEmail');
    if (savedEmail) {
      fetchUserInfo(savedEmail);
    }
  }, []);

  React.useEffect(() => {
    fetchSettings();
    if (activeTab === 'admin') fetchAdminUsers();
  }, [activeTab, userEmail]);

  React.useEffect(() => {
    const handleAuthSuccess = (data: any) => {
      const email = data.email;
      const name = data.name;
      if (email) {
        setUserEmail(email);
        localStorage.setItem('userEmail', email);
        if (name) {
          setUserName(name);
          localStorage.setItem('userName', name);
        }
        setIsLoggedIn(true);
        fetchUserInfo(email);
      }
      setIsGoogleLoggingIn(false);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        handleAuthSuccess(event.data);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'google_auth_success' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.type === 'OAUTH_AUTH_SUCCESS') {
            handleAuthSuccess(data);
            localStorage.removeItem('google_auth_success');
          }
        } catch (e) {
          console.error("Failed to parse storage auth data", e);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const { isStudentOnly, testId } = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return { isStudentOnly: params.get('mode') === 'student', testId: params.get('id') };
  }, []);

  React.useEffect(() => {
    if (testId) {
      setIsLoadingTest(true);
      fetch(`/api/tests/${testId}`).then(r => r.json()).then(data => {
        setTestData(data);
        if (isStudentOnly) setActiveTab('student');
      }).finally(() => setIsLoadingTest(false));
    }
  }, [testId]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans pb-20 text-right" dir="rtl">
      {/* Profile Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowProfileModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
              <div className="bg-slate-900 p-8 text-white">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-teal-500 rounded-2xl flex items-center justify-center text-2xl font-black">{userName?.charAt(0) || 'U'}</div>
                  <div>
                    <h3 className="text-xl font-black">{userName || 'משתמש'}</h3>
                    <p className="text-teal-400 text-sm font-bold">{userEmail}</p>
                  </div>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">יתרת מבחנים</span>
                    <span className="text-xl font-black text-emerald-600">{credits ?? '...'}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">סוג מנוי</span>
                    <span className="text-xl font-black text-teal-600">
                      {subscriptionType === 'monthly' ? 'מנוי Pro' : subscriptionType === 'admin' ? 'מנהל' : 'מנוי חינם'}
                    </span>
                  </div>
                </div>
                <button onClick={() => { setShowProfileModal(false); setShowCreditsModal(true); }} className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all border border-slate-100 group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Key size={20} /></div>
                    <span className="font-bold text-slate-700">מימוש קוד גישה</span>
                  </div>
                  <ChevronLeft size={18} className="text-slate-300" />
                </button>
                <button onClick={() => { setShowProfileModal(false); setActiveTab('pricing'); }} className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all border border-slate-100 group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><CreditCard size={20} /></div>
                    <span className="font-bold text-slate-700">רכישת קרדיטים</span>
                  </div>
                  <ChevronLeft size={18} className="text-slate-300" />
                </button>
                <button onClick={handleLogout} className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-red-50 text-red-600 transition-all border border-red-100"><LogOut size={20} /><span className="font-bold">התנתקות</span></button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Credits Modal */}
      <AnimatePresence>
        {showCreditsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-900">ניהול קרדיטים</h3>
                <button onClick={() => setShowCreditsModal(false)} className="p-2 hover:bg-white rounded-xl text-slate-400"><CloseIcon size={20} /></button>
              </div>
              <div className="p-6 space-y-6">
                <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 flex items-center justify-between">
                  <div><p className="text-sm text-emerald-600 font-bold">יתרה נוכחית</p><p className="text-3xl font-black text-emerald-700">{credits ?? 0} מבחנים</p></div>
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm"><BookOpen size={24} /></div>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-700">מימוש קוד גישה</label>
                  <div className="flex gap-2">
                    <input type="text" value={redeemCode} onChange={(e) => setRedeemCode(e.target.value.toUpperCase())} placeholder="הכנס קוד..." className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold" />
                    <button onClick={handleRedeem} disabled={isRedeeming || !redeemCode.trim()} className="px-6 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 disabled:opacity-50 min-w-[80px]">{isRedeeming ? <Loader2 size={20} className="animate-spin" /> : 'ממש'}</button>
                  </div>
                  {redeemError && <p className="text-xs text-red-500 font-bold">{redeemError}</p>}
                  {redeemSuccess && <p className="text-xs text-emerald-600 font-bold">הקוד מומש בהצלחה!</p>}
                </div>
                <div className="pt-6 border-t border-slate-100">
                  <a href="https://meshulam.co.il/purchase/exam-pro-credits" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"><span>רכישת מבחנים נוספים</span><Download size={20} className="rotate-180" /></a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      {(!isStudentOnly || !testId) && (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 py-2 flex items-center justify-between text-[13px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50">
            {isLoggedIn && (
              <div className="flex items-center gap-3 sm:gap-6">
                <button onClick={() => setActiveTab('pricing')} className={`hover:text-teal-600 transition-colors ${activeTab === 'pricing' ? 'text-teal-600' : ''}`}>חבילות ומבצעים</button>
                <button onClick={() => setActiveTab('contact')} className={`hover:text-teal-600 transition-colors ${activeTab === 'contact' ? 'text-teal-600' : ''}`}>צור קשר</button>
                { (userEmail === 'shiraroth.z@gmail.com' || userEmail === 'shira@lomdot.org' || subscriptionType === 'admin') && (
                  <button onClick={() => setActiveTab('admin')} className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${activeTab === 'admin' ? 'bg-teal-600 text-white' : 'text-teal-600 bg-teal-50 hover:bg-teal-100'}`}>
                    <Settings size={14} />
                    <span>ניהול</span>
                  </button>
                )}
              </div>
            )}
            {!isLoggedIn && (
              <div className="flex items-center gap-6">
                <button onClick={() => setActiveTab('pricing')} className={`hover:text-teal-600 ${activeTab === 'pricing' ? 'text-teal-600' : ''}`}>חבילות ומבצעים</button>
                <button onClick={() => setActiveTab('contact')} className={`hover:text-teal-600 ${activeTab === 'contact' ? 'text-teal-600' : ''}`}>צור קשר</button>
              </div>
            )}
            {isLoggedIn && (
              <div className="flex items-center gap-4">
                <span className="hidden sm:inline">שלום, <span className="text-slate-600">{userName || 'משתמש'}</span></span>
                <button onClick={() => setShowProfileModal(true)} className="text-teal-600 hover:text-teal-700 flex items-center gap-1"><User size={12} />הפרופיל שלי</button>
              </div>
            )}
          </div>
          <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-4 cursor-pointer" onClick={() => setActiveTab('teacher')}>
                <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg overflow-hidden">
                  {smtpSettings.LOGO_URL ? (
                    <img src={smtpSettings.LOGO_URL} alt="Logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <BookOpen size={24} />
                  )}
                </div>
                <div className="inline-flex flex-col items-start">
                  <div className="flex items-center gap-0 font-black text-2xl tracking-tighter leading-none" dir="ltr">
                    {smtpSettings.APP_NAME === 'ExamAccess Pro' ? (
                      <>
                        <span className="text-slate-900">Exam</span>
                        <span className="text-teal-600">Access</span>
                      </>
                    ) : (
                      <span className="text-slate-900">{smtpSettings.APP_NAME}</span>
                    )}
                  </div>
                  <div className="w-full flex justify-between text-[9px] text-slate-900 font-bold uppercase mt-1 px-[1px]">
                    <span>ה</span><span>נ</span><span>ג</span><span>ש</span><span>ת</span>
                    <span className="w-1"></span>
                    <span>מ</span><span>ב</span><span>ח</span><span>נ</span><span>י</span><span>ם</span>
                    <span className="w-1"></span>
                    <span>ב</span><span>ק</span><span>ל</span><span>י</span><span>ק</span>
                  </div>
                </div>
              </div>
              {isLoggedIn && (
                <nav className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl border border-slate-100">
                  <button onClick={() => setActiveTab('teacher')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black transition-all ${activeTab === 'teacher' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500'}`}><GraduationCap size={18} />אזור מורה</button>
                  <button onClick={() => setActiveTab('student')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black transition-all ${activeTab === 'student' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500'}`}><User size={18} />אזור תלמיד</button>
                </nav>
              )}
            </div>
            {isLoggedIn && (
              <button onClick={() => setShowCreditsModal(true)} className="flex items-center gap-2 sm:gap-4 bg-white px-3 sm:px-5 py-2 rounded-2xl border border-slate-100 hover:border-teal-200 transition-all group shadow-sm">
                <div className="flex flex-col text-right">
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">יתרת מבחנים</span>
                  <span className="text-xs sm:text-sm font-black text-emerald-600">{credits !== null ? credits : '...'}</span>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Star size={16} className="sm:w-5 sm:h-5" fill="currentColor" />
                </div>
              </button>
            )}
          </div>
        </header>
      )}

      <main className={`max-w-4xl mx-auto px-6 ${isStudentOnly ? 'py-6' : 'py-12'}`} onMouseDown={handleMouseDown}>
        {!isAuthReady ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="animate-spin text-teal-600" size={48} />
            <p className="text-slate-600 font-medium">בודק חיבור...</p>
          </div>
        ) : isLoadingTest ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4"><Loader2 className="animate-spin text-teal-600" size={48} /><p className="text-slate-600 font-medium">טוען את המבחן...</p></div>
        ) : (
          <AnimatePresence mode="wait">
            {!isLoggedIn && !isStudentOnly ? (
              <motion.div key="login" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md mx-auto bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 text-center space-y-8">
                <div className="flex flex-col items-center gap-6">
                  <div className="w-32 h-32 flex items-center justify-center overflow-hidden">
                    {smtpSettings.GATE_LOGO_URL ? (
                      <img src={smtpSettings.GATE_LOGO_URL} alt="Gate Logo" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <div className="w-24 h-24 bg-slate-900 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl">
                        <BookOpen size={48} />
                      </div>
                    )}
                  </div>
                  <div className="inline-flex flex-col items-center">
                    <div className="flex items-center gap-0 font-black text-5xl tracking-tighter leading-none mb-1" dir="ltr">
                      {smtpSettings.APP_NAME === 'ExamAccess Pro' ? (
                        <>
                          <span className="text-slate-900">Exam</span>
                          <span className="text-teal-600">Access</span>
                        </>
                      ) : (
                        <span className="text-slate-900">{smtpSettings.APP_NAME}</span>
                      )}
                    </div>
                    <div className="w-full flex justify-between text-[11px] font-bold text-slate-900 uppercase mt-2 px-1">
                      <span>ה</span><span>נ</span><span>ג</span><span>ש</span><span>ת</span>
                      <span className="w-2"></span>
                      <span>מ</span><span>ב</span><span>ח</span><span>נ</span><span>י</span><span>ם</span>
                      <span className="w-2"></span>
                      <span>ב</span><span>ק</span><span>ל</span><span>י</span><span>ק</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {authMode === 'accessCode' ? (
                    <input type="text" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="קוד גישה" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center text-xl font-bold tracking-widest outline-none focus:border-teal-500" />
                  ) : (
                    <div className="space-y-3">
                      {authMode === 'register' && (
                        <>
                          <input type="text" value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="שם מלא" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-right outline-none focus:border-teal-500" />
                          <button onClick={() => setActiveTab('pricing')} className="w-full bg-amber-50 text-amber-700 py-3 rounded-2xl font-bold text-sm hover:bg-amber-100 transition-all flex items-center justify-center gap-2 border border-amber-100">
                            <Star size={16} fill="currentColor" />
                            מעדיפים לרכוש חבילה מראש? צפו במבצעים
                          </button>
                        </>
                      )}
                      <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="אימייל" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-right outline-none focus:border-teal-500" />
                      <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="סיסמה" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-right outline-none focus:border-teal-500" />
                    </div>
                  )}
                  {loginError && <p className="text-red-500 text-sm font-bold bg-red-50 p-2 rounded-xl border border-red-100">{loginError}</p>}
                  <button onClick={handleLogin} disabled={isVerifying} className="w-full bg-teal-600 text-white py-5 rounded-2xl font-bold text-xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-200 disabled:opacity-50 flex items-center justify-center gap-2">
                    {isVerifying ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? 'התחברות' : authMode === 'register' ? 'הרשמה' : 'כניסה')}
                  </button>
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <div className="flex justify-center gap-4 text-sm font-bold">
                      {authMode === 'login' ? (
                        <><button onClick={() => setAuthMode('register')} className="text-teal-600 hover:underline">הרשמה</button><span className="text-slate-300">|</span><button onClick={() => setAuthMode('accessCode')} className="text-slate-500">כניסה עם קוד</button></>
                      ) : <button onClick={() => setAuthMode('login')} className="text-teal-600 hover:underline">כבר יש לי חשבון</button>}
                    </div>
                    <button onClick={() => setActiveTab('pricing')} className="text-xs font-bold text-slate-400 hover:text-teal-600 transition-colors flex items-center gap-1">
                      <CreditCard size={12} />
                      לצפייה בחבילות ומבצעים
                    </button>
                  </div>
                  <div className="relative py-4"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400 font-bold">או התחבר עם</span></div></div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={handleGoogleLogin} disabled={isGoogleLoggingIn} className="w-full bg-white border-2 border-slate-100 text-slate-700 py-4 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                      {isGoogleLoggingIn ? <Loader2 className="animate-spin" size={16} /> : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />} Google
                    </button>
                    <button onClick={handleGuestLogin} disabled={isVerifying} className="w-full bg-slate-100 border-2 border-slate-200 text-slate-700 py-4 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                      <User size={16} /> כניסת אורח
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'admin' ? (
              <motion.div key="admin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3"><Settings size={28} className="text-teal-600" />ניהול משתמשים</h2>
                  <div className="flex gap-4">
                    <button onClick={simulatePurchase} className="text-sm font-bold bg-teal-50 text-teal-600 px-4 py-2 rounded-xl border border-teal-100 hover:bg-teal-100 transition-colors">סמלץ רכישה (50 קרדיטים)</button>
                    <button onClick={fetchAdminUsers} className="text-sm font-bold text-teal-600 hover:underline">רענן</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead><tr className="border-b border-slate-100"><th className="py-4 px-2 text-slate-400 font-bold text-xs uppercase">שם</th><th className="py-4 px-2 text-slate-400 font-bold text-xs uppercase">אימייל</th><th className="py-4 px-2 text-slate-400 font-bold text-xs uppercase text-center">קרדיטים</th></tr></thead>
                    <tbody>
                      {adminUsers.map(u => (
                        <tr key={u.email} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="py-4 px-2 font-bold text-slate-700">{u.name || 'ללא שם'}</td>
                          <td className="py-4 px-2 text-slate-500 text-sm">{u.email}</td>
                          <td className="py-4 px-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => updateCredits(u.email, Math.max(0, u.credits - 1))} className="w-6 h-6 bg-slate-100 rounded-full">-</button>
                              <span className="bg-teal-50 text-teal-600 px-3 py-1 rounded-full text-xs font-black">{u.credits}</span>
                              <button onClick={() => updateCredits(u.email, u.credits + 1)} className="w-6 h-6 bg-slate-100 rounded-full">+</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-12 pt-12 border-t border-slate-100 space-y-6">
                  <h3 className="text-xl font-bold text-slate-900">הגדרות מערכת</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-3xl">
                    <div className="space-y-2"><label className="text-sm font-bold">שם האפליקציה</label><input type="text" value={smtpSettings.APP_NAME} onChange={e => setSmtpSettings({...smtpSettings, APP_NAME: e.target.value})} className="w-full p-3 bg-white border rounded-xl" /></div>
                    <div className="space-y-2"><label className="text-sm font-bold">אימייל תמיכה</label><input type="text" value={smtpSettings.SUPPORT_EMAIL} onChange={e => setSmtpSettings({...smtpSettings, SUPPORT_EMAIL: e.target.value})} className="w-full p-3 bg-white border rounded-xl" /></div>
                    
                    <div className="space-y-3">
                      <label className="text-sm font-bold">לוגו האתר (בראש העמוד)</label>
                      <div className="flex items-center gap-4 p-4 bg-white border rounded-2xl">
                        <div className="w-16 h-16 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden">
                          {smtpSettings.LOGO_URL ? (
                            <img src={smtpSettings.LOGO_URL} alt="Logo Preview" className="max-w-full max-h-full object-contain" />
                          ) : (
                            <Image size={24} className="text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1">
                          <label className="cursor-pointer bg-teal-50 text-teal-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-teal-100 transition-colors inline-block">
                            העלה לוגו
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, 'LOGO_URL')} />
                          </label>
                          <p className="text-[10px] text-slate-400 mt-1">מומלץ: PNG שקוף, עד 2MB</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-bold">לוגו שער (במסך הכניסה)</label>
                      <div className="flex items-center gap-4 p-4 bg-white border rounded-2xl">
                        <div className="w-16 h-16 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden">
                          {smtpSettings.GATE_LOGO_URL ? (
                            <img src={smtpSettings.GATE_LOGO_URL} alt="Gate Logo Preview" className="max-w-full max-h-full object-contain" />
                          ) : (
                            <BookOpen size={24} className="text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1">
                          <label className="cursor-pointer bg-teal-50 text-teal-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-teal-100 transition-colors inline-block">
                            העלה לוגו שער
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, 'GATE_LOGO_URL')} />
                          </label>
                          <p className="text-[10px] text-slate-400 mt-1">מומלץ: תמונה מרובעת, עד 2MB</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="col-span-full border-t border-slate-200 pt-6 mt-2">
                      <h4 className="text-sm font-black text-slate-400 uppercase mb-4">הגדרות בינה מלאכותית (Gemini API)</h4>
                      <div className="space-y-4">
                        {systemKeyAvailable ? (
                          <div className="bg-teal-50 border border-teal-100 p-4 rounded-2xl flex items-center gap-3">
                            <div className="w-10 h-10 bg-teal-500 rounded-full flex items-center justify-center text-white shrink-0">
                              <CheckCircle2 size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-teal-900">מפתח מערכת מאובטח פעיל</p>
                              <p className="text-xs text-teal-700">האתר משתמש במפתח המובנה והמאובטח של המערכת. אין צורך להזין מפתח ידני.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500">מפתח API של Gemini (ידני)</label>
                            <input 
                              type="password" 
                              value={smtpSettings.GEMINI_API_KEY} 
                              onChange={e => setSmtpSettings({...smtpSettings, GEMINI_API_KEY: e.target.value})} 
                              placeholder="הכנס את מפתח ה-API שלך כאן" 
                              className="w-full p-3 bg-white border rounded-xl text-sm font-mono" 
                            />
                            <p className="text-[10px] text-slate-400">המפתח הזה ישמש את כל המשתמשים באתר לביצוע הנגשה והקראה קולית.</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="col-span-full border-t border-slate-200 pt-6 mt-2">
                      <h4 className="text-sm font-black text-slate-400 uppercase mb-4">הגדרות שרת מייל (SMTP)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2"><label className="text-xs font-bold text-slate-500">שרת (Host)</label><input type="text" value={smtpSettings.SMTP_HOST} onChange={e => setSmtpSettings({...smtpSettings, SMTP_HOST: e.target.value})} placeholder="smtp.gmail.com" className="w-full p-3 bg-white border rounded-xl text-sm" /></div>
                        <div className="space-y-2"><label className="text-xs font-bold text-slate-500">פורט (Port)</label><input type="text" value={smtpSettings.SMTP_PORT} onChange={e => setSmtpSettings({...smtpSettings, SMTP_PORT: e.target.value})} placeholder="587" className="w-full p-3 bg-white border rounded-xl text-sm" /></div>
                        <div className="space-y-2"><label className="text-xs font-bold text-slate-500">משתמש (User)</label><input type="text" value={smtpSettings.SMTP_USER} onChange={e => setSmtpSettings({...smtpSettings, SMTP_USER: e.target.value})} className="w-full p-3 bg-white border rounded-xl text-sm" /></div>
                        <div className="space-y-2"><label className="text-xs font-bold text-slate-500">סיסמה (Password)</label><input type="password" value={smtpSettings.SMTP_PASS} onChange={e => setSmtpSettings({...smtpSettings, SMTP_PASS: e.target.value})} className="w-full p-3 bg-white border rounded-xl text-sm" /></div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-3">הערה: עבור Gmail יש להשתמש ב-"סיסמת אפליקציה" (App Password) ולא בסיסמה הרגילה.</p>
                    </div>

                    <button onClick={saveSettings} disabled={isSavingSettings} className="bg-teal-600 text-white px-8 py-3 rounded-2xl font-bold col-span-full flex items-center justify-center gap-2">
                      {isSavingSettings ? <Loader2 className="animate-spin" size={20} /> : 'שמור הגדרות'}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'teacher' ? (
              <motion.div key="teacher" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                {!testData || !isEditing ? (
                  <div className="space-y-6">
                    {testData && <div className="flex justify-center"><button onClick={() => setIsEditing(true)} className="flex items-center gap-2 bg-teal-50 text-teal-600 px-6 py-3 rounded-2xl font-bold border border-teal-100"><Edit3 size={18} />המשך עריכה</button></div>}
                    <TeacherView 
                      onTestProcessed={(d) => { setTestData(d); setIsEditing(true); }} 
                      apiKeyConfigured={apiKeyConfigured} 
                      onLanguageChange={setTestLanguage} 
                      currentLanguage={testLanguage}
                      userTests={userTests}
                      isLoadingTests={isLoadingTests}
                      isPro={subscriptionType === 'monthly' || userEmail === 'shira@lomdot.org' || userEmail === 'shiraroth.z@gmail.com'}
                      credits={credits}
                      onPricingClick={() => setActiveTab('pricing')}
                      onLoadTest={(id) => {
                        setIsLoadingTest(true);
                        fetch(`/api/tests/${id}`).then(r => r.json()).then(data => {
                          setTestData(data);
                          setIsEditing(true);
                        }).finally(() => setIsLoadingTest(false));
                      }}
                    />
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Edit3 size={24} className="text-teal-600" />עריכת המבחן</h2>
                      <div className="flex gap-3">
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-600 font-bold">העלה מחדש</button>
                        <button onClick={copyStudentLink} className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold border border-emerald-100"><Link size={18} />העתק קישור</button>
                        <button onClick={downloadTest} className="flex items-center gap-2 bg-slate-800 text-white px-6 py-2 rounded-xl font-bold"><Download size={18} />הורד HTML</button>
                      </div>
                    </div>
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-8">
                      <div className="flex items-center justify-between bg-teal-50/50 p-4 rounded-2xl border border-teal-100">
                        <div className="flex items-center gap-3">
                          <Volume2 size={20} className="text-teal-600" />
                          <span className="text-sm font-bold text-teal-800">הפקת קול לכל המבחן</span>
                        </div>
                        <button onClick={preGenerateAudio} disabled={isGeneratingAudio} className="flex items-center gap-2 bg-teal-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-teal-100 hover:bg-teal-700 transition-all disabled:opacity-50">
                          {isGeneratingAudio ? <><Loader2 size={16} className="animate-spin" />מפיק קול ({audioProgress}%)</> : <><Volume2 size={16} />הפק הכל מראש</>}
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-bold text-slate-500">כותרת המבחן</label>
                        </div>
                        <input type="text" value={testData.title} onChange={e => setTestData({...testData, title: e.target.value})} className="w-full text-2xl font-bold p-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-teal-400" />
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-bold text-slate-500">הקדמה / הוראות</label>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => {
                                if (!isNiqqudOpen) {
                                  const centerX = window.innerWidth / 2 - 160;
                                  const centerY = window.innerHeight / 2 - 200;
                                  setNiqqudPos({ x: Math.max(20, centerX), y: Math.max(20, centerY) });
                                }
                                setIsNiqqudOpen(!isNiqqudOpen);
                              }}
                              className={`text-xs font-bold flex items-center gap-1 px-2 py-1 rounded-lg transition-all ${isNiqqudOpen ? 'bg-teal-600 text-white' : 'text-teal-600 bg-teal-50'}`}
                            >
                              <MessageCircle size={14} />
                              סרגל ניקוד
                            </button>
                            {testData.introduction && (
                              <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                <Info size={12} />
                                למחיקת ההקדמה מחק את הטקסט
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              {testData.introAudioBase64 && !isGeneratingAudio && <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} />מוכן</span>}
                              <button 
                                onClick={generateIntroAudio} 
                                disabled={isGeneratingAudio || !testData.introduction}
                                className="text-xs font-bold text-teal-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                              >
                                {isGeneratingAudio ? (
                                  <>
                                    <Loader2 size={14} className="animate-spin" />
                                    מפיק קול...
                                  </>
                                ) : (
                                  <>
                                    <Volume2 size={14} />
                                    {testData.introAudioBase64 ? 'עדכן קול' : 'הפק קול'}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                        <textarea 
                          key={testData.introduction === "" ? 'empty' : 'content'}
                          value={testData.introduction || ''} 
                          data-niqqud="true"
                          data-type="intro"
                          onChange={e => setTestData({...testData, introduction: e.target.value})} 
                          placeholder="הכנס כאן הקדמה, הוראות כלליות או טקסט פתיחה למבחן..."
                          className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-teal-400 min-h-[120px] leading-loose" 
                        />
                      </div>

                      <div className="space-y-6 pt-4">
                        {testData.questions.map((q, i) => (
                          <div key={q.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-black text-teal-600 uppercase">שאלה {i + 1}</span>
                              <div className="flex items-center gap-3">
                                {q.audioBase64 && generatingQuestionIndex !== i && <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} />מוכן</span>}
                                <button 
                                  onClick={() => generateSingleAudio(i)} 
                                  disabled={generatingQuestionIndex === i}
                                  className="text-xs font-bold text-teal-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                                  title="הפק קול מחדש לשאלה זו"
                                >
                                  {generatingQuestionIndex === i ? (
                                    <>
                                      <Loader2 size={14} className="animate-spin" />
                                      מפיק קול...
                                    </>
                                  ) : (
                                    <>
                                      <Volume2 size={14} />
                                      {q.audioBase64 ? 'עדכן קול' : 'הפק קול'}
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                            <textarea 
                              value={q.text} 
                              data-niqqud="true" 
                              data-type="question"
                              data-index={i}
                              onChange={e => { const n = [...testData.questions]; n[i].text = e.target.value; setTestData({...testData, questions: n}); }} 
                              className="w-full p-4 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-400 min-h-[100px] leading-loose" 
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end"><button onClick={() => setActiveTab('student')} className="flex items-center gap-2 bg-teal-600 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-teal-200"><Eye size={20} />צפה בתצוגת תלמיד</button></div>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : activeTab === 'student' ? (
              <motion.div key="student" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {testData ? <StudentView testData={testData} onBackToEdit={() => { setActiveTab('teacher'); setIsEditing(true); }} isStudentOnly={isStudentOnly} language={testLanguage} /> : <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200"><GraduationCap size={48} className="mx-auto text-slate-300 mb-4" /><h3 className="text-xl font-bold text-slate-800">אין מבחן זמין</h3></div>}
              </motion.div>
            ) : activeTab === 'pricing' ? (
              <motion.div key="pricing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><PricingPage userEmail={userEmail} userName={userName} /></motion.div>
            ) : activeTab === 'contact' ? (
              <motion.div key="contact" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><ContactPage /></motion.div>
            ) : (
              <motion.div key="privacy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><PrivacyPolicy /></motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      <AnimatePresence>
        {showSuccessModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white w-full max-w-md rounded-[3rem] p-10 text-center shadow-2xl space-y-6">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={48} />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-slate-900">התשלום עבר בהצלחה!</h2>
                <p className="text-slate-500 font-medium">קוד הגישה החדש שלך נשלח אליך למייל ברגעים אלו.</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-sm text-slate-600 leading-relaxed">
                שימי לב: אם המייל לא מופיע בתיבת הדואר הנכנס, כדאי לבדוק גם בתיקיית ה"ספאם" או ה"קידומי מכירות".
              </div>
              <button onClick={() => setShowSuccessModal(false)} className="w-full bg-teal-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-teal-200">
                חזרה למסך הכניסה
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNiqqudOpen && (
            <motion.div 
              drag
              dragMomentum={false}
              onMouseDown={(e) => e.preventDefault()}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="niqqud-picker fixed z-[100] bg-white shadow-2xl border-2 border-teal-500 rounded-[2rem] overflow-hidden flex flex-col w-[320px]" 
              style={{ left: niqqudPos.x, top: niqqudPos.y }}
            >
              <div className="bg-teal-600 p-3 flex items-center justify-between cursor-move text-white select-none">
                <div className="flex items-center gap-2">
                  <MessageCircle size={16} />
                  <span className="text-xs font-black">טבלת ניקוד (גרור להזזה)</span>
                </div>
                <button onClick={() => setIsNiqqudOpen(false)} className="flex items-center gap-1 p-1 hover:bg-white/20 rounded-lg transition-colors text-[10px] font-bold">
                  <span>סגור</span>
                  <CloseIcon size={14} />
                </button>
              </div>
              
              <div className="p-4 grid grid-cols-4 gap-2">
                {niqqudChars.map(n => (
                  <button 
                    key={n.char} 
                    onClick={() => handleNiqqudSelect(n.char)} 
                    className="aspect-square flex flex-col items-center justify-center hover:bg-teal-50 rounded-2xl border border-slate-100 transition-all hover:scale-105 active:scale-95 group"
                  >
                    <span className="text-3xl font-serif leading-none group-hover:text-teal-600">א{n.char}</span>
                    <span className="text-[9px] font-bold text-slate-400 mt-1">{n.name}</span>
                  </button>
                ))}
              <button 
                onClick={() => handleNiqqudSelect('DELETE')} 
                className="col-span-4 flex items-center justify-center gap-2 py-3 mt-2 rounded-2xl hover:bg-red-50 text-red-600 border-2 border-red-100 text-sm font-black transition-all"
              >
                <Eraser size={18} />
                מחק ניקוד מהאות
              </button>
            </div>
            <div className="bg-slate-50 p-2 text-center">
              <p className="text-[9px] text-slate-400 font-bold">טיפ: השחירו אות ולחצו על הניקוד המבוקש</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="max-w-4xl mx-auto px-6 py-8 border-t border-slate-200 text-center text-slate-400 text-sm font-medium">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span>ExamAccess Pro © {new Date().getFullYear()}</span>
          <span className="hidden md:inline text-slate-200">|</span>
          <button onClick={() => setActiveTab('pricing')} className={activeTab === 'pricing' ? 'text-teal-600 font-bold' : ''}>חבילות ומבצעים</button>
          <span className="hidden md:inline text-slate-200">|</span>
          <button onClick={() => setActiveTab('contact')} className={activeTab === 'contact' ? 'text-teal-600 font-bold' : ''}>צור קשר</button>
          <span className="hidden md:inline text-slate-200">|</span>
          <button onClick={() => setActiveTab('privacy')} className={activeTab === 'privacy' ? 'text-teal-600 font-bold' : ''}>פרטיות ותנאים</button>
        </div>
      </footer>
    </div>
  );
}
