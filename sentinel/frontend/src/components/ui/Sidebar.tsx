'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Radio, Film, MessageSquare, Shield } from 'lucide-react';

const NAV = [
  { href: '/',           icon: LayoutDashboard, label: 'Dashboard'  },
  { href: '/live',       icon: Radio,           label: 'Live Feed'  },
  { href: '/recordings', icon: Film,            label: 'Recordings' },
  { href: '/chat',       icon: MessageSquare,   label: 'AI Chat'    },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: 'var(--bg-sidebar)',
      display: 'flex', flexDirection: 'column',
      padding: '16px 12px',
      height: '100vh', position: 'sticky', top: 0,
      zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{ padding: '8px 10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: 'var(--green-mid)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Shield size={18} color="#fff" />
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, color: '#fff', lineHeight: 1.2 }}>VisionTrace</p>
          <p style={{ fontSize: 10, color: 'var(--text-sidebar-muted)', letterSpacing: '.04em' }}>
            AI SURVEILLANCE
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path === href;
          return (
            <Link key={href} href={href} className={`sidebar-item ${active ? 'active' : ''}`}>
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 10px 4px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ fontSize: 11, color: 'var(--text-sidebar-muted)' }}>
          Gemini 2.5 Flash · v1.0
        </p>
      </div>
    </aside>
  );
}
