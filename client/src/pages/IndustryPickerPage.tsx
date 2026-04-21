import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CarFront, Package, Loader2, ArrowRight, Layers } from "lucide-react";
import { useLocation } from "wouter";
import type { UserSegment } from "@/lib/segment-config";

export default function IndustryPickerPage() {
  const [selected, setSelected] = useState<UserSegment | null>(null);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: currentUser } = useQuery<any>({ queryKey: ["/api/auth/user"] });

  const mutation = useMutation({
    mutationFn: (segment: UserSegment) =>
      apiRequest("PATCH", "/api/user/segment", { segment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate(currentUser?.isVerified ? "/dashboard" : "/verify");
    },
  });

  const options = [
    {
      id: "taxi" as UserSegment,
      title: "Taxi / Rideshare Driver",
      description: "I drive passengers with Uber, Lyft, taxi, or similar services.",
      icon: CarFront,
      features: ["Passenger trip tracking", "Surge earnings analysis", "TLC fee deductions"],
    },
    {
      id: "delivery" as UserSegment,
      title: "Delivery Courier",
      description: "I deliver food or packages with DoorDash, Instacart, Amazon Flex, or similar.",
      icon: Package,
      features: ["Order delivery tracking", "Tip breakdown analysis", "Equipment deductions"],
    },
    {
      id: "hybrid" as UserSegment,
      title: "Show Both (Hybrid)",
      description: "I multi-app — rides until 5 PM, then deliveries for the dinner rush.",
      icon: Layers,
      features: ["Combined ride & delivery tracking", "Merged expense suggestions", "All platforms in one view"],
    },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 bg-primary rounded-md text-primary-foreground mx-auto">
            <CarFront className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold" data-testid="text-industry-title">
            How do you earn?
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            We'll tailor your dashboard, expense suggestions, and tax tips to match your work.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {options.map((option) => {
            const isSelected = selected === option.id;
            return (
              <Card
                key={option.id}
                className={`cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "ring-2 ring-primary border-primary"
                    : "hover-elevate"
                }`}
                onClick={() => setSelected(option.id)}
                data-testid={`card-segment-${option.id}`}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      <option.icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-base" data-testid={`text-segment-title-${option.id}`}>
                        {option.title}
                      </h2>
                    </div>
                    {isSelected && (
                      <Badge variant="default" className="shrink-0 no-default-active-elevate" data-testid={`badge-selected-${option.id}`}>
                        Selected
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                  <ul className="space-y-1.5">
                    {option.features.map((feature) => (
                      <li key={feature} className="text-xs text-muted-foreground flex items-center gap-2">
                        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          isSelected ? "bg-primary" : "bg-muted-foreground/40"
                        }`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            disabled={!selected || mutation.isPending}
            onClick={() => selected && mutation.mutate(selected)}
            className="w-full sm:w-auto min-w-[200px]"
            data-testid="button-continue-segment"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            Continue
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            You can switch anytime from Settings. Some drivers do both!
          </p>
        </div>
      </div>
    </div>
  );
}
