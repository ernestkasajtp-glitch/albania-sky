import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import {
  confirmAssistantAction,
  useAskAssistant,
  type AssistantActionProposal,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, Send, Info, Sparkles, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isError?: boolean;
  proposal?: AssistantActionProposal | null;
  actionState?: "pending" | "executing" | "executed" | "error";
  actionError?: string;
};

const STARTER_PROMPTS = [
  "Cilat fluturime kanë më pak se 10 vende të lira?",
  "Sa është totali i pagesave të pranuara sot?",
  "Cili agjent ka më shumë pasagjerë dhe rezervime?",
  "Më jep një përmbledhje të plotë të sistemit."
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const confirmingProposalIds = useRef(new Set<string>());
  
  const askAssistant = useAskAssistant();

  const confirmProposal = async (messageId: string, proposalId: string) => {
    if (confirmingProposalIds.current.has(proposalId)) return;
    confirmingProposalIds.current.add(proposalId);
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, actionState: "executing", actionError: undefined }
          : message,
      ),
    );
    try {
      await confirmAssistantAction(proposalId);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? { ...message, actionState: "executed" }
            : message,
        ),
      );
    } catch (error) {
      const apiError = error as { data?: { error?: string } };
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                actionState: "error",
                actionError:
                  apiError.data?.error ??
                  "Veprimi nuk mund të kryhej. Provoni përsëri.",
              }
            : message,
        ),
      );
    } finally {
      confirmingProposalIds.current.delete(proposalId);
    }
  };

  useEffect(() => {
    // Automatically scroll to the bottom when messages change or while loading
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, askAssistant.isPending]);

  const handleSend = (text: string) => {
    if (!text.trim() || askAssistant.isPending) return;

    const userMsgId = Math.random().toString(36).substring(7);
    const newMessages = [
      ...messages,
      { id: userMsgId, role: "user" as const, content: text.trim(), timestamp: new Date() }
    ];
    setMessages(newMessages);
    setInputValue("");

    askAssistant.mutate(
      { data: { message: text.trim() } },
      {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            {
              id: Math.random().toString(36).substring(7),
              role: "assistant",
              content: data.answer,
              timestamp: data.generatedAt ? new Date(data.generatedAt) : new Date(),
              proposal: data.proposal,
              actionState: data.proposal ? "pending" : undefined,
            }
          ]);
        },
        onError: (error) => {
          const errorMessage =
            error.data?.error ??
            "Ndodhi një gabim gjatë lidhjes me sistemin. Ju lutem provoni përsëri.";
          setMessages((prev) => [
            ...prev,
            {
              id: Math.random().toString(36).substring(7),
              role: "assistant",
              content: errorMessage,
              timestamp: new Date(),
              isError: true,
            }
          ]);
        }
      }
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputValue);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-full bg-background relative" data-testid="page-assistant">
      <div className="flex-none p-6 pb-4 border-b border-border bg-card">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 text-foreground" data-testid="text-assistant-title">
          <Sparkles className="w-6 h-6 text-primary" />
          Asistenti Inteligjent
        </h1>
        <p className="text-muted-foreground text-sm mt-1" data-testid="text-assistant-subtitle">
          Kërkoni të dhëna operacionale, statuse fluturimesh dhe raporte financiare në kohë reale.
        </p>
      </div>

      <ScrollArea className="flex-1 px-4 py-6 md:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 md:py-24 text-center animate-in fade-in zoom-in duration-500">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-primary/20">
                <Bot className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2" data-testid="text-welcome-title">Si mund t'ju ndihmoj sot?</h2>
              <p className="text-muted-foreground text-sm max-w-md mb-8" data-testid="text-welcome-desc">
                Asistenti analizon të dhënat dhe mund të propozojë veprime të kontrolluara. Asnjë ndryshim nuk kryhet pa konfirmimin tuaj.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                {STARTER_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(prompt)}
                    className="text-left px-4 py-3 bg-card border border-border rounded-xl hover:border-primary/50 hover:shadow-md transition-all duration-200 text-sm text-card-foreground group"
                    data-testid={`button-starter-${i}`}
                  >
                    <span className="text-primary font-medium group-hover:text-primary transition-colors mr-2 opacity-70 group-hover:opacity-100">→</span>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                data-testid={`message-${msg.role}-${msg.id}`}
              >
                <Avatar className={`w-8 h-8 flex-shrink-0 border shadow-sm ${msg.role === 'user' ? 'border-primary/20' : 'border-primary/40 bg-primary/10'}`}>
                  {msg.role === 'user' ? (
                    <AvatarFallback className="bg-primary/10 text-primary"><User className="w-4 h-4" /></AvatarFallback>
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-primary"><Bot className="w-4 h-4" /></AvatarFallback>
                  )}
                </Avatar>
                <div className={`flex flex-col gap-1 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-4 py-3 rounded-2xl text-[15px] shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : msg.isError 
                          ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm'
                          : 'bg-card text-card-foreground border border-border rounded-tl-sm'
                    }`}
                  >
                    {msg.isError && <AlertCircle className="w-4 h-4 inline-block mr-2 mb-0.5" />}
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  </div>
                  {msg.proposal && (
                    <div className="w-full mt-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left shadow-sm">
                      <div className="flex items-center gap-2 text-amber-900 font-semibold">
                        <ShieldCheck className="h-4 w-4" />
                        {msg.proposal.title}
                      </div>
                      <p className="mt-2 text-sm text-amber-950">{msg.proposal.summary}</p>
                      <p className="mt-1 text-xs text-amber-800">{msg.proposal.warning}</p>
                      {msg.actionError && (
                        <p className="mt-2 text-xs font-medium text-destructive">{msg.actionError}</p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        {msg.actionState === "executed" ? (
                          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            Veprimi u krye
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            disabled={msg.actionState === "executing"}
                            onClick={() => confirmProposal(msg.id, msg.proposal!.proposalId)}
                            data-testid={`button-confirm-action-${msg.id}`}
                          >
                            {msg.actionState === "executing" ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="mr-2 h-4 w-4" />
                            )}
                            Konfirmo veprimin
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  <span className="text-[11px] text-muted-foreground font-medium px-1">
                    {msg.timestamp.toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          )}

          {askAssistant.isPending && (
            <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300" data-testid="message-loading">
              <Avatar className="w-8 h-8 flex-shrink-0 border border-primary/40 shadow-sm bg-primary/10">
                <AvatarFallback className="bg-primary/10 text-primary"><Bot className="w-4 h-4" /></AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1 items-start">
                <div className="px-5 py-4 rounded-2xl bg-card border border-border rounded-tl-sm shadow-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} className="h-2" />
        </div>
      </ScrollArea>

      <div className="flex-none p-4 bg-background border-t border-border">
        <div className="max-w-4xl mx-auto">
          <div className="relative flex items-end gap-2 bg-card border border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 rounded-xl p-2 transition-all shadow-sm">
            <Textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Shkruani pyetjen tuaj këtu... (Shift + Enter për rresht të ri)"
              className="min-h-[44px] max-h-[200px] resize-none border-0 focus-visible:ring-0 px-2 py-3 shadow-none bg-transparent text-[15px]"
              rows={1}
              data-testid="input-assistant-message"
            />
            <div className="pb-1 pr-1">
              <Button 
                size="icon" 
                className="w-10 h-10 rounded-lg shadow-sm"
                disabled={!inputValue.trim() || askAssistant.isPending}
                onClick={() => handleSend(inputValue)}
                data-testid="button-send-message"
              >
                {askAssistant.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5 ml-[-2px]" />
                )}
              </Button>
            </div>
          </div>
          <div className="mt-3 text-center">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1.5" data-testid="text-readonly-notice">
              <Info className="w-3.5 h-3.5" />
              Veprimet kryhen vetëm pasi t'i konfirmoni në kartën e sigurisë.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
