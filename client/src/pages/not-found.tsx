import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-semibold">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Did you forget your turn signal? This page doesn't exist.
          </p>
          
          <div className="mt-8">
            <Link href="/">
              <Button className="w-full">
                Take me back home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
