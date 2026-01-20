import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, MessageSquare, Shield, Send, Check, X, Clock, 
  RefreshCw, LogOut, Eye, Search, Bell, Trash2
} from 'lucide-react';
import { supabase, VerificationSession, isSupabaseConfigured } from '../lib/supabase';

interface LocalMessage {
  id: string;
  sender: 'user' | 'admin' | 'system';
  message: string;
  created_at: string;
  message_type?: 'text' | 'code_attempt';
  is_correct?: boolean;
}

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [sessions, setSessions] = useState<VerificationSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<VerificationSession | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [newSessionAlert, setNewSessionAlert] = useState(false);
  const [, setIsConnected] = useState(false);
  const channelRef = useRef<any>(null);
  const [codeInput, setCodeInput] = useState('');

  // Fetch sessions on mount
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    fetchSessions();
    
    // Poll for new sessions every 5 seconds
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  // Setup broadcast channel for selected session
  useEffect(() => {
    if (!selectedSession) {
      setMessages([]);
      setIsConnected(false);
      return;
    }

    // Load existing messages
    loadMessages(selectedSession.id);

    // Setup realtime broadcast channel
    const channel = supabase.channel(`chat-${selectedSession.id}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: 'new-message' }, ({ payload }) => {
        setMessages(prev => [...prev, payload as LocalMessage]);
      })
      .on('broadcast', { event: 'code-attempt' }, ({ payload }) => {
        // Add code attempt as a special message
        const codeAttemptMsg: LocalMessage = {
          id: `code-${Date.now()}`,
          sender: 'system',
          message: payload.code,
          created_at: new Date().toISOString(),
          message_type: 'code_attempt',
          is_correct: payload.is_correct
        };
        setMessages(prev => [...prev, codeAttemptMsg]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [selectedSession?.id]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSessions = async () => {
    const { data } = await supabase
      .from('verification_sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      // Check for new sessions
      if (sessions.length > 0 && data.length > sessions.length) {
        setNewSessionAlert(true);
        setTimeout(() => setNewSessionAlert(false), 3000);
      }
      setSessions(data);
    }
  };

  const loadMessages = async (sessionId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
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

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedSession) return;

    const msg: LocalMessage = {
      id: crypto.randomUUID(),
      sender: 'admin',
      message: newMessage.trim(),
      created_at: new Date().toISOString()
    };

    // Add to local state immediately
    setMessages(prev => [...prev, msg]);
    setNewMessage('');

    // Save to database
    await supabase.from('chat_messages').insert({
      id: msg.id,
      session_id: selectedSession.id,
      sender: 'admin',
      message: msg.message
    });

    // Broadcast to user
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'new-message',
        payload: msg
      });
    }
  };

  const endConversation = async () => {
    if (!selectedSession) return;
    
    const sessionId = selectedSession.id;

    // Broadcast chat-ended event to user
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'chat-ended',
        payload: {}
      });
    }

    // Wait a moment for broadcast to send
    await new Promise(resolve => setTimeout(resolve, 500));

    // Delete all messages for this session
    await supabase
      .from('chat_messages')
      .delete()
      .eq('session_id', sessionId);

    // Delete the session
    await supabase
      .from('verification_sessions')
      .delete()
      .eq('id', sessionId);

    // Update local state
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    setSelectedSession(null);
    setMessages([]);
  };

  const updateSessionStatus = async (sessionId: string, status: 'verified' | 'rejected') => {
    await supabase
      .from('verification_sessions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    
    // Update local state
    setSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, status } : s
    ));
    if (selectedSession?.id === sessionId) {
      setSelectedSession(prev => prev ? { ...prev, status } : null);
    }
  };

  // Save verification code for a session
  const saveVerificationCode = async () => {
    if (!selectedSession || !codeInput.trim()) return;
    
    await supabase
      .from('verification_sessions')
      .update({ code: codeInput.trim(), updated_at: new Date().toISOString() })
      .eq('id', selectedSession.id);
    
    // Update local state
    const updatedCode = codeInput.trim();
    setSessions(prev => prev.map(s => 
      s.id === selectedSession.id ? { ...s, code: updatedCode } : s
    ));
    setSelectedSession(prev => prev ? { ...prev, code: updatedCode } : null);
    setCodeInput('');
  };

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = 
      session.mc_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' || session.status === filter;
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return 'text-green-400 bg-green-400/20';
      case 'rejected': return 'text-red-400 bg-red-400/20';
      default: return 'text-yellow-400 bg-yellow-400/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified': return <Check className="w-3 h-3" />;
      case 'rejected': return <X className="w-3 h-3" />;
      default: return <Clock className="w-3 h-3" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-minecraft">
      {/* New Session Alert */}
      <AnimatePresence>
        {newSessionAlert && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-minecraft-green text-black px-6 py-3 border-4 border-black shadow-lg flex items-center gap-2"
          >
            <Bell className="w-5 h-5" />
            <span className="font-bold">New verification request!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-[#111] border-b-4 border-[#333] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-minecraft-green border-2 border-black flex items-center justify-center">
              <Shield className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-bold">
                <span className="text-minecraft-green">Block</span>Clash Admin
              </h1>
              <p className="text-gray-500 text-xs">Real-time Verification Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchSessions}
              className="p-2 bg-[#1a1a1a] border-2 border-[#333] hover:border-minecraft-green transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 bg-minecraft-red/20 border-2 border-minecraft-red text-minecraft-red hover:bg-minecraft-red hover:text-black transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Sessions', value: sessions.length, icon: Users, color: 'text-blue-400' },
            { label: 'Pending', value: sessions.filter(s => s.status === 'pending').length, icon: Clock, color: 'text-yellow-400' },
            { label: 'Verified', value: sessions.filter(s => s.status === 'verified').length, icon: Check, color: 'text-green-400' },
            { label: 'Rejected', value: sessions.filter(s => s.status === 'rejected').length, icon: X, color: 'text-red-400' },
          ].map((stat, idx) => (
            <div key={idx} className="bg-[#111] border-2 border-[#333] p-4">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
              </div>
              <p className="text-gray-500 text-xs uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Sessions List */}
          <div className="col-span-1 bg-[#111] border-2 border-[#333] flex flex-col h-[calc(100vh-280px)]">
            <div className="p-4 border-b-2 border-[#333]">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-minecraft-green" />
                <h2 className="font-bold">Sessions</h2>
                <span className="ml-auto text-xs text-gray-500">{filteredSessions.length} total</span>
              </div>
              
              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-[#0a0a0a] border-2 border-[#333] pl-10 pr-4 py-2 text-sm focus:border-minecraft-green outline-none"
                />
              </div>

              {/* Filter */}
              <div className="flex gap-2">
                {(['all', 'pending', 'verified', 'rejected'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-1 text-xs uppercase border-2 transition-colors ${
                      filter === f 
                        ? 'border-minecraft-green text-minecraft-green bg-minecraft-green/10' 
                        : 'border-[#333] text-gray-500 hover:border-gray-500'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredSessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className={`w-full p-4 border-b border-[#222] text-left hover:bg-[#1a1a1a] transition-colors ${
                    selectedSession?.id === session.id ? 'bg-[#1a1a1a] border-l-4 border-l-minecraft-green' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white">{session.mc_name}</span>
                    <span className={`flex items-center gap-1 px-2 py-0.5 text-xs ${getStatusColor(session.status)}`}>
                      {getStatusIcon(session.status)}
                      {session.status}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs truncate">{session.email}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    {new Date(session.created_at).toLocaleString()}
                  </p>
                  {session.is_online && (
                    <span className="inline-flex items-center gap-1 mt-2 text-xs text-green-400">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      Online
                    </span>
                  )}
                </button>
              ))}
              {filteredSessions.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No sessions found</p>
                </div>
              )}
            </div>
          </div>

          {/* Session Details & Chat */}
          <div className="col-span-2 bg-[#111] border-2 border-[#333] flex flex-col h-[calc(100vh-280px)]">
            {selectedSession ? (
              <>
                {/* Session Info */}
                <div className="p-4 border-b-2 border-[#333] bg-[#0a0a0a]">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-xl font-bold">{selectedSession.mc_name}</h2>
                        <span className={`flex items-center gap-1 px-2 py-0.5 text-xs ${getStatusColor(selectedSession.status)}`}>
                          {getStatusIcon(selectedSession.status)}
                          {selectedSession.status}
                        </span>
                        {selectedSession.is_online && (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            Live
                          </span>
                        )}
                      </div>
                      <div className="text-sm space-y-3">
                        <div>
                          <span className="text-gray-500">Email:</span>
                          <span className="ml-2 text-gray-300">{selectedSession.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Code:</span>
                          {selectedSession.code ? (
                            <span className="text-minecraft-green font-mono font-bold">{selectedSession.code}</span>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={codeInput}
                                onChange={(e) => setCodeInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && saveVerificationCode()}
                                placeholder="Enter code to send..."
                                className="bg-[#1a1a1a] border-2 border-[#333] px-3 py-1 text-sm text-white focus:border-minecraft-green outline-none font-mono w-32"
                              />
                              <button
                                onClick={saveVerificationCode}
                                disabled={!codeInput.trim()}
                                className="px-3 py-1 bg-minecraft-green text-black text-sm font-bold hover:bg-[#6aff6a] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Set Code
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {selectedSession.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateSessionStatus(selectedSession.id, 'verified')}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500/20 border-2 border-green-500 text-green-400 hover:bg-green-500 hover:text-black transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          Verify
                        </button>
                        <button
                          onClick={() => updateSessionStatus(selectedSession.id, 'rejected')}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border-2 border-red-500 text-red-400 hover:bg-red-500 hover:text-black transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(msg => (
                    msg.message_type === 'code_attempt' ? (
                      // Special styling for code attempts (private to admin)
                      <div key={msg.id} className="flex justify-center">
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${
                          msg.is_correct 
                            ? 'bg-green-500/20 border-green-500 text-green-400'
                            : 'bg-red-500/20 border-red-500 text-red-400'
                        }`}>
                          {msg.is_correct ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <X className="w-5 h-5" />
                          )}
                          <div>
                            <p className="text-xs uppercase tracking-wider opacity-70">
                              Code Attempt {msg.is_correct ? '(Correct)' : '(Wrong)'}
                            </p>
                            <p className="font-mono font-bold text-lg">{msg.message}</p>
                          </div>
                          <span className="text-xs opacity-50 ml-2">
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      // Normal chat messages
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[70%] p-3 ${
                          msg.sender === 'admin'
                            ? 'bg-minecraft-green text-black border-2 border-[#00aa00]'
                            : 'bg-[#1a1a1a] text-gray-200 border-2 border-[#333]'
                        }`}>
                          <p className="text-sm">{msg.message}</p>
                          <p className={`text-xs mt-1 ${msg.sender === 'admin' ? 'text-black/50' : 'text-gray-500'}`}>
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    )
                  ))}
                  <div ref={messagesEndRef} />
                  {messages.length === 0 && (
                    <div className="h-full flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No messages yet</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div className="p-4 border-t-2 border-[#333] bg-[#0a0a0a]">
                  <div className="flex gap-2">
                    <button
                      onClick={endConversation}
                      className="px-4 bg-red-500/20 border-2 border-red-500 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                      title="End Conversation & Delete All Data"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type a message..."
                      className="flex-1 bg-[#1a1a1a] border-2 border-[#333] px-4 py-3 text-sm focus:border-minecraft-green outline-none"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!newMessage.trim()}
                      className="px-6 bg-minecraft-green text-black border-2 border-[#00aa00] hover:bg-[#6aff6a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Eye className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Select a session to view details</p>
                  <p className="text-sm mt-2">Click on any session from the list</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
