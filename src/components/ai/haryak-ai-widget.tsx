'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Bot,
  X,
  Send,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  CalendarOff,
  FileText,
  Users,
  Building,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'

interface Message {
  id: string
  sender: 'user' | 'assistant'
  text: string
  isDenied?: boolean
  timestamp: string
}

export function HaryakAiWidget() {
  const { user, profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am the Haryak Enterprise AI Assistant. I operate under strict enterprise RBAC to help you with leave balances, your own payslips, company directory lookup, and HR policies.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  const handleSend = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || input).trim()
    if (!promptToSend || loading) return

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages(prev => [...prev, userMsg])
    if (!customPrompt) setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptToSend }),
      })
      const data = await res.json()

      if (data.success) {
        const botMsg: Message = {
          id: `bot_${Date.now()}`,
          sender: 'assistant',
          text: data.message,
          isDenied: data.isDenied,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages(prev => [...prev, botMsg])
      } else {
        const errorMsg: Message = {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: data.error || 'I encountered an error processing your query.',
          isDenied: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages(prev => [...prev, errorMsg])
      }
    } catch (err) {
      toast.error('Network error communicating with AI Assistant.')
    } finally {
      setLoading(false)
    }
  }

  const quickPrompts = [
    { label: 'My Leave Balance', icon: CalendarOff, prompt: 'What is my leave balance?' },
    { label: 'My Latest Payslip', icon: FileText, prompt: 'Show my latest payslip summary' },
    { label: 'Find Colleague', icon: Users, prompt: 'Find employee in directory' },
    { label: 'Company Holidays', icon: Building, prompt: 'What are the company holidays?' },
  ]

  return (
    <>
      {/* Floating Toggle Button */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
        {!isOpen ? (
          <Button
            onClick={() => setIsOpen(true)}
            className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[#1e2a78] hover:bg-[#152060] text-white shadow-xl flex items-center justify-center p-0 transition-transform hover:scale-105"
            title="Haryak AI Assistant"
          >
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 animate-pulse" />
          </Button>
        ) : null}
      </div>

      {/* Floating Chat Drawer */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 max-w-sm h-[520px] max-h-[calc(100dvh-5rem)] bg-card border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="p-3.5 bg-[#1e2a78] text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold tracking-wide">Haryak AI Assistant</h3>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 border-white/30 text-white">
                    RBAC
                  </Badge>
                </div>
                <p className="text-[10px] text-blue-200">Strict Enterprise Privacy</p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-white hover:bg-white/20"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5 text-xs bg-slate-50/50 dark:bg-slate-950/30">
            {messages.map((m) => {
              const isUser = m.sender === 'user'
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-xl leading-relaxed whitespace-pre-line ${
                      isUser
                        ? 'bg-[#1e2a78] text-white rounded-tr-none'
                        : m.isDenied
                        ? 'bg-rose-50 border border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200 rounded-tl-none'
                        : 'bg-white dark:bg-card border text-foreground rounded-tl-none shadow-xs'
                    }`}
                  >
                    {!isUser && m.isDenied && (
                      <div className="flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-400 mb-1">
                        <ShieldAlert className="w-3.5 h-3.5" /> Access Restricted
                      </div>
                    )}
                    {m.text}
                  </div>
                  <span className="text-[9px] text-muted-foreground px-1 mt-0.5">
                    {m.timestamp}
                  </span>
                </div>
              )
            })}
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs p-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1e2a78]" />
                <span>Consulting RBAC knowledge base...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion Chips */}
          <div className="p-2 border-t bg-muted/20 flex gap-1.5 overflow-x-auto no-scrollbar">
            {quickPrompts.map((qp, idx) => {
              const Icon = qp.icon
              return (
                <button
                  key={idx}
                  onClick={() => handleSend(qp.prompt)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full border bg-background text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 transition-colors"
                >
                  <Icon className="w-3 h-3 text-[#1e2a78]" />
                  <span>{qp.label}</span>
                </button>
              )
            })}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="p-2.5 border-t bg-card flex items-center gap-1.5"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Haryak AI..."
              className="text-xs h-8"
              disabled={loading}
            />
            <Button
              type="submit"
              size="sm"
              className="bg-[#1e2a78] hover:bg-[#152060] text-white h-8 w-8 p-0 shrink-0"
              disabled={loading || !input.trim()}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
        </div>
      )}
    </>
  )
}
