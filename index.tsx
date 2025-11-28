
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Chat } from "@google/genai";
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { marked } from 'marked';

const SYSTEM_PROMPT = `
# ROLE & PERSONA
You are "Interviewer Pro". You are a skeptical hiring manager who focuses on facts.
**CORE STYLE:** Use **simple, plain language**. Avoid big words, buzzwords, or corporate speak. Your questions should be short, direct, and impossible to misunderstand.

# GOAL
Generate a **Comprehensive Interview Script** that covers every angle.
*   **Multiple Questions:** For each job role on the resume, provide **3 distinct questions** covering different aspects (Technical execution, Impact/Results, and Challenges).
*   **Plain English:** Write as if you are speaking to a colleague in a casual but serious meeting.
*   **Verification:** Find out if they really did the work or just watched others do it.

# OUTPUT STRUCTURE

## Chronological Interview Script

### 1. [Job Title] at [Company]

**Q1: The Technical Details**
"[Ask simply how they implemented a specific tool or feature listed. e.g., 'How exactly did you use React to build that dashboard?']"
> *Intent: To verify they wrote the code themselves.*

**Q2: The Real Impact**
"[Ask about a specific number or success they claim. e.g., 'You listed 50% faster load times. How did you measure that exactly?']"
> *Intent: To see if the metric is real or made up.*

**Q3: The Hard Part**
"[Ask about a specific problem or bug they solved in this role. e.g., 'What was the hardest bug you fixed while working on X?']"
> *Intent: To test their problem-solving skills.*

*(Iterate through EVERY major role/project on the resume...)*

## Missing Skills Check
### Topic: [Skill from JD not found in Resume]
**Question:** "[Simple scenario question to test this skill]"

---

# PHASE 2: INTERVIEW SIMULATION (CHAT LOOP)
After generating the script, wait for the user to respond. The user might say "Let's start with Q1" or provide an answer.
1.  **Keep it Simple:** Use short, clear sentences.
2.  **Challenge Them:** If they say "We did this", ask "What specifically did YOU do?"
3.  **No Jargon:** Do not use fancy words.
4.  **Stay in Character:** You are the interviewer. Do not break character.
`;

marked.use({
  gfm: true,
  breaks: true,
});

type Message = {
  role: 'user' | 'model';
  text: string;
};

// --- Child Components ---

interface SetupViewProps {
  resume: string;
  setResume: (value: string) => void;
  jobDescription: string;
  setJobDescription: (value: string) => void;
  language: string;
  setLanguage: (value: string) => void;
  handleGeneratePlan: () => void;
  isLoading: boolean;
  error: string | null;
}

function SetupView({
  resume, setResume,
  jobDescription, setJobDescription,
  language, setLanguage,
  handleGeneratePlan, isLoading, error
}: SetupViewProps) {
  return (
    <div className="setup-container fade-in">
      <div className="setup-grid">
        {/* Left Column: Resume */}
        <div className="card glass-panel">
          <div className="card-header">
            <div className="icon-badge blue">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <h3>Candidate Resume</h3>
          </div>
          
          <div className="form-group">
            <label>Language</label>
            <div className="select-wrapper">
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="English">English</option>
                    <option value="中文">中文 (Chinese)</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Japanese">Japanese</option>
                </select>
                <div className="select-arrow">▼</div>
            </div>
          </div>

          <div className="form-group grow">
             <label>Paste Resume Text</label>
             <textarea
               value={resume}
               onChange={(e) => setResume(e.target.value)}
               placeholder="Paste the full resume here..."
             />
          </div>
        </div>

        {/* Right Column: JD */}
        <div className="card glass-panel">
           <div className="card-header">
            <div className="icon-badge purple">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            </div>
            <h3>Target Job Description</h3>
          </div>
          <div className="form-group grow">
             <label>Paste Job Description</label>
             <textarea
               value={jobDescription}
               onChange={(e) => setJobDescription(e.target.value)}
               placeholder="Paste the job description here..."
             />
          </div>
        </div>
      </div>

      <div className="action-bar">
         {error && <div className="error-toast">{error}</div>}
         
         <button 
           className={`generate-btn ${isLoading ? 'loading' : ''}`}
           onClick={handleGeneratePlan}
           disabled={!resume || !jobDescription || isLoading}
         >
            {isLoading ? (
                <>
                   <div className="spinner"></div>
                   <span>Analyzing & Thinking...</span>
                </>
            ) : (
                <>
                   <span>Generate Interview Script</span>
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </>
            )}
         </button>
         <p className="model-info">Powered by <strong>Gemini 3.0 Pro</strong> • High-Reasoning Mode</p>
      </div>
    </div>
  );
}

interface ChatViewProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

function ChatView({ messages, onSendMessage, isLoading }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
        // Smooth scroll to bottom when messages change
        scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth'
        });
    }
  }, [messages, isLoading]);
  
  return (
    <div className="chat-interface fade-in">
       <div className="chat-scroll-area" ref={scrollRef}>
          {messages.map((msg, index) => (
             <MessageBubble key={index} message={msg} />
          ))}
          {isLoading && <ThinkingBubble />}
       </div>
       
       <MessageInput onSend={onSendMessage} isLoading={isLoading} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
    const isModel = message.role === 'model';
    
    // Render Markdown securely
    const createMarkup = (text: string) => {
        const rawMarkup = marked.parse(text);
        return { __html: rawMarkup as string };
    };

    return (
        <div className={`message-row ${isModel ? 'model' : 'user'}`}>
            <div className="avatar">
                {isModel ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><path d="M12 16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z"></path><path d="M12 9a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z"></path><circle cx="12" cy="12" r="10"></circle></svg>
                ) : (
                    <span>ME</span>
                )}
            </div>
            <div className="bubble-content glass-bubble">
                <div className="markdown-body" dangerouslySetInnerHTML={createMarkup(message.text)} />
            </div>
        </div>
    );
}

function ThinkingBubble() {
    return (
        <div className="message-row model">
             <div className="avatar">
                <div className="pulse-ring"></div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle></svg>
            </div>
            <div className="bubble-content glass-bubble thinking">
                <div className="dot-flashing"></div>
                <span>Interviewer is thinking...</span>
            </div>
        </div>
    )
}

function MessageInput({ onSend, isLoading }: { onSend: (text: string) => void, isLoading: boolean }) {
    const [text, setText] = useState('');
    const taRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (text.trim() && !isLoading) {
            onSend(text);
            setText('');
            if (taRef.current) taRef.current.style.height = 'auto';
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }
    
    // Auto-grow textarea
    useEffect(() => {
        if (taRef.current) {
             taRef.current.style.height = 'auto';
             taRef.current.style.height = `${Math.min(taRef.current.scrollHeight, 150)}px`;
        }
    }, [text]);

    return (
        <div className="input-deck glass-panel">
            <div className="input-wrapper">
                <textarea
                    ref={taRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isLoading ? "Please wait..." : "Type your answer or ask for clarification..."}
                    disabled={isLoading}
                    rows={1}
                />
                <button 
                    className="send-btn" 
                    onClick={() => handleSubmit()} 
                    disabled={!text.trim() || isLoading}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                </button>
            </div>
        </div>
    )
}

// --- Main App ---

function App() {
  const [view, setView] = useState<'setup' | 'interview'>('setup');
  const [resume, setResume] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [language, setLanguage] = useState('English');
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize Chat and Generate Script
  const handleGeneratePlan = async () => {
    if (!resume || !jobDescription) return;
    setIsLoading(true);
    setError(null);
    
    // Transition to interview view immediately for better UX
    setView('interview');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const newChat = ai.chats.create({
        model: 'gemini-3-pro-preview',
        config: { 
            systemInstruction: SYSTEM_PROMPT,
            thinkingConfig: { thinkingBudget: 32768 } 
        },
      });
      setChat(newChat);

      const prompt = `Generate the interview script now.\n\nLANGUAGE: ${language}\n\nRESUME:\n${resume}\n\nJOB DESCRIPTION:\n${jobDescription}`;
      
      const stream = await newChat.sendMessageStream({ message: prompt });
      
      // Initialize model message
      setMessages([{ role: 'model', text: '' }]);
      
      let fullText = '';
      for await (const chunk of stream) {
        if (chunk.text) {
             fullText += chunk.text;
             setMessages(prev => {
                const newMsgs = [...prev];
                // Update the last message (the model's response)
                newMsgs[0] = { role: 'model', text: fullText };
                return newMsgs;
             });
        }
      }
    } catch (err) {
      console.error(err);
      setError("Failed to generate script. API might be busy.");
      setView('setup'); // Go back on error
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle continuous conversation
  const handleSendMessage = async (text: string) => {
    if (!chat || !text.trim()) return;
    
    setIsLoading(true);
    // Optimistically add user message
    setMessages(prev => [...prev, { role: 'user', text }]);
    
    try {
        const stream = await chat.sendMessageStream({ message: text });
        
        // Add placeholder for model response
        setMessages(prev => [...prev, { role: 'model', text: '' }]);
        
        let fullText = '';
        for await (const chunk of stream) {
            if (chunk.text) {
                fullText += chunk.text;
                setMessages(prev => {
                    const clone = [...prev];
                    const lastIdx = clone.length - 1;
                    clone[lastIdx] = { ...clone[lastIdx], text: fullText };
                    return clone;
                });
            }
        }
    } catch (err) {
        console.error("Chat Error", err);
        setMessages(prev => [...prev, { role: 'model', text: "**Error:** Connection lost. Please try again." }]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleRestart = () => {
    if (confirm("Are you sure you want to start a new session? Current progress will be lost.")) {
        setView('setup');
        setMessages([]);
        setChat(null);
        setError(null);
    }
  };

  return (
    <div className="app-root">
      <header className="glass-header">
        <div className="brand">
            <div className="logo">IP</div>
            <h1>Interviewer Pro <span className="version">3.0</span></h1>
        </div>
        <button className="restart-btn" onClick={handleRestart} aria-label="New Session">
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
           <span>New Session</span>
        </button>
      </header>

      <main className="main-content">
        {view === 'setup' ? (
             <SetupView 
                resume={resume} setResume={setResume}
                jobDescription={jobDescription} setJobDescription={setJobDescription}
                language={language} setLanguage={setLanguage}
                handleGeneratePlan={handleGeneratePlan}
                isLoading={isLoading}
                error={error}
             />
        ) : (
             <ChatView 
                messages={messages} 
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
             />
        )}
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
