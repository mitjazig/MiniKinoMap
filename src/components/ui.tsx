import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { ConnectionState } from '../treadmill/types';

export function connectionLabel(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'scanning':
      return 'Searching';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return 'Reconnecting';
    case 'unsupported':
      return 'Unsupported';
    case 'error':
      return 'Error';
    default:
      return state;
  }
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet' | 'danger' | 'ghost';
};

const buttonClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-amber text-ink hover:brightness-105',
  quiet: 'bg-panel text-paper border border-line',
  danger: 'bg-transparent text-ember border border-ember',
  ghost: 'bg-transparent text-paper',
};

export function Button({ variant = 'quiet', className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-14 items-center justify-center rounded-md px-4 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40 ${buttonClass[variant]} ${className}`}
      {...props}
    />
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-5">{children}</div>;
}

export function PageTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <header>
      <h1 className="font-metric text-5xl leading-none tracking-wide text-paper">{title}</h1>
      {detail ? <p className="mt-2 max-w-prose text-sm leading-6 text-mist">{detail}</p> : null}
    </header>
  );
}

export function MenuLink({ to, title, detail }: { to: string; title: string; detail: string }) {
  return (
    <NavLink to={to} className="flex min-h-16 items-center justify-between gap-4 border-b border-line py-3">
      <span>
        <span className="block text-lg text-paper">{title}</span>
        <span className="block text-sm text-mist">{detail}</span>
      </span>
      <span aria-hidden className="text-mist">
        ›
      </span>
    </NavLink>
  );
}

export function SimulatorBadge() {
  return (
    <span className="rounded-sm border border-amber/50 px-2 py-1 text-xs font-medium tracking-wide text-amber">
      SIMULATOR
    </span>
  );
}
