import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
const Login = React.lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login })),
);
const Officers = React.lazy(() =>
  import("./pages/Officers").then((m) => ({ default: m.Officers })),
);
const OfficerForm = React.lazy(() =>
  import("./pages/OfficerForm").then((m) => ({ default: m.OfficerForm })),
);
const Profile = React.lazy(() =>
  import("./pages/Profile").then((m) => ({ default: m.Profile })),
);
import { Layout } from "./components/Layout";
import "./styles.css";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15000 },
  },
});
function App() {
  const { user, can } = useAuth();
  if (!user) return <Login />;
  if (!can("officers.view"))
    return (
      <main className="loading-screen">
        <h1>Access not assigned</h1>
        <p>
          Your account does not have access to officer records. Contact your
          administrator.
        </p>
        <NoAccessLogout />
      </main>
    );
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/officers" element={<Officers />} />
        <Route path="/officers/new" element={<OfficerForm />} />
        <Route path="/officers/:id" element={<Profile />} />
        <Route path="/officers/:id/edit" element={<OfficerForm />} />
        <Route path="*" element={<Navigate to="/officers" replace />} />
      </Route>
    </Routes>
  );
}
function NoAccessLogout() {
  const { logout } = useAuth();
  return <button onClick={() => void logout()}>Sign out</button>;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <React.Suspense
            fallback={
              <div className="loading-screen" role="status">
                Loading…
              </div>
            }
          >
            <App />
          </React.Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
