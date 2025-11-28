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
When the user answers:
1.  **Keep it Simple:** Use short, clear sentences.
2.  **Challenge Them:** If they say "We did this", ask "What specifically did YOU do?"
3.  **No Jargon:** Do not use fancy words.
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
    <div className="setup-view">
      <div className="setup-panel left">
        <div className="brand-header-small">
           <div className="icon-box">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
           </div>
           <h2>Candidate Profile</h2>
        </div>
        
        <div className="input-group">
          <label htmlFor="language">Interview Language</label>
          <div className="select-wrapper">
            <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="中文">中文 (Chinese)</option>
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Hindi">Hindi</option>
                <option value="Japanese">Japanese</option>
            </select>
            <svg className="select-arrow" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
          </div>
        </div>

        <div className="input-group grow">
          <label htmlFor="resume">Resume / CV</label>
          <textarea
            id="resume"
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="Paste your full resume here. I'll look for metrics that don't add up."
            aria-label="Resume Input"
          />
        </div>
      </div>

      <div className="setup-panel right">
         <div className="brand-header-small">
           <div className="icon-box target">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
           </div>
           <h2>Target Role</h2>
        </div>
        <div className="input-group grow">
          <label htmlFor="jd">Job Description (JD)</label>
          <textarea
            id="jd"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the Job Description. I'll identify the 'Deal Breaker' skills they really want."
            aria-label="Job Description Input"
          />
        </div>

        <div className="action-area">
            {error && <div className="error-banner">{error}</div>}
            <button
            className="start-button"
            onClick={handleGeneratePlan}
            disabled={!resume || !jobDescription || !language || isLoading}
            >
            {isLoading ? (
                <span className="button-content">
                    <span className="spinner"></span> Analyzing & Scripting...
                </span>
            ) : (
                <span className="button-content">
                    Generate Interview Script <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </span>
            )}
            </button>
            <p className="disclaimer">Interviewer Pro uses <strong>Gemini 3.0 Pro</strong> with extended thinking budget to script your interview.</p>
        </div>
      </div>
    </div>
  );
}

interface ChatViewProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onRestart: () => void;
}

function ChatView({ messages, onSendMessage, isLoading, onRestart }: ChatViewProps) {
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);
  
  return (
    <div className="chat-view">
      <div className="chat-header">
        <div className="chat-title">
            <span className="status-dot"></span>
            <h3>Live Interview Script</h3>
        </div>
      </div>
      <div className="message-list" ref={messageListRef}>
        {messages.map((msg, index) => (
          <MessageBubble
            key={index}
            message={msg}
            isFirstModelMessage={msg.role === 'model' && index === 0}
          />
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
           <div className="message-row model">
                <div className="avatar model">AI</div>
                <div className="message-bubble model loading">
                   <div className="typing-indicator">
                        <span></span><span></span><span></span>
                   </div>
                   <span className="thinking-text">Interviewer is thinking...</span>
                </div>
           </div>
        )}
      </div>
      <MessageForm onSend={onSendMessage} isLoading={isLoading} />
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  isFirstModelMessage: boolean;
}

function MessageBubble({ message, isFirstModelMessage }: MessageBubbleProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const createMarkup = (text: string) => {
        const rawMarkup = marked.parse(text);
        return { __html: rawMarkup as string };
    };

    return (
        <div className={`message-row ${message.role}`}>
            <div className={`avatar ${message.role}`}>
                {message.role === 'model' ? 'AI' : 'ME'}
            </div>
            <div className={`message-bubble ${message.role}`}>
                {message.text ? (
                    <div className="markdown-content" dangerouslySetInnerHTML={createMarkup(message.text)} />
                ) : (
                    <div className="loading-container">
                        <div className="typing-indicator"><span></span><span></span><span></span></div>
                    </div>
                )}
                {isFirstModelMessage && message.text && (
                    <div className="bubble-actions">
                        <button onClick={handleCopy} className="copy-link">
                            {copied ? 'Copied' : 'Copy Script'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

interface MessageFormProps {
  onSend: (text: string) => void;
  isLoading: boolean;
}

function MessageForm({ onSend, isLoading }: MessageFormProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSend(input);
      setInput('');
    }
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [input]);

  return (
    <div className="input-area">
        <form className="message-form" onSubmit={handleSubmit} aria-busy={isLoading}>
        <textarea
            ref={textareaRef}
            className="message-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
            }
            }}
            placeholder={isLoading ? "Interviewer is listening..." : "Type candidate's response here..."}
            disabled={isLoading}
            aria-label="Your answer"
            rows={1}
        />
        <button type="submit" className="send-button" disabled={isLoading || !input.trim()} aria-label="Send Answer">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
        </form>
    </div>
  )
}

// --- Main App Component ---

function App() {
  const [view, setView] = useState<'setup' | 'interview'>('setup');
  const [resume, setResume] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [language, setLanguage] = useState('English');
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGeneratePlan = async () => {
    if (!resume || !jobDescription || !language) return;
    setIsLoading(true);
    setError(null);
    setView('interview');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const newChat = ai.chats.create({
        model: 'gemini-3-pro-preview',
        config: { 
            systemInstruction: SYSTEM_PROMPT,
            // Max thinking budget for deep "Gap Analysis" and scripting
            thinkingConfig: { thinkingBudget: 32768 } 
        },
      });
      setChat(newChat);

      const firstUserMessage = `Here is the candidate info. Generate the Script.\n\n# Language\n\n${language}\n\n# Resume\n\n${resume}\n\n# Job Description\n\n${jobDescription}`;
      
      const stream = await newChat.sendMessageStream({ message: firstUserMessage });
      setMessages([{ role: 'model', text: '' }]);
      
      let responseText = '';
      for await (const chunk of stream) {
        if (chunk.text) {
             responseText += chunk.text;
             setMessages([{ role: 'model', text: responseText }]);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Failed to generate the plan. Please check your API key and try again.');
      setView('setup');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSendMessage = async (text: string) => {
    if (!chat || isLoading || !text.trim()) return;
    setIsLoading(true);
    setError(null);
    
    setMessages(prev => [...prev, { role: 'user', text }]);

    try {
        const stream = await chat.sendMessageStream({ message: text });
        setMessages(prev => [...prev, { role: 'model', text: '' }]);
        
        let responseText = '';
        for await (const chunk of stream) {
            if (chunk.text) {
                responseText += chunk.text;
                setMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1].text = responseText;
                    return newMsgs;
                });
            }
        }
    } catch(err) {
        console.error(err);
        const errorText = 'Sorry, the connection was lost. Please restart.';
        setMessages(prev => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1].text = errorText;
            return newMsgs;
        });
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleRestart = () => {
    if (window.confirm('Restart interview preparation?')) {
        setView('setup');
        setMessages([]);
        setChat(null);
        setError(null);
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>
            <div className="logo-icon">IP</div>
            Interviewer Pro
        </h1>
        {view === 'interview' && <button className="restart-button" onClick={handleRestart}>New Session</button>}
      </header>
      
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
            onRestart={handleRestart}
        />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);