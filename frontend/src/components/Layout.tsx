import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  Archive,
  LogOut,
  Menu,
  LockKeyhole,
  ChevronRight,
  Building2,
  KeyRound,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { ErrorNotice } from "./shared";
export function Layout() {
  const { user, logout, can } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link
          to={can("officers.view") ? "/officers" : "/organization"}
          className="brand"
          onClick={() => setOpen(false)}
        >
          <div className="brand-symbol">
            <ShieldCheck size={27} />
          </div>
          <div>
            <strong>RECCE</strong>
            <span>PERSONNEL REGISTER</span>
          </div>
        </Link>
        <div className="sidebar-rule" />
        <p className="nav-label">PERSONNEL</p>
        {[
          "reports.view",
          "officers.view",
          "fields.import_source.view",
          "fields.assignments.view",
          "fields.service_profile.view",
        ].every((permission) => can(permission)) && (
          <Link
            to="/dashboard"
            className={`nav-item ${location.pathname === "/dashboard" ? "selected" : ""}`}
            onClick={() => setOpen(false)}
          >
            <LayoutDashboard size={19} />
            Dashboard
          </Link>
        )}
        {can("officers.view") && (
          <>
            <NavLink
              to="/officers"
              className={`nav-item ${location.pathname.startsWith("/officers") && !location.search.includes("archived") ? "selected" : ""}`}
              onClick={() => setOpen(false)}
            >
              <Users size={19} /> Officers
            </NavLink>
            <Link
              to="/officers?archive=archived"
              className={`nav-item ${location.search.includes("archived") ? "selected" : ""}`}
              onClick={() => setOpen(false)}
            >
              <Archive size={19} /> Archived records
            </Link>
          </>
        )}
        {(can("organization.view") ||
          can("establishments.view") ||
          can("fields.assignments.view") ||
          can("fields.deployment_records.view")) && (
          <Link
            to="/organization"
            className={`nav-item ${location.pathname.startsWith("/organization") ? "selected" : ""}`}
            onClick={() => setOpen(false)}
          >
            <Building2 size={19} />
            Organization
          </Link>
        )}
        <Link
          to="/account"
          className={`nav-item ${location.pathname === "/account" ? "selected" : ""}`}
          onClick={() => setOpen(false)}
        >
          <KeyRound size={19} />
          Account settings
        </Link>
        <div className="sidebar-note">
          <LockKeyhole size={18} />
          <strong>Protected personnel records</strong>
          <p>Your role determines which information you can access.</p>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{user?.name.slice(0, 1)}</div>
          <div>
            <strong>{user?.name}</strong>
            <span>Authenticated session</span>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void logout().catch(setError)}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      {open && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => setOpen(!open)}
          >
            <Menu size={20} />
          </Button>
          <div className="breadcrumb">
            Personnel <ChevronRight size={14} />
            <span>
              {location.pathname === "/dashboard"
                ? "Dashboard"
                : location.pathname === "/account"
                  ? "Account"
                  : location.pathname.startsWith("/organization")
                    ? "Organization"
                    : "Officers"}
            </span>
          </div>
          <span className="session-badge">
            <span /> Secure session
          </span>
        </header>
        <main className="main-content">
          {Boolean(error) && <ErrorNotice error={error} />}
          <Outlet />
        </main>
        <footer className="app-footer">
          RECCE Officers Personnel Management{" "}
          <span>Personnel policies require approval before activation.</span>
        </footer>
      </div>
    </div>
  );
}
