import React from 'react';
import { Upload, Loader2, FileText, CheckCircle, AlertCircle, X, Trash2, File as FileIcon, Settings, Edit3, Star } from 'lucide-react';
import { processTestImages, TestData } from '../services/gemini';
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

interface TeacherViewProps {
  onTestProcessed: (data: TestData) => void;
  apiKeyConfigured: boolean;
  onLanguageChange: (lang: string) => void;
  currentLanguage: string;
  userTests?: any[];
  isLoadingTests?: boolean;
  isPro?: boolean;
  onLoadTest?: (id: string) => void;
  credits?: number | null;
  onPricingClick?: () => void;
}

export default function TeacherView({ 
  onTestProcessed, 
  apiKeyConfigured, 
  onLanguageChange, 
  currentLanguage,
  userTests = [],
  isLoadingTests = false,
  isPro = false,
  onLoadTest,
  credits,
  onPricingClick
}: TeacherViewProps) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const isKeyMissing = !apiKeyConfigured;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
  };

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const convertPdfToImages = async (file: File): Promise<string[]> => {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const images: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // High quality
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        await (page as any).render({ canvasContext: context, viewport }).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.8));
      }
    }
    return images;
  };

  const extractWordContent = async (file: File): Promise<string> => {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    
    setLoading(true);
    setStatus('מעבד קבצים ומחלץ שאלות...');
    
    try {
      let allImages: string[] = [];

      for (const file of files) {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          setStatus(`מעבד PDF: ${file.name}...`);
          const pdfImages = await convertPdfToImages(file);
          allImages = [...allImages, ...pdfImages];
        } else if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          allImages.push(base64);
        }
      }

      setStatus('מנתח את המבחן בעזרת בינה מלאכותית...');
      const result = await processTestImages(allImages, currentLanguage);
      onTestProcessed(result);
      setStatus('העיבוד הושלם בהצלחה!');
    } catch (error: any) {
      console.error(error);
      setStatus(error.message || 'שגיאה בעיבוד המבחן. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {credits !== null && credits <= 1 && (
        <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-amber-800">
            <AlertCircle className="shrink-0" size={20} />
            <p className="text-sm font-bold">שימו לב: נותרו לכם {credits} מבחנים בלבד במכסה.</p>
          </div>
          <button 
            onClick={onPricingClick}
            className="bg-amber-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-amber-700 transition-all shadow-md shadow-amber-100 flex items-center gap-2"
          >
            <Star size={16} fill="currentColor" />
            רכישת מבחנים נוספים
          </button>
        </div>
      )}
      <div className="bg-blue-50/50 border-2 border-dashed border-blue-200 rounded-3xl p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
            <Upload size={32} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-blue-900">העלאת דפי מבחן</h3>
            <p className="text-blue-700 mt-1">תמונות או PDF (מומלץ PDF עבור גרפים)</p>
          </div>
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            בחר קבצים
          </label>
        </div>
      </div>

      {files.length > 0 && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-teal-100 rounded-lg flex items-center justify-center text-teal-600">
                  <Settings size={14} />
                </div>
                <h4 className="text-sm font-bold text-slate-700">הגדרות עיבוד המבחן</h4>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">שפת המבחן</label>
                  <div className="relative">
                    <select
                      value={currentLanguage}
                      onChange={(e) => onLanguageChange(e.target.value)}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-teal-400 outline-none appearance-none cursor-pointer"
                    >
                      <option value="Hebrew">עברית (Hebrew)</option>
                      <option value="English">אנגלית (English)</option>
                      <option value="Arabic">ערבית (Arabic)</option>
                      <option value="Russian">רוסית (Russian)</option>
                      <option value="Czech">צ'כית (Czech)</option>
                      <option value="Mixed (Hebrew & English)">מעורב (עברית ואנגלית)</option>
                    </select>
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <Settings size={16} />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 leading-tight">
                    * בחירת השפה משפיעה על זיהוי הטקסט (OCR) ועל ההקראה הקולית (TTS). היא אינה משנה את שפת הממשק של האתר.
                  </p>
                </div>
              </div>
            </div>

            <div className="w-px h-24 bg-slate-100 hidden md:block" />

            <div className="flex-1 w-full">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">קבצים שנבחרו ({files.length})</span>
                <button 
                  onClick={clearFiles}
                  className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={12} />
                  נקה הכל
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {files.map((f, i) => (
                  <div key={i} className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 flex items-center justify-between group animate-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {f.type.includes('pdf') ? <FileIcon size={14} className="text-red-500 shrink-0" /> : 
                       <FileText size={14} className="text-blue-500 shrink-0" />}
                      <span className="text-sm text-slate-700 truncate">{f.name}</span>
                    </div>
                    <button 
                      onClick={() => removeFile(i)}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-center">
            <button
              onClick={handleProcess}
              disabled={loading || isKeyMissing}
              className={`flex items-center gap-3 px-12 py-4 rounded-2xl font-bold text-lg transition-all ${
                isKeyMissing 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                  : 'bg-teal-600 hover:bg-teal-700 text-white shadow-xl shadow-teal-200 hover:-translate-y-1'
              }`}
            >
              {loading ? <Loader2 className="animate-spin" /> : (isKeyMissing ? <AlertCircle size={20} /> : <CheckCircle size={20} />)}
              {loading ? 'מעבד את המבחן...' : (isKeyMissing ? 'חסר מפתח API' : 'הנגש מבחן עכשיו')}
            </button>
          </div>
        </div>
      )}

      {status && (
        <div className={`p-4 rounded-2xl text-center font-bold animate-in zoom-in-95 duration-300 ${
          status.includes('שגיאה') ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-teal-50 text-teal-600 border border-teal-100'
        }`}>
          {status}
        </div>
      )}

      {isPro && (
        <div className="space-y-4 pt-8 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileText size={24} className="text-teal-600" />
              היסטוריית המבחנים שלי
            </h3>
            <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-xs font-black">מנוי PRO</span>
          </div>
          
          {isLoadingTests ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-teal-600" /></div>
          ) : userTests.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userTests.map((test) => (
                <button
                  key={test.id}
                  onClick={() => onLoadTest?.(test.id)}
                  className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-teal-300 hover:shadow-md transition-all group text-right"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                      <FileIcon size={20} />
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-bold text-slate-700 truncate">{test.title}</p>
                      <p className="text-[10px] text-slate-400">{new Date(test.created_at).toLocaleDateString('he-IL')}</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-teal-600 group-hover:bg-teal-50">
                    <Edit3 size={16} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <FileIcon size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 font-medium">עדיין לא יצרת מבחנים</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
