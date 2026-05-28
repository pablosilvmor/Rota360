import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Olá! Sou o assistente virtual do Rota 360. Como posso te ajudar com o sistema hoje?'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!res.ok) throw new Error('Falha na requisição');

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, ocorreu um erro ao tentar processar sua dúvida. Tente novamente mais tarde.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest border border-outline-variant shadow-2xl rounded-2xl w-full max-w-2xl h-[80vh] sm:h-[600px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-outline-variant bg-surface-container-low flex justify-between items-center relative overflow-hidden">
          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none" />
          
          <div className="flex items-center gap-3 relative z-10">
             <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-sm">
                <span className="material-symbols-outlined text-[20px]">psychology</span>
             </div>
             <div>
               <h3 className="text-lg font-bold text-on-surface">Central de Ajuda Inteligente</h3>
               <p className="text-xs text-on-surface-variant font-medium">Tire suas dúvidas sobre o Rota 360</p>
             </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors relative z-10"
            title="Fechar"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface-container-lowest space-y-6 scroll-smooth">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[85%] rounded-2xl px-5 py-3.5 shadow-sm text-sm leading-relaxed
                  ${msg.role === 'user' 
                    ? 'bg-primary text-on-primary rounded-br-sm' 
                    : 'bg-surface-container text-on-surface border border-outline-variant/50 rounded-bl-sm'}
                `}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5 text-on-surface">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-surface-container text-on-surface border border-outline-variant/50 rounded-2xl rounded-bl-sm px-5 py-4 shadow-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-surface-container-low border-t border-outline-variant">
          <div className="relative flex items-center bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary rounded-xl overflow-hidden transition-all shadow-sm">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
              placeholder="Pergunte algo sobre o sistema..."
              className="flex-1 bg-transparent px-4 py-4 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/70"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="px-4 py-2 mx-2 bg-primary text-on-primary rounded-lg font-bold flex items-center justify-center gap-2 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              <span className="hidden sm:inline">Enviar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
