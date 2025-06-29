import React from 'react';
import { Header } from './Header';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  showBackButton?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, title, showBackButton }) => {
  return (
    <div className="min-h-screen bg-white">
      <Header title={title} showBackButton={showBackButton} />
      <main className="flex-1">{children}</main>
    </div>
  );
};