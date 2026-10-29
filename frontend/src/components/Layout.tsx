import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ShieldCheck,
  Users,
  Archive,
  LogOut,
  Menu,
  LockKeyhole,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { ErrorNotice } from "./shared";
export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link to="/officers" className="brand" onClick={() => setOpen(false)}>
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
        <NavLink
          to="/officers"
          className={`nav-item ${location.search.includes("archived") ? "" : "selected"}`}
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
            <span>Officers</span>
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
