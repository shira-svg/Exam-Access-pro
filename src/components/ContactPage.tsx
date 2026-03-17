import React from 'react';
export default function ContactPage() {
  return <div className="p-8 bg-white rounded-2xl shadow-sm border border-slate-100">
    <h2 className="text-2xl font-bold mb-4">צור קשר</h2>
    <p className="text-slate-600 mb-6">נשמח לשמוע ממך! מלא את הפרטים ונחזור אליך בהקדם.</p>
    <form className="space-y-4">
      <div>
        <label className="block text-sm font-bold mb-1">שם מלא</label>
        <input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" />
      </div>
      <div>
        <label className="block text-sm font-bold mb-1">אימייל</label>
        <input type="email" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" />
      </div>
      <div>
        <label className="block text-sm font-bold mb-1">הודעה</label>
        <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl h-32"></textarea>
      </div>
      <button className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">שלח הודעה</button>
    </form>
  </div>;
}
