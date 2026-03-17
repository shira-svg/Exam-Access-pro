import React from 'react';
import { Volume2, Loader2, Edit3, MessageCircle } from 'lucide-react';
import { TestData, generateSpeech } from '../services/gemini';
import Markdown from 'react-markdown';

interface StudentViewProps {
  testData: TestData;
  onBackToEdit?: () => void;
  isStudentOnly?: boolean;
  language?: string;
}

export default function StudentView({ testData, onBackToEdit, isStudentOnly, language = 'Hebrew' }: StudentViewProps) {
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const [playingIntro, setPlayingIntro] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
    }
    setPlayingId(null);
    setPlayingIntro(false);
  };

  const handleIntroTTS = async () => {
    if (playingIntro) {
      stopAudio();
      return;
    }

    if (!testData.introduction) return;

    try {
      stopAudio();
      setPlayingIntro(true);
      
      let audioUrl = '';
      if (testData.introAudioBase64) {
        const binaryString = atob(testData.introAudioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/wav' });
        audioUrl = URL.createObjectURL(blob);
      } else if (testData.introAudioUrl) {
        audioUrl = testData.introAudioUrl;
      } else {
        const result = await generateSpeech(testData.introduction, language);
        audioUrl = result.url;
      }
      
      if (audioRef.current && audioUrl) {
        audioRef.current.src = audioUrl;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            console.error("Intro playback failed:", e);
            setPlayingIntro(false);
          });
        }
        
        audioRef.current.onended = () => {
          setPlayingIntro(false);
          if (testData.introAudioBase64 || !testData.introAudioUrl) {
            URL.revokeObjectURL(audioUrl);
          }
        };
      }
    } catch (error) {
      console.error("Intro TTS failed:", error);
      setPlayingIntro(false);
    }
  };

  const handleTTS = async (q: TestData['questions'][0]) => {
    if (playingId === q.id) {
      stopAudio();
      return;
    }

    try {
      stopAudio();
      setPlayingId(q.id);
      
      let audioUrl = '';
      
      // If we have base64 data, always recreate the blob URL to ensure it's valid in the current session
      if (q.audioBase64) {
        const binaryString = atob(q.audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/wav' });
        audioUrl = URL.createObjectURL(blob);
      } else if (q.audioUrl) {
        // Fallback to existing URL (might be invalid if shared)
        audioUrl = q.audioUrl;
      } else {
        // Generate on demand if nothing exists
        const result = await generateSpeech(q.text, language);
        audioUrl = result.url;
      }
      
      if (audioRef.current && audioUrl) {
        audioRef.current.src = audioUrl;
        
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error("Playback failed:", error);
            setPlayingId(null);
          });
        }
        
        audioRef.current.onended = () => {
          setPlayingId(null);
          // Revoke the URL we just created if it was from base64 or generated on demand
          if (q.audioBase64 || !q.audioUrl) {
            URL.revokeObjectURL(audioUrl);
          }
        };

        audioRef.current.onerror = () => {
          console.error("Audio element error");
          setPlayingId(null);
          if (q.audioBase64 || !q.audioUrl) {
            URL.revokeObjectURL(audioUrl);
          }
        };
      }
    } catch (error) {
      console.error("TTS generation failed:", error);
      setPlayingId(null);
      alert("מצטערים, חלה שגיאה בהפקת ההקראה. אנא נסו שוב.");
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100 text-center relative">
        {!isStudentOnly && onBackToEdit && (
          <button
            onClick={onBackToEdit}
            className="absolute top-4 left-4 flex items-center gap-2 bg-white/80 hover:bg-white text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold transition-all border border-emerald-200 shadow-sm"
          >
            <Edit3 size={16} />
            חזור לעריכה
          </button>
        )}
        <h2 className="text-3xl font-bold text-emerald-900">שלום תלמיד! 👋</h2>
        <p className="text-emerald-700 mt-2 text-lg">כאן השאלות שלך. לחץ על הרמקול לשמיעת השאלה.</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-slate-800 border-b pb-2">{testData.title}</h3>
          
          {testData.introduction && (
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-teal-600 uppercase">הקדמה והוראות</span>
                <button 
                  onClick={handleIntroTTS}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    playingIntro 
                      ? 'bg-teal-600 text-white' 
                      : testData.introAudioBase64 
                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                        : 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                  }`}
                >
                  {playingIntro ? <Loader2 className="animate-spin" size={16} /> : <Volume2 size={16} />}
                  {playingIntro ? 'מפסיק...' : 'הקרא הקדמה'}
                </button>
              </div>
              <div className="markdown-body text-slate-700 leading-loose">
                <Markdown>{testData.introduction}</Markdown>
              </div>
            </div>
          )}
        </div>
        
        <div className="grid gap-4">
          {testData.questions.map((q, index) => (
            <div key={q.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative group">
              <div className="flex items-start gap-4">
                <button
                  onClick={() => handleTTS(q)}
                  className={`shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                    playingId === q.id 
                      ? 'bg-teal-600 text-white scale-110 shadow-lg shadow-teal-200' 
                      : q.audioBase64
                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        : 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                  }`}
                >
                  {playingId === q.id ? <Loader2 className="animate-spin" /> : <Volume2 size={24} />}
                </button>
                
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg text-xs font-bold">שאלה {index + 1}</span>
                  </div>
                  <div className="markdown-body text-lg text-slate-800 leading-loose">
                    <Markdown>{q.text}</Markdown>
                  </div>
                  
                  {q.options && q.options.length > 0 && (
                    <div className="grid gap-2 mt-4">
                      {q.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                          <span className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                            {String.fromCharCode(1488 + i)}
                          </span>
                          <span className="text-base text-slate-700">{opt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
