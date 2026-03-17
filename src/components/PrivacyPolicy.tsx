import React from 'react';
import { Shield, Lock, Eye, FileText } from 'lucide-react';
import { motion } from 'motion/react';

export default function PrivacyPolicy() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto space-y-8"
      dir="rtl"
    >
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-teal-100 text-teal-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <Shield size={32} />
        </div>
        <h2 className="text-3xl font-black text-slate-900">מדיניות פרטיות ותנאי שימוש</h2>
        <p className="text-slate-500">הפרטיות שלך חשובה לנו. כאן תוכל לקרוא כיצד אנו שומרים על המידע שלך.</p>
      </div>

      <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-10">
        <section className="space-y-4">
          <div className="flex items-center gap-3 text-teal-600">
            <Lock size={24} />
            <h3 className="text-xl font-bold">אבטחת מידע</h3>
          </div>
          <p className="text-slate-600 leading-relaxed">
            אנו נוקטים באמצעי האבטחה המתקדמים ביותר כדי להגן על המידע האישי שלך ועל המבחנים שאתה מעלה למערכת. 
            כל המידע המועבר בין הדפדפן שלך לשרתים שלנו מוצפן באמצעות פרוטוקול SSL.
          </p>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3 text-teal-600">
            <Eye size={24} />
            <h3 className="text-xl font-bold">איסוף ושימוש במידע</h3>
          </div>
          <p className="text-slate-600 leading-relaxed">
            המערכת אוספת מידע בסיסי בלבד הדרוש לתפעול השירות:
          </p>
          <ul className="list-disc list-inside text-slate-600 space-y-2 pr-4">
            <li>כתובת אימייל ושם לצורך זיהוי וניהול חשבון.</li>
            <li>קבצי מבחן המועלים על ידך לצורך עיבודם והנגשתם.</li>
            <li>נתוני שימוש אנונימיים לשיפור חווית המשתמש.</li>
          </ul>
          <p className="text-slate-600 leading-relaxed">
            אנו לא מוכרים או משתפים את המידע האישי שלך עם צדדים שלישיים למטרות שיווק.
          </p>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3 text-teal-600">
            <FileText size={24} />
            <h3 className="text-xl font-bold">עיבוד נתונים באמצעות בינה מלאכותית</h3>
          </div>
          <p className="text-slate-600 leading-relaxed">
            המערכת משתמשת בשירותי Gemini API של Google לצורך ניתוח המבחנים והפקת קול. 
            המידע המועבר לשירותים אלו משמש אך ורק לצורך ביצוע הפעולה המבוקשת ואינו נשמר על ידינו למטרות אחרות.
          </p>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3 text-teal-600">
            <Shield size={24} />
            <h3 className="text-xl font-bold">זכויות המשתמש</h3>
          </div>
          <p className="text-slate-600 leading-relaxed">
            זכותך לבקש בכל עת את מחיקת חשבונך וכל המידע הקשור אליו מהשרתים שלנו. 
            לביצוע פעולה זו או לכל שאלה אחרת בנושא פרטיות, ניתן לפנות אלינו דרך עמוד "צור קשר".
          </p>
        </section>

        <div className="pt-8 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            עודכן לאחרונה: מרץ 2026
          </p>
        </div>
      </div>
    </motion.div>
  );
}
