import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Loader2, Check, X, DollarSign, Wallet } from "lucide-react";

interface VoiceResult {
  type: "income" | "expense";
  amount: number;
  description: string;
  category: string;
  date: string;
  source: string;
  isTips: boolean;
  confidence: number;
}

export function VoiceBookkeeper() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(final || interim);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error !== "aborted") {
        toast({ title: "Voice Error", description: `Speech recognition failed: ${event.error}`, variant: "destructive" });
      }
    };

    recognitionRef.current = recognition;
  }, [toast]);

  const parseMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/voice-entry", { transcript: text });
      return res.json() as Promise<VoiceResult>;
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (err: Error) => {
      toast({ title: "Parse Error", description: err.message, variant: "destructive" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (entry: VoiceResult) => {
      if (entry.type === "expense") {
        await apiRequest("POST", "/api/expenses", {
          amount: entry.amount,
          date: entry.date,
          category: entry.category,
          description: entry.description,
        });
      } else {
        await apiRequest("POST", "/api/incomes", {
          amount: entry.amount,
          date: entry.date,
          source: entry.source || entry.category,
          description: entry.description,
          isTips: entry.isTips,
          platformFees: 0,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-summary"] });
      toast({ title: "Entry Created", description: `${result?.type === "income" ? "Income" : "Expense"} of $${result?.amount.toFixed(2)} recorded.` });
      setResult(null);
      setTranscript("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setTranscript("");
      setResult(null);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        toast({ title: "Microphone Error", description: "Could not access microphone. Please check permissions.", variant: "destructive" });
      }
    }
  };

  const handleSubmitTranscript = () => {
    if (transcript.trim().length > 2) {
      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop();
      }
      parseMutation.mutate(transcript.trim());
    }
  };

  const dismiss = () => {
    setResult(null);
    setTranscript("");
  };

  if (!isSupported) return null;

  return (
    <>
      {(transcript || result || parseMutation.isPending) && (
        <div className="fixed bottom-20 right-4 z-50 w-80 animate-in slide-in-from-bottom-4 duration-300">
          <Card className="shadow-xl border-primary/20">
            <CardContent className="p-4 space-y-3">
              {isListening && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-muted-foreground">Listening...</span>
                </div>
              )}

              {transcript && !result && !parseMutation.isPending && (
                <div className="space-y-2">
                  <p className="text-sm italic text-muted-foreground" data-testid="text-voice-transcript">"{transcript}"</p>
                  <Button size="sm" onClick={handleSubmitTranscript} className="w-full" data-testid="button-voice-parse">
                    <Check className="mr-2 h-3 w-3" /> Process with AI
                  </Button>
                </div>
              )}

              {parseMutation.isPending && (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">AI is parsing...</span>
                </div>
              )}

              {result && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {result.type === "income" ? (
                      <Badge className="bg-green-600" data-testid="badge-voice-type"><Wallet className="h-3 w-3 mr-1" /> Income</Badge>
                    ) : (
                      <Badge variant="destructive" data-testid="badge-voice-type"><DollarSign className="h-3 w-3 mr-1" /> Expense</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">{result.confidence}% match</Badge>
                  </div>

                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="font-medium" data-testid="text-voice-amount">${result.amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Category:</span>
                      <span className="text-xs" data-testid="text-voice-category">{result.category}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date:</span>
                      <span data-testid="text-voice-date">{result.date}</span>
                    </div>
                    {result.description && (
                      <p className="text-xs text-muted-foreground" data-testid="text-voice-description">{result.description}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => confirmMutation.mutate(result)}
                      disabled={confirmMutation.isPending}
                      className="flex-1"
                      data-testid="button-voice-confirm"
                    >
                      {confirmMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                      Confirm
                    </Button>
                    <Button size="sm" variant="outline" onClick={dismiss} data-testid="button-voice-dismiss">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <button
        onClick={toggleListening}
        className={`fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          isListening
            ? "bg-red-500 hover:bg-red-600 animate-pulse"
            : "bg-primary hover:bg-primary/90"
        }`}
        data-testid="button-voice-mic"
        title="Voice Bookkeeping"
      >
        {isListening ? (
          <MicOff className="h-5 w-5 text-white" />
        ) : (
          <Mic className="h-5 w-5 text-white" />
        )}
      </button>
    </>
  );
}
