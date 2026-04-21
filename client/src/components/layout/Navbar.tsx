import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Car, LayoutDashboard, Wallet, Receipt, LogOut } from "lucide-react";

export function Navbar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  if (!user) return null;

  const isActive = (path: string) => location === path;

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href="/" className="flex-shrink-0 flex items-center gap-2 cursor-pointer group">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground group-hover:scale-110 transition-transform">
                <Car className="w-5 h-5" />
              </div>
              <span className="font-display font-bold text-xl hidden sm:block">My Cab Tax USA</span>
            </Link>
            
            <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
              <Link href="/">
                <div className={`
                  inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full cursor-pointer transition-colors
                  ${isActive("/") 
                    ? "border-primary text-foreground" 
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}
                `}>
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Dashboard
                </div>
              </Link>
              <Link href="/expenses">
                <div className={`
                  inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full cursor-pointer transition-colors
                  ${isActive("/expenses") 
                    ? "border-primary text-foreground" 
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}
                `}>
                  <Receipt className="w-4 h-4 mr-2" />
                  Expenses
                </div>
              </Link>
              <Link href="/income">
                <div className={`
                  inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full cursor-pointer transition-colors
                  ${isActive("/income") 
                    ? "border-primary text-foreground" 
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}
                `}>
                  <Wallet className="w-4 h-4 mr-2" />
                  Income
                </div>
              </Link>
            </div>
          </div>
          
          <div className="flex items-center">
            <div className="hidden md:flex flex-col items-end mr-4">
              <span className="text-sm font-medium">{user.firstName} {user.lastName}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout">
              <LogOut className="w-5 h-5 text-muted-foreground hover:text-destructive transition-colors" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Mobile Menu */}
      <div className="sm:hidden border-t border-border bg-background/95 backdrop-blur fixed bottom-0 w-full pb-safe">
        <div className="grid grid-cols-3 h-16">
          <Link href="/">
            <div className={`flex flex-col items-center justify-center h-full cursor-pointer ${isActive("/") ? "text-primary" : "text-muted-foreground"}`}>
              <LayoutDashboard className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-medium">Overview</span>
            </div>
          </Link>
          <Link href="/expenses">
            <div className={`flex flex-col items-center justify-center h-full cursor-pointer ${isActive("/expenses") ? "text-primary" : "text-muted-foreground"}`}>
              <Receipt className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-medium">Expenses</span>
            </div>
          </Link>
          <Link href="/income">
            <div className={`flex flex-col items-center justify-center h-full cursor-pointer ${isActive("/income") ? "text-primary" : "text-muted-foreground"}`}>
              <Wallet className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-medium">Income</span>
            </div>
          </Link>
        </div>
      </div>
    </nav>
  );
}
