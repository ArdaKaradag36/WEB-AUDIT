"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logoutAndClear } from "../lib/auth";

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  function handleLogout() {
    logoutAndClear();
    setOpen(false);
    router.replace("/login");
  }

  function handleSwitchUser() {
    logoutAndClear();
    setOpen(false);
    router.replace("/login");
  }

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="user-avatar">AU</span>
      </button>
      <span className="user-name">Admin Kullanıcı</span>
      {open && (
        <div className="user-dropdown" role="menu">
          <button type="button" className="user-dropdown-item" onClick={handleLogout}>
            Çıkış Yap
          </button>
          <button
            type="button"
            className="user-dropdown-item"
            onClick={handleSwitchUser}
          >
            Kullanıcı Değiştir
          </button>
        </div>
      )}
    </div>
  );
}

