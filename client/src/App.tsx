import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Leads from "./pages/Leads";
import EmailTemplates from "./pages/EmailTemplates";
import Analytics from "./pages/Analytics";

function Router() {
  return (
    <Switch>
      <Route path={"/"}>
        <DashboardLayout>
          <Leads />
        </DashboardLayout>
      </Route>
      <Route path={"/leads"}>
        <DashboardLayout>
          <Leads />
        </DashboardLayout>
      </Route>
      <Route path={"/email-templates"}>
        <DashboardLayout>
          <EmailTemplates />
        </DashboardLayout>
      </Route>
      <Route path={"/analytics"}>
        <DashboardLayout>
          <Analytics />
        </DashboardLayout>
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
