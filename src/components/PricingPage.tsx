import React from 'react';
import { Check, Zap, Shield, Star, CreditCard, Calendar, ArrowLeft, HelpCircle, MousePointer2, Mail, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function PricingPage({ userEmail, userName }: { userEmail?: string | null, userName?: string | null }) {
  const [isAnnual, setIsAnnual] = React.useState(true);

  const plans = [
    {
      name: 'חבילה חינמית',
      price: '0',
      period: 'לנרשמים חדשים',
      exams: '5 מבחנים במתנה',
      description: 'התחילו להשתמש בכלי בחינם וגלו איך הוא משנה את העבודה שלכם.',
      features: [
        'ייצוא לקובץ HTML נגיש או קישור',
        'תמיכה בניקוד',
        'שמירת מבחנים',
        'תרגום קולי לשפות אחרות'
      ],
      buttonText: 'התחילו בחינם',
      highlight: false,
      icon: <Zap className="text-slate-400" size={24} />,
      checkoutUrl: null
    },
    {
      name: 'חבילת התנסות',
      price: '29',
      period: 'חד פעמי',
      exams: '20 מבחנים',
      description: 'מושלם למורים שרוצים להתנסות בכלי ולראות את הקסם קורה.',
      features: [
        'ייצוא לקובץ HTML נגיש או קישור',
        'תמיכה בניקוד',
        'שמירת מבחנים',
        'תרגום קולי לשפות אחרות'
      ],
      buttonText: 'רכוש עכשיו',
      highlight: false,
      icon: <Zap className="text-blue-500" size={24} />,
      checkoutUrl: 'https://meshulam.co.il/purchase/exam-pro-credits'
    },
    {
      name: 'חבילת ה-50',
      price: '50',
      period: 'חד פעמי',
      exams: '50 מבחנים',
      description: 'החבילה המשתלמת ביותר - רק שקל אחד למבחן מונגש!',
      features: [
        'ייצוא לקובץ HTML נגיש או קישור',
        'תמיכה בניקוד',
        'שמירת מבחנים',
        'תרגום קולי לשפות אחרות',
        'שקל בלבד'
      ],
      buttonText: 'הבחירה המשתלמת',
      highlight: true,
      icon: <Star className="text-amber-500" size={24} />,
      checkoutUrl: 'https://meshulam.co.il/purchase/exam-pro-credits'
    },
    {
      name: 'מנוי Pro',
      price: isAnnual ? '294' : '35',
      period: isAnnual ? 'לשנה' : 'לחודש',
      exams: '50 מבחנים בכל חודש',
      description: isAnnual 
        ? 'המסלול המשתלם ביותר! שלמו פעם בשנה וחסכו 30% מהמחיר.'
        : 'למורים שרוצים שקט נפשי ושימוש קבוע לאורך כל השנה.',
      features: [
        'ייצוא לקובץ HTML נגיש או קישור',
        'תמיכה בניקוד',
        'שמירת מבחנים',
        'תרגום קולי לשפות אחרות',
        '50 מבחנים חדשים בכל חודש',
        ...(isAnnual ? ['חיסכון של 126 ש"ח בשנה'] : [])
      ],
      buttonText: isAnnual ? 'חסכו 30% עכשיו' : 'הצטרף כמנוי',
      highlight: false,
      icon: isAnnual ? <Sparkles className="text-purple-500" size={24} /> : <Calendar className="text-teal-500" size={24} />,
      checkoutUrl: 'https://meshulam.co.il/purchase/exam-pro-credits'
    }
  ];

  const faqs = [
    {
      q: "איך אני מקבל את המבחנים אחרי התשלום?",
      a: "מיד לאחר התשלום תקבל קוד גישה ייחודי למייל שלך. את הקוד הזה מדביקים באזור האישי באתר והקרדיטים מתווספים לחשבון באופן מיידי."
    },
    {
      q: "האם הקרדיטים פגים מתישהו?",
      a: "בחבילות החד-פעמיות (20 ו-50 מבחנים) הקרדיטים נשארים איתך לתמיד, ללא הגבלת זמן. במנוי החודשי הקרדיטים נצברים מחודש לחודש כל עוד המנוי פעיל."
    },
    {
      q: "אפשר לבטל את המנוי החודשי?",
      a: "בוודאי. ניתן לבטל את המנוי בכל רגע דרך האזור האישי או בפנייה אלינו. אין התחייבות לתקופה מינימלית."
    },
    {
      q: "מה קורה אם המבחן שלי מאוד ארוך?",
      a: "המערכת סופרת מבחן לפי קובץ. גם אם המבחן ארוך, הוא נחשב כקרדיט אחד."
    }
  ];

  const [showSchoolModal, setShowSchoolModal] = React.useState(false);

  const handlePurchase = (plan: any) => {
    if (plan.name === 'חבילה חינמית') {
      // Just scroll to top or show login if not logged in
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (plan.checkoutUrl) {
      const url = new URL(plan.checkoutUrl);
      if (userEmail) url.searchParams.append('email', userEmail);
      if (userName) url.searchParams.append('full_name', userName);
      window.location.href = url.toString();
    } else {
      // Fallback to WhatsApp if no URL is provided yet
      const text = `היי שירה, אני מעוניין לרכוש את ${plan.name} עבור ExamAccess`;
      window.location.href = `https://wa.me/972523930628?text=${encodeURIComponent(text)}`;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl mx-auto space-y-16 py-12 px-6"
      dir="rtl"
    >
      {/* Internal Navigation - Floating Pill */}
      <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[60] bg-white/95 backdrop-blur-md py-3 px-6 border border-teal-100 flex justify-center gap-4 md:gap-8 text-sm font-bold text-slate-600 whitespace-nowrap rounded-full shadow-xl shadow-teal-900/10 border-b-2 border-b-teal-500/20 hidden md:flex">
        <button onClick={() => document.getElementById('pricing-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="hover:text-teal-600 transition-colors">חבילות אישיות</button>
        <button onClick={() => document.getElementById('school-purchase')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="hover:text-teal-600 transition-colors">רכישה לבתי ספר</button>
        <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="hover:text-teal-600 transition-colors">איך זה עובד?</button>
        <button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="hover:text-teal-600 transition-colors">שאלות נפוצות</button>
      </div>

      {/* Hero Section */}
      <div className="text-center space-y-8 pt-12 md:pt-20">
        <div className="space-y-4">
          <h2 className="text-4xl md:text-5xl font-black text-slate-900">חבילות ומבצעים</h2>
          <p className="text-xl text-slate-500 max-w-2xl mx-auto">
            בחרו את המסלול המתאים לכם והתחילו להנגיש מבחנים בשניות. 
          </p>
        </div>
      </div>

      {/* Pricing Grid */}
      <div id="pricing-plans" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 scroll-mt-48">
        {plans.map((plan, index) => (
          <motion.div
            key={index}
            whileHover={{ y: -10 }}
            className={`relative bg-white rounded-[2.5rem] p-8 shadow-xl border transition-all ${
              plan.highlight ? 'border-teal-500 ring-4 ring-teal-50 scale-105 z-10' : 'border-slate-100 hover:border-teal-200'
            } flex flex-col`}
          >
            {plan.highlight && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-teal-600 text-white px-6 py-1 rounded-full text-sm font-black uppercase tracking-widest shadow-lg">
                הכי משתלם
              </div>
            )}

            <div className="space-y-6 flex-1">
              <div className="flex items-center justify-between">
                <div className={`p-3 rounded-2xl ${plan.highlight ? 'bg-teal-50' : 'bg-slate-50'}`}>
                  {plan.icon}
                </div>
                <div className="text-left">
                  <div className="text-4xl font-black text-slate-900">₪{plan.price}</div>
                  <div className="text-xs font-bold text-slate-400 uppercase">{plan.period}</div>
                </div>
              </div>

              {/* Special Toggle for Pro Subscription */}
              {plan.name === 'מנוי Pro' && (
                <div className="bg-slate-50 p-1.5 rounded-2xl flex items-center gap-1 border border-slate-100">
                  <button 
                    onClick={() => setIsAnnual(false)}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${!isAnnual ? 'bg-white text-teal-600 shadow-sm border border-teal-100' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    חודשי
                  </button>
                  <button 
                    onClick={() => setIsAnnual(true)}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all relative ${isAnnual ? 'bg-white text-teal-600 shadow-sm border border-teal-100' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    שנתי
                    {isAnnual && <span className="absolute -top-2 -right-1 bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded-full animate-bounce">30%-</span>}
                  </button>
                </div>
              )}

              <div>
                <h3 className="text-2xl font-black text-slate-900">{plan.name}</h3>
                <div className="text-teal-600 font-bold text-lg mt-1">{plan.exams}</div>
              </div>

              <p className="text-slate-500 text-sm leading-relaxed">
                {plan.description}
              </p>

              <div className="space-y-4 pt-6 border-t border-slate-50">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <Check size={12} strokeWidth={3} />
                    </div>
                    <span className="text-sm font-medium text-slate-600">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => handlePurchase(plan)}
              className={`w-full mt-8 py-4 rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-2 ${
                plan.highlight 
                  ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-teal-200' 
                  : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200'
              }`}
            >
              <span>{plan.buttonText}</span>
              <ArrowLeft size={18} />
            </button>
          </motion.div>
        ))}
      </div>

      {/* Institutional Section - Delicate Version */}
      <div id="school-purchase" className="bg-white rounded-[2.5rem] p-8 md:p-10 text-center border-2 border-teal-50 shadow-sm relative overflow-hidden max-w-4xl mx-auto scroll-mt-48">
        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 blur-2xl rounded-full -mr-16 -mt-16"></div>
        
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 text-right">
            <div className="space-y-2 flex-1">
              <h3 className="text-2xl font-black text-slate-900">רכישה מרוכזת לבתי ספר</h3>
              <p className="text-slate-500 text-base leading-relaxed">
                מעוניינים להנגיש את כל המבחנים בבית הספר? אנחנו מציעים חבילות מוסדיות מותאמות אישית עם תמיכה מלאה והדרכה לצוות המורים.
              </p>
            </div>
            <button 
              onClick={() => setShowSchoolModal(true)}
              className="bg-teal-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-teal-700 transition-all flex items-center gap-3 shadow-lg shadow-teal-100 shrink-0"
            >
              <CreditCard size={20} />
              קבלו הצעה מותאמת
            </button>
          </div>
        </div>
      </div>

      {/* How it Works Section */}
      <div id="how-it-works" className="bg-slate-50 rounded-[3rem] p-10 md:p-16 space-y-10 scroll-mt-48">
        <div className="text-center space-y-3">
          <h3 className="text-3xl font-black text-slate-900">איך זה עובד?</h3>
          <p className="text-slate-500">3 צעדים פשוטים ואתם שם</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {[
            { icon: <MousePointer2 />, title: "בוחרים חבילה", desc: "בוחרים את כמות המבחנים שמתאימה לכם ומשלמים בצורה מאובטחת." },
            { icon: <Mail />, title: "מקבלים קוד", desc: "קוד הגישה נשלח אליכם מיידית למייל. פשוט מעתיקים אותו." },
            { icon: <Zap />, title: "מתחילים להנגיש", desc: "מדביקים את הקוד באתר ומתחילים להפוך מבחנים לנגישים בשניות." }
          ].map((step, i) => (
            <div key={i} className="text-center space-y-4">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-teal-600 mx-auto mb-6">
                {step.icon}
              </div>
              <h4 className="text-xl font-bold text-slate-900">{step.title}</h4>
              <p className="text-slate-500 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div id="faq" className="max-w-3xl mx-auto space-y-10 scroll-mt-48">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-2xl flex items-center justify-center mx-auto">
            <HelpCircle size={24} />
          </div>
          <h3 className="text-3xl font-black text-slate-900">שאלות נפוצות</h3>
        </div>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h4 className="font-bold text-slate-900 mb-2">{faq.q}</h4>
              <p className="text-slate-500 text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Trust Badges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-100 space-y-4 flex items-start gap-6">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
            <Shield size={28} />
          </div>
          <div>
            <h4 className="text-xl font-bold text-slate-900">רכישה בטוחה ומאובטחת</h4>
            <p className="text-slate-500 text-sm mt-2">
              התשלום מתבצע בצורה מאובטחת בתקן המחמיר ביותר. הפרטים שלכם מוגנים ולא נשמרים במערכת שלנו.
            </p>
          </div>
        </div>
        <div className="bg-white p-8 rounded-3xl border border-slate-100 space-y-4 flex items-start gap-6">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <Check size={28} />
          </div>
          <div>
            <h4 className="text-xl font-bold text-slate-900">שקיפות ואמינות מלאה</h4>
            <p className="text-slate-500 text-sm mt-2">
              אנחנו מאמינים במוצר שלנו. אין אותיות קטנות, אין חיובים נסתרים. אתם מקבלים בדיוק את מה שרכשתם.
            </p>
          </div>
        </div>
      </div>

      {/* School Interest Modal */}
      <AnimatePresence>
        {showSchoolModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden relative"
            >
              <button 
                onClick={() => setShowSchoolModal(false)}
                className="absolute top-6 left-6 p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors z-10"
                aria-label="סגור"
              >
                <X size={24} />
              </button>

              <div className="p-8 md:p-12 space-y-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="text-center space-y-2">
                  <h3 className="text-3xl font-black text-slate-900">רכישה מרוכזת לבתי ספר</h3>
                  <p className="text-slate-500">מלאו את הפרטים ונחזור אליכם עם הצעה מותאמת אישית</p>
                </div>

                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const data = Object.fromEntries(formData.entries());
                    
                    try {
                      const res = await fetch('/api/school-interest', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                      });
                      if (res.ok) {
                        alert('הפנייה נשלחה בהצלחה! נחזור אליכם בהקדם.');
                        setShowSchoolModal(false);
                      } else {
                        alert('אופס, משהו השתבש. נסו שוב מאוחר יותר.');
                      }
                    } catch (err) {
                      alert('תקלת תקשורת. נסו שוב מאוחר יותר.');
                    }
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right"
                  dir="rtl"
                >
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700">שם בית הספר</label>
                    <input name="schoolName" required type="text" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:border-teal-500 outline-none" placeholder="שם המוסד" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700">איש קשר</label>
                    <input name="contactName" required type="text" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:border-teal-500 outline-none" placeholder="שם מלא" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700">תפקיד</label>
                    <input name="role" required type="text" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:border-teal-500 outline-none" placeholder="למשל: רכזת פדגוגית" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700">אימייל</label>
                    <input name="email" required type="email" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:border-teal-500 outline-none" placeholder="email@school.org" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700">טלפון</label>
                    <input name="phone" required type="tel" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:border-teal-500 outline-none" placeholder="050-0000000" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700">מספר מורים משוער</label>
                    <input name="teacherCount" type="number" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:border-teal-500 outline-none" placeholder="כמות מורים" />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-sm font-bold text-slate-700">הערות נוספות</label>
                    <textarea name="message" rows={3} className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:border-teal-500 outline-none resize-none" placeholder="ספרו לנו קצת על הצרכים שלכם..."></textarea>
                  </div>
                  <div className="md:col-span-2 pt-4">
                    <button 
                      type="submit"
                      className="w-full bg-teal-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-teal-700 transition-all shadow-lg shadow-teal-100 flex items-center justify-center gap-3"
                    >
                      <CreditCard size={20} />
                      שלחו בקשה להצעה מותאמת
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

