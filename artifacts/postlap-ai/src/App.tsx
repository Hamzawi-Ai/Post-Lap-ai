import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import Admin from "@/pages/admin";
import SecretAdmin from "@/pages/secret-admin";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import Onboarding from "@/pages/onboarding";
import CompanySettings from "@/pages/company";
import BrandIdentity from "@/pages/brand";
import HamzawiWorkspace from "@/pages/hamzawi";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// The /hamzawi route is the internal owner assistant. Customers must never
// reach it: anyone without an admin session is redirected to the PostLab home.
const ADMIN_TOKEN_KEY = "postlap_admin_token";

function OwnerOnly({ children }: { children: ReactNode }) {
  if (!localStorage.getItem(ADMIN_TOKEN_KEY)) {
    return <Redirect to="/" replace />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/hamzawi">
        <OwnerOnly>
          <HamzawiWorkspace />
        </OwnerOnly>
      </Route>
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/company" component={CompanySettings} />
      <Route path="/brand" component={BrandIdentity} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/khtfa-secure-portal" component={Admin} />
      <Route path="/khtfa-secure-portal/:section" component={Admin} />
      <Route path="/dashboard-admin-access" component={SecretAdmin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
